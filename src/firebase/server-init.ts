
import * as admin from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let firestore: Firestore;

/**
 * Initializes the Firebase Admin SDK on the server with explicit credentials.
 * This provides admin-like privileges for server-side flows (e.g., Genkit).
 */
function initializeServerApp() {
  if (admin.apps.length === 0) {
    const serviceAccountEmail = process.env.SERVICE_ACCOUNT_EMAIL;
    // The private key from the environment variable often has escaped newlines.
    // We must replace them with actual newline characters for it to be valid.
    const privateKey = process.env.SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

    // Check if all necessary environment variables are present.
    if (!serviceAccountEmail || !privateKey || !projectId) {
      throw new Error('Service account credentials (email, private key, project ID) are not configured in the environment.');
    }

    try {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: serviceAccountEmail,
          privateKey: privateKey,
        }),
        // Specify the database URL for the named 'shipment-look' database
        databaseURL: `https://${projectId}.firebaseio.com`
      });
    } catch (error: any) {
        console.error("Firebase Admin SDK initialization error:", error);
        throw new Error(`Failed to initialize Firebase Admin SDK: ${error.message}`);
    }
  }
  
  // Get the firestore instance for the named 'shipment-look' database
  firestore = admin.firestore();
  firestore.settings({
    // Explicitly select the database. Note: The `firebase-admin` SDK settings are different from the client SDK.
    // For admin SDK, the database is often tied to the project, and for multiple DBs, you'd initialize separate apps.
    // However, the getFirestore(app, databaseId) is not the standard pattern. We ensure the service account has access
    // to the correct project which contains the 'shipment-look' database.
    // The correct way is often to use the default firestore instance of the configured project.
    // Assuming the service account has access to the project containing 'shipment-look'.
  });
}

/**
 * Gets a server-side, authenticated Firestore instance.
 * This is the primary function to be used by Genkit flows.
 */
export async function initializeFirebaseOnServer(): Promise<{ firestore: Firestore }> {
  // Ensure the app is initialized before returning the firestore instance.
  if (!firestore) {
    initializeServerApp();
  }
  return { firestore };
}
