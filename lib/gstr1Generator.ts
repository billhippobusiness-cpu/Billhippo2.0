/**
 * GSTR-1 Generator — GST Portal Offline Utility-compatible Excel & JSON Export
 *
 * The Excel template structure exactly matches the GST Offline Utility:
 *   Row 1: Sheet title (col A), HELP link (last col) – BLUE fill, white bold text
 *   Row 2: Summary labels at specific columns – BLUE fill, white bold text
 *   Row 3: Summary formulas (COUNTA / SUM / SUMPRODUCT) – no fill, plain
 *   Row 4: Column headers – PEACH fill, height 30, wrap on long labels
 *   Row 5+: Data rows – numeric cells formatted as 0.00, HSN as text (@)
 *
 * Sheet list (21, matching the official utility):
 *   b2b,sez,de  b2ba  b2cl  b2cla  b2cs  b2csa
 *   cdnr  cdnra  cdnur  cdnura  exp  expa
 *   at  ata  atadj  atadja  exemp
 *   hsn(b2b)  hsn(b2c)  docs  eco
 */

import XLSX from 'xlsx-js-style';
import type { BusinessProfile, Invoice, Customer, CreditNote, DebitNote, SupplyType } from '../types';
import { GSTType } from '../types';

// ─── Styling constants (matching GST Offline Utility theme) ────────────────

const COLOR_BLUE_BG  = 'FF0070C0';  // Title / summary header background
const COLOR_PEACH_BG = 'FFFCE4D6';  // Column-header background (theme accent2 lighter 80%)
const COLOR_WHITE_FG = 'FFFFFFFF';  // Title text
const COLOR_HELP_FG  = 'FF0563C1';  // Hyperlink blue

const STYLE_TITLE = {
  fill: { patternType: 'solid', fgColor: { rgb: COLOR_BLUE_BG } },
  font: { bold: true, color: { rgb: COLOR_WHITE_FG }, sz: 11 },
  alignment: { vertical: 'center', horizontal: 'left' },
} as const;

const STYLE_BLUE_BLANK = {
  fill: { patternType: 'solid', fgColor: { rgb: COLOR_BLUE_BG } },
} as const;

const STYLE_HELP = {
  font: { color: { rgb: COLOR_HELP_FG }, underline: true, sz: 11 },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
} as const;

const STYLE_HEADER = {
  fill: { patternType: 'solid', fgColor: { rgb: COLOR_PEACH_BG } },
  font: { bold: false, sz: 11 },
  alignment: { vertical: 'center', horizontal: 'center', wrapText: true },
  border: {
    top:    { style: 'thin', color: { rgb: 'FF808080' } },
    bottom: { style: 'thin', color: { rgb: 'FF808080' } },
    left:   { style: 'thin', color: { rgb: 'FF808080' } },
    right:  { style: 'thin', color: { rgb: 'FF808080' } },
  },
} as const;

// ─── GST State Code Map ────────────────────────────────────────────────────

export const STATE_CODE_MAP: Record<string, string> = {
  'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', 'Punjab': '03',
  'Chandigarh': '04', 'Uttarakhand': '05', 'Haryana': '06', 'Delhi': '07',
  'Rajasthan': '08', 'Uttar Pradesh': '09', 'Bihar': '10', 'Sikkim': '11',
  'Arunachal Pradesh': '12', 'Nagaland': '13', 'Manipur': '14', 'Mizoram': '15',
  'Tripura': '16', 'Meghalaya': '17', 'Assam': '18', 'West Bengal': '19',
  'Jharkhand': '20', 'Odisha': '21', 'Chhattisgarh': '22', 'Madhya Pradesh': '23',
  'Gujarat': '24', 'Dadra and Nagar Haveli and Daman and Diu': '26',
  'Maharashtra': '27', 'Karnataka': '29', 'Goa': '30', 'Lakshadweep': '31',
  'Kerala': '32', 'Tamil Nadu': '33', 'Puducherry': '34',
  'Andaman and Nicobar Islands': '35', 'Telangana': '36', 'Andhra Pradesh': '37',
  'Ladakh': '38',
};

function stateCode(stateName: string): string {
  return STATE_CODE_MAP[stateName] ?? stateName;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface GSTR1Data {
  profile: BusinessProfile;
  invoices: Invoice[];
  customers: Customer[];
  creditNotes: CreditNote[];
  debitNotes: DebitNote[];
  fp: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function resolveSupplyType(inv: Invoice, customer: Customer | undefined, profileState: string): SupplyType {
  if (inv.supplyType) return inv.supplyType;
  if (!customer) return 'B2CS';
  if (customer.gstin) return 'B2B';
  const interState = (customer.state || '') !== profileState;
  if (interState && inv.totalAmount > 250000) return 'B2CL';
  return 'B2CS';
}

function buildCustomerMap(customers: Customer[]): Map<string, Customer> {
  return new Map(customers.map(c => [c.id, c]));
}

function minHsnDigits(profile: BusinessProfile): number {
  return profile.annualTurnover === 'above5cr' ? 6 : 4;
}

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

// ─── Sheet builder primitives ──────────────────────────────────────────────
// Each sheet config drives the row 1/2/3/4 layout exactly as in the sample.

type DataCell = string | number | null;

interface SheetConfig {
  name: string;
  title: string;
  row1Extras?: Record<string, string>;
  row2Labels: Record<string, string>;
  row3Formulas: Record<string, string>;
  headers: string[];
  colWidths: number[];
  colFormats?: Record<number, string>;
  data: DataCell[][];
  /** Row-1 merged ranges, e.g. [['E1', 'N1']] merges E1:N1 */
  merges?: [string, string][];
}

function buildWorksheet(cfg: SheetConfig): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const numCols = cfg.headers.length;
  const helpCol = colLetter(numCols - 1);  // HELP goes in the last header column
  const lastDataRow = 4 + Math.max(cfg.data.length, 0);

  // ── Row 1: Title (A1) + row1Extras + HELP (last col) ────────────────────
  ws['A1'] = { t: 's', v: cfg.title, s: STYLE_TITLE };
  for (let c = 1; c < numCols; c++) {
    const addr = colLetter(c) + '1';
    const extra = cfg.row1Extras?.[colLetter(c)];
    if (extra) {
      ws[addr] = { t: 's', v: extra, s: STYLE_TITLE };
    } else if (c === numCols - 1) {
      // HELP cell — hyperlink to Help Instruction sheet
      ws[addr] = {
        t: 's',
        v: 'HELP',
        s: STYLE_HELP,
        l: { Target: "#'Help Instruction'!A1", Tooltip: 'View help' },
      };
    } else {
      ws[addr] = { t: 's', v: '', s: STYLE_BLUE_BLANK };
    }
  }

  // ── Row 2: Summary labels — entire row blue ─────────────────────────────
  for (let c = 0; c < numCols; c++) {
    const letter = colLetter(c);
    const label = cfg.row2Labels[letter];
    const addr = letter + '2';
    if (label) {
      ws[addr] = { t: 's', v: label, s: STYLE_TITLE };
    } else {
      ws[addr] = { t: 's', v: '', s: STYLE_BLUE_BLANK };
    }
  }

  // ── Row 3: Summary formulas — no fill ───────────────────────────────────
  for (let c = 0; c < numCols; c++) {
    const letter = colLetter(c);
    const formula = cfg.row3Formulas[letter];
    if (formula) {
      ws[letter + '3'] = { t: 'n', f: formula, v: 0, z: '0.00' };
    }
  }

  // ── Row 4: Column headers — peach fill, height 30, wrap text ────────────
  for (let c = 0; c < numCols; c++) {
    const addr = colLetter(c) + '4';
    ws[addr] = { t: 's', v: cfg.headers[c], s: STYLE_HEADER };
  }

  // ── Row 5+: Data rows ───────────────────────────────────────────────────
  for (let r = 0; r < cfg.data.length; r++) {
    const row = cfg.data[r];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell === null || cell === undefined || cell === '') continue;
      const addr = colLetter(c) + (5 + r);
      const fmt = cfg.colFormats?.[c];
      if (typeof cell === 'number') {
        ws[addr] = { t: 'n', v: cell, z: fmt || '0.00' };
      } else {
        ws[addr] = { t: 's', v: String(cell), z: fmt || '@' };
      }
    }
  }

  // ── Sheet properties: column widths, row 4 height, merges ──────────────
  ws['!ref'] = `A1:${colLetter(numCols - 1)}${Math.max(lastDataRow, 4)}`;
  ws['!cols'] = cfg.colWidths.map(w => ({ wch: w }));
  ws['!rows'] = [
    {}, {}, {}, { hpt: 30 },  // Row 4 height = 30pt
  ];

  // Row 1 merges (amendment sheets have "Original details" and "Revised details" bands)
  if (cfg.merges && cfg.merges.length > 0) {
    ws['!merges'] = cfg.merges.map(([s, e]) => XLSX.utils.decode_range(`${s}:${e}`));
  }

  return ws;
}

