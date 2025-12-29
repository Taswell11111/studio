'use client';

import React, { useState, useTransition, useEffect } from 'react';
import type { Shipment, Inbound } from '@/types';
import { lookupShipment } from '@/ai/flows/lookup-shipment';
import { testConnectionsAction } from '@/app/actions';
import { initializeFirebase } from '@/firebase';
import { collection, getCountFromServer, getDocs, limit, query, orderBy } from 'firebase/firestore';

import { Search, CloudLightning, Share2, AlertCircle, Wifi, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ShipmentCard } from '@/components/shipment-card';
import { ProcessingModal } from '@/components/processing-modal';
import { useToast } from '@/hooks/use-toast';
import { RefreshAllButton } from './refresh-all-button';
import { InboundCard } from './inbound-card';
import { uploadCsv, clearAllShipments, clearAllInbounds } from '@/app/client-actions';
import { LogViewer } from './log-viewer';

export default function ShipmentDashboard() {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResult, setSearchResult] = useState<Shipment | Inbound | null>(null);
  const [isSearching, startSearchTransition] = useTransition();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTitle, setProcessingTitle] = useState('');
  const [isTesting, startTestTransition] = useTransition();
  const [logs, setLogs] = useState<string[]>([]);
  const [lastSearchedTerm, setLastSearchedTerm] = useState('');
  const [recordsCount, setRecordsCount] = useState<number | null>(null);
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);


  const { toast } = useToast();

  useEffect(() => {
    async function fetchStats() {
      try {
        const { firestore: db } = initializeFirebase();
        const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
        const shipmentsColRef = collection(db, `artifacts/${appId}/public/data/shipments`);
        const snapshot = await getCountFromServer(shipmentsColRef);
        setRecordsCount(snapshot.data().count);
        
        // To get the last sync date, we might query the latest record's Order Date or Status Date.
        // Assuming recently synced records have recent dates.
        // Alternatively, if we stored metadata about the sync, we'd fetch that.
        // For now, let's fetch the most recently created/updated record if possible,
        // but 'updatedAt' isn't on the schema. 'Status Date' or 'Order Date' might be proxies.
        // Let's try to get one record ordered by 'Status Date' desc.
        const q = query(shipmentsColRef, orderBy('Status Date', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const docData = querySnapshot.docs[0].data();
            // This date reflects the latest data point in the system.
            // It might not exactly be "when the sync ran", but "latest data available".
            // If you need exact sync time, we'd need to store it in a separate doc during sync.
            // For now, "Last data from: ..." might be accurate enough or simply "Latest Record: ..."
            // But the user asked for "date/time of that" (the records present).
            // Let's use the current time if we assume the page load refreshes the count.
            // Or better, let's just show the count for now, and maybe the latest status date found.
            if(docData['Status Date']) {
                 setLastSyncDate(new Date(docData['Status Date']).toLocaleString());
            }
        }
      } catch (err) {
        console.error("Failed to fetch record stats", err);
      }
    }
    fetchStats();
  }, []);

  const handleSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedSearch = searchTerm.trim();
    if (!trimmedSearch) return;
    
    setLastSearchedTerm(trimmedSearch);

    startSearchTransition(async () => {
      setSearchResult(null); // Clear previous result
      try {
        // The input to lookupShipment is now a generic search term,
        // but the schema expects `sourceStoreOrderId`. We adapt here.
        const result = await lookupShipment({ sourceStoreOrderId: trimmedSearch });
        
        if (result.shipment) {
          setSearchResult(result.shipment);
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
        console.error("Search error:", err);
        toast({
          variant: "destructive",
          title: "Search Error",
          description: "An unexpected error occurred while searching.",
        });
      }
    });
  };

  const handleTestConnections = () => {
    startTestTransition(async () => {
      setLogs([]); // Clear previous logs
      toast({ title: 'Testing Connections...', description: 'Pinging all configured warehouse APIs.' });
      const { results, error, logs: newLogs } = await testConnectionsAction();
      
      setLogs(newLogs || ['No logs were returned.']);

      if (error) {
        toast({ variant: 'destructive', title: 'Test Failed', description: error });
        return;
      }
      
      let successCount = 0;
      results.forEach(result => {
        if (result.success) {
          successCount++;
        }
      });

      if(successCount === results.length) {
         toast({ title: 'All Connections Successful', description: 'All warehouse APIs are responding correctly.' });
      } else {
        toast({
            variant: 'destructive',
            title: 'Some Connections Failed',
            description: `${results.length - successCount} of ${results.length} connections failed. See logs for details.`,
        });
      }

    });
  }

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
  
  const DisplayCard = () => {
      if (!searchResult) return null;
      if (searchResult.Direction === 'Inbound') {
          return <InboundCard item={searchResult as Inbound} />;
      }
      return <ShipmentCard item={searchResult as Shipment} />;
  }

  return (
    <>
      <ProcessingModal isOpen={isSearching || isProcessing} title={isSearching ? "Searching Warehouses..." : processingTitle} />
      
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
                {recordsCount !== null && (
                    <div className="hidden lg:flex flex-col items-end mr-4 text-xs text-muted-foreground border-r pr-4">
                        <div className="flex items-center gap-1 font-semibold text-foreground">
                            <Database className="w-3 h-3" />
                            {recordsCount.toLocaleString()} Records
                        </div>
                        {lastSyncDate && <span>Latest: {lastSyncDate}</span>}
                    </div>
                )}
              <Button onClick={handleTestConnections} disabled={isTesting} variant="outline" size="sm">
                  <Wifi className={`mr-2 h-4 w-4 ${isTesting ? 'animate-pulse' : ''}`} />
                  {isTesting ? 'Testing...' : 'Test Connections'}
              </Button>
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
            placeholder="Search by Order ID, Customer Name, Item..."
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
            <DisplayCard />
          ) : (
             isSearching ? (
                <div className="text-center py-12 text-muted-foreground">
                    <p>Searching for "{lastSearchedTerm}"...</p>
                </div>
             ) : lastSearchedTerm && (
                <div className="text-center py-12 text-muted-foreground">
                    <p>No results to display for "{lastSearchedTerm}".</p>
                </div>
             )
          )}
          
          {!searchResult && !lastSearchedTerm && !isSearching && (
            <Card className="text-center py-12 text-muted-foreground border-dashed bg-secondary/10">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Enter an Order ID, Customer Name, or Item Name to check its status.</p>
            </Card>
          )}
        </div>

        {logs.length > 0 && <LogViewer logs={logs} title="Connection Test Logs" />}

      </div>
    </>
  );
}
