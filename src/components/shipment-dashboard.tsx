'use client';

import React, { useState, useTransition } from 'react';
import type { Shipment, Inbound } from '@/types';
import { lookupShipment } from '@/ai/flows/lookup-shipment';

import { Search, CloudLightning, Share2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ShipmentCard } from '@/components/shipment-card';
import { ProcessingModal } from '@/components/processing-modal';
import { useToast } from '@/hooks/use-toast';
import { RefreshAllButton } from './refresh-all-button';

export default function ShipmentDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<Shipment | null>(null);
  const [isSearching, startSearchTransition] = useTransition();
  const { toast } = useToast();

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!searchTerm.trim()) return;

    startSearchTransition(async () => {
      setSearchResult(null); // Clear previous result
      try {
        const result = await lookupShipment({ sourceStoreOrderId: searchTerm.trim() });
        
        if (result.shipment) {
          setSearchResult(result.shipment);
          toast({
            title: "Order Found",
            description: `Found order ${result.shipment['Source Store Order ID']}`,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Not Found",
            description: result.error || "Could not find any shipment with that Order ID.",
          });
        }
      } catch (err: any) {
        console.error("Search error:", err);
        toast({
          variant: "destructive",
          title: "Search Error",
          description: "An unexpected error occurred while searching.",
        });
      }
    });
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Link Copied",
        description: "App link copied to clipboard!",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Could not copy link to clipboard.",
      });
    }
  };

  return (
    <>
      <ProcessingModal isOpen={isSearching} title="Searching Warehouse..." />
      
      <div className="max-w-7xl mx-auto space-y-6">
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary rounded-lg shadow-md">
                <CloudLightning className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground font-headline">Live Shipment Lookup</h1>
                <p className="text-xs text-muted-foreground font-medium mt-1">
                  Directly query Parcelninja for order status
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center self-center md:self-auto">
              <RefreshAllButton />
              <Button variant="outline" onClick={handleShare}><Share2 className="mr-2 h-4 w-4"/><span>Share Tool</span></Button>
            </div>
          </div>
        </Card>

        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            className="w-full pl-11 pr-32 py-3 h-14 text-lg border-border focus:ring-primary focus:border-primary shadow-sm"
            placeholder="Enter Order ID (e.g. PO-12345)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <Button 
            type="submit" 
            className="absolute right-2 top-2 h-10" 
            disabled={isSearching || !searchTerm.trim()}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
        </form>
        
        <div className="grid grid-cols-1 gap-4">
          {searchResult ? (
            <ShipmentCard item={searchResult} />
          ) : (
             !isSearching && searchTerm && (
                <div className="text-center py-12 text-muted-foreground">
                    <p>No results to display.</p>
                </div>
             )
          )}
          
          {!searchResult && !searchTerm && (
            <Card className="text-center py-12 text-muted-foreground border-dashed bg-secondary/10">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Enter a Source Store Order ID above to check its status.</p>
            </Card>
          )}
        </div>

      </div>
    </>
  );
}
