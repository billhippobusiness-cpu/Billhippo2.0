/**
 * Sales Register Excel Export
 * Generates XLSX workbooks for Sales Register, Credit/Debit Notes Register, and HSN Summary.
 * Follows the same pattern as gstr1Generator.ts.
 */

import * as XLSX from 'xlsx';
import type { BusinessProfile, Invoice, Customer, CreditNote, DebitNote } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
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

function buildWorkbook(
  rows: (string | number)[][],
  headers: string[],
  sheetName: string,
  colWidths: number[],
): Blob {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Style column widths
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const wbArr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbArr], { type: 'application/octet-stream' });
}

// ─── Sales Register ───────────────────────────────────────────────────────────

export interface SalesRegisterData {
  profile: BusinessProfile;
  invoices: Invoice[];
  customers: Customer[];
  periodLabel: string;
}

export function downloadSalesRegisterExcel(data: SalesRegisterData): void {
  const { invoices, customers, periodLabel, profile } = data;
  const custMap = new Map(customers.map(c => [c.id, c]));

  const sortedInvoices = [...invoices].sort((a, b) => a.date.localeCompare(b.date));

  const headers = [
    '#',
    'Date',
    'Invoice No.',
    'Party Name',
    'GSTIN',
    'Taxable Amount',
    'IGST',
    'CGST',
    'SGST',
    'Total Tax',
    'Total Amount',
    'Status',
  ];

  let totalTaxable = 0, totalIGST = 0, totalCGST = 0, totalSGST = 0, totalTax = 0, totalAmt = 0;

  const rows: (string | number)[][] = sortedInvoices.map((inv, idx) => {
    const gstin = custMap.get(inv.customerId)?.gstin ?? '';
    const tax = r2(inv.cgst + inv.sgst + inv.igst);
    totalTaxable += inv.totalBeforeTax;
    totalIGST    += inv.igst;
    totalCGST    += inv.cgst;
    totalSGST    += inv.sgst;
    totalTax     += tax;
    totalAmt     += inv.totalAmount;
    return [
      idx + 1,
      fmtDate(inv.date),
      inv.invoiceNumber,
      inv.customerName,
      gstin,
      r2(inv.totalBeforeTax),
      r2(inv.igst),
      r2(inv.cgst),
      r2(inv.sgst),
      tax,
      r2(inv.totalAmount),
      inv.status,
    ];
  });

  // Totals row
  rows.push([
    'TOTAL',
    '',
    '',
    '',
    '',
    r2(totalTaxable),
    r2(totalIGST),
    r2(totalCGST),
    r2(totalSGST),
    r2(totalTax),
    r2(totalAmt),
    '',
  ]);

  const colWidths = [4, 12, 16, 26, 18, 15, 10, 10, 10, 12, 14, 10];

  // Prepend title rows
  const allRows: (string | number)[][] = [
    [`Sales Register — ${periodLabel} — ${profile.name}`],
    [`GSTIN: ${profile.gstin || '—'}`],
    [],
    ...rows,
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.sheet_add_aoa(ws, allRows.slice(0, 3), { origin: 'A1' });
  XLSX.utils.sheet_add_aoa(ws, [[...headers]], { origin: 'A4' });
  XLSX.utils.sheet_add_aoa(ws, rows, { origin: 'A5' });
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  // Simple approach: flat data
  const flatWs = XLSX.utils.aoa_to_sheet([
    [`Sales Register — ${periodLabel} — ${profile.name}`, '', '', `GSTIN: ${profile.gstin || '—'}`],
    [],
    headers,
    ...rows,
  ]);
  flatWs['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, flatWs, 'Sales Register');

  const wbArr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbArr], { type: 'application/octet-stream' });
  const safe = periodLabel.replace(/[^a-zA-Z0-9\-_]/g, '_');
  triggerDownload(blob, `Sales_Register_${safe}.xlsx`);
}

// ─── Credit Notes Register ────────────────────────────────────────────────────

export interface NotesRegisterData {
  profile: BusinessProfile;
  notes: CreditNote[] | DebitNote[];
  noteType: 'Credit' | 'Debit';
  periodLabel: string;
}

