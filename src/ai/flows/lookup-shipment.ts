
'use server';

/**
 * @fileOverview A Genkit flow to look up shipment details.
 * It now implements a "local-first" search strategy.
 * 1. It first queries the local Firestore database for a quick result.
 * 2. If not found locally, it performs a comprehensive live search across all configured Parcelninja stores.
 * 3. It prioritizes the live search based on the first letter of the search term.
 * 4. It also looks for related inbound shipments for any found outbound record.
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
  prefix: string;
};

const credentialsList: WarehouseCredentials[] = [
    { name: 'DIESEL', apiUsername: process.env.DIESEL_WAREHOUSE_API_USERNAME, apiPassword: process.env.DIESEL_WAREHOUSE_API_PASSWORD, prefix: 'D' },
    { name: 'HURLEY', apiUsername: process.env.HURLEY_WAREHOUSE_API_USERNAME, apiPassword: process.env.HURLEY_WAREHOUSE_API_PASSWORD, prefix: 'H' },
    { name: 'JEEP', apiUsername: process.env.JEEP_APPAREL_WAREHOUSE_API_USERNAME, apiPassword: process.env.JEEP_APPAREL_WAREHOUSE_API_PASSWORD, prefix: 'J' },
    { name: 'SUPERDRY', apiUsername: process.env.SUPERDRY_WAREHOUSE_API_USERNAME, apiPassword: process.env.SUPERDRY_WAREHOUSE_API_PASSWORD, prefix: 'S' },
    { name: 'REEBOK', apiUsername: process.env.REEBOK_WAREHOUSE_API_USERNAME, apiPassword: process.env.REEBOK_WAREHOUSE_API_PASSWORD, prefix: 'R' },
];

const WAREHOUSE_API_BASE_URL = 'https://storeapi.parcelninja.com/api/v1';

async function fetchFromParcelNinja(url: string, storeName: string, creds: WarehouseCredentials, extraHeaders = {}) {
    if (!creds.apiUsername || !creds.apiPassword) {
        console.warn(`[${storeName}] Skipping API call: Missing credentials.`);
        return null;
    }
    const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString('base64');
    const headers = { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/json', ...extraHeaders };

    try {
        const response = await fetch(url, { method: 'GET', headers });
        if (response.ok) {
            const data = await response.json();
            return data;
        } else if (response.status !== 404) {
            const errorText = await response.text();
            console.error(`[${storeName}] API Error for ${url} (${response.status}): ${errorText}`);
        }
    } catch (err: any) {
        console.error(`[${storeName}] Network error for ${url}:`, err.message);
    }
    return null;
}

const lookupShipmentFlow = ai.defineFlow(
  {
    name: 'lookupShipmentFlow',
    inputSchema: DynamicLookupInputSchema,
    outputSchema: LookupShipmentOutputSchema,
  },
  async ({ searchTerm }) => {
    
    // --- Pass 1: Search Local Cache (Firestore) ---
    console.log(`Starting Pass 1 (Local Cache Search) for "${searchTerm}"...`);
    let foundRecord = await searchFirestoreCache(searchTerm);
    
    if (foundRecord) {
        console.log(`Record found in local cache.`);
        // Even if found locally, we might need to find its related inbound record
        let relatedInbound = null;
        if (foundRecord.Direction === 'Outbound') {
             const numericId = foundRecord['Shipment ID'].replace(/\D/g, '');
             if(numericId) {
                const returnId = `RET-${numericId}`;
                console.log(`Outbound found, searching for related inbound: ${returnId}`);
                // Search for the related inbound, starting with local cache
                relatedInbound = await searchFirestoreCache(returnId);
                if(!relatedInbound){
                     // If not in cache, try live API
                     relatedInbound = (await performLiveSearch(returnId, new Date('2014-01-01'), new Date('2030-01-01'))) as Inbound | null;
                     if(relatedInbound) await saveRecordToFirestore(relatedInbound);
                }
             }
        }
        return { shipment: foundRecord, relatedInbound };
    }


    // --- Pass 2: Live API Search (if not in cache) ---
    console.log(`Not found in local cache. Starting Pass 2 (Live API Search) for "${searchTerm}"...`);
    const toDateRecent = new Date('2025-12-29');
    const fromDateRecent = new Date(toDateRecent);
    fromDateRecent.setDate(toDateRecent.getDate() - 90);
    foundRecord = await performLiveSearch(searchTerm, fromDateRecent, toDateRecent);

    // --- Pass 3: Historical Live Search (if not found in recent) ---
    if (!foundRecord) {
        console.log(`Not found in recent data. Starting Pass 3 (Historical Live Search) for "${searchTerm}"...`);
        const fromDateHistorical = new Date('2014-01-01');
        const toDateHistorical = new Date('2030-01-01');
        foundRecord = await performLiveSearch(searchTerm, fromDateHistorical, toDateHistorical);
    }
    
    let relatedInbound: Inbound | null = null;
    if (foundRecord) {
      console.log(`Live search successful. Found record in ${foundRecord['Source Store']}.`);
      await saveRecordToFirestore(foundRecord);

      // If it's an outbound shipment, look for a related inbound return
      if (foundRecord.Direction === 'Outbound') {
          const numericId = foundRecord['Shipment ID'].replace(/\D/g, '');
          if (numericId) {
              const returnId = `RET-${numericId}`;
              console.log(`Outbound found, searching for related inbound: ${returnId}`);
              relatedInbound = (await performLiveSearch(returnId, new Date('2014-01-01'), new Date('2030-01-01'))) as Inbound | null;
              if (relatedInbound) {
                console.log(`Found related inbound: ${relatedInbound['Shipment ID']}`);
                await saveRecordToFirestore(relatedInbound);
              }
          }
      }

      return { shipment: foundRecord, relatedInbound: relatedInbound };
    }

    return {
      shipment: null,
      relatedInbound: null,
      error: 'Record not found in any configured warehouse store or local cache.',
    };
  }
);


/**
 * Performs the actual live search logic for a given date range.
 */
