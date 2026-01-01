
'use client';

import React, { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Lock, Unlock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { refreshAllShipmentsAction } from '@/app/actions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function RefreshAllButton() {
  const [isRefreshing, startRefreshTransition] = useTransition();
  const [isLocked, setIsLocked] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [password, setPassword] = useState('');
  const { toast } = useToast();

  const handleUnlockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'Test123') {
      setIsLocked(false);
      setIsDialogOpen(false);
      setPassword('');
      toast({
        title: 'Refresh Unlocked',
        description: 'You can now refresh all shipments.',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Incorrect Password',
        description: 'The refresh action remains locked.',
      });
    }
  };

  const handleRefreshAll = () => {
    if (isLocked) {
      setIsDialogOpen(true);
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
      // Re-lock the button after use and reload the page
      setIsLocked(true);
      window.location.reload();
    });
  };

  return (
    <>
      <Button
        onClick={handleRefreshAll}
        disabled={isRefreshing}
        variant={isLocked ? "secondary" : "outline"}
        size="sm"
        title={isLocked ? 'Unlock to refresh all records' : 'Refresh all records from warehouses'}
      >
        {isLocked ? (
          <Lock className="mr-2 h-4 w-4" />
        ) : isRefreshing ? (
          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Unlock className="mr-2 h-4 w-4" />
        )}
        {isRefreshing ? 'Refreshing...' : 'Refresh All'}
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Unlock Refresh Action</DialogTitle>
            <DialogDescription>
              Enter the password to enable the "Refresh All" functionality.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUnlockSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="password"className="text-right">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  className="col-span-3"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Unlock</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
