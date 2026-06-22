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
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { getDb } from "../firebaseClient";
import { getSettings } from "../config";
import { postXml } from "./client";
import {
  buildCompanyListRequest,
  buildCompanyInfoRequest,
  buildLedgerListRequest,
  buildLedgerMastersRequest,
  buildSalesVoucher,
  buildSalesVoucherMulti,
  buildLedgerMaster,
} from "./builders";
import { parseCompanies, parseCompanyBooksFrom, parseLedgers, parseImportResult } from "./parse";
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
  const { host, port } = tallyTarget();
  const configRef = doc(getDb(), "users", uid, "tallyConfig", "main");

  // 1. Discover the companies currently open in Tally so the web UI can offer a
  //    dropdown (and so we can auto-select when only one company is open).
  let openCompanies: string[] = [];
  try {
    openCompanies = parseCompanies(await postXml(host, port, buildCompanyListRequest()));
  } catch {
    // Non-fatal — fall back to whatever company the user has already configured.
  }

  // 2. Resolve which company to read ledgers from.
  const snap = await getDoc(configRef);
  const cfg = (snap.exists() ? snap.data() : {}) as Partial<TallyConfigDoc>;
  const configured = (cfg.companyName || "").trim();
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  let companyName = "";
  if (openCompanies.length === 1) {
    // Exactly one company open → always use it, even if config still names a
    // different one. This makes switching the open company in Tally + Verify
    // re-sync the new company instead of the stale configured one.
    companyName = openCompanies[0];
  } else if (configured && openCompanies.some((c) => eq(c, configured))) {
    companyName = configured; // multiple open & the configured one is among them
  } else if (configured && openCompanies.length === 0) {
    companyName = configured; // company list unavailable — trust the config
  }

  // 3. Persist the discovered companies (+ resolved company) so the UI updates
  //    even if we can't proceed to a ledger fetch yet.
  await setDoc(
    configRef,
    {
      discoveredCompanies: openCompanies,
      discoveredAt: serverTimestamp(),
      ...(companyName ? { companyName } : {}),
    },
    { merge: true },
  );

  if (!companyName) {
    throw new Error(
      openCompanies.length === 0
        ? "No open company found in Tally. Open your company in Tally, then click Detect again."
        : `${openCompanies.length} companies are open in Tally. Pick the one to sync in ` +
          "BillHippo → Accounts → Connector, then click Detect again.",
    );
  }

  // 4. Pull the ledgers. The FETCH collection reliably returns name/parent and
  //    the mailing address/state/pincode. GST registration details aren't
  //    exposed there, so we also run the masters export and MERGE its GSTIN
  //    (and any missing address fields) in by ledger name.
  const collXml = await postXml(host, port, buildLedgerListRequest(companyName));
  let ledgers = parseLedgers(collXml);

  let mastersXml = "";
  try {
    mastersXml = await postXml(host, port, buildLedgerMastersRequest(companyName));
    const masters = parseLedgers(mastersXml);
    if (masters.length) {
      const byName = new Map(masters.map((m) => [m.name.toLowerCase(), m]));
      if (ledgers.length === 0) {
        ledgers = masters; // collection empty → use masters wholesale
      } else {
        ledgers = ledgers.map((l) => {
          const m = byName.get(l.name.toLowerCase());
          if (!m) return l;
          return {
            ...l,
            gstin: l.gstin || m.gstin,
            address: l.address || m.address,
            state: l.state || m.state,
            pincode: l.pincode || m.pincode,
          };
        });
      }
    }
  } catch {
    // Masters export unavailable — keep the collection result.
  }
  await syncLedgersToFirestore(uid, ledgers);

  // Capture one EXISTING ledger's full master that already has a state/GSTIN/
  // address, so we can mirror Tally's exact import structure when creating.
  const sample = extractSampleLedger(mastersXml);

  // Stamp the config so the web UI can show "last synced". Also keep a
  // truncated copy of the raw Tally response for troubleshooting (e.g. when a
  // ledger's GSTIN/address isn't coming through, so we can see the structure).
  const debugXml = `===COLLECTION===\n${collXml}\n\n===MASTERS===\n${mastersXml}`;
  await setDoc(
    configRef,
    {
      lastLedgerSyncAt: serverTimestamp(),
      lastLedgerRawXml: debugXml.slice(0, 45000),
      ...(sample ? { lastLedgerSampleXml: sample.slice(0, 14000) } : {}),
    },
    { merge: true },
  );
  return {};
}

