'use client';

import React, { useState, useTransition, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { type MultiLookupShipmentStreamChunk, type ShipmentRecord } from '@/types';
import { STORES } from '@/lib/stores';

import { Upload, AlertCircle, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProcessingModal } from './processing-modal';
import { ShipmentTable } from './shipment-table';

export function MultiSearchTab() {
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [selectedStore, setSelectedStore] = useState('All');
  const [results, setResults] = useState<ShipmentRecord[]>([]);
  const [isSearching, startSearchTransition] = useTransition();
  const [logs, setLogs] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const terms = content.split(/\r?\n/).map(term => term.trim()).filter(Boolean);
        setSearchTerms(terms);
      };
      reader.readAsText(file);
    }
    // Reset file input to allow uploading the same file again
    event.target.value = '';
  };

  const handleSearch = () => {
    if (searchTerms.length === 0) {
        toast({ variant: 'destructive', title: 'No Terms', description: 'Please upload a file with search terms first.' });
        return;
    }
    
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    startSearchTransition(async () => {
        setResults([]);
        setLogs([]);

        try {
            const response = await fetch('/api/lookup/multi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    searchTerms: searchTerms,
                    storeName: selectedStore === 'All' ? undefined : selectedStore
                }),
                signal
            });

            if (!response.body) throw new Error("Response has no body");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                if (signal.aborted) {
                    await reader.cancel();
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                chunk.split('\n\n').forEach(line => {
                    if(line.trim()) {
                        try {
                            const parsed = JSON.parse(line) as MultiLookupShipmentStreamChunk;
                            if (parsed.log) {
                                setLogs(prev => [...prev, parsed.log as string]);
                            }
                            if (parsed.result) {
                                setResults(prev => [...prev, parsed.result as ShipmentRecord]);
                            }
                            if (parsed.error) {
                                console.warn('Stream error:', parsed.error.message);
                            }
                        } catch(e) { console.warn("Could not parse stream line: ", line); }
                    }
                });
            }
            
            if (signal.aborted) {
                toast({ title: 'Search Canceled' });
            } else {
                toast({ title: 'Multi-Search Complete' });
            }

        } catch (err: any) {
             if (err.name !== 'AbortError') {
                toast({ variant: 'destructive', title: 'Error', description: err.message });
             }
        } finally {
             abortControllerRef.current = null;
        }
    });
  };
  
  const handleAbort = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
  };

  return (
    <>
        <ProcessingModal 
            isOpen={isSearching}
            title={`Searching for ${searchTerms.length} terms...`}
            onAbort={handleAbort}
            logs={logs}
        />
        <Card className="p-4 sm:p-6 mt-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                     <div className="relative">
                        <Button asChild variant="outline" size="lg">
                           <label htmlFor="file-upload">
                                <Upload className="mr-2 h-5 w-5" />
                                Upload .txt
                            </label>
                        </Button>
                        <input id="file-upload" type="file" accept=".txt" className="hidden" onChange={handleFileChange} />
                     </div>
                     {searchTerms.length > 0 && (
                        <p className="text-sm text-muted-foreground">{searchTerms.length} terms loaded.</p>
                     )}
                </div>

                <div className="flex items-center gap-2">
                    <Select value={selectedStore} onValueChange={setSelectedStore}>
                        <SelectTrigger className="w-[180px] h-12 text-base">
                           <div className="flex items-center gap-2">
                               <Store className="w-4 h-4 text-muted-foreground" />
                               <SelectValue placeholder="Select a store" />
                           </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Stores</SelectItem>
                            {STORES.map(store => (
                                <SelectItem key={store.name} value={store.name}>{store.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button 
                        size="lg" 
                        className="h-12 px-8 text-lg"
                        onClick={handleSearch} 
                        disabled={isSearching || searchTerms.length === 0}
                    >
                        {isSearching ? 'Searching...' : 'Search All'}
                    </Button>
                </div>
            </div>
        </Card>

        <div className="mt-6">
        {results.length > 0 ? (
            <ShipmentTable data={results} />
        ) : (
            !isSearching && (
                 <Card className="text-center py-12 text-muted-foreground border-dashed bg-secondary/10">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="font-semibold">No search results to display.</p>
                    <p className="text-sm mt-1">Upload a .txt file with one search term per line to begin.</p>
                  </Card>
            )
        )}
        </div>
    </>
  );
}
