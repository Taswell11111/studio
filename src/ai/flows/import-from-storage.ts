'use server';

/**
 * @fileOverview A Genkit flow to import shipment data from a CSV file in Firebase Storage.
 *
 * - importFromStorage - A function that fetches, parses, and imports CSV data into Firestore.
 * - ImportFromStorageInput - The input type for the importFromStorage function.
 * - ImportFromStorageOutput - The return type for the importFromStorage function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { parseCSV } from '@/lib/csv-parser';
import * as admin from 'firebase-admin';
import type { Shipment } from '@/types';

const BATCH_SIZE = 100;

const ImportFromStorageInputSchema = z.object({
  filePath: z.string().describe('The path to the file in the Firebase Storage bucket (e.g., "Merged_shipments_new.csv").'),
});
export type ImportFromStorageInput = z.infer<typeof ImportFromStorageInputSchema>;

const ImportFromStorageOutputSchema = z.object({
  success: z.boolean(),
  recordsImported: z.number(),
  message: z.string(),
});
export type ImportFromStorageOutput = z.infer<typeof ImportFromStorageOutputSchema>;

export async function importFromStorage(input: ImportFromStorageInput): Promise<ImportFromStorageOutput> {
  return importFromStorageFlow(input);
}

const importFromStorageFlow = ai.defineFlow(
  {
    name: 'importFromStorageFlow',
    inputSchema: ImportFromStorageInputSchema,
    outputSchema: ImportFromStorageOutputSchema,
  },
  async ({ filePath }) => {
    try {
      // 1. Initialize Admin SDK and get refs
      const { firestore } = initializeFirebaseOnServer();
      const storage = admin.storage();
      
      // Log the storage bucket environment variable for debugging
      console.log(`FIREBASE_STORAGE_BUCKET: ${process.env.FIREBASE_STORAGE_BUCKET}`);

      const bucket = storage.bucket(`gs://${process.env.FIREBASE_STORAGE_BUCKET}`);
      const file = bucket.file(filePath);
      
      // Log the full file path being accessed for debugging
      console.log(`Attempting to access file in storage: gs://${process.env.FIREBASE_STORAGE_BUCKET}/${filePath}`);

      const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
      const shipmentsColRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);

      // Delete all existing documents in the collection before new import
      const existingDocs = await shipmentsColRef.listDocuments();
      if (existingDocs.length > 0) {
        console.log(`Deleting ${existingDocs.length} existing shipment records from storage import...`);
        const deleteBatch = firestore.batch();
        existingDocs.forEach(doc => deleteBatch.delete(doc));
        await deleteBatch.commit();
        console.log("Existing shipment records deleted for storage import.");
      }

      // 2. Download the file content from Storage
      const [fileContents] = await file.download();
      const csvText = fileContents.toString('utf8');

      // 3. Parse the CSV data
      const records = parseCSV(csvText);
      if (records.length === 0) {
        return { success: false, recordsImported: 0, message: 'The file is empty or could not be parsed.' };
      }
      
      const shipmentsToImport: Shipment[] = [];

      for (const record of records) {
        const sourceStoreOrderId = record['Source Store Order ID'];
        const itemName = record['Item Name'];

        if (!sourceStoreOrderId || typeof sourceStoreOrderId !== 'string' || sourceStoreOrderId.trim() === '') {
          console.warn("Skipping record with invalid 'Source Store Order ID':", record);
          continue;
        }
        if (!itemName || typeof itemName !== 'string' || itemName.trim() === '') {
            console.warn("Skipping record with invalid 'Item Name':", record);
            continue;
        }

        // Create a unique shipment ID by concatenating Source Store Order ID and sanitized Item Name
        const shipmentId = `${sourceStoreOrderId}_${itemName.replace(/[^a-zA-Z0-9]/g, '')}`;
        const newShipment: Shipment = {
            id: shipmentId,
            ...record,
            // Ensure 'Item Name' is explicitly set for the individual item
            'Item Name': itemName, 
        };
        shipmentsToImport.push(newShipment);
      }

      // 4. Batch write shipments to Firestore
      for (let i = 0; i < shipmentsToImport.length; i += BATCH_SIZE) {
        const batch = firestore.batch();
        const batchData = shipmentsToImport.slice(i, i + BATCH_SIZE);

        for (const shipment of batchData) {
          const docRef = shipmentsColRef.doc(shipment.id);
          batch.set(docRef, shipment, { merge: true });
        }
        await batch.commit();
      }

      return {
        success: true,
        recordsImported: shipmentsToImport.length,
        message: `Successfully imported records from ${filePath}.`,
      };

    } catch (error: any) {
      console.error('Error in importFromStorageFlow:', error);
       if (error.code === 404) {
        return {
          success: false,
          recordsImported: 0,
          message: `File not found in storage at path: "${filePath}". Please check the file name and path.`,
        };
      }
      return {
        success: false,
        recordsImported: 0,
        message: error.message || 'An unexpected error occurred during storage import.',
      };
    }
  }
);
