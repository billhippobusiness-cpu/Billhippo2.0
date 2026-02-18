/**
 * LedgerPDF — A4 account statement for @react-pdf/renderer
 *
 * Fixes applied:
 *  - No Font.register() — uses built-in Helvetica (no network fetch = no blank render)
 *  - No <Image> logo — uses text brand mark (avoids Firebase CORS errors)
 *  - wrap={false} on every row — no row split across pages
 *  - Table header uses `fixed` prop — repeats on every page
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { Customer, LedgerEntry } from '../../types';

// ─── Palette ──────────────────────────────────────────────────────────────────
const BLUE  = '#4c2de0';
const DARK  = '#1e293b';
const MID   = '#475569';
const LIGHT = '#94a3b8';
const BORDER= '#e2e8f0';
const ALT   = '#f8fafc';

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    backgroundColor: '#FFFFFF',
    paddingTop: 36,
    paddingBottom: 52,
    paddingHorizontal: 36,
    color: DARK,
  },

  // ── Fixed header ──
  fixedHeader:  { marginBottom: 16 },
  headerRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  brandBox:     { backgroundColor: BLUE, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  brandText:    { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', letterSpacing: 1 },
  brandSub:     { fontSize: 6.5, color: LIGHT, marginTop: 2 },
  docTitle:     { fontSize: 18, fontFamily: 'Helvetica-Bold', color: DARK, textAlign: 'right' },
  docSubtitle:  { fontSize: 8, color: MID, textAlign: 'right', marginTop: 2 },
  dividerBlue:  { height: 2, backgroundColor: BLUE, borderRadius: 2, marginBottom: 14 },

  // ── Info strip ──
  infoStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: ALT,
    borderRadius: 6,
    padding: 10,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: BORDER,
    borderStyle: 'solid',
  },
  infoLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 3 },
  infoValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK },
  infoSm:    { fontSize: 7.5, color: MID, lineHeight: 1.5 },
  infoBlue:  { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: BLUE },

  // ── Table header (fixed) ──
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BLUE,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 0,
  },
  tableHeaderText: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', textTransform: 'uppercase' },

  // ── Table rows ──
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
    borderBottomStyle: 'solid',
  },
  tableRowAlt:    { backgroundColor: ALT },
  tableCell:      { fontSize: 8, color: MID },
  cellDebit:      { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#dc2626' },
  cellCredit:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#16a34a' },
  cellBalance:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },
  cellDrCr:       { fontSize: 6.5, color: LIGHT, marginLeft: 2 },

  // Column widths
  cDate:    { width: '14%' },
  cDesc:    { width: '38%' },
  cDebit:   { width: '16%', textAlign: 'right' },
  cCredit:  { width: '16%', textAlign: 'right' },
  cBalance: { width: '16%', textAlign: 'right' },

  // ── Summary cards ──
  summaryRow: { flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 16 },
  summaryCard: { flex: 1, borderRadius: 5, padding: 10, borderWidth: 0.5, borderStyle: 'solid' },
  cardDebit:   { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  cardCredit:  { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  cardBalance: { backgroundColor: DARK,     borderColor: DARK },
  cardLabel:   { fontSize: 7, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  labelDebit:  { color: '#ef4444' },
  labelCredit: { color: '#22c55e' },
  labelBalance:{ color: LIGHT },
  cardAmt:     { fontSize: 13, fontFamily: 'Helvetica-Bold' },
  amtDebit:    { color: '#dc2626' },
  amtCredit:   { color: '#16a34a' },
  amtBalance:  { color: '#FFFFFF' },
  drCrTag:     { fontSize: 7, color: LIGHT, marginLeft: 2 },

  // ── Signature ──
  signRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  signBox:   { alignItems: 'center', width: 130 },
  signLine:  { height: 0.5, backgroundColor: LIGHT, width: '100%', marginBottom: 3 },
  signLabel: { fontSize: 7, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.7 },
  signBlue:  { fontSize: 7, color: BLUE, marginTop: 2 },

  // ── Page footer (fixed) ──
  pageFooter: {
    position: 'absolute', bottom: 18, left: 36, right: 36,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  pageFooterText: { fontSize: 7, color: '#cbd5e1' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `Rs.${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  businessInfo: { gstin: string; address: string; email: string; phone: string };
  statementDate?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────
const LedgerPDF: React.FC<LedgerPDFProps> = ({
  customer, entries, businessName, businessInfo, statementDate,
}) => {
  const today   = statementDate ?? new Date().toLocaleDateString('en-IN');
  const running = computeRunning(entries);
  const totalDr = entries.filter(e => e.type === 'Debit').reduce((s, e) => s + e.amount, 0);
  const totalCr = entries.filter(e => e.type === 'Credit').reduce((s, e) => s + e.amount, 0);
  const closing = totalDr - totalCr;

  return (
    <Document title={`Statement – ${customer.name}`} author={businessName} creator="BillHippo">
      <Page size="A4" style={S.page} wrap>

        {/* ── Fixed header ── */}
        <View fixed style={S.fixedHeader}>
          <View style={S.headerRow}>
            <View>
              <View style={S.brandBox}>
                <Text style={S.brandText}>BillHippo</Text>
              </View>
              <Text style={S.brandSub}>Smart Billing for India</Text>
            </View>
            <View>
              <Text style={S.docTitle}>ACCOUNT STATEMENT</Text>
              <Text style={S.docSubtitle}>As of {today}</Text>
            </View>
          </View>
          <View style={S.dividerBlue} />
        </View>

        {/* ── Info strip ── */}
        <View style={S.infoStrip}>
          <View>
            <Text style={S.infoLabel}>Supplier</Text>
            <Text style={S.infoValue}>{businessName}</Text>
            <Text style={S.infoSm}>{businessInfo.address}</Text>
            {businessInfo.gstin ? <Text style={S.infoBlue}>GSTIN: {businessInfo.gstin}</Text> : null}
            {businessInfo.phone ? <Text style={S.infoSm}>Ph: {businessInfo.phone}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={S.infoLabel}>Customer</Text>
            <Text style={[S.infoValue, { textAlign: 'right', fontSize: 11 }]}>{customer.name}</Text>
            <Text style={[S.infoSm, { textAlign: 'right' }]}>
              {customer.address}, {customer.city}, {customer.state}
            </Text>
            {customer.gstin ? <Text style={[S.infoBlue, { textAlign: 'right' }]}>GSTIN: {customer.gstin}</Text> : null}
            {customer.phone ? <Text style={[S.infoSm, { textAlign: 'right' }]}>Ph: {customer.phone}</Text> : null}
          </View>
        </View>

        {/* ── Table header (fixed — repeats on every page) ── */}
        <View style={S.tableHeader} fixed>
          <Text style={[S.tableHeaderText, S.cDate]}>Date</Text>
          <Text style={[S.tableHeaderText, S.cDesc]}>Description</Text>
          <Text style={[S.tableHeaderText, S.cDebit]}>Debit (Dr)</Text>
          <Text style={[S.tableHeaderText, S.cCredit]}>Credit (Cr)</Text>
          <Text style={[S.tableHeaderText, S.cBalance]}>Balance</Text>
        </View>

        {/* ── Rows (wrap=false — no mid-row page break) ── */}
        {running.length === 0 ? (
          <View style={[S.tableRow, { justifyContent: 'center', paddingVertical: 20 }]}>
            <Text style={[S.tableCell, { textAlign: 'center', flex: 1, color: LIGHT }]}>
              No transactions found.
            </Text>
          </View>
        ) : (
          running.map((entry, idx) => {
            const drCr = entry.runningBalance >= 0 ? 'Dr' : 'Cr';
            return (
              <View
                key={entry.id}
                style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}
                wrap={false}
              >
                <Text style={[S.tableCell, S.cDate]}>{entry.date}</Text>
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
