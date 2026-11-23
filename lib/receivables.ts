/**
 * Bill-by-bill settlement of a customer's ledger.
 *
 * Every Debit entry (an invoice's sale entry, a debit note, a manual debit) is
 * an amount the customer owes. Every Credit entry (a receipt, a credit note)
 * pays some of it off. This module works out which receivable each credit
 * settled, so the ledger can show what is still open on every invoice and for
 * how many days.
 *
 * A credit is applied in two passes:
 *
 *  1. Against the invoices it names. A receipt recorded "against invoice(s)"
 *     carries `allocations`; an older receipt collected from the invoice list
 *     carries a single `invoiceId`; a credit note may refer to its original
 *     invoice. Each named invoice takes at most what is still open on it.
 *  2. Whatever is left — a lump-sum receipt, an over-payment, an allocation to
 *     an invoice that was since deleted — is pooled and settles the oldest
 *     open receivables first (FIFO).
 *
 * Named allocations run before FIFO so an explicit choice is never undone by
 * an earlier lump sum that happened to reach the same invoice first. Totals
 * always agree with the running balance: outstanding − unapplied credit equals
 * the ledger's closing balance.
 *
 * Nothing here is stored. It is recomputed from the ledger every time, so
 * editing or deleting a receipt, invoice or note re-settles everything after
 * it automatically.
 */

import type { Invoice, LedgerEntry, ReceiptAllocation } from '../types';

/** Receivables open longer than this are flagged in red. */
export const OVERDUE_ALERT_DAYS = 45;

export interface ReceivableStatus {
  /** The Debit ledger entry this receivable comes from. */
  entryId: string;
  invoiceId?: string;
  date: string;
  amount: number;
  settled: number;
  outstanding: number;
  /** Date of the receipt that cleared it — set only once fully settled. */
  settledOn?: string;
  /** Days since it fell due while open; days it took to clear once settled. */
  days: number;
}

export interface CreditApplication {
  receivableEntryId: string;
  invoiceId?: string;
  amount: number;
  /** True when applied by FIFO rather than by the user's choice. */
  fifo: boolean;
}

export interface CreditStatus {
  entryId: string;
  applied: CreditApplication[];
  /** Part of the credit not yet adjusted against anything (an advance). */
  unapplied: number;
}

export interface Settlement {
  /** Keyed by the Debit entry id. */
  receivables: Map<string, ReceivableStatus>;
  /** Keyed by invoice id, for receivables raised by an invoice. */
  byInvoiceId: Map<string, ReceivableStatus>;
  /** Keyed by the Credit entry id. */
  credits: Map<string, CreditStatus>;
  totalOutstanding: number;
  /** Credit received but not yet adjusted against any receivable. */
  unappliedCredit: number;
}

export interface SettleOptions {
  /** YYYY-MM-DD to age against; defaults to today's local date. */
  today?: string;
  /** creditNoteId → original invoice id, so a credit note reduces its own invoice. */
  creditNoteInvoice?: Map<string, string>;
}

// ── Date helpers (YYYY-MM-DD, timezone-proof) ────────────────────────────────

const dayNumber = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, day || 1) / 86_400_000);
};

/** Whole days from `from` to `to`; never negative. */
export const daysBetween = (from: string, to: string) =>
  Math.max(0, dayNumber(to) - dayNumber(from));

/** Today's date in the user's own timezone, as YYYY-MM-DD. */
export function localToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

// Money is settled in whole paise so 0.1 + 0.2 never leaves a stray 0.00000001
// open on an invoice.
const toPaise = (n: number) => Math.round((Number(n) || 0) * 100);
const fromPaise = (p: number) => p / 100;

/**
 * The allocations a credit entry asks for, before any capping.
 * An explicit `allocations` array wins (an empty one means "lump sum");
 * otherwise a legacy `invoiceId`, then a credit note's original invoice.
 */
export function requestedAllocations(
  entry: LedgerEntry,
  creditNoteInvoice?: Map<string, string>,
): ReceiptAllocation[] {
  if (Array.isArray(entry.allocations)) return entry.allocations;
  if (entry.invoiceId) return [{ invoiceId: entry.invoiceId, amount: entry.amount }];
  const noteInvoice = entry.creditNoteId ? creditNoteInvoice?.get(entry.creditNoteId) : undefined;
  if (noteInvoice) return [{ invoiceId: noteInvoice, amount: entry.amount }];
  return [];
}

const byDateThenDescription = (a: LedgerEntry, b: LedgerEntry) =>
  a.date.localeCompare(b.date)
  || (a.description || '').localeCompare(b.description || '', undefined, { numeric: true })
  || a.id.localeCompare(b.id);