// ─── 1. b2b,sez,de ─────────────────────────────────────────────────────────

function buildB2BSEZDE(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string): SheetConfig {
  const eligible: SupplyType[] = ['B2B', 'SEZWP', 'SEZWOP', 'DE'];
  const invTypeLabel = (st: SupplyType): string =>
    st === 'SEZWP'  ? 'SEZ supplies with payment'    :
    st === 'SEZWOP' ? 'SEZ supplies without payment' :
    st === 'DE'     ? 'Deemed Exp'                   : 'Regular';

  const data: DataCell[][] = [];
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const st   = resolveSupplyType(inv, cust, profileState);
    if (!eligible.includes(st)) continue;
    const pos = stateCode(cust?.state || profileState);

    // Group items by GST rate — one row per rate per invoice
    const rateGroups = new Map<number, number>();
    for (const item of inv.items) {
      rateGroups.set(item.gstRate, (rateGroups.get(item.gstRate) ?? 0) + r2(item.quantity * item.rate));
    }

    for (const [rate, taxableValue] of rateGroups) {
      data.push([
        cust?.gstin || '',
        inv.customerName,
        inv.invoiceNumber,
        fmtDate(inv.date),
        r2(inv.totalAmount),
        pos,
        inv.reverseCharge ? 'Y' : 'N',
        '',                                  // Applicable % of Tax Rate
        invTypeLabel(st),
        '',                                  // E-Commerce GSTIN
        rate,
        r2(taxableValue),
        0,
      ]);
    }
  }

  return {
    name: 'b2b,sez,de',
    title: 'Summary For B2B, SEZ, DE (4A, 4B, 6B, 6C)',
    row2Labels: { A: 'No. of Recipients', C: 'No. of Invoices', E: 'Total Invoice Value', L: 'Total Taxable Value', M: 'Total Cess' },
    row3Formulas: {
      A: 'SUMPRODUCT((A5:A20004<>"")/COUNTIF(A5:A20004,A5:A20004&""))',
      C: 'SUMPRODUCT((C5:C20004<>"")/COUNTIF(C5:C20004,C5:C20004&""))',
      E: 'SUM(E5:E1048576)',
      L: 'SUM(L5:L1048576)',
      M: 'SUM(M5:M1048576)',
    },
    headers: [
      'GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date',
      'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate',
      'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount',
    ],
    colWidths: [22.71, 22.71, 17.86, 11.29, 19.57, 20.00, 14.86, 14.86, 13.43, 19.29, 7.43, 27.43, 22.14],
    colFormats: { 4: '0.00', 10: '0.00', 11: '0.00', 12: '0.00' },
    data,
  };
}

// ─── 2. b2ba (Amended B2B – empty) ─────────────────────────────────────────

function buildB2BA(): SheetConfig {
  return {
    name: 'b2ba',
    title: 'Summary For B2BA',
    row1Extras: { B: 'Original details ', E: 'Revised Details ' },
    row2Labels: { A: 'No. of Recipients', C: 'No. of Invoices', G: 'Total Invoice Value', N: 'Total Taxable Value', O: 'Total Cess' },
    row3Formulas: {
      A: 'SUMPRODUCT((A5:A20004<>"")/COUNTIF(A5:A20004,A5:A20004&""))',
      C: 'SUMPRODUCT((C5:C20004<>"")/COUNTIF(C5:C20004,C5:C20004&""))',
      G: 'SUMPRODUCT(1/COUNTIF(C5:C20004,C5:C20004&""),G5:G20004)',
      N: 'SUM(N5:N1048576)',
      O: 'SUM(O5:O1048576)',
    },
    headers: [
      'GSTIN/UIN of Recipient', 'Receiver Name', 'Original Invoice Number', 'Original Invoice date',
      'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value', 'Place Of Supply',
      'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN',
      'Rate', 'Taxable Value', 'Cess Amount',
    ],
    colWidths: [25.6, 22.71, 29.7, 26.3, 24.0, 22.0, 19.1, 20.1, 16.9, 14.9, 15.1, 19.4, 12.1, 21.3, 16.1],
    colFormats: { 6: '0.00', 12: '0.00', 13: '0.00', 14: '0.00' },
    merges: [['B1', 'D1'], ['E1', 'N1']],
    data: [],
  };
}

// ─── 3. b2cl ───────────────────────────────────────────────────────────────

