/**
 * GSTR-1 Generator — GST Portal Compliant Excel & JSON Export
 *
 * Excel sheet structure matches the GST Offline Utility template exactly:
 *   1.  b2b,sez,de   – B2B / SEZ / Deemed-Export invoices (combined)
 *   2.  b2ba          – Amended B2B (empty – app doesn't track amendments)
 *   3.  b2cl          – B2C Large (inter-state, unregistered, > ₹2.5L)
 *   4.  b2cla         – Amended B2CL (empty)
 *   5.  b2cs          – B2C Small (aggregated)
 *   6.  b2csa         – Amended B2CS (empty)
 *   7.  cdnr          – Credit/Debit Notes to Registered
 *   8.  cdnra         – Amended CDNR (empty)
 *   9.  cdnur         – Credit/Debit Notes to Unregistered
 *   10. cdnura        – Amended CDNUR (empty)
 *   11. exp           – Exports
 *   12. expa          – Amended Exports (empty)
 *   13. at            – Advance Received
 *   14. ata           – Amended Advance Received (empty)
 *   15. atadj         – Advance Adjusted
 *   16. atadja        – Amended Advance Adjusted (empty)
 *   17. exemp         – Nil/Exempt/Non-GST Supplies
 *   18. hsn(b2b)      – HSN Summary for registered-party supplies
 *   19. hsn(b2c)      – HSN Summary for unregistered-party supplies
 *   20. docs          – Document Summary
 *   21. eco           – E-Commerce Operator Supplies
 *
 * JSON schema follows GST API v2 (portal-uploadable).
 */

import * as XLSX from 'xlsx';
import type { BusinessProfile, Invoice, Customer, CreditNote, DebitNote, SupplyType } from '../types';
import { GSTType } from '../types';

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

// ─── Sheet Builder Primitives ──────────────────────────────────────────────

type SheetRow = (string | number)[];
type AoaCell = string | number | { f: string };

function buildSheet(
  title: string,
  headers: string[],
  dataRows: SheetRow[],
  summaryLabels: string[],
  summaryFormulas: string[],
): AoaCell[][] {
  const row1: AoaCell[] = [title];
  const row2: AoaCell[] = summaryLabels;
  const row3: AoaCell[] = summaryFormulas.map(f => (f.startsWith('=') ? { f: f.slice(1) } : f));
  const row4: AoaCell[] = headers;
  return [row1, row2, row3, row4, ...dataRows];
}

function emptySheet(title: string, headers: string[], summaryLabels: string[], summaryFormulas: string[]): AoaCell[][] {
  return buildSheet(title, headers, [], summaryLabels, summaryFormulas);
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

// ─── Sheet 1: b2b,sez,de ──────────────────────────────────────────────────
// Combines Regular B2B, SEZ (with/without payment) and Deemed Exports.
// Invoice Type column distinguishes them:
//   B2B      → "Regular"
//   SEZWP    → "SEZ supplies with payment"
//   SEZWOP   → "SEZ supplies without payment"
//   DE       → "Deemed Exp"

const B2BSEZDE_HEADERS = [
  'GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date',
  'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate',
  'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount',
];

function invTypeLabel(st: SupplyType): string {
  if (st === 'SEZWP')  return 'SEZ supplies with payment';
  if (st === 'SEZWOP') return 'SEZ supplies without payment';
  if (st === 'DE')     return 'Deemed Exp';
  return 'Regular';
}

function appPct(st: SupplyType): string {
  if (st === 'SEZWP') return 'Applicable';
  if (st === 'SEZWOP') return '';
  if (st === 'DE') return 'Applicable';
  return '';
}

function buildB2BSEZDESheet(
  invoices: Invoice[], custMap: Map<string, Customer>, profileState: string, fp: string,
): AoaCell[][] {
  const eligible: SupplyType[] = ['B2B', 'SEZWP', 'SEZWOP', 'DE'];
  const rows: SheetRow[] = [];
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const st = resolveSupplyType(inv, cust, profileState);
    if (!eligible.includes(st)) continue;
    const pos = stateCode(cust?.state || profileState);
    for (const item of inv.items) {
      rows.push([
        cust?.gstin || '',
        inv.customerName,
        inv.invoiceNumber,
        fmtDate(inv.date),
        r2(inv.totalAmount),
        pos,
        inv.reverseCharge ? 'Y' : 'N',
        appPct(st),
        invTypeLabel(st),
        '',
        item.gstRate,
        r2(item.quantity * item.rate),
        0,
      ]);
    }
  }
  return buildSheet(
    `Summary For B2B, SEZ, DE(4)`,
    B2BSEZDE_HEADERS,
    rows,
    ['Summary For B2B, SEZ, DE(4)', 'No. of Recipients', 'No. of Invoices', '', 'Total Invoice Value', '', 'Total Taxable Value', 'Total Cess'],
    ['', '=COUNTA(A5:A1048576)', '=COUNTA(C5:C1048576)', '', '=SUM(E5:E1048576)', '', '=SUM(L5:L1048576)', '=SUM(M5:M1048576)'],
  );
}

