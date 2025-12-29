'use server';

/**
 * @fileOverview A Genkit flow to look up shipment details from Parcelninja API using an order ID.
 *
 * - lookupShipment - A function that fetches shipment data based on a source store order ID (X-Client-Id) and saves it to Firestore.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import {
  type Shipment,
  LookupShipmentInputSchema,
  type LookupShipmentInput,
  LookupShipmentOutputSchema,
  type LookupShipmentOutput,
  type Inbound, // Ensure Inbound is typed correctly
} from '@/types';

// Main exported function that the client will call
export async function lookupShipment(input: LookupShipmentInput): Promise<LookupShipmentOutput> {
  return lookupShipmentFlow(input);
}

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
    inputSchema: LookupShipmentInputSchema,
    outputSchema: LookupShipmentOutputSchema,
  },
  async ({ sourceStoreOrderId }) => {
    // 1. Gather all credentials
    const credentialsList: WarehouseCredentials[] = [
      { name: 'DIESEL', apiUsername: process.env.DIESEL_WAREHOUSE_API_USERNAME, apiPassword: process.env.DIESEL_WAREHOUSE_API_PASSWORD },
      { name: 'HURLEY', apiUsername: process.env.HURLEY_WAREHOUSE_API_USERNAME, apiPassword: process.env.HURLEY_WAREHOUSE_API_PASSWORD },
      { name: 'JEEP', apiUsername: process.env.JEEP_APPAREL_WAREHOUSE_API_USERNAME, apiPassword: process.env.JEEP_APPAREL_WAREHOUSE_API_PASSWORD },
      { name: 'SUPERDRY', apiUsername: process.env.SUPERDRY_WAREHOUSE_API_USERNAME, apiPassword: process.env.SUPERDRY_WAREHOUSE_API_PASSWORD },
      { name: 'REEBOK', apiUsername: process.env.REEBOK_WAREHOUSE_API_USERNAME, apiPassword: process.env.REEBOK_WAREHOUSE_API_PASSWORD },
    ];

    let foundShipment: Shipment | Inbound | null = null;
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';

    // 2. Iterate through each store to find the order
    for (const creds of credentialsList) {
      if (foundShipment) break; // Exit early if we've found it
      if (!creds.apiUsername || !creds.apiPassword) {
        console.warn(`Skipping lookup for ${creds.name}: Missing credentials.`);
        continue;
      }

      const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString('base64');
      const headers = {
        'Authorization': `Basic ${basicAuth}`,
        'X-Client-Id': sourceStoreOrderId,
      };

      // Define endpoints to check
      const endpoints: { type: 'Outbound' | 'Inbound', url: string }[] = [
        { type: 'Outbound', url: 'https://storeapi.parcelninja.com/api/v1/outbounds/0' },
        { type: 'Inbound', url: 'https://storeapi.parcelninja.com/api/v1/inbounds/0' }
      ];

      for (const endpoint of endpoints) {
        try {
          console.log(`[${creds.name}] Checking ${endpoint.type} for Order ID: ${sourceStoreOrderId}`);
          const response = await fetch(endpoint.url, { method: 'GET', headers });

          if (response.ok) {
            const data = await response.json();
            // A valid response for a single record will be an object with an 'id'
            if (data && data.id) {
              console.log(`[${creds.name}] Found ${endpoint.type} order.`);
              foundShipment = mapParcelninjaToShipment(data, endpoint.type, creds.name);
              break; // Found it, break from the inner loop
            }
          } else if (response.status !== 404) {
            // Log errors that are not 'Not Found'
            const errorText = await response.text();
            console.error(`[${creds.name}] API Error for ${endpoint.type} (${response.status}): ${errorText}`);
          }
        } catch (err: any) {
          console.error(`[${creds.name}] Network error checking ${endpoint.type}:`, err.message);
        }
      }
    }

    if (foundShipment) {
      // 3. Save found shipment to Firestore
      try {
        const { firestore } = initializeFirebaseOnServer();
        // Determine collection based on direction
        const collectionName = foundShipment.Direction === 'Inbound' ? 'inbounds' : 'shipments';
        const docId = String(foundShipment['Shipment ID']);
        const docRef = firestore.collection(`artifacts/${appId}/public/data/${collectionName}`).doc(docId);
        
        const dataToSave = {
            ...foundShipment,
            updatedAt: new Date().toISOString(),
        };

        await docRef.set(dataToSave, { merge: true });
        console.log(`Saved ${collectionName} record ${docId} to Firestore.`);

      } catch (dbError) {
        console.error("Failed to save shipment to Firestore:", dbError);
        // We don't fail the lookup if save fails, but we should log it.
      }

      return { shipment: foundShipment };
    }

    return {
      shipment: null,
      error: 'Order not found in any configured warehouse store.',
    };
  }
);

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
