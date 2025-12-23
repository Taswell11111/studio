'use server';

import { updateShipmentStatus } from '@/ai/flows/update-shipment-status';
import { initializeFirebaseOnServer } from '@/firebase/server-init';
import type { Shipment } from '@/types';

/**
 * Server action to refresh the status of all shipment records in Firestore.
 * It fetches all shipments, then iterates through them, calling the 
 * updateShipmentStatus flow for each one.
 */
export async function refreshAllShipmentsAction() {
  try {
    const { firestore } = initializeFirebaseOnServer();
    const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
    const shipmentsRef = firestore.collection(`artifacts/${appId}/public/data/shipments`);
    
    const querySnapshot = await shipmentsRef.get();
    const shipmentsToRefresh = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shipment));

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    // Use Promise.allSettled to run updates in parallel for efficiency
    const results = await Promise.allSettled(
      shipmentsToRefresh.map(shipment => {
        if (!shipment.id || !shipment['Tracking No'] || !shipment['Courier']) {
          // Skip records with missing essential data
          return Promise.resolve({ status: 'skipped', reason: `Skipped ${shipment.id || 'unknown'}: missing ID, Tracking No, or Courier.` });
        }
        return updateShipmentStatus({
          shipmentId: shipment.id,
          trackingNo: shipment['Tracking No'],
          courier: shipment['Courier'],
        });
      })
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        // Check if the updateShipmentStatus flow itself was successful
        const flowResult = result.value as { success: boolean; message?: string, status?: string };
        if (flowResult.success) {
          successCount++;
        } else if (flowResult.status === 'skipped') {
           console.warn(flowResult.reason);
        }
        else {
          failCount++;
          const shipmentId = shipmentsToRefresh[index]?.id || 'unknown';
          errors.push(`Failed ${shipmentId}: ${flowResult.message || 'Unknown flow error'}`);
        }
      } else {
        // The promise was rejected (unexpected error in the flow)
        failCount++;
        const shipmentId = shipmentsToRefresh[index]?.id || 'unknown';
        errors.push(`Failed ${shipmentId}: ${result.reason?.message || 'An unexpected error occurred'}`);
      }
    });

    if (failCount > 0) {
      console.error('Some shipments failed to update:', errors);
    }
    
    return { 
      success: failCount === 0, 
      successCount, 
      failCount,
      error: failCount > 0 ? `Failed to update ${failCount} shipments. See server logs for details.` : undefined
    };

  } catch (error) {
    console.error("Error in refreshAllShipmentsAction:", error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred';
    return { 
        success: false, 
        successCount: 0,
        failCount: 0,
        error: errorMessage 
    };
  }
}
