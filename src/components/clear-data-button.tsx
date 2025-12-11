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

export function ClearDataButton() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleClearData = async () => {
    setIsLoading(true);
    try {
      const result = await clearShipmentData();
      if (result.success) {
        toast({
          title: 'Data Cleared',
          description: `${result.recordsDeleted} records successfully deleted.`, 
        });
      } else {
        toast({
          title: 'Error',
          description: `Failed to clear data: ${result.message}`, 
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error clearing data:', error);
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
          {isLoading ? 'Clearing...' : 'Clear All Data'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete all shipment records 
            and remove your data from our servers.
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
