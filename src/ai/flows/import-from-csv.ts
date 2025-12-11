'use server';

/**
 * @fileOverview A Genkit flow to import shipment data from a raw CSV text string.
 *
 * - importFromCsv - A function that parses CSV text and imports it into Firestore.
 * - ImportFromCsvInput - The input type for the importFromCsv function.
 * - ImportFromCsvOutput - The return type for the importFromCsv function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { parseCSV } from '@/lib/csv-parser';

const BATCH_SIZE = 100;

const ImportFromCsvInputSchema = z.object({
  csvText: z.string().describe('The raw text content of the CSV file.'),
});
export type ImportFromCsvInput = z.infer<typeof ImportFromCsvInputSchema>;

const ImportFromCsvOutputSchema = z.object({
  success: z.boolean(),
  recordsImported: z.number(),
  message: z.string(),
});
export type ImportFromCsvOutput = z.infer<typeof ImportFromCsvOutputSchema>;

export async function importFromCsv(input: ImportFromCsvInput): Promise<ImportFromCsvOutput> {
  return importFromCsvFlow(input);
}

const importFromCsvFlow = ai.defineFlow(
  {
    name: 'importFromCsvFlow',
    inputSchema: ImportFromCsvInputSchema,
    outputSchema: ImportFromCsvOutputSchema,
  },
  async ({ csvText }) => {
    try {
      // 1. Parse the CSV data
      const records = parseCSV(csvText);
      if (records.length === 0) {
        return { success: false, recordsImported: 0, message: 'CSV file is empty or could not be parsed.' };
      }
      
      const { firestore } = initializeFirebaseOnServer();
      const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
      const shipmentsColRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);

      // 2. Batch write to Firestore
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = firestore.batch();
        const batchData = records.slice(i, i + BATCH_SIZE);

        for (const record of batchData) {
          // Use 'Source Store Order ID' and 'Item Name' as they appear in the CSV header.
          const shipmentId = `${record['Source Store Order ID']}-${record['Item Name']}`;
          if (!shipmentId || shipmentId === '-') {
            console.warn("Skipping record with invalid ID in CSV import:", record);
            continue;
          }
          const docRef = shipmentsColRef.doc(shipmentId);
          batch.set(docRef, record, { merge: true });
        }
        await batch.commit();
      }

      return {
        success: true,
        recordsImported: records.length,
        message: 'Successfully imported records from CSV.',
      };

    } catch (error: any) {
      console.error('Error in importFromCsvFlow:', error);
      return {
        success: false,
        recordsImported: 0,
        message: error.message || 'An unexpected error occurred during CSV import.',
      };
    }
  }
);
