
import { config } from 'dotenv';
import path from 'path';

// Load environments
config({ path: path.resolve(process.cwd(), '.env') });
config({ path: path.resolve(process.cwd(), 'secrets.env') });

import { initializeFirebaseOnServer } from '@/firebase/server-init';
import { syncRecentShipments } from '@/ai/flows/sync-recent-shipments';

async function main() {
  console.log('Initializing Firebase...');
  const { firestore } = initializeFirebaseOnServer();
  const appId = process.env.NEXT_PUBLIC_APP_ID || 'default-app-id';
  
  const shipmentsPath = `artifacts/${appId}/public/data/shipments`;
  const inboundsPath = `artifacts/${appId}/public/data/inbounds`;

  console.log(`Targeting App ID: ${appId}`);
  console.log(`Clearing collection: ${shipmentsPath}`);
  await deleteCollection(firestore, shipmentsPath);
  
  console.log(`Clearing collection: ${inboundsPath}`);
  await deleteCollection(firestore, inboundsPath);
  
  console.log('Deletion complete. Starting sync for last 14 days...');
  
  try {
      const result = await syncRecentShipments({ days: 14 });
      console.log('Sync Result:', result);
  } catch (error) {
      console.error('Error during sync:', error);
  }
  
  console.log('Done.');
  process.exit(0);
}

async function deleteCollection(db: any, collectionPath: string, batchSize = 500) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise<void>((resolve, reject) => {
    deleteQueryBatch(db, query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(db: any, query: any, resolve: any) {
  const snapshot = await query.get();

  const batchSize = snapshot.size;
  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc: any) => {
    batch.delete(doc.ref);
  });
  await batch.commit();

  process.nextTick(() => {
    deleteQueryBatch(db, query, resolve);
  });
}

main().catch(console.error);
