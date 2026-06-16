/**
 * Firebase client for the connector (uses the public web SDK, never admin).
 *
 * Auth persistence: the web SDK has no Node-native persistence, so we supply a
 * tiny custom `Persistence` backed by electron-store. The SDK only calls the
 * handful of methods below, which is enough to keep the connector signed in
 * across restarts (refresh tokens are persisted and silently refreshed).
 *
 * Pairing: an unauthenticated connector calls the `tallyExchangePairingCode`
 * callable with the code the user pasted, receives a Firebase custom token, and
 * signs in with it. From then on the SDK manages token refresh automatically.
 */

import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  initializeAuth,
  signInWithCustomToken,
  onAuthStateChanged,
  type Auth,
  type Persistence,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, httpsCallable, type Functions } from "firebase/functions";
import store, { firebaseConfig, FUNCTIONS_REGION } from "./config";

// ── Custom persistence backed by electron-store ──────────────────────────────
// Implements the loosely-typed shape the modular Auth SDK expects (the same
// contract browser/in-memory persistences fulfil). Cast to `Persistence` since
// the concrete internal interface is not publicly exported.
const electronPersistence = {
  type: "LOCAL",
  async _isAvailable(): Promise<boolean> {
    return true;
  },
  async _set(key: string, value: unknown): Promise<void> {
    store.set(`fbauth.${key}`, value);
  },
  async _get<T>(key: string): Promise<T | null> {
    return (store.get(`fbauth.${key}`) as T) ?? null;
  },
  async _remove(key: string): Promise<void> {
    store.delete(`fbauth.${key}` as never);
  },
  _addListener(_key: string, _listener: unknown): void {
    /* single-process: no cross-tab sync needed */
  },
  _removeListener(_key: string, _listener: unknown): void {
    /* no-op */
  },
} as unknown as Persistence;

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;

export function initFirebase(): { auth: Auth; db: Firestore } {
  app = initializeApp(firebaseConfig);
  auth = initializeAuth(app, { persistence: electronPersistence });
  db = getFirestore(app);
  functions = getFunctions(app, FUNCTIONS_REGION);
  return { auth, db };
}

/** Subscribe to sign-in/out. Fires immediately with the restored user (if any). */
export function watchAuth(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

/** Exchange a pairing code for a custom token and sign in. */
export async function pairWithCode(code: string): Promise<User> {
  const callable = httpsCallable<{ code: string }, { token: string }>(
    functions,
    "tallyExchangePairingCode",
  );
  const res = await callable({ code: code.trim().toUpperCase() });
  const token = res.data?.token;
  if (!token) throw new Error("Pairing failed: no token returned.");
  const cred = await signInWithCustomToken(auth, token);
  return cred.user;
}

export async function signOutConnector(): Promise<void> {
  await auth.signOut();
}

export function getDb(): Firestore {
  return db;
}

export function getCurrentUser(): User | null {
  return auth?.currentUser ?? null;
}
