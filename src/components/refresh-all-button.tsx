
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
    startRefreshTransition(async () => {
      toast({
        title: 'Refreshing All Shipments',
        description: 'This may take a moment...',
      });

      const result = await refreshAllShipmentsAction();

      if (result.success) {
        toast({
          title: 'Refresh Complete',
          description: `${result.successCount} shipments updated successfully, ${result.failCount} failed.`,
        });
        window.location.reload();
      } else {
        toast({
          variant: 'destructive',
          title: 'Refresh Failed',
          description: result.error,
        });
      }
    });
  };

  return (
    <Button onClick={handleRefreshAll} disabled={isRefreshing} variant="outline" size="sm">
      <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      {isRefreshing ? 'Refreshing...' : 'Refresh All'}
    </Button>
  );
}
