
'use client';

import React, { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { refreshAllShipmentsAction } from '@/app/actions';

export function RefreshAllButton() {
  const [isRefreshing, startRefreshTransition] = useTransition();
  const { toast } = useToast();

  const handleRefreshAll = () => {
    const password = prompt("Please enter the password to refresh all shipments:");

    if (password === null) { // User clicked cancel
        return;
    }

    if (password !== 'Test123') {
        toast({
            variant: 'destructive',
            title: 'Incorrect Password',
            description: 'You are not authorized to perform this action.',
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
      // Trigger a page reload to show updated statuses
      window.location.reload();
    });
  };

  return (
    <Button onClick={handleRefreshAll} disabled={isRefreshing} variant="outline" size="sm">
      <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      {isRefreshing ? 'Refreshing...' : 'Refresh All'}
    </Button>
  );
}

    