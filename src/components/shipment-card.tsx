'use client';

import React, { useState, useTransition } from 'react';
import type { Shipment, ShipmentItem } from '@/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/status-badge';
import { User, Calendar, Truck, Activity, Link as LinkIcon, RefreshCw, Package, Info, Hash, MapPin, ShoppingBag, ClipboardList, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { updateShipmentStatus } from '@/ai/flows/update-shipment-status';

type ShipmentCardProps = {
  item: Shipment;
};

const DetailItem = ({ icon: Icon, label, value }: { icon: React.ElementType, label: string, value: React.ReactNode }) => (
    <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 text-muted-foreground mt-0.5" />
        <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
            <div className="text-foreground font-medium break-words">{value}</div>
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

export function ShipmentCard({ item }: ShipmentCardProps) {
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
          console.log(`Successfully updated status for shipment ID ${item.id} to: ${result.newStatus}`);
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
    'Customer Name',
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
    ...addressFields,
  ];

  const otherDetails = Object.keys(item).filter(
    (key) => !excludedKeys.includes(key) && item[key] !== undefined && item[key] !== null && String(item[key]).trim() !== ''
  );
  
  const addressDetails = addressFields.map(field => ({field, value: item[field]})).filter(d => d.value);

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300 animate-in fade-in slide-in-from-bottom-2">
      <CardHeader className="bg-secondary/50 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Shipment ID</p>
                <h2 className="font-mono font-bold text-2xl text-primary mt-1">{item['Shipment ID']}</h2>
                <div className="flex items-center gap-2 mt-2">
                  <Building className="w-4 h-4 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source Store Order ID:</p>
                  <p className="font-mono text-sm">{item['Source Store Order ID']}</p>
                </div>
            </div>
            <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                    <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleRefreshStatus} 
                        disabled={isUpdating}
                        title={'Refresh shipment status'}
                    >
                        <RefreshCw className={isUpdating ? 'animate-spin' : ''} />
                        <span>{isUpdating ? 'Updating...' : 'Refresh'}</span>
                    </Button>
                    <StatusBadge status={item['Status'] || 'UNKNOWN'} />
                </div>
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
        <div className="flex items-start gap-3 md:col-span-2 lg:col-span-1">
            <LinkIcon className="w-5 h-5 text-muted-foreground mt-0.5" />
            <div className="w-full overflow-hidden">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tracking Link</p>
                {trackingLink ? (
                <a 
                    href={trackingLink} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-primary hover:underline truncate block text-sm mt-1"
                >
                    {trackingLink}
                </a>
                ) : (
                <span className="text-muted-foreground italic text-sm">Not available yet</span>
                )}
            </div>
        </div>
        
        {/* Item Details */}
        {item.items && item.items.length > 0 && (
          <div className="md:col-span-2 lg:col-span-3 pt-6 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Items in Shipment ({item.items.length})
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
                    Delivery Address
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
