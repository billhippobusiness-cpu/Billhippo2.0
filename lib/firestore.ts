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
  CreditNote,
  DebitNote,
  AssignedProfessional,
  ProfessionalDesignation,
  ProfessionalInvite,
  PendingAssignment,
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
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
  return docs.sort((a, b) => a.name.localeCompare(b.name));
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
