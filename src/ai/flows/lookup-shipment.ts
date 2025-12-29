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
  Inbound,
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
  storeId?: string;
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
      {
        name: 'DIESEL',
        apiUsername: process.env.DIESEL_WAREHOUSE_API_USERNAME,
        apiPassword: process.env.DIESEL_WAREHOUSE_API_PASSWORD,
        storeId: process.env.DIESEL_WAREHOUSE_STORE_ID,
      },
      {
        name: 'HURLEY',
        apiUsername: process.env.HURLEY_WAREHOUSE_API_USERNAME,
        apiPassword: process.env.HURLEY_WAREHOUSE_API_PASSWORD,
        storeId: process.env.HURLEY_WAREHOUSE_STORE_ID,
      },
      {
        name: 'JEEP',
        apiUsername: process.env.JEEP_APPAREL_WAREHOUSE_API_USERNAME,
        apiPassword: process.env.JEEP_APPAREL_WAREHOUSE_API_PASSWORD,
        storeId: process.env.JEEP_APPAREL_WAREHOUSE_STORE_ID,
      },
      {
        name: 'SUPERDRY',
        apiUsername: process.env.SUPERDRY_WAREHOUSE_API_USERNAME,
        apiPassword: process.env.SUPERDRY_WAREHOUSE_API_PASSWORD,
        storeId: process.env.SUPERDRY_WAREHOUSE_STORE_ID,
      },
      {
        name: 'REEBOK',
        apiUsername: process.env.REEBOK_WAREHOUSE_API_USERNAME,
        apiPassword: process.env.REEBOK_WAREHOUSE_API_PASSWORD,
        storeId: process.env.REEBOK_WAREHOUSE_STORE_ID,
      },
    ];

    let foundShipment: Shipment | Inbound | null = null;
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';

    // 2. Iterate through each store to find the order
    for (const creds of credentialsList) {
      if (!creds.apiUsername || !creds.apiPassword) {
        continue; // Skip if credentials missing
      }

      const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString('base64');
      const headers = {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json',
        'X-Client-Id': sourceStoreOrderId, // Magic header for lookup by custom ID
      };

      try {
        // --- Try Outbound Lookup ---
        console.log(`Checking outbound for ${sourceStoreOrderId} in ${creds.name}`);
        const outboundUrl = `https://storeapi.parcelninja.com/api/v1/outbounds/0`;
        const outboundResponse = await fetch(outboundUrl, { method: 'GET', headers });

        if (outboundResponse.ok) {
          const data = await outboundResponse.json();
          // Verify we got a valid object (checking for a key field like 'id' or 'typeId')
          if (data && data.id) {
            console.log(`Found outbound order in ${creds.name}`);
            foundShipment = mapParcelninjaToShipment(data, 'Outbound', creds.name);
            break; // Found it!
          }
        }

        // --- Try Inbound Lookup ---
        console.log(`Checking inbound for ${sourceStoreOrderId} in ${creds.name}`);
        const inboundUrl = `https://storeapi.parcelninja.com/api/v1/inbounds/0`;
        const inboundResponse = await fetch(inboundUrl, { method: 'GET', headers });

        if (inboundResponse.ok) {
          const data = await inboundResponse.json();
          if (data && data.id) {
            console.log(`Found inbound order in ${creds.name}`);
            foundShipment = mapParcelninjaToShipment(data, 'Inbound', creds.name);
            break; // Found it!
          }
        }

      } catch (err: any) {
        console.error(`Error checking store ${creds.name}:`, err.message);
        // Continue to next store
      }
    }

    if (foundShipment) {
      // 3. Save found shipment to Firestore
      try {
        const { firestore } = initializeFirebaseOnServer();
        const collectionName = foundShipment.Direction === 'Inbound' ? 'inbounds' : 'shipments';
        const docRef = firestore.collection(`artifacts/${appId}/public/data/${collectionName}`).doc(foundShipment['Shipment ID']);
        
        const dataToSave = {
            ...foundShipment,
            updatedAt: new Date(),
        };

        await docRef.set(dataToSave, { merge: true });
        console.log(`Saved ${foundShipment.Direction.toLowerCase()} ${foundShipment['Shipment ID']} to Firestore.`);

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

// Helper to map API response to our Shipment type
function mapParcelninjaToShipment(data: any, direction: 'Outbound' | 'Inbound', storeName: string): Shipment | Inbound {
  const status = data.status ? (data.status.description || 'Unknown') : 'Unknown';
  
  const baseRecord = {
    id: String(data.clientId || data.id),
    'Direction': direction,
    'Shipment ID': String(data.clientId || data.id),
    'Source Store': storeName,
    'Source Store Order ID': data.clientId || '',
    'Order Date': data.createDate || new Date().toISOString(), // Fallback
    'Customer Name': data.deliveryInfo?.customer || data.deliveryInfo?.contactName || '',
    'Status': status,
    'Tracking No': data.deliveryInfo?.trackingNo || data.deliveryInfo?.waybillNumber || '',
    'Courier': data.deliveryInfo?.courierName || '',
    'Tracking Link': data.deliveryInfo?.trackingUrl || data.deliveryInfo?.trackingURL || '',
    'Status Date': data.status?.timeStamp ? new Date(data.status.timeStamp).toISOString() : new Date().toISOString(),
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

  if (direction === 'Inbound') {
    return baseRecord as Inbound;
  }
  return baseRecord as Shipment;
}
