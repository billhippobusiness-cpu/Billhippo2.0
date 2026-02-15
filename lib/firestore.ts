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
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import type { BusinessProfile, Customer, Invoice, LedgerEntry } from '../types';

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
  await updateDoc(doc(db, 'users', userId, 'profile', 'main'), {
    ...profile,
    updatedAt: serverTimestamp(),
  }).catch(async () => {
    // Document doesn't exist yet — create it
    const { setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', userId, 'profile', 'main'), {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

// ═══════════════════════════════════════════
//  CUSTOMERS
// ═══════════════════════════════════════════

export async function getCustomers(userId: string): Promise<Customer[]> {
  const q = query(userCollection(userId, 'customers'), orderBy('name'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Customer));
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
  const q = query(userCollection(userId, 'invoices'), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice));
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

export async function deleteInvoice(userId: string, invoiceId: string) {
  await deleteDoc(userDoc(userId, 'invoices', invoiceId));
}

// ═══════════════════════════════════════════
//  LEDGER ENTRIES
// ═══════════════════════════════════════════

export async function getLedgerEntries(userId: string, customerId?: string): Promise<LedgerEntry[]> {
  let q;
  if (customerId) {
    q = query(
      userCollection(userId, 'ledger'),
      where('customerId', '==', customerId),
      orderBy('date', 'desc')
    );
  } else {
    q = query(userCollection(userId, 'ledger'), orderBy('date', 'desc'));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry));
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
