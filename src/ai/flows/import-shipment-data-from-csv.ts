
'use server';

/**
 * @fileOverview A Genkit flow to import shipment data from a single, unified CSV file.
 * It reads a 'Direction' column to determine if a row is an 'Inbound' or 'Outbound' record,
 * aggregates items by shipment ID, and saves the data to the appropriate Firestore collection.
 */

import { ai } from '@/ai/genkit';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { parseCSV } from '@/lib/csv-parser';
import {
  type Shipment,
  type Inbound,
  type ShipmentItem,
  ImportShipmentDataInputSchema,
  type ImportShipmentDataInput,
  ImportShipmentDataOutputSchema,
  type ImportShipmentDataOutput
} from '@/types';

const BATCH_SIZE = 400; // Firestore batch write limit is 500 operations

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

      // Helper to find a header in a case-insensitive way and return its original casing
      const findHeader = (headers: string[], possibleNames: string[]): string | null => {
        const lowerCaseNames = possibleNames.map(n => n.toLowerCase());
        for (const header of headers) {
          if (lowerCaseNames.includes(header.toLowerCase())) {
            return header;
          }
        }
        return null;
      };
      
      const headers = Object.keys(records[0] || {});
      const directionHeader = findHeader(headers, ['Direction']);
      const shipmentIdHeader = findHeader(headers, ['Shipment ID', 'Shipmentf ID']);

      // Validate required headers
      const missingHeaders = [];
      if (!directionHeader) missingHeaders.push('Direction');
      if (!shipmentIdHeader) missingHeaders.push('Shipment ID');

      if (missingHeaders.length > 0) {
        return {
          success: false,
          inboundsCreated: 0,
          outboundsCreated: 0,
          message: `CSV is missing required columns: ${missingHeaders.join(', ')}.`,
        };
      }
      
      // Aggregate records by Shipment ID
      const shipmentsMap = new Map<string, (Shipment | Inbound) & { items: ShipmentItem[] }>();

      for (const record of records) {
        const shipmentId = record[shipmentIdHeader!];
        if (!shipmentId) {
          console.warn("Skipping record with empty 'Shipment ID':", record);
          continue;
        }

        // Create a new entry if we haven't seen this shipment ID before
        if (!shipmentsMap.has(shipmentId)) {
          shipmentsMap.set(shipmentId, {
            id: shipmentId, // Use shipmentId as the document ID
            ...record, // Spread the rest of the record
            items: [], // Initialize items array
          } as (Shipment | Inbound) & { items: ShipmentItem[] });
        }

        const shipment = shipmentsMap.get(shipmentId)!;
        
        // Add the current row's item details to the items array
        const item: ShipmentItem = {
          'Item Name': record['Item Name'] || 'N/A',
          'Quantity': parseInt(record['Quantity'], 10) || 0,
          'SKU': record['SKU'] || 'N/A',
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
        const batch = firestore.batch();
        const batchData = uniqueRecords.slice(i, i + BATCH_SIZE);

        for (const record of batchData) {
          // Normalize direction value
          const direction = String(record[directionHeader!] || '').trim().toLowerCase();
          
          if (direction !== 'outbound' && direction !== 'inbound') {
              console.warn(`Skipping record with invalid 'Direction': '${record[directionHeader!]}'`, record);
              continue; // Skip records with no or invalid direction
          }

          const collectionRef = direction === 'outbound' ? shipmentsColRef : inboundsColRef;
          const docRef = collectionRef.doc(record.id);
          
          // Create a clean object to write to prevent Firestore issues with undefined values
          const dataToWrite = JSON.parse(JSON.stringify(record));
          batch.set(docRef, dataToWrite, { merge: true });

          if (direction === 'outbound') {
            outboundsCreated++;
          } else {
            inboundsCreated++;
          }
        }
        await batch.commit();
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
