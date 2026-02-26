/**
 * GSTR-1 Generator — GST Portal Compliant Excel & JSON Export
 *
 * Generates GSTR-1 returns in two formats:
 *   1. Excel (.xlsx) — 13-sheet workbook matching the GST portal upload template
 *   2. JSON — GST API schema for direct API filing
 *
 * Excel sheet structure per GST portal specification:
 *   Row 1: Sheet title
 *   Row 2: Summary label row
 *   Row 3: Summary value row (Excel formulas — COUNTA/SUM over data range)
 *   Row 4: Column headers
 *   Row 5+: Data rows
 *
 * HSN code minimum digit requirements (as per GST notification):
 *   Turnover < ₹5 Crore  → 4-digit minimum
 *   Turnover ≥ ₹5 Crore  → 6-digit minimum
 */

import * as XLSX from 'xlsx';
import type { BusinessProfile, Invoice, Customer, CreditNote, DebitNote, SupplyType } from '../types';
import { GSTType } from '../types';

// ─── GST State Code Map ────────────────────────────────────────────────────

export const STATE_CODE_MAP: Record<string, string> = {
  'Jammu and Kashmir': '01',
  'Himachal Pradesh': '02',
  'Punjab': '03',
  'Chandigarh': '04',
  'Uttarakhand': '05',
  'Haryana': '06',
  'Delhi': '07',
  'Rajasthan': '08',
  'Uttar Pradesh': '09',
  'Bihar': '10',
  'Sikkim': '11',
  'Arunachal Pradesh': '12',
  'Nagaland': '13',
  'Manipur': '14',
  'Mizoram': '15',
  'Tripura': '16',
  'Meghalaya': '17',
  'Assam': '18',
  'West Bengal': '19',
  'Jharkhand': '20',
  'Odisha': '21',
  'Chhattisgarh': '22',
  'Madhya Pradesh': '23',
  'Gujarat': '24',
  'Dadra and Nagar Haveli and Daman and Diu': '26',
  'Maharashtra': '27',
  'Karnataka': '29',
  'Goa': '30',
  'Lakshadweep': '31',
  'Kerala': '32',
  'Tamil Nadu': '33',
  'Puducherry': '34',
  'Andaman and Nicobar Islands': '35',
  'Telangana': '36',
  'Andhra Pradesh': '37',
  'Ladakh': '38',
};

function stateCode(stateName: string): string {
  return STATE_CODE_MAP[stateName] ?? stateName;
}

// ─── Input / Output Types ──────────────────────────────────────────────────

