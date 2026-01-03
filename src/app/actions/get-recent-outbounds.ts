'use server';
import { config } from 'dotenv';
import path from 'path';

const secretsPath = path.resolve(process.cwd(), 'secrets.env');
config({ path: secretsPath });
config();

import { z } from 'zod';
import { action } from '@/ai/genkit';
import { getStores, type Store } from '@/lib/stores';
import { type Shipment } from '@/types';

const WAREHOUSE_API_BASE_URL = 'https://storeapi.parcelninja.com/api/v1';

async function fetchFromParcelNinja(url: string, creds: Store): Promise<any> {
    if (!creds.apiKey || !creds.apiSecret) return [];
    const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
    try {
        const response = await fetch(url, { headers: { 'Authorization': `Basic ${basicAuth}` } });
        if (response.ok) {
            return response.json();
        } 
    } catch (e) { /* Ignore errors */ }
    return [];
}

function mapToShipment(data: any, storeName: string): Shipment {
    const latestEvent = Array.isArray(data.events) && data.events.length > 0 
        ? data.events.reduce((latest: any, current: any) => parseInt(latest.timeStamp, 10) > parseInt(current.timeStamp, 10) ? latest : current)
        : data.status;

    const parseApiDate = (dateStr: string | undefined): string => {
        if (!dateStr || dateStr.length < 8) return new Date(0).toISOString();
        try {
            const year = parseInt(dateStr.substring(0, 4), 10);
            const month = parseInt(dateStr.substring(4, 6), 10) - 1;
            const day = parseInt(dateStr.substring(6, 8), 10);
            return new Date(Date.UTC(year, month, day)).toISOString();
        } catch (e) { return new Date(0).toISOString(); }
    };

    return {
        'Direction': 'Outbound',
        'id': String(data.id),
        'Shipment ID': String(data.id),
        'Source Store': storeName,
        'Source Store Order ID': String(data.clientId || ''),
        'Channel ID': String(data.channelId || ''),
        'Order Date': parseApiDate(data.createDate),
        'Customer Name': data.customer?.name || '',
        'Email': data.customer?.email || '',
        'Status': latestEvent?.description || 'Unknown',
        'Tracking No': data.deliveryInfo?.waybillNumber || '',
        'Courier': data.deliveryInfo?.courierName || storeName,
        'Tracking Link': data.deliveryInfo?.waybillUrl || '',
        'Status Date': parseApiDate(latestEvent?.timeStamp),
        'Address Line 1': data.address?.address1 || '',
        'Address Line 2': data.address?.address2 || '',
        'City': data.address?.city || '',
        'Pin Code': data.address?.postalCode || '',
        'items': data.items ? data.items.map((item: any) => ({
            'SKU': item.itemNo,
            'Quantity': item.qty,
            'Item Name': item.name,
        })) : [],
    };
}

export const getRecentOutboundsAction = action({
    name: 'getRecentOutbounds',
    inputSchema: z.void(),
    outputSchema: z.object({
        records: z.array(z.any()).optional(),
        error: z.string().optional()
    }),
    handler: async () => {
        const stores = getStores();
        if (stores.length === 0) {
            return { error: "No stores are configured. Please check your environment variables." };
        }

        const toDate = new Date();
        const fromDate = new Date();
        fromDate.setFullYear(fromDate.getFullYear() - 4);

        const startDate = fromDate.toISOString().slice(0,10).replace(/-/g,'');
        const endDate = toDate.toISOString().slice(0,10).replace(/-/g,'');

        const allRecords: Shipment[] = [];

        for (const store of stores) {
            const url = `${WAREHOUSE_API_BASE_URL}/shipments/?startDate=${startDate}&endDate=${endDate}&pageSize=10&page=1&col=4&colOrder=desc`;
            const data = await fetchFromParcelNinja(url, store);
            if (data?.results?.length > 0) {
                const records = data.results.map((item: any) => mapToShipment(item, store.name));
                allRecords.push(...records);
            }
        }

        // Sort all collected records by Order Date descending
        allRecords.sort((a, b) => new Date(b['Order Date']).getTime() - new Date(a['Order Date']).getTime());

        return { records: allRecords.slice(0, 20) }; // Return top 20
    }
});