/** Settle one customer's ledger entries. */
export function settleLedger(entries: LedgerEntry[], options: SettleOptions = {}): Settlement {
  const today = options.today ?? localToday();

  interface Open { status: ReceivableStatus; amount: number; settled: number; lastPaid?: string }
  const debits = entries.filter(e => e.type === 'Debit').sort(byDateThenDescription);
  const credits = entries.filter(e => e.type === 'Credit').sort(byDateThenDescription);

  const open: Open[] = debits.map(e => ({
    status: {
      entryId: e.id, invoiceId: e.invoiceId, date: e.date,
      amount: e.amount, settled: 0, outstanding: e.amount, days: 0,
    },
    amount: toPaise(e.amount),
    settled: 0,
  }));
  const openByInvoice = new Map<string, Open>();
  for (const o of open) {
    // An invoice has one sale entry; if bad data left two, the first wins.
    if (o.status.invoiceId && !openByInvoice.has(o.status.invoiceId)) {
      openByInvoice.set(o.status.invoiceId, o);
    }
  }

  const apply = (o: Open, paise: number, date: string) => {
    o.settled += paise;
    if (!o.lastPaid || date > o.lastPaid) o.lastPaid = date;
  };

  // ── Pass 1: allocations the user (or the invoice) asked for ──
  const creditStatus = new Map<string, CreditStatus>();
  const pool: { entryId: string; date: string; paise: number }[] = [];
  for (const c of credits) {
    const status: CreditStatus = { entryId: c.id, applied: [], unapplied: 0 };
    creditStatus.set(c.id, status);
    let left = toPaise(c.amount);
    for (const req of requestedAllocations(c, options.creditNoteInvoice)) {
      if (left <= 0) break;
      const target = openByInvoice.get(req.invoiceId);
      if (!target) continue;
      const take = Math.min(left, toPaise(req.amount), target.amount - target.settled);
      if (take <= 0) continue;
      apply(target, take, c.date);
      left -= take;
      status.applied.push({
        receivableEntryId: target.status.entryId, invoiceId: req.invoiceId,
        amount: fromPaise(take), fifo: false,
      });
    }
    if (left > 0) pool.push({ entryId: c.id, date: c.date, paise: left });
  }

  // ── Pass 2: FIFO — pooled credit clears the oldest open receivables ──
  let i = 0;
  for (const chunk of pool) {
    const status = creditStatus.get(chunk.entryId)!;
    while (chunk.paise > 0 && i < open.length) {
      const o = open[i];
      const due = o.amount - o.settled;
      if (due <= 0) { i++; continue; }
      const take = Math.min(due, chunk.paise);
      apply(o, take, chunk.date);
      chunk.paise -= take;
      status.applied.push({
        receivableEntryId: o.status.entryId, invoiceId: o.status.invoiceId,
        amount: fromPaise(take), fifo: true,
      });
    }
    status.unapplied = fromPaise(chunk.paise);
  }

  // ── Results ──
  const receivables = new Map<string, ReceivableStatus>();
  const byInvoiceId = new Map<string, ReceivableStatus>();
  let outstandingPaise = 0;
  for (const o of open) {
    const due = Math.max(0, o.amount - o.settled);
    outstandingPaise += due;
    const s = o.status;
    s.settled = fromPaise(o.settled);
    s.outstanding = fromPaise(due);
    if (due === 0 && o.amount > 0) {
      s.settledOn = o.lastPaid && o.lastPaid > s.date ? o.lastPaid : s.date;
      s.days = daysBetween(s.date, s.settledOn);
    } else {
      s.days = daysBetween(s.date, today);
    }
    receivables.set(s.entryId, s);
    if (s.invoiceId && openByInvoice.get(s.invoiceId) === o) byInvoiceId.set(s.invoiceId, s);
  }
  const unappliedCredit = [...creditStatus.values()].reduce((sum, c) => sum + toPaise(c.unapplied), 0);

  return {
    receivables, byInvoiceId, credits: creditStatus,
    totalOutstanding: fromPaise(outstandingPaise),
    unappliedCredit: fromPaise(unappliedCredit),
  };
}

/** Whether an open receivable has been pending longer than the alert window. */
export const isLongOverdue = (r: ReceivableStatus) =>
  r.outstanding > 0 && r.days > OVERDUE_ALERT_DAYS;

/** Paid / Partial / Unpaid as the settlement sees it. */
export function settlementStatus(r: ReceivableStatus): Invoice['status'] {
  if (r.outstanding <= 0) return 'Paid';
  return r.settled > 0 ? 'Partial' : 'Unpaid';
}