// ─── Sheet 2: b2ba (Amended B2B – empty) ──────────────────────────────────

const B2BA_HEADERS = [
  'GSTIN/UIN of Recipient', 'Receiver Name', 'Original Invoice Number', 'Original Invoice date',
  'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value', 'Place Of Supply',
  'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN',
  'Rate', 'Taxable Value', 'Cess Amount',
];

function buildB2BASheet(): AoaCell[][] {
  return emptySheet(
    'Summary For B2BA',
    B2BA_HEADERS,
    ['Summary For B2BA', 'No. of Recipients', 'No. of Invoices', '', 'Total Invoice Value', 'Total Taxable Value', 'Total Cess'],
    ['', '=COUNTA(A5:A1048576)', '=COUNTA(E5:E1048576)', '', '=SUM(G5:G1048576)', '=SUM(N5:N1048576)', '=SUM(O5:O1048576)'],
  );
}

// ─── Sheet 3: b2cl ────────────────────────────────────────────────────────

const B2CL_HEADERS = [
  'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply',
  'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN',
];

function buildB2CLSheet(
  invoices: Invoice[], custMap: Map<string, Customer>, profileState: string,
): AoaCell[][] {
  const rows: SheetRow[] = [];
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2CL') continue;
    const pos = stateCode(cust?.state || '');
    for (const item of inv.items) {
      rows.push([inv.invoiceNumber, fmtDate(inv.date), r2(inv.totalAmount), pos, 'Applicable', item.gstRate, r2(item.quantity * item.rate), 0, '']);
    }
  }
  return buildSheet(
    'Summary For B2CL(5)',
    B2CL_HEADERS,
    rows,
    ['Summary For B2CL(5)', 'No. of Invoices', '', 'Total Invoice Value', '', 'Total Taxable Value', 'Total Cess'],
    ['', '=COUNTA(A5:A1048576)', '', '=SUM(C5:C1048576)', '', '=SUM(G5:G1048576)', '=SUM(H5:H1048576)'],
  );
}

// ─── Sheet 4: b2cla (Amended B2CL – empty) ────────────────────────────────

const B2CLA_HEADERS = [
  'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply',
  'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN',
  'Original Invoice Number', 'Original Invoice date',
];

function buildB2CLASheet(): AoaCell[][] {
  return emptySheet(
    'Summary For B2CLA',
    B2CLA_HEADERS,
    ['Summary For B2CLA', 'Original details', '', '', '', 'Revised Details'],
    ['', '', '', '', '', ''],
  );
}

// ─── Sheet 5: b2cs ────────────────────────────────────────────────────────

const B2CS_HEADERS = [
  'Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate',
  'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN',
];

