'use client';

import React, { DependencyList, createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore } from 'firebase/firestore';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseStorage } from 'firebase/storage';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener'
import type { FirebaseServices } from '@/firebase';

// This interface combines the Firebase services with the user's auth state.
// It defines the complete value provided by our context.
export interface FirebaseContextState extends FirebaseServices {
  user: User | null;
  isUserLoading: boolean; 
  userError: Error | null; 
}

// React Context that will hold all our Firebase state and services.
export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

// Define the props for our main provider component. It expects all Firebase services.
interface FirebaseProviderProps extends FirebaseServices {
  children: ReactNode;
}


export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
  storage
}) => {
  // State to hold the current user, loading status, and any auth errors.
  const [userState, setUserState] = useState<{
    user: User | null;
    isUserLoading: boolean;
    userError: Error | null;
  }>({
    user: null,
    isUserLoading: true, // Start in a loading state.
    userError: null,
  });

  // Effect to subscribe to Firebase Auth state changes.
  useEffect(() => {
    // If auth service isn't available, exit loading state with an error.
    if (!auth) { 
      setUserState({ user: null, isUserLoading: false, userError: new Error("Auth service not provided.") });
      return;
    }
    
    // Set loading to true whenever the auth object changes.
    setUserState({ user: null, isUserLoading: true, userError: null }); 

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        // On successful auth state change, update user and finish loading.
        setUserState({ user: firebaseUser, isUserLoading: false, userError: null });
      },
      (error) => { 
        // On auth error, update state and finish loading.
        console.error("FirebaseProvider: onAuthStateChanged error:", error);
        setUserState({ user: null, isUserLoading: false, userError: error });
      }
    );

    // Cleanup subscription on unmount.
    return () => unsubscribe(); 
  }, [auth]);

  // Memoize the context value to prevent unnecessary re-renders of consumers.
  const contextValue = useMemo((): FirebaseContextState => ({
    firebaseApp,
    firestore,
    auth,
    storage,
    ...userState,
  }), [firebaseApp, firestore, auth, storage, userState]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

// Custom hook to safely access the Firebase context.
function useFirebaseContext() {
    const context = useContext(FirebaseContext);
    if (context === undefined) {
        throw new Error('useFirebaseContext must be used within a FirebaseProvider.');
    }
    return context;
}

// Custom Hooks to provide easy access to specific Firebase services or state.

export const useFirebase = (): FirebaseContextState => {
  return useFirebaseContext();
};

export const useAuth = (): Auth => {
  const { auth } = useFirebaseContext();
  if (!auth) throw new Error("Firebase Auth service is not available.");
  return auth;
};

export const useFirestore = (): Firestore => {
  const { firestore } = useFirebaseContext();
  if (!firestore) throw new Error("Firebase Firestore service is not available.");
  return firestore;
};

export const useStorage = (): FirebaseStorage => {
  const { storage } = useFirebaseContext();
  if (!storage) throw new Error("Firebase Storage service is not available.");
  return storage;
}

export const useFirebaseApp = (): FirebaseApp => {
  const { firebaseApp } = useFirebaseContext();
  if (!firebaseApp) throw new Error("Firebase App is not available.");
  return firebaseApp;
};

export const useUser = () => {
  const { user, isUserLoading, userError } = useFirebaseContext();
  return { user, isUserLoading, userError };
};


// Memoization hook for Firebase queries/references
type MemoFirebase<T> = T & {__memo?: boolean};

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T | (MemoFirebase<T>) {
  const memoized = useMemo(factory, deps);
  
  if(typeof memoized === 'object' && memoized !== null) {
    (memoized as MemoFirebase<T>).__memo = true;
  }
  
  return memoized;
}