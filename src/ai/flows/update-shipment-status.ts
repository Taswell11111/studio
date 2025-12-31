
'use server';

/**
 * @fileOverview A Genkit flow to update a shipment's status from an external warehouse API.
 *
 * - updateShipmentStatus - a function that fetches the latest status and updates Firestore.
 */
import { config } from 'dotenv';
config();

import { ai } from '@/ai/genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import {
  UpdateShipmentStatusInputSchema,
  UpdateShipmentStatusOutputSchema,
  type UpdateShipmentStatusInput,
  type UpdateShipmentStatusOutput,
} from '@/types';
import { STORES } from '@/lib/stores';

// Main exported function that the client will call
export async function updateShipmentStatus(input: UpdateShipmentStatusInput): Promise<UpdateShipmentStatusOutput> {
  return updateShipmentStatusFlow(input);
}

// The Genkit flow that orchestrates the update process
const updateShipmentStatusFlow = ai.defineFlow(
  {
    name: 'updateShipmentStatusFlow',
    inputSchema: UpdateShipmentStatusInputSchema,
    outputSchema: UpdateShipmentStatusOutputSchema,
  },
  async (input) => {
    const { shipmentId, trackingNo, courier } = input;

    // Select credentials based on the courier name (case-insensitive)
    const upperCourier = courier.toUpperCase();
    const creds = STORES.find(s => s.name.toUpperCase() === upperCourier);
    
    if (!creds || !creds.apiKey || !creds.apiSecret) {
      console.error(`Warehouse API credentials for \"${courier}\" are not configured in src/lib/stores.ts.`);
      return {
        success: false,
        message: `Warehouse integration is not configured for \"${courier}\".`,
      };
    }

    try {
      const warehouseApiUrl = `https://storeapi.parcelninja.com/api/v1/tracking/${trackingNo}/events`;
      
      const basicAuth = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');

      const response = await fetch(warehouseApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`ParcelNinja API request for ${courier} (tracking ${trackingNo}) failed with status ${response.status}: ${errorBody}`);
        return { success: false, message: `Failed to fetch status from ParcelNinja. API returned status ${response.status}.` };
      }

      const data = await response.json();
      
      let newStatus: string | undefined;
      
      if (data && data.events && Array.isArray(data.events) && data.events.length > 0) {
          // The API returns events with the most recent first.
          newStatus = data.events[0].description;
      } else if (data.status) {
        newStatus = typeof data.status === 'string' ? data.status : data.status.description;
      }

      if (!newStatus) {
         return { success: false, message: 'ParcelNinja API did not return a valid status or events.' };
      }

      // Update the document in Firestore
      const { firestore } = initializeFirebaseOnServer();
      const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
      const shipmentRef = firestore.collection(`artifacts/${appId}/public/data/shipments`).doc(shipmentId);
      
      await shipmentRef.update({
        'Status': newStatus,
        'Status Date': new Date().toISOString(),
        'updatedAt': new Date(), // Important for the "last 3 days" query
      });

      return {
        success: true,
        newStatus: newStatus,
        message: `Shipment status updated to '${newStatus}'.`,
      };

    } catch (error: any) {
      console.error(`Error during shipment status update for ${courier} (tracking ${trackingNo}):`, error);
      return {
        success: false,
        message: error.message || 'An unexpected error occurred.',
      };
    }
  }
);
