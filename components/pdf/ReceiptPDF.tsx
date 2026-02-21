/**
 * ReceiptPDF — A4 payment receipt for @react-pdf/renderer
 *
 * Header: business logo (left) | business name + address (right)
 * Font: Poppins via local TTF files
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
import { Customer, LedgerEntry } from '../../types';

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
const BLUE         = '#4c2de0';
const DARK         = '#1e293b';
const MID          = '#475569';
const LIGHT        = '#94a3b8';
const BORDER       = '#e2e8f0';
const ALT          = '#f8fafc';
const GREEN        = '#16a34a';
const GREEN_BG     = '#f0fdf4';
const GREEN_BORDER = '#bbf7d0';

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Poppins',
    fontSize: 10,
    backgroundColor: '#FFFFFF',
    paddingTop: 40,
    paddingBottom: 64,
    paddingHorizontal: 48,
    color: DARK,
  },

  // Header
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  logoImage:  { width: 64, height: 64, borderRadius: 8, objectFit: 'contain' },
  logoBox:    { width: 64, height: 64, borderRadius: 8, backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center' },
  logoInit:   { fontSize: 26, fontWeight: 700, color: '#fff' },
  bizBlock:   { alignItems: 'flex-end', maxWidth: '65%' },
  bizName:    { fontSize: 16, fontWeight: 700, color: DARK, textAlign: 'right' },
  bizAddr:    { fontSize: 9,  color: MID,  textAlign: 'right', marginTop: 2 },
  bizMeta:    { fontSize: 9,  color: LIGHT, textAlign: 'right', marginTop: 1 },
  bizGst:     { fontSize: 9,  fontWeight: 700, color: BLUE, textAlign: 'right', marginTop: 1 },

  divider:    { height: 2, backgroundColor: BLUE, borderRadius: 2, marginBottom: 20 },

  // Doc title
  titleRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 },
  docTitle:   { fontSize: 22, fontWeight: 700, color: DARK },
  docSub:     { fontSize: 9, color: LIGHT },
  idBlock:    { alignItems: 'flex-end' },
  idLabel:    { fontSize: 8, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8 },
  idValue:    { fontSize: 12, fontWeight: 700, color: BLUE, textAlign: 'right' },
  dateLabel:  { fontSize: 8, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  dateValue:  { fontSize: 12, fontWeight: 700, color: DARK, textAlign: 'right' },

  // Info strip
  infoStrip:  {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: ALT, borderRadius: 8, padding: 14, marginBottom: 16,
    borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid',
  },
  infoLabel:  { fontSize: 8, fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  infoValue:  { fontSize: 12, fontWeight: 700, color: DARK },
  infoSm:     { fontSize: 9, color: MID, marginTop: 2 },
  infoGst:    { fontSize: 9, fontWeight: 700, color: BLUE, marginTop: 2 },

  // Detail box
  detailBox:  {
    backgroundColor: ALT, borderRadius: 8, padding: 16, marginBottom: 14,
    borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid',
  },
  detailRow:  {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 9,
    borderBottomWidth: 0.5, borderBottomColor: BORDER, borderBottomStyle: 'solid',
  },
  detailLast: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  detailLabel:{ fontSize: 9, fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.6 },
  detailValue:{ fontSize: 11, fontWeight: 700, color: DARK },

  // Amount received
  amountBox:  {
    backgroundColor: GREEN_BG, borderRadius: 8, padding: 16,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 12, borderWidth: 0.5, borderColor: GREEN_BORDER, borderStyle: 'solid',
  },
  amountLabel:{ fontSize: 9, fontWeight: 700, color: GREEN, textTransform: 'uppercase', letterSpacing: 0.8 },
  amountValue:{ fontSize: 22, fontWeight: 700, color: GREEN },

  // Balance after
  balanceBox: {
    backgroundColor: DARK, borderRadius: 8, padding: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28,
  },
  balLabel:   { fontSize: 9, fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8 },
  balValue:   { fontSize: 15, fontWeight: 700, color: '#fff' },
  balDrCr:    { fontSize: 8, color: LIGHT, marginLeft: 3 },

  // Signature
  signRow:    { flexDirection: 'row', justifyContent: 'space-between' },
  signBox:    { alignItems: 'center', width: 140 },
  signLine:   { height: 0.5, backgroundColor: LIGHT, width: '100%', marginBottom: 4 },
  signLabel:  { fontSize: 8, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  signBlue:   { fontSize: 8, color: BLUE, marginTop: 2 },

  // Footer
  pageFooter: { position: 'absolute', bottom: 22, left: 48, right: 48, flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 8, color: '#cbd5e1' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Props ────────────────────────────────────────────────────────────────────
export interface ReceiptEntry extends LedgerEntry { runningBalance: number; }

interface ReceiptPDFProps {
  entry:        ReceiptEntry;
  customer:     Customer;
  businessName: string;
  businessInfo: { gstin?: string; address: string; phone?: string; email?: string };
  logoUrl?:     string;
}

// ─── Component ────────────────────────────────────────────────────────────────
const ReceiptPDF: React.FC<ReceiptPDFProps> = ({
  entry, customer, businessName, businessInfo, logoUrl,
}) => {
  const today     = new Date().toLocaleDateString('en-IN');
  const drCr      = entry.runningBalance >= 0 ? 'Dr' : 'Cr';
  const receiptId = `RCP-${(entry.id ?? Date.now().toString()).slice(-6).toUpperCase()}`;

  return (
    <Document title={`Receipt – ${customer.name}`} author={businessName} creator="BillHippo">
      <Page size="A4" style={S.page}>

        {/* ── Header: logo left | business info right ── */}
        <View style={S.headerRow}>
          <View>
            {logoUrl ? (
              <Image src={logoUrl} style={S.logoImage} />
            ) : (
              <View style={S.logoBox}>
                <Text style={S.logoInit}>{businessName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </View>
          <View style={S.bizBlock}>
            <Text style={S.bizName}>{businessName}</Text>
            <Text style={S.bizAddr}>{businessInfo.address}</Text>
            {businessInfo.gstin ? <Text style={S.bizGst}>GSTIN: {businessInfo.gstin}</Text> : null}
            {businessInfo.phone ? <Text style={S.bizMeta}>Ph: {businessInfo.phone}</Text> : null}
            {businessInfo.email ? <Text style={S.bizMeta}>{businessInfo.email}</Text> : null}
          </View>
        </View>

        {/* ── Divider ── */}
        <View style={S.divider} />

        {/* ── Title + Receipt ID ── */}
        <View style={S.titleRow}>
          <View>
            <Text style={S.docTitle}>PAYMENT RECEIPT</Text>
            <Text style={S.docSub}>Generated on {today}</Text>
          </View>
          <View style={S.idBlock}>
            <Text style={S.idLabel}>Receipt ID</Text>
            <Text style={S.idValue}>{receiptId}</Text>
            <Text style={S.dateLabel}>Date</Text>
            <Text style={S.dateValue}>{entry.date}</Text>
          </View>
        </View>

        {/* ── Supplier / Customer strip ── */}
        <View style={S.infoStrip}>
          <View>
            <Text style={S.infoLabel}>From (Supplier)</Text>
            <Text style={S.infoValue}>{businessName}</Text>
            {businessInfo.gstin ? <Text style={S.infoGst}>GSTIN: {businessInfo.gstin}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[S.infoLabel, { textAlign: 'right' }]}>Received From</Text>
            <Text style={[S.infoValue, { textAlign: 'right' }]}>{customer.name}</Text>
            {customer.gstin ? <Text style={[S.infoGst, { textAlign: 'right' }]}>GSTIN: {customer.gstin}</Text> : null}
            {customer.city ? <Text style={[S.infoSm, { textAlign: 'right' }]}>{customer.city}, {customer.state}</Text> : null}
            {customer.phone ? <Text style={[S.infoSm, { textAlign: 'right' }]}>Ph: {customer.phone}</Text> : null}
          </View>
        </View>

        {/* ── Payment details ── */}
        <View style={S.detailBox}>
          <View style={S.detailRow}>
            <Text style={S.detailLabel}>Description / Narration</Text>
            <Text style={S.detailValue}>{entry.description}</Text>
          </View>
          <View style={S.detailLast}>
            <Text style={S.detailLabel}>Payment Date</Text>
            <Text style={S.detailValue}>{entry.date}</Text>
          </View>
        </View>

        {/* ── Amount received ── */}
        <View style={S.amountBox}>
          <Text style={S.amountLabel}>Amount Received</Text>
          <Text style={S.amountValue}>{fmt(entry.amount)}</Text>
        </View>

        {/* ── Balance after payment ── */}
        <View style={S.balanceBox}>
          <Text style={S.balLabel}>Outstanding Balance After Payment</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={S.balValue}>{fmt(Math.abs(entry.runningBalance))}</Text>
            <Text style={S.balDrCr}>{drCr}</Text>
          </View>
        </View>

        {/* ── Signature strip ── */}
        <View style={S.signRow}>
          <View style={S.signBox}>
            <View style={S.signLine} />
            <Text style={S.signLabel}>Customer Signature</Text>
          </View>
          <View style={S.signBox}>
            <View style={S.signLine} />
            <Text style={S.signLabel}>Authorised Signatory</Text>
            <Text style={S.signBlue}>{businessName}</Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={S.pageFooter} fixed>
          <Text style={S.footerText}>Generated by BillHippo  |  {today}</Text>
          <Text style={S.footerText}>This is a computer-generated receipt</Text>
        </View>

      </Page>
    </Document>
  );
};

export default ReceiptPDF;
