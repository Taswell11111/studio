
'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { refreshAllShipmentsAction } from '@/app/actions';

export function RefreshAllButton() {
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isLocked, setIsLocked] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Use a key combination to trigger the password prompt, e.g., Ctrl+Shift+P
      if (event.ctrlKey && event.shiftKey && event.key === 'P') {
        event.preventDefault();
        const password = prompt("Enter password to unlock refresh action:");
        if (password === 'Test123') {
          setIsLocked(false);
          toast({
            title: 'Refresh Unlocked',
            description: 'You can now refresh all shipments.',
          });
        } else if (password !== null) { // Avoid toast if user cancels prompt
          toast({
            variant: 'destructive',
            title: 'Incorrect Password',
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [toast]);

  const handleRefreshAll = () => {
    if (isLocked) {
      toast({
        variant: 'destructive',
        title: 'Action Locked',
        description: 'Press Ctrl+Shift+P and enter the password to unlock.',
      });
      return;
    }

    startRefreshTransition(async () => {
      toast({
        title: 'Refreshing All Shipments',
        description: 'This may take a moment...',
      });

      const result = await refreshAllShipmentsAction();

      if (result.success) {
        toast({
          title: 'Refresh Complete',
          description: `${result.successCount} shipments updated successfully.`,
        });
      } else {
         toast({
          variant: 'destructive',
          title: 'Refresh Partially Failed',
          description: `${result.successCount} succeeded, ${result.failCount} failed. ${result.error || ''}`,
        });
      }
      // Trigger a page reload to show updated statuses and re-lock the button
      window.location.reload();
    });
  };

  return (
    <Button 
      onClick={handleRefreshAll} 
      disabled={isRefreshing || isLocked} 
      variant="outline" 
      size="sm"
      title={isLocked ? 'Press Ctrl+Shift+P to unlock' : 'Refresh all records from warehouses'}
      className="disabled:cursor-not-allowed"
    >
      {isLocked ? (
        <Lock className="mr-2 h-4 w-4" />
      ) : (
        <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      )}
      {isRefreshing ? 'Refreshing...' : 'Refresh All'}
    </Button>
  );
}
