/**
 * InvoicePDF — A4 tax invoice template for @react-pdf/renderer
 *
 * UPDATED: modern-2 PDF now matches the sample invoice style with a distinct header:
 *  - Business logo initial + name/details (left) | "Invoice" (right, primary colour)
 *  - Invoice number / date / status below the title (right side)
 *  - Primary-colour divider
 *  - Two tinted "Billed by / Billed to" cards
 *  - Place of Supply / Country of Supply row
 *  - Full GST table: # | Description | HSN | Qty | GST% | Taxable | SGST | CGST | Total
 *    (collapses SGST+CGST into single IGST column for inter-state invoices)
 *  - Two-column footer: Bank details + QR (left) | Sub/CGST/SGST/Total (right)
 *  - Terms & Conditions, Additional Notes, Contact + Signature strip
 *
 * modern-1 (sample invoice style):
 *  - Logo box left | "Invoice" centred (primary colour) | Invoice#/Date right
 *  - All the same quality sections as modern-2
 *
 * Retained fixes:
 *  - No Font.register() — using built-in Helvetica (custom WOFF URLs fail silently).
 *  - No Firebase logo image — CORS inside renderer; first-letter initial used instead.
 *  - wrap={false} on every table row — no row splits across pages.
 *  - Table header uses `fixed` prop — repeats on every page.
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';
import { Invoice, BusinessProfile, Customer, GSTType } from '../../types';

// ─── Static palette ────────────────────────────────────────────────────────────
const DARK    = '#1e293b';
const MID     = '#475569';
const LIGHT   = '#94a3b8';
const BORDER  = '#e2e8f0';
const ALT     = '#f8fafc';
const WHITE   = '#ffffff';

// ─── Helper: hex → rgba() ─────────────────────────────────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

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

// ─── Date formatter: YYYY-MM-DD → DD-MM-YYYY ─────────────────────────────────
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// ─── Currency formatter ───────────────────────────────────────────────────────
const fmt = (n: number) =>
  `Rs.${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Base stylesheet ──────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    backgroundColor: WHITE,
    paddingTop: 32,
    paddingBottom: 48,
    paddingHorizontal: 32,
    color: DARK,
  },

  // ── Dividers ──
  dividerPrimary: { height: 2, borderRadius: 2, marginBottom: 14 },
  dividerThin:    { height: 0.5, backgroundColor: BORDER, marginVertical: 10 },

  // ── Shared info boxes ──
  infoRow:       { flexDirection: 'row', gap: 12, marginBottom: 12 },
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
  badge:            { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start', marginTop: 5 },
  badgePaid:        { backgroundColor: '#dcfce7' },
  badgeUnpaid:      { backgroundColor: '#fee2e2' },
  badgePartial:     { backgroundColor: '#fef3c7' },
  badgeText:        { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  badgeTextPaid:    { color: '#16a34a' },
  badgeTextUnpaid:  { color: '#dc2626' },
  badgeTextPartial: { color: '#d97706' },

  // ── Generic table row ──
  tableHeader:     { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8, borderRadius: 3 },
  tableHeaderText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: WHITE, textTransform: 'uppercase' },
  tableRow:        { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', borderBottomStyle: 'solid' },
  tableRowAlt:     { backgroundColor: ALT },
  tableCell:       { fontSize: 8, color: MID },
  tableCellBold:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },

  // ── Page number ──
  pageNum: { position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', fontSize: 7, color: LIGHT },

  // ════════════════════════════════════════════════════════════════
  //  MODERN-1 — unique styles
  // ════════════════════════════════════════════════════════════════

  // Header row
  m1HdrRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  m1LogoBox:     { width: 54, height: 54, backgroundColor: ALT, borderRadius: 7, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', alignItems: 'center', justifyContent: 'center' },
  m1LogoInitial: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: DARK },
  m1TitleWrap:   { alignItems: 'center' },
  m1Title:       { fontSize: 36, fontFamily: 'Helvetica-Bold', letterSpacing: -0.5, lineHeight: 1 },
  m1TitleSub:    { fontSize: 6.5, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.9, marginTop: 2 },
  m1MetaRight:   { alignItems: 'flex-end' },
  m1MetaLabel:   { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  m1MetaValue:   { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK },

  // Supply info strip (shared by both templates)
  m1SupplyRow:   { flexDirection: 'row', gap: 10, marginBottom: 12 },
  m1SupplyBox:   { flex: 1, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 5, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', backgroundColor: ALT },
  m1SupplyLabel: { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8 },
  m1SupplyValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 2 },

  // Table columns (shared by both templates)
  // CGST_SGST mode: # | Desc | HSN | Qty | GST% | Taxable | SGST | CGST | Total
  m1cNo:   { width: '4%' },
  m1cDesc: { width: '24%' },
  m1cHsn:  { width: '10%', textAlign: 'center' },
  m1cQty:  { width: '6%',  textAlign: 'center' },
  m1cGst:  { width: '7%',  textAlign: 'center' },
  m1cTax:  { width: '13%', textAlign: 'right' },
  m1cHalf: { width: '9%',  textAlign: 'right' },   // SGST or CGST column (each)
  m1cIgst: { width: '18%', textAlign: 'right' },   // merged IGST column
  m1cTot:  { width: '18%', textAlign: 'right' },

  // Two-column footer (shared by both templates)
  m1FooterGrid:   { flexDirection: 'row', gap: 14, marginTop: 12 },
  m1FooterLeft:   { width: '56%' },
  m1FooterRight:  { flex: 1 },
  m1SecLabel:     { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },

  // Bank key-value rows
  m1BankRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  m1BankLabel: { fontSize: 7.5, color: LIGHT },
  m1BankValue: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: DARK },

  // QR code
  m1QrWrap:  { alignItems: 'center', marginLeft: 12 },
  m1QrLabel: { fontSize: 5.5, color: LIGHT, textAlign: 'center', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.6 },
  m1QrImg:   { width: 52, height: 52 },

  // Totals summary (right column, shared by both templates)
  m1TotRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: BORDER, borderBottomStyle: 'solid' },
  m1TotLabel:     { fontSize: 8.5, color: MID },
  m1TotValue:     { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: DARK },
  m1GrandSection: { marginTop: 6, paddingTop: 6 },
  m1GrandRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  m1GrandLabel:   { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  m1GrandValue:   { fontSize: 20, fontFamily: 'Helvetica-Bold' },
  m1WordsLabel:   { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 },
  m1WordsText:    { fontSize: 7.5, fontFamily: 'Helvetica-Oblique', color: DARK, marginTop: 2, lineHeight: 1.4 },

  // Contact + signature footer strip (shared by both templates)
  m1ContactStrip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12, paddingTop: 9, borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid' },
  m1ContactText:  { fontSize: 7.5, color: LIGHT, lineHeight: 1.6 },
  m1SignCol:      { alignItems: 'flex-end' },
  m1SignLine:     { width: 90, height: 0.5, backgroundColor: LIGHT, marginBottom: 4 },
  m1SignLabel:    { fontSize: 6.5, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  m1SignName:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 1 },

  // ════════════════════════════════════════════════════════════════
  //  MODERN-2 — unique header styles
  // ════════════════════════════════════════════════════════════════

  // Header: Business info (left) | Invoice title + meta (right)
  m2HdrRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  m2HdrLeft:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  m2LogoBox:     { width: 46, height: 46, borderRadius: 8, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  m2LogoInitial: { fontSize: 19, fontFamily: 'Helvetica-Bold' },
  m2BizBlock:    { flexDirection: 'column', flex: 1 },
  m2BizNameLg:   { fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 },
  m2BizDetail:   { fontSize: 7.5, color: MID, lineHeight: 1.5 },
  m2BizGstin:    { fontSize: 7.5, fontFamily: 'Helvetica-Bold', lineHeight: 1.5 },
  m2InvRight:    { alignItems: 'flex-end', flexShrink: 0 },
  m2InvTitle:    { fontSize: 36, fontFamily: 'Helvetica-Bold', letterSpacing: -0.5, lineHeight: 1 },
  m2InvMeta:     { marginTop: 6, alignItems: 'flex-end', gap: 3 },
  m2InvLabel:    { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  m2InvValue:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK },
});

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
  const isCgst     = invoice.gstType === GSTType.CGST_SGST;

  const itemsWithTax = invoice.items.map(item => {
    const lineTotal = item.quantity * item.rate;
    const taxAmt    = lineTotal * (item.gstRate / 100);
    const halfTax   = taxAmt / 2;
    return { ...item, lineTotal, taxAmt, halfTax, grandLine: lineTotal + taxAmt };
  });

  // QR URL (external, not Firebase — no CORS issue)
  const qrUrl = business.upiId
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
        `upi://pay?pa=${business.upiId}&pn=${encodeURIComponent(business.name)}&am=${invoice.totalAmount}&cu=INR`
      )}`
    : null;

  // Badge
  const badgeContainer = invoice.status === 'Paid'   ? [S.badge, S.badgePaid]
                       : invoice.status === 'Unpaid' ? [S.badge, S.badgeUnpaid]
                       :                               [S.badge, S.badgePartial];
  const badgeTxt       = invoice.status === 'Paid'   ? [S.badgeText, S.badgeTextPaid]
                       : invoice.status === 'Unpaid' ? [S.badgeText, S.badgeTextUnpaid]
                       :                               [S.badgeText, S.badgeTextPartial];

  // ── Shared: full GST table rows (used by both templates) ──────────────────
  const tableRows = itemsWithTax.map((item, idx) => (
    <View key={item.id} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
      <Text style={[S.tableCell, S.m1cNo]}>{idx + 1}</Text>
      <Text style={[S.tableCell, S.m1cDesc]}>{item.description}</Text>
      <Text style={[S.tableCell, S.m1cHsn]}>{item.hsnCode || '—'}</Text>
      <Text style={[S.tableCell, S.m1cQty]}>{item.quantity}</Text>
      {hasGst && <Text style={[S.tableCell, S.m1cGst]}>{item.gstRate}%</Text>}
      <Text style={[S.tableCell, S.m1cTax]}>{fmt(item.lineTotal)}</Text>
      {hasGst && isCgst ? (
        <>
          <Text style={[S.tableCell, S.m1cHalf]}>{fmt(item.halfTax)}</Text>
          <Text style={[S.tableCell, S.m1cHalf]}>{fmt(item.halfTax)}</Text>
        </>
      ) : hasGst ? (
        <Text style={[S.tableCell, S.m1cIgst]}>{fmt(item.taxAmt)}</Text>
      ) : null}
      <Text style={[S.tableCellBold, S.m1cTot]}>{fmt(item.grandLine)}</Text>
    </View>
  ));

  // ── Shared: table header ───────────────────────────────────────────────────
  const tableHeader = (
    <View style={[S.tableHeader, { backgroundColor: PRIMARY }]} fixed>
      <Text style={[S.tableHeaderText, S.m1cNo]}>#</Text>
      <Text style={[S.tableHeaderText, S.m1cDesc]}>Item Description</Text>
      <Text style={[S.tableHeaderText, S.m1cHsn]}>HSN/SAC</Text>
      <Text style={[S.tableHeaderText, S.m1cQty]}>Qty</Text>
      {hasGst && <Text style={[S.tableHeaderText, S.m1cGst]}>GST%</Text>}
      <Text style={[S.tableHeaderText, S.m1cTax]}>Taxable Amt</Text>
      {hasGst && isCgst ? (
        <>
          <Text style={[S.tableHeaderText, S.m1cHalf]}>SGST</Text>
          <Text style={[S.tableHeaderText, S.m1cHalf]}>CGST</Text>
        </>
      ) : hasGst ? (
        <Text style={[S.tableHeaderText, S.m1cIgst]}>IGST</Text>
      ) : null}
      <Text style={[S.tableHeaderText, S.m1cTot]}>Total</Text>
    </View>
  );

  // ── Shared: two-column footer (Bank+QR left | Totals right) ───────────────
  const twoColFooter = (
    <View style={S.m1FooterGrid} wrap={false}>

      {/* LEFT: Bank + T&C + Notes */}
      <View style={S.m1FooterLeft}>
        <Text style={[S.m1SecLabel, { color: PRIMARY }]}>Bank & Payment Details</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            {business.bankName && (
              <View style={S.m1BankRow}>
                <Text style={S.m1BankLabel}>Bank</Text>
                <Text style={S.m1BankValue}>{business.bankName}</Text>
              </View>
            )}
            {business.accountNumber && (
              <View style={S.m1BankRow}>
                <Text style={S.m1BankLabel}>Account No.</Text>
                <Text style={S.m1BankValue}>{business.accountNumber}</Text>
              </View>
            )}
            {business.ifscCode && (
              <View style={S.m1BankRow}>
                <Text style={S.m1BankLabel}>IFSC</Text>
                <Text style={S.m1BankValue}>{business.ifscCode}</Text>
              </View>
            )}
            {business.upiId && (
              <View style={[S.m1BankRow, { borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid', paddingTop: 3, marginTop: 2 }]}>
                <Text style={S.m1BankLabel}>UPI ID</Text>
                <Text style={[S.m1BankValue, { color: PRIMARY }]}>{business.upiId}</Text>
              </View>
            )}
          </View>
          {qrUrl && (
            <View style={S.m1QrWrap}>
              <Text style={S.m1QrLabel}>Scan to Pay</Text>
              <Image style={S.m1QrImg} src={qrUrl} />
            </View>
          )}
        </View>

        {business.termsAndConditions ? (
          <View style={{ marginTop: 10 }}>
            <Text style={[S.m1SecLabel, { color: PRIMARY }]}>Terms & Conditions</Text>
            <Text style={{ fontSize: 7.5, color: MID, lineHeight: 1.5 }}>
              {business.termsAndConditions}
            </Text>
          </View>
        ) : null}

        {business.defaultNotes ? (
          <View style={{ marginTop: 8 }}>
            <Text style={[S.m1SecLabel, { color: PRIMARY }]}>Additional Notes</Text>
            <Text style={{ fontSize: 7.5, color: MID, fontFamily: 'Helvetica-Oblique', lineHeight: 1.5 }}>
              {business.defaultNotes}
            </Text>
          </View>
        ) : null}
      </View>

      {/* RIGHT: Totals */}
      <View style={S.m1FooterRight}>
        <View style={S.m1TotRow}>
          <Text style={S.m1TotLabel}>Sub Total</Text>
          <Text style={S.m1TotValue}>{fmt(invoice.totalBeforeTax)}</Text>
        </View>
        {hasGst && isCgst ? (
          <>
            <View style={S.m1TotRow}>
              <Text style={S.m1TotLabel}>CGST</Text>
              <Text style={S.m1TotValue}>{fmt(invoice.cgst)}</Text>
            </View>
            <View style={S.m1TotRow}>
              <Text style={S.m1TotLabel}>SGST</Text>
              <Text style={S.m1TotValue}>{fmt(invoice.sgst)}</Text>
            </View>
          </>
        ) : hasGst ? (
          <View style={S.m1TotRow}>
            <Text style={S.m1TotLabel}>IGST</Text>
            <Text style={S.m1TotValue}>{fmt(invoice.igst)}</Text>
          </View>
        ) : null}

        <View style={[S.m1GrandSection, { borderTopWidth: 2, borderTopColor: PRIMARY, borderTopStyle: 'solid' }]}>
          <View style={S.m1GrandRow}>
            <Text style={[S.m1GrandLabel, { color: PRIMARY }]}>Total</Text>
            <Text style={[S.m1GrandValue, { color: PRIMARY }]}>{fmt(invoice.totalAmount)}</Text>
          </View>
        </View>

        <Text style={S.m1WordsLabel}>Invoice Total (in words)</Text>
        <Text style={S.m1WordsText}>{toWords(invoice.totalAmount)}</Text>
      </View>
    </View>
  );

  // ── Shared: contact + signature strip ─────────────────────────────────────
  const contactSignature = (
    <View style={S.m1ContactStrip} wrap={false}>
      <View>
        {business.email ? <Text style={S.m1ContactText}>✉  {business.email}</Text> : null}
        {business.phone ? <Text style={S.m1ContactText}>✆  {business.phone}</Text> : null}
      </View>
      <View style={S.m1SignCol}>
        {business.signatureUrl ? (
          <Image
            style={{ width: 120, height: 40, objectFit: 'contain', marginBottom: 4 }}
            src={business.signatureUrl}
          />
        ) : (
          <View style={S.m1SignLine} />
        )}
        <Text style={S.m1SignLabel}>Authorised Signatory</Text>
        <Text style={S.m1SignName}>{business.name}</Text>
      </View>
    </View>
  );

  // ── Shared: tinted Billed By / Billed To cards ────────────────────────────
  const billedCards = (
    <View style={S.infoRow}>
      <View style={[S.infoBoxTinted, { backgroundColor: hexToRgba(PRIMARY, 0.07) }]}>
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

      <View style={[S.infoBoxTinted, { backgroundColor: hexToRgba(PRIMARY, 0.07) }]}>
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
  );

  // ── Shared: Place of Supply / Country of Supply ───────────────────────────
  const supplyStrip = (
    <View style={S.m1SupplyRow}>
      <View style={S.m1SupplyBox}>
        <Text style={S.m1SupplyLabel}>Place of Supply</Text>
        <Text style={S.m1SupplyValue}>{customer.state || business.state}</Text>
      </View>
      <View style={S.m1SupplyBox}>
        <Text style={S.m1SupplyLabel}>Country of Supply</Text>
        <Text style={S.m1SupplyValue}>India</Text>
      </View>
    </View>
  );

  // ── Shared: page number ────────────────────────────────────────────────────
  const pageNumber = (
    <Text
      style={S.pageNum}
      render={({ pageNumber, totalPages }) =>
        `Page ${pageNumber} of ${totalPages}  |  Generated by BillHippo`
      }
      fixed
    />
  );

  // ════════════════════════════════════════════════════════════════
  //  MODERN-1 TEMPLATE
  //  Matches the sample invoice style:
  //  Logo | "Invoice" centred (primary) | Invoice#/Date
  //  Primary divider
  //  Tinted Billed by / Billed to cards
  //  Place of Supply / Country of Supply strip
  //  Full GST table (SGST + CGST columns, or merged IGST)
  //  Bank details + QR (left) | Totals (right)
  //  Terms · Notes · Contact + Signature
  // ════════════════════════════════════════════════════════════════
  if (templateId === 'modern-1') {
    return (
      <Document title={`Invoice ${invoice.invoiceNumber}`} author={business.name} creator="BillHippo">
        <Page size="A4" style={S.page} wrap>

          {/* ── Header (fixed — repeats on every page) ── */}
          <View fixed style={{ marginBottom: 14 }}>
            <View style={S.m1HdrRow}>
              {/* Logo / initial (left) */}
              <View style={S.m1LogoBox}>
                {business.theme?.logoUrl ? (
                  <Image
                    style={{ width: 48, height: 48, objectFit: 'contain' }}
                    src={business.theme.logoUrl}
                  />
                ) : (
                  <Text style={[S.m1LogoInitial, { color: PRIMARY }]}>
                    {business.name.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>

              {/* "Invoice" centred */}
              <View style={S.m1TitleWrap}>
                <Text style={[S.m1Title, { color: PRIMARY }]}>Invoice</Text>
                <Text style={S.m1TitleSub}>GST Compliant Tax Invoice</Text>
              </View>

              {/* Invoice # / Date / Status (right) */}
              <View style={S.m1MetaRight}>
                <Text style={S.m1MetaLabel}>Invoice #</Text>
                <Text style={S.m1MetaValue}>{invoice.invoiceNumber}</Text>
                <View style={{ marginTop: 5 }}>
                  <Text style={S.m1MetaLabel}>Invoice Date</Text>
                  <Text style={S.m1MetaValue}>{formatDate(invoice.date)}</Text>
                </View>
                <View style={badgeContainer}>
                  <Text style={badgeTxt}>{invoice.status}</Text>
                </View>
              </View>
            </View>

            {/* Primary-colour divider */}
            <View style={[S.dividerPrimary, { backgroundColor: PRIMARY }]} />
          </View>

          {billedCards}
          {supplyStrip}
          {tableHeader}
          {tableRows}
          {twoColFooter}
          {contactSignature}
          {pageNumber}
        </Page>
      </Document>
    );
  }

  // ════════════════════════════════════════════════════════════════
  //  MODERN-2 (default) + MINIMAL TEMPLATES
  //  Business logo initial + name/details (left) | "Invoice" (right, primary)
  //  Invoice number / date below the title (right side)
  //  Primary divider
  //  Tinted Billed By / Billed To cards
  //  Place of Supply / Country of Supply strip
  //  Full GST table (same structure as Modern-1)
  //  Two-column footer: Bank details + QR (left) | Totals (right)
  //  Terms · Notes · Contact + Signature
  // ════════════════════════════════════════════════════════════════
  return (
    <Document title={`Invoice ${invoice.invoiceNumber}`} author={business.name} creator="BillHippo">
      <Page size="A4" style={S.page} wrap>

        {/* ── Header (fixed — repeats on every page) ── */}
        <View fixed style={{ marginBottom: 14 }}>
          <View style={S.m2HdrRow}>

            {/* LEFT: Business logo initial + details */}
            <View style={S.m2HdrLeft}>
              <View style={[S.m2LogoBox, { backgroundColor: hexToRgba(PRIMARY, 0.10), borderColor: hexToRgba(PRIMARY, 0.25), borderStyle: 'solid' }]}>
                {business.theme?.logoUrl ? (
                  <Image
                    style={{ width: 40, height: 40, objectFit: 'contain' }}
                    src={business.theme.logoUrl}
                  />
                ) : (
                  <Text style={[S.m2LogoInitial, { color: PRIMARY }]}>
                    {business.name.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={S.m2BizBlock}>
                <Text style={S.m2BizNameLg}>{business.name}</Text>
                {business.address ? <Text style={S.m2BizDetail}>{business.address}, {business.city}</Text> : null}
                {business.state   ? <Text style={S.m2BizDetail}>{business.state} – {business.pincode}</Text> : null}
                {business.gstin   ? <Text style={[S.m2BizGstin, { color: PRIMARY }]}>GSTIN: {business.gstin}</Text> : null}
                {business.pan     ? <Text style={S.m2BizDetail}>PAN: {business.pan}</Text> : null}
                {business.phone   ? <Text style={S.m2BizDetail}>Ph: {business.phone}</Text> : null}
                {business.email   ? <Text style={S.m2BizDetail}>{business.email}</Text> : null}
              </View>
            </View>

            {/* RIGHT: "Invoice" large + invoice metadata */}
            <View style={S.m2InvRight}>
              <Text style={[S.m2InvTitle, { color: PRIMARY }]}>Invoice</Text>
              <View style={S.m2InvMeta}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={S.m2InvLabel}>Invoice #</Text>
                  <Text style={S.m2InvValue}>{invoice.invoiceNumber}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={S.m2InvLabel}>Date</Text>
                  <Text style={S.m2InvValue}>{formatDate(invoice.date)}</Text>
                </View>
                <View style={[badgeContainer[0], badgeContainer[1], { alignSelf: 'flex-end' }]}>
                  <Text style={badgeTxt}>{invoice.status}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Primary-colour divider */}
          <View style={[S.dividerPrimary, { backgroundColor: PRIMARY }]} />
        </View>

        {billedCards}
        {supplyStrip}
        {tableHeader}
        {tableRows}
        {twoColFooter}
        {contactSignature}
        {pageNumber}
      </Page>
    </Document>
  );
};

export default InvoicePDF;
