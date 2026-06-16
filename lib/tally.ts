/**
 * Firestore service for the Tally integration.
 *
 * FIRESTORE STRUCTURE (all under users/{userId}/):
 *   tallyConfig/main   → TallyConfig    (settings + connector heartbeat)
 *   tallyLedgers/{id}  → TallyLedger     (mirror of ledgers that exist in Tally)
 *   syncJobs/{id}      → SyncJob         (work queue consumed by the connector)
 *
 * The owner has full read/write via the existing wildcard security rule
 * (users/{userId}/{document=**}); the desktop connector authenticates as the
 * same uid and therefore inherits the same access.
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { TallyConfig, TallyLedger, SyncJob, SyncJobType } from '../types';

// Heartbeat older than this means the connector is considered offline even if
// connectorStatus still reads 'online' (e.g. the process was killed abruptly).
const HEARTBEAT_STALE_MS = 90_000;

export const DEFAULT_TALLY_CONFIG: TallyConfig = {
  enabled: false,
  companyName: '',
  tallyPort: 9000,
  salesLedgerName: '',
  connectorStatus: 'offline',
};

function configRef(userId: string) {
  return doc(db, 'users', userId, 'tallyConfig', 'main');
}
function ledgersCol(userId: string) {
  return collection(db, 'users', userId, 'tallyLedgers');
}
function jobsCol(userId: string) {
  return collection(db, 'users', userId, 'syncJobs');
}

// ── Config ─────────────────────────────────────────────────────────────────

export async function getTallyConfig(userId: string): Promise<TallyConfig> {
  const snap = await getDoc(configRef(userId));
  return snap.exists()
    ? { ...DEFAULT_TALLY_CONFIG, ...(snap.data() as TallyConfig) }
    : { ...DEFAULT_TALLY_CONFIG };
}

export function subscribeTallyConfig(
  userId: string,
  callback: (config: TallyConfig) => void,
): () => void {
  return onSnapshot(configRef(userId), (snap) => {
    callback(
      snap.exists()
        ? { ...DEFAULT_TALLY_CONFIG, ...(snap.data() as TallyConfig) }
        : { ...DEFAULT_TALLY_CONFIG },
    );
  });
}

export async function saveTallyConfig(userId: string, data: Partial<TallyConfig>): Promise<void> {
  await setDoc(configRef(userId), { ...data, updatedAt: serverTimestamp() }, { merge: true });
}

// ── Ledgers (read-only from the web app; the connector populates these) ──────

export async function getTallyLedgers(userId: string): Promise<TallyLedger[]> {
  const snap = await getDocs(ledgersCol(userId));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as TallyLedger))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function subscribeTallyLedgers(
  userId: string,
  callback: (ledgers: TallyLedger[]) => void,
): () => void {
  return onSnapshot(ledgersCol(userId), (snap) => {
    const list = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as TallyLedger))
      .sort((a, b) => a.name.localeCompare(b.name));
    callback(list);
  });
}

// ── Sync jobs ────────────────────────────────────────────────────────────────

export interface EnqueueJobInput {
  type: SyncJobType;
  invoiceId?: string;
  customerId?: string;
  payloadSnapshot?: Record<string, unknown>;
  createdBy?: string;
}

export async function enqueueSyncJob(userId: string, input: EnqueueJobInput): Promise<string> {
  const ref = await addDoc(jobsCol(userId), {
    type: input.type,
    status: 'pending',
    attempts: 0,
    ...(input.invoiceId ? { invoiceId: input.invoiceId } : {}),
    ...(input.customerId ? { customerId: input.customerId } : {}),
    ...(input.payloadSnapshot ? { payloadSnapshot: input.payloadSnapshot } : {}),
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export function subscribeSyncJobs(
  userId: string,
  callback: (jobs: SyncJob[]) => void,
): () => void {
  return onSnapshot(jobsCol(userId), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SyncJob));
    callback(list);
  });
}

// ── Connector liveness ───────────────────────────────────────────────────────

/** Coerce a Firestore Timestamp (or epoch ms / ISO string) to epoch millis. */
function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (typeof ts === 'string') return Date.parse(ts) || 0;
  const anyTs = ts as { toMillis?: () => number; seconds?: number };
  if (typeof anyTs.toMillis === 'function') return anyTs.toMillis();
  if (typeof anyTs.seconds === 'number') return anyTs.seconds * 1000;
  return 0;
}

/** True when the connector is reporting online AND its heartbeat is fresh. */
export function isConnectorOnline(config: TallyConfig | null): boolean {
  if (!config) return false;
  const last = toMillis(config.lastHeartbeat);
  if (!last) return false;
  return Date.now() - last < HEARTBEAT_STALE_MS;
}
