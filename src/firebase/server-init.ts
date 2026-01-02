
import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';
import * as admin from 'firebase-admin';
import { getFirestore as getAdminFirestore, Firestore as AdminFirestore } from 'firebase-admin/firestore';

/**
 * Initializes the Firebase Admin SDK on the server.
 * This is used by Genkit flows to interact with Firestore with admin privileges.
 */
export function initializeFirebaseOnServer(): { firestore: AdminFirestore } {
    if (admin.apps.length === 0) {
         try {
            // Initialize with explicit project ID to avoid ambiguity.
            admin.initializeApp({
                projectId: firebaseConfig.projectId,
            });
         } catch (error: any) {
             console.error('Firebase Admin SDK initialization failed:', error.message);
             // Re-throwing the error to make it clear that the server cannot proceed
            // without successful initialization.
            throw new Error('Could not initialize Firebase Admin SDK. Ensure server environment is configured with appropriate credentials.');
         }
    }
  
  // The client is configured to use the '(default)' database.
  // We must explicitly connect to the same database on the server.
  return {
    firestore: getAdminFirestore(),
  };
}
