
'use server';
import { config } from 'dotenv';
config();

/**
 * @fileOverview A Genkit flow to perform a batch lookup of multiple shipments.
 * It takes an array of search terms and searches for each one in parallel,
 * with an option to filter by specific stores.
 */

import { ai } from '@/ai/genkit';
import {
  MultiLookupShipmentInputSchema,
  type MultiLookupShipmentInput,
  MultiLookupShipmentOutputSchema,
  type MultiLookupShipmentOutput,
  type ShipmentRecord,
} from '@/types';
import { lookupShipment } from './lookup-shipment';


export async function multiLookupShipment(input: MultiLookupShipmentInput): Promise<MultiLookupShipmentOutput> {
  return multiLookupShipmentFlow(input);
}


const multiLookupShipmentFlow = ai.defineFlow(
  {
    name: 'multiLookupShipmentFlow',
    inputSchema: MultiLookupShipmentInputSchema,
    outputSchema: MultiLookupShipmentOutputSchema,
  },
  async ({ searchTerms, storeNames }) => {
    const results: ShipmentRecord[] = [];
    const notFound: string[] = [];

    // If specific stores are selected, run lookups for each of them.
    // Otherwise, run a general lookup without a specific store.
    const lookupPromises = storeNames && storeNames.length > 0
      ? searchTerms.flatMap(term => 
          storeNames.map(storeName => lookupShipment({ sourceStoreOrderId: term, storeName }))
        )
      : searchTerms.map(term => 
          lookupShipment({ sourceStoreOrderId: term })
        );

    try {
        const responses = await Promise.all(lookupPromises);

        // This map will store the original search term for each found shipment ID.
        // It helps associate results back to the original query when notFound is calculated.
        const foundShipmentTermMap = new Map<string, string>();

        responses.forEach((response) => {
            if (response.shipment) {
                // Check for duplicates before adding
                if (!results.some(r => r.id === response.shipment!.id)) {
                    results.push(response.shipment);
                }
                 // Also add related inbound if it exists and is not already in results
                if (response.relatedInbound && !results.some(r => r.id === response.relatedInbound!.id)) {
                    results.push(response.relatedInbound);
                }

                // Map the found shipment ID back to its original search term.
                // This logic is simplified; a direct lookup returns the same term.
                // For a broader search, this mapping would be more complex.
                const originalTerm = searchTerms.find(st => String(response.shipment?.['Shipment ID']).includes(st) || String(response.shipment?.['Source Store Order ID']).includes(st));
                if(originalTerm) {
                    foundShipmentTermMap.set(originalTerm, response.shipment.id);
                }
            }
        });
        
        // Determine which of the original search terms were not found.
        const foundTerms = new Set(Array.from(foundShipmentTermMap.keys()));
        const notFoundTerms = searchTerms.filter(term => !foundTerms.has(term));

        // Deduplicate results based on 'id' to handle cases where a term is found in multiple selected stores.
        const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());

        return {
            results: uniqueResults,
            notFound: notFoundTerms,
        };

    } catch (error: any) {
        console.error("Error in multi-lookup flow:", error);
        return {
            results: [],
            notFound: searchTerms,
            error: `A critical error occurred: ${error.message}`,
        };
    }
  }
);
