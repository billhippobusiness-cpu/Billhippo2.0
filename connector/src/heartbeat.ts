/**
 * Heartbeat — periodically writes connector liveness to
 * users/{uid}/tallyConfig/main so the web "Accounts" page can show a live
 * online/offline status pill. Also probes the local Tally gateway so the UI can
 * later distinguish "connector up" from "Tally reachable".
 */

import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDb } from "./firebaseClient";
import { CONNECTOR_VERSION, HEARTBEAT_INTERVAL_MS, getSettings } from "./config";
import { pingTally } from "./tally/client";

let timer: NodeJS.Timeout | null = null;

async function writeHeartbeat(uid: string): Promise<void> {
  const settings = getSettings();
  let tallyReachable = false;
  try {
    tallyReachable = await pingTally(settings.tallyHost, settings.tallyPort);
  } catch {
    tallyReachable = false;
  }
  try {
    await setDoc(
      doc(getDb(), "users", uid, "tallyConfig", "main"),
      {
        connectorStatus: "online",
        connectorVersion: CONNECTOR_VERSION,
        tallyReachable,
        lastHeartbeat: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error("[heartbeat] write failed:", err);
  }
}

export function startHeartbeat(uid: string): void {
  stopHeartbeat();
  void writeHeartbeat(uid); // immediate first beat
  timer = setInterval(() => void writeHeartbeat(uid), HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Best-effort "going offline" marker written on graceful shutdown. */
export async function markOffline(uid: string): Promise<void> {
  try {
    await setDoc(
      doc(getDb(), "users", uid, "tallyConfig", "main"),
      { connectorStatus: "offline" },
      { merge: true },
    );
  } catch {
    /* shutting down — best effort only */
  }
}