function buildB2CSSheet(
  invoices: Invoice[], custMap: Map<string, Customer>, profileState: string,
): AoaCell[][] {
  const agg: Map<string, { taxable: number; type: string }> = new Map();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2CS') continue;
    const pos = stateCode(cust?.state || profileState);
    const type = inv.gstType === GSTType.IGST ? 'Inter-State' : 'Intra-State';
    for (const item of inv.items) {
      const key = `${pos}||${item.gstRate}||${type}`;
      const existing = agg.get(key) || { taxable: 0, type };
      agg.set(key, { taxable: r2(existing.taxable + r2(item.quantity * item.rate)), type });
    }
  }
  const rows: SheetRow[] = [];
  for (const [key, val] of agg.entries()) {
    const [pos, rate] = key.split('||');
    rows.push([val.type, pos, 'Applicable', Number(rate), r2(val.taxable), 0, '']);
  }
  return buildSheet(
    'Summary For B2CS(7)',
    B2CS_HEADERS,
    rows,
    ['Summary For B2CS(7)', 'No. of States', '', 'Total Taxable Value', 'Total Cess'],
    ['', '=COUNTA(B5:B1048576)', '', '=SUM(E5:E1048576)', '=SUM(F5:F1048576)'],
  );
}

// ─── Sheet 6: b2csa (Amended B2CS – empty) ────────────────────────────────

const B2CSA_HEADERS = [
  'Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate',
  'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN',
  'Original Type', 'Original Place Of Supply', 'Original Rate', 'Original Taxable Value',
];

function buildB2CSASheet(): AoaCell[][] {
  return emptySheet(
    'Summary For B2CSA',
    B2CSA_HEADERS,
    ['Summary For B2CSA', 'Original details', '', 'Revised details'],
    ['', '', '', ''],
  );
}

// ─── Sheet 7: cdnr ────────────────────────────────────────────────────────

const CDNR_HEADERS = [
  'GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date',
  'Note Type', 'Place Of Supply', 'Reverse Charge', 'Note Supply Type',
  'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
];

function buildCDNRSheet(
  creditNotes: CreditNote[], debitNotes: DebitNote[],
  custMap: Map<string, Customer>, profileState: string,
): AoaCell[][] {
  const rows: SheetRow[] = [];
  for (const cn of creditNotes) {
    const cust = custMap.get(cn.customerId);
    if (!cust?.gstin) continue;
    const pos = stateCode(cust.state || profileState);
    for (const item of cn.items) {
      rows.push([cust.gstin, cn.customerName, cn.noteNumber, fmtDate(cn.date), 'C', pos, 'N', 'Regular', r2(cn.totalAmount), 'Applicable', item.gstRate, r2(item.quantity * item.rate), 0]);
    }
  }
  for (const dn of debitNotes) {
    const cust = custMap.get(dn.customerId);
    if (!cust?.gstin) continue;
    const pos = stateCode(cust.state || profileState);
    for (const item of dn.items) {
      rows.push([cust.gstin, dn.customerName, dn.noteNumber, fmtDate(dn.date), 'D', pos, 'N', 'Regular', r2(dn.totalAmount), 'Applicable', item.gstRate, r2(item.quantity * item.rate), 0]);
    }
  }
  return buildSheet(
    'Summary For CDNR(9B)',
    CDNR_HEADERS,
    rows,
    ['Summary For CDNR(9B)', 'No. of Recipients', 'No. of Notes', '', 'Total Note Value', '', 'Total Taxable Value', 'Total Cess'],
    ['', '=COUNTA(A5:A1048576)', '=COUNTA(C5:C1048576)', '', '=SUM(I5:I1048576)', '', '=SUM(L5:L1048576)', '=SUM(M5:M1048576)'],
  );
}

// ─── Sheet 8: cdnra (Amended CDNR – empty) ────────────────────────────────

const CDNRA_HEADERS = [
  'GSTIN/UIN of Recipient', 'Receiver Name', 'Original Note Number', 'Original Note Date',
  'Revised Note Number', 'Revised Note Date', 'Note Type', 'Place Of Supply',
  'Reverse Charge', 'Note Supply Type', 'Note Value', 'Applicable % of Tax Rate',
  'Rate', 'Taxable Value', 'Cess Amount',
];

function buildCDNRASheet(): AoaCell[][] {
  return emptySheet(
    'Summary For CDNRA',
    CDNRA_HEADERS,
    ['Summary For CDNRA', 'Original details', '', '', '', 'Revised details'],
    ['', '', '', '', '', ''],
  );
}

