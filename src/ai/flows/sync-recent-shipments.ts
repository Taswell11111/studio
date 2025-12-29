'use server';

/**
 * @fileOverview A Genkit flow to sync recent inbound and outbound shipments from the Parcelninja API.
 * It fetches records updated in the last X days, compares them with Firestore,
 * and either updates existing records or creates new ones.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { z } from 'zod';
import { format } from 'date-fns';
import type { Inbound, Shipment, ShipmentItem } from '@/types';

// --- INPUT/OUTPUT SCHEMAS ---

const SyncInputSchema = z.object({
  days: z.number().describe('The number of days back to check for updated shipments.'),
});
type SyncInput = z.infer<typeof SyncInputSchema>;

const SyncOutputSchema = z.object({
  success: z.boolean(),
  recordsCreated: z.number(),
  recordsUpdated: z.number(),
  errors: z.array(z.string()),
  message: z.string(),
});
export type SyncOutput = z.infer<typeof SyncOutputSchema>;

export async function syncRecentShipments(input: SyncInput): Promise<SyncOutput> {
  return syncRecentShipmentsFlow(input);
}


// --- API CREDENTIALS & CONFIG ---

type WarehouseCredentials = {
  name: string;
  apiUsername?: string;
  apiPassword?: string;
};

const credentialsMap: WarehouseCredentials[] = [
    { name: 'DIESEL', apiUsername: process.env.DIESEL_WAREHOUSE_API_USERNAME, apiPassword: process.env.DIESEL_WAREHOUSE_API_PASSWORD },
    { name: 'HURLEY', apiUsername: process.env.HURLEY_WAREHOUSE_API_USERNAME, apiPassword: process.env.HURLEY_WAREHOUSE_API_PASSWORD },
    { name: 'JEEP', apiUsername: process.env.JEEP_APPAREL_WAREHOUSE_API_USERNAME, apiPassword: process.env.JEEP_APPAREL_WAREHOUSE_API_PASSWORD },
    { name: 'SUPERDRY', apiUsername: process.env.SUPERDRY_WAREHOUSE_API_USERNAME, apiPassword: process.env.SUPERDRY_WAREHOUSE_API_PASSWORD },
    { name: 'REEBOK', apiUsername: process.env.REEBOK_WAREHOUSE_API_USERNAME, apiPassword: process.env.REEBOK_WAREHOUSE_API_PASSWORD },
];

const WAREHOUSE_API_BASE_URL = 'https://storeapi.parcelninja.com/api/v1';


// --- THE GENKIT FLOW ---

const syncRecentShipmentsFlow = ai.defineFlow(
  {
    name: 'syncRecentShipmentsFlow',
    inputSchema: SyncInputSchema,
    outputSchema: SyncOutputSchema,
  },
  async ({ days }) => {
    const { firestore } = initializeFirebaseOnServer();
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
    const shipmentsColRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);
    const inboundsColRef = firestore.collection(`artifacts/${appId}/public/data/inbounds`);

    let totalCreated = 0;
    let totalUpdated = 0;
    const errorMessages: string[] = [];

    const dateTo = new Date();
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - days);
    
    // Correctly format dates as YYYYMMDD
    const toDateStr = format(dateTo, 'yyyyMMdd');
    const fromDateStr = format(dateFrom, 'yyyyMMdd');

    for (const creds of credentialsMap) {
        if (!creds.apiUsername || !creds.apiPassword) {
            const errorMsg = `Skipping sync for ${creds.name}: Missing credentials.`;
            console.warn(errorMsg);
            // Don't push this to errors unless we want to surface it to the user
            continue;
        }

        try {
            // Process both outbounds and inbounds for the current store
            const [outboundStats, inboundStats] = await Promise.all([
                processEndpoint(creds, 'outbounds', shipmentsColRef, fromDateStr, toDateStr),
                processEndpoint(creds, 'inbounds', inboundsColRef, fromDateStr, toDateStr)
            ]);

            totalCreated += outboundStats.created + inboundStats.created;
            totalUpdated += outboundStats.updated + inboundStats.updated;
            if(outboundStats.error) errorMessages.push(`[${creds.name} Outbounds]: ${outboundStats.error}`);
            if(inboundStats.error) errorMessages.push(`[${creds.name} Inbounds]: ${inboundStats.error}`);

        } catch(e: any) {
            const errorMsg = `[${creds.name}]: A critical error occurred during sync: ${e.message}`;
            console.error(errorMsg);
            errorMessages.push(errorMsg);
        }
    }

    const message = `Sync complete. Created: ${totalCreated}, Updated: ${totalUpdated}. Errors: ${errorMessages.length}.`;
    console.log(message);
    if(errorMessages.length > 0) console.error("Sync errors:", errorMessages);

    return {
      success: errorMessages.length === 0,
      recordsCreated: totalCreated,
      recordsUpdated: totalUpdated,
      errors: errorMessages,
      message: message,
    };
  }
);


// --- HELPER FUNCTIONS ---
function mapParcelninjaToRecord(data: any, direction: 'Outbound' | 'Inbound', storeName: string): Shipment | Inbound {
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

  return { ...baseRecord, id: baseRecord['Shipment ID'] };
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

async function processEndpoint(creds: WarehouseCredentials, endpoint: 'inbounds' | 'outbounds', collectionRef: FirebaseFirestore.CollectionReference, fromDate: string, toDate: string) {
    let created = 0;
    let updated = 0;
    let error: string | null = null;
    const direction = endpoint === 'inbounds' ? 'Inbound' : 'Outbound';
    
    try {
        const apiRecords = await fetchFromParcelNinja(creds, endpoint, fromDate, toDate);
        const records = apiRecords[endpoint] || [];

        if (!records || records.length === 0) {
            return { created, updated, error };
        }
        
        const updates = records.map(async (record: any) => {
            const docId = String(record.clientId || record.id);
            if (!docId) return;

            const docRef = collectionRef.doc(docId);
            const docSnap = await docRef.get();
            const mappedRecord = mapParcelninjaToRecord(record, direction, creds.name);

            if (docSnap.exists) {
                // Only update if status is different
                const existingData = docSnap.data();
                if (existingData?.Status !== mappedRecord.Status) {
                    await docRef.update({ 
                        'Status': mappedRecord.Status,
                        'Status Date': mappedRecord['Status Date'],
                    });
                    updated++;
                }
            } else {
                await docRef.set(mappedRecord);
                created++;
            }
        });
        
        await Promise.all(updates);

    } catch (e: any) {
        error = e.message;
        console.error(`Error processing ${direction} for ${creds.name}:`, e);
    }
    
    return { created, updated, error };
}


async function fetchFromParcelNinja(creds: WarehouseCredentials, endpoint: 'inbounds' | 'outbounds', fromDate: string, toDate: string) {
    const url = `${WAREHOUSE_API_BASE_URL}/${endpoint}/?startDate=${fromDate}&endDate=${toDate}&pageSize=1000`;
    const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString('base64');
    
    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${basicAuth}` }
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`API request failed for ${creds.name}/${endpoint} with status ${response.status}: ${errorBody}`);
    }
    return response.json();
}
