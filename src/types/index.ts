
import { z } from 'zod';

// A single item within a shipment
export type ShipmentItem = {
  'Item Name': string;
  'Quantity': number;
  'SKU'?: string;
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
  items?: ShipmentItem[];
  [key: string]: any;
};

// Type alias for clarity in the code. Represents an outbound shipment.
export type Shipment = ShipmentRecord;

// Type alias for clarity. Represents an inbound shipment/return.
export type Inbound = ShipmentRecord;


// Schema for CSV import flow
export const ImportShipmentDataInputSchema = z.object({
  csvText: z.string().describe('The raw text content of the CSV file.'),
});
export type ImportShipmentDataInput = z.infer<typeof ImportShipmentDataInputSchema>;

export const ImportShipmentDataOutputSchema = z.object({
  success: z.boolean(),
  inboundsCreated: z.number().describe('Number of inbound records created.'),
  outboundsCreated: z.number().describe('Number of outbound records created.'),
  message: z.string(),
});
export type ImportShipmentDataOutput = z.infer<typeof ImportShipmentDataOutputSchema>;


// Schema for update shipment status flow
export const UpdateShipmentStatusInputSchema = z.object({
  shipmentId: z.string().describe('The document ID of the shipment in Firestore.'),
  trackingNo: z.string().describe('The tracking number of the shipment.'),
  courier: z.string().describe('The courier/store name to determine which API credentials to use.'),
});
export type UpdateShipmentStatusInput = z.infer<typeof UpdateShipmentStatusInputSchema>;

export const UpdateShipmentStatusOutputSchema = z.object({
  success: z.boolean(),
  newStatus: z.string().optional(),
  message: z.string(),
});
export type UpdateShipmentStatusOutput = z.infer<typeof UpdateShipmentStatusOutputSchema>;


// Schema for clearing data flows
export const ClearDataOutputSchema = z.object({
  success: z.boolean(),
  recordsDeleted: z.number(),
  message: z.string(),
});
export type ClearDataOutput = z.infer<typeof ClearDataOutputSchema>;

export const ClearInboundDataOutputSchema = z.object({
    success: z.boolean(),
    recordsDeleted: z.number(),
    message: z.string(),
});
export type ClearInboundDataOutput = z.infer<typeof ClearInboundDataOutputSchema>;


// Schema for shipment lookup flow
export const LookupShipmentInputSchema = z.object({
  sourceStoreOrderId: z.string().describe('The Order ID from the source store.'),
});
export type LookupShipmentInput = z.infer<typeof LookupShipmentInputSchema>;

export const LookupShipmentOutputSchema = z.object({
  shipment: z.custom<Shipment>().nullable(),
  error: z.string().optional(),
});
export type LookupShipmentOutput = z.infer<typeof LookupShipmentOutputSchema>;
