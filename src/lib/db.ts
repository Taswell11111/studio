import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { Shipment } from '@/types';

const { firestore: db } = initializeFirebaseOnServer();

export { db };

export async function getAllShipments(): Promise<Shipment[]> {
  const shipmentsCol = db.collection('shipments');
  const shipmentSnapshot = await shipmentsCol.get();
  const shipmentList = shipmentSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) as Shipment[];
  return shipmentList;
}

export async function updateShipment(id: string, data: Partial<Shipment>): Promise<void> {
  const shipmentRef = db.collection('shipments').doc(id);
  await shipmentRef.update(data);
}
