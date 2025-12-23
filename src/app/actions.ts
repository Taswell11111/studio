'use server';

import { syncRecentShipments } from '@/ai/flows/sync-recent-shipments';

/**
 * Server action to trigger the synchronization of recent shipment records.
 * It calls the sync flow for records updated in the last 3 days.
 */
export async function refreshAllShipmentsAction() {
  try {
    // Call the new sync flow for the last 3 days
    const result = await syncRecentShipments({ days: 3 });

    if (!result.success && result.errors.length > 0) {
      console.error('Sync process had errors:', result.errors);
      // Return a structured error message summarizing the failures
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
        failCount: 1, // Represents the entire action failing
        error: errorMessage 
    };
  }
}
