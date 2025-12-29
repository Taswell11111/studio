
'use client';

import React, { useState, useTransition } from 'react';
import type { Inbound, Shipment, ShipmentItem } from '@/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { User, Calendar, Truck, Activity, Link as LinkIcon, RefreshCw, Package, Info, Hash, MapPin, ShoppingBag, ClipboardList, Building, Mail, Layers, ArchiveRestore } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { updateShipmentStatus } from '@/ai/flows/update-shipment-status';

type ShipmentCardProps = {
  item: Shipment;
  relatedInbound?: Inbound | null;
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

const getTrackingLink = (item: Shipment): string => {
    const courier = item['Courier'] as string;
    const trackingNo = item['Tracking No'] as string;

    if (!courier || !trackingNo) return item['Tracking Link'] as string || '';
    
    const upperCourier = courier.toUpperCase();
    if (upperCourier.includes('COURIERGUY')) {
        return `https://portal.thecourierguy.co.za/track?ref=${trackingNo}`;
    }
    if (upperCourier.includes('RAM')) {
        return `https://www.ram.co.za/Track/${trackingNo}`;
    }
    return item['Tracking Link'] as string || '';
}

export function ShipmentCard({ item, relatedInbound }: ShipmentCardProps) {
  const { toast } = useToast();
  const [isUpdating, startUpdateTransition] = useTransition();

  const handleRefreshStatus = () => {
    if (!item.id || !item['Tracking No'] || !item['Courier']) {
      toast({
        variant: 'destructive',
        title: 'Missing Information',
        description: 'Cannot update status without a shipment ID, tracking number, and courier.',
      });
      return;
    }

    startUpdateTransition(async () => {
      console.log(`Refreshing status for shipment ID: ${item.id}`);
      try {
        const result = await updateShipmentStatus({
          shipmentId: item.id,
          trackingNo: item['Tracking No'] as string,
          courier: item['Courier'] as string,
        });

        if (result.success) {
          toast({
            title: 'Status Updated',
            description: `Shipment status is now: ${result.newStatus}`,
          });
           window.location.reload();

        } else {
          throw new Error(result.message);
        }
      } catch (e: any) {
        console.error(`Failed to update shipment status for ID ${item.id}:`, e);
        toast({
          variant: 'destructive',
          title: 'Update Failed',
          description: e.message || 'Could not connect to the warehouse API.',
        });
      }
    });
  };
  
  const trackingLink = getTrackingLink(item);
  const addressFields = ['Address Line 1', 'Address Line 2', 'City', 'State', 'Pin Code', 'Country'];

  const excludedKeys = [
    'id',
    'items',
    'Direction',
    'Source Store',
    'Customer Name',
    'Email',
    'Order Date',
    'Courier',
    'Tracking No',
    'Tracking Link',
    'Status',
    'Shipment ID',
    'Source Store Order ID',
    'Status Date',
    'Item Name',
    'Quantity',
    'Channel ID',
    ...addressFields,
  ];

  const otherDetails = Object.keys(item).filter(
    (key) => !excludedKeys.includes(key) && item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== ''
  );
  
  const addressDetails = addressFields.map(field => ({field, value: item[field]})).filter(d => d.value);

  const searchTime = new Date().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short'});

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300 animate-in fade-in slide-in-from-bottom-2">
      <CardHeader className="bg-secondary/50 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
                <div className="flex items-center gap-3">
                    <p className="text-sm font-semibold text-primary uppercase tracking-wider flex items-center gap-2">
                        <Truck className="w-4 h-4"/>
                        {item['Direction']} Shipment
                    </p>
                    <span className="text-primary/30">|</span>
                    <p className="text-lg font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                        <Building className="w-4 h-4" />
                        {item['Source Store']}
                    </p>
                </div>
                <h2 className="font-mono font-bold text-2xl text-primary mt-2">{item['Shipment ID']}</h2>
                {relatedInbound && (
                    <div className="mt-2 flex items-center gap-2 text-amber-700 font-semibold text-xs py-1 px-2 bg-amber-100 rounded-md">
                        <ArchiveRestore className="w-4 h-4" />
                        <span>Related Inbound Return Found</span>
                    </div>
                )}
            </div>
            <div className="flex flex-col items-end gap-2 self-start text-right">
                <StatusBadge status={item['Status'] || 'UNKNOWN'} />
                <p className="text-xs text-muted-foreground">as at {searchTime}</p>
                 <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={handleRefreshStatus} 
                    disabled={isUpdating}
                    title={'Refresh shipment status'}
                    className="h-8"
                >
                    <RefreshCw className={`w-3 h-3 mr-2 ${isUpdating ? 'animate-spin' : ''}`} />
                    <span>{isUpdating ? 'Updating...' : 'Refresh'}</span>
                </Button>
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
        {/* Core Details */}
        <DetailItem icon={User} label="Customer" value={item['Customer Name']} />
        <DetailItem icon={Mail} label="Email" value={item['Email']} />
        {item['Channel ID'] && <DetailItem icon={Layers} label="Channel ID" value={item['Channel ID']} />}
        
        <div className="md:col-span-3 border-t pt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
          <DetailItem icon={Calendar} label="Order Date" value={item['Order Date'] ? new Date(item['Order Date']).toLocaleDateString() : 'N/A'} />
          <DetailItem icon={Calendar} label="Last Status Update" value={item['Status Date'] ? new Date(item['Status Date']).toLocaleDateString() : 'N/A'} />
        </div>

        <div className="md:col-span-3 border-t pt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
            <DetailItem icon={Truck} label="Courier" value={item['Courier'] || 'TBD'} />
            <DetailItem icon={Activity} label="Tracking No" value={<p className="font-mono">{item['Tracking No'] || 'Pending'}</p>} />
            <DetailItem icon={LinkIcon} label="Tracking Link" value={
                trackingLink ? (
                <a 
                    href={trackingLink} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-primary hover:underline truncate block"
                >
                    {trackingLink}
                </a>
                ) : (
                <span className="text-muted-foreground italic">Not available</span>
                )
            } fullWidth={true} />
        </div>
        
        {/* Address Details */}
        {addressDetails.length > 0 && (
            <div className="md:col-span-3 pt-8 border-t">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Delivery Address
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
              Items in Shipment ({item.items.length})
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

    