/**
 * Firestore Database Service for BillHippo
 * Handles all CRUD operations for invoices, customers, ledger entries, and business profiles.
 *
 * FIRESTORE STRUCTURE:
 * users/{userId}/
 *   profile        → BusinessProfile document
 *   customers/{id} → Customer documents
 *   invoices/{id}  → Invoice documents
 *   ledger/{id}    → LedgerEntry documents
 */

import {
  collection,
  collectionGroup,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  query,
  where,
  orderBy,
  onSnapshot,
  arrayRemove,
  arrayUnion,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import type {
  BusinessProfile,
  Customer,
  Invoice,
  LedgerEntry,
  InventoryItem,
  ServiceItem,
  CreditNote,
  DebitNote,
  Quotation,
  Purchase,
  AssignedProfessional,
  ProfessionalDesignation,
  ProfessionalInvite,
  PendingAssignment,
  DeliveryChallan,
} from '../types';

// ── Helper: get user-scoped collection reference ──
function userCollection(userId: string, collectionName: string) {
  return collection(db, 'users', userId, collectionName);
}

function userDoc(userId: string, collectionName: string, docId: string) {
  return doc(db, 'users', userId, collectionName, docId);
}

// ═══════════════════════════════════════════
//  BUSINESS PROFILE
// ═══════════════════════════════════════════

export async function getBusinessProfile(userId: string): Promise<BusinessProfile | null> {
  const snap = await getDoc(doc(db, 'users', userId, 'profile', 'main'));
  return snap.exists() ? (snap.data() as BusinessProfile) : null;
}

export async function saveBusinessProfile(userId: string, profile: BusinessProfile) {
  const docRef = doc(db, 'users', userId, 'profile', 'main');
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    await updateDoc(docRef, { ...profile, updatedAt: serverTimestamp() });
  } else {
    await setDoc(docRef, { ...profile, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
}

// ═══════════════════════════════════════════
//  CUSTOMERS
// ═══════════════════════════════════════════

export async function getCustomers(userId: string): Promise<Customer[]> {
  const snap = await getDocs(userCollection(userId, 'customers'));
  // Sort by createdAt descending (latest first); fall back to name for equal timestamps
  return snap.docs
    .map((d) => ({ id: d.id, _createdAt: (d.data().createdAt?.seconds ?? 0) as number, ...d.data() } as Customer & { _createdAt: number }))
    .sort((a, b) => b._createdAt - a._createdAt || a.name.localeCompare(b.name))
    .map(({ _createdAt, ...c }) => c as Customer);
}

/** Live customer list — keeps the Tally Ledger Sync comparison up to date. */
export function subscribeCustomers(userId: string, callback: (customers: Customer[]) => void): () => void {
  return onSnapshot(userCollection(userId, 'customers'), (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer)));
  });
}

