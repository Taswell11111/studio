
'use client';

import React from 'react';
import type { Inbound, ShipmentItem } from '@/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Package, Calendar, User, FileText, Package2, Hash, Truck, MapPin, Building, ShoppingBag, Info, Activity, Link as LinkIcon, RefreshCw, ArchiveRestore, Mail } from 'lucide-react';
import { StatusBadge } from './status-badge';

type InboundCardProps = {
  item: Inbound;
  isRelated?: boolean;
};

const DetailItem = ({ icon: Icon, label, value, fullWidth = false }: { icon: React.ElementType, label: string, value: React.ReactNode, fullWidth?: boolean }) => (
    <div className={`flex items-start gap-3 ${fullWidth ? 'col-span-1 md:col-span-2 lg:col-span-3' : ''}`}>
        <Icon className="w-5 h-5 text-muted-foreground mt-0.5" />
        <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
            <div className="text-foreground font-medium break-words">{value || 'N/A'}</div>
        </div>
    </div>
);


export function InboundCard({ item, isRelated = false }: InboundCardProps) {

  const addressFields = ['Address Line 1', 'Address Line 2', 'City', 'State', 'Pin Code', 'Country'];
  
  const excludedKeys = [
    'id',
    'items',
    'Direction',
    'Shipment ID',
    'Order ID',
    'Source Store Order ID',
    'Customer Name',
    'Email',
    'Order Date',
    'Courier',
    'Tracking No',
    'Status',
    'Status Date',
    'Channel ID',
    ...addressFields,
  ];

  const otherDetails = Object.keys(item).filter(
    (key) => !excludedKeys.includes(key) && item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== ''
  );
  
  const addressDetails = addressFields.map(field => ({field, value: item[field]})).filter(d => d.value);

  const searchTime = new Date().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short'});

  return (
    <Card className={`overflow-hidden hover:shadow-lg transition-shadow duration-300 animate-in fade-in slide-in-from-bottom-2 ${isRelated ? 'border-amber-400 mt-4' : 'border-amber-200'}`}>
      <CardHeader className={`${isRelated ? 'bg-amber-100/60' : 'bg-amber-50/50'} p-6`}>
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
                 <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-2">
                        <ArchiveRestore className="w-4 h-4"/>
                        {item['Direction']}
                    </p>
                    <span className="text-amber-300">|</span>
                    <p className="text-lg font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Building className="w-4 h-4" />
                        {item['Source Store']}
                    </p>
                </div>
                <h2 className="font-mono font-bold text-2xl text-amber-900 mt-2">{item['Shipment ID']}</h2>
            </div>
            <div className="flex flex-col items-end gap-2 self-start text-right">
                <StatusBadge status={item['Status'] || 'UNKNOWN'} />
                <p className="text-xs text-muted-foreground">as at {searchTime}</p>
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
        {/* Core Details */}
        <DetailItem icon={User} label="Customer" value={item['Customer Name']} />
        <DetailItem icon={Mail} label="Email" value={item['Email']} />
        <div className="md:col-span-3 border-t pt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
          <DetailItem icon={Calendar} label="Order Date" value={item['Order Date'] ? new Date(item['Order Date']).toLocaleDateString() : 'N.A'} />
          <DetailItem icon={Calendar} label="Last Status Update" value={item['Status Date'] ? new Date(item['Status Date']).toLocaleDateString() : 'N.A'} />
        </div>
        
        <div className="md:col-span-3 border-t pt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
            <DetailItem icon={Truck} label="Courier" value={item['Courier'] || 'TBD'} />
            <DetailItem icon={Activity} label="Tracking No" value={<p className="font-mono">{item['Tracking No'] || 'Pending'}</p>} />
        </div>

        {/* Address Details */}
        {addressDetails.length > 0 && (
            <div className="md:col-span-3 pt-8 border-t">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Return Address
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
                    <DetailItem icon={MapPin} label="Address Line 1" value={item['Address Line 1']} />
                    {item['Address Line 2'] && <DetailItem icon={MapPin} label="Address Line 2" value={item['Address Line 2']} />}
                    <DetailItem icon={MapPin} label="City / Suburb" value={item['City']} />
                    <DetailItem icon={MapPin} label="Postal Code" value={item['Pin Code']} />
                </div>
            </div>
        )}
        
        {/* Item Details */}
        {item.items && item.items.length > 0 && (
          <div className="md:col-span-3 pt-8 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Items in Return ({item.items.length})
            </h3>
            <ul className="list-disc list-inside space-y-2">
                {item.items.map((shipmentItem: ShipmentItem, index: number) => (
                    <li key={index} className="text-sm">
                        <span className="font-semibold">{shipmentItem['SKU']}</span> - Qty: {shipmentItem['Quantity']}
                    </li>
                ))}
            </ul>
          </div>
        )}
        
        {/* Other Top-Level Details */}
        {otherDetails.length > 0 && (
            <div className="md:col-span-3 pt-8 border-t">
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

    