

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
  'Item Name': string;
  'Quantity': number;
  [key: string]: any;
};

export type Inbound = {
  id: string; // Will use 'Return ID' from data as the document ID
  'Return ID': string;
  'Source Store order Id'?: string;
  'Source Shipment ID'?: string;
  'Reference'?: string;
  'Return Date'?: string;
  'Shipping Type'?: string;
  'Tracking No'?: string;
  'Courier'?: string;
  'Status'?: string;
  'Status Date'?: string;
  'Fulfilment Center'?: string;
  'Customer Name'?: string;
  'Address Line 1'?: string;
  'Pin Code'?: string;
  items: InboundItem[];
  [key: string]: any;
};
