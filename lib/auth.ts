/**
 * Firebase Authentication Service for BillHippo
 * Handles user sign-up, sign-in, sign-out, and session management.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp, type DocumentReference } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, googleProvider, db, functions } from './firebase';

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

  // Read both identity documents in parallel. We must NOT create users/{uid}
  // if this UID already has a professional/main doc — doing so would set
  // role = 'both' and silently redirect the professional to the business
  // dashboard instead of the Professional Portal.
  //
  // safeGet: a professional user gets permission-denied on their own top-level
  // users/{uid} document (no rule covers it for non-business accounts), so we
  // swallow that error and treat it as "does not exist".
  const tryGet = async (ref: DocumentReference) => {
    try { return await getDoc(ref); } catch { return null; }
  };

  const [userDoc, proDoc] = await Promise.all([
    tryGet(doc(db, 'users', user.uid)),
    tryGet(doc(db, 'users', user.uid, 'professional', 'main')),
  ]);

  if (!userDoc?.exists() && !proDoc?.exists()) {
    // Genuinely new user — create the business profile document.
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

// ── WhatsApp OTP Authentication ─────────────────────────────────────────────

// Shared safe-get helper (mirrors the one used in signInWithGoogle)
const tryGetOtp = async (ref: DocumentReference) => {
  try { return await getDoc(ref); } catch { return null; }
};

/**
 * Step 1: Send a 6-digit OTP to the given phone number via WhatsApp.
 * phoneNumber should be a 10-digit Indian number (e.g. "9876543210") or E.164.
 */
export async function sendWhatsAppOtp(phoneNumber: string): Promise<void> {
  const fn = httpsCallable(functions, 'sendWhatsAppOtp');
  await fn({ phoneNumber });
}

/**
 * Step 2: Verify the OTP and sign the user in via Firebase custom token.
 * Creates a Firestore user document for first-time sign-ups.
 */
export async function verifyWhatsAppOtp(phoneNumber: string, otp: string): Promise<User> {
  const fn = httpsCallable<{ phoneNumber: string; otp: string }, { customToken: string }>(
    functions,
    'verifyWhatsAppOtp',
  );
  const result = await fn({ phoneNumber, otp });
  const credential = await signInWithCustomToken(auth, result.data.customToken);
  const user = credential.user;

  // Create Firestore user doc for new users (mirrors signInWithGoogle logic)
  const [userDoc, proDoc] = await Promise.all([
    tryGetOtp(doc(db, 'users', user.uid)),
    tryGetOtp(doc(db, 'users', user.uid, 'professional', 'main')),
  ]);

  if (!userDoc?.exists() && !proDoc?.exists()) {
    await setDoc(doc(db, 'users', user.uid), {
      phoneNumber,
      displayName: 'BillHippo User',
      createdAt: serverTimestamp(),
      plan: 'free',
    });
  }

  return user;
}
