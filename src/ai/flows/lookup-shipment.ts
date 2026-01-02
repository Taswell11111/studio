'use server';
import { config } from 'dotenv';
import path from 'path';

// Explicitly load secrets.env if it exists
const secretsPath = path.resolve(process.cwd(), 'secrets.env');
config({ path: secretsPath });
config(); // Load standard .env

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
import { getStores, type Store } from '@/lib/stores';
import type { firestore as adminFirestore } from 'firebase-admin';

const WAREHOUSE_API_BASE_URL = 'https://storeapi.parcelninja.com/api/v1';

async function fetchFromParcelNinja(url: string, storeName: string, creds: Store, signal: AbortSignal | undefined, extraHeaders = {}) {
    if (!creds.apiKey || !creds.apiSecret) {
        console.warn(`[${storeName}] Skipping API call: Missing credentials.`);
        return null;
    }
    const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
    // Ensure we don't log the actual secret
    const maskedAuthHeader = `Basic ${basicAuth.substring(0, 10)}...`;
    
    const headers: Record<string, string> = { 
        'Authorization': `Basic ${basicAuth}`, 
        'Content-Type': 'application/json', 
        ...extraHeaders 
    };

    console.log(`[${storeName}] Fetching: ${url}`);
    console.log(`[${storeName}] Headers: ${JSON.stringify({ ...headers, 'Authorization': maskedAuthHeader })}`);

    try {
        const response = await fetch(url, { method: 'GET', headers, signal });
        console.log(`[${storeName}] Response Status: ${response.status}`);
        
        if (response.ok) {
            const data = await response.json();
            return data;
        } else if (response.status !== 404) {
            const errorText = await response.text();
            console.error(`[${storeName}] API Error for ${url} (${response.status}): ${errorText}`);
        } else {
            console.log(`[${storeName}] 404 Not Found for ${url}`);
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
  async function* ({ sourceStoreOrderId, searchBy = 'all', storeName, direction = 'all', abortSignal }) {
    const searchTerm = sourceStoreOrderId;
    
    yield { log: `Starting Pass 1 (Local Firestore Search) for "${searchTerm}" by ${searchBy}...`};
    let foundRecord: Shipment | Inbound | null = null;
    try {
      foundRecord = await searchFirestoreDatabase(searchTerm, searchBy, direction);
    } catch (e: any) {
        console.error("Firestore search error:", e);
        yield { log: `Local database search failed (${e.message}). Proceeding to live search...` };
        foundRecord = null;
    }
    
    if (foundRecord) {
        yield { log: `Record found in local Firestore database.`};
        let relatedInbound: Inbound | null = null;
        if (foundRecord.Direction === 'Outbound') {
             const numericId = (foundRecord['Shipment ID'] as string).replace(/\D/g, '');
             if(numericId) {
                const returnId = `RET-${numericId}`;
                yield { log: `Outbound found, searching for related inbound: ${returnId}`};
                try {
                  relatedInbound = await searchFirestoreDatabase(returnId, 'shipmentId', 'inbound');
                } catch (e: any) {
                   yield { log: `Local search for related inbound failed (${e.message}). Skipping local check.` };
                   relatedInbound = null;
                }
                
                if(!relatedInbound){
                     const { record: liveRelated, logs: liveLogs } = await performLiveSearch(returnId, 'shipmentId', new Date('2014-01-01'), new Date('2030-01-01'), undefined, 'inbound', abortSignal);
                     for (const log of liveLogs) yield { log };
                     relatedInbound = liveRelated as Inbound | null;

                     if(relatedInbound) await saveRecordToFirestore(relatedInbound);
                }
             }
        }
        
        const finalResult = { shipment: foundRecord, relatedInbound };
        yield { result: finalResult };
        return;
    }

    yield { log: `Not found in local Firestore. Starting Pass 2 (Live API Search)...`};
    const toDateRecent = new Date();
    const fromDateRecent = new Date(toDateRecent);
    fromDateRecent.setDate(toDateRecent.getDate() - 90);

    const { record: recentRecord, logs: recentLogs } = await performLiveSearch(searchTerm, searchBy, fromDateRecent, toDateRecent, storeName, direction, abortSignal);
    for (const log of recentLogs) yield { log };
    foundRecord = recentRecord;


    if (!foundRecord) {
        yield { log: `Not found in recent data. Starting Pass 3 (Historical Live Search)...`};
        const toDateHistorical = new Date(); 
        const fromDateHistorical = new Date(toDateHistorical);
        fromDateHistorical.setFullYear(toDateHistorical.getFullYear() - 7); 

        const { record: historicalRecord, logs: historicalLogs } = await performLiveSearch(searchTerm, searchBy, fromDateHistorical, toDateHistorical, storeName, direction, abortSignal);
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
              const { record: liveRelated, logs: liveLogs } = await performLiveSearch(returnId, 'shipmentId', new Date('2014-01-01'), new Date('2030-01-01'), undefined, 'inbound', abortSignal);
              for (const log of liveLogs) yield { log };
              relatedInbound = liveRelated as Inbound | null;
              
              if (relatedInbound) {
                yield { log: `Found related inbound: ${relatedInbound['Shipment ID']}`};
                await saveRecordToFirestore(relatedInbound);
              }
          }
      }
      
      const finalResult = { shipment: foundRecord, relatedInbound: relatedInbound };
      yield { result: finalResult };
      return;
    }

    yield { result: { shipment: null, relatedInbound: null, error: `Record not found in ${storeName || 'any configured'} warehouse store or local database.` } };
  }
);


