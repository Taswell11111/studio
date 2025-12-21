'use client';

import React from 'react';
import type { Inbound, ShipmentItem } from '@/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Package, Calendar, User, FileText, Package2, Hash, Truck, MapPin, Building, ShoppingBag, Info, Activity, Link as LinkIcon, RefreshCw } from 'lucide-react';
import { StatusBadge } from './status-badge';
import { Button } from './ui/button';

type InboundCardProps = {
  item: Inbound;
};

const DetailItem = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: React.ReactNode }) => (
    <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 text-muted-foreground mt-0.5" />
        <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
            <div className="text-foreground font-medium break-words">{value || 'N/A'}</div>
        </div>
    </div>
);


export function InboundCard({ item }: InboundCardProps) {

  const addressFields = ['Address Line 1', 'Address Line 2', 'City', 'State', 'Pin Code', 'Country'];
  
  const excludedKeys = [
    'id',
    'items',
    'Direction',
    'Shipment ID',
    'Order ID',
    'Source Store Order ID',
    'Customer Name',
    'Order Date',
    'Courier',
    'Tracking No',
    'Status',
    'Status Date',
    ...addressFields,
  ];

  const otherDetails = Object.keys(item).filter(
    (key) => !excludedKeys.includes(key) && item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== ''
  );
  
  const addressDetails = addressFields.map(field => ({field, value: item[field]})).filter(d => d.value);


  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300 animate-in fade-in slide-in-from-bottom-2 border-amber-200">
      <CardHeader className="bg-amber-50/50 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
                <p className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Inbound Return</p>
                <h2 className="font-mono font-bold text-2xl text-amber-900 mt-1">{item['Shipment ID']}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <Building className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source Order ID:</p>
                  <p className="font-mono text-sm">{item['Source Store Order ID'] || 'N/A'}</p>
                </div>
            </div>
            <div className="flex flex-col items-end gap-2">
                <StatusBadge status={item['Status'] || 'UNKNOWN'} />
                {item['Status Date'] && (
                    <div className="text-xs text-muted-foreground text-right">
                        as of {new Date(item['Status Date']).toLocaleDateString()}
                    </div>
                )}
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
        {/* Core Details */}
        <DetailItem icon={User} label="Customer" value={item['Customer Name']} />
        <DetailItem icon={Calendar} label="Order Date" value={item['Order Date'] ? new Date(item['Order Date']).toLocaleDateString() : 'N/A'} />
        <DetailItem icon={Truck} label="Courier" value={item['Courier'] || 'TBD'} />
        <DetailItem icon={Activity} label="Tracking No" value={<p className="font-mono">{item['Tracking No'] || 'Pending'}</p>} />
        
        {/* Item Details */}
        {item.items && item.items.length > 0 && (
          <div className="md:col-span-2 lg:col-span-3 pt-6 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Items in Return ({item.items.length})
            </h3>
            <div className="space-y-4">
              {item.items.map((shipmentItem: ShipmentItem, index: number) => (
                <div key={index} className="p-4 rounded-lg border bg-secondary/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <DetailItem icon={ShoppingBag} label="Item Name" value={shipmentItem['Item Name'] || 'N/A'} />
                      <DetailItem icon={Hash} label="Quantity" value={shipmentItem['Quantity'] || '1'} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Address Details */}
        {addressDetails.length > 0 && (
            <div className="md:col-span-2 lg:col-span-3 pt-6 border-t">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Return Address
                </h3>
                <div className="text-foreground font-medium space-y-0.5">
                    <p>{item['Address Line 1']}</p>
                    {item['Address Line 2'] && <p>{item['Address Line 2']}</p>}
                    <p>{item['City']}, {item['State']} {item['Pin Code']}</p>
                    <p>{item['Country']}</p>
                </div>
            </div>
        )}
        
        {/* Other Top-Level Details */}
        {otherDetails.length > 0 && (
            <div className="md:col-span-2 lg:col-span-3 pt-6 border-t">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Other Details
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
                    {otherDetails.map((key) => (
                        <DetailItem key={key} icon={Activity} label={key} value={String(item[key])} />
                    ))}
                </div>
            </div>
        )}
      </CardContent>
    </Card>
  );
}
