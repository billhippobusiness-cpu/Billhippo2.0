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
 *  - Poppins registered via Font.register() from @fontsource/poppins on jsDelivr CDN (CORS-safe).
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
  Font,
  Svg,
  Path,
  Polygon,
  Rect,
  Circle,
  Line,
} from '@react-pdf/renderer';
import { Invoice, BusinessProfile, Customer, GSTType } from '../../types';

// ─── Register Poppins (all weights) from local TTF files ──────────────────────
// woff2 causes "RangeError: Offset is outside the bounds of the DataView" in
// @react-pdf/renderer's fontkit parser. TTF files work reliably.
// Files are served from /public/fonts/ via Vite's static asset serving.
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

// Disable word-level hyphenation — keeps text blocks clean
Font.registerHyphenationCallback(word => [word]);

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

// ─── Helper: blend two hex colours (t=0 → a, t=1 → b) ─────────────────────────
// Used by the Geometric template to derive its navy secondary tone from whatever
// primary colour the user has selected, keeping the dual-tone look cohesive.
function mixHex(a: string, b: string, t: number): string {
  const ah = a.replace('#', ''), bh = b.replace('#', '');
  const ch = (i: number) => {
    const av = parseInt(ah.slice(i, i + 2), 16);
    const bv = parseInt(bh.slice(i, i + 2), 16);
    return Math.round(av * (1 - t) + bv * t).toString(16).padStart(2, '0');
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
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
  `\u20B9${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;


const r2 = (n: number) => Math.round(n * 100) / 100;
// ─── Base stylesheet ──────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Poppins',
    fontWeight: 400,
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
  infoBoxLabel:  { fontSize: 7, fontFamily: 'Poppins', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 5 },
  infoName:      { fontSize: 11, fontFamily: 'Poppins', fontWeight: 700, color: DARK, marginBottom: 2 },
  infoSm:        { fontSize: 7.5, color: MID, lineHeight: 1.5 },
  infoMeta:      { flexDirection: 'row', gap: 14, marginTop: 6, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid' },
  infoMetaCol:   { flexDirection: 'column' },
  infoMetaLabel: { fontSize: 7, fontFamily: 'Poppins', fontWeight: 500, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  infoMetaValue: { fontSize: 8, fontFamily: 'Poppins', fontWeight: 600, color: DARK },

  // ── Status badge ──
  badge:            { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start', marginTop: 5 },
  badgePaid:        { backgroundColor: '#dcfce7' },
  badgeUnpaid:      { backgroundColor: '#fee2e2' },
  badgePartial:     { backgroundColor: '#fef3c7' },
  badgeText:        { fontSize: 7, fontFamily: 'Poppins', fontWeight: 700, textTransform: 'uppercase' },
  badgeTextPaid:    { color: '#16a34a' },
  badgeTextUnpaid:  { color: '#dc2626' },
  badgeTextPartial: { color: '#d97706' },

  // ── Generic table row ──
  tableHeader:     { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8, borderRadius: 3 },
  tableHeaderText: { fontSize: 7, fontFamily: 'Poppins', fontWeight: 700, color: WHITE, textTransform: 'uppercase' },
  tableRow:        { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', borderBottomStyle: 'solid' },
  tableRowAlt:     { backgroundColor: ALT },
  tableCell:       { fontSize: 8, color: MID },
  tableCellBold:   { fontSize: 8, fontFamily: 'Poppins', fontWeight: 600, color: DARK },

  // ── Page number ──
  pageNum: { position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', fontSize: 7, color: LIGHT },

  // ════════════════════════════════════════════════════════════════
  //  MODERN-1 — unique styles
  // ════════════════════════════════════════════════════════════════

  // Header row
  m1HdrRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  m1LogoBox:     { width: 54, height: 54, backgroundColor: ALT, borderRadius: 7, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', alignItems: 'center', justifyContent: 'center' },
  m1LogoInitial: { fontSize: 20, fontFamily: 'Poppins', fontWeight: 800, color: DARK },
  m1TitleWrap:   { alignItems: 'center' },
  m1Title:       { fontSize: 38, fontFamily: 'Poppins', fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 },
  m1TitleSub:    { fontSize: 6.5, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.9, marginTop: 2 },
  m1MetaRight:   { alignItems: 'flex-end' },
  m1MetaLabel:   { fontSize: 6.5, fontFamily: 'Poppins', fontWeight: 500, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  m1MetaValue:   { fontSize: 9, fontFamily: 'Poppins', fontWeight: 600, color: DARK },

  // Supply info strip (shared by both templates)
  m1SupplyRow:   { flexDirection: 'row', gap: 10, marginBottom: 12 },
  m1SupplyBox:   { flex: 1, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 5, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', backgroundColor: ALT },
  m1SupplyLabel: { fontSize: 6.5, fontFamily: 'Poppins', fontWeight: 500, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8 },
  m1SupplyValue: { fontSize: 9, fontFamily: 'Poppins', fontWeight: 600, color: DARK, marginTop: 2 },

  // Table columns (shared by both templates)
  // CGST_SGST mode: # | Desc | HSN | Qty | Rate | GST% | Taxable | SGST | CGST | Total
  m1cNo:   { width: '4%' },
  m1cDesc: { width: '20%' },
  m1cHsn:  { width: '10%', textAlign: 'center' },
  m1cQty:  { width: '6%',  textAlign: 'center' },
  m1cRate: { width: '10%', textAlign: 'right' },   // Rate per unit column
  m1cGst:  { width: '6%',  textAlign: 'center' },
  m1cTax:  { width: '12%', textAlign: 'right' },
  m1cHalf: { width: '8%',  textAlign: 'right' },   // SGST or CGST column (each)
  m1cIgst: { width: '16%', textAlign: 'right' },   // merged IGST column
  m1cTot:  { width: '16%', textAlign: 'right' },

  // Two-column footer (shared by both templates)
  m1FooterGrid:   { flexDirection: 'row', gap: 14, marginTop: 12 },
  m1FooterLeft:   { width: '56%' },
  m1FooterRight:  { flex: 1 },
  m1SecLabel:     { fontSize: 7, fontFamily: 'Poppins', fontWeight: 600, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },

  // Bank key-value rows
  m1BankRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5 },
  m1BankLabel: { fontSize: 7.5, color: LIGHT },
  m1BankValue: { fontSize: 7.5, fontFamily: 'Poppins', fontWeight: 600, color: DARK },

  // QR code
  m1QrWrap:  { alignItems: 'center', marginLeft: 12 },
  m1QrLabel: { fontSize: 5.5, color: LIGHT, textAlign: 'center', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.6 },
  m1QrImg:   { width: 52, height: 52 },

  // Totals summary (right column, shared by both templates)
  m1TotRow:       { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3.5, borderBottomWidth: 0.5, borderBottomColor: BORDER, borderBottomStyle: 'solid' },
  m1TotLabel:     { fontSize: 8.5, color: MID },
  m1TotValue:     { fontSize: 8.5, fontFamily: 'Poppins', fontWeight: 600, color: DARK },
  m1GrandSection: { marginTop: 6, paddingTop: 6 },
  m1GrandRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  m1GrandLabel:   { fontSize: 18, fontFamily: 'Poppins', fontWeight: 800 },
  m1GrandValue:   { fontSize: 24, fontFamily: 'Poppins', fontWeight: 800 },
  m1WordsLabel:   { fontSize: 6.5, fontFamily: 'Poppins', fontWeight: 500, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 },
  m1WordsText:    { fontSize: 7.5, fontFamily: 'Poppins', fontStyle: 'italic', color: DARK, marginTop: 2, lineHeight: 1.4 },

  // Contact + signature footer strip (shared by both templates)
  m1ContactStrip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12, paddingTop: 9, borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid' },
  m1ContactText:  { fontSize: 7.5, color: LIGHT, lineHeight: 1.6 },
  m1SignCol:      { alignItems: 'flex-end' },
  m1SignLine:     { width: 120, height: 40, marginBottom: 4 },
  m1SignLabel:    { fontSize: 6.5, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  m1SignName:     { fontSize: 8, fontFamily: 'Poppins', fontWeight: 600, color: DARK, marginTop: 1 },

  // ════════════════════════════════════════════════════════════════
  //  MODERN-2 — unique header styles
  // ════════════════════════════════════════════════════════════════

  // Header: Business info (left) | Invoice title + meta (right)
  m2HdrRow:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  m2HdrLeft:     { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  m2LogoBox:     { width: 64, height: 64, borderRadius: 8, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  m2LogoInitial: { fontSize: 24, fontFamily: 'Poppins', fontWeight: 800 },
  m2BizBlock:    { flexDirection: 'column', flex: 1, maxWidth: 210 },
  m2BizNameLg:   { fontSize: 13, fontFamily: 'Poppins', fontWeight: 700, color: DARK, marginBottom: 2 },
  m2BizDetail:   { fontSize: 7.5, color: MID, lineHeight: 1.5 },
  m2BizGstin:    { fontSize: 7.5, fontFamily: 'Poppins', fontWeight: 600, lineHeight: 1.5 },
  m2InvRight:    { alignItems: 'flex-end', flexShrink: 0 },
  m2InvTitle:    { fontSize: 38, fontFamily: 'Poppins', fontWeight: 800, letterSpacing: -0.5, lineHeight: 1 },
  m2InvMeta:     { marginTop: 6, alignItems: 'flex-end', gap: 3 },
  m2InvLabel:    { fontSize: 6.5, fontFamily: 'Poppins', fontWeight: 500, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  m2InvValue:    { fontSize: 9, fontFamily: 'Poppins', fontWeight: 600, color: DARK },

  // ════════════════════════════════════════════════════════════════
  //  GEOMETRIC — corporate template unique styles
  // ════════════════════════════════════════════════════════════════

  // Header
  gHdrRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  gHdrLeft:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flex: 1 },
  gLogoBox:      { width: 58, height: 58, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  gLogoInitial:  { fontSize: 26, fontFamily: 'Poppins', fontWeight: 800 },
  gBizName:      { fontSize: 17, fontFamily: 'Poppins', fontWeight: 800, color: DARK, marginBottom: 3, letterSpacing: -0.3 },
  gBizDetail:    { fontSize: 7.5, color: MID, lineHeight: 1.5 },
  gBizGstin:     { fontSize: 8, fontFamily: 'Poppins', fontWeight: 700, lineHeight: 1.6 },
  gHdrRight:     { alignItems: 'flex-end', flexShrink: 0, width: 190 },
  gInvBannerWrap:{ position: 'relative', width: 176, height: 40, marginBottom: 8 },
  gInvBannerTxt: { position: 'absolute', top: 0, left: 0, width: 176, height: 40, textAlign: 'right', paddingRight: 16, paddingTop: 6, fontSize: 24, fontFamily: 'Poppins', fontWeight: 800, color: WHITE, letterSpacing: 1 },
  gMetaRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 3 },
  gMetaLabel:    { fontSize: 6.5, fontFamily: 'Poppins', fontWeight: 600, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  gMetaValue:    { fontSize: 9.5, fontFamily: 'Poppins', fontWeight: 700, color: DARK },

  // Geometric divider strip of triangles
  gTriStrip:     { marginTop: 4, marginBottom: 14 },

  // Section label (hexagon + angular banner)
  gSecRow:       { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  gSecBannerWrap:{ position: 'relative', height: 17, justifyContent: 'center', marginLeft: -3 },
  gSecBannerTxt: { fontSize: 8, fontFamily: 'Poppins', fontWeight: 700, color: WHITE, textTransform: 'uppercase', letterSpacing: 1, paddingLeft: 9, paddingRight: 14 },

  // Billed cards (geometric)
  gCardRow:      { flexDirection: 'row', gap: 12, marginBottom: 12 },
  gCard:         { flex: 1, borderRadius: 8, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', overflow: 'hidden' },
  gCardBody:     { padding: 10, paddingTop: 8 },
  gCardName:     { fontSize: 11, fontFamily: 'Poppins', fontWeight: 700, color: DARK, marginBottom: 2 },
  gCardSm:       { fontSize: 7.5, color: MID, lineHeight: 1.5 },
  gCardMetaLabel:{ fontSize: 6.5, fontFamily: 'Poppins', fontWeight: 600, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 5 },
  gCardMetaValue:{ fontSize: 8.5, fontFamily: 'Poppins', fontWeight: 700, color: DARK },

  // Supply strip (geometric)
  gSupplyRow:    { flexDirection: 'row', gap: 12, marginBottom: 14 },
  gSupplyBox:    { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', backgroundColor: ALT },
  gSupplyLabel:  { fontSize: 6.5, fontFamily: 'Poppins', fontWeight: 600, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  gSupplyValue:  { fontSize: 10, fontFamily: 'Poppins', fontWeight: 700, color: DARK, marginTop: 1 },

  // Table header (navy)
  gTblHeaderText:{ fontSize: 7, fontFamily: 'Poppins', fontWeight: 700, color: WHITE, textTransform: 'uppercase' },

  // Big angular TOTAL banner
  gTotalWrap:    { position: 'relative', height: 44, marginTop: 8 },
  gTotalTxt:     { position: 'absolute', top: 0, left: 0, right: 0, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 26, paddingRight: 18 },
  gTotalLabel:   { fontSize: 15, fontFamily: 'Poppins', fontWeight: 800, color: WHITE, textTransform: 'uppercase', letterSpacing: 1 },
  gTotalValue:   { fontSize: 22, fontFamily: 'Poppins', fontWeight: 800, color: WHITE },

  // Invoice total in words (tinted angular box)
  gWordsBox:     { marginTop: 12, borderRadius: 8, padding: 10, position: 'relative', overflow: 'hidden' },
  gWordsLabel:   { fontSize: 7, fontFamily: 'Poppins', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  gWordsText:    { fontSize: 9, fontFamily: 'Poppins', fontWeight: 700, fontStyle: 'italic', color: DARK, marginTop: 3, lineHeight: 1.4 },
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
    const lineTotal = r2(item.quantity * item.rate);
    const taxAmt    = r2(lineTotal * (item.gstRate / 100));
    const halfTax   = r2(taxAmt / 2);
    return { ...item, lineTotal, taxAmt, halfTax, grandLine: r2(lineTotal + taxAmt) };
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
      <View style={[S.m1cDesc, { justifyContent: 'center' }]}>
        <Text style={[S.tableCell]}>{item.description}</Text>
        {item.notes ? <Text style={{ fontSize: 6.5, color: '#94a3b8', marginTop: 2, fontStyle: 'italic' }}>{item.notes}</Text> : null}
      </View>
      <Text style={[S.tableCell, S.m1cHsn]}>{item.hsnCode || '—'}</Text>
      <Text style={[S.tableCell, S.m1cQty]}>{item.quantity}</Text>
      <Text style={[S.tableCell, S.m1cRate]}>{fmt(item.rate)}</Text>
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
      <Text style={[S.tableHeaderText, S.m1cRate]}>Rate (₹)</Text>
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
            <Text style={{ fontSize: 7.5, color: MID, fontFamily: 'Poppins', fontStyle: 'italic', lineHeight: 1.5 }}>
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
        {(() => {
          const rawTotal = r2(invoice.totalBeforeTax + invoice.cgst + invoice.sgst + invoice.igst);
          const roundOff = r2(invoice.totalAmount - rawTotal);
          return roundOff !== 0 ? (
            <View style={S.m1TotRow}>
              <Text style={S.m1TotLabel}>Round Off</Text>
              <Text style={S.m1TotValue}>{roundOff > 0 ? '+' : ''}{fmt(Math.abs(roundOff))}</Text>
            </View>
          ) : null;
        })()}

        <View style={[S.m1GrandSection, { borderTopWidth: 2, borderTopColor: PRIMARY, borderTopStyle: 'solid' }]}>
          <View style={S.m1GrandRow}>
            <Text style={[S.m1GrandLabel, { color: PRIMARY }]}>Total</Text>
            <Text style={[S.m1GrandValue, { color: PRIMARY }]}>₹{invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
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
  //  GEOMETRIC CORPORATE TEMPLATE
  //  Teal (primary) + derived navy dual-tone, angular banners, hexagon
  //  section badges, navy table header, big angular TEAL "TOTAL" banner.
  //  Matches the "Geometric Corporate Invoice" design.
  // ════════════════════════════════════════════════════════════════
  if (templateId === 'geometric') {
    const TEAL      = PRIMARY;
    const NAVY      = mixHex(PRIMARY, '#0e2a4a', 0.68);
    const TEAL_TINT = hexToRgba(TEAL, 0.08);

    const SUMMARY_W = 210;   // right-hand summary column width
    const CONTENT_W = 531;   // A4 minus horizontal padding

    // Hexagon badge with a white glyph inside
    const hexIcon = (kind: string) => (
      <Svg width={20} height={20} viewBox="0 0 20 20">
        <Polygon points="10,1 18,5.5 18,14.5 10,19 2,14.5 2,5.5" fill={TEAL} />
        {kind === 'person' && (
          <>
            <Circle cx={10} cy={7.6} r={2.4} fill={WHITE} />
            <Path d="M5.6 15.6 C5.6 11.4 14.4 11.4 14.4 15.6 Z" fill={WHITE} />
          </>
        )}
        {kind === 'building' && (
          <>
            <Rect x={6} y={5.4} width={8} height={9.6} fill={WHITE} />
            <Line x1={8.7} y1={6.4} x2={8.7} y2={14} stroke={TEAL} strokeWidth={0.9} />
            <Line x1={11.3} y1={6.4} x2={11.3} y2={14} stroke={TEAL} strokeWidth={0.9} />
          </>
        )}
        {kind === 'pin' && (
          <>
            <Path d="M10 5 C7.2 5 5.6 7 5.6 9 C5.6 12 10 15.4 10 15.4 C10 15.4 14.4 12 14.4 9 C14.4 7 12.8 5 10 5 Z" fill={WHITE} />
            <Circle cx={10} cy={9} r={1.6} fill={TEAL} />
          </>
        )}
        {kind === 'globe' && (
          <>
            <Circle cx={10} cy={10} r={4.4} stroke={WHITE} strokeWidth={1} fill="none" />
            <Line x1={5.6} y1={10} x2={14.4} y2={10} stroke={WHITE} strokeWidth={1} />
            <Path d="M10 5.6 C7.2 7.2 7.2 12.8 10 14.4 C12.8 12.8 12.8 7.2 10 5.6 Z" stroke={WHITE} strokeWidth={1} fill="none" />
          </>
        )}
        {kind === 'bank' && (
          <>
            <Polygon points="10,5 16,8.4 4,8.4" fill={WHITE} />
            <Rect x={5} y={13.6} width={10} height={1.6} fill={WHITE} />
            <Line x1={7} y1={9.2} x2={7} y2={13.2} stroke={WHITE} strokeWidth={1.3} />
            <Line x1={10} y1={9.2} x2={10} y2={13.2} stroke={WHITE} strokeWidth={1.3} />
            <Line x1={13} y1={9.2} x2={13} y2={13.2} stroke={WHITE} strokeWidth={1.3} />
          </>
        )}
        {kind === 'chart' && (
          <>
            <Rect x={5.6} y={11} width={2.2} height={4} fill={WHITE} />
            <Rect x={8.9} y={9} width={2.2} height={6} fill={WHITE} />
            <Rect x={12.2} y={7} width={2.2} height={8} fill={WHITE} />
          </>
        )}
        {kind === 'shield' && (
          <Path d="M10 4.6 L15 6.3 L15 10 C15 13.2 10 15.7 10 15.7 C10 15.7 5 13.2 5 10 L5 6.3 Z" fill={WHITE} />
        )}
        {kind === 'note' && (
          <>
            <Rect x={6} y={5} width={8} height={10} fill={WHITE} />
            <Line x1={7.6} y1={7.6} x2={12.4} y2={7.6} stroke={TEAL} strokeWidth={0.9} />
            <Line x1={7.6} y1={10} x2={12.4} y2={10} stroke={TEAL} strokeWidth={0.9} />
            <Line x1={7.6} y1={12.4} x2={10.6} y2={12.4} stroke={TEAL} strokeWidth={0.9} />
          </>
        )}
      </Svg>
    );

    // Section label = hexagon badge + navy angular banner
    const secLabel = (label: string, kind: string) => {
      const bw = Math.max(58, label.length * 6.1 + 28);
      return (
        <View style={S.gSecRow}>
          {hexIcon(kind)}
          <View style={[S.gSecBannerWrap, { width: bw }]}>
            <Svg width={bw} height={17} style={{ position: 'absolute', top: 0, left: 0 }}>
              <Polygon points={`0,0 ${bw},0 ${bw - 8},17 0,17`} fill={NAVY} />
            </Svg>
            <Text style={S.gSecBannerTxt}>{label}</Text>
          </View>
        </View>
      );
    };

    // Navy table header (reuses shared column widths)
    const gTableHeader = (
      <View style={[S.tableHeader, { backgroundColor: NAVY }]} fixed>
        <Text style={[S.gTblHeaderText, S.m1cNo]}>#</Text>
        <Text style={[S.gTblHeaderText, S.m1cDesc]}>Item Description</Text>
        <Text style={[S.gTblHeaderText, S.m1cHsn]}>HSN/SAC</Text>
        <Text style={[S.gTblHeaderText, S.m1cQty]}>Qty</Text>
        <Text style={[S.gTblHeaderText, S.m1cRate]}>Rate (₹)</Text>
        {hasGst && <Text style={[S.gTblHeaderText, S.m1cGst]}>GST%</Text>}
        <Text style={[S.gTblHeaderText, S.m1cTax]}>Taxable Amt</Text>
        {hasGst && isCgst ? (
          <>
            <Text style={[S.gTblHeaderText, S.m1cHalf]}>SGST</Text>
            <Text style={[S.gTblHeaderText, S.m1cHalf]}>CGST</Text>
          </>
        ) : hasGst ? (
          <Text style={[S.gTblHeaderText, S.m1cIgst]}>IGST</Text>
        ) : null}
        <Text style={[S.gTblHeaderText, S.m1cTot]}>Total</Text>
      </View>
    );

    const rawTotalG = r2(invoice.totalBeforeTax + invoice.cgst + invoice.sgst + invoice.igst);
    const roundOffG = r2(invoice.totalAmount - rawTotalG);

    return (
      <Document title={`Invoice ${invoice.invoiceNumber}`} author={business.name} creator="BillHippo">
        <Page size="A4" style={S.page} wrap>

          {/* ── Header (fixed — repeats on every page) ── */}
          <View fixed>
            <View style={S.gHdrRow}>

              {/* LEFT: logo + business details */}
              <View style={S.gHdrLeft}>
                <View style={[S.gLogoBox, { borderColor: TEAL }]}>
                  {business.theme?.logoUrl ? (
                    <Image style={{ width: 50, height: 50, objectFit: 'contain' }} src={business.theme.logoUrl} />
                  ) : (
                    <Text style={[S.gLogoInitial, { color: TEAL }]}>{business.name.charAt(0).toUpperCase()}</Text>
                  )}
                </View>
                <View style={{ flex: 1, maxWidth: 250 }}>
                  <Text style={S.gBizName}>{business.name}</Text>
                  {business.address ? <Text style={S.gBizDetail}>{business.address}, {business.city}</Text> : null}
                  {business.state ? <Text style={S.gBizDetail}>{business.state} – {business.pincode}</Text> : null}
                  {business.gstin ? <Text style={[S.gBizGstin, { color: TEAL }]}>GSTIN: {business.gstin}</Text> : null}
                  {business.phone ? <Text style={S.gBizDetail}>Ph: {business.phone}</Text> : null}
                  {business.email ? <Text style={S.gBizDetail}>{business.email}</Text> : null}
                </View>
              </View>

              {/* RIGHT: angular INVOICE banner + meta + status */}
              <View style={S.gHdrRight}>
                <View style={S.gInvBannerWrap}>
                  <Svg width={176} height={40} style={{ position: 'absolute', top: 0, left: 0 }}>
                    <Polygon points="16,0 176,0 176,40 0,40" fill={NAVY} />
                    <Polygon points="0,40 16,0 30,0 14,40" fill={TEAL} />
                  </Svg>
                  <Text style={S.gInvBannerTxt}>INVOICE</Text>
                </View>
                <View style={[{ height: 3, width: 42, marginBottom: 8 }, { backgroundColor: TEAL }]} />
                <View style={S.gMetaRow}>
                  <Text style={S.gMetaLabel}>Invoice #</Text>
                  <Text style={S.gMetaValue}>{invoice.invoiceNumber}</Text>
                </View>
                <View style={S.gMetaRow}>
                  <Text style={S.gMetaLabel}>Date</Text>
                  <Text style={S.gMetaValue}>{formatDate(invoice.date)}</Text>
                </View>
                <View style={[badgeContainer[0], badgeContainer[1], { alignSelf: 'flex-end' }]}>
                  <Text style={badgeTxt}>{invoice.status}</Text>
                </View>
              </View>
            </View>

            {/* Geometric triangle divider */}
            <Svg width={CONTENT_W} height={8} style={S.gTriStrip}>
              <Rect x={0} y={3} width={CONTENT_W} height={1.4} fill={hexToRgba(NAVY, 0.22)} />
              <Polygon points="0,0 14,0 7,8" fill={TEAL} />
              <Polygon points="16,0 30,0 23,8" fill={NAVY} />
              <Polygon points="32,0 46,0 39,8" fill={hexToRgba(TEAL, 0.45)} />
            </Svg>
          </View>

          {/* ── Billed by / Billed to cards ── */}
          <View style={S.gCardRow}>
            <View style={S.gCard}>
              <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>{secLabel('Billed By', 'person')}</View>
              <View style={S.gCardBody}>
                <Text style={S.gCardName}>{business.name}</Text>
                <Text style={S.gCardSm}>{business.address}, {business.city}, {business.state} – {business.pincode}</Text>
                {business.phone ? <Text style={S.gCardSm}>Ph: {business.phone}</Text> : null}
                {business.gstin ? (
                  <>
                    <Text style={S.gCardMetaLabel}>GSTIN</Text>
                    <Text style={S.gCardMetaValue}>{business.gstin}</Text>
                  </>
                ) : null}
              </View>
            </View>
            <View style={S.gCard}>
              <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>{secLabel('Billed To', 'building')}</View>
              <View style={S.gCardBody}>
                <Text style={S.gCardName}>{customer.name}</Text>
                <Text style={S.gCardSm}>{customer.address}, {customer.city}, {customer.state} – {customer.pincode}</Text>
                {customer.phone ? <Text style={S.gCardSm}>Ph: {customer.phone}</Text> : null}
                {customer.gstin ? (
                  <>
                    <Text style={S.gCardMetaLabel}>GSTIN</Text>
                    <Text style={S.gCardMetaValue}>{customer.gstin}</Text>
                  </>
                ) : null}
              </View>
            </View>
          </View>

          {/* ── Place of Supply / Country of Supply ── */}
          <View style={S.gSupplyRow}>
            <View style={S.gSupplyBox}>
              {hexIcon('pin')}
              <View>
                <Text style={S.gSupplyLabel}>Place of Supply</Text>
                <Text style={S.gSupplyValue}>{customer.state || business.state}</Text>
              </View>
            </View>
            <View style={S.gSupplyBox}>
              {hexIcon('globe')}
              <View>
                <Text style={S.gSupplyLabel}>Country of Supply</Text>
                <Text style={S.gSupplyValue}>India</Text>
              </View>
            </View>
          </View>

          {/* ── Items table ── */}
          {gTableHeader}
          {tableRows}

          {/* ── Bank + QR (left) | Summary + TOTAL (right) ── */}
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 14 }} wrap={false}>

            {/* LEFT */}
            <View style={{ width: CONTENT_W - SUMMARY_W - 14 }}>
              {secLabel('Bank & Payment Details', 'bank')}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  {business.bankName && (
                    <View style={S.m1BankRow}><Text style={S.m1BankLabel}>Bank</Text><Text style={S.m1BankValue}>{business.bankName}</Text></View>
                  )}
                  {business.accountNumber && (
                    <View style={S.m1BankRow}><Text style={S.m1BankLabel}>Account No.</Text><Text style={S.m1BankValue}>{business.accountNumber}</Text></View>
                  )}
                  {business.ifscCode && (
                    <View style={S.m1BankRow}><Text style={S.m1BankLabel}>IFSC</Text><Text style={S.m1BankValue}>{business.ifscCode}</Text></View>
                  )}
                  {business.upiId && (
                    <View style={[S.m1BankRow, { borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid', paddingTop: 3, marginTop: 2 }]}>
                      <Text style={S.m1BankLabel}>UPI ID</Text>
                      <Text style={[S.m1BankValue, { color: TEAL }]}>{business.upiId}</Text>
                    </View>
                  )}
                </View>
                {qrUrl && (
                  <View style={S.m1QrWrap}>
                    <Text style={[S.m1QrLabel, { color: TEAL }]}>Scan to Pay</Text>
                    <Image style={S.m1QrImg} src={qrUrl} />
                  </View>
                )}
              </View>

              {business.termsAndConditions ? (
                <View style={{ marginTop: 12 }}>
                  {secLabel('Terms & Conditions', 'shield')}
                  <Text style={{ fontSize: 7.5, color: MID, lineHeight: 1.5 }}>{business.termsAndConditions}</Text>
                </View>
              ) : null}

              {business.defaultNotes ? (
                <View style={{ marginTop: 12 }}>
                  {secLabel('Additional Notes', 'note')}
                  <Text style={{ fontSize: 7.5, color: MID, fontFamily: 'Poppins', fontStyle: 'italic', lineHeight: 1.5 }}>{business.defaultNotes}</Text>
                </View>
              ) : null}
            </View>

            {/* RIGHT */}
            <View style={{ width: SUMMARY_W }}>
              {secLabel('Summary', 'chart')}
              <View style={{ marginTop: 2 }}>
                <View style={S.m1TotRow}><Text style={S.m1TotLabel}>Sub Total</Text><Text style={S.m1TotValue}>{fmt(invoice.totalBeforeTax)}</Text></View>
                {hasGst && isCgst ? (
                  <>
                    <View style={S.m1TotRow}><Text style={S.m1TotLabel}>CGST</Text><Text style={S.m1TotValue}>{fmt(invoice.cgst)}</Text></View>
                    <View style={S.m1TotRow}><Text style={S.m1TotLabel}>SGST</Text><Text style={S.m1TotValue}>{fmt(invoice.sgst)}</Text></View>
                  </>
                ) : hasGst ? (
                  <View style={S.m1TotRow}><Text style={S.m1TotLabel}>IGST</Text><Text style={S.m1TotValue}>{fmt(invoice.igst)}</Text></View>
                ) : null}
                {roundOffG !== 0 ? (
                  <View style={S.m1TotRow}><Text style={S.m1TotLabel}>Round Off</Text><Text style={S.m1TotValue}>{roundOffG > 0 ? '+' : ''}{fmt(Math.abs(roundOffG))}</Text></View>
                ) : null}
              </View>

              {/* Big angular TOTAL banner */}
              <View style={S.gTotalWrap}>
                <Svg width={SUMMARY_W} height={44} style={{ position: 'absolute', top: 0, left: 0 }}>
                  <Polygon points={`20,0 ${SUMMARY_W},0 ${SUMMARY_W},44 0,44`} fill={TEAL} />
                  <Polygon points="0,44 20,0 34,0 14,44" fill={NAVY} />
                </Svg>
                <View style={S.gTotalTxt}>
                  <Text style={S.gTotalLabel}>Total</Text>
                  <Text style={S.gTotalValue}>₹{invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Text>
                </View>
              </View>

              {/* Invoice total in words */}
              <View style={[S.gWordsBox, { backgroundColor: TEAL_TINT }]}>
                <Svg width={40} height={40} style={{ position: 'absolute', top: 0, right: 0 }}>
                  <Polygon points="40,0 40,40 0,0" fill={hexToRgba(TEAL, 0.16)} />
                </Svg>
                <Text style={[S.gWordsLabel, { color: TEAL }]}>Invoice Total (in words)</Text>
                <Text style={S.gWordsText}>{toWords(invoice.totalAmount)}</Text>
              </View>
            </View>
          </View>

          {/* ── Contact + signature ── */}
          {contactSignature}
          {pageNumber}
        </Page>
      </Document>
    );
  }

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
  //  MODERN-2 (default) TEMPLATE
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
                    style={{ width: 58, height: 58, objectFit: 'contain' }}
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
