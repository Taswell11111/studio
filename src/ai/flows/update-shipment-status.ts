'use server';

/**
 * @fileOverview A Genkit flow to update a shipment's status from an external warehouse API.
 *
 * - updateShipmentStatus - A function that fetches the latest status and updates Firestore.
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

// Main exported function that the client will call
export async function updateShipmentStatus(input: UpdateShipmentStatusInput): Promise<UpdateShipmentStatusOutput> {
  return updateShipmentStatusFlow(input);
}

// Define a type for our credentials
type WarehouseCredentials = {
  apiUsername?: string;
  apiPassword?: string;
  storeId?: string;
};

// The Genkit flow that orchestrates the update process
const updateShipmentStatusFlow = ai.defineFlow(
  {
    name: 'updateShipmentStatusFlow',
    inputSchema: UpdateShipmentStatusInputSchema,
    outputSchema: UpdateShipmentStatusOutputSchema,
  },
  async (input) => {
    const { shipmentId, trackingNo, courier } = input;

    // Securely map courier names to environment variable prefixes on the server
    const credentialsMap: Record<string, WarehouseCredentials> = {
        'DIESEL': {
            apiUsername: process.env.DIESEL_WAREHOUSE_API_USERNAME,
            apiPassword: process.env.DIESEL_WAREHOUSE_API_PASSWORD,
            storeId: process.env.DIESEL_WAREHOUSE_STORE_ID,
        },
        'HURLEY': {
            apiUsername: process.env.HURLEY_WAREHOUSE_API_USERNAME,
            apiPassword: process.env.HURLEY_WAREHOUSE_API_PASSWORD,
            storeId: process.env.HURLEY_WAREHOUSE_STORE_ID,
        },
        'JEEP': {
            apiUsername: process.env.JEEP_APPAREL_WAREHOUSE_API_USERNAME,
            apiPassword: process.env.JEEP_APPAREL_WAREHOUSE_API_PASSWORD,
            storeId: process.env.JEEP_APPAREL_WAREHOUSE_STORE_ID,
        },
        'SUPERDRY': {
            apiUsername: process.env.SUPERDRY_WAREHOUSE_API_USERNAME,
            apiPassword: process.env.SUPERDRY_WAREHOUSE_API_PASSWORD,
            storeId: process.env.SUPERDRY_WAREHOUSE_STORE_ID,
        },
        'REEBOK': {
            apiUsername: process.env.REEBOK_WAREHOUSE_API_USERNAME,
            apiPassword: process.env.REEBOK_WAREHOUSE_API_PASSWORD,
            storeId: process.env.REEBOK_WAREHOUSE_STORE_ID,
        },
    };

    // Select credentials based on the courier name (case-insensitive)
    const upperCourier = courier.toUpperCase();
    const creds = credentialsMap[upperCourier];
    
    if (!creds || !creds.apiUsername || !creds.apiPassword) {
      console.error(`Warehouse API credentials (username/password) for \"${courier}\" are not configured in .env file.`);
      return {
        success: false,
        message: `Warehouse integration is not configured for \"${courier}\". Missing API username or password.`,
      };
    }

    try {
      // ParcelNinja API endpoint for tracking a waybill
      // Tracking endpoint: https://storeapi.parcelninja.com/api/v1/tracking/events/{trackingNo}
      // Note: The previous code used this URL. Let's verify if 'trackingNo' is correct param.
      // Docs say: GET /api/v1/tracking/events/{waybillNo}
      const warehouseApiUrl = `https://storeapi.parcelninja.com/api/v1/tracking/events/${trackingNo}`;
      
      // Encode credentials for Basic Authentication
      const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString('base64');

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
      // The API returns a list of events. We want the latest description.
      // Or maybe it returns { "status": "..." } depending on endpoint.
      // "Track waybill with event history" -> Returns list of events? 
      // The docs say: "Returns the full courier tracking information for a waybill."
      // Let's assume it returns an array of events or an object with 'events'.
      
      if (Array.isArray(data) && data.length > 0) {
         // Sort by timestamp if needed, or assume last is latest?
         // Let's find the one with the latest timestamp.
         const latestEvent = data.reduce((prev, current) => {
            return (new Date(prev.timeStamp).getTime() > new Date(current.timeStamp).getTime()) ? prev : current;
         });
         newStatus = latestEvent.description;
      } else if (data && data.events && Array.isArray(data.events) && data.events.length > 0) {
          const latestEvent = data.events.reduce((prev: any, current: any) => {
            return (new Date(prev.timeStamp).getTime() > new Date(current.timeStamp).getTime()) ? prev : current;
         });
         newStatus = latestEvent.description;
      } else if (data.status) {
        newStatus = typeof data.status === 'string' ? data.status : data.status.description;
      }

      if (!newStatus) {
         // Fallback if no specific status found
         return { success: false, message: 'ParcelNinja API did not return a valid status or events.' };
      }

      // Update the document in Firestore
      const { firestore } = initializeFirebaseOnServer();
      const shipmentRef = firestore.collection('shipments').doc(shipmentId);
      
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
