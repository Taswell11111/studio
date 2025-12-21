
'use client';

import React, { useState, useEffect, useMemo, useTransition, useCallback } from 'react';
import { useAuth, useFirestore, initiateAnonymousSignIn, useCollection, useMemoFirebase } from '@/firebase';
import type { Shipment, Inbound } from '@/types';
import { collection } from 'firebase/firestore';

// Outbound flows
import { importFromCsv } from '@/ai/flows/import-from-csv';
import { clearShipmentData } from '@/ai/flows/clear-data';
// Inbound flows
import { importInboundFromCsv } from '@/ai/flows/import-inbound-from-csv';
import { clearInboundData } from '@/ai/flows/clear-inbound-data';

import { Search, Upload, AlertCircle, CloudLightning, Share2, FileSpreadsheet, X, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShipmentCard } from '@/components/shipment-card';
import { InboundCard } from '@/components/inbound-card';
import { ProcessingModal } from '@/components/processing-modal';
import { SuccessNotification } from '@/components/success-notification';
import { ImportFromStorageDialog } from '@/components/import-from-storage-dialog';
import { useToast } from '@/hooks/use-toast';
import { ImportFromGoogleSheetDialog } from './import-from-google-sheet-dialog';
import { Alert, AlertDescription } from './ui/alert';
import { RefreshAllButton } from './refresh-all-button';
import { ClearDataButton } from './clear-data-button';


