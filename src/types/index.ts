
import { z } from 'zod';

// A single item within a shipment
export const ShipmentItemSchema = z.object({
  'Item Name': z.string(),
  'Quantity': z.number(),
  'SKU': z.string().optional(),
});
export type ShipmentItem = z.infer<typeof ShipmentItemSchema>;


// Represents a record from the unified CSV file.
// Can be either an outbound shipment or an inbound return.
export const ShipmentRecordSchema = z.object({
  id: z.string(), // Document ID, from 'Shipment ID'
  'Direction': z.enum(['Outbound', 'Inbound']),
  'Shipment ID': z.string(),
  'Source Store': z.string().optional(),
  'Source Store Order ID': z.string().optional(),
  'Order Date': z.string().optional(),
  'Courier': z.string().optional(),
  'Status': z.string().optional(),
  'Status Date': z.string().optional(),
  'Customer Type': z.string().optional(),
  'Customer Name': z.string().optional(),
  'Address Line 1': z.string().optional(),
  'Address Line 2': z.string().optional(),
  'City': z.string().optional(),
  'Region': z.string().optional(),
  'State': z.string().optional(),
  'Country': z.string().optional(),
  'Pin Code': z.string().optional(),
  'items': z.array(ShipmentItemSchema).optional(),
  'Tracking No': z.string().optional(),
  'Tracking Link': z.string().optional(),
  'Email': z.string().optional(),
  'Channel ID': z.string().optional(),
}).catchall(z.any());

export type ShipmentRecord = z.infer<typeof ShipmentRecordSchema>;


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
  storeName: z.string().optional().describe('The specific store to search in.'),
});
export type LookupShipmentInput = z.infer<typeof LookupShipmentInputSchema>;

export const LookupShipmentOutputSchema = z.object({
  shipment: z.custom<Shipment | Inbound>().nullable(),
  relatedInbound: z.custom<Inbound>().nullable().optional(),
  error: z.string().optional(),
});
export type LookupShipmentOutput = z.infer<typeof LookupShipmentOutputSchema>;

// Schema for multi-shipment lookup flow
export const MultiLookupShipmentInputSchema = z.object({
  searchTerms: z.array(z.string()).describe('An array of search terms (e.g., order IDs).'),
  storeNames: z.array(z.string()).optional().describe('An optional array of store names to filter the search.'),
});
export type MultiLookupShipmentInput = z.infer<typeof MultiLookupShipmentInputSchema>;

export const MultiLookupShipmentOutputSchema = z.object({
  results: z.array(ShipmentRecordSchema),
  notFound: z.array(z.string()),
  error: z.string().optional(),
});
export type MultiLookupShipmentOutput = z.infer<typeof MultiLookupShipmentOutputSchema>;


// Schema for connection test streaming flow
export const ConnectionTestStreamChunkSchema = z.object({
  log: z.string().optional(),
  result: z
    .object({
      storeName: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    })
    .optional(),
});
export type ConnectionTestStreamChunk = z.infer<typeof ConnectionTestStreamChunkSchema>;
