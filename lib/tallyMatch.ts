/**
 * Tally ledger matching engine (pure logic, no Firestore/React dependencies).
 *
 * Party-ledger (Sundry Debtor) resolution is GSTIN-first:
 *   1. If the customer has a GSTIN, match it against the GSTIN stored on each
 *      synced Tally ledger. A GSTIN hit is authoritative — the ledger is
 *      considered VERIFIED and NO name comparison is required. When the Tally
 *      ledger name differs from the BillHippo name we surface that purely as
 *      information (`nameDiffers`), never as an error.
 *   2. If the GSTIN does not match (or the customer has no GSTIN), fall back to
 *      name matching, restricted to debtor-group ledgers.
 *
 * Sales / tax ledgers carry no GSTIN, so those are matched by name only via
 * `ledgerExistsByName`.
 */

import type { Customer, TallyLedger } from '../types';

export type PartyMatchStatus =
  | 'gstin'    // matched by GSTIN — authoritative, no action needed
  | 'name'     // matched by name (customer has no GSTIN) — accepted
  | 'suggest'  // a likely ledger found, but needs user confirmation
  | 'none';    // no candidate — user must create or map a ledger

export interface PartyMatchResult {
  status: PartyMatchStatus;
  /** The resolved Tally-side ledger name (matched or suggested). */
  tallyLedgerName?: string;
  /** True when a match was found but the Tally name != BillHippo name. */
  nameDiffers: boolean;
  /** The suggested ledger when status === 'suggest'. */
  suggestion?: TallyLedger;
}

// Groups whose ledgers represent customers (parties). Sub-groups created under
// these in Tally usually still contain the words below, so a substring test is
// intentionally lenient.
const DEBTOR_GROUP_HINTS = ['sundry debtor', 'debtor', 'account receivable'];

export function normalizeGstin(g?: string): string {
  return (g || '').trim().toUpperCase();
}

export function normalizeName(n?: string): string {
  return (n || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isDebtorGroup(parent?: string): boolean {
  const p = normalizeName(parent);
  return DEBTOR_GROUP_HINTS.some((h) => p.includes(h));
}

/**
 * Resolve the Tally party ledger for a customer using the GSTIN-first rule.
 */
export function resolvePartyLedger(
  customer: Pick<Customer, 'name' | 'gstin'>,
  ledgers: TallyLedger[],
): PartyMatchResult {
  const custGstin = normalizeGstin(customer.gstin);
  const custName = normalizeName(customer.name);

  // ── 1. GSTIN-first (only when the customer actually has a GSTIN) ──
  // Only party ledgers carry a GSTIN, so this needs no group filtering.
  if (custGstin) {
    const byGstin = ledgers.find((l) => normalizeGstin(l.gstin) === custGstin);
    if (byGstin) {
      return {
        status: 'gstin',
        tallyLedgerName: byGstin.name,
        nameDiffers: normalizeName(byGstin.name) !== custName,
      };
    }
  }

  // ── 2. Name fallback, restricted to debtor-group ledgers ──
  // If grouping data is missing for every ledger, fall back to the full set so
  // matching still works on a minimally-populated mirror.
  const debtors = ledgers.filter((l) => isDebtorGroup(l.parent));
  const pool = debtors.length ? debtors : ledgers;

  const exact = pool.find((l) => normalizeName(l.name) === custName);
  if (exact) {
    // When the customer HAS a GSTIN but it didn't match, an exact name hit is
    // only a suggestion — it could be a different entity, or a Tally ledger
    // created without a GSTIN. Require explicit confirmation.
    if (custGstin) {
      return { status: 'suggest', tallyLedgerName: exact.name, suggestion: exact, nameDiffers: false };
    }
    return { status: 'name', tallyLedgerName: exact.name, nameDiffers: false };
  }

  // ── 3. Fuzzy suggestion (one name contains the other) ──
  if (custName) {
    const fuzzy = pool.find((l) => {
      const ln = normalizeName(l.name);
      return ln.includes(custName) || custName.includes(ln);
    });
    if (fuzzy) {
      return {
        status: 'suggest',
        tallyLedgerName: fuzzy.name,
        suggestion: fuzzy,
        nameDiffers: normalizeName(fuzzy.name) !== custName,
      };
    }
  }

  return { status: 'none', nameDiffers: false };
}

/**
 * Case-insensitive existence check for a named ledger (sales / tax ledgers).
 */
export function ledgerExistsByName(name: string | undefined, ledgers: TallyLedger[]): boolean {
  const n = normalizeName(name);
  if (!n) return false;
  return ledgers.some((l) => normalizeName(l.name) === n);
}

/** Short human-readable label for a match status (used in the UI). */
export function matchStatusLabel(status: PartyMatchStatus): string {
  switch (status) {
    case 'gstin':   return 'Matched by GSTIN';
    case 'name':    return 'Matched by name';
    case 'suggest': return 'Needs confirmation';
    case 'none':    return 'Not in Tally';
  }
}
