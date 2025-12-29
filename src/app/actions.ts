
'use server';

import { syncRecentShipments } from '@/ai/flows/sync-recent-shipments';
import { testParcelninjaConnection } from '@/ai/flows/test-parcelninja-connection';

/**
 * Server action to trigger the synchronization of recent shipment records.
 * It calls the sync flow for a specific date range.
 */
export async function refreshAllShipmentsAction() {
  try {
    // This will sync all records between the specified dates.
    const fromDate = new Date('2025-12-10');
    const toDate = new Date('2025-12-29');
    const days = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 3600 * 24));
    
    const result = await syncRecentShipments({ days, fromDate: fromDate.toISOString(), toDate: toDate.toISOString() });

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
 */
export async function testConnectionsAction() {
  try {
    const result = await testParcelninjaConnection();
    return result;
  } catch (error: any) {
    console.error("Critical error in testConnectionsAction:", error);
    return {
      results: [],
      logs: ['A critical error occurred during connection test.'],
      error: error.message || 'An unknown server error occurred during connection test.',
    }
  }
}
