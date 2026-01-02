
'use server';
import { config } from 'dotenv';
config();

/**
 * @fileOverview A Genkit flow to look up shipment details.
 * This is now a streaming flow that yields logs and the final result.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import {
  type Shipment,
  LookupShipmentInputSchema,
  LookupShipmentStreamChunkSchema,
  type Inbound,
} from '@/types';
import { format } from 'date-fns';
import { STORES, type Store } from '@/lib/stores';
import type { firestore as adminFirestore } from 'firebase-admin';

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

export const lookupShipmentFlow = ai.defineFlow(
  {
    name: 'lookupShipmentFlow',
    inputSchema: LookupShipmentInputSchema,
    outputSchema: LookupShipmentStreamChunkSchema,
    stream: true,
  },
  async function* ({ sourceStoreOrderId, storeName, direction = 'all', abortSignal }) {
    const searchTerm = sourceStoreOrderId;
    
    yield { log: `Starting Pass 1 (Local Firestore Search) for "${searchTerm}"...`};
    let foundRecord: Shipment | Inbound | null = null;
    try {
      foundRecord = await searchFirestoreDatabase(searchTerm, direction);
    } catch (e: any) {
        console.error("Firestore search error:", e);
        yield { result: { shipment: null, relatedInbound: null, error: `Local database search failed: ${e.message}` } };
        return;
    }
    
    if (foundRecord) {
        yield { log: `Record found in local Firestore database.`};
        let relatedInbound: Inbound | null = null;
        if (foundRecord.Direction === 'Outbound') {
             const numericId = (foundRecord['Shipment ID'] as string).replace(/\D/g, '');
             if(numericId) {
                const returnId = `RET-${numericId}`;
                yield { log: `Outbound found, searching for related inbound: ${returnId}`};
                relatedInbound = await searchFirestoreDatabase(returnId, 'inbound');
                if(!relatedInbound){
                     const { record: liveRelated, logs: liveLogs } = await performLiveSearch(returnId, new Date('2014-01-01'), new Date('2030-01-01'), undefined, 'inbound', abortSignal);
                     for (const log of liveLogs) yield { log };
                     relatedInbound = liveRelated as Inbound | null;

                     if(relatedInbound) await saveRecordToFirestore(relatedInbound);
                }
             }
        }
        
        yield { result: { shipment: foundRecord, relatedInbound } };
        return;
    }

    yield { log: `Not found in local Firestore. Starting Pass 2 (Live API Search)...`};
    const toDateRecent = new Date();
    const fromDateRecent = new Date(toDateRecent);
    fromDateRecent.setDate(toDateRecent.getDate() - 90);

    const { record: recentRecord, logs: recentLogs } = await performLiveSearch(searchTerm, fromDateRecent, toDateRecent, storeName, direction, abortSignal);
    for (const log of recentLogs) yield { log };
    foundRecord = recentRecord;


    if (!foundRecord) {
        yield { log: `Not found in recent data. Starting Pass 3 (Historical Live Search)...`};
        const fromDateHistorical = new Date('2014-01-01');
        const toDateHistorical = new Date('2030-01-01');
        const { record: historicalRecord, logs: historicalLogs } = await performLiveSearch(searchTerm, fromDateHistorical, toDateHistorical, storeName, direction, abortSignal);
        for (const log of historicalLogs) yield { log };
        foundRecord = historicalRecord;
    }
    
    let relatedInbound: Inbound | null = null;
    if (foundRecord) {
      yield { log: `Live search successful. Found record in ${foundRecord['Source Store']}.`};
      await saveRecordToFirestore(foundRecord);

      if (foundRecord.Direction === 'Outbound') {
          const numericId = (foundRecord['Shipment ID'] as string).replace(/\D/g, '');
          if (numericId) {
              const returnId = `RET-${numericId}`;
              yield { log: `Outbound found, searching for related inbound: ${returnId}`};
              const { record: liveRelated, logs: liveLogs } = await performLiveSearch(returnId, new Date('2014-01-01'), new Date('2030-01-01'), undefined, 'inbound', abortSignal);
              for (const log of liveLogs) yield { log };
              relatedInbound = liveRelated as Inbound | null;
              
              if (relatedInbound) {
                yield { log: `Found related inbound: ${relatedInbound['Shipment ID']}`};
                await saveRecordToFirestore(relatedInbound);
              }
          }
      }
      
      yield { result: { shipment: foundRecord, relatedInbound: relatedInbound } };
      return;
    }

    // Explicitly yield failure if nothing found
    yield { result: { shipment: null, relatedInbound: null, error: `Record not found in ${storeName || 'any configured'} warehouse store or local database.` } };
  }
);


/**
 * Performs the actual live search logic for a given date range.
 */
