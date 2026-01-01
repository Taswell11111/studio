
'use client';

import React, { useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { multiLookupShipmentAction } from '@/app/actions';
import { ShipmentRecord } from '@/types';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from './status-badge';
import { AlertCircle, Search, Download, CircleDotDashed } from 'lucide-react';
import { ProcessingModal } from './processing-modal';

export function MultiSearchTab() {
  const [searchTerms, setSearchTerms] = useState('');
  const [results, setResults] = useState<ShipmentRecord[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const [isSearching, startSearchTransition] = useTransition();
  const { toast } = useToast();

  const handleSearch = () => {
    const terms = searchTerms
      .split(/[\n,]+/)
      .map((term) => term.trim())
      .filter(Boolean);

    if (terms.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No search terms',
        description: 'Please enter at least one search term.',
      });
      return;
    }

    startSearchTransition(async () => {
      setResults([]);
      setNotFound([]);
      try {
        const response = await multiLookupShipmentAction({ searchTerms: terms });
        setResults(response.results);
        setNotFound(response.notFound);
        toast({
          title: 'Search Complete',
          description: `Found ${response.results.length} of ${terms.length} records.`,
        });
      } catch (error: any) {
        toast({
          variant: 'destructive',
          title: 'Search Error',
          description: error.message || 'An unexpected error occurred.',
        });
      }
    });
  };
  
  const exportToCsv = () => {
    if (results.length === 0) return;

    const headers = ['Shipment ID', 'Customer Name', 'Order Date', 'Status', 'Courier', 'Tracking No'];
    const csvContent = [
      headers.join(','),
      ...results.map(item => [
        `"${item['Shipment ID']}"`,
        `"${item['Customer Name']}"`,
        `"${item['Order Date'] ? new Date(item['Order Date']).toLocaleDateString() : 'N/A'}"`,
        `"${item['Status']}"`,
        `"${item['Courier']}"`,
        `"${item['Tracking No']}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-s-8,' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `multi-search-results-${new Date().toISOString()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Exported!", description: "Results have been exported to CSV." });
  };


  return (
    <>
      <ProcessingModal isOpen={isSearching} title="Performing Multi-Search..." description="This may take a moment." />
      <Card className="p-4 sm:p-6 mt-6">
        <div className="flex flex-col gap-4">
          <Textarea
            placeholder="Enter comma or newline separated search terms..."
            className="h-32 text-base"
            value={searchTerms}
            onChange={(e) => setSearchTerms(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            {results.length > 0 && (
                <Button variant="outline" onClick={exportToCsv}>
                    <Download className="mr-2 h-4 w-4" />
                    Export to CSV
                </Button>
            )}
            <Button onClick={handleSearch} disabled={isSearching || !searchTerms.trim()}>
              <Search className="mr-2 h-4 w-4" />
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </div>
      </Card>
      
      <div className="mt-6">
      {isSearching ? (
        <div className="text-center py-12 text-muted-foreground">
            <p>Searching for records...</p>
        </div>
      ) : results.length > 0 || notFound.length > 0 ? (
        <>
            {results.length > 0 && (
                <Card>
                    <Table>
                        <TableHeader>
                        <TableRow>
                            <TableHead>Shipment ID</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Order Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Courier</TableHead>
                            <TableHead>Tracking No</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {results.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell>
                                    <a
                                        href={`https://sellerportal.dpworld.com/orders/shipments/${item['Shipment ID']}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-primary hover:underline"
                                    >
                                        {item['Shipment ID']}
                                    </a>
                                </TableCell>
                                <TableCell>{item['Customer Name']}</TableCell>
                                <TableCell>{item['Order Date'] ? new Date(item['Order Date']).toLocaleDateString() : 'N/A'}</TableCell>
                                <TableCell><StatusBadge status={item['Status'] || 'UNKNOWN'} /></TableCell>
                                <TableCell>{item['Courier']}</TableCell>
                                <TableCell>{item['Tracking No']}</TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                </Card>
            )}
             {notFound.length > 0 && (
                <Card className="mt-4 p-4 border-amber-200 bg-amber-50/30">
                    <h3 className="font-semibold flex items-center gap-2"><CircleDotDashed className="w-4 h-4 text-amber-600"/>Records Not Found</h3>
                    <p className="text-sm text-muted-foreground mt-2">The following {notFound.length} search term(s) did not return a result:</p>
                    <div className="mt-2 text-xs font-mono bg-amber-100/50 p-3 rounded-md max-h-32 overflow-y-auto">
                        {notFound.join(', ')}
                    </div>
                </Card>
            )}
        </>
      ) : (
        <Card className="text-center py-12 text-muted-foreground border-dashed bg-secondary/10">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Enter search terms to see results here.</p>
        </Card>
      )}
      </div>

    </>
  );
}
