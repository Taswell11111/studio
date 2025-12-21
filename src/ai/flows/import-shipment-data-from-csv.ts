'use server';

/**
 * @fileOverview A Genkit flow that auto-detects and imports shipment data (inbound or outbound) from a raw CSV string.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { importFromCsv, type ImportFromCsvOutput } from './import-from-csv';
import { importInboundFromCsv, type ImportInboundFromCsvOutput } from './import-inbound-from-csv';

const ImportShipmentDataInputSchema = z.object({
  csvText: z.string().describe('The raw text content of the CSV file.'),
});
export type ImportShipmentDataInput = z.infer<typeof ImportShipmentDataInputSchema>;

// The output can be one of the two existing output types, plus a dataType field
const ImportShipmentDataOutputSchema = z.union([
  ImportFromCsvOutputSchema.extend({ dataType: z.literal('outbound') }),
  ImportInboundFromCsvOutputSchema.extend({ dataType: z.literal('inbound') }),
  z.object({
    success: z.literal(false),
    message: z.string(),
    dataType: z.literal('unknown'),
  }),
]);
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
    
    // Auto-detect the CSV type based on headers
    const firstLine = csvText.split('\n')[0].toLowerCase();
    const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));

    if (headers.includes('source store order id')) {
      // This is an outbound shipment file
      console.log("Detected outbound shipment data.");
      const result = await importFromCsv({ csvText });
      return { ...result, dataType: 'outbound' };

    } else if (headers.includes('clientid')) {
      // This is an inbound shipment file
      console.log("Detected inbound shipment data.");
      const result = await importInboundFromCsv({ csvText });
      return { ...result, dataType: 'inbound' };

    } else {
      console.error("Could not determine CSV type. Headers found:", headers);
      return {
        success: false,
        message: 'Could not determine data type. Please ensure headers include either "Source Store Order ID" (for outbound) or "clientId" (for inbound).',
        dataType: 'unknown',
      };
    }
  }
);
