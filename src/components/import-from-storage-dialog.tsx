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
import { Loader2 } from 'lucide-react';

interface ImportFromStorageDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onImportInitiated: () => void;
  onComplete: (count: number) => void;
  onError: (error: string) => void;
}

export function ImportFromStorageDialog({
  isOpen,
  onOpenChange,
  onImportInitiated,
  onComplete,
  onError,
}: ImportFromStorageDialogProps) {
  const { toast } = useToast();
  const [filePath, setFilePath] = useState('Merged_shipments_new.csv');
  const [isProcessing, startTransition] = useTransition();

  const handleImport = async () => {
    if (!filePath.trim()) {
      toast({ variant: 'destructive', title: 'File path is required' });
      return;
    }

    startTransition(async () => {
        onImportInitiated();
        console.log(`Starting import from storage path: ${filePath}`);
        try {
            const result = await importFromStorage({ filePath });
            if (result.success) {
                console.log(`Import from storage complete. ${result.recordsImported} records imported.`);
                onComplete(result.recordsImported);
            } else {
                throw new Error(result.message);
            }
        } catch (error: any) {
            console.error('Import from storage failed:', error.message);
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
          <DialogTitle>Import from Firebase Storage</DialogTitle>
          <DialogDescription>
            Enter the path to the CSV file in your default storage bucket.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="filepath" className="text-right">
              File Path
            </Label>
            <Input
              id="filepath"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="col-span-3"
              placeholder="e.g., Merged_shipments_new.csv"
              disabled={isProcessing}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={isProcessing || !filePath.trim()}>
            {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isProcessing ? 'Importing...' : 'Start Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
