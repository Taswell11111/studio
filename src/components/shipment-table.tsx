'use client';

import React from 'react';
import type { ShipmentRecord } from '@/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from './status-badge';
import { format } from 'date-fns';

interface ShipmentTableProps {
  data: ShipmentRecord[];
}

export function ShipmentTable({ data }: ShipmentTableProps) {
  if (!data || data.length === 0) {
    return <p>No data to display.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Shipment ID</TableHead>
          <TableHead>Channel ID</TableHead>
          <TableHead>Store</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Order Date</TableHead>
          <TableHead>Customer</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{item['Shipment ID']}</TableCell>
            <TableCell>{item['Channel ID']}</TableCell>
            <TableCell>{item['Source Store']}</TableCell>
            <TableCell><StatusBadge status={item.Status} /></TableCell>
            <TableCell>{format(new Date(item['Order Date']), 'yyyy-MM-dd')}</TableCell>
            <TableCell>{item['Customer Name']}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
