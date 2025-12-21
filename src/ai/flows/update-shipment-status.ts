'use server';

/**
 * @fileOverview A Genkit flow to update a shipment's status from an external warehouse API.
 *
 * - updateShipmentStatus - A function that fetches the latest status and updates Firestore.
 */

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
      const warehouseApiUrl = `https://www.parcelninja.co.za/api/v1/tracking/${trackingNo}`;
      
      // Encode credentials for Basic Authentication
      const basicAuth = Buffer.from(`${creds.apiUsername}:${creds.apiPassword}`).toString('base64');

      const response = await fetch(warehouseApiUrl, {
        method: 'GET', // ParcelNinja tracking is a GET request
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
      
      // Assuming ParcelNinja returns a structure like { "status": "DELIVERED", "events": [...] }
      // We need to extract the latest status from the events array if available, or a main status field.
      let newStatus: string | undefined;
      if (data.events && data.events.length > 0) {
        // Get the description of the most recent event
        newStatus = data.events[data.events.length - 1].description; 
      } else if (data.status) {
        // Fallback to a top-level status field if available
        newStatus = data.status;
      }

      if (!newStatus) {
         return { success: false, message: 'ParcelNinja API did not return a valid status or events.' };
      }

      // Update the document in Firestore
      const { firestore } = initializeFirebaseOnServer();
      const shipmentRef = firestore.collection('shipments').doc(shipmentId); // Using the direct collection path
      
      await shipmentRef.update({
        'Status': newStatus,
        'Status Date': new Date().toISOString(), // Update status date to now
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
