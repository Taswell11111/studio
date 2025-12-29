'use server';

/**
 * @fileOverview A Genkit flow to look up shipment details from Parcelninja API using a generic search term.
 *
 * - lookupShipment - A function that fetches shipment data based on a search term which could be an order ID, customer name, item name, etc.
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

// Main exported function that the client will call
export async function lookupShipment(input: LookupShipmentInput): Promise<LookupShipmentOutput> {
  // The input for the flow is now a generic `searchTerm`
  return lookupShipmentFlow({ searchTerm: input.sourceStoreOrderId });
}

const DynamicLookupInputSchema = z.object({
  searchTerm: z.string().describe('A generic search term, which can be an Order ID, Customer Name, Item Name, etc.'),
});

// Define a type for our credentials
type WarehouseCredentials = {
  name: string;
  apiUsername?: string;
  apiPassword?: string;
};

// The Genkit flow that orchestrates the lookup process
const lookupShipmentFlow = ai.defineFlow(
  {
    name: 'lookupShipmentFlow',
    inputSchema: DynamicLookupInputSchema,
    outputSchema: LookupShipmentOutputSchema,
  },
  async ({ searchTerm }) => {
    // 1. Gather all credentials
    const credentialsList: WarehouseCredentials[] = [
      { name: 'DIESEL', apiUsername: process.env.DIESEL_WAREHOUSE_API_USERNAME, apiPassword: process.env.DIESEL_WAREHOUSE_API_PASSWORD },
      { name: 'HURLEY', apiUsername: process.env.HURLEY_WAREHOUSE_API_USERNAME, apiPassword: process.env.HURLEY_WAREHOUSE_API_PASSWORD },
      { name: 'JEEP', apiUsername: process.env.JEEP_APPAREL_WAREHOUSE_API_USERNAME, apiPassword: process.env.JEEP_APPAREL_WAREHOUSE_API_PASSWORD },
      { name: 'SUPERDRY', apiUsername: process.env.SUPERDRY_WAREHOUSE_API_USERNAME, apiPassword: process.env.SUPERDRY_WAREHOUSE_API_PASSWORD },
      { name: 'REEBOK', apiUsername: process.env.REEBOK_WAREHOUSE_API_USERNAME, apiPassword: process.env.REEBOK_WAREHOUSE_API_PASSWORD },
    ];

    let foundRecord: Shipment | Inbound | null = null;
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
    
    // Define a date range for list-based searches (last 90 days)
    const today = new Date();
    const fromDate = new Date();
    fromDate.setDate(today.getDate() - 90);
    const startDate = format(fromDate, 'yyyyMMdd');
    const endDate = format(today, 'yyyyMMdd');

    // 2. Iterate through each store to find the record
    for (const creds of credentialsList) {
      if (foundRecord) break; // Exit early if we've found it
      if (!creds.apiUsername || !creds.apiPassword) {
        console.warn(`Skipping lookup for ${creds.name}: Missing credentials.`);
        continue;
      }

      const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString('base64');
      
      // Define endpoints to check: ID-based search first, then general search.
      const idEndpoints: { type: 'Outbound' | 'Inbound', url: string, headers: HeadersInit }[] = [
        { type: 'Outbound', url: 'https://storeapi.parcelninja.com/api/v1/outbounds/0', headers: { 'Authorization': `Basic ${basicAuth}`, 'X-Client-Id': searchTerm } },
        { type: 'Inbound', url: 'https://storeapi.parcelninja.com/api/v1/inbounds/0', headers: { 'Authorization': `Basic ${basicAuth}`, 'X-Client-Id': searchTerm } }
      ];

      const searchEndpoints: { type: 'Outbound' | 'Inbound', url: string, headers: HeadersInit }[] = [
          { type: 'Outbound', url: `https://storeapi.parcelninja.com/api/v1/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1&search=${encodeURIComponent(searchTerm)}`, headers: { 'Authorization': `Basic ${basicAuth}` } },
          { type: 'Inbound', url: `https://storeapi.parcelninja.com/api/v1/inbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1&search=${encodeURIComponent(searchTerm)}`, headers: { 'Authorization': `Basic ${basicAuth}` } }
      ];

      // Prioritize ID-based search for exact matches
      for (const endpoint of idEndpoints) {
        if (foundRecord) break;
        const result = await queryEndpoint(creds.name, endpoint.type, endpoint.url, endpoint.headers, false);
        if(result) {
            foundRecord = result;
            break;
        }
      }

      // If not found by ID, try general search
      if(!foundRecord){
        for(const endpoint of searchEndpoints) {
            if (foundRecord) break;
            const result = await queryEndpoint(creds.name, endpoint.type, endpoint.url, endpoint.headers, true);
            if(result) {
                foundRecord = result;
                break;
            }
        }
      }
    }

    if (foundRecord) {
      // 3. Save found shipment to Firestore
      try {
        const { firestore } = initializeFirebaseOnServer();
        const collectionName = foundRecord.Direction === 'Inbound' ? 'inbounds' : 'shipments';
        const docId = String(foundRecord['Shipment ID']);
        const docRef = firestore.collection(`artifacts/${appId}/public/data/${collectionName}`).doc(docId);
        
        const dataToSave = { ...foundRecord, updatedAt: new Date().toISOString() };
        await docRef.set(dataToSave, { merge: true });
        console.log(`Saved ${collectionName} record ${docId} to Firestore.`);

      } catch (dbError) {
        console.error("Failed to save record to Firestore:", dbError);
        // We don't fail the lookup if save fails, but we should log it.
      }
      return { shipment: foundRecord };
    }

    return {
      shipment: null,
      error: 'Record not found in any configured warehouse store using the provided search term.',
    };
  }
);


async function queryEndpoint(storeName: string, direction: 'Outbound' | 'Inbound', url: string, headers: HeadersInit, isSearch: boolean): Promise<Shipment | Inbound | null> {
    try {
        console.log(`[${storeName}] Checking ${direction} at ${url}`);
        const response = await fetch(url, { method: 'GET', headers });

        if (response.ok) {
            const data = await response.json();

            // Single record from ID search
            if (!isSearch && data && data.id) {
                console.log(`[${storeName}] Found ${direction} record by ID.`);
                return mapParcelninjaToShipment(data, direction, storeName);
            }
            // List from general search
            if (isSearch && data && data[direction.toLowerCase() + 's'] && data[direction.toLowerCase() + 's'].length > 0) {
                 console.log(`[${storeName}] Found ${direction} record by general search.`);
                const record = data[direction.toLowerCase() + 's'][0];
                const fullRecordResponse = await fetch(`https://storeapi.parcelninja.com/api/v1/${direction.toLowerCase()}s/${record.id}`, { headers });
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


// Helper to map API response to our Shipment/Inbound type
function mapParcelninjaToShipment(data: any, direction: 'Outbound' | 'Inbound', storeName: string): Shipment | Inbound {
  const status = data.status?.description || 'Unknown';
  
  const baseRecord = {
    'Direction': direction,
    'Shipment ID': String(data.clientId || data.id),
    'Source Store': storeName,
    'Source Store Order ID': String(data.clientId || ''),
    'Order Date': data.createDate ? formatApiDate(data.createDate) : new Date().toISOString(),
    'Customer Name': data.deliveryInfo?.customer || data.deliveryInfo?.contactName || '',
    'Status': status,
    'Tracking No': data.deliveryInfo?.trackingNo || data.deliveryInfo?.waybillNumber || '',
    'Courier': data.deliveryInfo?.courierName || storeName, // Default to store name if no courier
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

  // The 'id' field is for Firestore document ID, which we'll make consistent
  const finalRecord = { ...baseRecord, id: baseRecord['Shipment ID'] };

  if (direction === 'Inbound') {
    return finalRecord as Inbound;
  }
  return finalRecord as Shipment;
}

// Helper to parse Parcelninja's YYYYMMDDHHmmSS date format
function formatApiDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return new Date().toISOString();
  try {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1; // JS months are 0-indexed
    const day = parseInt(dateStr.substring(6, 8), 10);
    return new Date(year, month, day).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}
