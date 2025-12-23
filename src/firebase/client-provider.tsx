'use client';

import React, { useMemo, type ReactNode } from 'react';
import { FirebaseProvider } from '@/firebase/provider';
import { initializeFirebase, type FirebaseServices } from '@/firebase';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

/**
 * A client-side component that initializes Firebase and provides its
 * services to all child components through the FirebaseProvider.
 * It ensures that initialization happens only once.
 */
export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  // useMemo ensures that initializeFirebase() is called only once per render.
  // Because initializeFirebase is idempotent, this setup is safe and efficient.
  const services: FirebaseServices = useMemo(() => initializeFirebase(), []);

  return (
    <FirebaseProvider {...services}>
      {children}
    </FirebaseProvider>
  );
}