export default function ShipmentDashboard() {
  const auth = useAuth();
  const firestore = useFirestore();
  const [activeTab, setActiveTab] = useState<'outbound' | 'inbound'>('outbound');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [foundShipment, setFoundShipment] = useState<Shipment | null>(null);
  const [foundInbound, setFoundInbound] = useState<Inbound | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress] = useState<number | undefined>(0);
  const [processingTitle, setProcessingTitle] = useState('Processing File');
  const [showSuccess, setShowSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [lastImportSummary, setLastImportSummary] = useState<string | null>(null);
  const [isImportFromStorageOpen, setImportFromStorageOpen] = useState(false);
  const [isImportFromSheetOpen, setImportFromSheetOpen] = useState(false);
  const [isUploading, startUploadTransition] = useTransition();

  const { toast } = useToast();
  
  const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';

  // Firestore refs
  const shipmentsColRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'artifacts', appId, 'public', 'data', 'shipments') : null),
    [firestore, appId]
  );
  const inboundsColRef = useMemoFirebase(
    () => (firestore ? collection(firestore, 'artifacts', appId, 'public', 'data', 'inbounds') : null),
    [firestore, appId]
  );
  
  // Data hooks
  const { data: allShipments, isLoading: isLoadingShipments } = useCollection<Shipment>(shipmentsColRef);
  const { data: allInbounds, isLoading: isLoadingInbounds } = useCollection<Inbound>(inboundsColRef);

  useEffect(() => {
    if (auth && !auth.currentUser && !isLoadingShipments) {
      initiateAnonymousSignIn(auth);
    }
  }, [auth, isLoadingShipments]);

  const resetSearch = () => {
    setSearchTerm('');
    setFoundShipment(null);
    setFoundInbound(null);
  }

  useEffect(() => {
    resetSearch();
  }, [activeTab]);

  useEffect(() => {
    if (!searchTerm) {
      setFoundShipment(null);
      setFoundInbound(null);
      return;
    }

    const lowercasedTerm = searchTerm.toLowerCase();
    
    if (activeTab === 'outbound' && allShipments) {
      const found = allShipments.find(item =>
        Object.values(item).some(val =>
          String(val).toLowerCase().includes(lowercasedTerm)
        )
      );
      setFoundShipment(found || null);
    } else if (activeTab === 'inbound' && allInbounds) {
      const found = allInbounds.find(item =>
        Object.values(item).some(val =>
          String(val).toLowerCase().includes(lowercasedTerm)
        )
      );
      setFoundInbound(found || null);
    }
  }, [searchTerm, allShipments, allInbounds, activeTab]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    startUploadTransition(() => {
      setIsProcessing(true);
      setProcessingTitle(`Uploading and Processing ${activeTab === 'outbound' ? 'Outbound' : 'Inbound'} CSV...`);

      const reader = new FileReader();
      reader.onload = async (e) => {
        const csvText = e.target?.result as string;
        try {
          const result = activeTab === 'outbound'
            ? await importFromCsv({ csvText })
            : await importInboundFromCsv({ csvText });

          if (result.success) {
            handleImportComplete(result.recordsImported, `CSV File (${activeTab})`);
          } else {
            throw new Error(result.message);
          }
        } catch (error: any) {
          handleImportError(error.message, `CSV File (${activeTab})`);
        } finally {
          setIsProcessing(false);
        }
      };
      reader.readAsText(file);
    });

    event.target.value = '';
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setSuccessMessage('App link copied to clipboard!');
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Copy Failed",
        description: "Could not copy link to clipboard.",
      });
    }
  };

  const handleImportInitiated = (title: string) => {
    setLastImportSummary(null);
    setIsProcessing(true);
    setProcessingTitle(title);
    resetSearch();
  };

  const handleImportComplete = (count: number, source: string) => {
    setIsProcessing(false);
    const timestamp = new Date().toLocaleString();
    const message = `${count} records were successfully imported from ${source} on ${timestamp}.`;
    setLastImportSummary(message);
    setSuccessMessage(message);
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 4000);
  };

  const handleImportError = (err: string, source: string) => {
    setIsProcessing(false);
    toast({ variant: 'destructive', title: `${source} Import Failed`, description: err });
  };
  
  const isLoading = isLoadingShipments || isLoadingInbounds;

  const getCollectionStats = () => {
    if (activeTab === 'outbound') {
      return `Tracking ${allShipments?.length || 0} Shipment Items`;
    }
    return `Tracking ${allInbounds?.length || 0} Inbound Items`;
  }
  
  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <p>Loading {activeTab} data...</p>
        </div>
      );
    }
    if (!searchTerm) {
      return (
        <Card className="text-center py-12 text-muted-foreground border-dashed">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          Enter a search term above to find a {activeTab === 'outbound' ? 'shipment' : 'inbound order'}.
        </Card>
      );
    }
    
    if (activeTab === 'outbound') {
      if (foundShipment) {
        return <ShipmentCard key={foundShipment.id} item={foundShipment} />;
      }
    } else { // inbound
      if (foundInbound) {
        return <InboundCard key={foundInbound.id} item={foundInbound} />;
      }
    }

    return (
       <Card className="text-center py-12 text-muted-foreground border-dashed">
         <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
         {`No order found for "${searchTerm}". Please try a different search term.`}
       </Card>
    );
  }

  return (
    <>
      <ProcessingModal isOpen={isProcessing || isUploading} progress={processingProgress} title={processingTitle} />
      <SuccessNotification show={showSuccess} message={successMessage} />
      
      <ImportFromStorageDialog 
        isOpen={isImportFromStorageOpen} 
        onOpenChange={setImportFromStorageOpen}
        onImportInitiated={() => handleImportInitiated('Importing from Firebase Storage...')}
        onComplete={(count) => handleImportComplete(count, 'Storage')}
        onError={(err) => handleImportError(err, 'Storage')}
      />

      <ImportFromGoogleSheetDialog
        isOpen={isImportFromSheetOpen}
        onOpenChange={setImportFromSheetOpen}
        onImportInitiated={() => handleImportInitiated('Importing from Google Sheet...')}
        onComplete={(count) => handleImportComplete(count, 'Google Sheet')}
        onError={(err) => handleImportError(err, 'Google Sheet')}
      />

      <div className="max-w-7xl mx-auto space-y-6">
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary rounded-lg shadow-md">
                <CloudLightning className="w-6 h-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground font-headline">Live Shipment Lookup</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  <p className="text-xs text-muted-foreground font-medium">
                    {isLoading ? 'Connecting...' : getCollectionStats()}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center self-center md:self-auto">
              {activeTab === 'outbound' && <RefreshAllButton />}
              <Button variant="outline" onClick={handleShare}><Share2 /><span>Share Tool</span></Button>
            </div>
          </div>
          {lastImportSummary && (
            <Alert className="mt-4 bg-green-50 border-green-200 text-green-900 relative pr-8">
              <AlertDescription className="font-medium">
                {lastImportSummary}
              </AlertDescription>
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute top-1/2 right-1 -translate-y-1/2 h-7 w-7 text-green-900 hover:bg-green-100"
                onClick={() => setLastImportSummary(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </Alert>
          )}
        </Card>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'outbound' | 'inbound')} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="outbound">Outbound Shipments</TabsTrigger>
            <TabsTrigger value="inbound">Inbound Shipments</TabsTrigger>
          </TabsList>
          <TabsContent value="outbound">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Admin: Import Outbound Data</CardTitle>
                <CardDescription>
                  Import outbound shipment data. This will overwrite all existing outbound records.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row items-center gap-4 flex-wrap">
                <Button asChild variant="outline" disabled={isUploading}>
                  <label htmlFor="csv-upload-outbound">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload CSV File
                    <input type="file" id="csv-upload-outbound" className="hidden" accept=".csv" onChange={handleFileUpload} disabled={isUploading} />
                  </label>
                </Button>
                <Button variant="secondary" onClick={() => setImportFromStorageOpen(true)} disabled={isUploading}>
                  Import from Storage
                </Button>
                <Button variant="secondary" onClick={() => setImportFromSheetOpen(true)} disabled={isUploading}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Import from Google Sheet
                </Button>
                <ClearDataButton dataType="outbound" />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="inbound">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Admin: Import Inbound Data</CardTitle>
                <CardDescription>
                  Import inbound shipment data. This will overwrite all existing inbound records.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row items-center gap-4 flex-wrap">
                <Button asChild variant="outline" disabled={isUploading}>
                  <label htmlFor="csv-upload-inbound">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload CSV File
                    <input type="file" id="csv-upload-inbound" className="hidden" accept=".csv" onChange={handleFileUpload} disabled={isUploading} />
                  </label>
                </Button>
                <ClearDataButton dataType="inbound" />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            className="w-full pl-11 pr-4 py-3 h-12 text-base border-border focus:ring-primary focus:border-primary shadow-sm"
            placeholder="Search by Order ID, Customer, Tracking No..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <div className="grid grid-cols-1 gap-4">
          {renderContent()}
        </div>

      </div>
    </>
  );
}
