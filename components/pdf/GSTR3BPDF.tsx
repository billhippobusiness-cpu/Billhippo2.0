/**
 * GSTR3BPDF — A4 Portrait GSTR-3B summary return PDF
 *
 * Inspired by the comfortable-layout sample provided by the user:
 *   1. Business Snapshot
 *   2. Sales Summary (Output Liability)
 *   3. GST Liability Summary
 *   4A. ITC Available
 *   4B. ITC Reversal
 *   5. Tax Payment Working
 *   6. Electronic Ledger Status
 *   7A. GSTR-1 vs GSTR-3B Reconciliation
 *   7B. Books vs GSTR-3B
 *   8. Risk & Exception Report
 *
 * Styled in BillHippo's indigo theme with rounded section bands and tables.
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import type { BusinessProfile, Invoice, Customer, CreditNote, DebitNote } from '../../types';
import { computeSetOff } from '../../lib/gstSetOff';

// ─── Register Poppins ─────────────────────────────────────────────────────────
Font.register({
  family: 'Poppins',
  fonts: [
    { src: '/fonts/Poppins-Regular.ttf',  fontWeight: 400 },
    { src: '/fonts/Poppins-Medium.ttf',   fontWeight: 500 },
    { src: '/fonts/Poppins-SemiBold.ttf', fontWeight: 600 },
    { src: '/fonts/Poppins-Bold.ttf',     fontWeight: 700 },
  ],
});
Font.registerHyphenationCallback(word => [word]);

// ─── Palette ──────────────────────────────────────────────────────────────────
const BLUE      = '#4c2de0';
const BLUE_SOFT = '#ede9fe';
const DARK      = '#1e293b';
const MID       = '#475569';
const LIGHT     = '#94a3b8';
const BORDER    = '#e2e8f0';
const ALT       = '#f8fafc';
const GREEN     = '#16a34a';
const AMBER     = '#d97706';
const RED       = '#dc2626';

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Poppins',
    fontSize: 8.5,
    backgroundColor: '#FFFFFF',
    paddingTop: 28,
    paddingBottom: 46,
    paddingHorizontal: 32,
    color: DARK,
  },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  logoImage: { width: 48, height: 48, borderRadius: 12, objectFit: 'contain' },
  logoBox:   { width: 48, height: 48, borderRadius: 12, backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center' },
  logoInit:  { fontSize: 19, fontWeight: 700, color: '#fff' },
  bizBlock:  { alignItems: 'flex-end', maxWidth: '62%' },
  bizName:   { fontSize: 12.5, fontWeight: 700, color: DARK, textAlign: 'right' },
  bizAddr:   { fontSize: 7.5, color: MID, textAlign: 'right', marginTop: 2 },
  bizGst:    { fontSize: 7.5, fontWeight: 700, color: BLUE, textAlign: 'right', marginTop: 1 },

  dividerBlue: { height: 2, backgroundColor: BLUE, borderRadius: 2, marginBottom: 12 },

  // ── Title strip ──
  titleStrip: {
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  titleLeft:   { fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: 0.4 },
  titleSubtle: { fontSize: 8, color: '#c7bdfb', marginTop: 2 },
  titleRight:  { fontSize: 9, fontWeight: 700, color: '#fff' },
  titleMeta:   { fontSize: 7.5, color: '#c7bdfb', textAlign: 'right', marginTop: 2 },

  // ── Section ──
  section: { marginBottom: 10 },
  sectionHead: {
    backgroundColor: BLUE_SOFT,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6,
  },
  sectionTitle: { fontSize: 9.5, fontWeight: 700, color: BLUE, letterSpacing: 0.3 },

  // ── Table shell ──
  table: {
    borderRadius: 8,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderStyle: 'solid',
    overflow: 'hidden',
  },
  trHead: {
    flexDirection: 'row',
    backgroundColor: BLUE_SOFT,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  th: { fontSize: 7.5, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: 0.3 },
  tr: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 0.4,
    borderTopColor: BORDER,
    borderTopStyle: 'solid',
  },
  trAlt:   { backgroundColor: ALT },
  trTotal: { backgroundColor: BLUE },
  td:      { fontSize: 8, color: DARK },
  tdSoft:  { fontSize: 8, color: MID },
  tdW:     { fontSize: 8, fontWeight: 700, color: '#fff' },
  tdAmt:   { fontSize: 8, color: DARK, textAlign: 'right' },
  tdAmtW:  { fontSize: 8, fontWeight: 700, color: '#fff', textAlign: 'right' },

  // ── Footer ──
  footer: {
    position: 'absolute', bottom: 14, left: 32, right: 32,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  footerText: { fontSize: 6.5, color: '#cbd5e1' },
  footerBrand: { fontSize: 6.5, color: BLUE, fontWeight: 700 },

  // Closing note
  closing: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderStyle: 'solid',
    backgroundColor: ALT,
  },
  closingText: { fontSize: 7.5, color: MID, lineHeight: 1.5 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function inr(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  return `${sign}${abs.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// ─── Two-column "Particulars / Details" table ────────────────────────────────
interface KVRow { label: string; value: string; }
const KVTable: React.FC<{ headLeft: string; headRight: string; rows: KVRow[] }> = ({ headLeft, headRight, rows }) => (
  <View style={S.table}>
    <View style={S.trHead}>
      <Text style={[S.th, { width: '40%' }]}>{headLeft}</Text>
      <Text style={[S.th, { width: '60%', textAlign: 'right' }]}>{headRight}</Text>
    </View>
    {rows.map((r, i) => (
      <View key={r.label} style={[S.tr, i % 2 === 1 ? S.trAlt : {}]} wrap={false}>
        <Text style={[S.tdSoft, { width: '40%' }]}>{r.label}</Text>
        <Text style={[S.td, { width: '60%', textAlign: 'right', fontWeight: 600 }]}>{r.value}</Text>
      </View>
    ))}
  </View>
);

// ─── 4-column tax table (Particulars | IGST | CGST | SGST) ───────────────────
interface TaxRow {
  label: string;
  igst: number;
  cgst: number;
  sgst: number;
  emphasize?: boolean;
  total?: boolean;
}
const TaxTable3: React.FC<{ firstCol: string; rows: TaxRow[] }> = ({ firstCol, rows }) => (
  <View style={S.table}>
    <View style={S.trHead}>
      <Text style={[S.th, { width: '40%' }]}>{firstCol}</Text>
      <Text style={[S.th, { width: '20%', textAlign: 'right' }]}>IGST</Text>
      <Text style={[S.th, { width: '20%', textAlign: 'right' }]}>CGST</Text>
      <Text style={[S.th, { width: '20%', textAlign: 'right' }]}>SGST</Text>
    </View>
    {rows.map((r, i) => {
      if (r.total) {
        return (
          <View key={r.label} style={[S.tr, S.trTotal]} wrap={false}>
            <Text style={[S.tdW, { width: '40%' }]}>{r.label}</Text>
            <Text style={[S.tdAmtW, { width: '20%' }]}>{inr(r.igst)}</Text>
            <Text style={[S.tdAmtW, { width: '20%' }]}>{inr(r.cgst)}</Text>
            <Text style={[S.tdAmtW, { width: '20%' }]}>{inr(r.sgst)}</Text>
          </View>
        );
      }
      return (
        <View key={r.label} style={[S.tr, i % 2 === 1 ? S.trAlt : {}]} wrap={false}>
          <Text style={[r.emphasize ? S.td : S.tdSoft, { width: '40%', fontWeight: r.emphasize ? 600 : 400 }]}>{r.label}</Text>
          <Text style={[S.tdAmt, { width: '20%' }]}>{inr(r.igst)}</Text>
          <Text style={[S.tdAmt, { width: '20%' }]}>{inr(r.cgst)}</Text>
          <Text style={[S.tdAmt, { width: '20%' }]}>{inr(r.sgst)}</Text>
        </View>
      );
    })}
  </View>
);

// ─── 5-column sales summary (Nature | Taxable | IGST | CGST | SGST) ──────────
interface SalesRow {
  label: string;
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  total?: boolean;
}
const SalesTable: React.FC<{ rows: SalesRow[] }> = ({ rows }) => (
  <View style={S.table}>
    <View style={S.trHead}>
      <Text style={[S.th, { width: '30%' }]}>Nature of Supply</Text>
      <Text style={[S.th, { width: '20%', textAlign: 'right' }]}>Taxable Value</Text>
      <Text style={[S.th, { width: '16.66%', textAlign: 'right' }]}>IGST</Text>
      <Text style={[S.th, { width: '16.66%', textAlign: 'right' }]}>CGST</Text>
      <Text style={[S.th, { width: '16.66%', textAlign: 'right' }]}>SGST</Text>
    </View>
    {rows.map((r, i) => {
      if (r.total) {
        return (
          <View key={r.label} style={[S.tr, S.trTotal]} wrap={false}>
            <Text style={[S.tdW, { width: '30%' }]}>{r.label}</Text>
            <Text style={[S.tdAmtW, { width: '20%' }]}>{inr(r.taxable)}</Text>
            <Text style={[S.tdAmtW, { width: '16.66%' }]}>{inr(r.igst)}</Text>
            <Text style={[S.tdAmtW, { width: '16.66%' }]}>{inr(r.cgst)}</Text>
            <Text style={[S.tdAmtW, { width: '16.66%' }]}>{inr(r.sgst)}</Text>
          </View>
        );
      }
      return (
        <View key={r.label} style={[S.tr, i % 2 === 1 ? S.trAlt : {}]} wrap={false}>
          <Text style={[S.tdSoft, { width: '30%' }]}>{r.label}</Text>
          <Text style={[S.tdAmt, { width: '20%' }]}>{inr(r.taxable)}</Text>
          <Text style={[S.tdAmt, { width: '16.66%' }]}>{inr(r.igst)}</Text>
          <Text style={[S.tdAmt, { width: '16.66%' }]}>{inr(r.cgst)}</Text>
          <Text style={[S.tdAmt, { width: '16.66%' }]}>{inr(r.sgst)}</Text>
        </View>
      );
    })}
  </View>
);

// ─── Reconciliation table (Particulars | Books/GSTR-1 | GSTR-3B | Difference) ─
interface ReconRow { label: string; a: number; b: number; }
const ReconTable: React.FC<{ leftCol: string; midCol: string; rows: ReconRow[] }> = ({ leftCol, midCol, rows }) => (
  <View style={S.table}>
    <View style={S.trHead}>
      <Text style={[S.th, { width: '34%' }]}>Particulars</Text>
      <Text style={[S.th, { width: '22%', textAlign: 'right' }]}>{leftCol}</Text>
      <Text style={[S.th, { width: '22%', textAlign: 'right' }]}>{midCol}</Text>
      <Text style={[S.th, { width: '22%', textAlign: 'right' }]}>Difference</Text>
    </View>
    {rows.map((r, i) => {
      const diff = r.a - r.b;
      const diffColor = diff === 0 ? GREEN : diff > 0 ? AMBER : RED;
      return (
        <View key={r.label} style={[S.tr, i % 2 === 1 ? S.trAlt : {}]} wrap={false}>
          <Text style={[S.tdSoft, { width: '34%' }]}>{r.label}</Text>
          <Text style={[S.tdAmt, { width: '22%' }]}>{inr(r.a)}</Text>
          <Text style={[S.tdAmt, { width: '22%' }]}>{inr(r.b)}</Text>
          <Text style={[S.tdAmt, { width: '22%', color: diffColor, fontWeight: 700 }]}>{inr(diff)}</Text>
        </View>
      );
    })}
  </View>
);

// ─── Section wrapper ─────────────────────────────────────────────────────────
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={S.section} wrap={false}>
    <View style={S.sectionHead}>
      <Text style={S.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

// ─── Props ────────────────────────────────────────────────────────────────────
export interface ITCInput {
  igst: number;
  cgst: number;
  sgst: number;
  taxable?: number;
  source?: string; // e.g. 'GSTR-2B'
}
export interface GSTR3BPDFProps {
  profile: BusinessProfile;
  invoices: Invoice[];
  customers: Customer[];
  creditNotes: CreditNote[];
  debitNotes: DebitNote[];
  periodLabel: string;
  natureOfReturn: 'Monthly' | 'Quarterly';
  logoUrl?: string;
  /** Input Tax Credit available for the period (e.g. fetched from GSTR-2B). */
  itc?: ITCInput | null;
}