export interface GSTR1Data {
  profile: BusinessProfile;
  invoices: Invoice[];
  customers: Customer[];
  creditNotes: CreditNote[];
  debitNotes: DebitNote[];
  fp: string;  // "MMYYYY", e.g. "022026"
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Convert YYYY-MM-DD → DD-MM-YYYY (GST portal date format) */
function fmtDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

/** Round to 2 decimal places */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Determine supply type for an invoice (falls back to auto-detection) */
function resolveSupplyType(inv: Invoice, customer: Customer | undefined, profileState: string): SupplyType {
  if (inv.supplyType) return inv.supplyType;
  if (!customer) return 'B2CS';
  if (customer.gstin) return 'B2B';
  const interState = (customer.state || '') !== profileState;
  if (interState && inv.totalAmount > 250000) return 'B2CL';
  return 'B2CS';
}

/** Build a customer lookup map */
function buildCustomerMap(customers: Customer[]): Map<string, Customer> {
  return new Map(customers.map(c => [c.id, c]));
}

/** Minimum HSN digits based on turnover setting */
function minHsnDigits(profile: BusinessProfile): number {
  return profile.annualTurnover === 'above5cr' ? 6 : 4;
}

// ─── Sheet Builders ────────────────────────────────────────────────────────

type SheetRow = (string | number)[];

/**
 * Wraps data rows into the full GST-portal sheet layout:
 * Row 1: Title
 * Row 2: Summary labels
 * Row 3: Summary values (Excel formulas)
 * Row 4: Headers
 * Row 5+: Data
 */
function buildSheet(
  title: string,
  headers: string[],
  dataRows: SheetRow[],
  summaryLabels: string[],
  summaryFormulas: string[],
): (string | number | { f: string })[][] {
  const row1: string[] = [title];
  const row2: string[] = summaryLabels;
  const row3: (string | { f: string })[] = summaryFormulas.map(f => (f.startsWith('=') ? { f: f.slice(1) } : f));
  const row4: string[] = headers;
  return [row1, row2, row3, row4, ...dataRows] as (string | number | { f: string })[][];
}

/** Convert column index (0-based) to Excel column letter (A, B, … Z, AA, …) */
function colLetter(idx: number): string {
  let s = '';
  let n = idx + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ── b2b ──────────────────────────────────────────────────────────────────

const B2B_HEADERS = [
  'GSTIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date',
  'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Invoice Type',
  'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount',
];

function buildB2BSheet(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string, fp: string): (string | number | { f: string })[][] {
  const b2bInvoices = invoices.filter(inv => resolveSupplyType(inv, custMap.get(inv.customerId), profileState) === 'B2B');
  const rows: SheetRow[] = [];
  for (const inv of b2bInvoices) {
    const cust = custMap.get(inv.customerId);
    const pos = stateCode(cust?.state || profileState);
    for (const item of inv.items) {
      const taxable = r2(item.quantity * item.rate);
      rows.push([
        cust?.gstin || '',
        inv.customerName,
        inv.invoiceNumber,
        fmtDate(inv.date),
        r2(inv.totalAmount),
        pos,
        inv.reverseCharge ? 'Y' : 'N',
        'Regular',   // Invoice Type: Regular for standard B2B
        '',          // E-Commerce GSTIN
        item.gstRate,
        taxable,
        0,           // Cess Amount
      ]);
    }
  }
  const totalTaxable = rows.reduce((s, r) => s + (r[10] as number), 0);
  return buildSheet(
    `GSTR1 - B2B Invoices - ${fp}`,
    B2B_HEADERS,
    rows,
    ['Summary', 'No. of Recipients', 'No. of Invoices', 'Total Invoice Value', 'Total Taxable Value'],
    [
      '',
      `=COUNTA(A5:A1048576)`,
      `=COUNTA(C5:C1048576)`,
      `=SUM(E5:E1048576)`,
      `=SUM(K5:K1048576)`,
    ],
  );
}

// ── sez ──────────────────────────────────────────────────────────────────

const SEZ_HEADERS = [
  'GSTIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date',
  'Invoice Value', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate',
  'Taxable Value', 'Cess Amount',
];

function buildSEZSheet(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string, fp: string): (string | number | { f: string })[][] {
  const sezInvoices = invoices.filter(inv => {
    const st = resolveSupplyType(inv, custMap.get(inv.customerId), profileState);
    return st === 'SEZWP' || st === 'SEZWOP';
  });
  const rows: SheetRow[] = [];
  for (const inv of sezInvoices) {
    const cust = custMap.get(inv.customerId);
    const st = resolveSupplyType(inv, cust, profileState);
    const pos = stateCode(cust?.state || profileState);
    for (const item of inv.items) {
      const taxable = r2(item.quantity * item.rate);
      rows.push([
        cust?.gstin || '',
        inv.customerName,
        inv.invoiceNumber,
        fmtDate(inv.date),
        r2(inv.totalAmount),
        pos,
        st === 'SEZWP' ? 'Applicable' : 'Not Applicable',
        item.gstRate,
        taxable,
        0,
      ]);
    }
  }
  return buildSheet(
    `GSTR1 - SEZ Supplies - ${fp}`,
    SEZ_HEADERS,
    rows,
    ['Summary', 'No. of Recipients', 'No. of Invoices', 'Total Invoice Value', 'Total Taxable Value'],
    ['', '=COUNTA(A5:A1048576)', '=COUNTA(C5:C1048576)', '=SUM(E5:E1048576)', '=SUM(I5:I1048576)'],
  );
}

// ── de ───────────────────────────────────────────────────────────────────

const DE_HEADERS = [
  'GSTIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date',
  'Invoice Value', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate',
  'Taxable Value', 'Cess Amount',
];

function buildDESheet(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string, fp: string): (string | number | { f: string })[][] {
  const deInvoices = invoices.filter(inv => resolveSupplyType(inv, custMap.get(inv.customerId), profileState) === 'DE');
  const rows: SheetRow[] = [];
  for (const inv of deInvoices) {
    const cust = custMap.get(inv.customerId);
    const pos = stateCode(cust?.state || profileState);
    for (const item of inv.items) {
      rows.push([
        cust?.gstin || '', inv.customerName, inv.invoiceNumber, fmtDate(inv.date),
        r2(inv.totalAmount), pos, 'Applicable', item.gstRate, r2(item.quantity * item.rate), 0,
      ]);
    }
  }
  return buildSheet(
    `GSTR1 - Deemed Exports - ${fp}`,
    DE_HEADERS,
    rows,
    ['Summary', 'No. of Recipients', 'No. of Invoices', 'Total Invoice Value', 'Total Taxable Value'],
    ['', '=COUNTA(A5:A1048576)', '=COUNTA(C5:C1048576)', '=SUM(E5:E1048576)', '=SUM(I5:I1048576)'],
  );
}

// ── b2cl ─────────────────────────────────────────────────────────────────

const B2CL_HEADERS = [
  'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply',
  'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
];

function buildB2CLSheet(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string, fp: string): (string | number | { f: string })[][] {
  const b2clInvoices = invoices.filter(inv => resolveSupplyType(inv, custMap.get(inv.customerId), profileState) === 'B2CL');
  const rows: SheetRow[] = [];
  for (const inv of b2clInvoices) {
    const cust = custMap.get(inv.customerId);
    const pos = stateCode(cust?.state || '');
    for (const item of inv.items) {
      rows.push([
        inv.invoiceNumber, fmtDate(inv.date), r2(inv.totalAmount),
        pos, 'Applicable', item.gstRate, r2(item.quantity * item.rate), 0,
      ]);
    }
  }
  return buildSheet(
    `GSTR1 - B2CL Invoices (Inter-state >2.5L) - ${fp}`,
    B2CL_HEADERS,
    rows,
    ['Summary', 'No. of Invoices', 'Total Invoice Value', 'Total Taxable Value'],
    ['', '=COUNTA(A5:A1048576)', '=SUM(C5:C1048576)', '=SUM(G5:G1048576)'],
  );
}

// ── b2cs ─────────────────────────────────────────────────────────────────

const B2CS_HEADERS = [
  'Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate',
  'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN',
];

function buildB2CSSheet(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string, fp: string): (string | number | { f: string })[][] {
  const b2csInvoices = invoices.filter(inv => resolveSupplyType(inv, custMap.get(inv.customerId), profileState) === 'B2CS');
  // Aggregate by state + rate
  const agg: Map<string, { taxable: number; type: string }> = new Map();
  for (const inv of b2csInvoices) {
    const cust = custMap.get(inv.customerId);
    const pos = stateCode(cust?.state || profileState);
    const type = inv.gstType === GSTType.IGST ? 'Inter-State' : 'Intra-State';
    for (const item of inv.items) {
      const key = `${pos}||${item.gstRate}||${type}`;
      const existing = agg.get(key) || { taxable: 0, type };
      agg.set(key, { taxable: existing.taxable + r2(item.quantity * item.rate), type });
    }
  }
  const rows: SheetRow[] = [];
  for (const [key, val] of agg.entries()) {
    const [pos, rate] = key.split('||');
    rows.push([val.type, pos, 'Applicable', Number(rate), r2(val.taxable), 0, '']);
  }
  return buildSheet(
    `GSTR1 - B2CS Invoices (Intra-state & Inter-state ≤2.5L) - ${fp}`,
    B2CS_HEADERS,
    rows,
    ['Summary', 'No. of States', 'Total Taxable Value'],
    ['', '=COUNTA(B5:B1048576)', '=SUM(E5:E1048576)'],
  );
}

// ── cdnr ─────────────────────────────────────────────────────────────────

const CDNR_HEADERS = [
  'GSTIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date',
  'Note Type', 'Place Of Supply', 'Reverse Charge', 'Note Supply Type',
  'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
];

function buildCDNRSheet(
  creditNotes: CreditNote[], debitNotes: DebitNote[],
  custMap: Map<string, Customer>, profileState: string, fp: string,
): (string | number | { f: string })[][] {
  const rows: SheetRow[] = [];
  for (const cn of creditNotes) {
    const cust = custMap.get(cn.customerId);
    if (!cust?.gstin) continue;
    const pos = stateCode(cust.state || profileState);
    for (const item of cn.items) {
      rows.push([
        cust.gstin, cn.customerName, cn.noteNumber, fmtDate(cn.date),
        'C', pos, 'N', 'Regular', r2(cn.totalAmount),
        'Applicable', item.gstRate, r2(item.quantity * item.rate), 0,
      ]);
    }
  }
  for (const dn of debitNotes) {
    const cust = custMap.get(dn.customerId);
    if (!cust?.gstin) continue;
    const pos = stateCode(cust.state || profileState);
    for (const item of dn.items) {
      rows.push([
        cust.gstin, dn.customerName, dn.noteNumber, fmtDate(dn.date),
        'D', pos, 'N', 'Regular', r2(dn.totalAmount),
        'Applicable', item.gstRate, r2(item.quantity * item.rate), 0,
      ]);
    }
  }
  return buildSheet(
    `GSTR1 - CDNR (Credit/Debit Notes for Registered) - ${fp}`,
    CDNR_HEADERS,
    rows,
    ['Summary', 'No. of Recipients', 'No. of Notes', 'Total Note Value', 'Total Taxable Value'],
    ['', '=COUNTA(A5:A1048576)', '=COUNTA(C5:C1048576)', '=SUM(I5:I1048576)', '=SUM(L5:L1048576)'],
  );
}

// ── cdnur ────────────────────────────────────────────────────────────────

const CDNUR_HEADERS = [
  'UR Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply',
  'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
];

function buildCDNURSheet(
  creditNotes: CreditNote[], debitNotes: DebitNote[],
  custMap: Map<string, Customer>, profileState: string, fp: string,
): (string | number | { f: string })[][] {
  const rows: SheetRow[] = [];
  for (const cn of creditNotes) {
    const cust = custMap.get(cn.customerId);
    if (cust?.gstin) continue;  // skip registered — covered by CDNR
    const pos = stateCode(cust?.state || profileState);
    const urType = cn.gstType === GSTType.IGST ? 'Inter-State' : 'Intra-State';
    for (const item of cn.items) {
      rows.push([urType, cn.noteNumber, fmtDate(cn.date), 'C', pos, r2(cn.totalAmount), 'Applicable', item.gstRate, r2(item.quantity * item.rate), 0]);
    }
  }
  for (const dn of debitNotes) {
    const cust = custMap.get(dn.customerId);
    if (cust?.gstin) continue;
    const pos = stateCode(cust?.state || profileState);
    const urType = dn.gstType === GSTType.IGST ? 'Inter-State' : 'Intra-State';
    for (const item of dn.items) {
      rows.push([urType, dn.noteNumber, fmtDate(dn.date), 'D', pos, r2(dn.totalAmount), 'Applicable', item.gstRate, r2(item.quantity * item.rate), 0]);
    }
  }
  return buildSheet(
    `GSTR1 - CDNUR (Credit/Debit Notes for Unregistered) - ${fp}`,
    CDNUR_HEADERS,
    rows,
    ['Summary', 'No. of Notes', 'Total Note Value', 'Total Taxable Value'],
    ['', '=COUNTA(B5:B1048576)', '=SUM(F5:F1048576)', '=SUM(I5:I1048576)'],
  );
}

// ── exp ──────────────────────────────────────────────────────────────────

const EXP_HEADERS = [
  'Export Type', 'Invoice Number', 'Invoice Date', 'Invoice Value',
  'Port Code', 'Shipping Bill Number', 'Shipping Bill Date',
  'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
];

function buildEXPSheet(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string, fp: string): (string | number | { f: string })[][] {
  const expInvoices = invoices.filter(inv => {
    const st = resolveSupplyType(inv, custMap.get(inv.customerId), profileState);
    return st === 'EXPWP' || st === 'EXPWOP';
  });
  const rows: SheetRow[] = [];
  for (const inv of expInvoices) {
    const st = resolveSupplyType(inv, custMap.get(inv.customerId), profileState);
    for (const item of inv.items) {
      rows.push([
        st === 'EXPWP' ? 'WPAY' : 'WOPAY',
        inv.invoiceNumber,
        fmtDate(inv.date),
        r2(inv.totalAmount),
        inv.portCode || '',
        inv.shippingBillNo || '',
        inv.shippingBillDate ? fmtDate(inv.shippingBillDate) : '',
        st === 'EXPWP' ? 'Applicable' : 'Not Applicable',
        item.gstRate,
        r2(item.quantity * item.rate),
        0,
      ]);
    }
  }
  return buildSheet(
    `GSTR1 - Exports - ${fp}`,
    EXP_HEADERS,
    rows,
    ['Summary', 'No. of Invoices', 'Total Invoice Value', 'Total Taxable Value'],
    ['', '=COUNTA(B5:B1048576)', '=SUM(D5:D1048576)', '=SUM(J5:J1048576)'],
  );
}

// ── at / atadj ───────────────────────────────────────────────────────────

const AT_HEADERS = ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Received', 'Cess Amount'];
const ATADJ_HEADERS = ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Adjusted', 'Cess Amount'];

function buildATSheet(fp: string): (string | number | { f: string })[][] {
  return buildSheet(
    `GSTR1 - Advances Received - ${fp}`,
    AT_HEADERS,
    [],
    ['Summary', 'No. of Records', 'Total Advance Received'],
    ['', '=COUNTA(A5:A1048576)', '=SUM(D5:D1048576)'],
  );
}

function buildATADJSheet(fp: string): (string | number | { f: string })[][] {
  return buildSheet(
    `GSTR1 - Advance Adjusted - ${fp}`,
    ATADJ_HEADERS,
    [],
    ['Summary', 'No. of Records', 'Total Advance Adjusted'],
    ['', '=COUNTA(A5:A1048576)', '=SUM(D5:D1048576)'],
  );
}

// ── exemp ────────────────────────────────────────────────────────────────

const EXEMP_HEADERS = [
  'Description', 'Nil Rated Supplies',
  'Exempted (other than nil rated/non GST supply)', 'Non-GST Supplies',
];

function buildEXEMPSheet(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string, fp: string): (string | number | { f: string })[][] {
  // Items with 0% GST rate fall into nil-rated
  let interRegNil = 0, interUnregNil = 0, intraRegNil = 0, intraUnregNil = 0;
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const isReg = !!(cust?.gstin);
    const isInter = inv.gstType === GSTType.IGST;
    const nilValue = inv.items
      .filter(i => i.gstRate === 0)
      .reduce((s, i) => s + r2(i.quantity * i.rate), 0);
    if (nilValue === 0) continue;
    if (isInter && isReg) interRegNil += nilValue;
    else if (isInter && !isReg) interUnregNil += nilValue;
    else if (!isInter && isReg) intraRegNil += nilValue;
    else intraUnregNil += nilValue;
  }
  const rows: SheetRow[] = [
    ['Inter-State supplies to registered persons', r2(interRegNil), 0, 0],
    ['Inter-State supplies to unregistered persons', r2(interUnregNil), 0, 0],
    ['Intra-State supplies to registered persons', r2(intraRegNil), 0, 0],
    ['Intra-State supplies to unregistered persons', r2(intraUnregNil), 0, 0],
  ];
  return buildSheet(
    `GSTR1 - Exempt/Nil/Non-GST Supplies - ${fp}`,
    EXEMP_HEADERS,
    rows,
    ['Summary', 'Total Nil Rated', 'Total Exempted', 'Total Non-GST'],
    ['', '=SUM(B5:B1048576)', '=SUM(C5:C1048576)', '=SUM(D5:D1048576)'],
  );
}

// ── hsn ──────────────────────────────────────────────────────────────────

const HSN_HEADERS = [
  'HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value',
  'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount',
  'State/UT Tax Amount', 'Cess Amount',
];

interface HsnAgg {
  description: string;
  qty: number;
  totalValue: number;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
}

function buildHSNSheet(
  invoices: Invoice[], creditNotes: CreditNote[], debitNotes: DebitNote[],
  profile: BusinessProfile, fp: string,
): (string | number | { f: string })[][] {
  const minDigits = minHsnDigits(profile);
  const agg: Map<string, HsnAgg> = new Map();

  const processItems = (items: typeof invoices[0]['items'], gstType: GSTType, multiplier: 1 | -1) => {
    for (const item of items) {
      const hsn = (item.hsnCode || '').trim();
      if (hsn.length < minDigits) continue;  // skip invalid HSN codes
      const taxable = r2(item.quantity * item.rate);
      const tax = r2(taxable * item.gstRate / 100);
      const isIgst = gstType === GSTType.IGST;
      const existing = agg.get(hsn) || { description: item.description, qty: 0, totalValue: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      agg.set(hsn, {
        description: existing.description || item.description,
        qty: existing.qty + multiplier * item.quantity,
        totalValue: existing.totalValue + multiplier * r2(taxable + tax),
        taxable: existing.taxable + multiplier * taxable,
        igst: existing.igst + (isIgst ? multiplier * tax : 0),
        cgst: existing.cgst + (!isIgst ? multiplier * r2(tax / 2) : 0),
        sgst: existing.sgst + (!isIgst ? multiplier * r2(tax / 2) : 0),
      });
    }
  };

  for (const inv of invoices) processItems(inv.items, inv.gstType, 1);
  for (const cn of creditNotes) processItems(cn.items, cn.gstType, -1);
  for (const dn of debitNotes) processItems(dn.items, dn.gstType, 1);

  const rows: SheetRow[] = [];
  for (const [hsn, data] of agg.entries()) {
    rows.push([
      hsn, data.description, 'NOS',
      r2(data.qty), r2(data.totalValue), r2(data.taxable),
      r2(data.igst), r2(data.cgst), r2(data.sgst), 0,
    ]);
  }
  return buildSheet(
    `GSTR1 - HSN Summary - ${fp}`,
    HSN_HEADERS,
    rows,
    ['Summary', 'No. of HSN Codes', 'Total Taxable Value', 'Total Tax'],
    [
      '',
      '=COUNTA(A5:A1048576)',
      '=SUM(F5:F1048576)',
      '=SUM(G5:G1048576)+SUM(H5:H1048576)+SUM(I5:I1048576)',
    ],
  );
}

// ── docs ─────────────────────────────────────────────────────────────────

const DOCS_HEADERS = [
  'Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled',
];

function buildDOCSSheet(
  invoices: Invoice[], creditNotes: CreditNote[], debitNotes: DebitNote[], fp: string,
): (string | number | { f: string })[][] {
  const invNos = invoices.map(i => i.invoiceNumber).sort();
  const cnNos = creditNotes.map(n => n.noteNumber).sort();
  const dnNos = debitNotes.map(n => n.noteNumber).sort();
  const rows: SheetRow[] = [
    ['Invoices for outward supply', invNos[0] || '', invNos[invNos.length - 1] || '', invoices.length, 0],
    ['Invoices for inward supply from unregistered person', '', '', 0, 0],
    ['Revised Invoice', '', '', 0, 0],
    ['Debit Note', dnNos[0] || '', dnNos[dnNos.length - 1] || '', debitNotes.length, 0],
    ['Credit Note', cnNos[0] || '', cnNos[cnNos.length - 1] || '', creditNotes.length, 0],
    ['Advance Receipt', '', '', 0, 0],
    ['Payment Voucher', '', '', 0, 0],
    ['Refund Voucher', '', '', 0, 0],
    ['Delivery Challan for job work', '', '', 0, 0],
  ];
  return buildSheet(
    `GSTR1 - Document Summary - ${fp}`,
    DOCS_HEADERS,
    rows,
    ['Summary', 'Total Documents Issued', 'Total Cancelled'],
    ['', '=SUM(D5:D1048576)', '=SUM(E5:E1048576)'],
  );
}

// ─── Excel Workbook Assembly ───────────────────────────────────────────────

function aoa_to_sheet(data: (string | number | { f: string })[][]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const range = { s: { r: 0, c: 0 }, e: { r: data.length - 1, c: 0 } };
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    for (let c = 0; c < row.length; c++) {
      if (range.e.c < c) range.e.c = c;
      const cell = row[c];
      const addr = XLSX.utils.encode_cell({ r, c });
      if (cell === null || cell === undefined) continue;
      if (typeof cell === 'object' && 'f' in cell) {
        ws[addr] = { t: 'n', f: cell.f, v: 0 };
      } else if (typeof cell === 'number') {
        ws[addr] = { t: 'n', v: cell };
      } else {
        ws[addr] = { t: 's', v: String(cell) };
      }
    }
  }
  ws['!ref'] = XLSX.utils.encode_range(range);
  return ws;
}

export function generateGSTR1ExcelBlob(data: GSTR1Data): Blob {
  const { profile, invoices, customers, creditNotes, debitNotes, fp } = data;
  const custMap = buildCustomerMap(customers);
  const profileState = profile.state;

  const wb = XLSX.utils.book_new();

  const sheets: { name: string; aoa: (string | number | { f: string })[][] }[] = [
    { name: 'b2b',   aoa: buildB2BSheet(invoices, custMap, profileState, fp) },
    { name: 'sez',   aoa: buildSEZSheet(invoices, custMap, profileState, fp) },
    { name: 'de',    aoa: buildDESheet(invoices, custMap, profileState, fp) },
    { name: 'b2cl',  aoa: buildB2CLSheet(invoices, custMap, profileState, fp) },
    { name: 'b2cs',  aoa: buildB2CSSheet(invoices, custMap, profileState, fp) },
    { name: 'cdnr',  aoa: buildCDNRSheet(creditNotes, debitNotes, custMap, profileState, fp) },
    { name: 'cdnur', aoa: buildCDNURSheet(creditNotes, debitNotes, custMap, profileState, fp) },
    { name: 'exp',   aoa: buildEXPSheet(invoices, custMap, profileState, fp) },
    { name: 'at',    aoa: buildATSheet(fp) },
    { name: 'atadj', aoa: buildATADJSheet(fp) },
    { name: 'exemp', aoa: buildEXEMPSheet(invoices, custMap, profileState, fp) },
    { name: 'hsn',   aoa: buildHSNSheet(invoices, creditNotes, debitNotes, profile, fp) },
    { name: 'docs',  aoa: buildDOCSSheet(invoices, creditNotes, debitNotes, fp) },
  ];

  for (const { name, aoa } of sheets) {
    const ws = aoa_to_sheet(aoa);
    // Style row 4 (index 3) as bold by setting header row bold (limited xlsx styling)
    if (aoa[3]) {
      ws['!cols'] = aoa[3].map(() => ({ wch: 20 }));
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const wbOut = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadGSTR1Excel(data: GSTR1Data): void {
  const blob = generateGSTR1ExcelBlob(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GSTR1_${data.profile.gstin || 'export'}_${data.fp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ─── JSON Generator ────────────────────────────────────────────────────────

export interface GSTR1JSON {
  gstin: string;
  fp: string;
  gt: number;
  cur_gt: number;
  b2b: object[];
  sez: object[];
  b2cl: object[];
  b2cs: object[];
  cdnr: object[];
  cdnur: object[];
  exp: object[];
  at: object[];
  atadj: object[];
  exemp: object;
  hsn: object;
  doc_det: object[];
}

export function generateGSTR1JSON(data: GSTR1Data): GSTR1JSON {
  const { profile, invoices, customers, creditNotes, debitNotes, fp } = data;
  const custMap = buildCustomerMap(customers);
  const profileState = profile.state;
  const minDigits = minHsnDigits(profile);

  // ── b2b ──
  const b2bMap: Map<string, object[]> = new Map();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2B') continue;
    const gstin = cust?.gstin || '';
    const pos = stateCode(cust?.state || profileState);
    const itms = inv.items.map((item, idx) => {
      const txval = r2(item.quantity * item.rate);
      const tax = r2(txval * item.gstRate / 100);
      const isIgst = inv.gstType === GSTType.IGST;
      return {
        num: idx + 1,
        itm_det: {
          rt: item.gstRate,
          txval,
          iamt: isIgst ? tax : 0,
          camt: !isIgst ? r2(tax / 2) : 0,
          samt: !isIgst ? r2(tax / 2) : 0,
          csamt: 0,
        },
      };
    });
    const invObj = {
      inum: inv.invoiceNumber,
      idt: fmtDate(inv.date),
      val: r2(inv.totalAmount),
      pos,
      rchrg: inv.reverseCharge ? 'Y' : 'N',
      inv_typ: 'R',
      itms,
    };
    const existing = (b2bMap.get(gstin) as object[]) || [];
    existing.push(invObj);
    b2bMap.set(gstin, existing);
  }
  const b2b = Array.from(b2bMap.entries()).map(([ctin, inv]) => ({ ctin, inv }));

  // ── sez ──
  const sezMap: Map<string, object[]> = new Map();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const st = resolveSupplyType(inv, cust, profileState);
    if (st !== 'SEZWP' && st !== 'SEZWOP') continue;
    const gstin = cust?.gstin || '';
    const pos = stateCode(cust?.state || profileState);
    const itms = inv.items.map((item, idx) => {
      const txval = r2(item.quantity * item.rate);
      const tax = r2(txval * item.gstRate / 100);
      return { num: idx + 1, itm_det: { rt: item.gstRate, txval, iamt: tax, camt: 0, samt: 0, csamt: 0 } };
    });
    const invObj = {
      inum: inv.invoiceNumber, idt: fmtDate(inv.date), val: r2(inv.totalAmount),
      pos, inv_typ: st === 'SEZWP' ? 'SEWP' : 'SEWOP', itms,
    };
    const existing = (sezMap.get(gstin) as object[]) || [];
    existing.push(invObj);
    sezMap.set(gstin, existing);
  }
  const sez = Array.from(sezMap.entries()).map(([ctin, inv]) => ({ ctin, inv }));

  // ── b2cl ──
  const b2cl: object[] = [];
  const b2clByState: Map<string, object[]> = new Map();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2CL') continue;
    const pos = stateCode(cust?.state || '');
    const itms = inv.items.map((item, idx) => ({
      num: idx + 1,
      itm_det: { rt: item.gstRate, txval: r2(item.quantity * item.rate), iamt: r2(item.quantity * item.rate * item.gstRate / 100), csamt: 0 },
    }));
    const invObj = { inum: inv.invoiceNumber, idt: fmtDate(inv.date), val: r2(inv.totalAmount), itms };
    const existing = (b2clByState.get(pos) as object[]) || [];
    existing.push(invObj);
    b2clByState.set(pos, existing);
  }
  for (const [pos, inv] of b2clByState.entries()) b2cl.push({ pos, inv });

  // ── b2cs ──
  const b2csAgg: Map<string, { pos: string; typ: string; rt: number; txval: number; iamt: number; csamt: number }> = new Map();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2CS') continue;
    const pos = stateCode(cust?.state || profileState);
    const typ = inv.gstType === GSTType.IGST ? 'INTER' : 'INTRA';
    for (const item of inv.items) {
      const txval = r2(item.quantity * item.rate);
      const iamt = inv.gstType === GSTType.IGST ? r2(txval * item.gstRate / 100) : 0;
      const key = `${pos}||${typ}||${item.gstRate}`;
      const ex = b2csAgg.get(key) || { pos, typ, rt: item.gstRate, txval: 0, iamt: 0, csamt: 0 };
      b2csAgg.set(key, { ...ex, txval: ex.txval + txval, iamt: ex.iamt + iamt });
    }
  }
  const b2cs = Array.from(b2csAgg.values());

  // ── cdnr ──
  const cdnrMap: Map<string, object[]> = new Map();
  const processNoteForCDNR = (note: CreditNote | DebitNote, noteType: 'C' | 'D') => {
    const cust = custMap.get(note.customerId);
    if (!cust?.gstin) return;
    const pos = stateCode(cust.state || profileState);
    const itms = note.items.map((item, idx) => {
      const txval = r2(item.quantity * item.rate);
      const tax = r2(txval * item.gstRate / 100);
      const isIgst = note.gstType === GSTType.IGST;
      return { num: idx + 1, itm_det: { rt: item.gstRate, txval, iamt: isIgst ? tax : 0, camt: !isIgst ? r2(tax / 2) : 0, samt: !isIgst ? r2(tax / 2) : 0, csamt: 0 } };
    });
    const noteObj = {
      ntnum: 'noteNumber' in note ? (note as CreditNote).noteNumber : (note as DebitNote).noteNumber,
      ntdt: fmtDate(note.date),
      val: r2(note.totalAmount),
      ntty: noteType,
      pos,
      rchrg: 'N',
      itms,
    };
    const existing = (cdnrMap.get(cust.gstin) as object[]) || [];
    existing.push(noteObj);
    cdnrMap.set(cust.gstin, existing);
  };
  for (const cn of creditNotes) processNoteForCDNR(cn, 'C');
  for (const dn of debitNotes) processNoteForCDNR(dn, 'D');
  const cdnr = Array.from(cdnrMap.entries()).map(([ctin, nt]) => ({ ctin, nt }));

  // ── cdnur ──
  const cdnur: object[] = [];
  const processNoteForCDNUR = (note: CreditNote | DebitNote, noteType: 'C' | 'D') => {
    const cust = custMap.get(note.customerId);
    if (cust?.gstin) return;
    const pos = stateCode(cust?.state || profileState);
    const typ = note.gstType === GSTType.IGST ? 'B2CL' : 'B2CS';
    const itms = note.items.map((item, idx) => {
      const txval = r2(item.quantity * item.rate);
      const iamt = note.gstType === GSTType.IGST ? r2(txval * item.gstRate / 100) : 0;
      return { num: idx + 1, itm_det: { rt: item.gstRate, txval, iamt, csamt: 0 } };
    });
    cdnur.push({
      ntty: noteType, typ,
      ntnum: 'noteNumber' in note ? (note as CreditNote).noteNumber : (note as DebitNote).noteNumber,
      ntdt: fmtDate(note.date), val: r2(note.totalAmount), pos, itms,
    });
  };
  for (const cn of creditNotes) processNoteForCDNUR(cn, 'C');
  for (const dn of debitNotes) processNoteForCDNUR(dn, 'D');

  // ── exp ──
  const exp: object[] = [];
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const st = resolveSupplyType(inv, cust, profileState);
    if (st !== 'EXPWP' && st !== 'EXPWOP') continue;
    const itms = inv.items.map((item, idx) => ({
      num: idx + 1,
      itm_det: {
        rt: item.gstRate,
        txval: r2(item.quantity * item.rate),
        iamt: st === 'EXPWP' ? r2(item.quantity * item.rate * item.gstRate / 100) : 0,
        csamt: 0,
      },
    }));
    exp.push({
      exp_typ: st === 'EXPWP' ? 'WPAY' : 'WOPAY',
      inv: [{
        inum: inv.invoiceNumber, idt: fmtDate(inv.date), val: r2(inv.totalAmount),
        sbpcode: inv.portCode || '', sbnum: inv.shippingBillNo || '',
        sbdt: inv.shippingBillDate ? fmtDate(inv.shippingBillDate) : '',
        itms,
      }],
    });
  }

  // ── exemp ──
  const exemp = {
    nil_sup: {
      inter_reg: invoices.filter(i => i.gstType === GSTType.IGST && !!custMap.get(i.customerId)?.gstin).reduce((s, i) => s + i.items.filter(it => it.gstRate === 0).reduce((ss, it) => ss + r2(it.quantity * it.rate), 0), 0),
      inter_unreg: invoices.filter(i => i.gstType === GSTType.IGST && !custMap.get(i.customerId)?.gstin).reduce((s, i) => s + i.items.filter(it => it.gstRate === 0).reduce((ss, it) => ss + r2(it.quantity * it.rate), 0), 0),
      intra_reg: invoices.filter(i => i.gstType !== GSTType.IGST && !!custMap.get(i.customerId)?.gstin).reduce((s, i) => s + i.items.filter(it => it.gstRate === 0).reduce((ss, it) => ss + r2(it.quantity * it.rate), 0), 0),
      intra_unreg: invoices.filter(i => i.gstType !== GSTType.IGST && !custMap.get(i.customerId)?.gstin).reduce((s, i) => s + i.items.filter(it => it.gstRate === 0).reduce((ss, it) => ss + r2(it.quantity * it.rate), 0), 0),
    },
    expt_sup: { inter_reg: 0, inter_unreg: 0, intra_reg: 0, intra_unreg: 0 },
    ngsup: { inter_reg: 0, inter_unreg: 0, intra_reg: 0, intra_unreg: 0 },
  };

  // ── hsn ──
  const hsnData: object[] = [];
  const hsnAgg: Map<string, HsnAgg> = new Map();
  const addToHSN = (items: typeof invoices[0]['items'], gstType: GSTType, mult: 1 | -1) => {
    for (const item of items) {
      const hsn = (item.hsnCode || '').trim();
      if (hsn.length < minDigits) continue;
      const txval = r2(item.quantity * item.rate);
      const tax = r2(txval * item.gstRate / 100);
      const isIgst = gstType === GSTType.IGST;
      const ex = hsnAgg.get(hsn) || { description: item.description, qty: 0, totalValue: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      hsnAgg.set(hsn, {
        description: ex.description || item.description,
        qty: ex.qty + mult * item.quantity,
        totalValue: ex.totalValue + mult * r2(txval + tax),
        taxable: ex.taxable + mult * txval,
        igst: ex.igst + (isIgst ? mult * tax : 0),
        cgst: ex.cgst + (!isIgst ? mult * r2(tax / 2) : 0),
        sgst: ex.sgst + (!isIgst ? mult * r2(tax / 2) : 0),
      });
    }
  };
  for (const inv of invoices) addToHSN(inv.items, inv.gstType, 1);
  for (const cn of creditNotes) addToHSN(cn.items, cn.gstType, -1);
  for (const dn of debitNotes) addToHSN(dn.items, dn.gstType, 1);
  for (const [hsn_sc, v] of hsnAgg.entries()) {
    hsnData.push({
      hsn_sc, desc: v.description, uqc: 'NOS', qty: r2(v.qty),
      val: r2(v.totalValue), txval: r2(v.taxable),
      iamt: r2(v.igst), camt: r2(v.cgst), samt: r2(v.sgst), csamt: 0,
    });
  }

  // ── doc_det ──
  const invNos = invoices.map(i => i.invoiceNumber).sort();
  const cnNos = creditNotes.map(n => n.noteNumber).sort();
  const dnNos = debitNotes.map(n => n.noteNumber).sort();
  const doc_det = [
    {
      doc_num: 1,
      docs: [{
        num: 1, from: invNos[0] || '', to: invNos[invNos.length - 1] || '',
        totnum: invoices.length, cancel: 0, net_issue: invoices.length,
      }],
    },
    {
      doc_num: 4,
      docs: [{
        num: 1, from: cnNos[0] || '', to: cnNos[cnNos.length - 1] || '',
        totnum: creditNotes.length, cancel: 0, net_issue: creditNotes.length,
      }],
    },
    {
      doc_num: 5,
      docs: [{
        num: 1, from: dnNos[0] || '', to: dnNos[dnNos.length - 1] || '',
        totnum: debitNotes.length, cancel: 0, net_issue: debitNotes.length,
      }],
    },
  ];

  const gt = r2(invoices.reduce((s, i) => s + i.totalAmount, 0));
  return {
    gstin: profile.gstin,
    fp,
    gt,
    cur_gt: gt,
    b2b,
    sez,
    b2cl,
    b2cs,
    cdnr,
    cdnur,
    exp,
    at: [],
    atadj: [],
    exemp,
    hsn: { data: hsnData },
    doc_det,
  };
}

export function downloadGSTR1JSON(data: GSTR1Data): void {
  const json = generateGSTR1JSON(data);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GSTR1_${data.profile.gstin || 'export'}_${data.fp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
