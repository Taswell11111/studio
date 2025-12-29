
import * as admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

const APP_NAME = 'SHIPMENT_LOOK_ADMIN_APP';

/**
 * Initializes the Firebase Admin SDK on the server.
 * This is used by Genkit flows to interact with Firestore with admin privileges.
 * It ensures that a single instance is created and reused.
 */
export function initializeFirebaseOnServer(): { firestore: Firestore } {
  // The Admin SDK automatically finds credentials in a Google Cloud environment.
  // We initialize without specific options to let this happen.
  // We use a named app to prevent conflicts if other initializations exist.
  if (!admin.apps.find(app => app?.name === APP_NAME)) {
    admin.initializeApp({
        // No explicit config needed here; it will use Application Default Credentials.
    }, APP_NAME);
  }
  
  const app = admin.app(APP_NAME);

  // Get the Firestore instance for the specific 'shipment-look' database.
  const firestore = getFirestore(app, 'shipment-look');
  
  return { firestore };
}
