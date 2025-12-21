'use server';

/**
 * @fileOverview A Genkit flow to import shipment data from a raw CSV text string.
 * This version consolidates multiple CSV rows with the same order ID into a single shipment document.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { parseCSV } from '@/lib/csv-parser';
import { Shipment, ShipmentItem } from '@/types';

const BATCH_SIZE = 400; // Firestore batch limit is 500 operations

const ImportFromCsvInputSchema = z.object({
  csvText: z.string().describe('The raw text content of the CSV file.'),
});
export type ImportFromCsvInput = z.infer<typeof ImportFromCsvInputSchema>;

export const ImportFromCsvOutputSchema = z.object({
  success: z.boolean(),
  recordsImported: z.number().describe('Total number of rows processed from the CSV.'),
  shipmentsCreated: z.number().describe('Number of unique shipment documents created.'),
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
      const totalRows = records.length;
      if (totalRows === 0) {
        return { success: false, recordsImported: 0, shipmentsCreated: 0, message: 'CSV file is empty or could not be parsed.' };
      }

      // 2. Consolidate records into unique shipments by 'Source Store Order ID'
      const shipmentsMap = new Map<string, Partial<Shipment>>();

      for (const record of records) {
        const orderId = record['Source Store Order ID'];
        if (!orderId) {
          console.warn("Skipping record with no 'Source Store Order ID':", record);
          continue;
        }

        if (!shipmentsMap.has(orderId)) {
          shipmentsMap.set(orderId, {
            id: orderId,
            'Source Store Order ID': orderId,
            'Status': record['Status'],
            'Customer Name': record['Customer Name'],
            'Order Date': record['Order Date'],
            'Courier': record['Courier'],
            'Tracking No': record['Tracking No'],
            'Tracking Link': record['Tracking Link'],
            items: [],
          });
        }

        const shipment = shipmentsMap.get(orderId)!;
        
        const item: ShipmentItem = {
          'Item Name': record['Item Name'] || 'N/A',
          ...record
        };
        shipment.items!.push(item);
      }
      
      // 3. Batch write to Firestore
      const { firestore } = initializeFirebaseOnServer();
      const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
      const shipmentsColRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);
      
      const uniqueShipments = Array.from(shipmentsMap.values());

      for (let i = 0; i < uniqueShipments.length; i += BATCH_SIZE) {
        const batch = firestore.batch();
        const batchData = uniqueShipments.slice(i, i + BATCH_SIZE);

        for (const shipment of batchData) {
          const docRef = shipmentsColRef.doc(shipment.id!);
          batch.set(docRef, shipment, { merge: true });
        }
        await batch.commit();
      }

      const shipmentsCreatedCount = uniqueShipments.length;
      const successMessage = `Successfully processed ${totalRows} rows and created ${shipmentsCreatedCount} unique shipments.`;

      return {
        success: true,
        recordsImported: totalRows,
        shipmentsCreated: shipmentsCreatedCount,
        message: successMessage,
      };

    } catch (error: any) {
      console.error('Error in importFromCsvFlow:', error);
      return {
        success: false,
        recordsImported: 0,
        shipmentsCreated: 0,
        message: error.message || 'An unexpected error occurred during CSV import.',
      };
    }
  }
);