/**
 * Performs the actual live search logic for a given date range.
 */
export async function performLiveSearch(searchTerm: string, searchBy: string, fromDate: Date, toDate: Date, storeName: string | undefined, direction: 'all' | 'inbound' | 'outbound', signal: AbortSignal | undefined): Promise<{ record: Shipment | Inbound | null; logs: string[] }> {
    
    const logs: string[] = [];
    const allStores = getStores();
    let storesToSearch = storeName && storeName !== 'All' ? allStores.filter(s => s.name.toLowerCase() === storeName.toLowerCase()) : allStores;

    if (storesToSearch.length === 0) {
        logs.push(`No stores found matching "${storeName}". Available: ${allStores.map(s => s.name).join(', ')}`);
        return { record: null, logs };
    }

    const startDate = format(fromDate, 'yyyyMMdd');
    const endDate = format(toDate, 'yyyyMMdd');

    const doClientSearch = searchBy === 'shipmentId' || searchBy === 'all';
    const doChannelSearch = searchBy === 'orderId' || searchBy === 'all';
    const doGeneralSearch = ['customerName', 'email', 'sku', 'trackingLink', 'all'].includes(searchBy);

    for (const creds of storesToSearch) {
        if (!creds.apiKey) {
             logs.push(`[${creds.name}] Missing credentials. Skipping.`);
             continue;
        }
        
        logs.push(`[${creds.name}] Searching for "${searchTerm}"...`);
        
        // Outbound Searches
        if (direction === 'all' || direction === 'outbound') {
            if (doClientSearch) {
                logs.push(`[${creds.name}] Checking Outbounds by Shipment ID...`);
                let data = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/?startDate=${startDate}&endDate=${endDate}`, creds.name, creds, signal, { 'X-Client-Id': searchTerm });
                if (data && data.id) return { record: mapParcelninjaToShipment(data, 'Outbound', creds.name), logs };
            }
            if (doChannelSearch || doGeneralSearch) {
                 logs.push(`[${creds.name}] Checking Outbounds by Search/Order ID...`);
                 let params = `startDate=${startDate}&endDate=${endDate}&pageSize=1&page=1&col=4&colOrder=desc`;
                 if (searchBy === 'orderId') params += `&channelId=${encodeURIComponent(searchTerm)}`;
                 else params += `&search=${encodeURIComponent(searchTerm)}`;

                const data = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/?${params}`, creds.name, creds, signal);
                if (data && data.outbounds && data.outbounds.length > 0) {
                    const detailUrl = `${WAREHOUSE_API_BASE_URL}/outbounds/${data.outbounds[0].id}/events`;
                    logs.push(`[${creds.name}] Found summary, fetching details from ${detailUrl}`);
                    const fullRecord = await fetchFromParcelNinja(detailUrl, creds.name, creds, signal);
                    if (fullRecord && fullRecord.id) return { record: mapParcelninjaToShipment(fullRecord, 'Outbound', creds.name), logs };
                }
            }
        }
        
        // Inbound Searches
        if (direction === 'all' || direction === 'inbound') {
            if (doClientSearch) {
                logs.push(`[${creds.name}] Checking Inbounds by Shipment ID...`);
                let data = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/inbounds/?startDate=${startDate}&endDate=${endDate}`, creds.name, creds, signal, { 'X-Client-Id': searchTerm });
                if (data && data.id) return { record: mapParcelninjaToShipment(data, 'Inbound', creds.name), logs };
            }
             if (doGeneralSearch || doChannelSearch) {
                logs.push(`[${creds.name}] Checking Inbounds by Search...`);
                let params = `startDate=${startDate}&endDate=${endDate}&pageSize=1&page=1&search=${encodeURIComponent(searchTerm)}&col=4&colOrder=desc`;
                const data = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/inbounds/?${params}`, creds.name, creds, signal);
                if (data && data.inbounds && data.inbounds.length > 0) {
                    const detailUrl = `${WAREHOUSE_API_BASE_URL}/inbounds/${data.inbounds[0].id}/events`;
                    logs.push(`[${creds.name}] Found summary, fetching details from ${detailUrl}`);
                    const fullRecord = await fetchFromParcelNinja(detailUrl, creds.name, creds, signal);
                    if (fullRecord && fullRecord.id) return { record: mapParcelninjaToShipment(fullRecord, 'Inbound', creds.name), logs };
                }
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
    
    const dataToSave = { ...record, updatedAt: new Date().toISOString() };
    const docRef = firestore.collection(`artifacts/${appId}/public/data/${collectionName}`).doc(docId);
    await docRef.set(dataToSave, { merge: true });
    
    console.log(`Saved/Updated record ${docId} in Firestore at path: ${docRef.path}.`);
  } catch (dbError: any) {
    console.error("Failed to save API-found record to Firestore:", dbError);
  }
}

