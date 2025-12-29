'use server';

/**
 * @fileOverview A Genkit flow to look up shipment details.
 * It now performs a comprehensive search across all configured Parcelninja stores.
 */
import { config } from 'dotenv';
config();

import { ai } from '@/ai/genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import {
  type Shipment,
  LookupShipmentInputSchema,
  type LookupShipmentInput,
  LookupShipmentOutputSchema,
  type LookupShipmentOutput,
  type Inbound,
} from '@/types';
import { format } from 'date-fns';
import { z } from 'zod';

// Main exported function that the client will call
export async function lookupShipment(input: LookupShipmentInput): Promise<LookupShipmentOutput> {
  return lookupShipmentFlow({ searchTerm: input.sourceStoreOrderId });
}

const DynamicLookupInputSchema = z.object({
  searchTerm: z.string().describe('A generic search term, which can be an Order ID, Customer Name, Item Name, etc.'),
});

type WarehouseCredentials = {
  name: string;
  apiUsername?: string;
  apiPassword?: string;
};

const credentialsList: WarehouseCredentials[] = [
    { name: 'DIESEL', apiUsername: process.env.DIESEL_WAREHOUSE_API_USERNAME, apiPassword: process.env.DIESEL_WAREHOUSE_API_PASSWORD },
    { name: 'HURLEY', apiUsername: process.env.HURLEY_WAREHOUSE_API_USERNAME, apiPassword: process.env.HURLEY_WAREHOUSE_API_PASSWORD },
    { name: 'JEEP', apiUsername: process.env.JEEP_APPAREL_WAREHOUSE_API_USERNAME, apiPassword: process.env.JEEP_APPAREL_WAREHOUSE_API_PASSWORD },
    { name: 'SUPERDRY', apiUsername: process.env.SUPERDRY_WAREHOUSE_API_USERNAME, apiPassword: process.env.SUPERDRY_WAREHOUSE_API_PASSWORD },
    { name: 'REEBOK', apiUsername: process.env.REEBOK_WAREHOUSE_API_USERNAME, apiPassword: process.env.REEBOK_WAREHOUSE_API_PASSWORD },
];

const lookupShipmentFlow = ai.defineFlow(
  {
    name: 'lookupShipmentFlow',
    inputSchema: DynamicLookupInputSchema,
    outputSchema: LookupShipmentOutputSchema,
  },
  async ({ searchTerm }) => {
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
    const { firestore } = initializeFirebaseOnServer();
    
    let foundRecord: Shipment | Inbound | null = null;
    
    // Date range for general search queries - search last 90 days for broad queries.
    const today = new Date();
    const fromDate = new Date();
    fromDate.setDate(today.getDate() - 90);
    const startDate = format(fromDate, 'yyyyMMdd');
    const endDate = format(today, 'yyyyMMdd');

    for (const creds of credentialsList) {
      if (foundRecord) break;
      if (!creds.apiUsername || !creds.apiPassword) {
        console.warn(`Skipping lookup for ${creds.name}: Missing credentials.`);
        continue;
      }

      const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString('base64');
      const headers = { 'Authorization': `Basic ${basicAuth}` };

      // Define endpoints for general search on both outbounds and inbounds.
      const endpoints: { type: 'Outbound' | 'Inbound', url: string }[] = [
        { type: 'Outbound', url: `https://storeapi.parcelninja.com/api/v1/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1&search=${encodeURIComponent(searchTerm)}` },
        { type: 'Inbound', url: `https://storeapi.parcelninja.com/api/v1/inbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1&search=${encodeURIComponent(searchTerm)}` }
      ];

      for (const endpoint of endpoints) {
        if (foundRecord) break;
        const result = await queryEndpoint(creds.name, endpoint.type, endpoint.url, headers);
        if(result) {
            foundRecord = result;
            break;
        }
      }
    }

    if (foundRecord) {
      try {
        const collectionName = foundRecord.Direction === 'Inbound' ? 'inbounds' : 'shipments';
        const docId = String(foundRecord['Shipment ID']);
        const docRef = firestore.collection(`artifacts/${appId}/public/data/${collectionName}`).doc(docId);
        
        const dataToSave = { ...foundRecord, updatedAt: new Date().toISOString() };
        await docRef.set(dataToSave, { merge: true });
        console.log(`[API] Saved ${collectionName} record ${docId} to Firestore at path: ${docRef.path}.`);

      } catch (dbError) {
        console.error("Failed to save API-found record to Firestore:", dbError);
      }
      return { shipment: foundRecord };
    }

    return {
      shipment: null,
      error: 'Record not found in local cache or any configured warehouse store.',
    };
  }
);


