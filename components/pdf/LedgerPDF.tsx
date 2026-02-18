import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer';
import { Customer, LedgerEntry } from '../../types';

// Register Inter (same family as InvoicePDF — cached by browser)
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hiJ-Ek-_EeA.woff', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiJ-Ek-_EeA.woff', fontWeight: 700 },
  ],
});

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9,
    backgroundColor: '#FFFFFF',
    paddingTop: 36,
    paddingBottom: 52,
    paddingHorizontal: 36,
    color: '#1e293b',
  },

  // Fixed header — repeats on every page
  fixedHeader: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 32, height: 32, borderRadius: 6, objectFit: 'contain' },
  brandName: { fontSize: 13, fontWeight: 700, color: '#4c2de0', letterSpacing: 0.8 },
  brandSub: { fontSize: 7, color: '#94a3b8', marginTop: 1 },
  docTitle: { fontSize: 18, fontWeight: 700, color: '#1e293b', textAlign: 'right' },
  docSubtitle: { fontSize: 8, color: '#64748b', textAlign: 'right', marginTop: 2 },
  dividerBlue: { height: 2, backgroundColor: '#4c2de0', borderRadius: 2, marginBottom: 14 },

  // Info strip (business + customer)
  infoStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
    borderStyle: 'solid',
  },
  infoLabel: { fontSize: 7, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.9, marginBottom: 3 },
  infoValue: { fontSize: 9, fontWeight: 600, color: '#1e293b' },
  infoValueSm: { fontSize: 7.5, color: '#64748b', lineHeight: 1.5 },

  // Table
  table: { marginBottom: 16 },

  // Sticky/fixed table header
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#4c2de0',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 3,
  },
  tableHeaderText: {
    fontSize: 7,
    fontWeight: 700,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
    borderBottomStyle: 'solid',
  },
  tableRowAlt: { backgroundColor: '#f8fafc' },
  tableCell: { fontSize: 8, color: '#334155' },
  tableCellDebit: { fontSize: 8, fontWeight: 600, color: '#dc2626' },
  tableCellCredit: { fontSize: 8, fontWeight: 600, color: '#16a34a' },
  tableCellBalance: { fontSize: 8, fontWeight: 700, color: '#1e293b' },
  tableCellDr: { fontSize: 6.5, color: '#94a3b8', marginLeft: 2 },

  // Column widths
  colDate:    { width: '14%' },
  colDesc:    { width: '38%' },
  colDebit:   { width: '16%', textAlign: 'right' },
  colCredit:  { width: '16%', textAlign: 'right' },
  colBalance: { width: '16%', textAlign: 'right' },

  // Summary cards
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
    marginTop: 8,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 6,
    padding: 12,
    borderWidth: 0.5,
    borderStyle: 'solid',
  },
  summaryCardDebit:   { backgroundColor: '#fff1f2', borderColor: '#fecdd3' },
  summaryCardCredit:  { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  summaryCardBalance: { backgroundColor: '#1e293b', borderColor: '#1e293b' },
  summaryLabel: { fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  summaryLabelDebit:   { color: '#ef4444' },
  summaryLabelCredit:  { color: '#22c55e' },
  summaryLabelBalance: { color: '#94a3b8' },
  summaryAmount: { fontSize: 13, fontWeight: 700 },
  summaryAmountDebit:   { color: '#dc2626' },
  summaryAmountCredit:  { color: '#16a34a' },
  summaryAmountBalance: { color: '#FFFFFF' },
  summaryDrCr: { fontSize: 7, color: '#94a3b8', marginLeft: 2 },

  // Signature
  signBlock: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  signBox: { alignItems: 'center', width: 140 },
  signLine: { height: 0.5, backgroundColor: '#94a3b8', width: '100%', marginBottom: 4 },
  signLabel: { fontSize: 7, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.7 },

  // Page footer
  pageFooter: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageFooterText: { fontSize: 7, color: '#cbd5e1' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ─── Props ────────────────────────────────────────────────────────────────────
interface LedgerPDFProps {
  customer: Customer;
  entries: LedgerEntry[];
  businessName: string;
  businessInfo: {
    gstin: string;
    address: string;
    email: string;
    phone: string;
  };
  statementDate?: string;
}

// ─── Running balance computation ──────────────────────────────────────────────
interface EntryWithBalance extends LedgerEntry {
  runningBalance: number;
}

function computeRunningBalance(entries: LedgerEntry[]): EntryWithBalance[] {
  let balance = 0;
  return entries.map(e => {
    balance += e.type === 'Debit' ? e.amount : -e.amount;
    return { ...e, runningBalance: balance };
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
const LedgerPDF: React.FC<LedgerPDFProps> = ({
  customer,
  entries,
  businessName,
  businessInfo,
  statementDate,
}) => {
  const runningEntries = computeRunningBalance(entries);
  const totalDebit  = entries.filter(e => e.type === 'Debit').reduce((s, e) => s + e.amount, 0);
  const totalCredit = entries.filter(e => e.type === 'Credit').reduce((s, e) => s + e.amount, 0);
  const closing     = totalDebit - totalCredit;
  const today       = statementDate ?? new Date().toLocaleDateString('en-IN');

  return (
    <Document
      title={`Ledger Statement – ${customer.name}`}
      author={businessName}
      creator="BillHippo"
    >
      <Page size="A4" style={S.page} wrap>

        {/* ── Fixed Header — repeats on every page ── */}
        <View fixed style={S.fixedHeader}>
          <View style={S.headerRow}>
            {/* Brand */}
            <View style={S.brandRow}>
              <Image
                style={S.logo}
                src="https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c"
              />
              <View>
                <Text style={S.brandName}>BillHippo</Text>
                <Text style={S.brandSub}>Smart Billing for India</Text>
              </View>
            </View>
            {/* Title */}
            <View>
              <Text style={S.docTitle}>ACCOUNT STATEMENT</Text>
              <Text style={S.docSubtitle}>As of {today}</Text>
            </View>
          </View>
          <View style={S.dividerBlue} />
        </View>

        {/* ── Business + Customer Info strip ── */}
        <View style={S.infoStrip}>
          {/* Supplier */}
          <View>
            <Text style={S.infoLabel}>Supplier</Text>
            <Text style={S.infoValue}>{businessName}</Text>
            <Text style={S.infoValueSm}>{businessInfo.address}</Text>
            {businessInfo.gstin && (
              <Text style={[S.infoValueSm, { color: '#4c2de0', fontWeight: 600 }]}>GSTIN: {businessInfo.gstin}</Text>
            )}
            {businessInfo.phone && <Text style={S.infoValueSm}>Ph: {businessInfo.phone}</Text>}
          </View>

          {/* Customer */}
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={S.infoLabel}>Customer Account</Text>
            <Text style={[S.infoValue, { textAlign: 'right', fontSize: 11 }]}>{customer.name}</Text>
            <Text style={[S.infoValueSm, { textAlign: 'right' }]}>{customer.address}, {customer.city}, {customer.state}</Text>
            {customer.gstin && (
              <Text style={[S.infoValueSm, { color: '#4c2de0', fontWeight: 600, textAlign: 'right' }]}>GSTIN: {customer.gstin}</Text>
            )}
            {customer.phone && <Text style={[S.infoValueSm, { textAlign: 'right' }]}>Ph: {customer.phone}</Text>}
          </View>
        </View>

        {/* ── Table ── */}
        <View style={S.table}>
          {/* Table header — fixed so it repeats on every page */}
          <View style={S.tableHeader} fixed>
            <Text style={[S.tableHeaderText, S.colDate]}>Date</Text>
            <Text style={[S.tableHeaderText, S.colDesc]}>Description</Text>
            <Text style={[S.tableHeaderText, S.colDebit]}>Debit (Dr)</Text>
            <Text style={[S.tableHeaderText, S.colCredit]}>Credit (Cr)</Text>
            <Text style={[S.tableHeaderText, S.colBalance]}>Balance</Text>
          </View>

          {/* Rows — wrap={false} prevents a single row from splitting */}
          {runningEntries.length === 0 ? (
            <View style={[S.tableRow, { justifyContent: 'center', paddingVertical: 24 }]}>
              <Text style={[S.tableCell, { color: '#94a3b8', textAlign: 'center', flex: 1 }]}>
                No transactions found.
              </Text>
            </View>
          ) : (
            runningEntries.map((entry, idx) => {
              const drCr = entry.runningBalance >= 0 ? 'Dr' : 'Cr';
              return (
                <View
                  key={entry.id}
                  style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}
                  wrap={false}
                >
                  <Text style={[S.tableCell, S.colDate]}>{entry.date}</Text>
                  <Text style={[S.tableCell, S.colDesc]}>{entry.description}</Text>
                  <Text style={[S.tableCellDebit, S.colDebit]}>
                    {entry.type === 'Debit' ? fmt(entry.amount) : '—'}
                  </Text>
                  <Text style={[S.tableCellCredit, S.colCredit]}>
                    {entry.type === 'Credit' ? fmt(entry.amount) : '—'}
                  </Text>
                  <View style={[S.colBalance, { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }]}>
                    <Text style={S.tableCellBalance}>
                      {fmt(Math.abs(entry.runningBalance))}
                    </Text>
                    <Text style={S.tableCellDr}>{drCr}</Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* ── Summary Cards ── */}
        <View style={S.summaryRow} wrap={false}>
          <View style={[S.summaryCard, S.summaryCardDebit]}>
            <Text style={[S.summaryLabel, S.summaryLabelDebit]}>Total Sales (Dr)</Text>
            <Text style={[S.summaryAmount, S.summaryAmountDebit]}>{fmt(totalDebit)}</Text>
          </View>
          <View style={[S.summaryCard, S.summaryCardCredit]}>
            <Text style={[S.summaryLabel, S.summaryLabelCredit]}>Collections (Cr)</Text>
            <Text style={[S.summaryAmount, S.summaryAmountCredit]}>{fmt(totalCredit)}</Text>
          </View>
          <View style={[S.summaryCard, S.summaryCardBalance]}>
            <Text style={[S.summaryLabel, S.summaryLabelBalance]}>
              Closing Balance
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text style={[S.summaryAmount, S.summaryAmountBalance]}>
                {fmt(Math.abs(closing))}
              </Text>
              <Text style={S.summaryDrCr}>{closing >= 0 ? 'Dr' : 'Cr'}</Text>
            </View>
          </View>
        </View>

        {/* ── Signature block ── */}
        <View style={S.signBlock} wrap={false}>
          <View style={S.signBox}>
            <View style={S.signLine} />
            <Text style={S.signLabel}>Customer Signature</Text>
          </View>
          <View style={S.signBox}>
            <View style={S.signLine} />
            <Text style={S.signLabel}>Authorised Signatory</Text>
            <Text style={[S.signLabel, { color: '#4c2de0', marginTop: 2 }]}>{businessName}</Text>
          </View>
        </View>

        {/* ── Fixed Page Footer ── */}
        <View style={S.pageFooter} fixed>
          <Text style={S.pageFooterText}>Generated by BillHippo | {today}</Text>
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
