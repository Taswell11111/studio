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

    let foundShipment: Shipment | null = null;

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
        const outboundUrl = `https://storeapi.parcelninja.com/api/v1/outbounds/0`;
        const outboundResponse = await fetch(outboundUrl, { method: 'GET', headers });

        if (outboundResponse.ok) {
          const data = await outboundResponse.json();
          // Verify we got a valid object (checking for a key field like 'id' or 'typeId')
          if (data && data.id) {
            foundShipment = mapParcelninjaToShipment(data, 'Outbound', creds.name);
            break; // Found it!
          }
        }

        // --- Try Inbound Lookup ---
        const inboundUrl = `https://storeapi.parcelninja.com/api/v1/inbounds/0`;
        const inboundResponse = await fetch(inboundUrl, { method: 'GET', headers });

        if (inboundResponse.ok) {
          const data = await inboundResponse.json();
          if (data && data.id) {
            foundShipment = mapParcelninjaToShipment(data, 'Inbound', creds.name);
            break; // Found it!
          }
        }

      } catch (err: any) {
        console.error(`Error checking store ${creds.name}:`, err);
        // Continue to next store
      }
    }

    if (foundShipment) {
      // 3. Save found shipment to Firestore
      try {
        const { firestore } = initializeFirebaseOnServer();
        const docRef = firestore.collection('shipments').doc(foundShipment.id);
        
        // Add timestamps
        const dataToSave = {
            ...foundShipment,
            updatedAt: new Date(),
        };

        // We use set with merge true to update existing or create new
        await docRef.set(dataToSave, { merge: true });
        console.log(`Saved shipment ${foundShipment.id} to Firestore.`);

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
function mapParcelninjaToShipment(data: any, direction: 'Outbound' | 'Inbound', storeName: string): Shipment {
  // Extract tracking number
  let trackingNo = '';
  if (data.deliveryInfo && data.deliveryInfo.waybillNumber) {
    trackingNo = data.deliveryInfo.waybillNumber;
  }
  
  // Extract status
  let status = 'Unknown';
  if (data.status) {
      status = typeof data.status === 'string' ? data.status : (data.status.description || 'Unknown');
  }

  return {
    id: String(data.id),
    'Direction': direction,
    'Shipment ID': String(data.id),
    'Source Store': storeName,
    'Source Store Order ID': data.clientId || '',
    'Order Date': data.createDate || new Date().toISOString(), // Fallback
    'Customer Name': data.deliveryInfo?.customer || data.deliveryInfo?.contactName || '',
    'Status': status,
    'Tracking No': trackingNo,
    'Courier': data.deliveryInfo?.courierName || '',
    'Tracking Link': data.deliveryInfo?.trackingURL || '',
    'Status Date': new Date().toISOString(),
    // Add other fields as necessary
    'Address Line 1': data.deliveryInfo?.addressLine1 || '',
    'Address Line 2': data.deliveryInfo?.addressLine2 || '',
    'City': data.deliveryInfo?.suburb || '',
    'Pin Code': data.deliveryInfo?.postalCode || '',
    'items': data.items ? data.items.map((item: any) => ({
        'Item Name': item.name,
        'Quantity': item.qty,
    })) : [],
  };
}
