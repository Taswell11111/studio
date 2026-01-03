'use server';
import { config } from 'dotenv';
config();

import { ai } from '@/ai/genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import {
  type Shipment,
  LookupShipmentInputSchema,
  LookupShipmentStreamChunkSchema,
  type Inbound,
  type ShipmentRecord,
} from '@/types';
import { format } from 'date-fns';
import { getStores, type Store } from '@/lib/stores';

const WAREHOUSE_API_BASE_URL = 'https://storeapi.parcelninja.com/api/v1';

// --- HELPER: PARSE API DATE ---
function parseApiDate(dateStr: string | undefined): string | null {
    if (!dateStr || dateStr.length < 8) return null;
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
    } catch (e) { return null; }
}

// --- HELPER: MAPPER ---
function mapParcelninjaToShipment(data: any, direction: 'Outbound' | 'Inbound', storeName: string): Shipment | Inbound {
    const latestEvent = Array.isArray(data.events) && data.events.length > 0 
        ? data.events.reduce((latest: any, current: any) => parseInt(latest.timeStamp, 10) > parseInt(current.timeStamp, 10) ? latest : current)
        : data.status;

    const record = {
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
        'id': String(data.clientId || data.id)
    };
    
    // Final cleanup to ensure no undefined values are present, which can cause issues.
    return JSON.parse(JSON.stringify(record));
}

