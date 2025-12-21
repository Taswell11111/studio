'use server';

// A single item within a shipment
export type ShipmentItem = {
  'Item Name': string;
  'Quantity': number;
  [key: string]: any;
};

// Represents a record from the unified CSV file.
// Can be either an outbound shipment or an inbound return.
export type ShipmentRecord = {
  id: string; // Document ID, from 'Shipment ID'
  'Direction': 'Outbound' | 'Inbound' | string;
  'Shipment ID': string;
  'Order ID'?: string;
  'Source Store'?: string;
  'Brand'?: string;
  'Source Store Order ID'?: string;
  'Order Date'?: string;
  'Shipping Type'?: string;
  'Tracking No'?: string;
  'Courier'?: string;
  'Status'?: string;
  'Status Date'?: string;
  'Customer Type'?: string;
  'Customer Name'?: string;
  'Address Line 1'?: string;
  'Address Line 2'?: string;
  'City'?: string;
  'Region'?: string;
  'State'?: string;
  'Country'?: string;
  'Pin Code'?: string;
  items: ShipmentItem[];
  [key: string]: any;
};

// Type alias for clarity in the code. Represents an outbound shipment.
export type Shipment = ShipmentRecord;

// Type alias for clarity. Represents an inbound shipment/return.
export type Inbound = ShipmentRecord;
