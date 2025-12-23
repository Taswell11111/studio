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
    
    const fromDateStr = format(dateTo, 'yyyy-MM-dd');
    const toDateStr = format(dateFrom, 'yyyy-MM-dd');

    for (const creds of credentialsMap) {
        if (!creds.apiUsername || !creds.apiPassword) {
            console.warn(`Skipping sync for ${creds.name}: Missing credentials.`);
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
            errorMessages.push(`[${creds.name}]: A critical error occurred: ${e.message}`);
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

async function processEndpoint(creds: WarehouseCredentials, endpoint: 'inbounds' | 'outbounds', collectionRef: FirebaseFirestore.CollectionReference, fromDate: string, toDate: string) {
    let created = 0;
    let updated = 0;
    let error: string | null = null;
    
    try {
        const records = await fetchFromParcelNinja(creds, endpoint, fromDate, toDate);

        if (!records || records.length === 0) {
            return { created, updated, error };
        }
        
        // Using Promise.all to process records in parallel
        await Promise.all(records.map(async (record: any) => {
            const docId = record.clientId || record.id; // Use clientId as the unique ID
            if (!docId) return;

            const docRef = collectionRef.doc(docId);
            const docSnap = await docRef.get();
            
            // Map API response to our Firestore schema
            const mappedRecord = {
                'id': docId,
                'Direction': endpoint === 'inbounds' ? 'Inbound' : 'Outbound',
                'Shipment ID': docId,
                'Source Store Order ID': record.clientId,
                'Order Date': record.timeStamp, // Assuming timeStamp is the order date
                'Status': record.statusDescription,
                'Status Date': new Date().toISOString(),
                'Courier': creds.name, // Assign brand as courier
                // Add other fields as necessary from the API response
            };

            if (docSnap.exists) {
                await docRef.update({ 
                    'Status': mappedRecord['Status'],
                    'Status Date': mappedRecord['Status Date'],
                });
                updated++;
            } else {
                await docRef.set(mappedRecord);
                created++;
            }
        }));

    } catch (e: any) {
        error = e.message;
    }
    
    return { created, updated, error };
}


async function fetchFromParcelNinja(creds: WarehouseCredentials, endpoint: 'inbounds' | 'outbounds', fromDate: string, toDate: string) {
    const url = `${WAREHOUSE_API_BASE_URL}/${endpoint}?fromDate=${fromDate}&toDate=${toDate}`;
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
