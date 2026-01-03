'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import type { Shipment, Inbound } from '@/types';
import { getRecentOutboundsAction, getRecentInboundsAction } from '@/app/actions';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShipmentTable } from './shipment-table';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type QueryType = 'recentOutbounds' | 'recentInbounds';

export function GetSearchTab() {
  const [results, setResults] = useState<Shipment[] | Inbound[]>([]);
  const [isLoading, startLoading] = useTransition();
  const [queryType, setQueryType] = useState<QueryType>('recentOutbounds');
  const { toast } = useToast();

  const fetchData = (type: QueryType) => {
    startLoading(async () => {
        setResults([]);
        try {
            let data;
            if (type === 'recentOutbounds') {
                 data = await getRecentOutboundsAction();
            } else { // recentInbounds
                 data = await getRecentInboundsAction();
            }
            
            if (data.error) {
                throw new Error(data.error);
            }
            setResults(data.records || []);
            toast({ title: `${type === 'recentOutbounds' ? 'Recent Outbounds' : 'Recent Inbounds'} Loaded`, description: `${data.records?.length || 0} records fetched.` });
        } catch (e: any) {
            toast({ variant: 'destructive', title: 'Failed to fetch', description: e.message });
        }
    });
  }

  // Auto-fetch on initial load
  useEffect(() => {
    fetchData(queryType);
  }, [queryType]);

  return (
    <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>GET Search Tools</CardTitle>
             <div className="flex items-center gap-2">
                <Select value={queryType} onValueChange={(val) => setQueryType(val as QueryType)}>
                    <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="Select a query" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="recentOutbounds">Recent Outbounds</SelectItem>
                        <SelectItem value="recentInbounds">Recent Inbounds</SelectItem>
                    </SelectContent>
                </Select>
                <Button onClick={() => fetchData(queryType)} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Refresh
                </Button>
            </div>
        </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-12">Loading...</div>
        ) : ( 
          <ShipmentTable data={results} />
        )}
      </CardContent>
    </Card>
  );
}
