/**
 * DeliveryChallanPDF — A4 Delivery Challan PDF using @react-pdf/renderer v4
 *
 * Features:
 * - Professional layout with business branding
 * - Bill To / Ship To two-column section
 * - Configurable price visibility (showPrices toggle)
 * - Transport details section
 * - GST summary when prices are shown
 * - Amount in words
 * - Declaration + signature area
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  Image,
} from '@react-pdf/renderer';
import { DeliveryChallan, BusinessProfile, Customer } from '../../types';

// ─── Register Poppins from local TTF files ─────────────────────────────────────
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

// ─── Palette ──────────────────────────────────────────────────────────────────
const DARK   = '#1e293b';
const MID    = '#475569';
const LIGHT  = '#94a3b8';
const BORDER = '#e2e8f0';
const ALT    = '#f8fafc';
const WHITE  = '#ffffff';

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
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── StyleSheet ───────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Poppins',
    fontWeight: 400,
    fontSize: 9,
    backgroundColor: WHITE,
    paddingTop: 30,
    paddingBottom: 44,
    paddingHorizontal: 30,
    color: DARK,
  },

  // ── Dividers ──
  dividerPrimary: { height: 2, borderRadius: 2, marginBottom: 14 },
  dividerThin:    { height: 0.5, backgroundColor: BORDER, marginVertical: 8 },

  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  logoBox: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 0.5,
    borderStyle: 'solid',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  logoInitial: {
    fontSize: 22,
    fontFamily: 'Poppins',
    fontWeight: 800,
  },
  bizBlock: { flexDirection: 'column', flex: 1, maxWidth: 200 },
  bizName:   { fontSize: 12, fontFamily: 'Poppins', fontWeight: 700, color: DARK, marginBottom: 2 },
  bizDetail: { fontSize: 7, color: MID, lineHeight: 1.5 },
  bizGstin:  { fontSize: 7, fontFamily: 'Poppins', fontWeight: 600, lineHeight: 1.5 },

  // ── Right side of header ──
  headerRight: { alignItems: 'flex-end', flexShrink: 0 },
  challanTitle: {
    fontSize: 34,
    fontFamily: 'Poppins',
    fontWeight: 800,
    letterSpacing: -0.5,
    lineHeight: 1,
  },
  challanSubtitle: {
    fontSize: 6,
    color: LIGHT,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginTop: 2,
    marginBottom: 6,
  },
  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  metaLabel: { fontSize: 6.5, fontFamily: 'Poppins', fontWeight: 500, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  metaValue: { fontSize: 8.5, fontFamily: 'Poppins', fontWeight: 600, color: DARK },

  // ── Status badge ──
  badge:             { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start', marginTop: 6 },
  badgeDraft:        { backgroundColor: '#f1f5f9' },
  badgeDispatched:   { backgroundColor: '#fef3c7' },
  badgeDelivered:    { backgroundColor: '#dcfce7' },
  badgeText:         { fontSize: 6.5, fontFamily: 'Poppins', fontWeight: 700, textTransform: 'uppercase' },
  badgeDraftText:    { color: '#64748b' },
  badgeDispatchText: { color: '#d97706' },
  badgeDeliverText:  { color: '#16a34a' },

  // ── Bill To / Ship To ──
  partyRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  partyBox: {
    flex: 1,
    borderRadius: 7,
    padding: 10,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: BORDER,
  },
  partyLabel: {
    fontSize: 6.5,
    fontFamily: 'Poppins',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    marginBottom: 5,
  },
  partyName:   { fontSize: 10, fontFamily: 'Poppins', fontWeight: 700, color: DARK, marginBottom: 2 },
  partySm:     { fontSize: 7, color: MID, lineHeight: 1.5 },
  partyMeta:   { flexDirection: 'row', gap: 12, marginTop: 5, paddingTop: 5, borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid' },
  partyMetaCol: { flexDirection: 'column' },
  partyMetaLbl: { fontSize: 6, fontFamily: 'Poppins', fontWeight: 500, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  partyMetaVal: { fontSize: 7.5, fontFamily: 'Poppins', fontWeight: 600, color: DARK },

  // ── Transport strip ──
  transportBox: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: ALT,
    borderRadius: 6,
    borderWidth: 0.5,
    borderStyle: 'solid',
    borderColor: BORDER,
  },
  transportItem: { flexDirection: 'column', marginRight: 14 },
  transportLbl:  { fontSize: 6, fontFamily: 'Poppins', fontWeight: 500, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  transportVal:  { fontSize: 8, fontFamily: 'Poppins', fontWeight: 600, color: DARK, marginTop: 1 },

  // ── Table header ──
  tableHeader:     { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 8, borderRadius: 3 },
  tableHeaderText: { fontSize: 6.5, fontFamily: 'Poppins', fontWeight: 700, color: WHITE, textTransform: 'uppercase' },
  tableRow:        { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: '#f1f5f9', borderBottomStyle: 'solid' },
  tableRowAlt:     { backgroundColor: ALT },
  tableCell:       { fontSize: 7.5, color: MID },
  tableCellBold:   { fontSize: 7.5, fontFamily: 'Poppins', fontWeight: 600, color: DARK },

  // Table column widths — with prices
  cNo:     { width: '4%' },
  cDescP:  { width: '30%' },
  cHsnP:   { width: '12%', textAlign: 'center' },
  cQtyP:   { width: '8%',  textAlign: 'center' },
  cUnitP:  { width: '8%',  textAlign: 'center' },
  cRateP:  { width: '14%', textAlign: 'right' },
  cGstP:   { width: '8%',  textAlign: 'center' },
  cAmtP:   { width: '16%', textAlign: 'right' },

  // Table column widths — without prices
  cDescN:  { width: '44%' },
  cHsnN:   { width: '20%', textAlign: 'center' },
  cQtyN:   { width: '18%', textAlign: 'center' },
  cUnitN:  { width: '14%', textAlign: 'center' },

  // Table footer row
  tableFooter: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    borderTopStyle: 'solid',
  },
  tableFooterText: { fontSize: 7.5, fontFamily: 'Poppins', fontWeight: 700, color: DARK },

  // ── Tax summary ──
  taxSection: { marginTop: 10, flexDirection: 'row', justifyContent: 'flex-end' },
  taxBox:     { width: '45%' },
  taxRow:     { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: BORDER, borderBottomStyle: 'solid' },
  taxLabel:   { fontSize: 8, color: MID },
  taxValue:   { fontSize: 8, fontFamily: 'Poppins', fontWeight: 600, color: DARK },
  grandRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, marginTop: 2, borderTopWidth: 2, borderTopStyle: 'solid' },
  grandLabel: { fontSize: 13, fontFamily: 'Poppins', fontWeight: 800 },
  grandValue: { fontSize: 16, fontFamily: 'Poppins', fontWeight: 800 },

  // ── Amount in words ──
  wordsBox:   { marginTop: 8, padding: 8, backgroundColor: ALT, borderRadius: 5, borderWidth: 0.5, borderStyle: 'solid', borderColor: BORDER },
  wordsLabel: { fontSize: 6, fontFamily: 'Poppins', fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  wordsText:  { fontSize: 7.5, fontFamily: 'Poppins', fontStyle: 'italic', color: DARK, lineHeight: 1.4 },

  // ── Notes ──
  notesBox:   { marginTop: 10, padding: 8, backgroundColor: ALT, borderRadius: 5, borderWidth: 0.5, borderStyle: 'solid', borderColor: BORDER },
  notesLabel: { fontSize: 6, fontFamily: 'Poppins', fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 },
  notesText:  { fontSize: 7.5, color: MID, lineHeight: 1.5 },

  // ── Declaration ──
  declarationBox: { marginTop: 10, padding: 8, borderRadius: 5, borderWidth: 0.5, borderStyle: 'solid', borderColor: BORDER },
  declarationText: { fontSize: 7, color: MID, lineHeight: 1.6, fontStyle: 'italic' },

  // ── Signature area ──
  signRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 18,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: BORDER,
    borderTopStyle: 'solid',
  },
  signBox:  { alignItems: 'center', width: 140 },
  signLine: { width: 120, height: 0.5, backgroundColor: LIGHT, marginBottom: 4 },
  signLbl:  { fontSize: 6.5, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  signName: { fontSize: 8, fontFamily: 'Poppins', fontWeight: 600, color: DARK, marginTop: 2 },

  receiverBox:  { alignItems: 'center', width: 140 },
  receiverFrame: { width: 120, height: 36, borderWidth: 0.5, borderStyle: 'solid', borderColor: BORDER, borderRadius: 4, marginBottom: 4, backgroundColor: ALT },
  receiverLbl:  { fontSize: 6.5, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },

  // ── Page number ──
  pageNum: { position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', fontSize: 6.5, color: LIGHT },
});

// ─── Props ────────────────────────────────────────────────────────────────────
interface DeliveryChallanPDFProps {
  challan: DeliveryChallan;
  business: BusinessProfile;
  customer: Customer;
  showPrices: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────
const DeliveryChallanPDF: React.FC<DeliveryChallanPDFProps> = ({
  challan,
  business,
  customer,
  showPrices,
}) => {
  const PRIMARY = business.theme?.primaryColor || '#4c2de0';

  // Compute totals from items
  const subTotal   = r2(challan.items.reduce((s, i) => s + r2(i.quantity * i.rate), 0));
  const taxAmount  = r2(challan.items.reduce((s, i) => s + r2(r2(i.quantity * i.rate) * (i.gstRate / 100)), 0));
  const grandTotal = r2(subTotal + taxAmount);
  const totalQty   = challan.items.reduce((s, i) => s + i.quantity, 0);

  // GST breakdown by rate
  const gstBreakdown = challan.items.reduce<Record<number, { taxable: number; tax: number }>>(
    (acc, item) => {
      const taxable = r2(item.quantity * item.rate);
      const tax     = r2(taxable * (item.gstRate / 100));
      if (!acc[item.gstRate]) acc[item.gstRate] = { taxable: 0, tax: 0 };
      acc[item.gstRate].taxable += taxable;
      acc[item.gstRate].tax     += tax;
      return acc;
    },
    {}
  );

  // Status badge styles
  const statusBadgeStyle =
    challan.status === 'Delivered' ? [S.badge, S.badgeDelivered] :
    challan.status === 'Dispatched' ? [S.badge, S.badgeDispatched] :
    [S.badge, S.badgeDraft];
  const statusTextStyle =
    challan.status === 'Delivered' ? [S.badgeText, S.badgeDeliverText] :
    challan.status === 'Dispatched' ? [S.badgeText, S.badgeDispatchText] :
    [S.badgeText, S.badgeDraftText];

  return (
    <Document
      title={`Delivery Challan ${challan.challanNumber}`}
      author={business.name}
      creator="BillHippo"
    >
      <Page size="A4" style={S.page} wrap>

        {/* ── Header (fixed) ── */}
        <View fixed style={{ marginBottom: 12 }}>
          <View style={S.headerRow}>

            {/* LEFT: Logo + business details */}
            <View style={S.headerLeft}>
              <View style={[S.logoBox, {
                backgroundColor: `${PRIMARY}18`,
                borderColor: `${PRIMARY}30`,
              }]}>
                {business.theme?.logoUrl ? (
                  <Image
                    style={{ width: 54, height: 54, objectFit: 'contain' }}
                    src={business.theme.logoUrl}
                  />
                ) : (
                  <Text style={[S.logoInitial, { color: PRIMARY }]}>
                    {business.name.charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={S.bizBlock}>
                <Text style={S.bizName}>{business.name}</Text>
                {business.address ? (
                  <Text style={S.bizDetail}>{business.address}, {business.city}</Text>
                ) : null}
                {business.state ? (
                  <Text style={S.bizDetail}>{business.state} – {business.pincode}</Text>
                ) : null}
                {business.gstin ? (
                  <Text style={[S.bizGstin, { color: PRIMARY }]}>GSTIN: {business.gstin}</Text>
                ) : null}
                {business.phone ? (
                  <Text style={S.bizDetail}>Ph: {business.phone}</Text>
                ) : null}
              </View>
            </View>

            {/* RIGHT: Document type + meta */}
            <View style={S.headerRight}>
              <Text style={[S.challanTitle, { color: PRIMARY }]}>Delivery{'\n'}Challan</Text>
              <Text style={S.challanSubtitle}>Goods Dispatch Document</Text>

              <View style={S.metaRow}>
                <Text style={S.metaLabel}>Challan #</Text>
                <Text style={S.metaValue}>{challan.challanNumber}</Text>
              </View>
              <View style={S.metaRow}>
                <Text style={S.metaLabel}>Date</Text>
                <Text style={S.metaValue}>{formatDate(challan.date)}</Text>
              </View>
              {(challan.invoiceNumber) ? (
                <View style={S.metaRow}>
                  <Text style={S.metaLabel}>Ref. Invoice</Text>
                  <Text style={S.metaValue}>{challan.invoiceNumber}</Text>
                </View>
              ) : null}
              <View style={statusBadgeStyle}>
                <Text style={statusTextStyle}>{challan.status}</Text>
              </View>
            </View>
          </View>

          {/* Primary colour divider */}
          <View style={[S.dividerPrimary, { backgroundColor: PRIMARY }]} />
        </View>

        {/* ── Bill To / Ship To ── */}
        <View style={S.partyRow}>
          {/* Bill To */}
          <View style={[S.partyBox, { backgroundColor: `${PRIMARY}08` }]}>
            <Text style={[S.partyLabel, { color: PRIMARY }]}>Bill To</Text>
            <Text style={S.partyName}>{customer.name}</Text>
            <Text style={S.partySm}>
              {[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}
              {customer.pincode ? ` – ${customer.pincode}` : ''}
            </Text>
            {customer.phone ? <Text style={S.partySm}>Ph: {customer.phone}</Text> : null}
            {customer.email ? <Text style={S.partySm}>{customer.email}</Text> : null}
            {customer.gstin ? (
              <View style={S.partyMeta}>
                <View style={S.partyMetaCol}>
                  <Text style={S.partyMetaLbl}>GSTIN</Text>
                  <Text style={S.partyMetaVal}>{customer.gstin}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Ship To */}
          <View style={[S.partyBox, { backgroundColor: ALT }]}>
            <Text style={[S.partyLabel, { color: MID }]}>Ship To</Text>
            {challan.enableShipTo ? (
              <>
                <Text style={S.partyName}>{challan.shipToName || '—'}</Text>
                <Text style={S.partySm}>
                  {[challan.shipToAddress, challan.shipToCity, challan.shipToState].filter(Boolean).join(', ')}
                  {challan.shipToPincode ? ` – ${challan.shipToPincode}` : ''}
                </Text>
                {challan.shipToGstin ? (
                  <View style={S.partyMeta}>
                    <View style={S.partyMetaCol}>
                      <Text style={S.partyMetaLbl}>GSTIN</Text>
                      <Text style={S.partyMetaVal}>{challan.shipToGstin}</Text>
                    </View>
                  </View>
                ) : null}
              </>
            ) : (
              <Text style={[S.partySm, { marginTop: 4, fontStyle: 'italic' }]}>Same as Bill To</Text>
            )}
          </View>
        </View>

        {/* ── Transport details ── */}
        {(challan.vehicleNumber || challan.transportMode) ? (
          <View style={S.transportBox}>
            {challan.vehicleNumber ? (
              <View style={S.transportItem}>
                <Text style={S.transportLbl}>Vehicle No.</Text>
                <Text style={S.transportVal}>{challan.vehicleNumber}</Text>
              </View>
            ) : null}
            {challan.transportMode ? (
              <View style={S.transportItem}>
                <Text style={S.transportLbl}>Mode of Transport</Text>
                <Text style={S.transportVal}>{challan.transportMode}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Items Table ── */}
        {/* Table header — fixed (repeats on every page) */}
        <View style={[S.tableHeader, { backgroundColor: PRIMARY }]} fixed>
          <Text style={[S.tableHeaderText, S.cNo]}>#</Text>
          {showPrices ? (
            <>
              <Text style={[S.tableHeaderText, S.cDescP]}>Description</Text>
              <Text style={[S.tableHeaderText, S.cHsnP]}>HSN/SAC</Text>
              <Text style={[S.tableHeaderText, S.cQtyP]}>Qty</Text>
              <Text style={[S.tableHeaderText, S.cUnitP]}>Unit</Text>
              <Text style={[S.tableHeaderText, S.cRateP]}>Rate (₹)</Text>
              <Text style={[S.tableHeaderText, S.cGstP]}>GST%</Text>
              <Text style={[S.tableHeaderText, S.cAmtP]}>Amount (₹)</Text>
            </>
          ) : (
            <>
              <Text style={[S.tableHeaderText, S.cDescN]}>Description</Text>
              <Text style={[S.tableHeaderText, S.cHsnN]}>HSN/SAC</Text>
              <Text style={[S.tableHeaderText, S.cQtyN]}>Qty</Text>
              <Text style={[S.tableHeaderText, S.cUnitN]}>Unit</Text>
            </>
          )}
        </View>

        {/* Table rows */}
        {challan.items.map((item, idx) => {
          const lineTotal = r2(item.quantity * item.rate);
          const itemTax   = r2(lineTotal * (item.gstRate / 100));
          const grandLine = r2(lineTotal + itemTax);
          return (
            <View
              key={item.id}
              style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}
              wrap={false}
            >
              <Text style={[S.tableCell, S.cNo]}>{idx + 1}</Text>
              {showPrices ? (
                <>
                  <View style={[S.cDescP, { justifyContent: 'center' }]}>
                    <Text style={S.tableCellBold}>{item.description || '—'}</Text>
                    {item.notes ? (
                      <Text style={{ fontSize: 6.5, color: LIGHT, marginTop: 1, fontStyle: 'italic' }}>
                        {item.notes}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[S.tableCell, S.cHsnP]}>{item.hsnCode || '—'}</Text>
                  <Text style={[S.tableCellBold, S.cQtyP]}>{item.quantity}</Text>
                  <Text style={[S.tableCell, S.cUnitP]}>{item.unit || '—'}</Text>
                  <Text style={[S.tableCell, S.cRateP]}>{fmt(item.rate)}</Text>
                  <Text style={[S.tableCell, S.cGstP]}>{item.gstRate}%</Text>
                  <Text style={[S.tableCellBold, S.cAmtP]}>{fmt(grandLine)}</Text>
                </>
              ) : (
                <>
                  <View style={[S.cDescN, { justifyContent: 'center' }]}>
                    <Text style={S.tableCellBold}>{item.description || '—'}</Text>
                    {item.notes ? (
                      <Text style={{ fontSize: 6.5, color: LIGHT, marginTop: 1, fontStyle: 'italic' }}>
                        {item.notes}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[S.tableCell, S.cHsnN]}>{item.hsnCode || '—'}</Text>
                  <Text style={[S.tableCellBold, S.cQtyN]}>{item.quantity}</Text>
                  <Text style={[S.tableCell, S.cUnitN]}>{item.unit || '—'}</Text>
                </>
              )}
            </View>
          );
        })}

        {/* Table footer totals row */}
        <View style={S.tableFooter} wrap={false}>
          <Text style={[S.tableFooterText, S.cNo]} />
          {showPrices ? (
            <>
              <Text style={[S.tableFooterText, S.cDescP]}>Total</Text>
              <Text style={[S.tableFooterText, S.cHsnP]} />
              <Text style={[S.tableFooterText, S.cQtyP]}>{totalQty}</Text>
              <Text style={[S.tableFooterText, S.cUnitP]} />
              <Text style={[S.tableFooterText, S.cRateP]} />
              <Text style={[S.tableFooterText, S.cGstP]} />
              <Text style={[S.tableFooterText, S.cAmtP]}>{fmt(grandTotal)}</Text>
            </>
          ) : (
            <>
              <Text style={[S.tableFooterText, S.cDescN]}>Total</Text>
              <Text style={[S.tableFooterText, S.cHsnN]} />
              <Text style={[S.tableFooterText, S.cQtyN]}>{totalQty}</Text>
              <Text style={[S.tableFooterText, S.cUnitN]} />
            </>
          )}
        </View>

        {/* ── Tax summary (only when showPrices) ── */}
        {showPrices ? (
          <View style={S.taxSection} wrap={false}>
            <View style={S.taxBox}>
              <View style={S.taxRow}>
                <Text style={S.taxLabel}>Sub Total</Text>
                <Text style={S.taxValue}>{fmt(subTotal)}</Text>
              </View>
              {Object.entries(gstBreakdown).map(([rate, val]) => (
                <View key={rate} style={S.taxRow}>
                  <Text style={S.taxLabel}>GST @ {rate}%</Text>
                  <Text style={S.taxValue}>{fmt(val.tax)}</Text>
                </View>
              ))}
              <View style={[S.grandRow, { borderTopColor: PRIMARY }]}>
                <Text style={[S.grandLabel, { color: PRIMARY }]}>Total</Text>
                <Text style={[S.grandValue, { color: PRIMARY }]}>{fmt(grandTotal)}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* ── Amount in words (only when showPrices) ── */}
        {showPrices ? (
          <View style={S.wordsBox} wrap={false}>
            <Text style={S.wordsLabel}>Total Amount in Words</Text>
            <Text style={S.wordsText}>{toWords(grandTotal)}</Text>
          </View>
        ) : null}

        {/* ── Notes ── */}
        {challan.notes ? (
          <View style={S.notesBox} wrap={false}>
            <Text style={S.notesLabel}>Notes</Text>
            <Text style={S.notesText}>{challan.notes}</Text>
          </View>
        ) : null}

        {/* ── Declaration ── */}
        <View style={S.declarationBox} wrap={false}>
          <Text style={S.declarationText}>
            We hereby certify that the goods mentioned above are sent by us for the purpose of
            supply/return. The goods are in good condition at the time of dispatch.
          </Text>
        </View>

        {/* ── Signature area ── */}
        <View style={S.signRow} wrap={false}>
          {/* Left: Receiver's Signature */}
          <View style={S.receiverBox}>
            <View style={S.receiverFrame} />
            <Text style={S.receiverLbl}>Receiver's Signature & Stamp</Text>
          </View>

          {/* Right: Authorised Signatory */}
          <View style={S.signBox}>
            {business.signatureUrl ? (
              <Image
                style={{ width: 120, height: 38, objectFit: 'contain', marginBottom: 4 }}
                src={business.signatureUrl}
              />
            ) : (
              <View style={S.signLine} />
            )}
            <Text style={S.signLbl}>For {business.name}</Text>
            <Text style={[S.signName, { marginTop: 2 }]}>Authorised Signatory</Text>
          </View>
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

export default DeliveryChallanPDF;
