
'use server';

/**
 * @fileOverview A Genkit flow to sync recent inbound and outbound shipments from the Parcelninja API.
 * It fetches records updated in the last X days, compares them with Firestore,
 * and either updates existing records or creates new ones.
 */
import { config } from 'dotenv';
config();

import { ai } from '@/ai/genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { z } from 'zod';
import { format } from 'date-fns';
import type { Inbound, Shipment } from '@/types';
import { STORES, type Store } from '@/lib/stores';

// --- INPUT/OUTPUT SCHEMAS ---

const SyncInputSchema = z.object({
  days: z.number().describe('The number of days back to check for updated shipments.'),
  fromDate: z.string().optional().describe('The start date for the sync in ISO format.'),
  toDate: z.string().optional().describe('The end date for the sync in ISO format.'),
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

// --- THE GENKIT FLOW ---

const syncRecentShipmentsFlow = ai.defineFlow(
  {
    name: 'syncRecentShipmentsFlow',
    inputSchema: SyncInputSchema,
    outputSchema: SyncOutputSchema,
  },
  async ({ days, fromDate, toDate }) => {
    const { firestore } = initializeFirebaseOnServer();
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
    const shipmentsColRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);
    const inboundsColRef = firestore.collection(`artifacts/${appId}/public/data/inbounds`);

    let totalCreated = 0;
    let totalUpdated = 0;
    const errorMessages: string[] = [];

    const dateTo = toDate ? new Date(toDate) : new Date();
    const dateFrom = fromDate ? new Date(fromDate) : new Date(dateTo.getTime() - days * 24 * 60 * 60 * 1000);
    
    const toDateStr = format(dateTo, 'yyyyMMdd');
    const fromDateStr = format(dateFrom, 'yyyyMMdd');
    
    console.log(`[Sync Flow] Starting sync from ${fromDateStr} to ${toDateStr}.`);

    for (const creds of STORES) {
        if (!creds.apiKey || !creds.apiSecret) {
            const errorMsg = `Skipping sync for ${creds.name}: Missing credentials.`;
            console.warn(errorMsg);
            continue;
        }

        try {
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
  const statusDate = data.status?.timeStamp ? formatApiDate(data.status.timeStamp) : new Date().toISOString();
  
  const formattedStatusDate = format(new Date(statusDate), 'yyyy-MM-dd HH:mm');
  const statusWithDate = `${status} as at ${formattedStatusDate}`;

  const baseRecord = {
    'Direction': direction,
    'Shipment ID': String(data.clientId || data.id),
    'Source Store': storeName,
    'Source Store Order ID': String(data.clientId || ''),
    'Channel ID': direction === 'Outbound' ? data.channelId : undefined,
    'Order Date': data.createDate ? formatApiDate(data.createDate) : new Date().toISOString(),
    'Customer Name': data.deliveryInfo?.customer || data.deliveryInfo?.contactName || '',
    'Email': data.deliveryInfo?.email || '',
    'Status': statusWithDate,
    'Tracking No': data.deliveryInfo?.trackingNo || data.deliveryInfo?.waybillNumber || '',
    'Courier': data.deliveryInfo?.courierName || storeName,
    'Tracking Link': data.deliveryInfo?.trackingUrl || data.deliveryInfo?.trackingURL || '',
    'Status Date': statusDate,
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
    // If we have time components, use them
    if (dateStr.length >= 14) {
         const hour = parseInt(dateStr.substring(8, 10), 10);
         const minute = parseInt(dateStr.substring(10, 12), 10);
         const second = parseInt(dateStr.substring(12, 14), 10);
         return new Date(year, month, day, hour, minute, second).toISOString();
    }
    return new Date(year, month, day).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}

async function processEndpoint(creds: Store, endpoint: 'inbounds' | 'outbounds', collectionRef: FirebaseFirestore.CollectionReference, fromDate: string, toDate: string) {
    let created = 0;
    let updated = 0;
    let error: string | null = null;
    const direction = endpoint === 'inbounds' ? 'Inbound' : 'Outbound';
    
    try {
        const apiRecords = await fetchFromParcelNinja(creds, endpoint, fromDate, toDate);
        const records = apiRecords[endpoint] || [];

        if (!records || records.length === 0) {
            console.log(`[${creds.name}/${direction}] No records found for the period.`);
            return { created, updated, error };
        }
        
        console.log(`[${creds.name}/${direction}] Found ${records.length} records. Processing...`);

        const updates = records.map(async (record: any) => {
            const mappedRecord = mapParcelninjaToRecord(record, direction, creds.name);
            const docId = mappedRecord.id;

            if (!docId) return;

            const docRef = collectionRef.doc(docId);
            const docSnap = await docRef.get();
            

            if (docSnap.exists) {
                await docRef.set(mappedRecord, { merge: true });
                updated++;
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


async function fetchFromParcelNinja(creds: Store, endpoint: 'inbounds' | 'outbounds', fromDate: string, toDate: string) {
    const WAREHOUSE_API_BASE_URL = 'https://storeapi.parcelninja.com/api/v1';
    const url = `${WAREHOUSE_API_BASE_URL}/${endpoint}/?startDate=${fromDate}&endDate=${toDate}&pageSize=1000`;
    const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
    
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