async function searchFirestoreDatabase(searchTerm: string, searchBy: string, direction: 'all' | 'inbound' | 'outbound'): Promise<Shipment | Inbound | null> {
    try {
        const { firestore } = initializeFirebaseOnServer();
        const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';

        const shipmentsRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);
        const inboundsRef = firestore.collection(`artifacts/${appId}/public/data/inbounds`);
        
        let fieldsToSearch: string[] = [];

        if (searchBy === 'all') {
            fieldsToSearch = ['Shipment ID', 'Source Store Order ID', 'Channel ID', 'Customer Name', 'Tracking No', 'Email'];
        } else if (searchBy === 'shipmentId') {
            fieldsToSearch = ['Shipment ID', 'Source Store Order ID'];
        } else if (searchBy === 'orderId') {
             fieldsToSearch = ['Channel ID', 'Source Store Order ID'];
        } else if (searchBy === 'customerName') {
            fieldsToSearch = ['Customer Name'];
        } else if (searchBy === 'email') {
            fieldsToSearch = ['Email'];
        } else if (searchBy === 'trackingLink') {
            fieldsToSearch = ['Tracking Link', 'Tracking No'];
        } else if (searchBy === 'sku') {
            console.log("Skipping Firestore search for SKU (not indexed).");
            return null;
        }

        const searchCollection = async (ref: adminFirestore.CollectionReference) => {
            if (searchBy === 'all' || searchBy === 'shipmentId') {
                 const docRef = ref.doc(searchTerm);
                 const snap = await docRef.get();
                 if(snap.exists) {
                     const data = JSON.parse(JSON.stringify(snap.data()));
                     return { id: snap.id, ...data };
                 }
            }

            for (const field of fieldsToSearch) {
                const query = ref.where(field, '==', searchTerm);
                const querySnap = await query.get();
                if(!querySnap.empty) {
                    const doc = querySnap.docs[0];
                    const data = JSON.parse(JSON.stringify(doc.data()));
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

function parseApiDate(dateStr: string | undefined): string {
    if (!dateStr || dateStr.length < 8) return new Date(0).toISOString();
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
        return new Date(0).toISOString();
    }
}

function mapParcelninjaToShipment(data: any, direction: 'Outbound' | 'Inbound', storeName: string): Shipment | Inbound {
    const latestEvent = Array.isArray(data.events) && data.events.length > 0 
        ? data.events.reduce((latest: any, current: any) => {
            return parseInt(latest.timeStamp, 10) > parseInt(current.timeStamp, 10) ? latest : current;
        })
        : data.status;

    const baseRecord = {
        'Direction': direction,
        'Shipment ID': String(data.clientId || data.id),
        'Source Store': storeName,
        'Source Store Order ID': String(data.clientId || ''),
        'Channel ID': direction === 'Outbound' ? data.channelId : undefined,
        'Order Date': parseApiDate(data.createDate),
        'Customer Name': data.deliveryInfo?.customer || data.deliveryInfo?.contactName || '',
        'Email': data.deliveryInfo?.email || '',
        'Status': latestEvent?.description || 'Unknown',
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
  return JSON.parse(JSON.stringify(finalRecord));
}
