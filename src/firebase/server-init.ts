
import * as admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

/**
 * Initializes the Firebase Admin SDK on the server.
 * This is used by Genkit flows to interact with Firestore with admin privileges.
 * It ensures that a single instance is created and reused.
 */
export function initializeFirebaseOnServer(): { firestore: Firestore } {
  if (admin.apps.length > 0) {
    // Return the firestore instance for the named database.
    return {
      firestore: getFirestore(undefined, { databaseId: 'shipment-look' }),
    };
  }

  try {
    // This will automatically use the service account credentials available
    // in the Google Cloud environment (like Application Default Credentials).
    admin.initializeApp();
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization failed:', error.message);
    // Re-throwing the error to make it clear that the server cannot proceed
    // without successful initialization.
    throw new Error('Could not initialize Firebase Admin SDK. Ensure server environment is configured with appropriate credentials.');
  }

  // Return the firestore instance for the named database after initialization.
  return {
    firestore: getFirestore(undefined, { databaseId: 'shipment-look' }),
  };
}

    