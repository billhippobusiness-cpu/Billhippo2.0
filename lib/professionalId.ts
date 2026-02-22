import { collection, query, orderBy, limit, where, getDocs, type Firestore } from 'firebase/firestore';
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
 * Queries the top-level `professionals` collection, orders by professionalId
 * descending to find the highest existing number, then increments by 1.
 * If no professionals exist yet, starts at 00001.
 */
export async function generateProfessionalId(
  designation: ProfessionalDesignation,
  firestore: Firestore,
): Promise<string> {
  const code = DESIGNATION_CODES[designation];
  const prefix = `BHP${code}`;

  const q = query(
    collection(firestore, 'professionals'),
    orderBy('professionalId', 'desc'),
    limit(1),
  );

  const snap = await getDocs(q);

  let nextNumber = 1;
  if (!snap.empty) {
    const lastId = snap.docs[0].data().professionalId as string | undefined;
    if (lastId && lastId.length >= 5) {
      const numPart = parseInt(lastId.slice(-5), 10);
      if (!isNaN(numPart)) {
        nextNumber = numPart + 1;
      }
    }
  }

  const paddedNumber = String(nextNumber).padStart(5, '0');
  return `${prefix}${paddedNumber}`;
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
