
'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { exportAllRecordsAction, testConnectionsAction } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';

import { CloudLightning, Database, Download, Settings } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ProcessingModal } from '@/components/processing-modal';
import { RefreshAllButton } from './refresh-all-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SingleSearchTab } from './single-search-tab';
import { MultiSearchTab } from './multi-search-tab';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { LogViewer } from './log-viewer';

export default function ShipmentDashboard() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingTitle, setProcessingTitle] = useState('');
  const [isExporting, startExportTransition] = useTransition();
  const { toast } = useToast();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTestingConnection, startTestConnectionTransition] = useTransition();
  const [testConnectionLogs, setTestConnectionLogs] = useState<string[]>([]);
  const [isAppLoading, setIsAppLoading] = useState(true);

  useEffect(() => {
    // Simulate app loading without fetching data
    const timer = setTimeout(() => {
      setIsAppLoading(false);
    }, 500); 
    return () => clearTimeout(timer);
  }, []);

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

  const handleTestConnections = () => {
    startTestConnectionTransition(async () => {
      setTestConnectionLogs([]);
      setIsSettingsOpen(true);
      try {
        const response = await testConnectionsAction();
        const reader = response.body?.getReader();
        if (!reader) throw new Error("Could not get stream reader.");
        const decoder = new TextDecoder();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          // Handle streaming JSON objects, which may be split across chunks
          chunk.split('\n\n').forEach(line => {
              if (line.trim()) {
                  try {
                      const parsed = JSON.parse(line);
                      if (parsed.log) {
                          setTestConnectionLogs(prev => [...prev, parsed.log]);
                      }
                      if (parsed.result) {
                          const { storeName, success, error } = parsed.result;
                          const logMsg = success 
                              ? `✅ ${storeName}: SUCCESS` 
                              : `❌ ${storeName}: FAILED - ${error || 'Unknown error'}`;
                          setTestConnectionLogs(prev => [...prev, logMsg]);
                      }
                  } catch (e) {
                      console.warn("Could not parse log line:", line);
                  }
              }
          });
        }
      } catch (error: any) {
         setTestConnectionLogs(prev => [...prev, `Error: ${error.message}`]);
      }
    });
  }

  return (
    <>
      <ProcessingModal isOpen={isProcessing || isExporting} title={processingTitle || (isExporting ? "Exporting all records..." : "")} />
      
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent className="max-w-4xl h-4/5 flex flex-col">
              <DialogHeader>
                  <DialogTitle>System Settings & Diagnostics</DialogTitle>
                  <DialogDescription>
                      Here you can perform system diagnostics and other administrative tasks.
                  </DialogDescription>
              </DialogHeader>
              <div className="flex-grow overflow-y-auto">
                 <LogViewer logs={testConnectionLogs} title="Connection Test Logs" />
              </div>
          </DialogContent>
      </Dialog>
      
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
                <div className="hidden lg:flex items-center mr-4 border-r pr-4 gap-4">
                    <Button variant="outline" size="sm" onClick={handleExportAll} disabled={isExporting}>
                        <Download className="mr-2 h-4 w-4" />
                        {isExporting ? 'Exporting...' : 'Download All'}
                    </Button>
                </div>
              
               <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/20 rounded-full border border-secondary/20" title="System Status">
                   {isAppLoading ? (
                       <>
                          <div className="w-2.5 h-2.5 bg-gray-400 rounded-full"></div>
                          <span className="text-xs font-medium text-muted-foreground">Loading...</span>
                       </>
                   ) : (
                       <>
                          <div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse"></div>
                          <span className="text-xs font-medium text-muted-foreground">Online</span>
                       </>
                   )}
               </div>

              <RefreshAllButton />
              <Button size="sm" variant="ghost" onClick={handleTestConnections} disabled={isTestingConnection}>
                  <Settings className={`w-4 h-4 ${isTestingConnection ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </Card>

        <Tabs defaultValue="single-search" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-12">
                <TabsTrigger value="single-search" className="text-base">Single-Search</TabsTrigger>
                <TabsTrigger value="multi-search" className="text-base">Multi-Search</TabsTrigger>
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
