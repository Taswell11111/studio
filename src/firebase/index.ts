'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from "firebase/analytics";

// A type to hold all our initialized Firebase services
export interface FirebaseServices {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  storage: FirebaseStorage;
}

let firebaseServices: FirebaseServices | null = null;

/**
 * Initializes Firebase services on the client-side.
 * This function is idempotent, meaning it can be called multiple times
 * without re-initializing the app. It returns a single instance of
 * all necessary Firebase services.
 */
export function initializeFirebase(): FirebaseServices {
  // If services are already initialized, return them
  if (firebaseServices) {
    return firebaseServices;
  }

  // If no Firebase app has been initialized, create a new one
  if (!getApps().length) {
    const app = initializeApp(firebaseConfig);
    
    // Initialize Analytics if supported
    if (typeof window !== 'undefined') {
      isSupported().then(supported => {
        if (supported) {
          getAnalytics(app);
        }
      });
    }
  }

  const app = getApp();
  
  // Create the services object and cache it
  firebaseServices = {
    firebaseApp: app,
    auth: getAuth(app),
    firestore: getFirestore(app),
    storage: getStorage(app),
  };

  return firebaseServices;
}

// Export the hooks and providers that will be used in the application
export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
export { getStorage, ref, getDownloadURL } from 'firebase/storage';