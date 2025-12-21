'use client';

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import { useAuth, useFirestore, initiateAnonymousSignIn, useCollection, useMemoFirebase } from '@/firebase';
import type { Shipment, Inbound } from '@/types';
import { collection } from 'firebase/firestore';

// Outbound flows
import { importFromCsv } from '@/ai/flows/import-from-csv';
// Inbound flows
import { importInboundFromCsv } from '@/ai/flows/import-inbound-from-csv';

import { Search, Upload, AlertCircle, CloudLightning, Share2, FileSpreadsheet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
  const [searchTerm, setSearchTerm] = useState('');
  
  const [foundShipments, setFoundShipments] = useState<Shipment[]>([]);
  const [foundInbounds, setFoundInbounds] = useState<Inbound[]>([]);
  
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
    setFoundShipments([]);
    setFoundInbounds([]);
  }

  useEffect(() => {
    if (!searchTerm) {
      setFoundShipments([]);
      setFoundInbounds([]);
      return;
    }

    const lowercasedTerm = searchTerm.toLowerCase();
    
    if (allShipments) {
      const found = allShipments.filter(item =>
        Object.values(item).some(val =>
          String(val).toLowerCase().includes(lowercasedTerm)
        )
      );
      setFoundShipments(found);
    }

    if (allInbounds) {
      const found = allInbounds.filter(item =>
        Object.values(item).some(val =>
          String(val).toLowerCase().includes(lowercasedTerm)
        )
      );
      setFoundInbounds(found);
    }
  }, [searchTerm, allShipments, allInbounds]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, dataType: 'outbound' | 'inbound') => {
    const file = event.target.files?.[0];
    if (!file) return;

    startUploadTransition(() => {
      setIsProcessing(true);
      setProcessingTitle(`Uploading and Processing ${dataType === 'outbound' ? 'Outbound' : 'Inbound'} CSV...`);

      const reader = new FileReader();
      reader.onload = async (e) => {
        const csvText = e.target?.result as string;
        try {
          const result = dataType === 'outbound'
            ? await importFromCsv({ csvText })
            : await importInboundFromCsv({ csvText });

          if (result.success) {
            handleImportComplete(result.recordsImported, `CSV File (${dataType})`);
          } else {
            throw new Error(result.message);
          }
        } catch (error: any) {
          handleImportError(error.message, `CSV File (${dataType})`);
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
  const totalItems = (allShipments?.length || 0) + (allInbounds?.length || 0);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="text-center py-12 text-muted-foreground">
          <p>Loading data...</p>
        </div>
      );
    }
    if (!searchTerm) {
      return (
        <Card className="text-center py-12 text-muted-foreground border-dashed">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          Enter a search term above to find a shipment or inbound order.
        </Card>
      );
    }
    
    const hasResults = foundShipments.length > 0 || foundInbounds.length > 0;

    if (hasResults) {
      return (
        <>
          {foundShipments.map(shipment => <ShipmentCard key={shipment.id} item={shipment} />)}
          {foundInbounds.map(inbound => <InboundCard key={inbound.id} item={inbound} />)}
        </>
      );
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
                    {isLoading ? 'Connecting...' : `Tracking ${totalItems} Shipment Items`}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center self-center md:self-auto">
              <RefreshAllButton />
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <input type="file" id="csv-upload-outbound" className="hidden" accept=".csv" onChange={(e) => handleFileUpload(e, 'outbound')} disabled={isUploading} />
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
                  <input type="file" id="csv-upload-inbound" className="hidden" accept=".csv" onChange={(e) => handleFileUpload(e, 'inbound')} disabled={isUploading} />
                </label>
              </Button>
              <ClearDataButton dataType="inbound" />
            </CardContent>
          </Card>
        </div>
        
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
