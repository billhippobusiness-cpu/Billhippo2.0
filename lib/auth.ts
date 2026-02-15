/**
 * Firebase Authentication Service for BillHippo
 * Handles user sign-up, sign-in, sign-out, and session management.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';

// Sign up with email & password
export async function signUp(email: string, password: string, displayName: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });

  // Create user document in Firestore
  await setDoc(doc(db, 'users', credential.user.uid), {
    email,
    displayName,
    createdAt: serverTimestamp(),
    plan: 'free',
  });

  return credential.user;
}

// Sign in with email & password
export async function signIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

// Sign in with Google
export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  // Create user doc if first time
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists()) {
    await setDoc(doc(db, 'users', user.uid), {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: serverTimestamp(),
      plan: 'free',
    });
  }

  return user;
}

// Sign out
export async function logOut() {
  await signOut(auth);
}

// Password reset
export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

// Listen to auth state changes
export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
