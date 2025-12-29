'use server';

import { syncRecentShipments } from '@/ai/flows/sync-recent-shipments';
import { testParcelninjaConnection } from '@/ai/flows/test-parcelninja-connection';
import { differenceInDays } from 'date-fns';

/**
 * Server action to trigger the synchronization of recent shipment records.
 * It calls the sync flow for records from a specific start date.
 */
export async function refreshAllShipmentsAction() {
  try {
    // Calculate the number of days from Dec 10, 2025 to today
    const startDate = new Date('2025-12-10T00:00:00Z');
    const today = new Date();
    const daysToSync = differenceInDays(today, startDate);
    
    // Ensure we sync at least one day if the date is in the future or same day
    const days = daysToSync > 0 ? daysToSync : 1;

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