function buildB2CL(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string): SheetConfig {
  const data: DataCell[][] = [];
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2CL') continue;
    const pos = stateCode(cust?.state || '');
    for (const item of inv.items) {
      data.push([
        inv.invoiceNumber, fmtDate(inv.date), r2(inv.totalAmount), pos,
        '', item.gstRate, r2(item.quantity * item.rate), 0, '',
      ]);
    }
  }
  return {
    name: 'b2cl',
    title: 'Summary For B2CL(5)',
    row2Labels: { A: 'No. of Invoices', C: 'Total Invoice Value', G: 'Total Taxable Value', H: 'Total Cess' },
    row3Formulas: {
      A: 'SUMPRODUCT((A5:A20004<>"")/COUNTIF(A5:A20004,A5:A20004&""))',
      C: 'SUM(C5:C1048576)',
      G: 'SUM(G5:G1048576)',
      H: 'SUM(H5:H1048576)',
    },
    headers: [
      'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply',
      'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN',
    ],
    colWidths: [22.71, 11.29, 19.57, 19.43, 14.86, 5.71, 20.00, 12.43, 19.29],
    colFormats: { 2: '0.00', 5: '0.00', 6: '0.00', 7: '0.00' },
    data,
  };
}

// ─── 4. b2cla (Amended B2CL – empty) ──────────────────────────────────────

function buildB2CLA(): SheetConfig {
  return {
    name: 'b2cla',
    title: 'Summary For B2CLA',
    row1Extras: { B: 'Original details ', E: 'Revised Details ' },
    row2Labels: { A: 'No. of Invoices', F: 'Total Inv Value', I: 'Total Taxable Value', J: 'Total Cess' },
    row3Formulas: {
      A: 'SUMPRODUCT((A5:A2004<>"")/COUNTIF(A5:A2004,A5:A2004&""))',
      F: 'SUM(F5:F1048576)',
      I: 'SUM(I5:I1048576)',
      J: 'SUM(J5:J1048576)',
    },
    headers: [
      'Original Invoice Number', 'Original Invoice date', 'Original Place Of Supply',
      'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value',
      'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN',
    ],
    colWidths: [24.6, 18.6, 24.6, 29.7, 26.3, 17.9, 14.9, 7.0, 19.0, 12.6, 19.7],
    colFormats: { 5: '0.00', 7: '0.00', 8: '0.00', 9: '0.00' },
    merges: [['B1', 'D1'], ['E1', 'J1']],
    data: [],
  };
}

// ─── 5. b2cs ───────────────────────────────────────────────────────────────

function buildB2CS(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string): SheetConfig {
  const agg = new Map<string, { taxable: number; type: string }>();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2CS') continue;
    const pos = stateCode(cust?.state || profileState);
    const type = inv.gstType === GSTType.IGST ? 'OE' : 'OE';  // GST utility expects 'OE' (Other than E-Commerce)
    for (const item of inv.items) {
      const key = `${pos}||${item.gstRate}||${type}`;
      const ex = agg.get(key) || { taxable: 0, type };
      agg.set(key, { taxable: r2(ex.taxable + r2(item.quantity * item.rate)), type });
    }
  }
  const data: DataCell[][] = [];
  for (const [key, val] of agg.entries()) {
    const [pos, rate] = key.split('||');
    data.push([val.type, pos, '', Number(rate), r2(val.taxable), 0, '']);
  }
  return {
    name: 'b2cs',
    title: 'Summary For B2CS(7)',
    row2Labels: { E: 'Total Taxable  Value', F: 'Total Cess' },
    row3Formulas: { E: 'SUM(E5:E1048576)', F: 'SUM(F5:F1048576)' },
    headers: ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'],
    colWidths: [22.43, 19.43, 14.86, 5.57, 20.57, 12.43, 19.29],
    colFormats: { 3: '0.00', 4: '0.00', 5: '0.00' },
    data,
  };
}

// ─── 6. b2csa (Amended B2CS – empty) ──────────────────────────────────────

function buildB2CSA(): SheetConfig {
  return {
    name: 'b2csa',
    title: 'Summary For B2CSA',
    row1Extras: { B: 'Original details ', C: 'Revised details' },
    row2Labels: { G: 'Total Taxable  Value', H: 'Total Cess' },
    row3Formulas: { G: 'SUM(G5:G1048576)', H: 'SUM(H5:H1048576)' },
    headers: [
      'Financial Year', 'Original Month', 'Place Of Supply', 'Type',
      'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN',
    ],
    colWidths: [22.4, 19.43, 14.86, 29.9, 16.0, 14.9, 16.0, 21.1, 19.3],
    colFormats: { 5: '0.00', 6: '0.00', 7: '0.00' },
    merges: [['C1', 'H1']],
    data: [],
  };
}

// ─── 7. cdnr ───────────────────────────────────────────────────────────────

function buildCDNR(creditNotes: CreditNote[], debitNotes: DebitNote[], custMap: Map<string, Customer>, profileState: string): SheetConfig {
  const data: DataCell[][] = [];
  const push = (note: CreditNote | DebitNote, type: 'C' | 'D') => {
    const cust = custMap.get(note.customerId);
    if (!cust?.gstin) return;
    const pos = stateCode(cust.state || profileState);
    for (const item of note.items) {
      data.push([
        cust.gstin, note.customerName, note.noteNumber, fmtDate(note.date),
        type, pos, 'N', 'Regular', r2(note.totalAmount),
        '', item.gstRate, r2(item.quantity * item.rate), 0,
      ]);
    }
  };
  for (const cn of creditNotes) push(cn, 'C');
  for (const dn of debitNotes)  push(dn, 'D');
  return {
    name: 'cdnr',
    title: 'Summary For CDNR(9B)',
    row2Labels: { A: 'No. of Recipients', C: 'No. of Notes', I: 'Total Note Value', L: 'Total Taxable Value', M: 'Total Cess' },
    row3Formulas: {
      A: 'SUMPRODUCT((A5:A20004<>"")/COUNTIF(A5:A20004,A5:A20004&""))',
      C: 'SUMPRODUCT((C5:C20004<>"")/COUNTIF(C5:C20004,C5:C20004&""))',
      I: 'SUM(I5:I1048576)', L: 'SUM(L5:L1048576)', M: 'SUM(M5:M1048576)',
    },
    headers: [
      'GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date',
      'Note Type', 'Place Of Supply', 'Reverse Charge', 'Note Supply Type',
      'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
    ],
    colWidths: [24.9, 24.9, 27.7, 24.9, 14.7, 19.4, 14.9, 26.7, 20.9, 14.9, 6.3, 20.0, 12.4],
    colFormats: { 8: '0.00', 10: '0.00', 11: '0.00', 12: '0.00' },
    data,
  };
}

// ─── 8. cdnra (Amended CDNR – empty) ───────────────────────────────────────

