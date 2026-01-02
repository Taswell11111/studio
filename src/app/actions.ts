
'use server';

import { syncRecentShipments } from '@/ai/flows/sync-recent-shipments';
import { testParcelninjaConnectionFlow } from '@/ai/flows/test-parcelninja-connection';
import { multiLookupShipment } from '@/ai/flows/multi-lookup-shipment';
import { getAllRecords } from '@/ai/flows/get-all-records';
import type { MultiLookupShipmentInput, MultiLookupShipmentOutput, ShipmentRecord } from '@/types';
import { ai } from '@/ai/genkit';


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
    const stream = new ReadableStream({
      async start(controller) {
        // Correctly call the flow which is an async generator
        const flowStream = testParcelninjaConnectionFlow();
        const encoder = new TextEncoder();

        for await (const chunk of flowStream) {
          controller.enqueue(encoder.encode(JSON.stringify(chunk) + '\n'));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
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
 * Server action to perform a multi-shipment lookup.
 */
export async function multiLookupShipmentAction(input: MultiLookupShipmentInput): Promise<MultiLookupShipmentOutput> {
    try {
        return await multiLookupShipment(input);
    } catch (error: any) {
        console.error("Critical error in multiLookupShipmentAction:", error);
        return {
            results: [],
            notFound: input.searchTerms,
            error: error.message || 'An unknown server error occurred.',
        };
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
