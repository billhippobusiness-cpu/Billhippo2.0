/**
 * LedgerPDF — A4 account statement for @react-pdf/renderer
 *
 * Header: business logo (left) | business name + address (right)
 * Font: Poppins via local TTF (same as InvoicePDF)
 * Sizes bumped: table cells 10pt, headers 9pt, amounts 15pt
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

// ─── Register Poppins from local TTF files ────────────────────────────────────
Font.register({
  family: 'Poppins',
  fonts: [
    { src: '/fonts/Poppins-Regular.ttf',   fontWeight: 400 },
    { src: '/fonts/Poppins-Medium.ttf',    fontWeight: 500 },
    { src: '/fonts/Poppins-SemiBold.ttf',  fontWeight: 600 },
    { src: '/fonts/Poppins-Bold.ttf',      fontWeight: 700 },
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
    fontSize: 10,
    backgroundColor: '#FFFFFF',
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 40,
    color: DARK,
  },

  // ── Fixed header ──
  fixedHeader: { marginBottom: 14 },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },

  // Logo (left)
  logoImage: { width: 64, height: 64, borderRadius: 8, objectFit: 'contain' },
  logoBox:   { width: 64, height: 64, borderRadius: 8, backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center' },
  logoInit:  { fontSize: 26, fontWeight: 700, color: '#fff' },

  // Business info (right)
  bizBlock:   { alignItems: 'flex-end', maxWidth: '65%' },
  bizName:    { fontSize: 16, fontWeight: 700, color: DARK, textAlign: 'right' },
  bizAddr:    { fontSize: 9,  color: MID,  textAlign: 'right', marginTop: 2 },
  bizMeta:    { fontSize: 9,  color: LIGHT, textAlign: 'right', marginTop: 1 },
  bizGst:     { fontSize: 9,  fontWeight: 700, color: BLUE, textAlign: 'right', marginTop: 1 },

  dividerBlue: { height: 2, backgroundColor: BLUE, borderRadius: 2, marginBottom: 14 },

  // Doc title strip (below divider)
  titleStrip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 },
  docTitle:   { fontSize: 20, fontWeight: 700, color: DARK },
  docSubtitle:{ fontSize: 9, color: LIGHT },

  // ── Info strip (customer + supplier) ──
  infoStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: ALT,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderStyle: 'solid',
  },
  infoLabel: { fontSize: 8, fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 3 },
  infoValue: { fontSize: 12, fontWeight: 700, color: DARK },
  infoSm:    { fontSize: 9, color: MID, lineHeight: 1.5 },
  infoBlue:  { fontSize: 9, fontWeight: 700, color: BLUE },

  // ── Table header ──
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BLUE,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  tableHeaderText: { fontSize: 9, fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase' },

  // ── Table rows ──
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
    borderBottomStyle: 'solid',
  },
  tableRowAlt:  { backgroundColor: ALT },
  tableCell:    { fontSize: 10, color: MID },
  cellDebit:    { fontSize: 10, fontWeight: 700, color: '#dc2626' },
  cellCredit:   { fontSize: 10, fontWeight: 700, color: '#16a34a' },
  cellBalance:  { fontSize: 10, fontWeight: 700, color: DARK },
  cellDrCr:     { fontSize: 7.5, color: LIGHT, marginLeft: 2 },

  // Column widths
  cDate:    { width: '14%' },
  cType:    { width: '12%' },
  cDesc:    { width: '28%' },
  cDebit:   { width: '15%', textAlign: 'right' },
  cCredit:  { width: '15%', textAlign: 'right' },
  cBalance: { width: '16%', textAlign: 'right' },

  // ── Summary cards ──
  summaryRow:  { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 16 },
  summaryCard: { flex: 1, borderRadius: 6, padding: 12, borderWidth: 0.5, borderStyle: 'solid' },
  cardDebit:   { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  cardCredit:  { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  cardBalance: { backgroundColor: DARK,     borderColor: DARK },
  cardLabel:   { fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 },
  labelDebit:  { color: '#ef4444' },
  labelCredit: { color: '#22c55e' },
  labelBalance:{ color: LIGHT },
  cardAmt:     { fontSize: 15, fontWeight: 700 },
  amtDebit:    { color: '#dc2626' },
  amtCredit:   { color: '#16a34a' },
  amtBalance:  { color: '#FFFFFF' },
  drCrTag:     { fontSize: 8, color: LIGHT, marginLeft: 2 },

  // ── Signature ──
  signRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  signBox:   { alignItems: 'center', width: 140 },
  signLine:  { height: 0.5, backgroundColor: LIGHT, width: '100%', marginBottom: 4 },
  signLabel: { fontSize: 8, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  signBlue:  { fontSize: 8, color: BLUE, marginTop: 2 },

  // ── Page footer ──
  pageFooter: {
    position: 'absolute', bottom: 18, left: 40, right: 40,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  pageFooterText: { fontSize: 8, color: '#cbd5e1' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface EntryWithBalance extends LedgerEntry { runningBalance: number; }

function computeRunning(entries: LedgerEntry[]): EntryWithBalance[] {
  let bal = 0;
  return entries.map(e => {
    bal += e.type === 'Debit' ? e.amount : -e.amount;
    return { ...e, runningBalance: bal };
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface LedgerPDFProps {
  customer:     Customer;
  entries:      LedgerEntry[];
  businessName: string;
  businessInfo: { gstin?: string; address: string; email?: string; phone?: string };
  logoUrl?:     string;
  statementDate?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
const LedgerPDF: React.FC<LedgerPDFProps> = ({
  customer, entries, businessName, businessInfo, logoUrl, statementDate,
}) => {
  const today   = statementDate ?? new Date().toLocaleDateString('en-IN');
  const running = computeRunning(entries);
  const totalDr = entries.filter(e => e.type === 'Debit').reduce((s, e) => s + e.amount, 0);
  const totalCr = entries.filter(e => e.type === 'Credit').reduce((s, e) => s + e.amount, 0);
  const closing = totalDr - totalCr;

  return (
    <Document title={`Statement – ${customer.name}`} author={businessName} creator="BillHippo">
      <Page size="A4" style={S.page} wrap>

        {/* ── Fixed header (logo left | business info right) ── */}
        <View fixed style={S.fixedHeader}>
          <View style={S.headerRow}>
            {/* Left: logo or initial box */}
            <View>
              {logoUrl ? (
                <Image src={logoUrl} style={S.logoImage} />
              ) : (
                <View style={S.logoBox}>
                  <Text style={S.logoInit}>{businessName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>

            {/* Right: business name + address */}
            <View style={S.bizBlock}>
              <Text style={S.bizName}>{businessName}</Text>
              <Text style={S.bizAddr}>{businessInfo.address}</Text>
              {businessInfo.gstin ? <Text style={S.bizGst}>GSTIN: {businessInfo.gstin}</Text> : null}
              {businessInfo.phone ? <Text style={S.bizMeta}>Ph: {businessInfo.phone}</Text> : null}
              {businessInfo.email ? <Text style={S.bizMeta}>{businessInfo.email}</Text> : null}
            </View>
          </View>
          <View style={S.dividerBlue} />

          {/* Doc title + date */}
          <View style={S.titleStrip}>
            <Text style={S.docTitle}>ACCOUNT STATEMENT</Text>
            <Text style={S.docSubtitle}>As of {today}</Text>
          </View>
        </View>

        {/* ── Info strip: supplier left / customer right ── */}
        <View style={S.infoStrip}>
          <View>
            <Text style={S.infoLabel}>Supplier</Text>
            <Text style={S.infoValue}>{businessName}</Text>
            {businessInfo.gstin ? <Text style={S.infoBlue}>GSTIN: {businessInfo.gstin}</Text> : null}
            {businessInfo.phone ? <Text style={S.infoSm}>Ph: {businessInfo.phone}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={S.infoLabel}>Customer</Text>
            <Text style={[S.infoValue, { textAlign: 'right', fontSize: 12 }]}>{customer.name}</Text>
            <Text style={[S.infoSm, { textAlign: 'right' }]}>
              {[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}
            </Text>
            {customer.gstin ? <Text style={[S.infoBlue, { textAlign: 'right' }]}>GSTIN: {customer.gstin}</Text> : null}
            {customer.phone ? <Text style={[S.infoSm, { textAlign: 'right' }]}>Ph: {customer.phone}</Text> : null}
          </View>
        </View>

        {/* ── Table header (fixed — repeats on every page) ── */}
        <View style={S.tableHeader} fixed>
          <Text style={[S.tableHeaderText, S.cDate]}>Date</Text>
          <Text style={[S.tableHeaderText, S.cType]}>Type</Text>
          <Text style={[S.tableHeaderText, S.cDesc]}>Description</Text>
          <Text style={[S.tableHeaderText, S.cDebit]}>Debit (Dr)</Text>
          <Text style={[S.tableHeaderText, S.cCredit]}>Credit (Cr)</Text>
          <Text style={[S.tableHeaderText, S.cBalance]}>Balance</Text>
        </View>

        {/* ── Rows ── */}
        {running.length === 0 ? (
          <View style={[S.tableRow, { justifyContent: 'center', paddingVertical: 24 }]}>
            <Text style={[S.tableCell, { textAlign: 'center', flex: 1, color: LIGHT }]}>
              No transactions found.
            </Text>
          </View>
        ) : (
          running.map((entry, idx) => {
            const drCr = entry.runningBalance >= 0 ? 'Dr' : 'Cr';
            const typeLabel = entry.type === 'Debit' && entry.invoiceId ? 'Invoice'
              : entry.type === 'Credit' ? 'Receipt' : 'Entry';
            return (
              <View
                key={entry.id}
                style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}
                wrap={false}
              >
                <Text style={[S.tableCell, S.cDate]}>{entry.date}</Text>
                <Text style={[S.tableCell, S.cType, { color: entry.type === 'Debit' ? BLUE : '#16a34a', fontWeight: 600 }]}>
                  {typeLabel}
                </Text>
                <Text style={[S.tableCell, S.cDesc]}>{entry.description}</Text>
                <Text style={[S.cellDebit, S.cDebit]}>
                  {entry.type === 'Debit' ? fmt(entry.amount) : '—'}
                </Text>
                <Text style={[S.cellCredit, S.cCredit]}>
                  {entry.type === 'Credit' ? fmt(entry.amount) : '—'}
                </Text>
                <View style={[S.cBalance, { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }]}>
                  <Text style={S.cellBalance}>{fmt(Math.abs(entry.runningBalance))}</Text>
                  <Text style={S.cellDrCr}>{drCr}</Text>
                </View>
              </View>
            );
          })
        )}

        {/* ── Summary cards ── */}
        <View style={S.summaryRow} wrap={false}>
          <View style={[S.summaryCard, S.cardDebit]}>
            <Text style={[S.cardLabel, S.labelDebit]}>Total Sales (Dr)</Text>
            <Text style={[S.cardAmt, S.amtDebit]}>{fmt(totalDr)}</Text>
          </View>
          <View style={[S.summaryCard, S.cardCredit]}>
            <Text style={[S.cardLabel, S.labelCredit]}>Collections (Cr)</Text>
            <Text style={[S.cardAmt, S.amtCredit]}>{fmt(totalCr)}</Text>
          </View>
          <View style={[S.summaryCard, S.cardBalance]}>
            <Text style={[S.cardLabel, S.labelBalance]}>Closing Balance</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={[S.cardAmt, S.amtBalance]}>{fmt(Math.abs(closing))}</Text>
              <Text style={S.drCrTag}>{closing >= 0 ? 'Dr' : 'Cr'}</Text>
            </View>
          </View>
        </View>

        {/* ── Signature ── */}
        <View style={S.signRow} wrap={false}>
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

        {/* ── Fixed page footer ── */}
        <View style={S.pageFooter} fixed>
          <Text style={S.pageFooterText}>Generated by BillHippo  |  {today}</Text>
          <Text
            style={S.pageFooterText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  );
};

export default LedgerPDF;
