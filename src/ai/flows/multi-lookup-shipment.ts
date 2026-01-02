
'use server';
import { config } from 'dotenv';
config();

/**
 * @fileOverview A Genkit flow to perform a batch lookup of multiple shipments.
 * It takes an array of search terms and searches for each one in parallel,
 * with an option to filter by specific stores and direction (inbound/outbound).
 * This is now a streaming flow that yields logs and the final result.
 */

import { ai } from '@/ai/genkit';
import {
  MultiLookupShipmentInputSchema,
  MultiLookupShipmentStreamChunkSchema,
  type MultiLookupShipmentOutput,
  type ShipmentRecord,
} from '@/types';
import { lookupShipmentFlow } from './lookup-shipment';

export const multiLookupShipmentFlow = ai.defineFlow(
  {
    name: 'multiLookupShipmentFlow',
    inputSchema: MultiLookupShipmentInputSchema,
    outputSchema: MultiLookupShipmentStreamChunkSchema,
    stream: true,
  },
  async function* ({ searchTerms, storeNames, direction, abortSignal }) {
    const results: ShipmentRecord[] = [];
    const notFound: string[] = [];

    const lookupPromises = searchTerms.map(async (term) => {
        const logs: string[] = [];
        let termResult: ShipmentRecord | null = null;
        let termRelated: ShipmentRecord | null = null;
        
        // Correctly invoke the sub-flow using .stream() to get the async iterable
        const flowResponse = lookupShipmentFlow.stream({ 
            sourceStoreOrderId: term, 
            searchBy: 'all', // Defaulting to 'all' as multi-lookup usually implies generic ID search
            storeName: storeNames && storeNames.length > 0 ? storeNames[0] : undefined, // simplify for now
            direction,
            abortSignal,
        });
        
        const singleLookupStream = flowResponse.stream;

        for await (const chunk of singleLookupStream) {
            if (chunk.log) {
                logs.push(`[${term}] ${chunk.log}`);
            }
            if(chunk.result?.shipment) {
                termResult = chunk.result.shipment;
            }
             if(chunk.result?.relatedInbound) {
                termRelated = chunk.result.relatedInbound;
            }
        }

        return { originalTerm: term, foundShipment: termResult, foundRelated: termRelated, logs };
    });

    try {
      // We can't use Promise.all directly if we want to stream logs as they happen.
      // Instead, we iterate and await one by one, yielding logs immediately.
      for (const promise of lookupPromises) {
          yield { log: `Starting lookup for next term...` };
          const res = await promise;
          
          for (const log of res.logs) {
            yield { log };
          }
          
          if (res.foundShipment) {
              if (!results.some(r => r.id === res.foundShipment!.id)) {
                  results.push(res.foundShipment);
              }
              if (res.foundRelated && !results.some(r => r.id === res.foundRelated!.id)) {
                  results.push(res.foundRelated);
              }
          } else {
              notFound.push(res.originalTerm);
          }
      }
      
      const uniqueResults = Array.from(new Map(results.map(item => [item.id, item])).values());
      const finalResult: MultiLookupShipmentOutput = { results: uniqueResults, notFound: notFound };
      yield { result: finalResult };

    } catch (error: any) {
        if (error.name === 'AbortError' || (error.message && error.message.includes('aborted'))) {
            yield { log: 'Multi-lookup flow was aborted.' };
            yield { result: { results: [], notFound: searchTerms, error: 'Search was aborted by user.' } };
        } else {
            console.error("Error in multi-lookup flow:", error);
            yield { result: { results: [], notFound: searchTerms, error: `A critical error occurred: ${error.message}` } };
        }
    }
  }
);
