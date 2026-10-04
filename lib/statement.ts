/**
 * Customer account statement for a chosen period.
 *
 * A period statement still has to agree with the full ledger, so everything
 * dated before the period is rolled up into an opening balance brought
 * forward, and the running balance inside the period starts from it.
 */

import type { LedgerEntry } from '../types';

/** Inclusive YYYY-MM-DD bounds; an empty bound leaves that end open. */
export interface StatementPeriod { from?: string; to?: string }

export interface StatementRow extends LedgerEntry { runningBalance: number }

export interface Statement {
  opening: number;
  rows: StatementRow[];
  totalDebit: number;
  totalCredit: number;
  closing: number;
}

const signed = (e: LedgerEntry) => (e.type === 'Debit' ? e.amount : -e.amount);

export function buildStatement(entries: LedgerEntry[], period: StatementPeriod = {}): Statement {
  const { from, to } = period;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  const opening = from
    ? sorted.filter(e => e.date < from).reduce((sum, e) => sum + signed(e), 0)
    : 0;

  let balance = opening;
  const rows = sorted
    .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
    .map(e => {
      balance += signed(e);
      return { ...e, runningBalance: balance };
    });

  const totalDebit = rows.filter(e => e.type === 'Debit').reduce((s, e) => s + e.amount, 0);
  const totalCredit = rows.filter(e => e.type === 'Credit').reduce((s, e) => s + e.amount, 0);
  return { opening, rows, totalDebit, totalCredit, closing: opening + totalDebit - totalCredit };
}