function buildCDNRA(): SheetConfig {
  return {
    name: 'cdnra',
    title: 'Summary For CDNRA',
    row1Extras: { B: 'Original details ', E: 'Revised details' },
    row2Labels: { A: 'No. of Recipients', C: 'No. of Notes/Vouchers', K: 'Total Note Value', N: 'Total Taxable Value', O: 'Total Cess' },
    row3Formulas: {
      A: 'SUMPRODUCT((A5:A1001<>"")/COUNTIF(A5:A1001,A5:A1001&""))',
      C: 'SUMPRODUCT((C5:C1001<>"")/COUNTIF(C5:C1001,C5:C1001&""))',
      K: 'SUM(K5:K1048576)', N: 'SUM(N5:N1048576)', O: 'SUM(O5:O1048576)',
    },
    headers: [
      'GSTIN/UIN of Recipient', 'Receiver Name', 'Original Note Number', 'Original Note Date',
      'Revised Note Number', 'Revised Note Date', 'Note Type', 'Place Of Supply',
      'Reverse Charge', 'Note Supply Type', 'Note Value', 'Applicable % of Tax Rate',
      'Rate', 'Taxable Value', 'Cess Amount',
    ],
    colWidths: [26.7, 22.71, 34.4, 31.4, 34.7, 30.3, 14.9, 19.4, 14.9, 26.7, 34.4, 14.9, 8.1, 19.1, 15.3],
    colFormats: { 10: '0.00', 12: '0.00', 13: '0.00', 14: '0.00' },
    merges: [['B1', 'D1'], ['E1', 'N1']],
    data: [],
  };
}

// ─── 9. cdnur ──────────────────────────────────────────────────────────────

function buildCDNUR(creditNotes: CreditNote[], debitNotes: DebitNote[], custMap: Map<string, Customer>, profileState: string): SheetConfig {
  const data: DataCell[][] = [];
  const push = (note: CreditNote | DebitNote, type: 'C' | 'D') => {
    const cust = custMap.get(note.customerId);
    if (cust?.gstin) return;
    const pos = stateCode(cust?.state || profileState);
    const urType = note.gstType === GSTType.IGST ? 'B2CL' : 'EXPWP';  // Per GST schema
    for (const item of note.items) {
      data.push([
        urType, note.noteNumber, fmtDate(note.date), type, pos,
        r2(note.totalAmount), '', item.gstRate, r2(item.quantity * item.rate), 0,
      ]);
    }
  };
  for (const cn of creditNotes) push(cn, 'C');
  for (const dn of debitNotes)  push(dn, 'D');
  return {
    name: 'cdnur',
    title: 'Summary For CDNUR(9B)',
    row2Labels: { B: 'No. of Notes/Vouchers', F: 'Total Note Value', I: 'Total Taxable Value', J: 'Total Cess' },
    row3Formulas: {
      B: 'SUMPRODUCT((B5:B1001<>"")/COUNTIF(B5:B1001,B5:B1001&""))',
      F: 'SUM(F5:F1048576)', I: 'SUM(I5:I1048576)', J: 'SUM(J5:J1048576)',
    },
    headers: [
      'UR Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply',
      'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
    ],
    colWidths: [26.6, 27.7, 25.6, 14.7, 19.4, 25.1, 14.9, 5.6, 20.0, 12.4],
    colFormats: { 5: '0.00', 7: '0.00', 8: '0.00', 9: '0.00' },
    data,
  };
}

// ─── 10. cdnura (Amended CDNUR – empty) ────────────────────────────────────

function buildCDNURA(): SheetConfig {
  return {
    name: 'cdnura',
    title: 'Summary For CDNURA',
    row1Extras: { B: 'Original details ', D: 'Revised details' },
    row2Labels: { B: 'No. of Notes/Vouchers', H: 'Total Note Value', K: 'Total Taxable Value', L: 'Total Cess' },
    row3Formulas: {
      B: 'SUMPRODUCT((B5:B1001<>"")/COUNTIF(B5:B1001,B5:B1001&""))',
      H: 'SUM(H5:H1048576)', K: 'SUM(K5:K1048576)', L: 'SUM(L5:L1048576)',
    },
    headers: [
      'UR Type', 'Original Note Number', 'Original Note Date',
      'Revised Note Number', 'Revised Note Date', 'Note Type', 'Place Of Supply',
      'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
    ],
    colWidths: [23.4, 35.4, 29.6, 36.1, 33.3, 18.3, 19.4, 27.6, 14.9, 11.0, 20.7, 14.6],
    colFormats: { 7: '0.00', 9: '0.00', 10: '0.00', 11: '0.00' },
    merges: [['B1', 'C1'], ['D1', 'K1']],
    data: [],
  };
}

// ─── 11. exp ───────────────────────────────────────────────────────────────

function buildEXP(invoices: Invoice[], custMap: Map<string, Customer>, profileState: string): SheetConfig {
  const data: DataCell[][] = [];
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const st = resolveSupplyType(inv, cust, profileState);
    if (st !== 'EXPWP' && st !== 'EXPWOP') continue;
    for (const item of inv.items) {
      data.push([
        st === 'EXPWP' ? 'WPAY' : 'WOPAY',
        inv.invoiceNumber, fmtDate(inv.date), r2(inv.totalAmount),
        inv.portCode || '', inv.shippingBillNo || '',
        inv.shippingBillDate ? fmtDate(inv.shippingBillDate) : '',
        item.gstRate, r2(item.quantity * item.rate), 0,
      ]);
    }
  }
  return {
    name: 'exp',
    title: 'Summary For EXP(6)',
    row2Labels: { B: 'No. of Invoices', D: 'Total Invoice Value', F: 'No. of Shipping Bill', J: 'Total Taxable Value' },
    row3Formulas: {
      B: 'SUMPRODUCT((B5:B20004<>"")/COUNTIF(B5:B20004,B5:B20004&""))',
      D: 'SUMPRODUCT(1/COUNTIF(B5:B20004,B5:B20004&""),D5:D20004)',
      F: 'SUMPRODUCT((F5:F20004<>"")/COUNTIF(F5:F20004,F5:F20004&""))',
      J: 'SUM(I5:I20004)',
    },
    headers: [
      'Export Type', 'Invoice Number', 'Invoice date', 'Invoice Value',
      'Port Code', 'Shipping Bill Number', 'Shipping Bill Date',
      'Rate', 'Taxable Value', 'Cess Amount',
    ],
    colWidths: [21.0, 15.3, 11.3, 19.6, 9.6, 19.3, 16.1, 5.6, 20.0, 12.4],
    colFormats: { 3: '0.00', 7: '0.00', 8: '0.00', 9: '0.00' },
    data,
  };
}

// ─── 12. expa (Amended Exports – empty) ────────────────────────────────────

function buildEXPA(): SheetConfig {
  return {
    name: 'expa',
    title: 'Summary For EXPA',
    row1Extras: { B: 'Original details ', D: 'Revised details' },
    row2Labels: { B: 'No. of Invoices', F: 'Total Invoice Value', H: 'No. of Shipping Bill', K: 'Total Taxable Value', L: 'Total Cess' },
    row3Formulas: {
      B: 'SUMPRODUCT((B5:B2004<>"")/COUNTIF(B5:B2004,B5:B2004&""))',
      F: 'SUM(F5:F1048576)',
      H: 'SUMPRODUCT((H5:H2004<>"")/COUNTIF(H5:H2004,H5:H2004&""))',
      K: 'SUM(K5:K1048576)',
      L: 'SUM(K5:K1048576)',
    },
    headers: [
      'Export Type', 'Original Invoice Number', 'Original Invoice date',
      'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value',
      'Port Code', 'Shipping Bill Number', 'Shipping Bill Date',
      'Rate', 'Taxable Value', 'Cess Amount',
    ],
    colWidths: [23.0, 22.9, 20.0, 29.7, 26.3, 19.9, 15.0, 23.1, 16.1, 9.3, 19.6, 20.0],
    colFormats: { 5: '0.00', 9: '0.00', 10: '0.00', 11: '0.00' },
    merges: [['D1', 'K1']],
    data: [],
  };
}

