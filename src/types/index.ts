
export type ShipmentItem = {
  'Item Name': string;
  [key: string]: any;
};

export type Shipment = {
  id: string;
  'Source Store Order ID': string;
  'Status': string;
  'Customer Name': string;
  'Order Date': string;
  'Courier': string;
  'Tracking No': string;
  'Tracking Link': string;
  items: ShipmentItem[];
  [key: string]: any;
};

export type InboundItem = {
  itemNo: string;
  name: string;
  qty: number;
  barcode?: string;
  [key: string]: any;
};

export type Inbound = {
  id: string; // Will use clientId from the data as the document ID
  clientId: string;
  supplierReference?: string;
  typeId: number;
  customer: string;
  estimatedArrivalDate: string;
  items: InboundItem[];
  [key: string]: any;
};
