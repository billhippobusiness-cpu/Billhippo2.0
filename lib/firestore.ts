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
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import type { BusinessProfile, Customer, Invoice, LedgerEntry, InventoryItem } from '../types';

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
  return docs.sort((a, b) => b.date.localeCompare(a.date));
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
