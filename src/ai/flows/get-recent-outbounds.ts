'use server';
import { config } from 'dotenv';
import path from 'path';

const secretsPath = path.resolve(process.cwd(), 'secrets.env');
config({ path: secretsPath });
config(); 

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getStores, type Store } from '@/lib/stores';
import { ShipmentRecordSchema, type Shipment } from '@/types';

// --- HELPERS ---
async function fetchFromParcelNinja(url: string, creds: Store) {
    if (!creds.apiKey || !creds.apiSecret) return null;
    const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
    try {
        const response = await fetch(url, { 
            method: 'GET', 
            headers: { 'Authorization': `Basic ${basicAuth}`, 'Content-Type': 'application/json' } 
        });
        if (response.ok) return await response.json();
    } catch (e) { console.error(e); }
    return null;
}

function parseApiDate(dateStr: string | undefined): string {
    if (!dateStr || dateStr.length < 8) return '';
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
    } catch (e) { return ''; }
}

function mapToShipment(data: any, storeName: string): Shipment {
    return {
        'Direction': 'Outbound',
        'Shipment ID': String(data.clientId || data.id),
        'Source Store': storeName,
        'Source Store Order ID': String(data.clientId || ''),
        'Channel ID': data.channelId,
        'Order Date': parseApiDate(data.createDate),
        'Customer Name': data.deliveryInfo?.customer || '',
        'Email': data.deliveryInfo?.email || '',
        'Status': data.status?.description || 'Unknown',
        'Tracking No': data.deliveryInfo?.trackingNo || '',
        'Courier': data.deliveryInfo?.courierName || storeName,
        'Tracking Link': data.deliveryInfo?.trackingUrl || '',
        'Status Date': parseApiDate(data.status?.timeStamp),
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
}

// --- FLOW ---
export const getRecentOutboundsFlow = ai.defineFlow(
  {
    name: 'getRecentOutboundsFlow',
    inputSchema: z.object({ storeName: z.string() }),
    outputSchema: z.object({ records: z.array(ShipmentRecordSchema), error: z.string().optional() }),
  },
  async ({ storeName }) => {
    const stores = getStores();
    const creds = stores.find(s => s.name === storeName);
    
    if (!creds || !creds.apiKey) {
        return { records: [], error: "Invalid store or missing credentials." };
    }

    const endDate = new Date().toISOString().slice(0,10).replace(/-/g,'');
    // Go back 30 days for "recent" list context, or 1 year? 
    // Just need last 10 records. API supports pagination.
    // We need startDate parameter though. Let's use 2020 to be safe.
    const startDate = '20200101';
    
    const url = `https://storeapi.parcelninja.com/api/v1/outbounds/?startDate=${startDate}&endDate=${endDate}&pageSize=10&page=1&col=4&colOrder=desc`;
    
    const data = await fetchFromParcelNinja(url, creds);
    
    if (!data || !data.outbounds) {
        return { records: [], error: "No records found or API error." };
    }

    // Fetch details for each to get full info (items, etc.)?
    // The list endpoint returns minimal info. User wants "all fields".
    // We should fetch details for the 10 items.
    
    const detailPromises = data.outbounds.map(async (summary: any) => {
        const detailUrl = `https://storeapi.parcelninja.com/api/v1/outbounds/${summary.id}/events`;
        const detail = await fetchFromParcelNinja(detailUrl, creds);
        return detail ? mapToShipment(detail, storeName) : null;
    });

    const results = await Promise.all(detailPromises);
    const records = results.filter((r: any) => r !== null) as Shipment[];

    return { records };
  }
);
