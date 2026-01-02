
'use client';

import React, { useState, useTransition, useRef } from 'react';
import type { Shipment, Inbound } from '@/types';
import { lookupShipment } from '@/ai/flows/lookup-shipment';
import { STORES } from '@/lib/stores';
import { useToast } from '@/hooks/use-toast';

import { Search, AlertCircle, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ShipmentCard } from '@/components/shipment-card';
import { InboundCard } from './inbound-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProcessingModal } from './processing-modal';

type SearchResult = {
    shipment: Shipment | Inbound | null;
    relatedInbound?: Inbound | null;
};

export function SingleSearchTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState('All');
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [isSearching, startSearchTransition] = useTransition();
  const [lastSearchedTerm, setLastSearchedTerm] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const { toast } = useToast();

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedSearch = searchTerm.trim();
    if (!trimmedSearch) return;
    
    setLastSearchedTerm(trimmedSearch);

    // If there's an ongoing search, abort it first
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    startSearchTransition(async () => {
      setSearchResult(null); // Clear previous result
      setLogs([]); // Clear logs
      try {
        const result = await lookupShipment({ 
            sourceStoreOrderId: trimmedSearch,
            storeName: selectedStore === 'All' ? undefined : selectedStore,
        });
        
        if (abortControllerRef.current?.signal.aborted) {
            console.log("Search was aborted by the user.");
            return;
        }

        if (result.shipment) {
          setSearchResult({ shipment: result.shipment, relatedInbound: result.relatedInbound });
          toast({
            title: "Record Found",
            description: `Displaying record matching "${trimmedSearch}"`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Not Found",
            description: result.error || `Could not find any record matching "${trimmedSearch}".`,
          });
        }
      } catch (err: any) {
        if (err.name === 'AbortError') {
            toast({
                variant: 'default',
                title: 'Search Aborted',
                description: 'The search operation was cancelled.',
            });
        } else {
            console.error("Search error:", err);
            toast({
                variant: "destructive",
                title: "Search Error",
                description: "An unexpected error occurred while searching.",
            });
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

  const DisplayCard = () => {
      if (!searchResult || !searchResult.shipment) return null;
      
      const primaryRecord = searchResult.shipment;
      const relatedRecord = searchResult.relatedInbound;

      return (
        <div>
            {primaryRecord.Direction === 'Inbound' ? (
                <InboundCard item={primaryRecord as Inbound} />
            ) : (
                <ShipmentCard item={primaryRecord as Shipment} relatedInbound={relatedRecord} />
            )}

            {relatedRecord && (
                <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-2 text-center text-muted-foreground">Related Inbound Return</h3>
                    <InboundCard item={relatedRecord} isRelated={true} />
                </div>
            )}
        </div>
      );
  }

  return (
    <>
      <ProcessingModal 
        isOpen={isSearching} 
        title="Searching Warehouses..."
        onAbort={handleAbort}
        logs={logs}
      />
      <Card className="p-4 sm:p-6 mt-6">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-grow">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    type="text"
                    className="w-full pl-11 pr-4 py-3 h-14 text-lg border-border focus:ring-primary focus:border-primary shadow-sm"
                    placeholder="Search by Order ID, Customer Name, Item..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex gap-2">
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                    <SelectTrigger className="w-full sm:w-[180px] h-14 text-base">
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
                    type="submit" 
                    className="h-14" 
                    disabled={isSearching || !searchTerm.trim()}
                >
                    {isSearching ? 'Searching...' : 'Search'}
                </Button>
            </div>
        </form>
      </Card>
        
      <div className="mt-6 grid grid-cols-1 gap-4">
        {searchResult ? (
          <DisplayCard />
        ) : (
            isSearching ? (
            <div className="text-center py-12 text-muted-foreground">
                <p>Searching for "{lastSearchedTerm}"...</p>
            </div>
            ) : lastSearchedTerm ? (
            <div className="text-center py-12 text-muted-foreground">
                <p>No results to display for "{lastSearchedTerm}".</p>
            </div>
            ) : null
        )}
        
        {!searchResult && !lastSearchedTerm && !isSearching && (
          <Card className="text-center py-12 text-muted-foreground border-dashed bg-secondary/10">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>Enter an Order ID, Customer Name, or Item Name to check its status.</p>
          </Card>
        )}
      </div>
    </>
  );
}
