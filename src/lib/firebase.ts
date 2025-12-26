import { initializeApp, FirebaseApp } from 'firebase/app';
import { getMessaging, Messaging } from 'firebase/messaging';

// Firebase configuration - replace with your values from Firebase Console
// Go to: Firebase Console > Project Settings > General > Your apps > Web app
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.warn('Firebase config is missing. Please add VITE_FIREBASE_* variables to .env');
    return null;
  }

  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  return app;
}

export function getFirebaseMessaging(): Messaging | null {
  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) return null;

  if (!messaging) {
    try {
      messaging = getMessaging(firebaseApp);
    } catch (error) {
      console.error('Failed to initialize Firebase Messaging:', error);
      return null;
    }
  }
  return messaging;
}

export { firebaseConfig };
