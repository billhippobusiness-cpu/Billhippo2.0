/**
 * QuotationPDF — A4 Quotation template for @react-pdf/renderer
 *
 * Design: Amber/Orange header ("QUOTATION"), clean item table, GST breakdown.
 * Explicitly labelled as NOT a Tax Invoice.
 * Follows the same font/style conventions as InvoicePDF.tsx.
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import { type Quotation, type BusinessProfile, type Customer, GSTType } from '../../types';

// ── Register Poppins ──────────────────────────────────────────────────────────
Font.register({
  family: 'Poppins',
  fonts: [
    { src: '/fonts/Poppins-Regular.ttf',   fontWeight: 400 },
    { src: '/fonts/Poppins-Italic.ttf',    fontWeight: 400, fontStyle: 'italic' },
    { src: '/fonts/Poppins-Medium.ttf',    fontWeight: 500 },
    { src: '/fonts/Poppins-SemiBold.ttf',  fontWeight: 600 },
    { src: '/fonts/Poppins-Bold.ttf',      fontWeight: 700 },
    { src: '/fonts/Poppins-ExtraBold.ttf', fontWeight: 800 },
  ],
});

Font.registerHyphenationCallback(word => [word]);

// ── Palette ───────────────────────────────────────────────────────────────────
const AMBER      = '#f59e0b';   // amber-500
const AMBER_DARK = '#d97706';   // amber-600
const AMBER_BG   = '#fffbeb';   // amber-50
const AMBER_MID  = '#fcd34d';   // amber-300
const DARK       = '#1e293b';
const MID        = '#475569';
const LIGHT      = '#94a3b8';
const BORDER     = '#e2e8f0';
const ALT        = '#f8fafc';
const WHITE      = '#ffffff';

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d: string): string {
  if (!d) return '';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
}

const fmt = (n: number) =>
  `\u20B9${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
    'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
    'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function conv(n: number): string {
    if (n === 0) return '';
    if (n < 20)  return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + conv(n % 100) : '');
    if (n < 100000)   return conv(Math.floor(n / 1000))   + ' Thousand' + (n % 1000   ? ' ' + conv(n % 1000)   : '');
    if (n < 10000000) return conv(Math.floor(n / 100000)) + ' Lakh'     + (n % 100000 ? ' ' + conv(n % 100000) : '');
    return              conv(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + conv(n % 10000000) : '');
  }
  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);
  let result   = conv(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + conv(paise) + ' Paise';
  return result + ' Only';
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Poppins',
    fontWeight: 400,
    fontSize: 9,
    backgroundColor: WHITE,
    paddingTop: 0,
    paddingBottom: 40,
    paddingHorizontal: 0,
    color: DARK,
  },

  // Header
  header: {
    backgroundColor: AMBER,
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerLeft: { flexDirection: 'column', flex: 1 },
  headerRight: { flexDirection: 'column', alignItems: 'flex-end', minWidth: 180 },
  headerBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 8,
    alignSelf: 'flex-end',
  },
  headerBadgeText: {
    fontFamily: 'Poppins', fontWeight: 800,
    fontSize: 13, color: WHITE, letterSpacing: 2,
  },
  headerBusinessName: {
    fontFamily: 'Poppins', fontWeight: 700,
    fontSize: 15, color: WHITE, marginBottom: 3,
  },
  headerSubText: { fontSize: 8, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 },
  headerLabel: { fontSize: 7, color: 'rgba(255,255,255,0.7)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  headerValue: { fontSize: 9, color: WHITE, fontWeight: 600 },

  // Body
  body: { paddingHorizontal: 32, paddingTop: 20 },

  // Info boxes
  infoRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  infoBox: {
    flex: 1, backgroundColor: AMBER_BG, borderRadius: 6, padding: 10,
    borderWidth: 0.5, borderColor: AMBER_MID, borderStyle: 'solid',
  },
  infoBoxLabel: {
    fontSize: 7, fontFamily: 'Poppins', fontWeight: 600, color: AMBER_DARK,
    textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 4,
  },
  infoName: { fontSize: 11, fontFamily: 'Poppins', fontWeight: 700, color: DARK, marginBottom: 2 },
  infoSm:   { fontSize: 7.5, color: MID, lineHeight: 1.5 },

  // Divider
  divider: { height: 1.5, backgroundColor: AMBER, borderRadius: 1, marginVertical: 12 },
  dividerThin: { height: 0.5, backgroundColor: BORDER, marginVertical: 8 },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: DARK,
    borderRadius: 4,
    paddingVertical: 7,
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 7.5, fontFamily: 'Poppins', fontWeight: 700,
    color: WHITE, textTransform: 'uppercase', letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    borderBottomStyle: 'solid',
  },
  tableRowAlt: { backgroundColor: ALT },
  tableCell: { fontSize: 8.5, color: DARK },
  tableCellLight: { fontSize: 8, color: MID },

  // Column widths
  colNo:    { width: 24 },
  colDesc:  { flex: 1 },
  colHsn:   { width: 58 },
  colQty:   { width: 36, textAlign: 'right' },
  colRate:  { width: 64, textAlign: 'right' },
  colGst:   { width: 36, textAlign: 'right' },
  colAmt:   { width: 72, textAlign: 'right' },

  // Totals
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2 },
  totalsBox: { width: 220 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 8.5, color: MID },
  totalValue: { fontSize: 8.5, color: DARK, fontWeight: 600 },
  grandLine: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1.5, borderTopColor: AMBER, borderTopStyle: 'solid',
    paddingTop: 6, marginTop: 4,
  },
  grandLabel: { fontSize: 11, fontFamily: 'Poppins', fontWeight: 800, color: DARK },
  grandValue: { fontSize: 11, fontFamily: 'Poppins', fontWeight: 800, color: AMBER_DARK },

  // Words
  wordsBox: {
    backgroundColor: AMBER_BG, borderRadius: 5, padding: 8,
    marginTop: 8, borderWidth: 0.5, borderColor: AMBER_MID, borderStyle: 'solid',
  },
  wordsText: { fontSize: 7.5, color: MID, fontStyle: 'italic' },

  // Notes
  notesBox: {
    backgroundColor: ALT, borderRadius: 5, padding: 8,
    marginTop: 12, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid',
  },
  notesLabel: { fontSize: 7, fontFamily: 'Poppins', fontWeight: 600, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  notesText: { fontSize: 8, color: MID, lineHeight: 1.5 },

  // Disclaimer footer
  footer: { paddingHorizontal: 32, marginTop: 20 },
  footerLine: {
    borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid',
    paddingTop: 8, alignItems: 'center',
  },
  footerText: { fontSize: 7, color: LIGHT, textAlign: 'center', letterSpacing: 0.5 },
  footerAmber: { fontSize: 7.5, color: AMBER_DARK, fontWeight: 600, textAlign: 'center', marginBottom: 3 },
});

// ── Component ─────────────────────────────────────────────────────────────────

interface QuotationPDFProps {
  quotation: Quotation;
  business: BusinessProfile;
  customer: Customer;
}

const QuotationPDF: React.FC<QuotationPDFProps> = ({ quotation: q, business, customer }) => {
  const validItems = q.items.filter(i => i.description.trim());
  const isCGST = q.gstType === GSTType.CGST_SGST;

  return (
    <Document title={`Quotation - ${q.quotationNumber}`} author={business.name}>
      <Page size="A4" style={S.page}>

        {/* ── Amber header ── */}
        <View style={S.header} fixed>
          <View style={S.headerLeft}>
            <Text style={S.headerBusinessName}>{business.name}</Text>
            {business.gstin ? <Text style={S.headerSubText}>GSTIN: {business.gstin}</Text> : null}
            {business.address ? <Text style={S.headerSubText}>{business.address}</Text> : null}
            {business.city || business.state
              ? <Text style={S.headerSubText}>{[business.city, business.state, business.pincode].filter(Boolean).join(', ')}</Text>
              : null}
            {business.phone ? <Text style={S.headerSubText}>{business.phone}</Text> : null}
            {business.email ? <Text style={S.headerSubText}>{business.email}</Text> : null}
          </View>

          <View style={S.headerRight}>
            <View style={S.headerBadge}>
              <Text style={S.headerBadgeText}>QUOTATION</Text>
            </View>
            <Text style={S.headerLabel}>Quotation No.</Text>
            <Text style={[S.headerValue, { marginBottom: 4 }]}>{q.quotationNumber}</Text>
            <Text style={S.headerLabel}>Date</Text>
            <Text style={[S.headerValue, { marginBottom: 4 }]}>{formatDate(q.date)}</Text>
            {q.validUntil && (
              <>
                <Text style={S.headerLabel}>Valid Until</Text>
                <Text style={S.headerValue}>{formatDate(q.validUntil)}</Text>
              </>
            )}
          </View>
        </View>

        {/* ── Body ── */}
        <View style={S.body}>

          {/* Billed by / Billed to */}
          <View style={S.infoRow}>
            <View style={S.infoBox}>
              <Text style={S.infoBoxLabel}>Prepared By</Text>
              <Text style={S.infoName}>{business.name}</Text>
              {business.pan ? <Text style={S.infoSm}>PAN: {business.pan}</Text> : null}
            </View>
            <View style={S.infoBox}>
              <Text style={S.infoBoxLabel}>Prepared For</Text>
              <Text style={S.infoName}>{q.customerName}</Text>
              {customer.gstin ? <Text style={S.infoSm}>GSTIN: {customer.gstin}</Text> : null}
              {customer.address ? <Text style={S.infoSm}>{customer.address}</Text> : null}
              {customer.city || customer.state
                ? <Text style={S.infoSm}>{[customer.city, customer.state, customer.pincode].filter(Boolean).join(', ')}</Text>
                : null}
              {customer.phone ? <Text style={S.infoSm}>Ph: {customer.phone}</Text> : null}
              {customer.email ? <Text style={S.infoSm}>{customer.email}</Text> : null}
            </View>
          </View>

          {/* Amber divider */}
          <View style={S.divider} />

          {/* Items table */}
          <View style={S.tableHeader} fixed>
            <Text style={[S.tableHeaderCell, S.colNo]}>#</Text>
            <Text style={[S.tableHeaderCell, S.colDesc]}>Description</Text>
            <Text style={[S.tableHeaderCell, S.colHsn]}>HSN/SAC</Text>
            <Text style={[S.tableHeaderCell, S.colQty]}>Qty</Text>
            <Text style={[S.tableHeaderCell, S.colRate]}>Rate</Text>
            <Text style={[S.tableHeaderCell, S.colGst]}>GST</Text>
            <Text style={[S.tableHeaderCell, S.colAmt]}>Amount</Text>
          </View>

          {validItems.map((item, idx) => {
            const lineAmt = item.quantity * item.rate;
            const lineTax = lineAmt * item.gstRate / 100;
            const lineTotal = lineAmt + lineTax;
            return (
              <View key={item.id} style={[S.tableRow, idx % 2 !== 0 ? S.tableRowAlt : {}]} wrap={false}>
                <Text style={[S.tableCellLight, S.colNo]}>{idx + 1}</Text>
                <Text style={[S.tableCell, S.colDesc]}>{item.description}</Text>
                <Text style={[S.tableCellLight, S.colHsn]}>{item.hsnCode || '—'}</Text>
                <Text style={[S.tableCellLight, S.colQty]}>{item.quantity}</Text>
                <Text style={[S.tableCellLight, S.colRate]}>{fmt(item.rate)}</Text>
                <Text style={[S.tableCellLight, S.colGst]}>{item.gstRate}%</Text>
                <Text style={[S.tableCell, S.colAmt, { fontWeight: 600 }]}>{fmt(lineTotal)}</Text>
              </View>
            );
          })}

          {/* Totals */}
          <View style={S.totalsRow}>
            <View style={S.totalsBox}>
              <View style={S.totalLine}>
                <Text style={S.totalLabel}>Taxable Amount</Text>
                <Text style={S.totalValue}>{fmt(q.totalBeforeTax)}</Text>
              </View>
              {isCGST ? (
                <>
                  <View style={S.totalLine}>
                    <Text style={S.totalLabel}>CGST</Text>
                    <Text style={S.totalValue}>{fmt(q.cgst)}</Text>
                  </View>
                  <View style={S.totalLine}>
                    <Text style={S.totalLabel}>SGST</Text>
                    <Text style={S.totalValue}>{fmt(q.sgst)}</Text>
                  </View>
                </>
              ) : (
                <View style={S.totalLine}>
                  <Text style={S.totalLabel}>IGST</Text>
                  <Text style={S.totalValue}>{fmt(q.igst)}</Text>
                </View>
              )}
              <View style={S.grandLine}>
                <Text style={S.grandLabel}>Total</Text>
                <Text style={S.grandValue}>{fmt(q.totalAmount)}</Text>
              </View>
            </View>
          </View>

          {/* Amount in words */}
          <View style={S.wordsBox}>
            <Text style={S.wordsText}>Total (in words): {toWords(q.totalAmount)}</Text>
          </View>

          {/* Notes */}
          {q.notes ? (
            <View style={S.notesBox}>
              <Text style={S.notesLabel}>Notes</Text>
              <Text style={S.notesText}>{q.notes}</Text>
            </View>
          ) : null}

        </View>

        {/* ── Footer disclaimer ── */}
        <View style={S.footer} fixed>
          <View style={S.footerLine}>
            <Text style={S.footerAmber}>This is a Quotation / Estimate only — NOT a Tax Invoice</Text>
            <Text style={S.footerText}>
              Prices are indicative and subject to change • Subject to acceptance • Generated by BillHippo
            </Text>
          </View>
        </View>

      </Page>
    </Document>
  );
};

export default QuotationPDF;