// ─── Sheet 9: cdnur ───────────────────────────────────────────────────────

const CDNUR_HEADERS = [
  'UR Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply',
  'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
];

function buildCDNURSheet(
  creditNotes: CreditNote[], debitNotes: DebitNote[],
  custMap: Map<string, Customer>, profileState: string,
): AoaCell[][] {
  const rows: SheetRow[] = [];
  for (const cn of creditNotes) {
    const cust = custMap.get(cn.customerId);
    if (cust?.gstin) continue;
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
    'Summary For CDNUR(9B)',
    CDNUR_HEADERS,
    rows,
    ['Summary For CDNUR(9B)', 'No. of Notes', '', 'Total Note Value', '', 'Total Taxable Value', 'Total Cess'],
    ['', '=COUNTA(B5:B1048576)', '', '=SUM(F5:F1048576)', '', '=SUM(I5:I1048576)', '=SUM(J5:J1048576)'],
  );
}

// ─── Sheet 10: cdnura (Amended CDNUR – empty) ─────────────────────────────

const CDNURA_HEADERS = [
  'UR Type', 'Original Note Number', 'Original Note Date',
  'Revised Note Number', 'Revised Note Date', 'Note Type', 'Place Of Supply',
  'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
];

function buildCDNURASheet(): AoaCell[][] {
  return emptySheet(
    'Summary For CDNURA',
    CDNURA_HEADERS,
    ['Summary For CDNURA', 'Original details', '', '', 'Revised details'],
    ['', '', '', '', ''],
  );
}

// ─── Sheet 11: exp ────────────────────────────────────────────────────────

const EXP_HEADERS = [
  'Export Type', 'Invoice Number', 'Invoice Date', 'Invoice Value',
  'Port Code', 'Shipping Bill Number', 'Shipping Bill Date',
  'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
];

function buildEXPSheet(
  invoices: Invoice[], custMap: Map<string, Customer>, profileState: string,
): AoaCell[][] {
  const rows: SheetRow[] = [];
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const st = resolveSupplyType(inv, cust, profileState);
    if (st !== 'EXPWP' && st !== 'EXPWOP') continue;
    for (const item of inv.items) {
      rows.push([
        st === 'EXPWP' ? 'WPAY' : 'WOPAY',
        inv.invoiceNumber, fmtDate(inv.date), r2(inv.totalAmount),
        inv.portCode || '', inv.shippingBillNo || '',
        inv.shippingBillDate ? fmtDate(inv.shippingBillDate) : '',
        st === 'EXPWP' ? 'Applicable' : 'Not Applicable',
        item.gstRate, r2(item.quantity * item.rate), 0,
      ]);
    }
  }
  return buildSheet(
    'Summary For EXP(6)',
    EXP_HEADERS,
    rows,
    ['Summary For EXP(6)', 'No. of Invoices', '', 'Total Invoice Value', '', 'Total Taxable Value', 'Total Cess'],
    ['', '=COUNTA(B5:B1048576)', '', '=SUM(D5:D1048576)', '', '=SUM(J5:J1048576)', '=SUM(K5:K1048576)'],
  );
}

// ─── Sheet 12: expa (Amended Export – empty) ──────────────────────────────

const EXPA_HEADERS = [
  'Export Type', 'Original Invoice Number', 'Original Invoice date',
  'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value',
  'Port Code', 'Shipping Bill Number', 'Shipping Bill Date',
  'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount',
];

function buildEXPASheet(): AoaCell[][] {
  return emptySheet(
    'Summary For EXPA',
    EXPA_HEADERS,
    ['Summary For EXPA', 'Original details', '', '', 'Revised details'],
    ['', '', '', '', ''],
  );
}

// ─── Sheet 13: at ─────────────────────────────────────────────────────────

const AT_HEADERS = ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Received', 'Cess Amount'];

function buildATSheet(): AoaCell[][] {
  return emptySheet(
    'Summary For Advance Received (11B)',
    AT_HEADERS,
    ['Summary For Advance Received (11B)', 'No. of Records', '', 'Total Advance Received', 'Total Cess'],
    ['', '=COUNTA(A5:A1048576)', '', '=SUM(D5:D1048576)', '=SUM(E5:E1048576)'],
  );
}