async function performLiveSearch(searchTerm: string, fromDate: Date, toDate: Date): Promise<Shipment | Inbound | null> {
    const searchPrefix = searchTerm.charAt(0).toUpperCase();
    const sortedCreds = [...credentialsList].sort((a, b) => {
        if (a.prefix === searchPrefix) return -1;
        if (b.prefix === searchPrefix) return 1;
        return 0;
    });

    const startDate = format(fromDate, 'yyyyMMdd');
    const endDate = format(toDate, 'yyyyMMdd');

    for (const creds of sortedCreds) {
        console.log(`[${creds.name}] Live searching for "${searchTerm}" between ${startDate} and ${endDate}...`);
        
        // 1. Exact ID lookup for Outbounds
        let data = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/0`, creds.name, creds, { 'X-Client-Id': searchTerm });
        if (data && data.id) return mapParcelninjaToShipment(data, 'Outbound', creds.name);

        // 2. Exact ID lookup for Inbounds
        data = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/inbounds/0`, creds.name, creds, { 'X-Client-Id': searchTerm });
        if (data && data.id) return mapParcelninjaToShipment(data, 'Inbound', creds.name);
        
        // 3. General search for Outbounds
        const outboundSearchUrl = `${WAREHOUSE_API_BASE_URL}/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1&page=1&search=${encodeURIComponent(searchTerm)}`;
        data = await fetchFromParcelNinja(outboundSearchUrl, creds.name, creds);
        if (data && data.outbounds && data.outbounds.length > 0) {
            const detailUrl = `${WAREHOUSE_API_BASE_URL}/outbounds/${data.outbounds[0].id}/events`;
            const fullRecord = await fetchFromParcelNinja(detailUrl, creds.name, creds);
            if (fullRecord && fullRecord.id) return mapParcelninjaToShipment(fullRecord, 'Outbound', creds.name);
        }
        
        // 4. General search for Inbounds
        const inboundSearchUrl = `${WAREHOUSE_API_BASE_URL}/inbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1&page=1&search=${encodeURIComponent(searchTerm)}`;
        data = await fetchFromParcelNinja(inboundSearchUrl, creds.name, creds);
        if (data && data.inbounds && data.inbounds.length > 0) {
            const detailUrl = `${WAREHOUSE_API_BASE_URL}/inbounds/${data.inbounds[0].id}/events`;
            const fullRecord = await fetchFromParcelNinja(detailUrl, creds.name, creds);
            if (fullRecord && fullRecord.id) return mapParcelninjaToShipment(fullRecord, 'Inbound', creds.name);
        }
    }
    return null;
}

