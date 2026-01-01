
'use server';
import { config } from 'dotenv';
config();

/**
 * @fileOverview A Genkit flow to perform a batch lookup of multiple shipments.
 * It takes an array of search terms and searches for each one in parallel.
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
  async ({ searchTerms }) => {
    const results: ShipmentRecord[] = [];
    const notFound: string[] = [];

    const lookupPromises = searchTerms.map(term => 
      lookupShipment({ sourceStoreOrderId: term })
    );

    try {
        const responses = await Promise.all(lookupPromises);

        responses.forEach((response, index) => {
            if (response.shipment) {
                results.push(response.shipment);
                // If there's a related inbound, add it to the results as well
                if(response.relatedInbound) {
                    results.push(response.relatedInbound);
                }
            } else {
                notFound.push(searchTerms[index]);
            }
        });

        // Deduplicate results based on 'id'
        const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());

        return {
            results: uniqueResults,
            notFound,
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