// ─── Sheet 14: ata (Amended Advance Received – empty) ─────────────────────

const ATA_HEADERS = ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Received', 'Cess Amount', 'Original Month', 'Original Year'];

function buildATASheet(): AoaCell[][] {
  return emptySheet(
    'Summary For Amended Tax Liability(Advance Received)',
    ATA_HEADERS,
    ['Summary For Amended Tax Liability(Advance Received)', 'Original details', '', '', 'Revised details'],
    ['', '', '', '', ''],
  );
}

// ─── Sheet 15: atadj ──────────────────────────────────────────────────────

const ATADJ_HEADERS = ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Adjusted', 'Cess Amount'];

function buildATADJSheet(): AoaCell[][] {
  return emptySheet(
    'Summary For Advance Adjusted (11B)',
    ATADJ_HEADERS,
    ['Summary For Advance Adjusted (11B)', 'No. of Records', '', 'Total Advance Adjusted', 'Total Cess'],
    ['', '=COUNTA(A5:A1048576)', '', '=SUM(D5:D1048576)', '=SUM(E5:E1048576)'],
  );
}

// ─── Sheet 16: atadja (Amended Advance Adjusted – empty) ──────────────────

const ATADJA_HEADERS = ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Adjusted', 'Cess Amount', 'Original Month', 'Original Year'];

function buildATADJASheet(): AoaCell[][] {
  return emptySheet(
    'Summary For Amendement Of Adjustment Advances',
    ATADJA_HEADERS,
    ['Summary For Amendement Of Adjustment Advances', 'Original details', '', '', 'Revised details'],
    ['', '', '', '', ''],
  );
}

// ─── Sheet 17: exemp ──────────────────────────────────────────────────────

const EXEMP_HEADERS = [
  'Description', 'Nil Rated Supplies',
  'Exempted (other than nil rated/non GST supply)', 'Non-GST Supplies',
];

function buildEXEMPSheet(
  invoices: Invoice[], custMap: Map<string, Customer>, profileState: string,
): AoaCell[][] {
  let interRegNil = 0, interUnregNil = 0, intraRegNil = 0, intraUnregNil = 0;
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const isReg = !!(cust?.gstin);
    const isInter = inv.gstType === GSTType.IGST;
    const nilValue = inv.items.filter(i => i.gstRate === 0).reduce((s, i) => s + r2(i.quantity * i.rate), 0);
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
    'Summary For Nil rated, exempted and non GST outward supplies (8)',
    EXEMP_HEADERS,
    rows,
    ['Summary For Nil rated, exempted and non GST outward supplies (8)', 'Total Nil Rated', 'Total Exempted', 'Total Non-GST'],
    ['', '=SUM(B5:B1048576)', '=SUM(C5:C1048576)', '=SUM(D5:D1048576)'],
  );
}

// ─── Sheets 18 & 19: hsn(b2b) and hsn(b2c) ───────────────────────────────
// hsn(b2b) = HSN summary for supplies to registered parties
// hsn(b2c) = HSN summary for supplies to unregistered parties

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

