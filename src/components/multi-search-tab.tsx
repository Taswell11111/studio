
'use client';

import React, { useState, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { multiLookupShipmentAction } from '@/app/actions';
import { ShipmentRecord } from '@/types';
import { STORES } from '@/lib/stores';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from './status-badge';
import { AlertCircle, Search, Download, CircleDotDashed, Info, Store, X, Check } from 'lucide-react';
import { ProcessingModal } from './processing-modal';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function MultiSearchTab() {
  const [searchTerms, setSearchTerms] = useState('');
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
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
        const response = await multiLookupShipmentAction({ 
          searchTerms: terms,
          storeNames: selectedStores 
        });
        setResults(response.results);
        setNotFound(response.notFound);
        toast({
          title: 'Search Complete',
          description: `Found ${response.results.length} unique records for ${terms.length} terms.`,
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

    const headers = ['Shipment ID', 'Direction', 'Source Store', 'Customer Name', 'Order Date', 'Status', 'Courier', 'Tracking No'];
    const csvContent = [
      headers.join(','),
      ...results.map(item => [
        `"${item['Shipment ID']}"`,
        `"${item['Direction']}"`,
        `"${item['Source Store']}"`,
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
            <div className="flex flex-col sm:flex-row gap-2">
                <Popover>
                    <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="lg"
                        className="w-full sm:w-auto justify-start text-left font-normal"
                    >
                        <Store className="mr-2 h-4 w-4" />
                        {selectedStores.length > 0 ? `Selected Stores (${selectedStores.length})` : 'All Stores'}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                    <Command>
                        <CommandInput placeholder="Filter stores..." />
                        <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup>
                            {STORES.map((store) => {
                                const isSelected = selectedStores.includes(store.name);
                                return (
                                    <CommandItem
                                        key={store.name}
                                        onSelect={() => {
                                            if (isSelected) {
                                                setSelectedStores(selectedStores.filter((s) => s !== store.name));
                                            } else {
                                                setSelectedStores([...selectedStores, store.name]);
                                            }
                                        }}
                                    >
                                    <div
                                        className={cn(
                                        'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                                        isSelected
                                            ? 'bg-primary text-primary-foreground'
                                            : 'opacity-50 [&_svg]:invisible'
                                        )}
                                    >
                                        <Check className={cn('h-4 w-4')} />
                                    </div>
                                    <span>{store.name}</span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                        </CommandList>
                    </Command>
                    </PopoverContent>
                </Popover>

                {selectedStores.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                        {selectedStores.map(store => (
                            <Badge key={store} variant="secondary" className="gap-1">
                                {store}
                                <button onClick={() => setSelectedStores(selectedStores.filter(s => s !== store))}>
                                    <X className="h-3 w-3" />
                                </button>
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
            
          <Textarea
            placeholder="Enter comma or newline separated search terms..."
            className="h-32 text-base"
            value={searchTerms}
            onChange={(e) => setSearchTerms(e.target.value)}
          />
           <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Search Reference Guide</AlertTitle>
            <AlertDescription>
                You can search by Order ID, Channel ID, Customer Name, or Tracking Number.
                <br />
                e.g., `SHP-12345`, `Channel1`, `John Doe`, `PNJ54321`
            </AlertDescription>
            </Alert>

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
                            <TableHead>Store</TableHead>
                            <TableHead>Direction</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Order Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Courier</TableHead>
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
                                <TableCell>{item['Source Store']}</TableCell>
                                <TableCell>{item['Direction']}</TableCell>
                                <TableCell>{item['Customer Name']}</TableCell>
                                <TableCell>{item['Order Date'] ? new Date(item['Order Date']).toLocaleDateString() : 'N/A'}</TableCell>
                                <TableCell><StatusBadge status={item['Status'] || 'UNKNOWN'} /></TableCell>
                                <TableCell>{item['Courier']}</TableCell>
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
