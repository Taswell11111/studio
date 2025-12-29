
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { sign } from 'jsonwebtoken';

const APP_NAME = 'SHIPMENT_LOOK_ADMIN_APP';

// Store a cached instance of the initialized app.
let serverApp: FirebaseApp | null = null;
let serverFirestore: Firestore | null = null;

/**
 * Initializes the Firebase SDK on the server using a service account.
 * This provides admin-like privileges for server-side flows (e.g., Genkit).
 * It creates a custom JWT token to authenticate as a "server user".
 */
async function initializeServerApp(): Promise<{ firebaseApp: FirebaseApp, firestore: Firestore }> {
  if (serverApp && serverFirestore) {
    return { firebaseApp: serverApp, firestore: serverFirestore };
  }

  // These should be set as environment variables in the App Hosting backend.
  const serviceAccountEmail = process.env.SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!serviceAccountEmail || !privateKey || !projectId) {
    throw new Error('Service account credentials (email, private key, project ID) are not configured in the environment.');
  }

  // Use a unique UID for the server's identity.
  const serverUid = 'shipment-look-server-worker';

  // Create a custom JWT token. This acts as the "password" for our server.
  const token = sign({ uid: serverUid, /* can add other claims here */ }, privateKey, {
    algorithm: 'RS256',
    issuer: serviceAccountEmail,
    subject: serviceAccountEmail,
    audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
    expiresIn: '1h',
  });

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId: projectId,
  };

  // Initialize the Firebase app instance.
  const app = getApps().find(a => a.name === APP_NAME) || initializeApp(firebaseConfig, APP_NAME);

  const auth = getAuth(app);
  
  // If we're not already signed in, sign in with the custom token.
  if (!auth.currentUser || auth.currentUser.uid !== serverUid) {
    await signInWithCustomToken(auth, token);
  }
  
  const firestore = getFirestore(app, 'shipment-look');

  // Cache the initialized instances.
  serverApp = app;
  serverFirestore = firestore;

  return { firebaseApp: serverApp, firestore: serverFirestore };
}

/**
 * Gets a server-side, authenticated Firestore instance.
 * This is the primary function to be used by Genkit flows.
 */
export async function initializeFirebaseOnServer(): Promise<{ firestore: Firestore }> {
  const { firestore } = await initializeServerApp();
  return { firestore };
}