async function performLiveSearch(searchTerm: string, fromDate: Date, toDate: Date, storeName: string | undefined, direction: 'all' | 'inbound' | 'outbound', signal: AbortSignal | undefined): Promise<{ record: Shipment | Inbound | null; logs: string[] }> {
    
    const logs: string[] = [];

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
        logs.push(`[${creds.name}] Searching for "${searchTerm}"...`);
        
        if (direction === 'all' || direction === 'outbound') {
            logs.push(`[${creds.name}] Checking Outbounds by Client ID...`);
            let data = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/0`, creds.name, creds, signal, { 'X-Client-Id': searchTerm });
            if (data && data.id) return { record: mapParcelninjaToShipment(data, 'Outbound', creds.name), logs };

            logs.push(`[${creds.name}] Checking Outbounds by Search/Channel ID...`);
            const outboundSearchUrl = `${WAREHOUSE_API_BASE_URL}/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1&page=1&search=${encodeURIComponent(searchTerm)}&channelId=${encodeURIComponent(searchTerm)}`;
            data = await fetchFromParcelNinja(outboundSearchUrl, creds.name, creds, signal);
            if (data && data.outbounds && data.outbounds.length > 0) {
                const detailUrl = `${WAREHOUSE_API_BASE_URL}/outbounds/${data.outbounds[0].id}/events`;
                logs.push(`[${creds.name}] Found summary, fetching details from ${detailUrl}`);
                const fullRecord = await fetchFromParcelNinja(detailUrl, creds.name, creds, signal);
                if (fullRecord && fullRecord.id) return { record: mapParcelninjaToShipment(fullRecord, 'Outbound', creds.name), logs };
            }
        }
        
        if (direction === 'all' || direction === 'inbound') {
            logs.push(`[${creds.name}] Checking Inbounds by Client ID...`);
            let data = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/inbounds/0`, creds.name, creds, signal, { 'X-Client-Id': searchTerm });
            if (data && data.id) return { record: mapParcelninjaToShipment(data, 'Inbound', creds.name), logs };

            logs.push(`[${creds.name}] Checking Inbounds by Search...`);
            const inboundSearchUrl = `${WAREHOUSE_API_BASE_URL}/inbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=1&page=1&search=${encodeURIComponent(searchTerm)}`;
            data = await fetchFromParcelNinja(inboundSearchUrl, creds.name, creds, signal);
            if (data && data.inbounds && data.inbounds.length > 0) {
                const detailUrl = `${WAREHOUSE_API_BASE_URL}/inbounds/${data.inbounds[0].id}/events`;
                 logs.push(`[${creds.name}] Found summary, fetching details from ${detailUrl}`);
                const fullRecord = await fetchFromParcelNinja(detailUrl, creds.name, creds, signal);
                if (fullRecord && fullRecord.id) return { record: mapParcelninjaToShipment(fullRecord, 'Inbound', creds.name), logs };
            }
        }
    }
    return { record: null, logs };
}


