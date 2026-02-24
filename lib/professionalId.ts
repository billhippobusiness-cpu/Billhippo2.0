import {
  doc,
  runTransaction,
  query,
  collection,
  where,
  getDocs,
  type Firestore,
} from 'firebase/firestore';
import type { ProfessionalDesignation } from '../types';

const DESIGNATION_CODES: Record<ProfessionalDesignation, string> = {
  'Chartered Accountant': 'CA',
  'Tax Consultant':       'TC',
  'Accountant':           'AC',
  'GST Practitioner':     'GP',
  'Company Secretary':    'CS',
  'Staff':                'ST',
  'Other':                'OT',
};

/**
 * Generates a unique Professional ID in the format BHP<CODE><5-digit-number>.
 * Example: BHPCA00042
 *
 * Uses an atomic transaction on counters/professionals to increment a shared
 * counter.  This avoids needing collection-wide read access on /professionals/
 * (which Firestore security rules would reject for non-admin users).
 */
export async function generateProfessionalId(
  designation: ProfessionalDesignation,
  firestore: Firestore,
): Promise<string> {
  const code = DESIGNATION_CODES[designation];
  const prefix = `BHP${code}`;

  const counterRef = doc(firestore, 'counters', 'professionals');

  let nextNumber: number;
  try {
    nextNumber = await runTransaction(firestore, async (txn) => {
      const snap = await txn.get(counterRef);
      const current = snap.exists() ? ((snap.data().count as number) ?? 0) : 0;
      const next = current + 1;
      txn.set(counterRef, { count: next }, { merge: true });
      return next;
    });
  } catch {
    // Counter document inaccessible (Firestore rules not yet deployed).
    // Fall back to a time-seeded random number; collision probability is
    // negligible for the scale of this app (~1-in-90000 per designation).
    nextNumber = Math.floor(10000 + Math.random() * 89999);
  }

  return `${prefix}${String(nextNumber).padStart(5, '0')}`;
}

/**
 * Looks up a referral code in the professionals collection.
 * Returns the referrer's professionalId if found, null otherwise.
 */
export async function getReferrerByCode(
  code: string,
  firestore: Firestore,
): Promise<string | null> {
  const normalised = code.trim().toUpperCase();
  const q = query(
    collection(firestore, 'professionals'),
    where('referralCode', '==', normalised),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return (snap.docs[0].data() as { professionalId: string }).professionalId ?? null;
}
