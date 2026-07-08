/**
 * Composition-scheme returns: CMP-08 (quarterly self-assessed tax statement)
 * and GSTR-4 (annual return). Computation + Excel exports.
 *
 * Turnover is taken from documents whose scheme (snapshot-first, date-derived
 * fallback — see lib/gstScheme.ts docScheme) is 'composition', clipped to the
 * composition sub-range(s) of the requested period, so a mid-quarter scheme
 * switch never double-counts documents into both CMP-08 and GSTR-1/3B.
 */

import * as XLSX from 'xlsx';
import type { BusinessProfile, CompositionCategory, CreditNote, DebitNote, Invoice, Purchase } from '../types';
import { COMPOSITION_CATEGORIES, DEFAULT_COMPOSITION_CATEGORY, docScheme, schemeRangesInPeriod } from './gstScheme';
import { getFYDateRange, getFYQuarters, quarterToDateRange, quarterLabel } from './financialYear';

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** CMP-08 filing due date: 18th of the month following the quarter. */
export function cmp08DueDate(quarterKey: string): string {
  const { end } = quarterToDateRange(quarterKey);
  const [y, m] = end.split('-').map(Number);
  const dueMonth = m === 12 ? 1 : m + 1;
  const dueYear = m === 12 ? y + 1 : y;
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-18`;
}

/** GSTR-4 filing due date: 30 June following the financial year. */
export function gstr4DueDate(fyLabel: string): string {
  const { end } = getFYDateRange(fyLabel);
  const endYear = parseInt(end.split('-')[0], 10);
  return `${endYear}-06-30`;
}

// ─── CMP-08 ───────────────────────────────────────────────────────────────────

export interface CMP08Data {
  quarterKey: string;                 // e.g. "2026-Q1"
  quarterLabel: string;
  start: string;                      // effective range (clipped to composition sub-range)
  end: string;
  clipped: boolean;                   // true when a mid-quarter switch shortened the range
  category: CompositionCategory;
  ratePct: number;
  outwardTurnover: number;            // Σ invoices − credit notes + debit notes in range
  taxPayable: number;                 // outwardTurnover × ratePct
  cgst: number;
  sgst: number;
  invoiceCount: number;
  creditNoteCount: number;
  debitNoteCount: number;
  invoiceTotal: number;
  creditNoteTotal: number;
  debitNoteTotal: number;
  dueDate: string;
}

const inRange = (date: string, start: string, end: string) => date >= start && date <= end;

/**
 * Computes CMP-08 for a quarter. Returns null when no part of the quarter is
 * under the composition scheme. Only documents classified as composition
 * (docScheme) inside the composition sub-range(s) count.
 */
export function computeCMP08(
  profile: BusinessProfile,
  invoices: Invoice[],
  creditNotes: CreditNote[],
  debitNotes: DebitNote[],
  quarterKey: string,
): CMP08Data | null {
  const { start: qStart, end: qEnd } = quarterToDateRange(quarterKey);
  const ranges = schemeRangesInPeriod(profile, qStart, qEnd).filter(rg => rg.scheme === 'composition');
  if (ranges.length === 0) return null;

  const category = ranges[ranges.length - 1].category ?? profile.compositionCategory ?? DEFAULT_COMPOSITION_CATEGORY;
  const info = COMPOSITION_CATEGORIES[category];

  const inCompositionRange = (doc: { date: string; scheme?: Invoice['scheme'] }) =>
    ranges.some(rg => inRange(doc.date, rg.start, rg.end)) && docScheme(doc, profile) === 'composition';

  const invs = invoices.filter(i => !i.deleted && inCompositionRange(i));
  const cns  = creditNotes.filter(n => inCompositionRange(n));
  const dns  = debitNotes.filter(n => inCompositionRange(n));

  const invoiceTotal    = r2(invs.reduce((s, i) => s + i.totalAmount, 0));
  const creditNoteTotal = r2(cns.reduce((s, n) => s + n.totalAmount, 0));
  const debitNoteTotal  = r2(dns.reduce((s, n) => s + n.totalAmount, 0));
  const outwardTurnover = Math.max(0, r2(invoiceTotal - creditNoteTotal + debitNoteTotal));

  const taxPayable = r2(outwardTurnover * info.ratePct / 100);

  const clipped = !(ranges.length === 1 && ranges[0].start === qStart && ranges[0].end === qEnd);

  return {
    quarterKey,
    quarterLabel: quarterLabel(quarterKey),
    start: ranges[0].start,
    end: ranges[ranges.length - 1].end,
    clipped,
    category,
    ratePct: info.ratePct,
    outwardTurnover,
    taxPayable,
    cgst: r2(taxPayable / 2),
    sgst: r2(taxPayable / 2),
    invoiceCount: invs.length,
    creditNoteCount: cns.length,
    debitNoteCount: dns.length,
    invoiceTotal,
    creditNoteTotal,
    debitNoteTotal,
    dueDate: cmp08DueDate(quarterKey),
  };
}

// ─── GSTR-4 ───────────────────────────────────────────────────────────────────

export interface GSTR4Data {
  fyLabel: string;
  quarters: CMP08Data[];              // composition quarters of the FY (chronological)
  outwardTotal: number;
  taxTotal: number;
  inwardByRate: Array<{ gstRate: number; taxableValue: number; tax: number }>;
  inwardTaxableTotal: number;
  inwardTaxTotal: number;
  purchaseCount: number;
  dueDate: string;
}

export function computeGSTR4(
  profile: BusinessProfile,
  invoices: Invoice[],
  creditNotes: CreditNote[],
  debitNotes: DebitNote[],
  purchases: Purchase[],
  fyLabel: string,
): GSTR4Data {
  // getFYQuarters returns latest-first; reverse for chronological display
  const quarters = [...getFYQuarters(fyLabel)].reverse()
    .map(q => computeCMP08(profile, invoices, creditNotes, debitNotes, q))
    .filter((q): q is CMP08Data => q !== null);

  // Inward supplies: purchases dated inside the FY's composition sub-range(s),
  // aggregated rate-wise (GST paid on purchases is a cost — reported in GSTR-4 table 4)
  const { start: fyStart, end: fyEnd } = getFYDateRange(fyLabel);
  const compRanges = schemeRangesInPeriod(profile, fyStart, fyEnd).filter(rg => rg.scheme === 'composition');
  const fyPurchases = purchases.filter(p => compRanges.some(rg => inRange(p.date, rg.start, rg.end)));

  const rateMap = new Map<number, { taxableValue: number; tax: number }>();
  for (const p of fyPurchases) {
    for (const item of p.items) {
      const taxable = r2(item.quantity * item.rate);
      const tax = r2(taxable * item.gstRate / 100);
      const entry = rateMap.get(item.gstRate) ?? { taxableValue: 0, tax: 0 };
      entry.taxableValue = r2(entry.taxableValue + taxable);
      entry.tax = r2(entry.tax + tax);
      rateMap.set(item.gstRate, entry);
    }
  }
  const inwardByRate = [...rateMap.entries()]
    .map(([gstRate, v]) => ({ gstRate, ...v }))
    .sort((a, b) => a.gstRate - b.gstRate);

  return {
    fyLabel,
    quarters,
    outwardTotal: r2(quarters.reduce((s, q) => s + q.outwardTurnover, 0)),
    taxTotal: r2(quarters.reduce((s, q) => s + q.taxPayable, 0)),
    inwardByRate,
    inwardTaxableTotal: r2(inwardByRate.reduce((s, rw) => s + rw.taxableValue, 0)),
    inwardTaxTotal: r2(inwardByRate.reduce((s, rw) => s + rw.tax, 0)),
    purchaseCount: fyPurchases.length,
    dueDate: gstr4DueDate(fyLabel),
  };
}

// ─── Excel exports ────────────────────────────────────────────────────────────

export function downloadCMP08Excel(data: CMP08Data, profile: BusinessProfile): void {
  const info = COMPOSITION_CATEGORIES[data.category];
  const rows: (string | number)[][] = [
    ['FORM GST CMP-08 — Statement for payment of self-assessed tax'],
    [],
    ['GSTIN', profile.gstin || '—'],
    ['Legal Name', profile.name],
    ['Period', data.quarterLabel],
    ['Composition Category', info.label],
    ['Applicable Rate', `${data.ratePct}%`],
    ...(data.clipped ? [['Note', `Composition scheme applied from ${fmtDate(data.start)} to ${fmtDate(data.end)} within this quarter (scheme change).`]] : []),
    [],
    ['3. Summary of self-assessed liability'],
    ['Sr.', 'Description', 'Value (₹)', 'Integrated Tax', 'Central Tax', 'State/UT Tax', 'Cess'],
    [1, 'Outward supplies (including exempt supplies)', data.outwardTurnover, 0, data.cgst, data.sgst, 0],
    [2, 'Inward supplies attracting reverse charge', 0, 0, 0, 0, 0],
    [3, 'Tax payable (1+2)', '', 0, data.cgst, data.sgst, 0],
    [4, 'Interest payable, if any', '', 0, 0, 0, 0],
    [],
    ['Derivation of outward turnover'],
    ['Bills of Supply issued', data.invoiceCount, data.invoiceTotal],
    ['Less: Credit Notes', data.creditNoteCount, -data.creditNoteTotal],
    ['Add: Debit Notes', data.debitNoteCount, data.debitNoteTotal],
    ['Net outward turnover', '', data.outwardTurnover],
    [],
    ['Tax payable', '', data.taxPayable],
    ['Due date for filing', fmtDate(data.dueDate)],
    [],
    ['Note: Row 2 (reverse-charge inward supplies) must be self-assessed — BillHippo does not track RCM purchases.'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 48 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CMP-08');
  const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  triggerDownload(new Blob([arr], { type: 'application/octet-stream' }), `CMP08_${data.quarterKey}.xlsx`);
}

export function downloadGSTR4Excel(data: GSTR4Data, profile: BusinessProfile): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Outward (quarterly CMP-08 summary)
  const outwardRows: (string | number)[][] = [
    [`FORM GSTR-4 — Annual Return (Composition) — FY ${data.fyLabel}`],
    [],
    ['GSTIN', profile.gstin || '—'],
    ['Legal Name', profile.name],
    ['Due date for filing', fmtDate(data.dueDate)],
    [],
    ['6. Outward supplies / tax paid (per CMP-08)'],
    ['Quarter', 'Period', 'Rate', 'Turnover (₹)', 'Central Tax', 'State/UT Tax', 'Tax Paid (₹)'],
    ...data.quarters.map(q => [
      q.quarterKey,
      `${fmtDate(q.start)} – ${fmtDate(q.end)}${q.clipped ? ' (part)' : ''}`,
      `${q.ratePct}%`,
      q.outwardTurnover,
      q.cgst,
      q.sgst,
      q.taxPayable,
    ]),
    ['TOTAL', '', '', data.outwardTotal, r2(data.taxTotal / 2), r2(data.taxTotal / 2), data.taxTotal],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(outwardRows);
  ws1['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 8 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Outward & Tax Paid');

  // Sheet 2: Inward (rate-wise purchases)
  const inwardRows: (string | number)[][] = [
    ['4. Inward supplies (rate-wise, from recorded purchases)'],
    [],
    ['GST Rate', 'Taxable Value (₹)', 'Tax (₹)'],
    ...data.inwardByRate.map(rw => [`${rw.gstRate}%`, rw.taxableValue, rw.tax]),
    ['TOTAL', data.inwardTaxableTotal, data.inwardTaxTotal],
    [],
    [`Purchases considered: ${data.purchaseCount} (dated within the composition period of FY ${data.fyLabel})`],
    ['Note: ITC is not claimable under the composition scheme — GST on purchases is a cost.'],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(inwardRows);
  ws2['!cols'] = [{ wch: 14 }, { wch: 20 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Inward Supplies');

  const arr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  triggerDownload(new Blob([arr], { type: 'application/octet-stream' }), `GSTR4_FY${data.fyLabel}.xlsx`);
}