async function saveRecordToFirestore(record: Shipment | Inbound) {
  try {
    const { firestore } = initializeFirebaseOnServer();
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
    const collectionName = record.Direction === 'Inbound' ? 'inbounds' : 'shipments';
    const docId = String(record.id);
    
    // Use Firestore methods from the admin SDK (Firestore instance)
    const docRef = firestore.collection(`artifacts/${appId}/public/data/${collectionName}`).doc(docId);
    
    const dataToSave = { ...record, updatedAt: new Date().toISOString() };
    await docRef.set(dataToSave, { merge: true });
    
    console.log(`Saved/Updated record ${docId} in Firestore at path: ${docRef.path}.`);
  } catch (dbError: any) {
    console.error("Failed to save API-found record to Firestore:", dbError);
  }
}

const toISOStringIfTimestamp = (value: any): string | any => {
  if (value && typeof value === 'object' && value.hasOwnProperty('_seconds')) {
    // This is a Firestore Timestamp
    return new Date(value._seconds * 1000).toISOString();
  }
  return value;
};


async function searchFirestoreDatabase(searchTerm: string, direction: 'all' | 'inbound' | 'outbound'): Promise<Shipment | Inbound | null> {
    try {
        const { firestore } = initializeFirebaseOnServer();
        const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';

        const shipmentsRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);
        const inboundsRef = firestore.collection(`artifacts/${appId}/public/data/inbounds`);

        const fieldsToSearch = ['Source Store Order ID', 'Customer Name', 'Tracking No', 'Channel ID'];

        const searchCollection = async (ref: adminFirestore.CollectionReference) => {
            // Try to get by document ID first
            const docRef = ref.doc(searchTerm);
            const snap = await docRef.get();
            if(snap.exists) {
                let data = snap.data();
                if (!data) return null;
                // Convert Timestamps to ISO strings
                data['Order Date'] = toISOStringIfTimestamp(data['Order Date']);
                data['Status Date'] = toISOStringIfTimestamp(data['Status Date']);
                data['updatedAt'] = toISOStringIfTimestamp(data['updatedAt']);
                return { id: snap.id, ...data };
            }

            // Fallback to querying fields
            for (const field of fieldsToSearch) {
                const query = ref.where(field, '==', searchTerm);
                const querySnap = await query.get();
                if(!querySnap.empty) {
                    const doc = querySnap.docs[0];
                    let data = doc.data();
                    if (!data) return null;
                     // Convert Timestamps to ISO strings
                    data['Order Date'] = toISOStringIfTimestamp(data['Order Date']);
                    data['Status Date'] = toISOStringIfTimestamp(data['Status Date']);
                    data['updatedAt'] = toISOStringIfTimestamp(data['updatedAt']);
                    return { id: doc.id, ...data };
                }
            }
            return null;
        }
        
        let result: any | null = null;
        if (direction === 'all' || direction === 'outbound') {
            result = await searchCollection(shipmentsRef);
        }
        
        if (!result && (direction === 'all' || direction === 'inbound')) {
            result = await searchCollection(inboundsRef);
        }
        
        return result ? result : null;
        
    } catch(e: any) {
        console.error("CRITICAL: Firestore search failed with error:", e);
        throw new Error("Could not connect to the local database. " + (e.message || ""));
    }
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
  
    const parseApiDate = (dateStr: string | undefined): string => {
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
    };

    const baseRecord = {
        'Direction': direction,
        'Shipment ID': String(data.clientId || data.id),
        'Source Store': storeName,
        'Source Store Order ID': String(data.clientId || ''),
        'Channel ID': direction === 'Outbound' ? data.channelId : undefined,
        'Order Date': parseApiDate(data.createDate),
        'Customer Name': data.deliveryInfo?.customer || data.deliveryInfo?.contactName || '',
        'Email': data.deliveryInfo?.email || '',
        'Status': status,
        'Tracking No': data.deliveryInfo?.trackingNo || data.deliveryInfo?.waybillNumber || '',
        'Courier': data.deliveryInfo?.courierName || storeName,
        'Tracking Link': data.deliveryInfo?.trackingUrl || data.deliveryInfo?.trackingURL || '',
        'Status Date': parseApiDate(latestEvent?.timeStamp),
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

    