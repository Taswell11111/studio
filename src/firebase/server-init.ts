
import * as admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

const APP_NAME = 'SHIPMENT_LOOK_ADMIN';

/**
 * Initializes the Firebase Admin SDK on the server for a specific database.
 * This is used by Genkit flows to interact with Firestore with admin privileges.
 * It ensures that a single instance for the named database is created and reused.
 */
export function initializeFirebaseOnServer(): { firestore: Firestore } {
  // Check if our specifically named app already exists.
  const existingApp = admin.apps.find(app => app?.name === APP_NAME);
  if (existingApp) {
    return { firestore: getFirestore(existingApp) };
  }

  try {
    // Initialize a new app instance with a unique name and the correct database ID.
    const newApp = admin.initializeApp({
      // The databaseURL is crucial for targeting a non-default Firestore database.
      databaseURL: `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`,
      // databaseId is not a valid admin.initializeApp option, so we specify it via databaseURL logic.
      // We also need to specify the project ID for the SDK to work correctly in some environments.
      projectId: process.env.GCLOUD_PROJECT,
    }, APP_NAME);

    return { firestore: getFirestore(newApp, 'shipment-look') };

  } catch (error: any) {
    console.error(`Firebase Admin SDK initialization for ${APP_NAME} failed:`, error.message);
    throw new Error(`Could not initialize Firebase Admin SDK. Ensure server environment is configured with appropriate credentials.`);
  }
}