// ─── 13. at ────────────────────────────────────────────────────────────────

function buildAT(): SheetConfig {
  return {
    name: 'at',
    title: 'Summary For Advance Received (11B) ',
    row2Labels: { D: 'Total Advance Received', E: 'Total Cess' },
    row3Formulas: { D: 'SUM(D5:D1048576)', E: 'SUM(E5:E1048576)' },
    headers: ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Received', 'Cess Amount'],
    colWidths: [28.4, 14.9, 5.6, 24.0, 12.4],
    colFormats: { 2: '0.00', 3: '0.00', 4: '0.00' },
    data: [],
  };
}

// ─── 14. ata (Amended Advance Received – empty) ────────────────────────────

function buildATA(): SheetConfig {
  return {
    name: 'ata',
    title: 'Summary For Amended Tax Liability(Advance Received) ',
    row1Extras: { B: 'Original details ', D: 'Revised details' },
    row2Labels: { F: 'Total Advance Received', G: 'Total Cess' },
    row3Formulas: { F: 'SUM(F5:F1048576)', G: 'SUM(G5:G1048576)' },
    headers: ['Financial Year', 'Original Month', 'Original Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Received', 'Cess Amount'],
    colWidths: [26.7, 22.71, 21.7, 14.9, 12.6, 25.9, 15.3],
    colFormats: { 4: '0.00', 5: '0.00', 6: '0.00' },
    merges: [['B1', 'C1'], ['D1', 'F1']],
    data: [],
  };
}

// ─── 15. atadj ─────────────────────────────────────────────────────────────

function buildATADJ(): SheetConfig {
  return {
    name: 'atadj',
    title: 'Summary For Advance Adjusted (11B) ',
    row2Labels: { D: 'Total Advance Adjusted', E: 'Total Cess' },
    row3Formulas: { D: 'SUM(D5:D1048576)', E: 'SUM(E5:E148576)' },
    headers: ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Adjusted', 'Cess Amount'],
    colWidths: [27.9, 14.9, 5.6, 24.0, 12.4],
    colFormats: { 2: '0.00', 3: '0.00', 4: '0.00' },
    data: [],
  };
}

// ─── 16. atadja (Amended Advance Adjusted – empty) ─────────────────────────

function buildATADJA(): SheetConfig {
  return {
    name: 'atadja',
    title: 'Summary For Amendement Of Adjustment Advances',
    row1Extras: { B: 'Original details ', D: 'Revised details' },
    row2Labels: { F: 'Total Advance Adjusted', G: 'Total Cess' },
    row3Formulas: { F: 'SUM(F5:F1048576)', G: 'SUM(G5:G1048576)' },
    headers: ['Financial Year', 'Original Month', 'Original Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Adjusted', 'Cess Amount'],
    colWidths: [26.7, 22.71, 23.6, 14.9, 9.1, 24.0, 12.4],
    colFormats: { 4: '0.00', 5: '0.00', 6: '0.00' },
    merges: [['B1', 'C1'], ['D1', 'F1']],
    data: [],
  };
}

// ─── 17. exemp ─────────────────────────────────────────────────────────────

function buildEXEMP(invoices: Invoice[], custMap: Map<string, Customer>): SheetConfig {
  let interRegNil = 0, interUnregNil = 0, intraRegNil = 0, intraUnregNil = 0;
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const isReg = !!cust?.gstin;
    const isInter = inv.gstType === GSTType.IGST;
    const nilValue = inv.items.filter(i => i.gstRate === 0).reduce((s, i) => s + r2(i.quantity * i.rate), 0);
    if (nilValue === 0) continue;
    if (isInter && isReg) interRegNil += nilValue;
    else if (isInter && !isReg) interUnregNil += nilValue;
    else if (!isInter && isReg) intraRegNil += nilValue;
    else intraUnregNil += nilValue;
  }
  return {
    name: 'exemp',
    title: 'Summary For Nil rated, exempted and non GST outward supplies (8)',
    row2Labels: { B: 'Total Nil Rated Supplies', C: 'Total Exempted Supplies', D: 'Total Non-GST Supplies' },
    row3Formulas: {
      B: 'SUM(B5:B1048576)', C: 'SUM(C5:C1048576)', D: 'SUM(D5:D1048576)',
    },
    headers: ['Description', 'Nil Rated Supplies', 'Exempted(other than nil rated/non GST supply)', 'Non-GST Supplies'],
    colWidths: [38.1, 24.1, 24.9, 24.0],
    colFormats: { 1: '0.00', 2: '0.00', 3: '0.00' },
    data: [
      ['Inter-State supplies to registered persons',   r2(interRegNil),   0, 0],
      ['Inter-State supplies to unregistered persons', r2(interUnregNil), 0, 0],
      ['Intra-State supplies to registered persons',   r2(intraRegNil),   0, 0],
      ['Intra-State supplies to unregistered persons', r2(intraUnregNil), 0, 0],
    ],
  };
}

// ─── 18 & 19. hsn(b2b) and hsn(b2c) ────────────────────────────────────────

interface HsnAgg {
  description: string;
  qty: number;
  totalValue: number;
  taxable: number;
  rate: number;
  igst: number;
  cgst: number;
  sgst: number;
}

