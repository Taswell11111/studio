
'use server';

import { syncRecentShipments } from '@/ai/flows/sync-recent-shipments';
import { testParcelninjaConnectionFlow } from '@/ai/flows/test-parcelninja-connection';
import { multiLookupShipmentFlow } from '@/ai/flows/multi-lookup-shipment';
import { lookupShipmentFlow } from '@/ai/flows/lookup-shipment';
import { getAllRecords } from '@/ai/flows/get-all-records';
import type { LookupShipmentInput, MultiLookupShipmentInput, ShipmentRecord } from '@/types';


/**
 * Server action to trigger the synchronization of recent shipment records.
 * It calls the sync flow for a specific date range.
 */
export async function refreshAllShipmentsAction() {
  try {
    // Update default records to last 14 days of outbounds and inbounds as requested.
    // This serves as the 'base data' for local cache searches.
    const days = 14;
    
    const result = await syncRecentShipments({ days });

    if (!result.success && result.errors.length > 0) {
      console.error('Sync process had errors:', result.errors);
      return { 
        success: false, 
        successCount: result.recordsUpdated, 
        failCount: result.errors.length,
        error: `Sync partially failed. ${result.errors.join('; ')}`
      };
    }
    
    return { 
      success: true, 
      successCount: result.recordsUpdated + result.recordsCreated, 
      failCount: 0,
      message: result.message,
    };

  } catch (error) {
    console.error("Critical error in refreshAllShipmentsAction:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred during sync.';
    return { 
        success: false, 
        successCount: 0,
        failCount: 1,
        error: errorMessage 
    };
  }
}

/**
 * Server action to test the connection to the Parcelninja API for all configured stores.
 * This action now correctly returns a ReadableStream for live log updates.
 */
export async function testConnectionsAction(): Promise<Response> {
  try {
    const flowStream = testParcelninjaConnectionFlow();
    
    const readableStream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          for await (const chunk of flowStream) {
            controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n\n'));
          }
        } catch (e: any) {
           console.error("Error in stream processing:", e);
           const errorChunk = { error: e.message || "An unknown stream error occurred." };
           controller.enqueue(encoder.encode(JSON.stringify(errorChunk) + '\n\n'));
        } finally {
            controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error("Critical error in testConnectionsAction:", error);
    return new Response(JSON.stringify({ error: error.message || 'An unknown error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


/**
 * Server action to perform a multi-shipment lookup and stream results.
 */
export async function multiLookupAction(input: MultiLookupShipmentInput): Promise<Response> {
    try {
        const flowStream = multiLookupShipmentFlow(input);
        const readableStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                try {
                    for await (const chunk of flowStream) {
                        // Manually reconstruct the object to ensure it is plain.
                        const plainChunk = {
                            log: chunk.log,
                            result: chunk.result ? {
                                results: chunk.result.results,
                                notFound: chunk.result.notFound,
                                error: chunk.result.error,
                            } : undefined,
                            error: chunk.error ? { message: chunk.error.message } : undefined,
                        };
                        controller.enqueue(encoder.encode(JSON.stringify(plainChunk) + '\n\n'));
                    }
                } catch (e: any) {
                    console.error("Error in multi-lookup stream processing:", e);
                    const errorChunk = { error: { message: e.message || "An unknown stream error occurred." }};
                    controller.enqueue(encoder.encode(JSON.stringify(errorChunk) + '\n\n'));
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(readableStream, {
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error("Critical error in multiLookupShipmentAction:", error);
        return new Response(JSON.stringify({ error: { message: error.message || 'An unknown server error occurred' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
    }
}


/**
 * Server action to perform a single shipment lookup and stream results.
 */
export async function singleLookupAction(input: LookupShipmentInput): Promise<Response> {
    try {
        const flowStream = lookupShipmentFlow(input);
        const readableStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                try {
                    for await (const chunk of flowStream) {
                        // Manually reconstruct the object to ensure it is plain.
                        const plainChunk = {
                          log: chunk.log,
                          result: chunk.result ? {
                            shipment: chunk.result.shipment,
                            relatedInbound: chunk.result.relatedInbound,
                            error: chunk.result.error,
                          } : undefined,
                          error: chunk.error ? { message: chunk.error.message } : undefined,
                        };
                        controller.enqueue(encoder.encode(JSON.stringify(plainChunk) + '\n\n'));
                    }
                } catch (e: any) {
                    console.error("Error in single-lookup stream processing:", e);
                    const errorChunk = { error: { message: e.message || "An unknown stream error occurred." } };
                    controller.enqueue(encoder.encode(JSON.stringify(errorChunk) + '\n\n'));
                } finally {
                    controller.close();
                }
            },
        });
        return new Response(readableStream, {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        console.error("Critical error in singleLookupAction:", error);
        return new Response(JSON.stringify({ error: { message: error.message || 'An unknown error occurred' } }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
    }
}


/**
 * Server action to fetch all records from the database for export.
 */
export async function exportAllRecordsAction(): Promise<{ records: ShipmentRecord[], error?: string }> {
  try {
    const result = await getAllRecords();
    return { records: result.records };
  } catch (error: any) {
    console.error("Critical error in exportAllRecordsAction:", error);
    return {
        records: [],
        error: error.message || 'An unknown server error occurred while exporting records.',
    };
  }
}
