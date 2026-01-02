
'use server';
import { config } from 'dotenv';
config();

/**
 * @fileOverview A Genkit flow to perform a batch lookup of multiple shipments.
 * It takes an array of search terms and searches for each one in parallel,
 * with an option to filter by specific stores and direction (inbound/outbound).
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
  async ({ searchTerms, storeNames, direction, abortSignal }) => {
    const results: ShipmentRecord[] = [];
    const notFound: string[] = [];

    const lookupPromises = searchTerms.map(term => 
        lookupShipment({ 
            sourceStoreOrderId: term, 
            storeNames: storeNames && storeNames.length > 0 ? storeNames : undefined,
            direction,
            abortSignal,
        })
    );

    try {
        const responses = await Promise.all(lookupPromises);
        
        if (abortSignal?.aborted) {
          throw new Error('Flow aborted');
        }

        const foundShipmentTermMap = new Map<string, string>();

        responses.forEach((response, index) => {
            const originalTerm = searchTerms[index];
            if (response.shipment) {
                if (!results.some(r => r.id === response.shipment!.id)) {
                    results.push(response.shipment);
                }
                if (response.relatedInbound && !results.some(r => r.id === response.relatedInbound!.id)) {
                    results.push(response.relatedInbound);
                }
                foundShipmentTermMap.set(originalTerm, response.shipment.id);
            } else {
                notFound.push(originalTerm);
            }
        });
        
        const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());

        return {
            results: uniqueResults,
            notFound: notFound,
        };

    } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'Flow aborted') {
            console.log('Multi-lookup flow was aborted.');
            // Return what we have so far, if anything.
            return {
                results: [],
                notFound: searchTerms,
                error: 'Search was aborted by user.',
            };
        }
        console.error("Error in multi-lookup flow:", error);
        return {
            results: [],
            notFound: searchTerms,
            error: `A critical error occurred: ${error.message}`,
        };
    }
  }
);