function buildHSNSheets(
  invoices: Invoice[], creditNotes: CreditNote[], debitNotes: DebitNote[],
  custMap: Map<string, Customer>, profile: BusinessProfile,
): { b2b: AoaCell[][]; b2c: AoaCell[][] } {
  const minDigits = minHsnDigits(profile);
  const b2bAgg: Map<string, HsnAgg> = new Map();
  const b2cAgg: Map<string, HsnAgg> = new Map();

  const addItems = (
    items: { hsnCode?: string; description: string; quantity: number; rate: number; gstRate: number }[],
    gstType: GSTType,
    isRegistered: boolean,
    mult: 1 | -1,
  ) => {
    const agg = isRegistered ? b2bAgg : b2cAgg;
    for (const item of items) {
      const hsn = (item.hsnCode || '').trim();
      if (hsn.length < minDigits) continue;
      const txval = r2(item.quantity * item.rate);
      const tax   = r2(txval * item.gstRate / 100);
      const isIgst = gstType === GSTType.IGST;
      const ex = agg.get(hsn) || { description: item.description, qty: 0, totalValue: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      agg.set(hsn, {
        description: ex.description || item.description,
        qty:        ex.qty        + mult * item.quantity,
        totalValue: ex.totalValue + mult * r2(txval + tax),
        taxable:    ex.taxable    + mult * txval,
        igst:       ex.igst       + (isIgst  ? mult * tax        : 0),
        cgst:       ex.cgst       + (!isIgst ? mult * r2(tax / 2) : 0),
        sgst:       ex.sgst       + (!isIgst ? mult * r2(tax / 2) : 0),
      });
    }
  };

  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    addItems(inv.items, inv.gstType, !!(cust?.gstin), 1);
  }
  for (const cn of creditNotes) {
    const cust = custMap.get(cn.customerId);
    addItems(cn.items, cn.gstType, !!(cust?.gstin), -1);
  }
  for (const dn of debitNotes) {
    const cust = custMap.get(dn.customerId);
    addItems(dn.items, dn.gstType, !!(cust?.gstin), 1);
  }

  const toRows = (agg: Map<string, HsnAgg>): SheetRow[] =>
    Array.from(agg.entries()).map(([hsn, d]) => [
      hsn, d.description, 'NOS',
      r2(d.qty), r2(d.totalValue), r2(d.taxable),
      r2(d.igst), r2(d.cgst), r2(d.sgst), 0,
    ]);

  const summaryLabels = ['Summary For HSN(12)', 'No. of HSN Codes', '', 'Total Taxable Value', 'Total Tax'];
  const summaryFormulas = [
    '', '=COUNTA(A5:A1048576)', '',
    '=SUM(F5:F1048576)',
    '=SUM(G5:G1048576)+SUM(H5:H1048576)+SUM(I5:I1048576)',
  ];

  return {
    b2b: buildSheet('Summary For HSN(12)', HSN_HEADERS, toRows(b2bAgg), summaryLabels, summaryFormulas),
    b2c: buildSheet('Summary For HSN(12)', HSN_HEADERS, toRows(b2cAgg), summaryLabels, summaryFormulas),
  };
}

// ─── Sheet 20: docs ───────────────────────────────────────────────────────

const DOCS_HEADERS = ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'];

function buildDOCSSheet(
  invoices: Invoice[], creditNotes: CreditNote[], debitNotes: DebitNote[],
): AoaCell[][] {
  const invNos = invoices.map(i => i.invoiceNumber).sort();
  const cnNos  = creditNotes.map(n => n.noteNumber).sort();
  const dnNos  = debitNotes.map(n => n.noteNumber).sort();
  const rows: SheetRow[] = [
    ['Invoices for outward supply',                             invNos[0] || '', invNos[invNos.length - 1] || '', invoices.length,    0],
    ['Invoices for inward supply from unregistered person',    '', '', 0, 0],
    ['Revised Invoice',                                        '', '', 0, 0],
    ['Debit Note',                                             dnNos[0] || '', dnNos[dnNos.length - 1] || '', debitNotes.length,  0],
    ['Credit Note',                                            cnNos[0] || '', cnNos[cnNos.length - 1] || '', creditNotes.length, 0],
    ['Advance Receipt',                                        '', '', 0, 0],
    ['Payment Voucher',                                        '', '', 0, 0],
    ['Refund Voucher',                                         '', '', 0, 0],
    ['Delivery Challan for job work',                          '', '', 0, 0],
  ];
  return buildSheet(
    'Summary of documents issued during the tax period (13)',
    DOCS_HEADERS,
    rows,
    ['Summary of documents issued during the tax period (13)', 'Total Documents Issued', 'Total Cancelled'],
    ['', '=SUM(D5:D1048576)', '=SUM(E5:E1048576)'],
  );
}

// ─── Sheet 21: eco (E-Commerce Operator – empty) ──────────────────────────

