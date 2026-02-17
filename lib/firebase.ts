/**
 * Firebase Configuration for BillHippo
 *
 * HOW TO SET UP:
 * 1. Go to https://console.firebase.google.com
 * 2. Select your project (or create one)
 * 3. Click the gear icon → Project Settings
 * 4. Scroll down to "Your apps" → Click the web icon (</>)
 * 5. Register your app with nickname "BillHippo"
 * 6. Copy the firebaseConfig object and paste values below
 * 7. Create a .env file in the project root with these values (see .env.example)
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Use the standard Firebase authDomain (<projectId>.firebaseapp.com) by default.
// This domain is already registered as an authorized redirect URI in Google Cloud
// Console, so Google sign-in works out of the box without extra configuration.
// Set VITE_FIREBASE_AUTH_DOMAIN to override (e.g. for local development).
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
const authDomain =
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || `${projectId}.firebaseapp.com`;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain,
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firebase services
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
