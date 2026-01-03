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
        return { error: `[${storeName}] Missing credentials.` };
    }
    const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
    
    const headers: Record<string, string> = { 
        'Authorization': `Basic ${basicAuth}`, 
        'Content-Type': 'application/json', 
        ...extraHeaders 
    };

    console.log(`[${storeName}] Fetching: ${url}`);
    
    try {
        const response = await fetch(url, { method: 'GET', headers, signal });
        
        if (response.ok) {
            const data = await response.json();
            return { data };
        } else {
            const errorText = await response.text();
            console.log(`[${storeName}] API Status ${response.status}: ${errorText.substring(0, 100)}`);
            return { error: `API Status ${response.status}`, status: response.status };
        }
    } catch (err: any) {
        if (err.name === 'AbortError') {
            throw err;
        }
        console.error(`[${storeName}] Network error:`, err.message);
        return { error: `Network error: ${err.message}` };
    }
}

export const lookupShipmentFlow = ai.defineFlow(
  {
    name: 'lookupShipmentFlow',
    inputSchema: LookupShipmentInputSchema,
    outputSchema: LookupShipmentStreamChunkSchema,
    // @ts-ignore - Genkit types might be mismatching but stream: true is required for proper behavior
    stream: true, 
  },
  async function* ({ sourceStoreOrderId, searchBy = 'all', storeName, direction = 'all', abortSignal }) {
    const searchTerm = sourceStoreOrderId.trim();
    
    yield { log: `Searching for: "${searchTerm}" (${searchBy})` };
    const debugStores = getStores();
    if (debugStores.length === 0) yield { log: "WARNING: No stores configured." };

    yield { log: `Starting Pass 1 (Local Firestore Search)...` };
    let foundRecord: Shipment | Inbound | null = null;
    try {
      foundRecord = await searchFirestoreDatabase(searchTerm, searchBy, direction);
    } catch (e: any) {
        yield { log: `Local DB search failed: ${e.message}` };
        foundRecord = null;
    }
    
    if (foundRecord) {
        yield { log: `Found in local DB.` };
        let relatedInbound: Inbound | null = null;
        if (foundRecord.Direction === 'Outbound') {
             const numericId = (foundRecord['Shipment ID'] as string).replace(/\D/g, '');
             if(numericId) {
                const returnId = `RET-${numericId}`;
                yield { log: `Checking for related inbound: ${returnId}`};
                try {
                  relatedInbound = await searchFirestoreDatabase(returnId, 'shipmentId', 'inbound');
                } catch (e) { relatedInbound = null; }
                
                if(!relatedInbound){
                     const { record: liveRelated, logs: liveLogs } = await performLiveSearch(returnId, 'shipmentId', new Date('2014-01-01'), new Date('2030-01-01'), undefined, 'inbound', abortSignal);
                     for (const log of liveLogs) yield { log };
                     relatedInbound = liveRelated as Inbound | null;
                     if(relatedInbound) await saveRecordToFirestore(relatedInbound);
                }
             }
        }
        yield { result: { shipment: foundRecord, relatedInbound } };
        return;
    }

    yield { log: `Starting Pass 2 (Live API Search)...` };
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 1); 
    const fromDate = new Date(toDate);
    fromDate.setFullYear(toDate.getFullYear() - 7); 

    const { record: liveRecord, logs: liveLogs } = await performLiveSearch(searchTerm, searchBy, fromDate, toDate, storeName, direction, abortSignal);
    for (const log of liveLogs) yield { log };
    
    if (liveRecord) {
        yield { log: `Found via Live API.` };
        await saveRecordToFirestore(liveRecord);
        yield { result: { shipment: liveRecord } };
    } else {
        yield { result: { shipment: null, error: `No record found matching "${searchTerm}" in selected stores.` } };
    }
  }
);


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

    for (const creds of storesToSearch) {
        if (!creds.apiKey) continue;
        
        logs.push(`[${creds.name}] Checking...`);
        
        if (direction === 'all' || direction === 'outbound') {
            if (searchBy === 'shipmentId') {
                logs.push(`[${creds.name}] Checking Outbounds by Shipment ID (X-Client-Id)...`);
                let res = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/0`, creds.name, creds, signal, { 'X-Client-Id': searchTerm });
                if (res.data && res.data.id) return { record: mapParcelninjaToShipment(res.data, 'Outbound', creds.name), logs };
            } 
            else if (searchBy === 'orderId') {
                logs.push(`[${creds.name}] Checking Outbounds by Channel ID...`);
                let params = `startDate=${startDate}&endDate=${endDate}&pageSize=5&page=1&col=4&colOrder=desc&channelId=${encodeURIComponent(searchTerm)}`;
                const res = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/?${params}`, creds.name, creds, signal);
                if (res.data?.outbounds?.length > 0) {
                    const detailRes = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/${res.data.outbounds[0].id}/events`, creds.name, creds, signal);
                    if (detailRes.data?.id) return { record: mapParcelninjaToShipment(detailRes.data, 'Outbound', creds.name), logs };
                }
            }
            else {
                logs.push(`[${creds.name}] Checking Outbounds by General Search...`);
                let params = `startDate=${startDate}&endDate=${endDate}&pageSize=5&page=1&col=4&colOrder=desc&search=${encodeURIComponent(searchTerm)}`;
                const res = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/?${params}`, creds.name, creds, signal);
                if (res.data?.outbounds?.length > 0) {
                    const detailRes = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/${res.data.outbounds[0].id}/events`, creds.name, creds, signal);
                    if (detailRes.data?.id) return { record: mapParcelninjaToShipment(detailRes.data, 'Outbound', creds.name), logs };
                }
            }
        }
        
        if (direction === 'all' || direction === 'inbound') {
            if (searchBy === 'shipmentId') {
                logs.push(`[${creds.name}] Checking Inbounds by Shipment ID...`);
                let res = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/inbounds/0`, creds.name, creds, signal, { 'X-Client-Id': searchTerm });
                if (res.data && res.data.id) return { record: mapParcelninjaToShipment(res.data, 'Inbound', creds.name), logs };
            }
            else {
                logs.push(`[${creds.name}] Checking Inbounds by Search...`);
                let params = `startDate=${startDate}&endDate=${endDate}&pageSize=5&page=1&col=4&colOrder=desc&search=${encodeURIComponent(searchTerm)}`;
                const res = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/inbounds/?${params}`, creds.name, creds, signal);
                if (res.data?.inbounds?.length > 0) {
                    const detailRes = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/inbounds/${res.data.inbounds[0].id}/events`, creds.name, creds, signal);
                    if (detailRes.data?.id) return { record: mapParcelninjaToShipment(detailRes.data, 'Inbound', creds.name), logs };
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
    await firestore.collection(`artifacts/${appId}/public/data/${collectionName}`).doc(docId).set({ ...record, updatedAt: new Date().toISOString() }, { merge: true });
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

        if (searchBy === 'shipmentId') fieldsToSearch = ['Shipment ID', 'Source Store Order ID'];
        else if (searchBy === 'orderId') fieldsToSearch = ['Channel ID', 'Source Store Order ID'];
        else if (searchBy === 'customerName') fieldsToSearch = ['Customer Name'];
        else if (searchBy === 'email') fieldsToSearch = ['Email'];
        else if (searchBy === 'trackingLink') fieldsToSearch = ['Tracking Link', 'Tracking No'];
        else if (searchBy === 'sku') return null; // Skip local SKU search
        else fieldsToSearch = ['Shipment ID', 'Channel ID']; // Default fallback

        const searchCollection = async (ref: adminFirestore.CollectionReference) => {
            if (searchBy === 'shipmentId') {
                 const docRef = ref.doc(searchTerm);
                 const snap = await docRef.get();
                 if(snap.exists) return { id: snap.id, ...JSON.parse(JSON.stringify(snap.data())) };
            }
            for (const field of fieldsToSearch) {
                const query = ref.where(field, '==', searchTerm);
                const querySnap = await query.get();
                if(!querySnap.empty) return { id: querySnap.docs[0].id, ...JSON.parse(JSON.stringify(querySnap.docs[0].data())) };
            }
            return null;
        }
        
        if (direction === 'all' || direction === 'outbound') {
            const res = await searchCollection(shipmentsRef);
            if (res) return res;
        }
        if (direction === 'all' || direction === 'inbound') {
            const res = await searchCollection(inboundsRef);
            if (res) return res;
        }
        return null;
    } catch(e: any) {
        console.error("Firestore search error:", e);
        throw new Error("Local DB error");
    }
}

function mapParcelninjaToShipment(data: any, direction: 'Outbound' | 'Inbound', storeName: string): Shipment | Inbound {
    const latestEvent = Array.isArray(data.events) && data.events.length > 0 
        ? data.events.reduce((latest: any, current: any) => parseInt(latest.timeStamp, 10) > parseInt(current.timeStamp, 10) ? latest : current)
        : data.status;

    const parseApiDate = (dateStr: string | undefined): string => {
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
        } catch (e) { return new Date(0).toISOString(); }
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
