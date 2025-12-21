
'use client';

import React from 'react';
import type { Inbound } from '@/types';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Package, Calendar, User, FileText, Package2, Hash } from 'lucide-react';

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

  const getInboundType = (typeId: number) => {
    switch (typeId) {
        case 1: return "Inbound Stock";
        case 3: return "RMA";
        default: return "Unknown";
    }
  }

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300 animate-in fade-in slide-in-from-bottom-2">
      <CardHeader className="bg-secondary/50 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4">
            <div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Inbound Order</p>
                <h2 className="font-mono font-bold text-2xl text-primary mt-1">{item.clientId}</h2>
            </div>
            <div className="text-right">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Type</p>
                <p className="font-medium text-lg">{getInboundType(item.typeId)}</p>
            </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-8">
        {/* Core Details */}
        <DetailItem icon={User} label="Customer / Source" value={item.customer} />
        <DetailItem icon={FileText} label="Supplier Reference" value={item.supplierReference} />
        <DetailItem icon={Calendar} label="Est. Arrival Date" value={item.estimatedArrivalDate ? new Date(item.estimatedArrivalDate).toLocaleDateString() : 'N/A'} />
        
        {/* Item Details */}
        {item.items && item.items.length > 0 && (
          <div className="md:col-span-2 lg:col-span-3 pt-6 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <Package className="w-4 h-4" />
              Items in Shipment ({item.items.length})
            </h3>
            <div className="space-y-4">
              {item.items.map((inboundItem, index) => (
                <div key={index} className="p-4 rounded-lg border bg-secondary/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <DetailItem icon={Package2} label="Item Name" value={inboundItem.name} />
                      <DetailItem icon={FileText} label="SKU" value={inboundItem.itemNo} />
                      <DetailItem icon={Hash} label="Quantity" value={inboundItem.qty} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
