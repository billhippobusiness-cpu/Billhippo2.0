/**
 * Tally job handlers — the Milestone C implementation registered into the job
 * watcher. Each handler reads what it needs from Firestore (the connector is
 * authenticated as the user), talks to the local Tally gateway, and returns a
 * result patch (or throws, which the watcher records as a failure + retry).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "../firebaseClient";
import { getSettings } from "../config";
import { postXml } from "./client";
import { buildLedgerListRequest, buildSalesVoucher, buildLedgerMaster } from "./builders";
import { parseLedgers, parseImportResult } from "./parse";
import { ledgerDocId } from "./xml";
import { registerHandler } from "../jobWatcher";
import type { SyncJob, TallyLedger } from "../shared/types";

const DEBTOR_GROUP = "Sundry Debtors";

interface TallyConfigDoc {
  companyName: string;
  salesLedgerName: string;
  cgstLedgerName?: string;
  sgstLedgerName?: string;
  igstLedgerName?: string;
}

async function readConfig(uid: string): Promise<TallyConfigDoc> {
  const snap = await getDoc(doc(getDb(), "users", uid, "tallyConfig", "main"));
  const d = (snap.exists() ? snap.data() : {}) as Partial<TallyConfigDoc>;
  if (!d.companyName) {
    throw new Error("No Tally company configured. Set it in BillHippo → Accounts → Connector.");
  }
  return {
    companyName: d.companyName,
    salesLedgerName: d.salesLedgerName || "Sales",
    cgstLedgerName: d.cgstLedgerName || "CGST",
    sgstLedgerName: d.sgstLedgerName || "SGST",
    igstLedgerName: d.igstLedgerName || "IGST",
  };
}

function tallyTarget() {
  const s = getSettings();
  return { host: s.tallyHost, port: s.tallyPort };
}

// ── FETCH_LEDGERS ─────────────────────────────────────────────────────────────

async function handleFetchLedgers(uid: string): Promise<{ tallyVoucherId?: string }> {
  const cfg = await readConfig(uid);
  const { host, port } = tallyTarget();
  const responseXml = await postXml(host, port, buildLedgerListRequest(cfg.companyName));
  const ledgers = parseLedgers(responseXml);

  await syncLedgersToFirestore(uid, ledgers);

  // Stamp the config so the web UI can show "last synced".
  const batch = writeBatch(getDb());
  batch.set(
    doc(getDb(), "users", uid, "tallyConfig", "main"),
    { lastLedgerSyncAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
  return {};
}

/** Upsert the current ledgers and remove ones no longer present in Tally. */
async function syncLedgersToFirestore(uid: string, ledgers: TallyLedger[]): Promise<void> {
  const col = collection(getDb(), "users", uid, "tallyLedgers");
  const existing = await getDocs(col);
  const existingIds = new Set(existing.docs.map((d) => d.id));
  const seen = new Set<string>();

  // Firestore batches cap at 500 ops; chunk to stay well under.
  const ops: { id: string; data: Record<string, unknown> | null }[] = [];
  for (const l of ledgers) {
    const id = ledgerDocId(l.name);
    if (seen.has(id)) continue; // de-dupe same-name ledgers
    seen.add(id);
    ops.push({
      id,
      data: {
        name: l.name,
        parent: l.parent || "",
        ...(l.gstin ? { gstin: l.gstin } : {}),
        syncedAt: serverTimestamp(),
      },
    });
  }
  // Stale docs (deleted/renamed in Tally) → remove.
  for (const id of existingIds) {
    if (!seen.has(id)) ops.push({ id, data: null });
  }

  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(getDb());
    for (const op of ops.slice(i, i + 400)) {
      const ref = doc(col, op.id);
      if (op.data === null) batch.delete(ref);
      else batch.set(ref, op.data, { merge: true });
    }
    await batch.commit();
  }
}

// ── PUSH_INVOICE ──────────────────────────────────────────────────────────────

async function handlePushInvoice(uid: string, job: SyncJob): Promise<{ tallyVoucherId?: string }> {
  if (!job.invoiceId) throw new Error("Job is missing invoiceId.");
  const cfg = await readConfig(uid);

  const invSnap = await getDoc(doc(getDb(), "users", uid, "invoices", job.invoiceId));
  if (!invSnap.exists()) throw new Error(`Invoice ${job.invoiceId} no longer exists.`);
  const inv = invSnap.data() as any;

  // Resolve the party ledger name: prefer the customer's saved Tally mapping,
  // then the job snapshot, then the raw invoice name.
  let partyLedgerName: string | undefined;
  if (inv.customerId) {
    const custSnap = await getDoc(doc(getDb(), "users", uid, "customers", inv.customerId));
    if (custSnap.exists()) partyLedgerName = (custSnap.data() as any).tallyLedgerName;
  }
  partyLedgerName =
    partyLedgerName ||
    (job.payloadSnapshot?.partyLedgerName as string | undefined) ||
    inv.customerName;
  if (!partyLedgerName) throw new Error("Could not determine the party ledger name.");

  const xml = buildSalesVoucher({
    companyName: cfg.companyName,
    date: inv.date,
    voucherNumber: inv.invoiceNumber,
    invoiceId: job.invoiceId,
    partyLedgerName,
    salesLedgerName: cfg.salesLedgerName,
    gstType: inv.gstType === "IGST" ? "IGST" : "CGST_SGST",
    taxable: Number(inv.totalBeforeTax) || 0,
    cgst: Number(inv.cgst) || 0,
    sgst: Number(inv.sgst) || 0,
    igst: Number(inv.igst) || 0,
    total: Number(inv.totalAmount) || 0,
    cgstLedgerName: cfg.cgstLedgerName!,
    sgstLedgerName: cfg.sgstLedgerName!,
    igstLedgerName: cfg.igstLedgerName!,
    narration: `BillHippo ${inv.invoiceNumber}`,
  });

  const { host, port } = tallyTarget();
  const responseXml = await postXml(host, port, xml);
  const result = parseImportResult(responseXml);
  return { tallyVoucherId: result.lastVoucherId };
}

// ── CREATE_LEDGER ─────────────────────────────────────────────────────────────

async function handleCreateLedger(uid: string, job: SyncJob): Promise<{ tallyVoucherId?: string }> {
  if (!job.customerId) throw new Error("Job is missing customerId.");
  const cfg = await readConfig(uid);

  const custSnap = await getDoc(doc(getDb(), "users", uid, "customers", job.customerId));
  if (!custSnap.exists()) throw new Error(`Customer ${job.customerId} no longer exists.`);
  const c = custSnap.data() as any;

  const xml = buildLedgerMaster({
    companyName: cfg.companyName,
    name: c.name,
    parent: DEBTOR_GROUP,
    gstin: c.gstin,
    address: [c.address, c.city].filter(Boolean).join(", "),
    state: c.state,
    pincode: c.pincode,
  });

  const { host, port } = tallyTarget();
  const responseXml = await postXml(host, port, xml);
  parseImportResult(responseXml);
  return {};
}

/** Register all Tally handlers with the job watcher. Call once at startup. */
export function registerTallyHandlers(): void {
  registerHandler("FETCH_LEDGERS", handleFetchLedgers);
  registerHandler("PUSH_INVOICE", handlePushInvoice);
  registerHandler("CREATE_LEDGER", handleCreateLedger);
}
