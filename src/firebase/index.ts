'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from "firebase/analytics";

export function initializeFirebase() {
  if (!getApps().length) {
    const app = initializeApp(firebaseConfig);
    // Initialize Analytics if it's supported in the browser
    if (typeof window !== 'undefined') {
      isSupported().then(supported => {
        if (supported) {
          getAnalytics(app);
        }
      });
    }
    return getSdks(app);
  }

  return getSdks(getApp());
}


export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
    storage: getStorage(firebaseApp),
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
export { getStorage, ref, getDownloadURL } from 'firebase/storage';