/** Capture the FULL master block of a party that actually has a GSTIN, so we
 *  can see exactly which flat fields (LEDGST..., PRIORSTATENAME) carry the
 *  GSTIN, state and address on this Tally build. */
function extractSampleLedger(xml: string): string {
  const GSTIN = /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]/; // 15-char GSTIN
  const led = /<LEDGER\b[\s\S]*?<\/LEDGER>/g;
  let m: RegExpExecArray | null;
  let withState = "";
  while ((m = led.exec(xml))) {
    if (GSTIN.test(m[0])) return m[0]; // a real GSTIN somewhere in this ledger
    if (!withState && /<PRIORSTATENAME>\s*[A-Za-z]/.test(m[0])) withState = m[0];
  }
  return withState;
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
        ...(l.address ? { address: l.address } : {}),
        ...(l.state ? { state: l.state } : {}),
        ...(l.pincode ? { pincode: l.pincode } : {}),
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

  // Resolve the party ledger name: prefer the explicit per-row mapping in the
  // job snapshot, then the customer's saved Tally mapping, then the raw name.
  let customerMapped: string | undefined;
  if (inv.customerId) {
    const custSnap = await getDoc(doc(getDb(), "users", uid, "customers", inv.customerId));
    if (custSnap.exists()) customerMapped = (custSnap.data() as any).tallyLedgerName;
  }
  const partyLedgerName =
    (job.payloadSnapshot?.partyLedgerName as string | undefined) ||
    customerMapped ||
    inv.customerName;
  if (!partyLedgerName) throw new Error("Could not determine the party ledger name.");

  // Sales ledger (Particulars): prefer the per-row choice, else the default.
  const salesLedgerName =
    (job.payloadSnapshot?.salesLedgerName as string | undefined)?.trim() || cfg.salesLedgerName;
  // Tax ledgers: prefer the per-row, rate-matched choices, else the defaults.
  const p = job.payloadSnapshot || {};
  const cgstLedgerName = (p.cgstLedgerName as string | undefined)?.trim() || cfg.cgstLedgerName!;
  const sgstLedgerName = (p.sgstLedgerName as string | undefined)?.trim() || cfg.sgstLedgerName!;
  const igstLedgerName = (p.igstLedgerName as string | undefined)?.trim() || cfg.igstLedgerName!;
  const gstType = inv.gstType === "IGST" ? "IGST" : "CGST_SGST";

  // Multi-line (mixed-rate) voucher when the web sends per-rate lines; else the
  // single-rate voucher from the invoice totals.
  const lines = Array.isArray(p.lines) ? (p.lines as any[]) : [];
  const xml = lines.length > 1
    ? buildSalesVoucherMulti({
        companyName: cfg.companyName,
        date: inv.date,
        voucherNumber: inv.invoiceNumber,
        invoiceId: job.invoiceId,
        partyLedgerName,
        gstType,
        narration: `BillHippo ${inv.invoiceNumber}`,
        lines: lines.map((l) => ({
          taxable: Number(l.taxable) || 0,
          cgst: Number(l.cgst) || 0,
          sgst: Number(l.sgst) || 0,
          igst: Number(l.igst) || 0,
          salesLedgerName: String(l.salesLedgerName || salesLedgerName),
          cgstLedgerName: String(l.cgstLedgerName || cgstLedgerName),
          sgstLedgerName: String(l.sgstLedgerName || sgstLedgerName),
          igstLedgerName: String(l.igstLedgerName || igstLedgerName),
        })),
      })
    : buildSalesVoucher({
        companyName: cfg.companyName,
        date: inv.date,
        voucherNumber: inv.invoiceNumber,
        invoiceId: job.invoiceId,
        partyLedgerName,
        salesLedgerName,
        gstType,
        taxable: Number(inv.totalBeforeTax) || 0,
        cgst: Number(inv.cgst) || 0,
        sgst: Number(inv.sgst) || 0,
        igst: Number(inv.igst) || 0,
        total: Number(inv.totalAmount) || 0,
        cgstLedgerName,
        sgstLedgerName,
        igstLedgerName,
        narration: `BillHippo ${inv.invoiceNumber}`,
      });

  const { host, port } = tallyTarget();
  const responseXml = await postXml(host, port, xml);
  // Lenient: some Tally builds post the voucher but report 0 created/0 altered.
  // Treat that as success (real errors still throw via LINEERROR/exceptions),
  // so the job isn't falsely failed — which previously triggered retries that
  // created duplicate vouchers.
  const result = parseImportResult(responseXml, true);
  return { tallyVoucherId: result.lastVoucherId };
}

