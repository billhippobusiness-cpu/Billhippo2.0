/**
 * InvoicePDF — A4 tax invoice template for @react-pdf/renderer
 *
 * UPDATED: PDF now matches the HTML invoice preview templates exactly.
 *  - Reads business.theme.primaryColor  → all accents use the chosen color
 *  - Reads business.theme.templateId    → renders the matching layout:
 *      modern-2 (default): Large "Invoice" heading on left, business info right,
 *                          two "Billed by / Billed to" cards, items table,
 *                          totals box on right, bank details at bottom.
 *      modern-1:           Logo placeholder left, "Invoice" centered, date/inv# right,
 *                          two tinted-bg address cards, items table,
 *                          grand total in primary color box.
 *      minimal:            Falls back to modern-2 base layout.
 *
 * Retained fixes:
 *  - No Font.register(): custom WOFF URLs fail silently; using Helvetica.
 *  - No <Image> logo: Firebase Storage URLs cause CORS inside the renderer.
 *  - wrap={false} on every table row → no row splits across pages.
 *  - Table header uses `fixed` prop  → repeats on every page.
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

// ─── Static palette (non-theme colours) ──────────────────────────────────────
const DARK    = '#1e293b';
const MID     = '#475569';
const LIGHT   = '#94a3b8';
const BORDER  = '#e2e8f0';
const ALT     = '#f8fafc';
const WHITE   = '#ffffff';
const EMERALD = '#10b981';

// ─── Helper: convert hex + alpha to rgba() ───────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Base StyleSheet (static, theme-independent) ─────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    backgroundColor: WHITE,
    paddingTop: 36,
    paddingBottom: 52,
    paddingHorizontal: 36,
    color: DARK,
  },

  // ── Dividers ──
  dividerPrimary: { height: 2, borderRadius: 2, marginBottom: 16 },
  dividerThin:    { height: 0.5, backgroundColor: BORDER, marginVertical: 10 },

  // ── Shared info boxes ──
  infoRow:       { flexDirection: 'row', gap: 12, marginBottom: 14 },
  infoBox:       { flex: 1, backgroundColor: ALT, borderRadius: 6, padding: 10, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid' },
  infoBoxTinted: { flex: 1, borderRadius: 6, padding: 10 },
  infoBoxLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 5 },
  infoName:      { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 },
  infoSm:        { fontSize: 7.5, color: MID, lineHeight: 1.5 },
  infoMeta:      { flexDirection: 'row', gap: 14, marginTop: 6, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid' },
  infoMetaCol:   { flexDirection: 'column' },
  infoMetaLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  infoMetaValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },

  // ── Status badge ──
  badge:         { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start', marginTop: 5 },
  badgePaid:     { backgroundColor: '#dcfce7' },
  badgeUnpaid:   { backgroundColor: '#fee2e2' },
  badgePartial:  { backgroundColor: '#fef3c7' },
  badgeText:     { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  badgeTextPaid:    { color: '#16a34a' },
  badgeTextUnpaid:  { color: '#dc2626' },
  badgeTextPartial: { color: '#d97706' },

  // ── Items table ──
  tableHeader:     { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8, borderRadius: 3 },
  tableHeaderText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: WHITE, textTransform: 'uppercase' },
  tableRow:        { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', borderBottomStyle: 'solid' },
  tableRowAlt:     { backgroundColor: ALT },
  tableCell:       { fontSize: 8, color: MID },
  tableCellBold:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },

  // modern-2 column widths (no Rate column — Amount = lineTotal before tax, GST shown separately)
  m2cDesc: { width: '42%' },
  m2cHsn:  { width: '15%', textAlign: 'center' },
  m2cQty:  { width: '10%', textAlign: 'center' },
  m2cGst:  { width: '10%', textAlign: 'center' },
  m2cAmt:  { width: '23%', textAlign: 'right' },

  // modern-1 column widths (includes Rate)
  m1cDesc: { width: '35%' },
  m1cHsn:  { width: '13%', textAlign: 'center' },
  m1cQty:  { width: '9%',  textAlign: 'center' },
  m1cRate: { width: '14%', textAlign: 'right' },
  m1cGst:  { width: '10%', textAlign: 'center' },
  m1cAmt:  { width: '19%', textAlign: 'right' },

  // ── Totals (modern-2) ──
  totalsWrap:  { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, marginBottom: 12 },
  totalsInner: { width: '46%' },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel:  { fontSize: 8, color: MID },
  totalValue:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },
  grandRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, paddingHorizontal: 10, borderRadius: 4, marginTop: 4 },
  grandLabel:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: WHITE },
  grandValue:  { fontSize: 11, fontFamily: 'Helvetica-Bold', color: WHITE },

  // ── Amount in words ──
  amtWords: { fontSize: 7.5, color: MID, fontFamily: 'Helvetica-Oblique', marginBottom: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: ALT, borderRadius: 4 },

  // ── Footer boxes ──
  footerRow:   { flexDirection: 'row', gap: 12, marginBottom: 12 },
  footerBox:   { flex: 1, backgroundColor: ALT, borderRadius: 5, padding: 9, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid' },
  footerLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  footerValue: { fontSize: 7.5, color: MID, lineHeight: 1.6 },

  // ── Signature ──
  signWrap:  { alignItems: 'flex-end', marginTop: 10 },
  signLine:  { width: 120, height: 0.5, backgroundColor: LIGHT, marginBottom: 4 },
  signLabel: { fontSize: 7, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },

  // ── Page number ──
  pageNum: { position: 'absolute', bottom: 18, left: 0, right: 0, textAlign: 'center', fontSize: 7, color: LIGHT },

  // ── modern-2 header ──
  m2HeaderRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  m2Title:       { fontSize: 32, fontFamily: 'Helvetica-Bold', letterSpacing: -1, lineHeight: 1 },
  m2MetaLabel:   { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.9 },
  m2MetaValue:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK },
  m2BizName:     { fontSize: 12, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right' },
  m2BizSub:      { fontSize: 7.5, color: MID, textAlign: 'right', lineHeight: 1.5 },
  m2BizGst:      { fontSize: 7.5, fontFamily: 'Helvetica-Bold', textAlign: 'right', lineHeight: 1.5 },

  // ── modern-1 header ──
  m1HeaderRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: BORDER, borderBottomStyle: 'solid' },
  m1LogoBox:    { width: 64, height: 64, backgroundColor: ALT, borderRadius: 8, alignItems: 'center', justifyContent: 'center', padding: 6 },
  m1LogoText:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'center' },
  m1TitleWrap:  { alignItems: 'center' },
  m1Title:      { fontSize: 22, fontFamily: 'Helvetica-Bold', textAlign: 'center', letterSpacing: 2 },
  m1TitleSub:   { fontSize: 7, color: LIGHT, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2, textAlign: 'center' },
  m1MetaRight:  { alignItems: 'flex-end' },
  m1MetaLabel:  { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  m1MetaValue:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK },

  // ── modern-1 footer grid ──
  m1FootGrid:   { flexDirection: 'row', gap: 18, marginTop: 10, marginBottom: 12 },
  m1BankCol:    { flex: 1 },
  m1SumCol:     { flex: 1 },
  m1GrandBox:   { borderRadius: 6, padding: 10, marginTop: 8 },
  m1GrandLabel: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: WHITE },
  m1GrandValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: WHITE, marginTop: 2 },
});

// ─── Number → words ───────────────────────────────────────────────────────────
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
    if (n < 100000)   return conv(Math.floor(n / 1000))    + ' Thousand' + (n % 1000    ? ' ' + conv(n % 1000)    : '');
    if (n < 10000000) return conv(Math.floor(n / 100000))  + ' Lakh'     + (n % 100000  ? ' ' + conv(n % 100000)  : '');
    return             conv(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + conv(n % 10000000) : '');
  }
  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);
  let result   = conv(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + conv(paise) + ' Paise';
  return result + ' Only';
}

// ─── Currency formatter ───────────────────────────────────────────────────────
const fmt = (n: number) =>
  `Rs.${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Props ────────────────────────────────────────────────────────────────────
interface InvoicePDFProps {
  invoice:  Invoice;
  business: BusinessProfile;
  customer: Customer;
}

// ─── Component ────────────────────────────────────────────────────────────────
const InvoicePDF: React.FC<InvoicePDFProps> = ({ invoice, business, customer }) => {
  const PRIMARY    = business.theme?.primaryColor || '#4c2de0';
  const templateId = business.theme?.templateId   || 'modern-2';
  const hasGst     = business.gstEnabled;

  const itemsWithTax = invoice.items.map(item => {
    const lineTotal = item.quantity * item.rate;
    const taxAmt    = lineTotal * (item.gstRate / 100);
    return { ...item, lineTotal, taxAmt, total: lineTotal + taxAmt };
  });

  // Badge styles based on status
  const badgeContainer = invoice.status === 'Paid'    ? [S.badge, S.badgePaid]
                       : invoice.status === 'Unpaid'  ? [S.badge, S.badgeUnpaid]
                       :                                [S.badge, S.badgePartial];
  const badgeTxt       = invoice.status === 'Paid'    ? [S.badgeText, S.badgeTextPaid]
                       : invoice.status === 'Unpaid'  ? [S.badgeText, S.badgeTextUnpaid]
                       :                                [S.badgeText, S.badgeTextPartial];

  // ════════════════════════════════════════════════════════════════
  //  MODERN-1 TEMPLATE
  //  Logo left | "Invoice" centered (primary) | Invoice#/Date right
  //  Two tinted address cards | Items table | Grand total box
  // ════════════════════════════════════════════════════════════════
  if (templateId === 'modern-1') {
    return (
      <Document title={`Invoice ${invoice.invoiceNumber}`} author={business.name} creator="BillHippo">
        <Page size="A4" style={S.page} wrap>

          {/* ── Header ── */}
          <View style={S.m1HeaderRow} fixed>
            {/* Logo placeholder (left) */}
            <View style={S.m1LogoBox}>
              <Text style={S.m1LogoText}>{business.name.slice(0, 8)}</Text>
            </View>

            {/* Title (center) */}
            <View style={S.m1TitleWrap}>
              <Text style={[S.m1Title, { color: PRIMARY }]}>Invoice</Text>
              <Text style={S.m1TitleSub}>GST Compliant Tax Invoice</Text>
            </View>

            {/* Invoice # / Date / Status (right) */}
            <View style={S.m1MetaRight}>
              <Text style={S.m1MetaLabel}>Inv #</Text>
              <Text style={S.m1MetaValue}>{invoice.invoiceNumber}</Text>
              <View style={{ marginTop: 6 }}>
                <Text style={S.m1MetaLabel}>Date</Text>
                <Text style={S.m1MetaValue}>{invoice.date}</Text>
              </View>
              <View style={badgeContainer}>
                <Text style={badgeTxt}>{invoice.status}</Text>
              </View>
            </View>
          </View>

          {/* ── Billed By / Billed To (tinted cards) ── */}
          <View style={S.infoRow}>
            <View style={[S.infoBoxTinted, { backgroundColor: hexToRgba(PRIMARY, 0.08) }]}>
              <Text style={[S.infoBoxLabel, { color: PRIMARY }]}>Billed By</Text>
              <Text style={S.infoName}>{business.name}</Text>
              <Text style={S.infoSm}>{business.address}, {business.city}, {business.state} – {business.pincode}</Text>
              {business.phone ? <Text style={S.infoSm}>Ph: {business.phone}</Text> : null}
              <View style={S.infoMeta}>
                {business.gstin ? (
                  <View style={S.infoMetaCol}>
                    <Text style={S.infoMetaLabel}>GSTIN</Text>
                    <Text style={S.infoMetaValue}>{business.gstin}</Text>
                  </View>
                ) : null}
                {business.pan ? (
                  <View style={S.infoMetaCol}>
                    <Text style={S.infoMetaLabel}>PAN</Text>
                    <Text style={S.infoMetaValue}>{business.pan}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={[S.infoBoxTinted, { backgroundColor: hexToRgba(PRIMARY, 0.08) }]}>
              <Text style={[S.infoBoxLabel, { color: PRIMARY }]}>Billed To</Text>
              <Text style={S.infoName}>{customer.name}</Text>
              <Text style={S.infoSm}>{customer.address}, {customer.city}, {customer.state} – {customer.pincode}</Text>
              {customer.phone ? <Text style={S.infoSm}>Ph: {customer.phone}</Text> : null}
              {customer.gstin ? (
                <View style={S.infoMeta}>
                  <View style={S.infoMetaCol}>
                    <Text style={S.infoMetaLabel}>GSTIN</Text>
                    <Text style={S.infoMetaValue}>{customer.gstin}</Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {/* ── Items table ── */}
          <View style={[S.tableHeader, { backgroundColor: PRIMARY }]} fixed>
            <Text style={[S.tableHeaderText, S.m1cDesc]}>Item Description</Text>
            <Text style={[S.tableHeaderText, S.m1cHsn]}>HSN</Text>
            <Text style={[S.tableHeaderText, S.m1cQty]}>Qty</Text>
            <Text style={[S.tableHeaderText, S.m1cRate]}>Rate</Text>
            {hasGst && <Text style={[S.tableHeaderText, S.m1cGst]}>GST%</Text>}
            <Text style={[S.tableHeaderText, S.m1cAmt]}>Amount</Text>
          </View>

          {itemsWithTax.map((item, idx) => (
            <View key={item.id} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
              <Text style={[S.tableCell, S.m1cDesc]}>{idx + 1}. {item.description}</Text>
              <Text style={[S.tableCell, S.m1cHsn]}>{item.hsnCode || '—'}</Text>
              <Text style={[S.tableCell, S.m1cQty]}>{item.quantity}</Text>
              <Text style={[S.tableCell, S.m1cRate]}>{fmt(item.rate)}</Text>
              {hasGst && <Text style={[S.tableCell, S.m1cGst]}>{item.gstRate}%</Text>}
              <Text style={[S.tableCellBold, S.m1cAmt]}>{fmt(item.lineTotal)}</Text>
            </View>
          ))}

          {/* ── Footer: bank info (left) | totals (right) ── */}
          <View style={S.m1FootGrid} wrap={false}>
            {/* Bank & Notes column */}
            <View style={S.m1BankCol}>
              <Text style={[S.footerLabel, { marginBottom: 6 }]}>Bank & Payment Info</Text>
              {business.bankName      && <Text style={S.footerValue}>Bank: {business.bankName}</Text>}
              {business.accountNumber && <Text style={S.footerValue}>A/c: {business.accountNumber}</Text>}
              {business.ifscCode      && <Text style={S.footerValue}>IFSC: {business.ifscCode}</Text>}
              {business.upiId         && (
                <Text style={[S.footerValue, { color: PRIMARY, fontFamily: 'Helvetica-Bold' }]}>
                  UPI ID: {business.upiId}
                </Text>
              )}
              {business.defaultNotes ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={S.footerLabel}>Notes</Text>
                  <Text style={[S.footerValue, { fontFamily: 'Helvetica-Oblique' }]}>
                    {business.defaultNotes}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Summary column */}
            <View style={S.m1SumCol}>
              <View style={S.totalRow}>
                <Text style={S.totalLabel}>Sub Total</Text>
                <Text style={S.totalValue}>{fmt(invoice.totalBeforeTax)}</Text>
              </View>
              {hasGst && (
                <View style={S.totalRow}>
                  <Text style={[S.totalLabel, { color: EMERALD }]}>Tax (GST)</Text>
                  <Text style={[S.totalValue, { color: EMERALD }]}>
                    {fmt(invoice.gstType === GSTType.IGST ? invoice.igst : invoice.cgst + invoice.sgst)}
                  </Text>
                </View>
              )}
              {hasGst && invoice.gstType === GSTType.CGST_SGST && (
                <>
                  <View style={S.totalRow}>
                    <Text style={[S.totalLabel, { fontSize: 7, paddingLeft: 8 }]}>CGST</Text>
                    <Text style={[S.totalValue, { fontSize: 7 }]}>{fmt(invoice.cgst)}</Text>
                  </View>
                  <View style={S.totalRow}>
                    <Text style={[S.totalLabel, { fontSize: 7, paddingLeft: 8 }]}>SGST</Text>
                    <Text style={[S.totalValue, { fontSize: 7 }]}>{fmt(invoice.sgst)}</Text>
                  </View>
                </>
              )}
              {hasGst && invoice.gstType === GSTType.IGST && (
                <View style={S.totalRow}>
                  <Text style={[S.totalLabel, { fontSize: 7, paddingLeft: 8 }]}>IGST</Text>
                  <Text style={[S.totalValue, { fontSize: 7 }]}>{fmt(invoice.igst)}</Text>
                </View>
              )}
              {/* Grand total box in primary color */}
              <View style={[S.m1GrandBox, { backgroundColor: PRIMARY }]}>
                <Text style={S.m1GrandLabel}>Grand Total</Text>
                <Text style={S.m1GrandValue}>{fmt(invoice.totalAmount)}</Text>
              </View>
              {/* Amount in words */}
              <Text style={[S.amtWords, { marginTop: 6 }]}>
                {toWords(invoice.totalAmount)}
              </Text>
            </View>
          </View>

          {/* Terms & Conditions */}
          {business.termsAndConditions ? (
            <View style={S.footerBox} wrap={false}>
              <Text style={S.footerLabel}>Terms & Conditions</Text>
              <Text style={S.footerValue}>{business.termsAndConditions}</Text>
            </View>
          ) : null}

          {/* Signature */}
          <View style={S.signWrap} wrap={false}>
            <View style={S.signLine} />
            <Text style={S.signLabel}>Authorised Signatory – {business.name}</Text>
          </View>

          {/* Page number */}
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
  }

  // ════════════════════════════════════════════════════════════════
  //  MODERN-2 (default) + MINIMAL TEMPLATES
  //  Large "Invoice" heading left | business info right
  //  Two "Billed by / Billed to" cards (slate bg)
  //  Items table | Totals on right | Bank details at bottom
  // ════════════════════════════════════════════════════════════════
  return (
    <Document title={`Invoice ${invoice.invoiceNumber}`} author={business.name} creator="BillHippo">
      <Page size="A4" style={S.page} wrap>

        {/* ── Fixed header (repeats every page) ── */}
        <View fixed style={{ marginBottom: 14 }}>
          <View style={S.m2HeaderRow}>

            {/* Left: large "Invoice" heading + invoice meta */}
            <View>
              <Text style={[S.m2Title, { color: PRIMARY }]}>Invoice</Text>
              <View style={{ marginTop: 6, gap: 3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={S.m2MetaLabel}>Invoice#</Text>
                  <Text style={S.m2MetaValue}>{invoice.invoiceNumber}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={S.m2MetaLabel}>Invoice Date</Text>
                  <Text style={S.m2MetaValue}>{invoice.date}</Text>
                </View>
                <View style={badgeContainer}>
                  <Text style={badgeTxt}>{invoice.status}</Text>
                </View>
              </View>
            </View>

            {/* Right: business name + address */}
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={S.m2BizName}>{business.name}</Text>
              {business.address ? (
                <Text style={S.m2BizSub}>{business.address}, {business.city}</Text>
              ) : null}
              {business.state ? (
                <Text style={S.m2BizSub}>{business.state} – {business.pincode}</Text>
              ) : null}
              {business.gstin ? (
                <Text style={[S.m2BizGst, { color: PRIMARY }]}>GSTIN: {business.gstin}</Text>
              ) : null}
              {business.phone ? <Text style={S.m2BizSub}>Ph: {business.phone}</Text> : null}
              {business.email ? <Text style={S.m2BizSub}>{business.email}</Text> : null}
            </View>
          </View>

          {/* Primary-colour divider */}
          <View style={[S.dividerPrimary, { backgroundColor: PRIMARY }]} />
        </View>

        {/* ── Billed By / Billed To boxes ── */}
        <View style={S.infoRow}>
          <View style={S.infoBox}>
            <Text style={[S.infoBoxLabel, { color: PRIMARY }]}>Billed By</Text>
            <Text style={S.infoName}>{business.name}</Text>
            <Text style={S.infoSm}>{business.address}, {business.city}, {business.state} – {business.pincode}</Text>
            {business.phone ? <Text style={S.infoSm}>Ph: {business.phone}</Text> : null}
            <View style={S.infoMeta}>
              {business.gstin ? (
                <View style={S.infoMetaCol}>
                  <Text style={S.infoMetaLabel}>GSTIN</Text>
                  <Text style={[S.infoMetaValue, { color: PRIMARY }]}>{business.gstin}</Text>
                </View>
              ) : null}
              {business.pan ? (
                <View style={S.infoMetaCol}>
                  <Text style={S.infoMetaLabel}>PAN</Text>
                  <Text style={S.infoMetaValue}>{business.pan}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={S.infoBox}>
            <Text style={[S.infoBoxLabel, { color: PRIMARY }]}>Billed To</Text>
            <Text style={S.infoName}>{customer.name}</Text>
            <Text style={S.infoSm}>{customer.address}, {customer.city}, {customer.state} – {customer.pincode}</Text>
            {customer.phone ? <Text style={S.infoSm}>Ph: {customer.phone}</Text> : null}
            {customer.gstin ? (
              <View style={S.infoMeta}>
                <View style={S.infoMetaCol}>
                  <Text style={S.infoMetaLabel}>GSTIN</Text>
                  <Text style={[S.infoMetaValue, { color: PRIMARY }]}>{customer.gstin}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Table header (fixed — repeats every page) ── */}
        <View style={[S.tableHeader, { backgroundColor: PRIMARY }]} fixed>
          <Text style={[S.tableHeaderText, S.m2cDesc]}>Item Description</Text>
          <Text style={[S.tableHeaderText, S.m2cHsn]}>HSN/SAC</Text>
          <Text style={[S.tableHeaderText, S.m2cQty]}>Qty</Text>
          {hasGst && <Text style={[S.tableHeaderText, S.m2cGst]}>GST%</Text>}
          <Text style={[S.tableHeaderText, S.m2cAmt]}>Amount</Text>
        </View>

        {/* ── Table rows ── */}
        {itemsWithTax.map((item, idx) => (
          <View key={item.id} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
            <Text style={[S.tableCell, S.m2cDesc]}>{idx + 1}. {item.description}</Text>
            <Text style={[S.tableCell, S.m2cHsn]}>{item.hsnCode || '—'}</Text>
            <Text style={[S.tableCell, S.m2cQty]}>{item.quantity}</Text>
            {hasGst && <Text style={[S.tableCell, S.m2cGst]}>{item.gstRate}%</Text>}
            <Text style={[S.tableCellBold, S.m2cAmt]}>{fmt(item.lineTotal)}</Text>
          </View>
        ))}

        {/* ── Totals (right-aligned) ── */}
        <View style={S.totalsWrap} wrap={false}>
          <View style={S.totalsInner}>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>Sub Total (before tax)</Text>
              <Text style={S.totalValue}>{fmt(invoice.totalBeforeTax)}</Text>
            </View>
            {hasGst && (
              <View style={S.totalRow}>
                <Text style={[S.totalLabel, { color: EMERALD }]}>Tax (GST)</Text>
                <Text style={[S.totalValue, { color: EMERALD }]}>
                  {fmt(invoice.cgst + invoice.sgst + invoice.igst)}
                </Text>
              </View>
            )}
            {hasGst && invoice.gstType === GSTType.CGST_SGST && (
              <>
                <View style={S.totalRow}>
                  <Text style={[S.totalLabel, { fontSize: 7 }]}>  CGST</Text>
                  <Text style={[S.totalValue, { fontSize: 7 }]}>{fmt(invoice.cgst)}</Text>
                </View>
                <View style={S.totalRow}>
                  <Text style={[S.totalLabel, { fontSize: 7 }]}>  SGST</Text>
                  <Text style={[S.totalValue, { fontSize: 7 }]}>{fmt(invoice.sgst)}</Text>
                </View>
              </>
            )}
            {hasGst && invoice.gstType === GSTType.IGST && (
              <View style={S.totalRow}>
                <Text style={[S.totalLabel, { fontSize: 7 }]}>  IGST</Text>
                <Text style={[S.totalValue, { fontSize: 7 }]}>{fmt(invoice.igst)}</Text>
              </View>
            )}
            {/* Grand total */}
            <View style={[S.grandRow, { backgroundColor: PRIMARY }]}>
              <Text style={S.grandLabel}>TOTAL PAYABLE</Text>
              <Text style={S.grandValue}>{fmt(invoice.totalAmount)}</Text>
            </View>
          </View>
        </View>

        {/* ── Amount in words ── */}
        <Text style={S.amtWords}>In words: {toWords(invoice.totalAmount)}</Text>

        <View style={S.dividerThin} />

        {/* ── Bank details / Notes / T&C ── */}
        <View style={S.footerRow} wrap={false}>
          {(business.bankName || business.accountNumber) ? (
            <View style={S.footerBox}>
              <Text style={S.footerLabel}>Bank & Payment Details</Text>
              {business.bankName      && <Text style={S.footerValue}>Bank: {business.bankName}</Text>}
              {business.accountNumber && <Text style={S.footerValue}>A/c: {business.accountNumber}</Text>}
              {business.ifscCode      && <Text style={S.footerValue}>IFSC: {business.ifscCode}</Text>}
              {business.upiId         && (
                <Text style={[S.footerValue, { color: PRIMARY, fontFamily: 'Helvetica-Bold' }]}>
                  UPI ID: {business.upiId}
                </Text>
              )}
            </View>
          ) : null}
          {business.defaultNotes ? (
            <View style={S.footerBox}>
              <Text style={S.footerLabel}>Notes</Text>
              <Text style={[S.footerValue, { fontFamily: 'Helvetica-Oblique' }]}>
                {business.defaultNotes}
              </Text>
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

        {/* ── Page number ── */}
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