export function downloadNotesRegisterExcel(data: NotesRegisterData): void {
  const { notes, noteType, periodLabel, profile } = data;

  const headers = [
    '#',
    'Date',
    `${noteType} Note No.`,
    'Party Name',
    'GSTIN',
    'Linked Invoice',
    'Taxable Amount',
    'IGST',
    'CGST',
    'SGST',
    'Total Amount',
  ];

  const sortedNotes = [...notes].sort((a, b) => a.date.localeCompare(b.date));

  let totalTaxable = 0, totalIGST = 0, totalCGST = 0, totalSGST = 0, totalAmt = 0;

  const rows: (string | number)[][] = sortedNotes.map((note, idx) => {
    totalTaxable += note.totalBeforeTax;
    totalIGST    += note.igst;
    totalCGST    += note.cgst;
    totalSGST    += note.sgst;
    totalAmt     += note.totalAmount;
    const linkedInv = (note as CreditNote).originalInvoiceNumber ?? '';
    return [
      idx + 1,
      fmtDate(note.date),
      note.noteNumber,
      note.customerName,
      '',  // GSTIN not on note — would need customer lookup; left blank for simplicity
      linkedInv,
      r2(note.totalBeforeTax),
      r2(note.igst),
      r2(note.cgst),
      r2(note.sgst),
      r2(note.totalAmount),
    ];
  });

  rows.push([
    'TOTAL', '', '', '', '', '',
    r2(totalTaxable), r2(totalIGST), r2(totalCGST), r2(totalSGST), r2(totalAmt),
  ]);

  const colWidths = [4, 12, 18, 26, 18, 16, 15, 10, 10, 10, 14];

  const ws = XLSX.utils.aoa_to_sheet([
    [`${noteType} Notes Register — ${periodLabel} — ${profile.name}`, '', '', `GSTIN: ${profile.gstin || '—'}`],
    [],
    headers,
    ...rows,
  ]);
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${noteType} Notes`);

  const wbArr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbArr], { type: 'application/octet-stream' });
  const safe = periodLabel.replace(/[^a-zA-Z0-9\-_]/g, '_');
  triggerDownload(blob, `${noteType}_Notes_Register_${safe}.xlsx`);
}

// ─── HSN Summary ──────────────────────────────────────────────────────────────

export interface HSNSummaryData {
  profile: BusinessProfile;
  invoices: Invoice[];
  periodLabel: string;
}

interface HSNRow {
  hsnCode: string;
  description: string;
  uqc: string;
  totalQty: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
}

export function aggregateHSN(invoices: Invoice[]): HSNRow[] {
  const map = new Map<string, HSNRow>();

  for (const inv of invoices) {
    for (const item of inv.items) {
      const hsn = item.hsnCode || 'N/A';
      const taxRate = item.gstRate / 100;
      const taxablePerItem = item.quantity * item.rate;
      const gstAmt = taxablePerItem * taxRate;
      const isIGST = inv.igst > 0 && inv.cgst === 0;
      const cgstAmt = isIGST ? 0 : gstAmt / 2;
      const sgstAmt = isIGST ? 0 : gstAmt / 2;
      const igstAmt = isIGST ? gstAmt : 0;

      if (!map.has(hsn)) {
        map.set(hsn, {
          hsnCode: hsn,
          description: item.description,
          uqc: 'NOS',
          totalQty: 0,
          taxableValue: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          totalTax: 0,
        });
      }
      const row = map.get(hsn)!;
      row.totalQty     += item.quantity;
      row.taxableValue += taxablePerItem;
      row.cgst         += cgstAmt;
      row.sgst         += sgstAmt;
      row.igst         += igstAmt;
      row.totalTax     += gstAmt;
    }
  }

  return Array.from(map.values()).sort((a, b) => a.hsnCode.localeCompare(b.hsnCode));
}

export function downloadHSNExcel(data: HSNSummaryData): void {
  const { invoices, periodLabel, profile } = data;
  const hsnRows = aggregateHSN(invoices);

  const headers = [
    'HSN Code',
    'Description',
    'UQC',
    'Total Qty',
    'Taxable Value',
    'CGST',
    'SGST',
    'IGST',
    'Total Tax',
  ];

  const rows: (string | number)[][] = hsnRows.map(r => [
    r.hsnCode,
    r.description,
    r.uqc,
    r2(r.totalQty),
    r2(r.taxableValue),
    r2(r.cgst),
    r2(r.sgst),
    r2(r.igst),
    r2(r.totalTax),
  ]);

  // Totals
  const totalTaxable = hsnRows.reduce((s, r) => s + r.taxableValue, 0);
  const totalCGST    = hsnRows.reduce((s, r) => s + r.cgst, 0);
  const totalSGST    = hsnRows.reduce((s, r) => s + r.sgst, 0);
  const totalIGST    = hsnRows.reduce((s, r) => s + r.igst, 0);
  const totalTax     = hsnRows.reduce((s, r) => s + r.totalTax, 0);
  rows.push(['TOTAL', '', '', '', r2(totalTaxable), r2(totalCGST), r2(totalSGST), r2(totalIGST), r2(totalTax)]);

  const colWidths = [12, 30, 8, 10, 16, 12, 12, 12, 14];

  const ws = XLSX.utils.aoa_to_sheet([
    [`HSN Summary — ${periodLabel} — ${profile.name}`, '', '', `GSTIN: ${profile.gstin || '—'}`],
    [],
    headers,
    ...rows,
  ]);
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'HSN Summary');

  const wbArr = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbArr], { type: 'application/octet-stream' });
  const safe = periodLabel.replace(/[^a-zA-Z0-9\-_]/g, '_');
  triggerDownload(blob, `HSN_Summary_${safe}.xlsx`);
}
