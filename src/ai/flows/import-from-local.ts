'use server';

/**
 * @fileOverview A Genkit flow to import shipment data from a local CSV file in the project.
 *
 * - importFromLocal - A function that reads, parses, and imports CSV data into Firestore.
 * - ImportFromLocalOutput - The return type for the importFromLocal function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { parseCSV } from '@/lib/csv-parser';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Shipment } from '@/types';

const BATCH_SIZE = 100;
const LOCAL_CSV_PATH = 'src/data/Merged_shipments_new.csv';

const ImportFromLocalOutputSchema = z.object({
  success: z.boolean(),
  recordsImported: z.number(),
  message: z.string(),
});
export type ImportFromLocalOutput = z.infer<typeof ImportFromLocalOutputSchema>;

export async function importFromLocal(): Promise<ImportFromLocalOutput> {
  return importFromLocalFlow();
}

const importFromLocalFlow = ai.defineFlow(
  {
    name: 'importFromLocalFlow',
    outputSchema: ImportFromLocalOutputSchema,
  },
  async () => {
    try {
      const { firestore } = initializeFirebaseOnServer();
      const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
      const shipmentsColRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);

      // 1. Delete all existing documents in the collection
      const existingDocs = await shipmentsColRef.listDocuments();
      if (existingDocs.length > 0) {
        console.log(`Deleting ${existingDocs.length} existing shipment records...`);
        const deleteBatch = firestore.batch();
        existingDocs.forEach(doc => deleteBatch.delete(doc));
        await deleteBatch.commit();
        console.log("Existing shipment records deleted.");
      }

      // Construct the absolute path to the file
      const filePath = path.join(process.cwd(), LOCAL_CSV_PATH);

      // 2. Read the local CSV file content
      const csvText = await fs.readFile(filePath, 'utf-8');

      // 3. Parse the CSV data
      const records = parseCSV(csvText);
      if (records.length === 0) {
        return { success: false, recordsImported: 0, message: 'Local CSV file is empty or could not be parsed.' };
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

        const shipmentId = `${sourceStoreOrderId}_${itemName.replace(/[^a-zA-Z0-9]/g, '')}`;
        const newShipment: Shipment = {
            id: shipmentId,
            ...record,
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
        message: 'Successfully imported records from local file.',
      };

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return {
          success: false,
          recordsImported: 0,
          message: `Local file not found at ${LOCAL_CSV_PATH}. Please ensure the file exists and is named correctly.`,
        };
      }
      return {
        success: false,
        recordsImported: 0,
        message: error.message || 'An unexpected error occurred during local import.',
      };
    }
  }
);
