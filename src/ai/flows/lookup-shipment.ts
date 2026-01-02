
'use server';
import { config } from 'dotenv';
config();

/**
 * @fileOverview A Genkit flow to look up shipment details.
 * It now implements a "local-first" search strategy.
 * 1. It first queries the local Firestore database for a quick result.
 * 2. If not found locally, it performs a comprehensive live search across all configured Parcelninja stores.
 * 3. It prioritizes the live search based on the first letter of the search term.
 * 4. It also looks for related inbound shipments for any found outbound record.
 * 5. It allows filtering the search by direction (inbound/outbound).
 */

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
import { STORES, type Store } from '@/lib/stores';
import type { firestore as adminFirestore } from 'firebase-admin';


// Main exported function that the client will call
export async function lookupShipment(input: LookupShipmentInput): Promise<LookupShipmentOutput> {
  return lookupShipmentFlow(input);
}

const WAREHOUSE_API_BASE_URL = 'https://storeapi.parcelninja.com/api/v1';

async function fetchFromParcelNinja(url: string, storeName: string, creds: Store, signal: AbortSignal | undefined, extraHeaders = {}) {
    if (!creds.apiKey || !creds.apiSecret) {
        console.warn(`[${storeName}] Skipping API call: Missing credentials.`);
        return null;
    }
    const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
    const headers = { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/json', ...extraHeaders };

    try {
        const response = await fetch(url, { method: 'GET', headers, signal });
        if (response.ok) {
            const data = await response.json();
            return data;
        } else if (response.status !== 404) {
            const errorText = await response.text();
            console.error(`[${storeName}] API Error for ${url} (${response.status}): ${errorText}`);
        }
    } catch (err: any) {
        if (err.name === 'AbortError') {
            console.log(`[${storeName}] Fetch aborted for ${url}`);
            throw err; // Re-throw to be caught by the main handler
        }
        console.error(`[${storeName}] Network error for ${url}:`, err.message);
    }
    return null;
}

const lookupShipmentFlow = ai.defineFlow(
  {
    name: 'lookupShipmentFlow',
    inputSchema: LookupShipmentInputSchema,
    outputSchema: LookupShipmentOutputSchema,
  },
  async ({ sourceStoreOrderId, storeName, direction = 'all', abortSignal }) => {
    const searchTerm = sourceStoreOrderId;
    // --- Pass 1: Search Local Firestore Database ---
    console.log(`Starting Pass 1 (Local Firestore Search) for "${searchTerm}"...`);
    let foundRecord = await searchFirestoreDatabase(searchTerm, direction);
    
    if (foundRecord) {
        console.log(`Record found in local Firestore database.`);
        // Even if found locally, we might need to find its related inbound record
        let relatedInbound = null;
        if (foundRecord.Direction === 'Outbound') {
             const numericId = (foundRecord['Shipment ID'] as string).replace(/\D/g, '');
             if(numericId) {
                const returnId = `RET-${numericId}`;
                console.log(`Outbound found, searching for related inbound: ${returnId}`);
                // Search for the related inbound, starting with local database
                relatedInbound = await searchFirestoreDatabase(returnId, 'inbound');
                if(!relatedInbound){
                     // If not in database, try live API
                     relatedInbound = (await performLiveSearch(returnId, new Date('2014-01-01'), new Date('2030-01-01'), undefined, 'inbound', abortSignal)) as Inbound | null;
                     if(relatedInbound) await saveRecordToFirestore(relatedInbound);
                }
             }
        }
        return { shipment: foundRecord, relatedInbound };
    }


    // --- Pass 2: Live API Search (if not in database) ---
    console.log(`Not found in local Firestore. Starting Pass 2 (Live API Search) for "${searchTerm}"...`);
    const toDateRecent = new Date();
    const fromDateRecent = new Date(toDateRecent);
    fromDateRecent.setDate(toDateRecent.getDate() - 90);
    foundRecord = await performLiveSearch(searchTerm, fromDateRecent, toDateRecent, storeName, direction, abortSignal);

    // --- Pass 3: Historical Live Search (if not found in recent) ---
    if (!foundRecord) {
        console.log(`Not found in recent data. Starting Pass 3 (Historical Live Search) for "${searchTerm}"...`);
        const fromDateHistorical = new Date('2014-01-01');
        const toDateHistorical = new Date('2030-01-01');
        foundRecord = await performLiveSearch(searchTerm, fromDateHistorical, toDateHistorical, storeName, direction, abortSignal);
    }
    
    let relatedInbound: Inbound | null = null;
    if (foundRecord) {
      console.log(`Live search successful. Found record in ${foundRecord['Source Store']}.`);
      await saveRecordToFirestore(foundRecord);

      // If it's an outbound shipment, look for a related inbound return
      if (foundRecord.Direction === 'Outbound') {
          const numericId = (foundRecord['Shipment ID'] as string).replace(/\D/g, '');
          if (numericId) {
              const returnId = `RET-${numericId}`;
              console.log(`Outbound found, searching for related inbound: ${returnId}`);
              relatedInbound = (await performLiveSearch(returnId, new Date('2014-01-01'), new Date('2030-01-01'), undefined, 'inbound', abortSignal)) as Inbound | null;
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
      error: `Record not found in ${storeName || 'any configured'} warehouse store or local database.`,
    };
  }
);


/**
 * Performs the actual live search logic for a given date range.
 */
async function performLiveSearch(searchTerm: string, fromDate: Date, toDate: Date, storeName?: string, direction: 'all' | 'inbound' | 'outbound' = 'all', signal?: AbortSignal): Promise<Shipment | Inbound | null> {
    
    let storesToSearch = STORES;
    if (storeName && storeName !== 'All') {
        const specificStore = STORES.find(s => s.name === storeName);
        storesToSearch = specificStore ? [specificStore] : [];
    } else {
        const searchPrefix = searchTerm.charAt(0).toUpperCase();
        storesToSearch = [...STORES].sort((a, b) => {
            if (a.prefix === searchPrefix) return -1;
            if (b.prefix === searchPrefix) return 1;
            return 0;
        });
    }

    const startDate = format(fromDate, 'yyyyMMdd');
    const endDate = format(toDate, 'yyyyMMdd');

    for (const creds of storesToSearch) {
        console.log(`[${creds.name}] Live searching for "${searchTerm}" between ${startDate} and ${endDate}...`);
        
        // Search Outbounds
        if (direction === 'all' || direction === 'outbound') {
            // 1. Exact ID lookup for Outbounds
            let data = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/0`, creds.name, creds, signal, { 'X-Client-Id': searchTerm });
            if (data && data.id) return mapParcelninjaToShipment(data, 'Outbound', creds.name);

            // 2. General search for Outbounds (including by Channel ID)
            const outboundSearchUrl = `${WAREHOUSE_API_BASE_URL}/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1&page=1&search=${encodeURIComponent(searchTerm)}&channelId=${encodeURIComponent(searchTerm)}`;
            data = await fetchFromParcelNinja(outboundSearchUrl, creds.name, creds, signal);
            if (data && data.outbounds && data.outbounds.length > 0) {
                const detailUrl = `${WAREHOUSE_API_BASE_URL}/outbounds/${data.outbounds[0].id}/events`;
                const fullRecord = await fetchFromParcelNinja(detailUrl, creds.name, creds, signal);
                if (fullRecord && fullRecord.id) return mapParcelninjaToShipment(fullRecord, 'Outbound', creds.name);
            }
        }
        
        // Search Inbounds
        if (direction === 'all' || direction === 'inbound') {
            // 3. Exact ID lookup for Inbounds
            let data = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/inbounds/0`, creds.name, creds, signal, { 'X-Client-Id': searchTerm });
            if (data && data.id) return mapParcelninjaToShipment(data, 'Inbound', creds.name);

            // 4. General search for Inbounds
            const inboundSearchUrl = `${WAREHOUSE_API_BASE_URL}/inbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1&page=1&search=${encodeURIComponent(searchTerm)}`;
            data = await fetchFromParcelNinja(inboundSearchUrl, creds.name, creds, signal);
            if (data && data.inbounds && data.inbounds.length > 0) {
                const detailUrl = `${WAREHOUSE_API_BASE_URL}/inbounds/${data.inbounds[0].id}/events`;
                const fullRecord = await fetchFromParcelNinja(detailUrl, creds.name, creds, signal);
                if (fullRecord && fullRecord.id) return mapParcelninjaToShipment(fullRecord, 'Inbound', creds.name);
            }
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
  } catch (dbError: any) {
    console.error("Failed to save API-found record to Firestore:", dbError);
  }
}

/**
 * Searches the Firestore database for a matching record.
 */
async function searchFirestoreDatabase(searchTerm: string, direction: 'all' | 'inbound' | 'outbound'): Promise<Shipment | Inbound | null> {
    const { firestore } = initializeFirebaseOnServer();
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';

    const shipmentsRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);
    const inboundsRef = firestore.collection(`artifacts/${appId}/public/data/inbounds`);

    const fieldsToSearch = ['Source Store Order ID', 'Customer Name', 'Tracking No', 'Channel ID'];

    const searchCollection = async (ref: adminFirestore.CollectionReference) => {
        // Try to get by document ID first
        const docRef = ref.doc(searchTerm);
        const snap = await docRef.get();
        if(snap.exists) return { id: snap.id, ...snap.data() };

        // Fallback to querying fields
        for (const field of fieldsToSearch) {
            const query = ref.where(field, '==', searchTerm);
            const querySnap = await query.get();
            if(!querySnap.empty) {
                const doc = querySnap.docs[0];
                return { id: doc.id, ...doc.data() };
            }
        }
        return null;
    }

    if (direction === 'all' || direction === 'outbound') {
        const shipmentResult = await searchCollection(shipmentsRef);
        if (shipmentResult) return shipmentResult as Shipment;
    }
    
    if (direction === 'all' || direction === 'inbound') {
        const inboundResult = await searchCollection(inboundsRef);
        if (inboundResult) return inboundResult as Inbound;
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
