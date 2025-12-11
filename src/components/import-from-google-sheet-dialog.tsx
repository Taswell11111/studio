'use client';

import React, { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { importFromStorage } from '@/ai/flows/import-from-storage';
import { Loader2, AlertTriangle } from 'lucide-react';

interface ImportFromGoogleSheetDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImportInitiated: () => void;
  onComplete: (count: number) => void;
  onError: (error: string) => void;
}

export function ImportFromGoogleSheetDialog({
  isOpen,
  onOpenChange,
  onImportInitiated,
  onComplete,
  onError,
}: ImportFromGoogleSheetDialogProps) {
  const { toast } = useToast();
  const [sheetUrl, setSheetUrl] = useState('https://docs.google.com/spreadsheets/d/1DnLMJOCdgvF9ONYe5k02O9aQTumn89M5m8-Srv8NJOA/edit?usp=sharing');
  const [isProcessing, startTransition] = useTransition();

  const getCsvExportUrl = (url: string): string | null => {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      const sheetId = match[1];
      return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    }
    return null;
  };

  const handleImport = async () => {
    if (!sheetUrl.trim()) {
      toast({ variant: 'destructive', title: 'Google Sheet URL is required' });
      return;
    }

    const downloadUrl = getCsvExportUrl(sheetUrl);

    if (!downloadUrl) {
      onError('Invalid Google Sheet URL. Please provide a valid link.');
      return;
    }

    startTransition(async () => {
      onImportInitiated();
      console.log(`Starting import from Google Sheet URL: ${sheetUrl}`);
      try {
        const result = await importFromStorage({ filePath: downloadUrl });
        if (result.success) {
          console.log(`Import from Google Sheet complete. ${result.recordsImported} records imported.`);
          onComplete(result.recordsImported);
        } else {
          throw new Error(result.message);
        }
      } catch (error: any) {
        console.error('Import from Google Sheet failed:', error.message);
        onError(error.message || 'An unexpected error occurred during import.');
      } finally {
        onOpenChange(false);
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent onInteractOutside={(e) => isProcessing && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Import from Google Sheet</DialogTitle>
          <DialogDescription>
            Paste the shareable link to your Google Sheet to import the data.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="sheet-url" className="text-right">
              Sheet URL
            </Label>
            <Input
              id="sheet-url"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              className="col-span-3"
              placeholder="https://docs.google.com/spreadsheets/..."
              disabled={isProcessing}
            />
          </div>
          <div className="flex items-start gap-2 text-sm p-2 rounded-md bg-blue-50 border border-blue-200 text-blue-800">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p>Please ensure your Google Sheet is publicly accessible (&quot;Anyone with the link can view&quot;).</p>
            </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={isProcessing}>
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isProcessing ? 'Importing...' : 'Start Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
