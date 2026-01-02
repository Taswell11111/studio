
'use client';

import React, { useState, useTransition, useEffect } from 'react';
import type { Shipment, Inbound, ShipmentRecord } from '@/types';
import { initializeFirebase } from '@/firebase';
import { collection, getCountFromServer, getDocs, limit, query, orderBy } from 'firebase/firestore';
import { exportAllRecordsAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

import { CloudLightning, Database, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ProcessingModal } from '@/components/processing-modal';
import { RefreshAllButton } from './refresh-all-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SingleSearchTab } from './single-search-tab';
import { MultiSearchTab } from './multi-search-tab';
import { Button } from './ui/button';

export default function ShipmentDashboard() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTitle, setProcessingTitle] = useState('');
  const [recordsCount, setRecordsCount] = useState<number | null>(null);
  const [lastSyncDate, setLastSyncDate] = useState<string | null>(null);
  const [isExporting, startExportTransition] = useTransition();
  const { toast } = useToast();


  const handleExportAll = () => {
    startExportTransition(async () => {
      setIsProcessing(true);
      setProcessingTitle('Exporting all records...');
      try {
        const { records, error } = await exportAllRecordsAction();
        if (error) throw new Error(error);

        if (records.length === 0) {
            toast({ variant: 'destructive', title: 'Nothing to Export', description: 'There are no records in the database to export.'});
            return;
        }

        const headers = ['Shipment ID', 'Direction', 'Source Store', 'Source Store Order ID', 'Channel ID', 'Customer Name', 'Order Date', 'Status', 'Courier', 'Tracking No', 'Item Name', 'Quantity', 'SKU'];
        const csvContent = [
          headers.join(','),
          ...records.flatMap(item =>
            item.items && item.items.length > 0
              ? item.items.map(shipmentItem => [
                  `"${item['Shipment ID']}"`,
                  `"${item['Direction']}"`,
                  `"${item['Source Store']}"`,
                  `"${item['Source Store Order ID']}"`,
                  `"${item['Channel ID'] || ''}"`,
                  `"${item['Customer Name']}"`,
                  `"${item['Order Date'] ? new Date(item['Order Date']).toLocaleDateString() : 'N/A'}"`,
                  `"${item['Status']}"`,
                  `"${item['Courier']}"`,
                  `"${item['Tracking No']}"`,
                  `"${shipmentItem['Item Name']}"`,
                  shipmentItem['Quantity'],
                  `"${shipmentItem['SKU']}"`
                ].join(','))
              : [[
                  `"${item['Shipment ID']}"`,
                  `"${item['Direction']}"`,
                  `"${item['Source Store']}"`,
                   `"${item['Source Store Order ID']}"`,
                  `"${item['Channel ID'] || ''}"`,
                  `"${item['Customer Name']}"`,
                  `"${item['Order Date'] ? new Date(item['Order Date']).toLocaleDateString() : 'N/A'}"`,
                  `"${item['Status']}"`,
                  `"${item['Courier']}"`,
                  `"${item['Tracking No']}"`,
                  `""`, // Item Name
                  `""`, // Quantity
                  `""`  // SKU
                ].join(',')]
          )
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `all-shipment-records-${new Date().toISOString()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: "Export Complete!", description: `${records.length} records have been exported.` });

      } catch (error: any) {
        toast({ variant: 'destructive', title: 'Export Failed', description: error.message });
      } finally {
        setIsProcessing(false);
      }
    });
  };

  useEffect(() => {
    async function fetchStats() {
      try {
        const { firestore: db } = initializeFirebase();
        const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
        const shipmentsColRef = collection(db, `artifacts/${appId}/public/data/shipments`);
        const snapshot = await getCountFromServer(shipmentsColRef);
        setRecordsCount(snapshot.data().count);
        
        const q = query(shipmentsColRef, orderBy('Status Date', 'desc'), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const docData = querySnapshot.docs[0].data();
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

  return (
    <>
      <ProcessingModal isOpen={isProcessing || isExporting} title={processingTitle || (isExporting ? "Exporting all records..." : "")} />
      
      <div className="max-w-7xl mx-auto space-y-6">
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary rounded-lg shadow-md">
                <CloudLightning className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground font-headline">Omni-Channel Warehouse Fulfillment</h1>
                <p className="text-xs text-muted-foreground font-medium mt-1">
                  Unified dashboard for live Parcelninja shipment tracking and warehouse logistics
                </p>
              </div>
            </div>
            
             <div className="flex items-center gap-2 flex-wrap justify-center self-center md:self-auto">
                {recordsCount !== null && (
                    <div className="hidden lg:flex items-center mr-4 border-r pr-4 gap-4">
                        <div className='flex flex-col items-end text-xs text-muted-foreground'>
                            <div className="flex items-center gap-1 font-semibold text-foreground">
                                <Database className="w-3 h-3" />
                                {recordsCount.toLocaleString()} Records
                            </div>
                            {lastSyncDate && <span>Latest: {lastSyncDate}</span>}
                        </div>
                        <Button variant="outline" size="sm" onClick={handleExportAll} disabled={isExporting}>
                            <Download className="mr-2 h-4 w-4" />
                            {isExporting ? 'Exporting...' : 'Download All'}
                        </Button>
                    </div>
                )}
              
               <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/20 rounded-full border border-secondary/20" title="System Online">
                   <div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
                   <span className="text-xs font-medium text-muted-foreground">Online</span>
               </div>

              <RefreshAllButton />
            </div>
          </div>
        </Card>

        <Tabs defaultValue="single-search" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="single-search">Single Search</TabsTrigger>
                <TabsTrigger value="multi-search">Multi-Search</TabsTrigger>
            </TabsList>
            <TabsContent value="single-search">
                <SingleSearchTab />
            </TabsContent>
            <TabsContent value="multi-search">
                <MultiSearchTab />
            </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
