
'use client';

import React, { useState } from 'react';
import { STORES } from '@/lib/stores';
import { useToast } from '@/hooks/use-toast';
import { type Shipment } from '@/types';

import { Store, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from './status-badge';

export function GetSearchTab() {
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [records, setRecords] = useState<Shipment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleGetRecent = async () => {
    if (!selectedStore) {
        toast({ variant: 'destructive', title: 'Select a Store', description: 'Please select a store first.' });
        return;
    }

    setIsLoading(true);
    setRecords([]);
    
    try {
        const res = await fetch('/api/outbounds/recent', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ storeName: selectedStore })
        });
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);
        
        setRecords(data.records || []);
        toast({ title: "Success", description: `Retrieved ${data.records?.length || 0} recent records.` });

    } catch (e: any) {
        toast({ variant: 'destructive', title: "Error", description: e.message });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 mt-6">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex-grow w-full sm:w-auto">
                <Select value={selectedStore} onValueChange={setSelectedStore}>
                    <SelectTrigger className="h-12 text-base">
                        <div className="flex items-center gap-2">
                           <Store className="w-4 h-4 text-muted-foreground" />
                           <SelectValue placeholder="Select a store" />
                        </div>
                    </SelectTrigger>
                    <SelectContent>
                        {STORES.map(store => (
                            <SelectItem key={store.name} value={store.name}>{store.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <Button 
                onClick={handleGetRecent} 
                className="h-12 px-8 w-full sm:w-auto"
                disabled={isLoading || !selectedStore}
            >
                {isLoading ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}
                {isLoading ? 'Fetching...' : 'Recent Outbounds'}
            </Button>
        </div>
      </Card>

      {records.length > 0 ? (
        <Card>
            <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Shipment ID</TableHead>
                        <TableHead>Channel ID</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Courier</TableHead>
                        <TableHead>Tracking</TableHead>
                        <TableHead>Items</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {records.map(r => (
                        <TableRow key={r.id}>
                            <TableCell className="font-medium">{r['Shipment ID']}</TableCell>
                            <TableCell>{r['Channel ID']}</TableCell>
                            <TableCell>{r['Customer Name']}</TableCell>
                            <TableCell className="whitespace-nowrap">{r['Order Date'] ? new Date(r['Order Date']).toLocaleDateString() : ''}</TableCell>
                            <TableCell><StatusBadge status={r['Status'] || ''} /></TableCell>
                            <TableCell>{r['Courier']}</TableCell>
                            <TableCell className="text-xs font-mono">{r['Tracking No']}</TableCell>
                            <TableCell>
                                <div className="text-xs max-h-20 overflow-y-auto">
                                    {r.items?.map((i, idx) => (
                                        <div key={idx} className="mb-1">
                                            {i['Quantity']}x {i['Item Name']} <span className="text-muted-foreground">({i['SKU']})</span>
                                        </div>
                                    ))}
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            </div>
        </Card>
      ) : (
        !isLoading && (
            <Card className="text-center py-12 text-muted-foreground border-dashed bg-secondary/10">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>Select a store and click 'Recent Outbounds' to see data.</p>
            </Card>
        )
      )}
    </div>
  );
}