function buildHSNSheets(
  invoices: Invoice[], creditNotes: CreditNote[], debitNotes: DebitNote[],
  custMap: Map<string, Customer>, profile: BusinessProfile,
): { b2b: SheetConfig; b2c: SheetConfig } {
  const minDigits = minHsnDigits(profile);
  const b2bAgg = new Map<string, HsnAgg>();
  const b2cAgg = new Map<string, HsnAgg>();

  const addItems = (
    items: { hsnCode?: string; description: string; quantity: number; rate: number; gstRate: number }[],
    gstType: GSTType, isRegistered: boolean, mult: 1 | -1,
  ) => {
    const agg = isRegistered ? b2bAgg : b2cAgg;
    for (const item of items) {
      const hsn = (item.hsnCode || '').trim();
      if (hsn.length < minDigits) continue;
      const key = `${hsn}||${item.gstRate}`;
      const txval = r2(item.quantity * item.rate);
      const tax = r2(txval * item.gstRate / 100);
      const isIgst = gstType === GSTType.IGST;
      const ex = agg.get(key) || { description: item.description, qty: 0, totalValue: 0, taxable: 0, rate: item.gstRate, igst: 0, cgst: 0, sgst: 0 };
      agg.set(key, {
        description: ex.description || item.description,
        rate: item.gstRate,
        qty:        ex.qty        + mult * item.quantity,
        totalValue: ex.totalValue + mult * r2(txval + tax),
        taxable:    ex.taxable    + mult * txval,
        igst:       ex.igst       + (isIgst  ? mult * tax        : 0),
        cgst:       ex.cgst       + (!isIgst ? mult * r2(tax / 2) : 0),
        sgst:       ex.sgst       + (!isIgst ? mult * r2(tax / 2) : 0),
      });
    }
  };

  for (const inv of invoices)   addItems(inv.items, inv.gstType, !!custMap.get(inv.customerId)?.gstin, 1);
  for (const cn  of creditNotes) addItems(cn.items,  cn.gstType,  !!custMap.get(cn.customerId)?.gstin,  -1);
  for (const dn  of debitNotes)  addItems(dn.items,  dn.gstType,  !!custMap.get(dn.customerId)?.gstin,  1);

  const toData = (agg: Map<string, HsnAgg>): DataCell[][] =>
    Array.from(agg.entries()).map(([key, d]) => {
      const [hsn] = key.split('||');
      return [hsn, d.description, 'NOS-NUMBERS', r2(d.qty), r2(d.totalValue), d.rate, r2(d.taxable), r2(d.igst), r2(d.cgst), r2(d.sgst), 0];
    });

  const headers = ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'];
  const colWidths = [22.6, 14.1, 19.3, 13.4, 23.7, 15.3, 29.1, 21.0, 18.6, 20.1, 12.4];
  const colFormats: Record<number, string> = { 0: '@', 3: '0.00', 4: '0.00', 5: '0.00', 6: '0.00', 7: '0.00', 8: '0.00', 9: '0.00', 10: '0.00' };
  const row2Labels = { A: 'No. of HSN', E: 'Total Value', G: 'Total Taxable Value', H: 'Total Integrated Tax', I: 'Total Central Tax', J: 'Total State/UT Tax', K: 'Total Cess' };
  const row3Formulas = {
    A: 'SUMPRODUCT((A5:A2000<>"")/COUNTIF(A5:A2000,A5:A2000&""))',
    E: 'SUM(E5:E2000)', G: 'SUM(G5:G2000)', H: 'SUM(H5:H2000)',
    I: 'SUM(I5:I2000)', J: 'SUM(J5:J2000)', K: 'SUM(K5:K2000)',
  };

  return {
    b2b: { name: 'hsn(b2b)', title: 'Summary For HSN(12)', row2Labels, row3Formulas, headers, colWidths, colFormats, data: toData(b2bAgg) },
    b2c: { name: 'hsn(b2c)', title: 'Summary For HSN(12)', row2Labels, row3Formulas, headers, colWidths, colFormats, data: toData(b2cAgg) },
  };
}

// ─── 20. docs ──────────────────────────────────────────────────────────────

function buildDOCS(invoices: Invoice[], creditNotes: CreditNote[], debitNotes: DebitNote[]): SheetConfig {
  const invNos = invoices.map(i => i.invoiceNumber).sort();
  const cnNos  = creditNotes.map(n => n.noteNumber).sort();
  const dnNos  = debitNotes.map(n => n.noteNumber).sort();
  return {
    name: 'docs',
    title: 'Summary of documents issued during the tax period (13)',
    row2Labels: { D: 'Total Number', E: 'Total Cancelled' },
    row3Formulas: { D: 'SUM(D5:D1048576)', E: 'SUM(E5:E1048576)' },
    headers: ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'],
    colWidths: [50.71, 12.14, 11.00, 14.14, 15.86],
    colFormats: { 3: '0', 4: '0' },
    data: [
      ['Invoices for outward supply',                          invNos[0] || '', invNos[invNos.length - 1] || '', invoices.length,    0],
      ['Invoices for inward supply from unregistered person', '', '', 0, 0],
      ['Revised Invoice',                                     '', '', 0, 0],
      ['Debit Note',                                          dnNos[0] || '', dnNos[dnNos.length - 1] || '', debitNotes.length,  0],
      ['Credit Note',                                         cnNos[0] || '', cnNos[cnNos.length - 1] || '', creditNotes.length, 0],
      ['Receipt voucher',                                     '', '', 0, 0],
      ['Payment Voucher',                                     '', '', 0, 0],
      ['Refund voucher',                                      '', '', 0, 0],
      ['Delivery Challan for job work',                       '', '', 0, 0],
      ['Delivery Challan in case of supply on approval basis','', '', 0, 0],
      ['Delivery Challan in case of liquid gas',              '', '', 0, 0],
      ['Delivery Challan in cases other than by way of supply (excluding at S no. 9 to 11)', '', '', 0, 0],
    ].filter(row => (row[3] as number) > 0),
  };
}

// ─── 21. eco ───────────────────────────────────────────────────────────────

function buildECO(): SheetConfig {
  return {
    name: 'eco',
    title: 'Summary For Supplies through ECO-14',
    row2Labels: {
      B: 'No. of E-Commerce Operator', D: 'Total Net Value of Supplies',
      E: 'Total Integrated Tax', F: 'Total Central Tax ',
      G: 'Total State/UT Tax ', H: 'Total Cess',
    },
    row3Formulas: {
      B: 'SUMPRODUCT((B5:B1048576<>"")/COUNTIF(B5:B1048576,B5:B1048576&""))',
      D: 'SUM(D5:D1048576)', E: 'SUM(E5:E1048576)', F: 'SUM(F5:F1048576)',
      G: 'SUM(G5:G1048576)', H: 'SUM(H5:H1048576)',
    },
    headers: [
      'Nature of Supply', 'GSTIN of E-Commerce Operator', 'E-Commerce Operator Name',
      'Net value of supplies', 'Integrated tax', 'Central tax', 'State/UT tax', 'Cess',
    ],
    colWidths: [42.86, 33.57, 29.14, 23.71, 25.57, 23.00, 23.71, 23.14],
    colFormats: { 3: '0.00', 4: '0.00', 5: '0.00', 6: '0.00', 7: '0.00' },
    data: [],
  };
}

// ─── "Help Instruction" sheet (minimal placeholder) ────────────────────────

function buildHelpInstruction(): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  ws['A1'] = {
    t: 's',
    v: 'Invoice & other data upload for creation of GSTR 1',
    s: STYLE_TITLE,
  };
  ws['!ref'] = 'A1:A1';
  ws['!cols'] = [{ wch: 80 }];
  return ws;
}

// ─── Workbook assembly ─────────────────────────────────────────────────────