/**
 * Saves the found record to the correct Firestore collection.
 */
async function saveRecordToFirestore(record: Shipment | Inbound) {
  try {
    const { firestore } = initializeFirebaseOnServer();
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
    const collectionName = record.Direction === 'Inbound' ? 'inbounds' : 'shipments';
    const docId = String(record.id);
    const docRef = firestore.collection(`artifacts/${appId}/public/data/${collectionName}`).doc(docId);
    
    const dataToSave = { ...record, updatedAt: new Date().toISOString() };
    await docRef.set(dataToSave, { merge: true });
    console.log(`Saved/Updated record ${docId} in Firestore at path: ${docRef.path}.`);
  } catch (dbError) {
    console.error("Failed to save API-found record to Firestore:", dbError);
  }
}

/**
 * Searches the Firestore cache for a matching record.
 */
async function searchFirestoreCache(searchTerm: string): Promise<Shipment | Inbound | null> {
    const { firestore } = initializeFirebaseOnServer();
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';

    const shipmentsRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);
    const inboundsRef = firestore.collection(`artifacts/${appId}/public/data/inbounds`);

    // Try to get by document ID first
    const shipmentSnap = await shipmentsRef.doc(searchTerm).get();
    if(shipmentSnap.exists) return { id: shipmentSnap.id, ...shipmentSnap.data() } as Shipment;

    const inboundSnap = await inboundsRef.doc(searchTerm).get();
    if(inboundSnap.exists) return { id: inboundSnap.id, ...inboundSnap.data() } as Inbound;
    
    // Fallback to querying fields if not found by ID
    const fieldsToSearch = ['Source Store Order ID', 'Channel ID', 'Customer Name', 'Tracking No'];
    for (const field of fieldsToSearch) {
        const shipmentQuery = shipmentsRef.where(field, '==', searchTerm).limit(1);
        const shipmentQuerySnap = await shipmentQuery.get();
        if(!shipmentQuerySnap.empty) {
            const doc = shipmentQuerySnap.docs[0];
            return { id: doc.id, ...doc.data() } as Shipment;
        }

        const inboundQuery = inboundsRef.where(field, '==', searchTerm).limit(1);
        const inboundQuerySnap = await inboundQuery.get();
        if(!inboundQuerySnap.empty) {
            const doc = inboundQuerySnap.docs[0];
            return { id: doc.id, ...doc.data() } as Inbound;
        }
    }

    return null;
}

function mapParcelninjaToShipment(data: any, direction: 'Outbound' | 'Inbound', storeName: string): Shipment | Inbound {
    const latestEvent = Array.isArray(data.events) && data.events.length > 0 
        ? data.events.reduce((latest: any, current: any) => {
            const latestTime = latest.timeStamp ? parseInt(latest.timeStamp, 10) : 0;
            const currentTime = current.timeStamp ? parseInt(current.timeStamp, 10) : 0;
            return currentTime > latestTime ? current : latest;
        })
        : data.status;

    const status = latestEvent?.description || 'Unknown';
    const statusDate = latestEvent?.timeStamp ? formatApiDate(latestEvent.timeStamp) : new Date().toISOString();
  
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
    'Status Date': statusDate,
    'Address Line 1': data.deliveryInfo?.addressLine1 || '',
    'Address Line 2': data.deliveryInfo?.addressLine2 || '',
    'City': data.deliveryInfo?.suburb || '',
    'Pin Code': data.deliveryInfo?.postalCode || '',
    'items': data.items ? data.items.map((item: any) => ({
        'SKU': item.itemNo,
        'Quantity': item.qty,
        'Item Name': item.name,
    })) : [],
  };

  const finalRecord = { ...baseRecord, id: baseRecord['Shipment ID'] };
  return finalRecord;
}

function formatApiDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return new Date().toISOString();
  try {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    if (dateStr.length >= 14) {
      const hour = parseInt(dateStr.substring(8, 10), 10);
      const minute = parseInt(dateStr.substring(10, 12), 10);
      const second = parseInt(dateStr.substring(12, 14), 10);
      return new Date(Date.UTC(year, month, day, hour, minute, second)).toISOString();
    }
    return new Date(Date.UTC(year, month, day)).toISOString();
  } catch (e) {
    return new Date().toISOString();
  }
}

    
    