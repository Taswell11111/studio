'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

export function initializeFirebase() {
  if (!getApps().length) {
    let firebaseApp: FirebaseApp;
    // Always attempt to initialize with firebaseConfig if it's available.
    // Firebase App Hosting will override this with its own environment variables at runtime.
    if (firebaseConfig && Object.keys(firebaseConfig).length > 0) {
      firebaseApp = initializeApp(firebaseConfig);
    } else {
      // Fallback for cases where firebaseConfig might be unexpectedly empty or not loaded
      // This should ideally not happen if config.ts is correctly defined.
      console.error("Firebase config is missing or empty. Attempting to initialize without options, this might fail.");
      firebaseApp = initializeApp();
    }

    // Initialize App Check
    if (typeof window !== 'undefined') {
      import('firebase/app-check').then(({ initializeAppCheck, ReCaptchaV3Provider }) => {
        initializeAppCheck(firebaseApp, {
          provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY!),
          isTokenAutoRefreshEnabled: true
        });
      });
    }

    return getSdks(firebaseApp);
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