// ── CREATE_LEDGER / ALTER_LEDGER ──────────────────────────────────────────────

/**
 * Create or alter a ledger in Tally. The ledger details come from either:
 *   - a customer (job.customerId)         → used by the "Create ledger" button
 *     on unmatched invoices, OR
 *   - a direct payload (job.payloadSnapshot) → used by the Ledger Sync tab's
 *     New ledger / Edit ledger forms.
 * On success we upsert the ledger into Firestore so the web UI reflects it
 * immediately without waiting for a full re-sync.
 */
async function handleUpsertLedger(uid: string, job: SyncJob): Promise<{ tallyVoucherId?: string }> {
  const cfg = await readConfig(uid);
  const action = job.type === "ALTER_LEDGER" ? "Alter" : "Create";

  let master: {
    companyName: string; name: string; parent: string;
    gstin?: string; address?: string; state?: string; pincode?: string;
  };

  if (job.customerId) {
    const custSnap = await getDoc(doc(getDb(), "users", uid, "customers", job.customerId));
    if (!custSnap.exists()) throw new Error(`Customer ${job.customerId} no longer exists.`);
    const c = custSnap.data() as any;
    master = {
      companyName: cfg.companyName,
      name: c.name,
      parent: DEBTOR_GROUP,
      gstin: c.gstin,
      address: [c.address, c.city].filter(Boolean).join(", "),
      state: c.state,
      pincode: c.pincode,
    };
  } else {
    const p = (job.payloadSnapshot || {}) as Record<string, unknown>;
    const name = String(p.name || "").trim();
    const parent = String(p.parent || "").trim();
    if (!name) throw new Error("Ledger name is required.");
    if (!parent) throw new Error("Ledger group is required.");
    const str = (v: unknown) => (v == null || v === "" ? undefined : String(v));
    master = {
      companyName: cfg.companyName,
      name,
      parent,
      gstin: str(p.gstin),
      address: str(p.address),
      state: str(p.state),
      pincode: str(p.pincode),
    };
  }

  const { host, port } = tallyTarget();
  // GST/mailing rows are dated; APPLICABLEFROM must be on/after the company's
  // books-begin or Tally silently drops them. Fetch the books-begin date.
  let applicableFrom = "20170701";
  try {
    const booksFrom = parseCompanyBooksFrom(
      await postXml(host, port, buildCompanyInfoRequest(cfg.companyName)),
    );
    if (booksFrom) applicableFrom = booksFrom > "20170701" ? booksFrom : "20170701";
  } catch {
    // Non-fatal — fall back to the GST rollout date.
  }
  const requestXml = buildLedgerMaster(master, action, applicableFrom);
  const responseXml = await postXml(host, port, requestXml);
  // Capture the exact request + Tally response for troubleshooting (e.g. when
  // GSTIN/address don't stick on the created ledger).
  await setDoc(
    doc(getDb(), "users", uid, "tallyConfig", "main"),
    { lastLedgerWriteXml: `REQUEST:\n${requestXml}\n\nRESPONSE:\n${responseXml}`.slice(0, 45000) },
    { merge: true },
  );
  // Tolerate 0/0 — Tally returns that when a ledger already exists (create) or
  // an alter changed nothing, neither of which is a real failure here.
  parseImportResult(responseXml, true);

  // Reflect the change in Firestore so the Ledger Sync list updates at once.
  await setDoc(
    doc(getDb(), "users", uid, "tallyLedgers", ledgerDocId(master.name)),
    {
      name: master.name,
      parent: master.parent,
      ...(master.gstin ? { gstin: master.gstin } : {}),
      syncedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return {};
}

/** Register all Tally handlers with the job watcher. Call once at startup. */
export function registerTallyHandlers(): void {
  registerHandler("FETCH_LEDGERS", handleFetchLedgers);
  registerHandler("PUSH_INVOICE", handlePushInvoice);
  registerHandler("CREATE_LEDGER", handleUpsertLedger);
  registerHandler("ALTER_LEDGER", handleUpsertLedger);
}
