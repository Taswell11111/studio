
"use server";

import { updateShipmentStatus } from "@/ai/flows/update-shipment-status";
import { db } from "@/lib/db";
import { Shipment } from "@/types";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";

// Helper to get the date three days ago
function getThreeDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 3);
  return d;
}

export async function refreshAllShipmentsAction() {
  try {
    const threeDaysAgo = getThreeDaysAgo();
    const shipmentsRef = collection(db, "shipments");
    
    // Query for shipments updated in the last 3 days
    const q = query(
      shipmentsRef,
      where("updatedAt", ">=", Timestamp.fromDate(threeDaysAgo))
    );

    const querySnapshot = await getDocs(q);
    const shipmentsToRefresh = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Shipment));

    let successCount = 0;
    let failCount = 0;

    for (const shipment of shipmentsToRefresh) {
      try {
        await updateShipmentStatus.run({
          shipmentId: shipment.id,
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to update shipment ${shipment.id}:`, error);
        failCount++;
      }
    }
    
    return { success: true, successCount, failCount };
  } catch (error) {
    console.error("Error refreshing shipments:", error);
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return { success: false, error: errorMessage };
  }
}