async function queryEndpoint(storeName: string, direction: 'Outbound' | 'Inbound', url: string, headers: HeadersInit): Promise<Shipment | Inbound | null> {
    try {
        console.log(`[${storeName}] Checking ${direction} at ${url}`);
        const response = await fetch(url, { method: 'GET', headers });

        if (response.ok) {
            const data = await response.json();
            const recordListKey = direction.toLowerCase() + 's';
            
            if (data && data[recordListKey] && data[recordListKey].length > 0) {
                 console.log(`[${storeName}] Found ${direction} record by general search.`);
                const record = data[recordListKey][0];
                const detailUrl = `https://storeapi.parcelninja.com/api/v1/${recordListKey}/${record.id}`;
                const fullRecordResponse = await fetch(detailUrl, { headers });
                if(fullRecordResponse.ok) {
                    const fullRecord = await fullRecordResponse.json();
                    return mapParcelninjaToShipment(fullRecord, direction, storeName);
                }
            }
        } else if (response.status !== 404) {
            const errorText = await response.text();
            console.error(`[${storeName}] API Error for ${direction} (${response.status}): ${errorText}`);
        }
    } catch (err: any) {
        console.error(`[${storeName}] Network error checking ${direction}:`, err.message);
    }
    return null;
}


function mapParcelninjaToShipment(data: any, direction: 'Outbound' | 'Inbound', storeName: string): Shipment | Inbound {
  const status = data.status?.description || 'Unknown';
  
  const baseRecord = {
    'Direction': direction,
    'Shipment ID': String(data.clientId || data.id),
    'Source Store': storeName,
    'Source Store Order ID': String(data.clientId || ''),
    'Channel ID': direction === 'Outbound' ? data.channelId : undefined,
    'Order Date': data.createDate ? formatApiDate(data.createDate) : new Date().toISOString(),
    'Customer Name': data.deliveryInfo?.customer || data.deliveryInfo?.contactName || '',
    'Email': data.deliveryInfo?.email || '',
    'Status': status,
    'Tracking No': data.deliveryInfo?.trackingNo || data.deliveryInfo?.waybillNumber || '',
    'Courier': data.deliveryInfo?.courierName || storeName,
    'Tracking Link': data.deliveryInfo?.trackingUrl || data.deliveryInfo?.trackingURL || '',
    'Status Date': data.status?.timeStamp ? formatApiDate(data.status.timeStamp) : new Date().toISOString(),
    'Address Line 1': data.deliveryInfo?.addressLine1 || '',
    'Address Line 2': data.deliveryInfo?.addressLine2 || '',
    'City': data.deliveryInfo?.suburb || '',
    'Pin Code': data.deliveryInfo?.postalCode || '',
    'items': data.items ? data.items.map((item: any) => ({
        'Item Name': item.name,
        'Quantity': item.qty,
        'SKU': item.itemNo,
    })) : [],
  };

  const finalRecord = { ...baseRecord, id: baseRecord['Shipment ID'] };

  if (direction === 'Inbound') {
    return finalRecord as Inbound;
  }
  return finalRecord as Shipment;
}

function formatApiDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return new Date().toISOString();
  try {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    return new Date(year, month, day).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}