async function performLiveSearch(
    searchTerm: string, 
    fromDate: Date, 
    toDate: Date, 
    storeName: string | undefined, 
    direction: 'all' | 'inbound' | 'outbound', 
    abortSignal: AbortSignal | undefined
): Promise<{ record: ShipmentRecord | null, logs: string[] }> {
    const logs: string[] = [];
    const allStores = getStores();
    const storesToSearch = (storeName && storeName !== 'All') 
        ? allStores.filter(s => s.name.toLowerCase() === storeName.toLowerCase()) 
        : allStores;
    
    const startDateStr = format(fromDate, 'yyyyMMdd');
    const endDateStr = format(toDate, 'yyyyMMdd');

    for (const creds of storesToSearch) {
        if (!creds.apiKey) continue;

        // 1. Direct Search with X-Client-Id (Outbound and Inbound)
        if (direction === 'all' || direction === 'outbound') {
            logs.push(`[${creds.name}] Direct Outbound search with X-Client-Id: ${searchTerm}`);
            const directOutboundUrl = `${WAREHOUSE_API_BASE_URL}/outbounds/?startDate=${startDateStr}&endDate=${endDateStr}&pageSize=1`;
            const outboundData = await fetchFromParcelNinja(directOutboundUrl, creds, { 'X-Client-Id': searchTerm }, abortSignal);
            if (outboundData && outboundData.outbounds && outboundData.outbounds.length > 0) {
                 const detail = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/${outboundData.outbounds[0].id}/events`, creds, {}, abortSignal);
                 if(detail) return { record: mapParcelninjaToShipment(detail, 'Outbound', creds.name), logs };
            }
        }
        if (direction === 'all' || direction === 'inbound') {
            logs.push(`[${creds.name}] Direct Inbound search with X-Client-Id: ${searchTerm}`);
            const directInboundUrl = `${WAREHOUSE_API_BASE_URL}/inbounds/?startDate=${startDateStr}&endDate=${endDateStr}&pageSize=1`;
            const inboundData = await fetchFromParcelNinja(directInboundUrl, creds, { 'X-Client-Id': searchTerm }, abortSignal);
            if (inboundData && inboundData.inbounds && inboundData.inbounds.length > 0) {
                 const detail = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/inbounds/${inboundData.inbounds[0].id}/events`, creds, {}, abortSignal);
                 if(detail) return { record: mapParcelninjaToShipment(detail, 'Inbound', creds.name), logs };
            }
        }

        // 2. Fallback to General Search
        const searchParams = `startDate=${startDateStr}&endDate=${endDateStr}&pageSize=1&search=${encodeURIComponent(searchTerm)}`;
        if (direction === 'all' || direction === 'outbound') {
            logs.push(`[${creds.name}] Fallback general Outbound search: ${searchTerm}`);
            const outboundUrl = `${WAREHOUSE_API_BASE_URL}/outbounds/?${searchParams}`;
            const outboundData = await fetchFromParcelNinja(outboundUrl, creds, {}, abortSignal);
            if (outboundData && outboundData.outbounds && outboundData.outbounds.length > 0) {
                const detail = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/outbounds/${outboundData.outbounds[0].id}/events`, creds, {}, abortSignal);
                if(detail) return { record: mapParcelninjaToShipment(detail, 'Outbound', creds.name), logs };
            }
        }
        if (direction === 'all' || direction === 'inbound') {
            logs.push(`[${creds.name}] Fallback general Inbound search: ${searchTerm}`);
            const inboundUrl = `${WAREHOUSE_API_BASE_URL}/inbounds/?${searchParams}`;
            const inboundData = await fetchFromParcelNinja(inboundUrl, creds, {}, abortSignal);
            if (inboundData && inboundData.inbounds && inboundData.inbounds.length > 0) {
                const detail = await fetchFromParcelNinja(`${WAREHOUSE_API_BASE_URL}/inbounds/${inboundData.inbounds[0].id}/events`, creds, {}, abortSignal);
                if(detail) return { record: mapParcelninjaToShipment(detail, 'Inbound', creds.name), logs };
            }
        }
    }
    return { record: null, logs };
}


async function fetchFromParcelNinja(url: string, creds: Store, extraHeaders = {}, signal: AbortSignal | undefined) {
    if (!creds.apiKey || !creds.apiSecret) return null;
    const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
    const headers = { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/json', ...extraHeaders };
    try {
        const response = await fetch(url, { method: 'GET', headers, signal });
        if (response.ok) return await response.json();
    } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') {
             console.log('Fetch aborted');
        }
    }
    return null;
}

// Helper to save to DB without blocking
async function saveRecordToFirestore(record: Shipment | Inbound) {
    try {
        const { firestore } = initializeFirebaseOnServer();
        const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
        const collection = record.Direction === 'Inbound' ? 'inbounds' : 'shipments';
        const docId = record.id || record['Shipment ID'];

        if (!docId) {
          console.error("Cannot save record without an ID.", record);
          return;
        }

        await firestore.collection(`artifacts/${appId}/public/data/${collection}`).doc(DocId).set({
            ...record, updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (e) { console.error("DB Save failed:", e); }
}


// --- MAIN FLOW ---
export const lookupShipmentFlow = ai.defineFlow(
  {
    name: 'lookupShipmentFlow',
    inputSchema: LookupShipmentInputSchema,
    outputSchema: LookupShipmentStreamChunkSchema,
    stream: true,
  },
  async function* ({ sourceStoreOrderId, storeName, direction = 'all', abortSignal }) {
    const searchTerm = sourceStoreOrderId.trim();
    
    yield { log: `Starting live API search for "${searchTerm}"...` };

    const fromDate = new Date('2014-01-01');
    const toDate = new Date('2030-01-01'); 

    const { record: foundRecord, logs } = await performLiveSearch(searchTerm, fromDate, toDate, storeName, direction, abortSignal);

    for (const log of logs) {
        yield { log };
    }

    if (foundRecord) {
        yield { log: `Record found for "${searchTerm}". Saving to local cache.` };
        await saveRecordToFirestore(foundRecord);
        const finalSerializableResult = JSON.parse(JSON.stringify({ shipment: foundRecord }));
        yield { result: finalSerializableResult };
    } else {
        yield { log: `No record found for "${searchTerm}" in any warehouse.` };
        yield { result: { shipment: null, error: `Could not find any record matching "${searchTerm}".` } };
    }
  }
);

    