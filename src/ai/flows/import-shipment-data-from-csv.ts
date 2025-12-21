'use server';

/**
 * @fileOverview A Genkit flow to import shipment data from a single, unified CSV file.
 * It reads a 'Direction' column to determine if a row is an 'Inbound' or 'Outbound' record
 * and saves it to the appropriate Firestore collection.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { parseCSV } from '@/lib/csv-parser';
import type { Shipment, Inbound, ShipmentItem } from '@/types';

const BATCH_SIZE = 400; // Firestore batch write limit is 500 operations

const ImportShipmentDataInputSchema = z.object({
  csvText: z.string().describe('The raw text content of the CSV file.'),
});
export type ImportShipmentDataInput = z.infer<typeof ImportShipmentDataInputSchema>;

export const ImportShipmentDataOutputSchema = z.object({
  success: z.boolean(),
  inboundsCreated: z.number().describe('Number of inbound records created.'),
  outboundsCreated: z.number().describe('Number of outbound records created.'),
  message: z.string(),
});
export type ImportShipmentDataOutput = z.infer<typeof ImportShipmentDataOutputSchema>;

export async function importShipmentDataFromCsv(input: ImportShipmentDataInput): Promise<ImportShipmentDataOutput> {
  return importShipmentDataFromCsvFlow(input);
}

const importShipmentDataFromCsvFlow = ai.defineFlow(
  {
    name: 'importShipmentDataFromCsvFlow',
    inputSchema: ImportShipmentDataInputSchema,
    outputSchema: ImportShipmentDataOutputSchema,
  },
  async ({ csvText }) => {
    try {
      const records = parseCSV(csvText);
      const totalRows = records.length;
      if (totalRows === 0) {
        return { 
          success: false, 
          inboundsCreated: 0,
          outboundsCreated: 0,
          message: 'CSV file is empty or could not be parsed.' 
        };
      }

      // Check for required headers
      const headers = Object.keys(records[0] || {});
      if (!headers.includes('Direction') || !headers.includes('Shipment ID')) {
        return {
          success: false,
          inboundsCreated: 0,
          outboundsCreated: 0,
          message: 'CSV must contain "Direction" and "Shipment ID" columns.',
        };
      }

      const shipmentsMap = new Map<string, Shipment | Inbound>();

      for (const record of records) {
        const shipmentId = record['Shipment ID'];
        if (!shipmentId) {
          console.warn("Skipping record with no 'Shipment ID':", record);
          continue;
        }

        if (!shipmentsMap.has(shipmentId)) {
          shipmentsMap.set(shipmentId, {
            id: shipmentId,
            ...record,
            items: [],
          } as Shipment | Inbound);
        }

        const shipment = shipmentsMap.get(shipmentId)!;
        
        const item: ShipmentItem = {
          'Item Name': record['Item Name'] || 'N/A',
          'Quantity': parseInt(record['Quantity'], 10) || 0,
          ...record,
        };
        shipment.items!.push(item);
      }
      
      const { firestore } = initializeFirebaseOnServer();
      const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
      const shipmentsColRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);
      const inboundsColRef = firestore.collection(`artifacts/${appId}/public/data/inbounds`);
      
      const uniqueRecords = Array.from(shipmentsMap.values());
      let inboundsCreated = 0;
      let outboundsCreated = 0;

      for (let i = 0; i < uniqueRecords.length; i += BATCH_SIZE) {
        const shipmentBatch = firestore.batch();
        const inboundBatch = firestore.batch();
        
        const batchData = uniqueRecords.slice(i, i + BATCH_SIZE);
        let hasShipments = false;
        let hasInbounds = false;

        for (const record of batchData) {
          const docRef = record['Direction'].toLowerCase() === 'inbound'
            ? inboundsColRef.doc(record.id)
            : shipmentsColRef.doc(record.id);

          const dataToWrite = JSON.parse(JSON.stringify(record));

          if (record['Direction'].toLowerCase() === 'inbound') {
            inboundBatch.set(docRef, dataToWrite, { merge: true });
            hasInbounds = true;
            inboundsCreated++;
          } else {
            shipmentBatch.set(docRef, dataToWrite, { merge: true });
            hasShipments = true;
            outboundsCreated++;
          }
        }
        
        if (hasShipments) await shipmentBatch.commit();
        if (hasInbounds) await inboundBatch.commit();
      }

      const successMessage = `Successfully processed ${totalRows} rows. Created ${outboundsCreated} outbound shipments and ${inboundsCreated} inbound records.`;

      return {
        success: true,
        inboundsCreated,
        outboundsCreated,
        message: successMessage,
      };

    } catch (error: any) {
      console.error('Error in importShipmentDataFromCsvFlow:', error);
      return {
        success: false,
        inboundsCreated: 0,
        outboundsCreated: 0,
        message: error.message || 'An unexpected error occurred during CSV import.',
      };
    }
  }
);