const ECO_HEADERS = [
  'GSTIN of E-Commerce Operator',
  'Net Value of Supplies',
  'Net Value of Supplies returned',
  'Tax Payable on Supplies returned',
  'Net Value of Services through ECO liable to tax on registered person',
  'Tax Payable on such Services where liability shifted to ECO',
];

function buildECOSheet(): AoaCell[][] {
  return emptySheet(
    'Summary For Supplies through ECO-14',
    ECO_HEADERS,
    ['Summary For Supplies through ECO-14', 'No. of ECO GSTINs', '', 'Total Net Value of Supplies', 'Total Tax Payable'],
    ['', '=COUNTA(A5:A1048576)', '', '=SUM(B5:B1048576)', '=SUM(D5:D1048576)'],
  );
}

// ─── Excel Workbook Assembly ───────────────────────────────────────────────

function aoa_to_sheet(data: AoaCell[][]): XLSX.WorkSheet {
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
  const { profile, invoices, customers, creditNotes, debitNotes } = data;
  const custMap = buildCustomerMap(customers);
  const profileState = profile.state;

  const hsnSheets = buildHSNSheets(invoices, creditNotes, debitNotes, custMap, profile);

  const sheets: { name: string; aoa: AoaCell[][] }[] = [
    { name: 'b2b,sez,de', aoa: buildB2BSEZDESheet(invoices, custMap, profileState, data.fp) },
    { name: 'b2ba',       aoa: buildB2BASheet() },
    { name: 'b2cl',       aoa: buildB2CLSheet(invoices, custMap, profileState) },
    { name: 'b2cla',      aoa: buildB2CLASheet() },
    { name: 'b2cs',       aoa: buildB2CSSheet(invoices, custMap, profileState) },
    { name: 'b2csa',      aoa: buildB2CSASheet() },
    { name: 'cdnr',       aoa: buildCDNRSheet(creditNotes, debitNotes, custMap, profileState) },
    { name: 'cdnra',      aoa: buildCDNRASheet() },
    { name: 'cdnur',      aoa: buildCDNURSheet(creditNotes, debitNotes, custMap, profileState) },
    { name: 'cdnura',     aoa: buildCDNURASheet() },
    { name: 'exp',        aoa: buildEXPSheet(invoices, custMap, profileState) },
    { name: 'expa',       aoa: buildEXPASheet() },
    { name: 'at',         aoa: buildATSheet() },
    { name: 'ata',        aoa: buildATASheet() },
    { name: 'atadj',      aoa: buildATADJSheet() },
    { name: 'atadja',     aoa: buildATADJASheet() },
    { name: 'exemp',      aoa: buildEXEMPSheet(invoices, custMap, profileState) },
    { name: 'hsn(b2b)',   aoa: hsnSheets.b2b },
    { name: 'hsn(b2c)',   aoa: hsnSheets.b2c },
    { name: 'docs',       aoa: buildDOCSSheet(invoices, creditNotes, debitNotes) },
    { name: 'eco',        aoa: buildECOSheet() },
  ];

  const wb = XLSX.utils.book_new();
  for (const { name, aoa } of sheets) {
    const ws = aoa_to_sheet(aoa);
    if (aoa[3]) ws['!cols'] = aoa[3].map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const wbOut = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
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

  // Helper: build itms array from invoice items
  function buildItms(
    items: Invoice['items'], gstType: GSTType,
  ) {
    return items.map((item, idx) => {
      const txval  = r2(item.quantity * item.rate);
      const tax    = r2(txval * item.gstRate / 100);
      const isIgst = gstType === GSTType.IGST;
      return {
        num: idx + 1,
        itm_det: {
          rt:    item.gstRate,
          txval,
          iamt:  isIgst  ? tax           : 0,
          camt:  !isIgst ? r2(tax / 2)  : 0,
          samt:  !isIgst ? r2(tax / 2)  : 0,
          csamt: 0,
        },
      };
    });
  }

  // ── b2b (Regular B2B only, inv_typ: 'R') ──────────────────────────────
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

  // ── sez (SEZWP / SEZWOP) ──────────────────────────────────────────────
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

  // ── de (Deemed Exports) ────────────────────────────────────────────────
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

  // ── b2cl ──────────────────────────────────────────────────────────────
  const b2clByState = new Map<string, object[]>();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2CL') continue;
    const pos   = stateCode(cust?.state || '');
    const itms  = inv.items.map((item, idx) => ({
      num: idx + 1,
      itm_det: { rt: item.gstRate, txval: r2(item.quantity * item.rate), iamt: r2(item.quantity * item.rate * item.gstRate / 100), csamt: 0 },
    }));
    const invObj = { inum: inv.invoiceNumber, idt: fmtDate(inv.date), val: r2(inv.totalAmount), itms };
    const list = b2clByState.get(pos) || [];
    list.push(invObj);
    b2clByState.set(pos, list);
  }
  const b2cl = Array.from(b2clByState.entries()).map(([pos, inv]) => ({ pos, inv }));

  // ── b2cs ──────────────────────────────────────────────────────────────
  const b2csAgg = new Map<string, { pos: string; typ: string; rt: number; txval: number; iamt: number; csamt: number }>();
  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    if (resolveSupplyType(inv, cust, profileState) !== 'B2CS') continue;
    const pos = stateCode(cust?.state || profileState);
    const typ = inv.gstType === GSTType.IGST ? 'INTER' : 'INTRA';
    for (const item of inv.items) {
      const txval = r2(item.quantity * item.rate);
      const iamt  = inv.gstType === GSTType.IGST ? r2(txval * item.gstRate / 100) : 0;
      const key   = `${pos}||${typ}||${item.gstRate}`;
      const ex    = b2csAgg.get(key) || { pos, typ, rt: item.gstRate, txval: 0, iamt: 0, csamt: 0 };
      b2csAgg.set(key, { ...ex, txval: ex.txval + txval, iamt: ex.iamt + iamt });
    }
  }
  const b2cs = Array.from(b2csAgg.values());

  // ── cdnr ──────────────────────────────────────────────────────────────
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

  // ── cdnur ─────────────────────────────────────────────────────────────
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

  // ── exp ───────────────────────────────────────────────────────────────
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

  // ── exemp ─────────────────────────────────────────────────────────────
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

  // ── hsn ───────────────────────────────────────────────────────────────
  const hsnAgg = new Map<string, HsnAgg>();
  const addToHSN = (
    items: Invoice['items'], gstType: GSTType, mult: 1 | -1,
  ) => {
    for (const item of items) {
      const hsn = (item.hsnCode || '').trim();
      if (hsn.length < minDigits) continue;
      const txval  = r2(item.quantity * item.rate);
      const tax    = r2(txval * item.gstRate / 100);
      const isIgst = gstType === GSTType.IGST;
      const ex = hsnAgg.get(hsn) || { description: item.description, qty: 0, totalValue: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0 };
      hsnAgg.set(hsn, {
        description: ex.description || item.description,
        qty:        ex.qty        + mult * item.quantity,
        totalValue: ex.totalValue + mult * r2(txval + tax),
        taxable:    ex.taxable    + mult * txval,
        igst:       ex.igst       + (isIgst  ? mult * tax        : 0),
        cgst:       ex.cgst       + (!isIgst ? mult * r2(tax / 2) : 0),
        sgst:       ex.sgst       + (!isIgst ? mult * r2(tax / 2) : 0),
      });
    }
  };
  for (const inv of invoices)    addToHSN(inv.items, inv.gstType, 1);
  for (const cn of creditNotes)  addToHSN(cn.items,  cn.gstType,  -1);
  for (const dn of debitNotes)   addToHSN(dn.items,  dn.gstType,  1);
  const hsnData = Array.from(hsnAgg.entries()).map(([hsn_sc, v]) => ({
    hsn_sc, desc: v.description, uqc: 'NOS', qty: r2(v.qty), val: r2(v.totalValue),
    txval: r2(v.taxable), iamt: r2(v.igst), camt: r2(v.cgst), samt: r2(v.sgst), csamt: 0,
  }));

  // ── doc_det ───────────────────────────────────────────────────────────
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
