
'use client';

import React, { useState, useTransition, useRef } from 'react';
import type { Shipment, Inbound, LookupShipmentStreamChunk } from '@/types';
import { STORES } from '@/lib/stores';
import { useToast } from '@/hooks/use-toast';

import { Search, AlertCircle, Store, Filter } from 'lucide-react';
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
    error?: string;
};

export function SingleSearchTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStore, setSelectedStore] = useState('All');
  const [selectedSearchBy, setSelectedSearchBy] = useState('shipmentId');
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

    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    
    startSearchTransition(async () => {
      setSearchResult(null);
      setLogs([]);
      try {
        const response = await fetch('/api/lookup/single', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
                sourceStoreOrderId: trimmedSearch,
                searchBy: selectedSearchBy,
                storeName: selectedStore === 'All' ? undefined : selectedStore,
             }),
             signal: signal 
        });

        if (!response.body) {
          throw new Error("The response body is empty.");
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        // Force type assignment
        let finalResult: SearchResult | null = null;
        
        while(true) {
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
                        const parsed = JSON.parse(line) as LookupShipmentStreamChunk;
                        if(parsed.log) {
                            setLogs(prev => [...prev, parsed.log as string]);
                        }
                        if(parsed.result) {
                            finalResult = parsed.result as SearchResult; 
                        }
                        if(parsed.error) {
                           throw new Error(parsed.error.message);
                        }
                    } catch (e) {
                        console.warn("Could not parse stream line: ", line);
                    }
                }
            });
        }

        if (signal.aborted) {
           toast({
                variant: 'default',
                title: 'Search Aborted',
            });
            return;
        }

        if (finalResult && (finalResult as SearchResult).shipment) {
          setSearchResult(finalResult);
          toast({
            title: "Record Found",
            description: `Displaying record matching "${trimmedSearch}"`,
          });
        } else {
          setSearchResult(null);
          toast({
            variant: "destructive",
            title: "Not Found",
            description: (finalResult as unknown as SearchResult)?.error || `Could not find any record matching "${trimmedSearch}".`,
          });
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && !err.message.includes('aborted')) {
          console.error("Search error:", err);
          toast({
              variant: "destructive",
              title: "Search Error",
              description: err.message || "An unexpected error occurred while searching.",
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
                    placeholder="Enter value..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <div className="flex gap-2">
                 <Select value={selectedSearchBy} onValueChange={setSelectedSearchBy}>
                    <SelectTrigger className="w-[180px] h-14 text-base">
                        <div className="flex items-center gap-2">
                           <Filter className="w-4 h-4 text-muted-foreground" />
                           <SelectValue placeholder="Search By" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="shipmentId">Shipment ID</SelectItem>
                        <SelectItem value="orderId">Channel ID</SelectItem>
                        <SelectItem value="customerName">Customer Name</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="trackingLink">Tracking Number</SelectItem>
                        <SelectItem value="sku">Item SKU</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={selectedStore} onValueChange={setSelectedStore}>
                    <SelectTrigger className="w-[160px] h-14 text-base">
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
                    className="h-14 px-8 text-lg" 
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
            <p>Select a specific search field and store to locate a record.</p>
            
            <div className="mt-6 text-left max-w-lg mx-auto text-xs font-mono bg-card p-4 rounded border shadow-sm">
                <p className="font-semibold mb-2 text-center text-primary">Sample Record Structure (Evaluated):</p>
                <pre className="overflow-x-auto whitespace-pre-wrap">{`{
  "Shipment ID": "SHP-10000534785",
  "Source Store": "JEEP",
  "Channel ID": "J16530",
  "Customer Name": "Frans Steyn",
  "Email": "fransqa.steyn@gmail.com",
  "Status": "Courier Delivery Unsuccessful",
  "Tracking No": "PNJ63369544",
  "Tracking Link": "https://store.parcelninja.com/...",
  "Order Date": "2025-12-04T17:24:23.000Z",
  "Status Date": "2025-12-10T06:56:10.000Z",
  "Address Line 1": "73 Sapphire Street",
  "Address Line 2": "",
  "City": "Secunda",
  "Pin Code": "2302",
  "Courier": "CourierGuy",
  "items": [
    {
      "SKU": "A056-J1867857",
      "Quantity": 1,
      "Item Name": "A056-J1867857"
    }
  ]
}`}</pre>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
