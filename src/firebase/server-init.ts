
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, signInWithCustomToken, Auth } from 'firebase/auth';
import { sign } from 'jsonwebtoken';

// Use a unique name for the server app instance to avoid conflicts.
const SERVER_APP_NAME = 'firebase-server-app';

// Store cached instances to avoid re-initialization.
let serverApp: FirebaseApp | null = null;
let serverAuth: Auth | null = null;
let serverFirestore: Firestore | null = null;

/**
 * Initializes the Firebase SDK on the server using a service account.
 * This provides admin-like privileges for server-side flows (e.g., Genkit).
 * It creates a custom JWT token to authenticate as a "server user".
 */
async function initializeServerApp() {
  // If the app is already initialized and the user is authenticated, return cached instances.
  if (serverApp && serverFirestore && serverAuth?.currentUser) {
    return { firebaseApp: serverApp, firestore: serverFirestore, auth: serverAuth };
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
  const token = sign({ uid: serverUid }, privateKey, {
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

  // Initialize the Firebase app instance, or get it if it already exists.
  serverApp = getApps().find(a => a.name === SERVER_APP_NAME) || initializeApp(firebaseConfig, SERVER_APP_NAME);
  
  serverAuth = getAuth(serverApp);
  
  // If we're not already signed in, sign in with the custom token.
  if (!serverAuth.currentUser || serverAuth.currentUser.uid !== serverUid) {
    await signInWithCustomToken(serverAuth, token);
  }
  
  // Get firestore instance for the named database.
  serverFirestore = getFirestore(serverApp, 'shipment-look');

  return { firebaseApp: serverApp, firestore: serverFirestore, auth: serverAuth };
}

/**
 * Gets a server-side, authenticated Firestore instance.
 * This is the primary function to be used by Genkit flows.
 */
export async function initializeFirebaseOnServer(): Promise<{ firestore: Firestore, auth: Auth, firebaseApp: FirebaseApp }> {
  return initializeServerApp();
}
