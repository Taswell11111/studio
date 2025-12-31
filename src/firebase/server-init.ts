
import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

// We will maintain a single instance of the server-side app.
let serverApp: FirebaseApp;
let firestore: Firestore;

/**
 * Initializes a server-side Firebase app instance.
 * This is designed to be used by server-side code like Genkit flows.
 * It relies on the environment's service account for authentication,
 * which is the standard practice for Google Cloud environments.
 */
function initializeServerApp() {
  // getApps() checks if an app is already initialized.
  if (!getApps().some(app => app.name === 'server-app')) {
    // Initialize a new app with a unique name to avoid conflicts with the client app.
    serverApp = initializeApp(firebaseConfig, 'server-app');
  } else {
    // If it's already initialized, just get the instance.
    serverApp = getApp('server-app');
  }
  // Get the Firestore instance for the named 'shipment-look' database.
  firestore = getFirestore(serverApp, 'shipment-look');
}

/**
 * Gets a server-side, authenticated Firestore instance.
 * This function ensures Firebase is initialized and returns the firestore service.
 * It is idempotent and safe to call multiple times.
 */
export async function initializeFirebaseOnServer(): Promise<{ firestore: Firestore }> {
  // Ensure the app is initialized before returning the firestore instance.
  if (!firestore) {
    initializeServerApp();
  }
  return { firestore };
}
