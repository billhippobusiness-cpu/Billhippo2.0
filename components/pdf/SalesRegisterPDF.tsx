/**
 * SalesRegisterPDF — A4 Landscape sales register for @react-pdf/renderer
 *
 * Columns: # | Date | Invoice No. | Party | GSTIN | Taxable | IGST | CGST | SGST | Total Tax | Total Amt | Status
 * Font: Poppins via local TTF (same as InvoicePDF / LedgerPDF)
 * Orientation: Landscape (A4) for wide table
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
import type { BusinessProfile, Invoice, Customer } from '../../types';

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
const BLUE   = '#4c2de0';
const DARK   = '#1e293b';
const MID    = '#475569';
const LIGHT  = '#94a3b8';
const BORDER = '#e2e8f0';
const ALT    = '#f8fafc';

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Poppins',
    fontSize: 7,
    backgroundColor: '#FFFFFF',
    paddingTop: 30,
    paddingBottom: 50,
    paddingHorizontal: 32,
    color: DARK,
  },

  // Fixed header
  fixedHeader: { marginBottom: 10 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },

  // Logo
  logoImage: { width: 52, height: 52, borderRadius: 6, objectFit: 'contain' },
  logoBox:   { width: 52, height: 52, borderRadius: 6, backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center' },
  logoInit:  { fontSize: 20, fontWeight: 700, color: '#fff' },

  // Business info
  bizBlock: { alignItems: 'flex-end', maxWidth: '60%' },
  bizName:  { fontSize: 13, fontWeight: 700, color: DARK, textAlign: 'right' },
  bizAddr:  { fontSize: 7.5, color: MID, textAlign: 'right', marginTop: 2 },
  bizGst:   { fontSize: 7.5, fontWeight: 700, color: BLUE, textAlign: 'right', marginTop: 1 },

  dividerBlue: { height: 2, backgroundColor: BLUE, borderRadius: 2, marginBottom: 10 },

  titleStrip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  docTitle:   { fontSize: 16, fontWeight: 700, color: DARK },
  docMeta:    { fontSize: 7.5, color: LIGHT },

  // Table header
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BLUE,
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  th: { fontSize: 6.5, fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase' },

  // Table rows
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    borderBottomStyle: 'solid',
  },
  tableRowAlt: { backgroundColor: ALT },
  tableRowTotal: { backgroundColor: DARK },
  td:       { fontSize: 7, color: MID },
  tdDark:   { fontSize: 7, color: DARK, fontWeight: 700 },
  tdWhite:  { fontSize: 7, color: '#fff', fontWeight: 700 },
  tdAmt:    { fontSize: 7, color: DARK, textAlign: 'right' },
  tdAmtW:   { fontSize: 7, color: '#fff', fontWeight: 700, textAlign: 'right' },
  tdStatus: { fontSize: 6, fontWeight: 700 },
  statusPaid:    { color: '#16a34a' },
  statusUnpaid:  { color: '#dc2626' },
  statusPartial: { color: '#d97706' },

  // Column widths (landscape A4 ≈ 810pt usable at 32px padding each side)
  cNum:      { width: '3%' },
  cDate:     { width: '8%' },
  cInvNo:    { width: '11%' },
  cParty:    { width: '16%' },
  cGstin:    { width: '13%' },
  cTaxable:  { width: '9%',  textAlign: 'right' },
  cIgst:     { width: '7%',  textAlign: 'right' },
  cCgst:     { width: '7%',  textAlign: 'right' },
  cSgst:     { width: '7%',  textAlign: 'right' },
  cTax:      { width: '9%',  textAlign: 'right' },
  cTotal:    { width: '10%', textAlign: 'right' },
  cStatus:   { width: '7%',  textAlign: 'center' },

  // Summary strip below table
  summaryRow:  { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 8 },
  summaryCard: { flex: 1, borderRadius: 5, padding: 9, borderWidth: 0.5, borderStyle: 'solid', borderColor: BORDER },
  sumLabel:    { fontSize: 6.5, fontWeight: 700, textTransform: 'uppercase', color: LIGHT, letterSpacing: 0.5, marginBottom: 3 },
  sumValue:    { fontSize: 12, fontWeight: 700, color: DARK },
  sumBlue:     { color: BLUE },

  // Page footer
  pageFooter: {
    position: 'absolute', bottom: 14, left: 32, right: 32,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  pageFooterText: { fontSize: 6.5, color: '#cbd5e1' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SalesRegisterPDFProps {
  profile: BusinessProfile;
  invoices: Invoice[];
  customers: Customer[];
  periodLabel: string;
  logoUrl?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const SalesRegisterPDF: React.FC<SalesRegisterPDFProps> = ({
  profile,
  invoices,
  customers,
  periodLabel,
  logoUrl,
}) => {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const custMap = new Map(customers.map(c => [c.id, c]));
  const sorted  = [...invoices].sort((a, b) => a.date.localeCompare(b.date));

  let sumTaxable = 0, sumIGST = 0, sumCGST = 0, sumSGST = 0, sumTax = 0, sumTotal = 0;
  sorted.forEach(inv => {
    sumTaxable += inv.totalBeforeTax;
    sumIGST    += inv.igst;
    sumCGST    += inv.cgst;
    sumSGST    += inv.sgst;
    sumTax     += inv.cgst + inv.sgst + inv.igst;
    sumTotal   += inv.totalAmount;
  });

  return (
    <Document
      title={`Sales Register — ${periodLabel} — ${profile.name}`}
      author={profile.name}
      creator="BillHippo"
    >
      <Page size="A4" orientation="landscape" style={S.page} wrap>

        {/* ── Fixed header ── */}
        <View fixed style={S.fixedHeader}>
          <View style={S.headerRow}>
            {/* Logo / initial box */}
            <View>
              {logoUrl ? (
                <Image src={logoUrl} style={S.logoImage} />
              ) : (
                <View style={S.logoBox}>
                  <Text style={S.logoInit}>{profile.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>

            {/* Business info */}
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
            <Text style={S.docTitle}>SALES REGISTER</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[S.docMeta, { fontSize: 9, color: MID, fontWeight: 600 }]}>{periodLabel}</Text>
              <Text style={S.docMeta}>Generated: {today}</Text>
            </View>
          </View>

          {/* ── Table header row ── */}
          <View style={S.tableHeader}>
            <Text style={[S.th, S.cNum]}>#</Text>
            <Text style={[S.th, S.cDate]}>Date</Text>
            <Text style={[S.th, S.cInvNo]}>Invoice No.</Text>
            <Text style={[S.th, S.cParty]}>Party Name</Text>
            <Text style={[S.th, S.cGstin]}>GSTIN</Text>
            <Text style={[S.th, S.cTaxable]}>Taxable</Text>
            <Text style={[S.th, S.cIgst]}>IGST</Text>
            <Text style={[S.th, S.cCgst]}>CGST</Text>
            <Text style={[S.th, S.cSgst]}>SGST</Text>
            <Text style={[S.th, S.cTax]}>Total Tax</Text>
            <Text style={[S.th, S.cTotal]}>Total Amt</Text>
            <Text style={[S.th, S.cStatus]}>Status</Text>
          </View>
        </View>

        {/* ── Data rows ── */}
        {sorted.length === 0 ? (
          <View style={[S.tableRow, { justifyContent: 'center', paddingVertical: 20 }]}>
            <Text style={[S.td, { flex: 1, textAlign: 'center', color: LIGHT }]}>
              No invoices for this period.
            </Text>
          </View>
        ) : (
          sorted.map((inv, idx) => {
            const gstin  = custMap.get(inv.customerId)?.gstin ?? '—';
            const tax    = inv.cgst + inv.sgst + inv.igst;
            const isAlt  = idx % 2 === 1;
            const statusStyle =
              inv.status === 'Paid'    ? S.statusPaid :
              inv.status === 'Unpaid'  ? S.statusUnpaid : S.statusPartial;

            return (
              <View
                key={inv.id}
                style={[S.tableRow, isAlt ? S.tableRowAlt : {}]}
                wrap={false}
              >
                <Text style={[S.td, S.cNum]}>{idx + 1}</Text>
                <Text style={[S.td, S.cDate]}>{fmtDate(inv.date)}</Text>
                <Text style={[S.tdDark, S.cInvNo]}>{inv.invoiceNumber}</Text>
                <Text style={[S.td, S.cParty]}>{inv.customerName}</Text>
                <Text style={[S.td, S.cGstin]}>{gstin}</Text>
                <Text style={[S.tdAmt, S.cTaxable]}>{inr(inv.totalBeforeTax)}</Text>
                <Text style={[S.tdAmt, S.cIgst]}>{inv.igst > 0 ? inr(inv.igst) : '—'}</Text>
                <Text style={[S.tdAmt, S.cCgst]}>{inv.cgst > 0 ? inr(inv.cgst) : '—'}</Text>
                <Text style={[S.tdAmt, S.cSgst]}>{inv.sgst > 0 ? inr(inv.sgst) : '—'}</Text>
                <Text style={[S.tdAmt, S.cTax]}>{inr(tax)}</Text>
                <Text style={[S.tdAmt, S.cTotal, { fontWeight: 700, color: DARK }]}>{inr(inv.totalAmount)}</Text>
                <Text style={[S.tdStatus, S.cStatus, statusStyle]}>{inv.status}</Text>
              </View>
            );
          })
        )}

        {/* ── Totals row ── */}
        {sorted.length > 0 && (
          <View style={[S.tableRow, S.tableRowTotal]} wrap={false}>
            <Text style={[S.tdWhite, S.cNum]}></Text>
            <Text style={[S.tdWhite, S.cDate]}></Text>
            <Text style={[S.tdWhite, S.cInvNo]}></Text>
            <Text style={[S.tdWhite, S.cParty]}>TOTAL ({sorted.length} invoices)</Text>
            <Text style={[S.tdWhite, S.cGstin]}></Text>
            <Text style={[S.tdAmtW, S.cTaxable]}>{inr(sumTaxable)}</Text>
            <Text style={[S.tdAmtW, S.cIgst]}>{sumIGST > 0 ? inr(sumIGST) : '—'}</Text>
            <Text style={[S.tdAmtW, S.cCgst]}>{sumCGST > 0 ? inr(sumCGST) : '—'}</Text>
            <Text style={[S.tdAmtW, S.cSgst]}>{sumSGST > 0 ? inr(sumSGST) : '—'}</Text>
            <Text style={[S.tdAmtW, S.cTax]}>{inr(sumTax)}</Text>
            <Text style={[S.tdAmtW, S.cTotal]}>{inr(sumTotal)}</Text>
            <Text style={[S.tdWhite, S.cStatus]}></Text>
          </View>
        )}

        {/* ── Summary cards ── */}
        <View style={S.summaryRow} wrap={false}>
          <View style={S.summaryCard}>
            <Text style={S.sumLabel}>Total Invoices</Text>
            <Text style={S.sumValue}>{sorted.length}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={S.sumLabel}>Total Sales</Text>
            <Text style={[S.sumValue, S.sumBlue]}>{inr(sumTotal)}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={S.sumLabel}>Total Taxable Value</Text>
            <Text style={S.sumValue}>{inr(sumTaxable)}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={S.sumLabel}>Total GST Collected</Text>
            <Text style={[S.sumValue, { color: '#16a34a' }]}>{inr(sumTax)}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={S.sumLabel}>IGST</Text>
            <Text style={S.sumValue}>{inr(sumIGST)}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={S.sumLabel}>CGST + SGST</Text>
            <Text style={S.sumValue}>{inr(sumCGST + sumSGST)}</Text>
          </View>
        </View>

        {/* ── Fixed page footer ── */}
        <View style={S.pageFooter} fixed>
          <Text style={S.pageFooterText}>
            Generated by BillHippo  |  {today}  |  {periodLabel}
          </Text>
          <Text
            style={S.pageFooterText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  );
};

export default SalesRegisterPDF;
