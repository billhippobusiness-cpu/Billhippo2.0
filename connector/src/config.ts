/**
 * Local configuration & persistence for the connector.
 *
 * - Firebase web config is PUBLIC (the same values the website ships in its
 *   JS bundle), so it is safe to embed here. Values can still be overridden at
 *   build/run time via environment variables.
 * - `store` is an on-disk key/value store (electron-store) used both for our own
 *   settings and as the backing store for Firebase Auth persistence, so the user
 *   stays signed in across restarts without re-pairing.
 */

import Store from "electron-store";

export const firebaseConfig = {
  apiKey: process.env.BILLHIPPO_FB_API_KEY || "AIzaSyCV3ivW-hsfBdK9o1jAuQ4xO65Uy5VSxVQ",
  authDomain: process.env.BILLHIPPO_FB_AUTH_DOMAIN || "billhippo-42f95.firebaseapp.com",
  projectId: process.env.BILLHIPPO_FB_PROJECT_ID || "billhippo-42f95",
  storageBucket: process.env.BILLHIPPO_FB_STORAGE_BUCKET || "billhippo-42f95.firebasestorage.app",
  messagingSenderId: process.env.BILLHIPPO_FB_SENDER_ID || "923069112050",
  appId: process.env.BILLHIPPO_FB_APP_ID || "1:923069112050:web:6e3331bc825b891c9eba6b",
};

// Cloud Functions region (must match functions deployment).
export const FUNCTIONS_REGION = "asia-south1";

// How often the connector writes its heartbeat to Firestore.
export const HEARTBEAT_INTERVAL_MS = 30_000;

export const CONNECTOR_VERSION = "0.4.12";

export interface LocalSettings {
  tallyHost: string;
  tallyPort: number;
}

const store = new Store({
  name: "billhippo-connector",
  defaults: {
    settings: { tallyHost: "127.0.0.1", tallyPort: 9000 } as LocalSettings,
  },
});

export function getSettings(): LocalSettings {
  return store.get("settings") as LocalSettings;
}

export function setSettings(next: Partial<LocalSettings>): LocalSettings {
  const merged = { ...getSettings(), ...next };
  store.set("settings", merged);
  return merged;
}

export default store;
