
import * as admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let firestore: Firestore;

/**
 * Initializes the Firebase Admin SDK on the server.
 * This provides admin-like privileges for server-side flows (e.g., Genkit).
 * It uses the service account credentials automatically provided by the environment.
 */
function initializeServerApp() {
  if (admin.apps.length === 0) {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) {
      throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID is not configured in the environment.');
    }

    // When running in a Google Cloud environment (like App Hosting),
    // the SDK can automatically discover credentials.
    admin.initializeApp({
      projectId: projectId,
    });
  }
  
  // Get the firestore instance for the named 'shipment-look' database
  firestore = getFirestore(admin.app(), 'shipment-look');
}

/**
 * Gets a server-side, authenticated Firestore instance.
 * This is the primary function to be used by Genkit flows.
 */
export function initializeFirebaseOnServer(): { firestore: Firestore } {
  // Ensure the app is initialized before returning the firestore instance.
  if (!firestore) {
    initializeServerApp();
  }
  return { firestore };
}