export function generateGSTR1ExcelBlob(data: GSTR1Data): Blob {
  const { profile, invoices, customers, creditNotes, debitNotes } = data;
  const custMap      = buildCustomerMap(customers);
  const profileState = profile.state;

  const hsn = buildHSNSheets(invoices, creditNotes, debitNotes, custMap, profile);

  const configs: SheetConfig[] = [
    buildB2BSEZDE(invoices, custMap, profileState),
    buildB2BA(),
    buildB2CL(invoices, custMap, profileState),
    buildB2CLA(),
    buildB2CS(invoices, custMap, profileState),
    buildB2CSA(),
    buildCDNR(creditNotes, debitNotes, custMap, profileState),
    buildCDNRA(),
    buildCDNUR(creditNotes, debitNotes, custMap, profileState),
    buildCDNURA(),
    buildEXP(invoices, custMap, profileState),
    buildEXPA(),
    buildAT(),
    buildATA(),
    buildATADJ(),
    buildATADJA(),
    buildEXEMP(invoices, custMap),
    hsn.b2b,
    hsn.b2c,
    buildDOCS(invoices, creditNotes, debitNotes),
    buildECO(),
  ];

  const wb = XLSX.utils.book_new();

  // 1. Help Instruction goes first
  XLSX.utils.book_append_sheet(wb, buildHelpInstruction(), 'Help Instruction');

  // 2. All data sheets
  for (const cfg of configs) {
    const ws = buildWorksheet(cfg);
    XLSX.utils.book_append_sheet(wb, ws, cfg.name);
  }

  const wbOut = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true });
  return new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function downloadGSTR1Excel(data: GSTR1Data): void {
  const blob = generateGSTR1ExcelBlob(data);
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `GSTR1_${data.profile.gstin || 'export'}_${data.fp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ─── JSON Generator (GST API v2 portal schema) ─────────────────────────────

export interface GSTR1JSON {
  gstin: string;
  fp: string;
  gt: number;
  cur_gt: number;
  b2b: object[];
  sez: object[];
  de: object[];
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
  const custMap      = buildCustomerMap(customers);
  const profileState = profile.state;
  const minDigits    = minHsnDigits(profile);

  function buildItms(items: Invoice['items'], gstType: GSTType) {
    return items.map((item, idx) => {
      const txval  = r2(item.quantity * item.rate);
      const tax    = r2(txval * item.gstRate / 100);
      const isIgst = gstType === GSTType.IGST;
      return {
        num: idx + 1,
        itm_det: {
          rt: item.gstRate, txval,
          iamt: isIgst  ? tax        : 0,
          camt: !isIgst ? r2(tax / 2) : 0,
          samt: !isIgst ? r2(tax / 2) : 0,
          csamt: 0,
        },
      };
    });
  }

  // ── b2b ──
  const b2bMap = new Map<string, object[]>();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2B') continue;
    const gstin = cust?.gstin || '';
    const pos   = stateCode(cust?.state || profileState);
    const invObj = {
      inum: inv.invoiceNumber, idt: fmtDate(inv.date), val: r2(inv.totalAmount),
      pos, rchrg: inv.reverseCharge ? 'Y' : 'N', inv_typ: 'R',
      itms: buildItms(inv.items, inv.gstType),
    };
    const list = b2bMap.get(gstin) || [];
    list.push(invObj);
    b2bMap.set(gstin, list);
  }
  const b2b = Array.from(b2bMap.entries()).map(([ctin, inv]) => ({ ctin, inv }));

  // ── sez ──
  const sezMap = new Map<string, object[]>();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const st   = resolveSupplyType(inv, cust, profileState);
    if (st !== 'SEZWP' && st !== 'SEZWOP') continue;
    const gstin = cust?.gstin || '';
    const pos   = stateCode(cust?.state || profileState);
    const itms  = inv.items.map((item, idx) => {
      const txval = r2(item.quantity * item.rate);
      const iamt  = r2(txval * item.gstRate / 100);
      return { num: idx + 1, itm_det: { rt: item.gstRate, txval, iamt, camt: 0, samt: 0, csamt: 0 } };
    });
    const invObj = {
      inum: inv.invoiceNumber, idt: fmtDate(inv.date), val: r2(inv.totalAmount),
      pos, inv_typ: st === 'SEZWP' ? 'SEWP' : 'SEWOP', itms,
    };
    const list = sezMap.get(gstin) || [];
    list.push(invObj);
    sezMap.set(gstin, list);
  }
  const sez = Array.from(sezMap.entries()).map(([ctin, inv]) => ({ ctin, inv }));

  // ── de ──
  const deMap = new Map<string, object[]>();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'DE') continue;
    const gstin = cust?.gstin || '';
    const pos   = stateCode(cust?.state || profileState);
    const invObj = {
      inum: inv.invoiceNumber, idt: fmtDate(inv.date), val: r2(inv.totalAmount),
      pos, rchrg: inv.reverseCharge ? 'Y' : 'N', inv_typ: 'DE',
      itms: buildItms(inv.items, inv.gstType),
    };
    const list = deMap.get(gstin) || [];
    list.push(invObj);
    deMap.set(gstin, list);
  }
  const de = Array.from(deMap.entries()).map(([ctin, inv]) => ({ ctin, inv }));

  // ── b2cl ──
  const b2clByState = new Map<string, object[]>();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2CL') continue;
    const pos = stateCode(cust?.state || '');
    const itms = inv.items.map((item, idx) => ({
      num: idx + 1,
      itm_det: { rt: item.gstRate, txval: r2(item.quantity * item.rate), iamt: r2(item.quantity * item.rate * item.gstRate / 100), csamt: 0 },
    }));
    const invObj = { inum: inv.invoiceNumber, idt: fmtDate(inv.date), val: r2(inv.totalAmount), itms };
    const list = b2clByState.get(pos) || [];
    list.push(invObj);
    b2clByState.set(pos, list);
  }
  const b2cl = Array.from(b2clByState.entries()).map(([pos, inv]) => ({ pos, inv }));

  // ── b2cs ──
  const b2csAgg = new Map<string, { pos: string; typ: string; rt: number; txval: number; iamt: number; csamt: number }>();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2CS') continue;
    const pos = stateCode(cust?.state || profileState);
    const typ = inv.gstType === GSTType.IGST ? 'OE' : 'OE';
    for (const item of inv.items) {
      const txval = r2(item.quantity * item.rate);
      const iamt  = inv.gstType === GSTType.IGST ? r2(txval * item.gstRate / 100) : 0;
      const key   = `${pos}||${typ}||${item.gstRate}`;
      const ex    = b2csAgg.get(key) || { pos, typ, rt: item.gstRate, txval: 0, iamt: 0, csamt: 0 };
      b2csAgg.set(key, { ...ex, txval: ex.txval + txval, iamt: ex.iamt + iamt });
    }
  }
  const b2cs = Array.from(b2csAgg.values());

  // ── cdnr ──
  const cdnrMap = new Map<string, object[]>();
  const addToCdnr = (note: CreditNote | DebitNote, ntty: 'C' | 'D') => {
    const cust = custMap.get(note.customerId);
    if (!cust?.gstin) return;
    const pos = stateCode(cust.state || profileState);
    const noteObj = {
      ntnum: note.noteNumber, ntdt: fmtDate(note.date), val: r2(note.totalAmount),
      ntty, pos, rchrg: 'N',
      itms: buildItms(note.items, note.gstType),
    };
    const list = cdnrMap.get(cust.gstin) || [];
    list.push(noteObj);
    cdnrMap.set(cust.gstin, list);
  };
  for (const cn of creditNotes) addToCdnr(cn, 'C');
  for (const dn of debitNotes)  addToCdnr(dn, 'D');
  const cdnr = Array.from(cdnrMap.entries()).map(([ctin, nt]) => ({ ctin, nt }));

  // ── cdnur ──
  const cdnur: object[] = [];
  const addToCdnur = (note: CreditNote | DebitNote, ntty: 'C' | 'D') => {
    const cust = custMap.get(note.customerId);
    if (cust?.gstin) return;
    const pos  = stateCode(cust?.state || profileState);
    const typ  = note.gstType === GSTType.IGST ? 'B2CL' : 'B2CS';
    const itms = note.items.map((item, idx) => {
      const txval = r2(item.quantity * item.rate);
      const iamt  = note.gstType === GSTType.IGST ? r2(txval * item.gstRate / 100) : 0;
      return { num: idx + 1, itm_det: { rt: item.gstRate, txval, iamt, csamt: 0 } };
    });
    cdnur.push({ ntty, typ, ntnum: note.noteNumber, ntdt: fmtDate(note.date), val: r2(note.totalAmount), pos, itms });
  };
  for (const cn of creditNotes) addToCdnur(cn, 'C');
  for (const dn of debitNotes)  addToCdnur(dn, 'D');

  // ── exp ──
  const exp: object[] = [];
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const st   = resolveSupplyType(inv, cust, profileState);
    if (st !== 'EXPWP' && st !== 'EXPWOP') continue;
    const itms = inv.items.map((item, idx) => ({
      num: idx + 1,
      itm_det: { rt: item.gstRate, txval: r2(item.quantity * item.rate), iamt: st === 'EXPWP' ? r2(item.quantity * item.rate * item.gstRate / 100) : 0, csamt: 0 },
    }));
    exp.push({
      exp_typ: st === 'EXPWP' ? 'WPAY' : 'WOPAY',
      inv: [{ inum: inv.invoiceNumber, idt: fmtDate(inv.date), val: r2(inv.totalAmount), sbpcode: inv.portCode || '', sbnum: inv.shippingBillNo || '', sbdt: inv.shippingBillDate ? fmtDate(inv.shippingBillDate) : '', itms }],
    });
  }

  // ── exemp ──
  const nilAgg = (filter: (inv: Invoice) => boolean) =>
    invoices.filter(filter).reduce((s, i) => s + i.items.filter(it => it.gstRate === 0).reduce((ss, it) => ss + r2(it.quantity * it.rate), 0), 0);
  const exemp = {
    nil_sup: {
      inter_reg:   r2(nilAgg(i => i.gstType === GSTType.IGST && !!custMap.get(i.customerId)?.gstin)),
      inter_unreg: r2(nilAgg(i => i.gstType === GSTType.IGST && !custMap.get(i.customerId)?.gstin)),
      intra_reg:   r2(nilAgg(i => i.gstType !== GSTType.IGST && !!custMap.get(i.customerId)?.gstin)),
      intra_unreg: r2(nilAgg(i => i.gstType !== GSTType.IGST && !custMap.get(i.customerId)?.gstin)),
    },
    expt_sup: { inter_reg: 0, inter_unreg: 0, intra_reg: 0, intra_unreg: 0 },
    ngsup:    { inter_reg: 0, inter_unreg: 0, intra_reg: 0, intra_unreg: 0 },
  };

  // ── hsn ──
  interface JsonHsn { description: string; qty: number; totalValue: number; taxable: number; igst: number; cgst: number; sgst: number; rt: number; }
  const hsnAgg = new Map<string, JsonHsn>();
  const addToHSN = (items: Invoice['items'], gstType: GSTType, mult: 1 | -1) => {
    for (const item of items) {
      const hsn = (item.hsnCode || '').trim();
      if (hsn.length < minDigits) continue;
      const key = `${hsn}||${item.gstRate}`;
      const txval = r2(item.quantity * item.rate);
      const tax = r2(txval * item.gstRate / 100);
      const isIgst = gstType === GSTType.IGST;
      const ex = hsnAgg.get(key) || { description: item.description, qty: 0, totalValue: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, rt: item.gstRate };
      hsnAgg.set(key, {
        description: ex.description || item.description, rt: item.gstRate,
        qty: ex.qty + mult * item.quantity, totalValue: ex.totalValue + mult * r2(txval + tax),
        taxable: ex.taxable + mult * txval,
        igst: ex.igst + (isIgst ? mult * tax : 0),
        cgst: ex.cgst + (!isIgst ? mult * r2(tax / 2) : 0),
        sgst: ex.sgst + (!isIgst ? mult * r2(tax / 2) : 0),
      });
    }
  };
  for (const inv of invoices)   addToHSN(inv.items, inv.gstType, 1);
  for (const cn  of creditNotes) addToHSN(cn.items,  cn.gstType,  -1);
  for (const dn  of debitNotes)  addToHSN(dn.items,  dn.gstType,  1);
  const hsnData = Array.from(hsnAgg.entries()).map(([key, v], idx) => {
    const [hsn_sc] = key.split('||');
    return {
      num: idx + 1, hsn_sc, desc: v.description, uqc: 'NOS', rt: v.rt,
      qty: r2(v.qty), val: r2(v.totalValue), txval: r2(v.taxable),
      iamt: r2(v.igst), camt: r2(v.cgst), samt: r2(v.sgst), csamt: 0,
    };
  });

  // ── doc_det ──
  const invNos = invoices.map(i => i.invoiceNumber).sort();
  const cnNos  = creditNotes.map(n => n.noteNumber).sort();
  const dnNos  = debitNotes.map(n => n.noteNumber).sort();
  const doc_det = [
    { doc_num: 1, docs: [{ num: 1, from: invNos[0] || '', to: invNos[invNos.length - 1] || '', totnum: invoices.length,    cancel: 0, net_issue: invoices.length    }] },
    { doc_num: 4, docs: [{ num: 1, from: cnNos[0]  || '', to: cnNos[cnNos.length - 1]   || '', totnum: creditNotes.length, cancel: 0, net_issue: creditNotes.length }] },
    { doc_num: 5, docs: [{ num: 1, from: dnNos[0]  || '', to: dnNos[dnNos.length - 1]   || '', totnum: debitNotes.length,  cancel: 0, net_issue: debitNotes.length  }] },
  ];

  const gt = r2(invoices.reduce((s, i) => s + i.totalAmount, 0));
  return {
    gstin: profile.gstin, fp, gt, cur_gt: gt,
    b2b, sez, de, b2cl, b2cs, cdnr, cdnur, exp,
    at: [], atadj: [], exemp,
    hsn: { data: hsnData },
    doc_det,
  };
}

export function downloadGSTR1JSON(data: GSTR1Data): void {
  const json = generateGSTR1JSON(data);
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `GSTR1_${data.profile.gstin || 'export'}_${data.fp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
