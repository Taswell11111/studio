
'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { parseCSV } from '@/lib/csv-parser';
import { Inbound, InboundItem } from '@/types';

const BATCH_SIZE = 400; // Firestore batch limit is 500 operations

const ImportInboundFromCsvInputSchema = z.object({
  csvText: z.string().describe('The raw text content of the CSV file for inbound shipments.'),
});
export type ImportInboundFromCsvInput = z.infer<typeof ImportInboundFromCsvInputSchema>;

const ImportInboundFromCsvOutputSchema = z.object({
  success: z.boolean(),
  recordsImported: z.number().describe('Total number of unique inbound shipments created.'),
  message: z.string(),
});
export type ImportInboundFromCsvOutput = z.infer<typeof ImportInboundFromCsvOutputSchema>;

export async function importInboundFromCsv(input: ImportInboundFromCsvInput): Promise<ImportInboundFromCsvOutput> {
  return importInboundFromCsvFlow(input);
}

const importInboundFromCsvFlow = ai.defineFlow(
  {
    name: 'importInboundFromCsvFlow',
    inputSchema: ImportInboundFromCsvInputSchema,
    outputSchema: ImportInboundFromCsvOutputSchema,
  },
  async ({ csvText }) => {
    try {
      const records = parseCSV(csvText);
      if (records.length === 0) {
        return { success: false, recordsImported: 0, message: 'CSV file is empty or could not be parsed.' };
      }

      const inboundsMap = new Map<string, Inbound>();

      for (const record of records) {
        const returnId = record['Return ID'];
        if (!returnId) {
          console.warn("Skipping record with no 'Return ID':", record);
          continue;
        }

        if (!inboundsMap.has(returnId)) {
          inboundsMap.set(returnId, {
            id: returnId,
            'Return ID': returnId,
            'Source Store order Id': record['Source Store order Id'],
            'Source Shipment ID': record['Source Shipment ID'],
            'Reference': record['Reference'],
            'Return Date': record['Return Date'],
            'Shipping Type': record['Shipping Type'],
            'Tracking No': record['Tracking No'],
            'Courier': record['Courier'],
            'Status': record['Status'],
            'Status Date': record['Status Date'],
            'Fulfilment Center': record['Fulfilment Center'],
            'Customer Name': record['Customer Name'],
            'Address Line 1': record['Address Line 1'],
            'Pin Code': record['Pin Code'],
            items: [],
          });
        }

        const inboundOrder = inboundsMap.get(returnId)!;
        
        const item: InboundItem = {
          'Item Name': record['Item Name'],
          'Quantity': parseInt(record['Quantity'], 10) || 1,
        };
        inboundOrder.items.push(item);
      }
      
      const { firestore } = initializeFirebaseOnServer();
      const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
      const inboundsColRef = firestore.collection(`artifacts/${appId}/public/data/inbounds`);
      
      const uniqueInbounds = Array.from(inboundsMap.values());

      for (let i = 0; i < uniqueInbounds.length; i += BATCH_SIZE) {
        const batch = firestore.batch();
        const batchData = uniqueInbounds.slice(i, i + BATCH_SIZE);

        for (const inbound of batchData) {
          const docRef = inboundsColRef.doc(inbound.id);
          batch.set(docRef, JSON.parse(JSON.stringify(inbound)), { merge: true });
        }
        await batch.commit();
      }

      const inboundsCreatedCount = uniqueInbounds.length;
      const successMessage = `Successfully processed ${records.length} rows and created ${inboundsCreatedCount} unique inbound shipments.`;

      return {
        success: true,
        recordsImported: inboundsCreatedCount,
        message: successMessage,
      };

    } catch (error: any) {
      console.error('Error in importInboundFromCsvFlow:', error);
      return {
        success: false,
        recordsImported: 0,
        message: error.message || 'An unexpected error occurred during inbound CSV import.',
      };
    }
  }
);
