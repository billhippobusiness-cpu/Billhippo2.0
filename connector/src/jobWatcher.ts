/**
 * Job watcher — subscribes to pending sync jobs and dispatches them to handlers.
 *
 * MILESTONE B (this file): the watcher, claim/transition lifecycle, retry cap,
 * and a handler REGISTRY are wired up. The actual Tally handlers (FETCH_LEDGERS,
 * PUSH_INVOICE, CREATE_LEDGER) are stubbed and registered in Milestone C — until
 * then unknown job types are left untouched (pending) rather than failed, so no
 * data is lost while the connector is still a skeleton.
 */

import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { getDb } from "./firebaseClient";
import type { SyncJob, SyncJobType } from "./shared/types";

const MAX_ATTEMPTS = 3;

/** A handler converts a job to Tally actions and returns a result patch. */
export type JobHandler = (
  uid: string,
  job: SyncJob,
) => Promise<{ tallyVoucherId?: string }>;

const handlers: Partial<Record<SyncJobType, JobHandler>> = {
  // Registered in Milestone C:
  // FETCH_LEDGERS: handleFetchLedgers,
  // PUSH_INVOICE: handlePushInvoice,
  // CREATE_LEDGER: handleCreateLedger,
};

export function registerHandler(type: SyncJobType, handler: JobHandler): void {
  handlers[type] = handler;
}

let unsub: (() => void) | null = null;
const inFlight = new Set<string>();

export function startJobWatcher(uid: string): void {
  stopJobWatcher();
  const jobsCol = collection(getDb(), "users", uid, "syncJobs");
  const pending = query(jobsCol, where("status", "==", "pending"));

  unsub = onSnapshot(
    pending,
    (snap) => {
      snap.docs.forEach((d) => {
        const job = { id: d.id, ...(d.data() as Omit<SyncJob, "id">) };
        void processJob(uid, job);
      });
    },
    (err) => console.error("[jobWatcher] snapshot error:", err),
  );
  console.log("[jobWatcher] watching pending sync jobs for", uid);
}

export function stopJobWatcher(): void {
  if (unsub) {
    unsub();
    unsub = null;
  }
  inFlight.clear();
}

async function processJob(uid: string, job: SyncJob): Promise<void> {
  if (inFlight.has(job.id)) return;

  const handler = handlers[job.type];
  // No handler yet (skeleton): leave the job pending for a future connector
  // version rather than failing it.
  if (!handler) {
    console.log(`[jobWatcher] no handler for ${job.type} (job ${job.id}) — skipping`);
    return;
  }

  inFlight.add(job.id);
  const ref = doc(getDb(), "users", uid, "syncJobs", job.id);

  // Atomically claim the job (pending -> processing) so a re-delivered snapshot
  // or a second connector instance can't double-process it.
  let claimed = false;
  try {
    await runTransaction(getDb(), async (tx) => {
      const cur = await tx.get(ref);
      if (!cur.exists() || cur.data()?.status !== "pending") return;
      tx.update(ref, {
        status: "processing",
        attempts: (cur.data()?.attempts ?? 0) + 1,
        updatedAt: serverTimestamp(),
      });
      claimed = true;
    });
  } catch (err) {
    console.error(`[jobWatcher] claim failed for ${job.id}:`, err);
    inFlight.delete(job.id);
    return;
  }
  if (!claimed) {
    inFlight.delete(job.id);
    return;
  }

  try {
    const result = await handler(uid, job);
    await updateJob(uid, job.id, {
      status: "success",
      error: null,
      ...(result.tallyVoucherId ? { tallyVoucherId: result.tallyVoucherId } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const attempts = (job.attempts ?? 0) + 1;
    // Exhausted retries -> failed; otherwise hand back to pending for another go.
    await updateJob(uid, job.id, {
      status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
      error: message,
    });
    console.error(`[jobWatcher] job ${job.id} (${job.type}) errored:`, message);
  } finally {
    inFlight.delete(job.id);
  }
}

async function updateJob(
  uid: string,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { updateDoc } = await import("firebase/firestore");
  await updateDoc(doc(getDb(), "users", uid, "syncJobs", jobId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}
