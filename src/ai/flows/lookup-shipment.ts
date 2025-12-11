'use server';

/**
 * @fileOverview A Genkit flow to look up shipment details from an external warehouse API using an order ID.
 *
 * - lookupShipment - A function that fetches shipment data based on a source store order ID.
 * - LookupShipmentInput - The input type for the lookupShipment function.
 * - LookupShipmentOutput - The return type for the lookupShipment function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { Shipment } from '@/types';

const LookupShipmentInputSchema = z.object({
  sourceStoreOrderId: z.string().describe('The Order ID from the source store.'),
});
export type LookupShipmentInput = z.infer<typeof LookupShipmentInputSchema>;

// The output will be a single shipment record or null if not found
const LookupShipmentOutputSchema = z.object({
  shipment: z.custom<Shipment>().nullable(),
  error: z.string().optional(),
});
export type LookupShipmentOutput = z.infer<typeof LookupShipmentOutputSchema>;

// Main exported function that the client will call
export async function lookupShipment(input: LookupShipmentInput): Promise<LookupShipmentOutput> {
  return lookupShipmentFlow(input);
}

// The Genkit flow that orchestrates the lookup process
const lookupShipmentFlow = ai.defineFlow(
  {
    name: 'lookupShipmentFlow',
    inputSchema: LookupShipmentInputSchema,
    outputSchema: LookupShipmentOutputSchema,
  },
  async ({ sourceStoreOrderId }) => {
    // Retrieve credentials from environment variables
    const apiKey = process.env.DIESEL_WAREHOUSE_API_KEY;
    const apiUsername = process.env.DIESEL_WAREHOUSE_API_USERNAME;
    const apiPassword = process.env.DIESEL_WAREHOUSE_API_PASSWORD;
    const storeId = process.env.DIESEL_WAREHOUSE_STORE_ID;
    
    if (!apiKey || !apiUsername || !apiPassword || !storeId) {
      console.error("Warehouse API credentials are not configured in .env file.");
      return {
        shipment: null,
        error: "Warehouse integration is not configured on the server.",
      };
    }

    try {
      // NOTE: This is a hypothetical API endpoint. The actual endpoint and request
      // format for looking up an order by ID may differ for the Diesel Warehouse API.
      // This assumes a GET request to an endpoint like /v1/shipment/by-order-id/{orderId}
      const warehouseApiUrl = `https://api.dieselwarehouse.com/v1/shipment/by-order-id/${sourceStoreOrderId}`;
      
      const response = await fetch(warehouseApiUrl, {
        method: 'GET', // Assuming GET is used for lookups
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          // Assuming basic auth or similar might be needed. This is a guess.
          'Authorization': 'Basic ' + btoa(`${apiUsername}:${apiPassword}`),
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { shipment: null, error: 'Order not found.' };
        }
        const errorBody = await response.text();
        console.error(`Warehouse API request failed with status ${response.status}: ${errorBody}`);
        return { shipment: null, error: `Failed to fetch from warehouse. API returned status ${response.status}.` };
      }

      const data = await response.json();
      
      // Assuming the API returns a shipment object that matches our `Shipment` type.
      // We might need to map the fields if the API response structure is different.
      const shipmentData: Shipment = {
        id: data.id || `${sourceStoreOrderId}-${data.itemName || 'item'}`,
        'Source Store Order ID': data.sourceStoreOrderId,
        'Customer Name': data.customerName,
        'Order Date': data.orderDate,
        'Tracking No': data.trackingNo,
        'Courier': data.courier,
        'Status': data.status,
        'Tracking Link': data.trackingLink,
        'Item Name': data.itemName,
      };

      return {
        shipment: shipmentData,
      };

    } catch (error: any) {
      console.error('Error during shipment lookup:', error);
      return {
        shipment: null,
        error: error.message || 'An unexpected error occurred during the lookup.',
      };
    }
  }
);
