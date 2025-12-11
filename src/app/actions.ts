
'use server';

import { getAllShipments as dbGetAllShipments } from '@/lib/db';
import { updateShipmentStatus } from '@/ai/flows/update-shipment-status';
import { Shipment } from '@/types';

export async function refreshAllShipmentsAction() {
  try {
    const shipments = await dbGetAllShipments();
    let successCount = 0;
    let failCount = 0;

    await Promise.all(
      shipments.map(async (shipment: Shipment) => {
        if (!shipment.id || !shipment['Tracking No'] || !shipment['Courier']) {
          failCount++;
          return;
        }

        try {
          const result = await updateShipmentStatus({
            shipmentId: shipment.id,
            trackingNo: shipment['Tracking No'] as string,
            courier: shipment['Courier'] as string,
          });

          if (result.success) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (e) {
          failCount++;
          console.error(`Failed to update shipment ${shipment.id}:`, e);
        }
      })
    );

    return { success: true, successCount, failCount };
  } catch (error) {
    console.error('Error refreshing all shipments:', error);
    return { success: false, error: 'Could not update all shipments.' };
  }
}
