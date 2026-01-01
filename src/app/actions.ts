
'use server';

import { syncRecentShipments } from '@/ai/flows/sync-recent-shipments';
import { testParcelninjaConnection } from '@/ai/flows/test-parcelninja-connection';
import type { ConnectionTestStreamChunk } from '@/types';

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
 * This now uses a ReadableStream to send logs back to the client in real-time.
 */
export async function testConnectionsAction(): Promise<ReadableStream<ConnectionTestStreamChunk>> {
    const flowGenerator = testParcelninjaConnection();
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async pull(controller) {
        const { value, done } = await flowGenerator.next();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(encoder.encode(JSON.stringify(value)));
        }
      },
    });

    return stream;
}
