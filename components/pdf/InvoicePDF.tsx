/**
 * InvoicePDF — A4 tax invoice template for @react-pdf/renderer
 *
 * Fixes applied vs original:
 *  - Removed Font.register() calls: custom woff URLs were failing silently
 *    and causing a blank render. Using built-in Helvetica instead.
 *  - Removed <Image> logo: Firebase Storage images trigger CORS errors
 *    inside the PDF renderer. Replaced with a styled text brand mark.
 *  - wrap={false} on every table row → no row split across pages.
 *  - Table header uses `fixed` prop → repeats on every page.
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { Invoice, BusinessProfile, Customer, GSTType } from '../../types';

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
    fontFamily: 'Helvetica',
    fontSize: 9,
    backgroundColor: '#FFFFFF',
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    color: DARK,
  },

  // ── Fixed header (repeats every page) ──
  fixedHeader: { marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },

  // Brand mark (text-based, no image)
  brandBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BLUE,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  brandText: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', letterSpacing: 1 },
  brandSub: { fontSize: 6.5, color: 'rgba(255,255,255,0.7)', marginTop: 1 },

  invoiceTitle: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right' },
  invoiceNo: { fontSize: 9, color: MID, textAlign: 'right', marginTop: 2 },

  dividerBlue: { height: 2, backgroundColor: BLUE, borderRadius: 2, marginBottom: 16 },
  dividerThin: { height: 0.5, backgroundColor: BORDER, marginVertical: 12 },

  // ── Badge ──
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start', marginTop: 4 },
  badgePaid:    { backgroundColor: '#dcfce7' },
  badgeUnpaid:  { backgroundColor: '#fee2e2' },
  badgePartial: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  badgeTextPaid:    { color: '#16a34a' },
  badgeTextUnpaid:  { color: '#dc2626' },
  badgeTextPartial: { color: '#d97706' },

  // ── Info grid ──
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, gap: 16 },
  infoBox:   { flex: 1 },
  infoLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 4 },
  infoValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, lineHeight: 1.5 },
  infoSm:    { fontSize: 8, color: MID, lineHeight: 1.5 },
  infoBlue:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: BLUE, lineHeight: 1.5 },

  // ── Table ──
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BLUE,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 3,
  },
  tableHeaderText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', textTransform: 'uppercase' },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
    borderBottomStyle: 'solid',
  },
  tableRowAlt: { backgroundColor: ALT },
  tableCell:   { fontSize: 8, color: MID },
  tableCellBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },

  // Column widths
  cNo:   { width: '5%' },
  cDesc: { width: '34%' },
  cHsn:  { width: '12%' },
  cQty:  { width: '8%',  textAlign: 'center' },
  cRate: { width: '13%', textAlign: 'right' },
  cGst:  { width: '8%',  textAlign: 'center' },
  cTax:  { width: '10%', textAlign: 'right' },
  cAmt:  { width: '10%', textAlign: 'right' },

  // ── Totals ──
  totalsWrap:  { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8, marginBottom: 16 },
  totalsInner: { width: '46%' },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel:  { fontSize: 8, color: MID },
  totalValue:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },
  grandRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: BLUE, paddingVertical: 7, paddingHorizontal: 8,
    borderRadius: 4, marginTop: 4,
  },
  grandLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#fff' },
  grandValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#fff' },

  // ── Amount in words ──
  amtWords: { fontSize: 7.5, fontFamily: 'Helvetica-Oblique', color: MID, marginBottom: 12 },

  // ── Footer boxes ──
  footerRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  footerBox: {
    flex: 1, backgroundColor: ALT, borderRadius: 5, padding: 9,
    borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid',
  },
  footerLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  footerValue: { fontSize: 7.5, color: MID, lineHeight: 1.6 },

  // ── Signature ──
  signWrap:  { alignItems: 'flex-end', marginTop: 12 },
  signLine:  { width: 120, height: 0.5, backgroundColor: LIGHT, marginBottom: 4 },
  signLabel: { fontSize: 7, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },

  // ── Page number ──
  pageNum: {
    position: 'absolute', bottom: 18, left: 0, right: 0,
    textAlign: 'center', fontSize: 7, color: LIGHT,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `Rs.${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
    'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
    'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function conv(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + conv(n % 100) : '');
    if (n < 100000) return conv(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + conv(n % 1000) : '');
    if (n < 10000000) return conv(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + conv(n % 100000) : '');
    return conv(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + conv(n % 10000000) : '');
  }
  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);
  let result   = conv(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + conv(paise) + ' Paise';
  return result + ' Only';
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface InvoicePDFProps {
  invoice:  Invoice;
  business: BusinessProfile;
  customer: Customer;
}

// ─── Component ────────────────────────────────────────────────────────────────
const InvoicePDF: React.FC<InvoicePDFProps> = ({ invoice, business, customer }) => {
  const hasGst = business.gstEnabled;

  const itemsWithTax = invoice.items.map(item => {
    const lineTotal = item.quantity * item.rate;
    const taxAmt    = lineTotal * (item.gstRate / 100);
    return { ...item, lineTotal, taxAmt, total: lineTotal + taxAmt };
  });

  const badgeStyle = invoice.status === 'Paid'
    ? [S.badge, S.badgePaid]
    : invoice.status === 'Unpaid'
    ? [S.badge, S.badgeUnpaid]
    : [S.badge, S.badgePartial];

  const badgeTextStyle = invoice.status === 'Paid'
    ? [S.badgeText, S.badgeTextPaid]
    : invoice.status === 'Unpaid'
    ? [S.badgeText, S.badgeTextUnpaid]
    : [S.badgeText, S.badgeTextPartial];

  return (
    <Document title={`Invoice ${invoice.invoiceNumber}`} author={business.name} creator="BillHippo">
      <Page size="A4" style={S.page} wrap>

        {/* ── Fixed header: repeats on every page ── */}
        <View fixed style={S.fixedHeader}>
          <View style={S.headerRow}>
            {/* Brand */}
            <View>
              <View style={S.brandBox}>
                <Text style={S.brandText}>BillHippo</Text>
              </View>
              <Text style={S.brandSub}>Smart Billing for India</Text>
            </View>
            {/* Invoice title + status */}
            <View>
              <Text style={S.invoiceTitle}>TAX INVOICE</Text>
              <Text style={S.invoiceNo}>#{invoice.invoiceNumber}</Text>
              <View style={badgeStyle}>
                <Text style={badgeTextStyle}>{invoice.status}</Text>
              </View>
            </View>
          </View>
          <View style={S.dividerBlue} />
        </View>

        {/* ── From / To / Date ── */}
        <View style={S.infoGrid}>
          {/* From */}
          <View style={S.infoBox}>
            <Text style={S.infoLabel}>From</Text>
            <Text style={[S.infoValue, { fontSize: 11 }]}>{business.name}</Text>
            <Text style={S.infoSm}>{business.address}, {business.city}</Text>
            <Text style={S.infoSm}>{business.state} – {business.pincode}</Text>
            {business.gstin ? <Text style={S.infoBlue}>GSTIN: {business.gstin}</Text> : null}
            {business.phone ? <Text style={S.infoSm}>Ph: {business.phone}</Text> : null}
            {business.email ? <Text style={S.infoSm}>{business.email}</Text> : null}
          </View>

          {/* Bill To */}
          <View style={S.infoBox}>
            <Text style={S.infoLabel}>Bill To</Text>
            <Text style={[S.infoValue, { fontSize: 11 }]}>{customer.name}</Text>
            <Text style={S.infoSm}>{customer.address}, {customer.city}</Text>
            <Text style={S.infoSm}>{customer.state} – {customer.pincode}</Text>
            {customer.gstin ? <Text style={S.infoBlue}>GSTIN: {customer.gstin}</Text> : null}
            {customer.phone ? <Text style={S.infoSm}>Ph: {customer.phone}</Text> : null}
          </View>

          {/* Dates */}
          <View style={[S.infoBox, { alignItems: 'flex-end' }]}>
            <Text style={S.infoLabel}>Invoice Date</Text>
            <Text style={S.infoValue}>{invoice.date}</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={S.infoLabel}>GST Type</Text>
              <Text style={[S.infoValue, { textAlign: 'right' }]}>
                {invoice.gstType === GSTType.IGST ? 'IGST (Inter-state)' : 'CGST + SGST'}
              </Text>
            </View>
          </View>
        </View>

        <View style={S.dividerThin} />

        {/* ── Table header (fixed — repeats on every page) ── */}
        <View style={S.tableHeader} fixed>
          <Text style={[S.tableHeaderText, S.cNo]}>#</Text>
          <Text style={[S.tableHeaderText, S.cDesc]}>Description</Text>
          <Text style={[S.tableHeaderText, S.cHsn]}>HSN/SAC</Text>
          <Text style={[S.tableHeaderText, S.cQty]}>Qty</Text>
          <Text style={[S.tableHeaderText, S.cRate]}>Rate</Text>
          {hasGst && <Text style={[S.tableHeaderText, S.cGst]}>GST%</Text>}
          {hasGst && <Text style={[S.tableHeaderText, S.cTax]}>Tax</Text>}
          <Text style={[S.tableHeaderText, S.cAmt]}>Amount</Text>
        </View>

        {/* ── Table rows (wrap=false prevents mid-row page breaks) ── */}
        {itemsWithTax.map((item, idx) => (
          <View
            key={item.id}
            style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}
            wrap={false}
          >
            <Text style={[S.tableCell, S.cNo]}>{idx + 1}</Text>
            <Text style={[S.tableCell, S.cDesc]}>{item.description}</Text>
            <Text style={[S.tableCell, S.cHsn]}>{item.hsnCode || '—'}</Text>
            <Text style={[S.tableCell, S.cQty]}>{item.quantity}</Text>
            <Text style={[S.tableCell, S.cRate]}>{fmt(item.rate)}</Text>
            {hasGst && <Text style={[S.tableCell, S.cGst]}>{item.gstRate}%</Text>}
            {hasGst && <Text style={[S.tableCell, S.cTax]}>{fmt(item.taxAmt)}</Text>}
            <Text style={[S.tableCellBold, S.cAmt]}>{fmt(item.total)}</Text>
          </View>
        ))}

        {/* ── Totals ── */}
        <View style={S.totalsWrap} wrap={false}>
          <View style={S.totalsInner}>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>Subtotal (before tax)</Text>
              <Text style={S.totalValue}>{fmt(invoice.totalBeforeTax)}</Text>
            </View>

            {hasGst && invoice.gstType === GSTType.CGST_SGST && (
              <>
                <View style={S.totalRow}>
                  <Text style={S.totalLabel}>CGST</Text>
                  <Text style={S.totalValue}>{fmt(invoice.cgst)}</Text>
                </View>
                <View style={S.totalRow}>
                  <Text style={S.totalLabel}>SGST</Text>
                  <Text style={S.totalValue}>{fmt(invoice.sgst)}</Text>
                </View>
              </>
            )}
            {hasGst && invoice.gstType === GSTType.IGST && (
              <View style={S.totalRow}>
                <Text style={S.totalLabel}>IGST</Text>
                <Text style={S.totalValue}>{fmt(invoice.igst)}</Text>
              </View>
            )}

            <View style={S.grandRow}>
              <Text style={S.grandLabel}>TOTAL PAYABLE</Text>
              <Text style={S.grandValue}>{fmt(invoice.totalAmount)}</Text>
            </View>
          </View>
        </View>

        {/* ── Amount in words ── */}
        <Text style={S.amtWords}>
          In words: {toWords(invoice.totalAmount)}
        </Text>

        <View style={S.dividerThin} />

        {/* ── Bank details + Notes ── */}
        <View style={S.footerRow} wrap={false}>
          {(business.bankName || business.accountNumber) ? (
            <View style={S.footerBox}>
              <Text style={S.footerLabel}>Bank Details</Text>
              {business.bankName      && <Text style={S.footerValue}>Bank: {business.bankName}</Text>}
              {business.accountNumber && <Text style={S.footerValue}>A/c: {business.accountNumber}</Text>}
              {business.ifscCode      && <Text style={S.footerValue}>IFSC: {business.ifscCode}</Text>}
              {business.upiId         && <Text style={S.footerValue}>UPI: {business.upiId}</Text>}
            </View>
          ) : null}
          {business.defaultNotes ? (
            <View style={S.footerBox}>
              <Text style={S.footerLabel}>Notes</Text>
              <Text style={S.footerValue}>{business.defaultNotes}</Text>
            </View>
          ) : null}
          {business.termsAndConditions ? (
            <View style={S.footerBox}>
              <Text style={S.footerLabel}>Terms & Conditions</Text>
              <Text style={S.footerValue}>{business.termsAndConditions}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Signature ── */}
        <View style={S.signWrap} wrap={false}>
          <View style={S.signLine} />
          <Text style={S.signLabel}>Authorised Signatory – {business.name}</Text>
        </View>

        {/* ── Page number (fixed footer) ── */}
        <Text
          style={S.pageNum}
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}  |  Generated by BillHippo`
          }
          fixed
        />
      </Page>
    </Document>
  );
};

export default InvoicePDF;
