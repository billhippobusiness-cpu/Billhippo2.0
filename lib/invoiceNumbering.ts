/**
 * Invoice numbering rules.
 *
 * GST (Rule 46, CGST Rules) needs every invoice number to be unique, so a
 * number stays taken once it has been used — even after the invoice is moved
 * to the deleted archive. Both helpers below therefore expect the full list of
 * invoices, deleted ones included.
 */

import type { Invoice } from '../types';

type NumberedInvoice = Pick<Invoice, 'id' | 'invoiceNumber' | 'date'> & { deleted?: boolean };

/** Compare numbers the way a person would: ignore case and stray spaces. */
export const normalizeInvoiceNumber = (n: string) => n.replace(/\s+/g, '').toLowerCase();

/**
 * The number that follows the last one used in the `prefix` series.
 *
 * Reads the leading digits after the prefix on every invoice in the series —
 * `INV/2026-27/013A` counts as 13 — takes the highest, and adds one, keeping
 * the zero-padding the series already uses (at least three digits). A series
 * with no invoices yet starts at 001.
 */
export function nextInvoiceNumber(prefix: string, invoices: NumberedInvoice[]): string {
  const series = normalizeInvoiceNumber(prefix);
  let highest = 0;
  let width = 3;
  for (const inv of invoices) {
    const number = normalizeInvoiceNumber(inv.invoiceNumber || '');
    if (!number.startsWith(series)) continue;
    const digits = /^(\d+)/.exec(number.slice(series.length))?.[1];
    if (!digits) continue;
    const seq = parseInt(digits, 10);
    if (seq >= highest) {
      highest = seq;
      width = Math.max(width, digits.length);
    }
  }
  return `${prefix}${String(highest + 1).padStart(width, '0')}`;
}

/**
 * The invoice already carrying `number`, or null when it is free. `excludeId`
 * is the invoice being edited, which may keep its own number.
 */
export function findInvoiceNumberClash<T extends NumberedInvoice>(
  number: string,
  invoices: T[],
  excludeId?: string,
): T | null {
  const wanted = normalizeInvoiceNumber(number);
  if (!wanted) return null;
  return invoices.find(inv =>
    inv.id !== excludeId && normalizeInvoiceNumber(inv.invoiceNumber || '') === wanted,
  ) ?? null;
}

/** One-line description of a clash for the user, e.g. "INV/001 (15-08-2026, deleted)". */
export function describeInvoiceNumberClash(inv: NumberedInvoice): string {
  const [y, m, d] = (inv.date || '').split('-');
  const date = y && m && d ? `${d}-${m}-${y}` : inv.date;
  return `${inv.invoiceNumber} (${date}${inv.deleted ? ', deleted' : ''})`;
}
