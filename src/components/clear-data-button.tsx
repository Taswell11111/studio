
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { clearShipmentData } from '@/ai/flows/clear-data';
import { clearInboundData } from '@/ai/flows/clear-inbound-data';

interface ClearDataButtonProps {
  dataType: 'inbound' | 'outbound';
}

export function ClearDataButton({ dataType }: ClearDataButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleClearData = async () => {
    setIsLoading(true);
    try {
      const result = dataType === 'outbound'
        ? await clearShipmentData()
        : await clearInboundData();

      if (result.success) {
        toast({
          title: 'Data Cleared',
          description: `${result.recordsDeleted} ${dataType} records successfully deleted.`, 
        });
      } else {
        toast({
          title: 'Error',
          description: `Failed to clear ${dataType} data: ${result.message}`, 
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error(`Error clearing ${dataType} data:`, error);
      toast({
        title: 'Error',
        description: `An unexpected error occurred: ${error.message || 'Please try again.'}`, 
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" disabled={isLoading}>
          {isLoading ? `Clearing ${dataType}...` : `Clear All ${dataType.charAt(0).toUpperCase() + dataType.slice(1)} Data`}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete all {dataType} records 
            and remove the data from our servers.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleClearData} disabled={isLoading}>
            {isLoading ? 'Deleting...' : 'Delete All Data'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