export async function addCustomer(userId: string, customer: Omit<Customer, 'id'>) {
  const ref = await addDoc(userCollection(userId, 'customers'), {
    ...customer,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCustomer(userId: string, customerId: string, data: Partial<Customer>) {
  await updateDoc(userDoc(userId, 'customers', customerId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCustomer(userId: string, customerId: string) {
  await deleteDoc(userDoc(userId, 'customers', customerId));
}

// ═══════════════════════════════════════════
//  INVOICES
// ═══════════════════════════════════════════

export async function getInvoices(userId: string): Promise<Invoice[]> {
  const snap = await getDocs(userCollection(userId, 'invoices'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice));
  return docs.filter(inv => !inv.deleted).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getDeletedInvoices(userId: string): Promise<Invoice[]> {
  const snap = await getDocs(userCollection(userId, 'invoices'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice));
  return docs.filter(inv => !!inv.deleted).sort((a, b) => b.date.localeCompare(a.date));
}

export async function getTotalInvoiceCount(userId: string): Promise<number> {
  const snap = await getDocs(userCollection(userId, 'invoices'));
  return snap.docs.length;
}

export async function addInvoice(userId: string, invoice: Omit<Invoice, 'id'>) {
  const ref = await addDoc(userCollection(userId, 'invoices'), {
    ...invoice,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateInvoice(userId: string, invoiceId: string, data: Partial<Invoice>) {
  await updateDoc(userDoc(userId, 'invoices', invoiceId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function softDeleteInvoice(userId: string, invoiceId: string): Promise<void> {
  await updateDoc(userDoc(userId, 'invoices', invoiceId), {
    deleted: true,
    deletedAt: new Date().toISOString().split('T')[0],
    updatedAt: serverTimestamp(),
  });
}

export async function restoreInvoice(userId: string, invoiceId: string): Promise<void> {
  await updateDoc(userDoc(userId, 'invoices', invoiceId), {
    deleted: false,
    deletedAt: null,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteInvoice(userId: string, invoiceId: string) {
  await deleteDoc(userDoc(userId, 'invoices', invoiceId));
}

// ═══════════════════════════════════════════
//  LEDGER ENTRIES
// ═══════════════════════════════════════════

export async function getLedgerEntries(userId: string, customerId?: string): Promise<LedgerEntry[]> {
  const snap = await getDocs(userCollection(userId, 'ledger'));
  let docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry));
  if (customerId) {
    docs = docs.filter((d) => d.customerId === customerId);
  }
  return docs.sort((a, b) => a.date.localeCompare(b.date));
}

export async function addLedgerEntry(userId: string, entry: Omit<LedgerEntry, 'id'>) {
  const ref = await addDoc(userCollection(userId, 'ledger'), {
    ...entry,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteLedgerEntry(userId: string, entryId: string) {
  await deleteDoc(userDoc(userId, 'ledger', entryId));
}

/**
 * Look up a ledger entry raised against an invoice.
 *
 * An invoice can have several linked entries — the Debit raised when it was
 * saved plus a Credit for every payment collected against it — so callers that
 * mean the sale entry must ask for `'Debit'` explicitly.
 */
export async function getLedgerEntryByInvoiceId(
  userId: string,
  invoiceId: string,
  type?: LedgerEntry['type'],
): Promise<LedgerEntry | null> {
  const snap = await getDocs(userCollection(userId, 'ledger'));
  const entry = snap.docs.find(d => {
    const data = d.data();
    return data.invoiceId === invoiceId && (!type || data.type === type);
  });
  return entry ? { id: entry.id, ...entry.data() } as LedgerEntry : null;
}

export async function updateLedgerEntry(userId: string, entryId: string, data: Partial<Omit<LedgerEntry, 'id'>>) {
  await updateDoc(userDoc(userId, 'ledger', entryId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════
//  LEDGER ↔ INVOICE SYNC
// ═══════════════════════════════════════════
//
//  A ledger entry snapshots the invoice it was raised from — its number in the
//  description, plus the invoice date and total. Editing the invoice afterwards
//  (renumbering INV/2026-27/013 to INV/2026-27/013A, moving its date, changing
//  line items) left that snapshot behind, so the customer statement showed a
//  different invoice number and amount than the invoice list. The helpers below
//  re-point linked entries at the invoice's current values.

/** Description a sale (Debit) entry carries for an invoice. */
export const saleEntryDescription = (invoiceNumber: string) => `Sale - ${invoiceNumber}`;

/** Default description a payment (Credit) entry carries for an invoice. */
export const paymentEntryDescription = (invoiceNumber: string) => `Payment for Invoice ${invoiceNumber}`;

// Matches only the default payment description — a single-token invoice number
// and nothing else — so a note the user typed by hand is never rewritten.
const DEFAULT_PAYMENT_DESCRIPTION = /^Payment for Invoice (\S+)$/;

/**
 * Fields of `entry` that no longer agree with `invoice`, or null when it is
 * already in step.
 *
 * A sale entry mirrors the invoice's number, date, total and customer. A
 * payment entry keeps its own date and amount — the money moved when it moved —
 * and follows the invoice only for the customer it sits under and the number in
 * its default description.
 */
export function invoiceLedgerDrift(
  entry: LedgerEntry,
  invoice: Invoice,
): Partial<Omit<LedgerEntry, 'id'>> | null {
  if (entry.creditNoteId || entry.debitNoteId) return null;

  const drift: Partial<Omit<LedgerEntry, 'id'>> = {};
  if (invoice.customerId && entry.customerId !== invoice.customerId) {
    drift.customerId = invoice.customerId;
  }

  if (entry.type === 'Debit') {
    if (entry.date !== invoice.date) drift.date = invoice.date;
    if (entry.amount !== invoice.totalAmount) drift.amount = invoice.totalAmount;
    const description = saleEntryDescription(invoice.invoiceNumber);
    if (entry.description !== description) drift.description = description;
  } else {
    const match = DEFAULT_PAYMENT_DESCRIPTION.exec(entry.description || '');
    if (match && match[1] !== invoice.invoiceNumber) {
      drift.description = paymentEntryDescription(invoice.invoiceNumber);
    }
  }

  return Object.keys(drift).length > 0 ? drift : null;
}

/** Outstanding balance a customer's ledger entries add up to. */
export function balanceFromEntries(entries: LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + (e.type === 'Debit' ? e.amount : -e.amount), 0);
}

/**
 * Rewrite `customer.balance` from the ledger, which is the source of truth for
 * what a customer owes. Only the named customers are touched, and only when
 * their stored balance actually disagrees.
 */
export async function repairCustomerBalances(
  userId: string,
  customerIds: string[],
  entries: LedgerEntry[],
): Promise<Map<string, number>> {
  const balances = new Map<string, number>();
  const customers = await getCustomers(userId);
  await Promise.all(customerIds.map(async customerId => {
    const balance = balanceFromEntries(entries.filter(e => e.customerId === customerId));
    balances.set(customerId, balance);
    const customer = customers.find(c => c.id === customerId);
    if (customer && customer.balance !== balance) {
      await updateCustomer(userId, customerId, { balance });
    }
  }));
  return balances;
}

/**
 * Write back every linked entry that has drifted from the invoice it belongs
 * to, and return the corrected entries so the caller can render them without a
 * second read. `invoices` should include soft-deleted ones; entries pointing at
 * an invoice that is not in the list are left untouched.
 */
export async function reconcileLedgerWithInvoices(
  userId: string,
  entries: LedgerEntry[],
  invoices: Invoice[],
): Promise<LedgerEntry[]> {
  const byId = new Map(invoices.map(inv => [inv.id, inv]));
  const writes: Promise<unknown>[] = [];
  const corrected = entries.map(entry => {
    const invoice = entry.invoiceId ? byId.get(entry.invoiceId) : undefined;
    if (!invoice) return entry;
    const drift = invoiceLedgerDrift(entry, invoice);
    if (!drift) return entry;
    writes.push(updateLedgerEntry(userId, entry.id, drift));
    return { ...entry, ...drift };
  });
  if (writes.length > 0) await Promise.all(writes);
  return corrected;
}

/**
 * Keep one invoice's ledger entries in step after it was saved or edited, and
 * repair the balance of every customer that touches. Recreates the sale entry
 * when it is missing — an invoice saved before the ledger existed, or one whose
 * entry was removed.
 *
 * Returns the fresh balances, keyed by customer id, so callers can update their
 * own state without re-reading.
 */
export async function syncInvoiceLedgerEntries(
  userId: string,
  invoice: Invoice,
): Promise<Map<string, number>> {
  const all = await getLedgerEntries(userId);
  const linked = all.filter(e => e.invoiceId === invoice.id);
  const affected = new Set(
    [invoice.customerId, ...linked.map(e => e.customerId)].filter(Boolean) as string[],
  );

  let synced = all;
  const sale = linked.find(e => e.type === 'Debit');
  if (!sale) {
    if (!invoice.customerId || !invoice.totalAmount) return new Map();
    const id = await addLedgerEntry(userId, {
      date: invoice.date,
      type: 'Debit',
      amount: invoice.totalAmount,
      description: saleEntryDescription(invoice.invoiceNumber),
      invoiceId: invoice.id,
      customerId: invoice.customerId,
    });
    synced = [...all, {
      id,
      date: invoice.date,
      type: 'Debit' as const,
      amount: invoice.totalAmount,
      description: saleEntryDescription(invoice.invoiceNumber),
      invoiceId: invoice.id,
      customerId: invoice.customerId,
    }];
  } else {
    synced = await reconcileLedgerWithInvoices(userId, all, [invoice]);
  }

  return repairCustomerBalances(userId, [...affected], synced);
}

// ═══════════════════════════════════════════
//  SERVICES CATALOGUE
// ═══════════════════════════════════════════

export async function getServiceItems(userId: string): Promise<ServiceItem[]> {
  const snap = await getDocs(userCollection(userId, 'services'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ServiceItem));
  return docs.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addServiceItem(userId: string, item: Omit<ServiceItem, 'id'>): Promise<string> {
  const ref = await addDoc(userCollection(userId, 'services'), {
    ...item,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateServiceItem(userId: string, itemId: string, data: Partial<ServiceItem>) {
  await updateDoc(userDoc(userId, 'services', itemId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteServiceItem(userId: string, itemId: string) {
  await deleteDoc(userDoc(userId, 'services', itemId));
}

// ═══════════════════════════════════════════
//  INVENTORY
// ═══════════════════════════════════════════

export async function getInventoryItems(userId: string): Promise<InventoryItem[]> {
  const snap = await getDocs(userCollection(userId, 'inventory'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryItem));
  return docs.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addInventoryItem(userId: string, item: Omit<InventoryItem, 'id'>): Promise<string> {
  const ref = await addDoc(userCollection(userId, 'inventory'), {
    ...item,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateInventoryItem(userId: string, itemId: string, data: Partial<InventoryItem>) {
  await updateDoc(userDoc(userId, 'inventory', itemId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteInventoryItem(userId: string, itemId: string) {
  await deleteDoc(userDoc(userId, 'inventory', itemId));
}

/**
 * Atomically adjusts the `stock` field of an inventory item by `delta`.
 * Positive delta = inward (purchase); negative = outward (sale).
 * Uses a Firestore transaction so concurrent purchases/invoices don't clobber.
 */
export async function adjustInventoryStock(
  userId: string,
  itemId: string,
  delta: number,
): Promise<void> {
  if (!itemId || delta === 0) return;
  const ref = userDoc(userId, 'inventory', itemId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const cur = (snap.data().stock ?? 0) as number;
    tx.update(ref, { stock: cur + delta, updatedAt: serverTimestamp() });
  });
}

/**
 * Apply a batch of stock adjustments — one per (inventoryItemId, qtyDelta).
 * Lines without an inventoryItemId are skipped silently.
 */
export async function applyStockAdjustments(
  userId: string,
  adjustments: { inventoryItemId?: string; quantity: number }[],
  direction: 'inward' | 'outward',
): Promise<void> {
  const sign = direction === 'inward' ? 1 : -1;
  // Aggregate per item to minimise transactions when the same SKU appears twice
  const byItem = new Map<string, number>();
  for (const a of adjustments) {
    if (!a.inventoryItemId) continue;
    byItem.set(a.inventoryItemId, (byItem.get(a.inventoryItemId) ?? 0) + a.quantity);
  }
  await Promise.all(
    Array.from(byItem.entries()).map(([id, qty]) =>
      adjustInventoryStock(userId, id, sign * qty),
    ),
  );
}

// ═══════════════════════════════════════════
//  CREDIT NOTES
// ═══════════════════════════════════════════

export async function getCreditNotes(userId: string): Promise<CreditNote[]> {
  const snap = await getDocs(userCollection(userId, 'creditNotes'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CreditNote));
  return docs.sort((a, b) => b.date.localeCompare(a.date));
}

export async function addCreditNote(userId: string, note: Omit<CreditNote, 'id'>): Promise<string> {
  const ref = await addDoc(userCollection(userId, 'creditNotes'), {
    ...note,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCreditNote(userId: string, noteId: string, data: Partial<CreditNote>) {
  await updateDoc(userDoc(userId, 'creditNotes', noteId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCreditNote(userId: string, noteId: string) {
  await deleteDoc(userDoc(userId, 'creditNotes', noteId));
}

// ═══════════════════════════════════════════
//  DEBIT NOTES
// ═══════════════════════════════════════════

export async function getDebitNotes(userId: string): Promise<DebitNote[]> {
  const snap = await getDocs(userCollection(userId, 'debitNotes'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DebitNote));
  return docs.sort((a, b) => b.date.localeCompare(a.date));
}

export async function addDebitNote(userId: string, note: Omit<DebitNote, 'id'>): Promise<string> {
  const ref = await addDoc(userCollection(userId, 'debitNotes'), {
    ...note,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDebitNote(userId: string, noteId: string, data: Partial<DebitNote>) {
  await updateDoc(userDoc(userId, 'debitNotes', noteId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDebitNote(userId: string, noteId: string) {
  await deleteDoc(userDoc(userId, 'debitNotes', noteId));
}

// ═══════════════════════════════════════════
//  PURCHASES
//  Stored at users/{userId}/purchases/{id}.
//  Each line item with an inventoryItemId increments the corresponding
//  catalogue stock on save and reverses on edit/delete.
// ═══════════════════════════════════════════

export async function getPurchases(userId: string): Promise<Purchase[]> {
  const snap = await getDocs(userCollection(userId, 'purchases'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Purchase));
  return docs.sort((a, b) => b.date.localeCompare(a.date));
}

export async function addPurchase(userId: string, purchase: Omit<Purchase, 'id'>): Promise<string> {
  const ref = await addDoc(userCollection(userId, 'purchases'), {
    ...purchase,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updatePurchase(userId: string, purchaseId: string, data: Partial<Purchase>): Promise<void> {
  await updateDoc(userDoc(userId, 'purchases', purchaseId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deletePurchase(userId: string, purchaseId: string): Promise<void> {
  await deleteDoc(userDoc(userId, 'purchases', purchaseId));
}

// ═══════════════════════════════════════════
//  QUOTATIONS
//  Stored at users/{userId}/quotations/{id}.
//  NOT included in GST reports, ledger entries,
//  or customer balance calculations.
// ═══════════════════════════════════════════

export async function getQuotations(userId: string): Promise<Quotation[]> {
  const snap = await getDocs(userCollection(userId, 'quotations'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Quotation));
  return docs.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getTotalQuotationCount(userId: string): Promise<number> {
  const snap = await getDocs(userCollection(userId, 'quotations'));
  return snap.docs.length;
}

export async function addQuotation(userId: string, quotation: Omit<Quotation, 'id'>): Promise<string> {
  const ref = await addDoc(userCollection(userId, 'quotations'), {
    ...quotation,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateQuotation(userId: string, quotationId: string, data: Partial<Quotation>): Promise<void> {
  await updateDoc(userDoc(userId, 'quotations', quotationId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteQuotation(userId: string, quotationId: string): Promise<void> {
  await deleteDoc(userDoc(userId, 'quotations', quotationId));
}

// ═══════════════════════════════════════════
//  PROFESSIONAL ACCESS
// ═══════════════════════════════════════════

/**
 * Real-time listener for users/{userId}/assignedProfessionals.
 * Returns an unsubscribe function.
 */
export function subscribeAssignedProfessionals(
  userId: string,
  callback: (pros: AssignedProfessional[]) => void,
): () => void {
  const colRef = collection(db, 'users', userId, 'assignedProfessionals');
  return onSnapshot(colRef, (snap) => {
    const list = snap.docs.map((d) => ({ ...d.data(), id: d.id } as AssignedProfessional));
    // Newest invites first
    list.sort((a, b) => (a.invitedAt > b.invitedAt ? -1 : 1));
    callback(list);
  });
}

/**
 * Writes an invite to invites/{token} and users/{uid}/assignedProfessionals/{token}.
 * Returns the generated token.
 *
 * TODO: Trigger invite email via Firebase Extension (trigger-email) or a
 * Cloud Function that listens to invites/{token} onCreate.
 */
export async function createProfessionalInvite(
  businessUserId: string,
  data: {
    businessUserEmail: string;
    businessName: string;
    firstName: string;
    lastName: string;
    email: string;
    designation: ProfessionalDesignation;
    accessLevel: string;
  },
): Promise<string> {
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const inviteDoc = {
    businessUserUid: businessUserId,
    businessUserEmail: data.businessUserEmail,
    businessName: data.businessName,
    professionalEmail: data.email,
    professionalFirstName: data.firstName,
    professionalLastName: data.lastName,
    designation: data.designation,
    accessLevel: data.accessLevel,
    status: 'pending',
    createdAt: now,
    expiresAt,
    token,
  };

  const assignedDoc: AssignedProfessional = {
    id: token,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email.toLowerCase(),   // normalised — this is the query key
    designation: data.designation,
    accessLevel: data.accessLevel,
    status: 'pending',
    invitedAt: now,
    // Stored here so the collection-group query has all display info without
    // needing a secondary read on the business profile or the invites doc.
    businessName: data.businessName,
    businessUserEmail: data.businessUserEmail,
  };

  await Promise.all([
    setDoc(doc(db, 'invites', token), inviteDoc),
    setDoc(doc(db, 'users', businessUserId, 'assignedProfessionals', token), assignedDoc),
  ]);

  return token;
}

/**
 * Revokes a professional's access:
 *  1. Sets status = 'revoked' in invites/{token}
 *  2. Sets status = 'revoked' in users/{userId}/assignedProfessionals/{token}
 *  3. If the professional has registered, removes the business uid from their linkedClients
 */
export async function revokeProfessionalAccess(
  businessUserId: string,
  token: string,
  professionalId: string | undefined,
): Promise<void> {
  const updates: Promise<unknown>[] = [
    updateDoc(doc(db, 'users', businessUserId, 'assignedProfessionals', token), { status: 'revoked' }),
  ];

  // Remove business uid from the professional's linkedClients array (best-effort).
  // Read professionalUid from assignedProfessionals (set there on accept).
  try {
    const assignedSnap = await getDoc(
      doc(db, 'users', businessUserId, 'assignedProfessionals', token),
    );
    const proUid = assignedSnap.exists()
      ? (assignedSnap.data().professionalUid as string | undefined)
      : undefined;
    if (proUid) {
      updates.push(
        updateDoc(doc(db, 'users', proUid, 'professional', 'main'), {
          linkedClients: arrayRemove(businessUserId),
        }),
      );
    }
  } catch {
    // Non-blocking: assignedProfessionals update still proceeds
  }

  await Promise.all(updates);
}

// ═══════════════════════════════════════════
//  EMAIL-BASED INVITE MATCHING
// ═══════════════════════════════════════════

/**
 * Real-time subscription to pending assignments for a professional by email.
 *
 * Email-centric: queries the `assignedProfessionals` collection GROUP across
 * all business accounts where `email == professional's email`.  The business
 * UID is extracted from each document's path rather than stored as a field,
 * so no invite-token ID matching is required.
 *
 * Security rules allow this because the rule on
 *   /users/{businessUid}/assignedProfessionals/{docId}
 * grants reads where resource.data.email == auth token email, and a
 * /{path=**}/assignedProfessionals/{docId} wildcard rule extends that to
 * collection-group queries.
 */
export function subscribePendingInvitesByEmail(
  email: string,
  callback: (assignments: PendingAssignment[]) => void,
): () => void {
  const normalizedEmail = email.toLowerCase();
  const q = query(
    collectionGroup(db, 'assignedProfessionals'),
    where('email', '==', normalizedEmail),
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({
          id: d.id,
          businessUserUid: d.ref.parent.parent!.id,
          ...(d.data() as Omit<PendingAssignment, 'id' | 'businessUserUid'>),
        } as PendingAssignment))
        .filter((a) => a.status === 'pending')
        .sort((a, b) => (a.invitedAt > b.invitedAt ? -1 : 1));
      callback(list);
    },
    (error) => {
      console.error(
        '[subscribePendingInvitesByEmail] collection-group query failed for',
        normalizedEmail,
        '—',
        error.code,
        error.message,
      );
      callback([]);
    },
  );
}

/**
 * Accept a pending assignment from within the professional dashboard.
 * Email-centric: writes only to `assignedProfessionals` (the source of truth)
 * and the professional's own `professional/main` doc.  No invite-token lookup.
 */
export async function acceptPendingInvite(
  assignment: PendingAssignment,
  professionalUid: string,
  professionalId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all([
    updateDoc(
      doc(db, 'users', assignment.businessUserUid, 'assignedProfessionals', assignment.id),
      { status: 'active', linkedAt: now, professionalId, professionalUid },
    ),
    updateDoc(doc(db, 'users', professionalUid, 'professional', 'main'), {
      linkedClients: arrayUnion(assignment.businessUserUid),
    }),
  ]);
}

/**
 * Decline a pending assignment from within the professional dashboard.
 * Email-centric: writes only to `assignedProfessionals`.
 */
export async function declinePendingInvite(
  assignment: PendingAssignment,
): Promise<void> {
  await updateDoc(
    doc(db, 'users', assignment.businessUserUid, 'assignedProfessionals', assignment.id),
    { status: 'revoked' },
  );
}

/**
 * One-shot query: fetch all pending assignments for a professional email.
 * Used during sign-up to check for pre-existing assignments.
 * Email-centric: queries the `assignedProfessionals` collection group.
 */
export async function getPendingInvitesByEmail(
  email: string,
): Promise<PendingAssignment[]> {
  const q = query(
    collectionGroup(db, 'assignedProfessionals'),
    where('email', '==', email.toLowerCase()),
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({
      id: d.id,
      businessUserUid: d.ref.parent.parent!.id,
      ...(d.data() as Omit<PendingAssignment, 'id' | 'businessUserUid'>),
    } as PendingAssignment))
    .filter((a) => a.status === 'pending');
}

// ═══════════════════════════════════════════
//  GST SESSION  (users/{userId}/gstSessions/{gstin})
// Written by the wbVerifyOTP Cloud Function; read here on mount to restore
// sessions across page refreshes without requiring re-authentication.

export async function loadGSTSession(
  userId: string,
  gstin: string,
): Promise<{ authToken: string; expiresAt: number; gstUsername: string } | null> {
  const snap = await getDoc(userDoc(userId, 'gstSessions', gstin.toUpperCase()));
  if (!snap.exists()) return null;
  const d = snap.data() as { authToken: string; expiresAt: number; gstUsername: string };
  if (!d.authToken || !d.expiresAt || d.expiresAt <= Date.now()) return null;
  return { authToken: d.authToken, expiresAt: d.expiresAt, gstUsername: d.gstUsername ?? '' };
}

// ═══════════════════════════════════════════
//  GSTR CACHE  (users/{userId}/gstrCache/{type}_{period})
// Stores fetched GSTR data so the user doesn't need to re-fetch every visit.

export interface GSTRCacheDoc {
  type: '2b' | '3b' | '1';
  gstin: string;
  period: string;
  data: Record<string, any>;
  fetchedAt: number; // epoch ms
}

export async function saveGSTRCache(
  userId: string,
  type: '2b' | '3b' | '1',
  gstin: string,
  period: string,
  data: Record<string, any>,
): Promise<void> {
  const docId = `${type}_${gstin}_${period}`;
  await setDoc(userDoc(userId, 'gstrCache', docId), {
    type,
    gstin: gstin.toUpperCase(),
    period,
    data,
    fetchedAt: Date.now(),
  });
}

export async function loadGSTRCache(
  userId: string,
  type: '2b' | '3b' | '1',
  gstin: string,
  period: string,
): Promise<GSTRCacheDoc | null> {
  const docId = `${type}_${gstin}_${period}`;
  const snap = await getDoc(userDoc(userId, 'gstrCache', docId));
  if (!snap.exists()) return null;
  return snap.data() as GSTRCacheDoc;
}

// ═══════════════════════════════════════════
//  DELIVERY CHALLANS
//  Stored at users/{userId}/deliveryChallans/{id}.
// ═══════════════════════════════════════════

export async function getDeliveryChallans(userId: string): Promise<DeliveryChallan[]> {
  const snap = await getDocs(userCollection(userId, 'deliveryChallans'));
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeliveryChallan));
  return docs.sort((a, b) => b.date.localeCompare(a.date));
}

export async function addDeliveryChallan(userId: string, challan: Omit<DeliveryChallan, 'id'>): Promise<string> {
  const ref = await addDoc(userCollection(userId, 'deliveryChallans'), {
    ...challan,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDeliveryChallan(userId: string, challanId: string, data: Partial<DeliveryChallan>): Promise<void> {
  await updateDoc(userDoc(userId, 'deliveryChallans', challanId), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteDeliveryChallan(userId: string, challanId: string): Promise<void> {
  await deleteDoc(userDoc(userId, 'deliveryChallans', challanId));
}