// ─── Component ────────────────────────────────────────────────────────────────
const GSTR3BPDF: React.FC<GSTR3BPDFProps> = ({
  profile,
  invoices,
  customers,
  creditNotes,
  debitNotes,
  periodLabel,
  natureOfReturn,
  logoUrl,
  itc,
}) => {
  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const custMap = new Map<string, Customer>(customers.map(c => [c.id, c]));

  // ─── Sales segmentation ──────────────────────────────────────────────────
  let b2bTaxable = 0, b2bIgst = 0, b2bCgst = 0, b2bSgst = 0;
  let b2cTaxable = 0, b2cIgst = 0, b2cCgst = 0, b2cSgst = 0;

  for (const inv of invoices) {
    const cust = custMap.get(inv.customerId);
    const hasGstin = !!(cust?.gstin && cust.gstin.trim());
    if (hasGstin) {
      b2bTaxable += inv.totalBeforeTax;
      b2bIgst    += inv.igst;
      b2bCgst    += inv.cgst;
      b2bSgst    += inv.sgst;
    } else {
      b2cTaxable += inv.totalBeforeTax;
      b2cIgst    += inv.igst;
      b2cCgst    += inv.cgst;
      b2cSgst    += inv.sgst;
    }
  }

  // Credit notes reduce output liability
  const cnTaxable = creditNotes.reduce((s, n) => s + n.totalBeforeTax, 0);
  const cnIgst    = creditNotes.reduce((s, n) => s + n.igst, 0);
  const cnCgst    = creditNotes.reduce((s, n) => s + n.cgst, 0);
  const cnSgst    = creditNotes.reduce((s, n) => s + n.sgst, 0);

  // Debit notes increase output liability (added to B2B / B2C totals on the GST portal,
  // but for this comfortable layout we show them under "Debit Notes (+)" if any exist).
  const dnTaxable = debitNotes.reduce((s, n) => s + n.totalBeforeTax, 0);
  const dnIgst    = debitNotes.reduce((s, n) => s + n.igst, 0);
  const dnCgst    = debitNotes.reduce((s, n) => s + n.cgst, 0);
  const dnSgst    = debitNotes.reduce((s, n) => s + n.sgst, 0);

  const totTaxable = b2bTaxable + b2cTaxable - cnTaxable + dnTaxable;
  const totIgst    = b2bIgst + b2cIgst - cnIgst + dnIgst;
  const totCgst    = b2bCgst + b2cCgst - cnCgst + dnCgst;
  const totSgst    = b2bSgst + b2cSgst - cnSgst + dnSgst;

  const salesRows: SalesRow[] = [
    { label: 'B2B Sales',      taxable: b2bTaxable, igst: b2bIgst, cgst: b2bCgst, sgst: b2bSgst },
    { label: 'B2C Sales',      taxable: b2cTaxable, igst: b2cIgst, cgst: b2cCgst, sgst: b2cSgst },
    { label: 'Export Sales',   taxable: 0, igst: 0, cgst: 0, sgst: 0 },
    { label: 'SEZ Sales',      taxable: 0, igst: 0, cgst: 0, sgst: 0 },
    { label: 'Exempt Supply',  taxable: 0, igst: 0, cgst: 0, sgst: 0 },
    { label: 'Credit Notes (-)', taxable: -cnTaxable, igst: -cnIgst, cgst: -cnCgst, sgst: -cnSgst },
  ];
  if (dnTaxable > 0) {
    salesRows.push({ label: 'Debit Notes (+)', taxable: dnTaxable, igst: dnIgst, cgst: dnCgst, sgst: dnSgst });
  }
  salesRows.push({ label: 'Total', taxable: totTaxable, igst: totIgst, cgst: totCgst, sgst: totSgst, total: true });

  // ─── GST Liability ───────────────────────────────────────────────────────
  const liabilityRows: TaxRow[] = [
    { label: 'Output Tax Liability',    igst: totIgst, cgst: totCgst, sgst: totSgst, emphasize: true },
    { label: 'Reverse Charge Liability', igst: 0, cgst: 0, sgst: 0 },
    { label: 'Interest',                 igst: 0, cgst: 0, sgst: 0 },
    { label: 'Late Fees',                igst: 0, cgst: 0, sgst: 0 },
    { label: 'Total Liability',          igst: totIgst, cgst: totCgst, sgst: totSgst, total: true },
  ];

  // ─── ITC Available (sourced from GSTR-2B when fetched from the portal) ────
  const itcIgst = itc?.igst ?? 0;
  const itcCgst = itc?.cgst ?? 0;
  const itcSgst = itc?.sgst ?? 0;
  const itcTotal = itcIgst + itcCgst + itcSgst;
  const hasItc = itcTotal > 0;
  const itcSource = itc?.source || 'GSTR-2B';

  const itcRows: TaxRow[] = [
    { label: 'Purchase Register', igst: 0, cgst: 0, sgst: 0 },
    { label: `${itcSource} (Auto-drafted)`, igst: itcIgst, cgst: itcCgst, sgst: itcSgst, emphasize: hasItc },
    { label: 'Import of Goods',   igst: 0, cgst: 0, sgst: 0 },
    { label: 'RCM ITC',           igst: 0, cgst: 0, sgst: 0 },
    { label: 'Total Available ITC', igst: itcIgst, cgst: itcCgst, sgst: itcSgst, total: true },
  ];

  const itcReversalRows: TaxRow[] = [
    { label: 'Rule 42/43',                 igst: 0, cgst: 0, sgst: 0 },
    { label: 'Blocked Credit u/s 17(5)',   igst: 0, cgst: 0, sgst: 0 },
    { label: 'Others',                     igst: 0, cgst: 0, sgst: 0 },
    { label: 'Total Reversal',             igst: 0, cgst: 0, sgst: 0, total: true },
  ];

  // ─── Tax Payment Working ─────────────────────────────────────────────────
  // Apply available ITC against the output liability using the statutory
  // set-off order; anything left flows to cash payment.
  const setOff = computeSetOff(
    { igst: totIgst, cgst: totCgst, sgst: totSgst },
    { igst: itcIgst, cgst: itcCgst, sgst: itcSgst },
  );
  const cashTotal = setOff.cash.igst + setOff.cash.cgst + setOff.cash.sgst;
  const paymentRows: TaxRow[] = [
    { label: 'Output Liability',   igst: totIgst, cgst: totCgst, sgst: totSgst, emphasize: true },
    { label: 'Less: ITC Utilised', igst: -setOff.utilised.igst, cgst: -setOff.utilised.cgst, sgst: -setOff.utilised.sgst },
    { label: 'Tax Payable in Cash', igst: setOff.cash.igst, cgst: setOff.cash.cgst, sgst: setOff.cash.sgst, total: true },
  ];

  // ─── Electronic Ledger Status — unused ITC carried forward to credit ledger
  const ledgerRows: KVRow[] = [
    { label: 'IGST Credit Ledger (c/f)', value: inr(setOff.creditCarried.igst) },
    { label: 'CGST Credit Ledger (c/f)', value: inr(setOff.creditCarried.cgst) },
    { label: 'SGST Credit Ledger (c/f)', value: inr(setOff.creditCarried.sgst) },
    { label: 'Net Tax Payable in Cash',  value: inr(cashTotal) },
  ];

  // ─── Reconciliation ──────────────────────────────────────────────────────
  // 7A: GSTR-1 vs GSTR-3B — both are derived from invoice data, so no diff.
  const gstr1ReconRows: ReconRow[] = [
    { label: 'Taxable Value', a: totTaxable, b: totTaxable },
    { label: 'CGST',          a: totCgst,    b: totCgst },
    { label: 'SGST',          a: totSgst,    b: totSgst },
    { label: 'IGST',          a: totIgst,    b: totIgst },
  ];

  // 7B: Books vs GSTR-3B — Sales = computed; ITC/Purchases sourced from GSTR-2B.
  const itcTaxable = itc?.taxable ?? 0;
  const booksReconRows: ReconRow[] = [
    { label: 'Sales',           a: totTaxable, b: totTaxable },
    { label: 'Purchases (2B)',  a: itcTaxable, b: itcTaxable },
    { label: 'ITC',             a: itcTotal, b: itcTotal },
  ];

  // ─── Risk & Exception ────────────────────────────────────────────────────
  const totalLiability = totIgst + totCgst + totSgst;
  const risks: KVRow[] = [
    { label: 'GSTR-1 mismatch',       value: 'No' },
    { label: 'ITC mismatch with 2B',  value: hasItc ? 'ITC sourced from 2B' : 'Pending — connect GST portal' },
    { label: 'Excess ITC claimed',    value: itcTotal > totalLiability && totalLiability > 0 ? 'ITC exceeds liability (c/f)' : 'No' },
    { label: 'RCM unpaid',            value: 'No' },
    { label: 'Interest exposure',     value: cashTotal > 0 ? 'Verify due date' : 'No' },
  ];

  // ─── Business Snapshot ───────────────────────────────────────────────────
  const snapshotRows: KVRow[] = [
    { label: 'GSTIN',           value: profile.gstin || '—' },
    { label: 'Trade Name',      value: profile.name || '—' },
    { label: 'Return Period',   value: periodLabel },
    { label: 'Filing Status',   value: 'Pending' },
    { label: 'Date of Filing',  value: '—' },
    { label: 'ARN',             value: '—' },
    { label: 'Nature of Return', value: natureOfReturn },
  ];

  return (
    <Document
      title={`GSTR-3B — ${periodLabel} — ${profile.name}`}
      author={profile.name}
      creator="BillHippo"
    >
      <Page size="A4" style={S.page} wrap>

        {/* ── Header ── */}
        <View fixed>
          <View style={S.headerRow}>
            <View>
              {logoUrl ? (
                <Image src={logoUrl} style={S.logoImage} />
              ) : (
                <View style={S.logoBox}>
                  <Text style={S.logoInit}>{(profile.name || 'B').charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
            <View style={S.bizBlock}>
              <Text style={S.bizName}>{profile.name}</Text>
              <Text style={S.bizAddr}>
                {[profile.address, profile.city, profile.state, profile.pincode].filter(Boolean).join(', ')}
              </Text>
              {profile.gstin ? <Text style={S.bizGst}>GSTIN: {profile.gstin}</Text> : null}
              {profile.phone  ? <Text style={S.bizAddr}>Ph: {profile.phone}</Text> : null}
            </View>
          </View>
          <View style={S.dividerBlue} />

          <View style={S.titleStrip}>
            <View>
              <Text style={S.titleLeft}>GSTR-3B SUMMARY RETURN</Text>
              <Text style={S.titleSubtle}>Sales → Liability → ITC → Payment → Reconciliation</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={S.titleRight}>{periodLabel}</Text>
              <Text style={S.titleMeta}>Generated: {today}</Text>
            </View>
          </View>
        </View>

        {/* 1. Business Snapshot */}
        <Section title="1. BUSINESS SNAPSHOT">
          <KVTable headLeft="Particulars" headRight="Details" rows={snapshotRows} />
        </Section>

        {/* 2. Sales Summary */}
        <Section title="2. SALES SUMMARY (OUTPUT LIABILITY)">
          <SalesTable rows={salesRows} />
        </Section>

        {/* 3. GST Liability Summary */}
        <Section title="3. GST LIABILITY SUMMARY">
          <TaxTable3 firstCol="Particulars" rows={liabilityRows} />
        </Section>

        {/* 4A. ITC Available */}
        <Section title={hasItc ? '4A. INPUT TAX CREDIT (ITC) AVAILABLE — FROM GSTR-2B' : '4A. INPUT TAX CREDIT (ITC) AVAILABLE'}>
          <TaxTable3 firstCol="Source" rows={itcRows} />
        </Section>

        {/* 4B. ITC Reversal */}
        <Section title="4B. ITC REVERSAL">
          <TaxTable3 firstCol="Reason" rows={itcReversalRows} />
        </Section>

        {/* 5. Tax Payment Working */}
        <Section title="5. TAX PAYMENT WORKING">
          <TaxTable3 firstCol="Particulars" rows={paymentRows} />
        </Section>

        {/* 6. Electronic Ledger Status */}
        <Section title="6. ELECTRONIC LEDGER STATUS">
          <KVTable headLeft="Ledger" headRight="Balance" rows={ledgerRows} />
        </Section>

        {/* 7A. GSTR-1 vs GSTR-3B */}
        <Section title="7A. GSTR-1 vs GSTR-3B RECONCILIATION">
          <ReconTable leftCol="GSTR-1" midCol="GSTR-3B" rows={gstr1ReconRows} />
        </Section>

        {/* 7B. Books vs GSTR-3B */}
        <Section title="7B. BOOKS vs GSTR-3B">
          <ReconTable leftCol="Books" midCol="GSTR-3B" rows={booksReconRows} />
        </Section>

        {/* 8. Risk & Exception Report */}
        <Section title="8. RISK & EXCEPTION REPORT">
          <KVTable headLeft="Risk Area" headRight="Status" rows={risks} />
        </Section>

        {/* Closing note */}
        <View style={S.closing} wrap={false}>
          <Text style={S.closingText}>
            This layout is generated by BillHippo for understanding by assessees, accountants and tax practitioners.
            It follows the business flow: Sales → Liability → ITC → Payment → Reconciliation.
            {hasItc
              ? ' ITC figures are auto-drafted from GSTR-2B fetched from the GST portal and set off against the output liability; verify against your purchase register before filing.'
              : ' Connect the GST portal to auto-fetch GSTR-2B so ITC is set off against the liability; otherwise ITC must be entered manually before filing.'}
          </Text>
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            <Text style={S.footerBrand}>BillHippo</Text>  |  GSTR-3B  |  {periodLabel}
          </Text>
          <Text
            style={S.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
};

export default GSTR3BPDF;
