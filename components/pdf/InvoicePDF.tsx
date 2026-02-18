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
import { Invoice, BusinessProfile, Customer, GSTType } from '../../types';

// Register clean embedded fonts
Font.register({
  family: 'Inter',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiJ-Ek-_EeA.woff', fontWeight: 400 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuI6fAZ9hiJ-Ek-_EeA.woff', fontWeight: 600 },
    { src: 'https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYAZ9hiJ-Ek-_EeA.woff', fontWeight: 700 },
  ],
});

// ─── Styles (A4: 595pt × 842pt) ──────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Inter',
    fontSize: 9,
    backgroundColor: '#FFFFFF',
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    color: '#1e293b',
  },

  // Header row
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  logo: { width: 36, height: 36, borderRadius: 8, objectFit: 'contain' },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandName: { fontSize: 14, fontWeight: 700, color: '#4c2de0', letterSpacing: 1 },
  invoiceTitle: { fontSize: 22, fontWeight: 700, color: '#1e293b', textAlign: 'right' },
  invoiceNo: { fontSize: 9, color: '#64748b', textAlign: 'right', marginTop: 2 },

  // Divider
  divider: { height: 2, backgroundColor: '#4c2de0', borderRadius: 2, marginBottom: 20 },
  dividerThin: { height: 0.5, backgroundColor: '#e2e8f0', marginVertical: 14 },

  // Info grid
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 16 },
  infoBox: { flex: 1 },
  infoLabel: { fontSize: 7, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  infoValue: { fontSize: 9, fontWeight: 600, color: '#1e293b', lineHeight: 1.5 },
  infoValueSm: { fontSize: 8, color: '#475569', lineHeight: 1.5 },

  // Status badge
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, alignSelf: 'flex-start', marginTop: 4 },
  badgePaid: { backgroundColor: '#dcfce7' },
  badgeUnpaid: { backgroundColor: '#fee2e2' },
  badgePartial: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  badgeTextPaid: { color: '#16a34a' },
  badgeTextUnpaid: { color: '#dc2626' },
  badgeTextPartial: { color: '#d97706' },

  // Table
  table: { marginBottom: 20 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#4c2de0',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  tableHeaderFixed: {
    flexDirection: 'row',
    backgroundColor: '#4c2de0',
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tableHeaderText: { fontSize: 7, fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.8 },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
    borderBottomStyle: 'solid',
  },
  tableRowAlt: { backgroundColor: '#f8fafc' },
  tableCell: { fontSize: 8, color: '#334155' },

  // Column widths — Invoice table
  colNo:    { width: '5%' },
  colDesc:  { width: '32%' },
  colHsn:   { width: '12%' },
  colQty:   { width: '8%', textAlign: 'center' },
  colRate:  { width: '13%', textAlign: 'right' },
  colGst:   { width: '8%', textAlign: 'center' },
  colTax:   { width: '12%', textAlign: 'right' },
  colAmt:   { width: '10%', textAlign: 'right' },

  // Totals block
  totalsBlock: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 20 },
  totalsInner: { width: '45%', gap: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalLabel: { fontSize: 8, color: '#64748b' },
  totalValue: { fontSize: 8, fontWeight: 600, color: '#334155' },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#4c2de0',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 9, fontWeight: 700, color: '#FFFFFF' },
  grandTotalValue: { fontSize: 10, fontWeight: 700, color: '#FFFFFF' },

  // Amount in words
  amountWords: { fontSize: 7.5, fontWeight: 600, color: '#64748b', fontStyle: 'italic', marginBottom: 16 },

  // Bank + Notes
  footerGrid: { flexDirection: 'row', gap: 16, marginBottom: 20 },
  footerBox: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 6, padding: 10, borderWidth: 0.5, borderColor: '#e2e8f0', borderStyle: 'solid' },
  footerLabel: { fontSize: 7, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
  footerValue: { fontSize: 8, color: '#475569', lineHeight: 1.6 },

  // Signature
  signBox: { alignItems: 'flex-end', marginTop: 10 },
  signLine: { width: 120, height: 0.5, backgroundColor: '#94a3b8', marginBottom: 4 },
  signLabel: { fontSize: 7, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 },

  // Page number
  pageNumber: { position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', fontSize: 7, color: '#94a3b8' },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(n: number): string {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
  }

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let result = convert(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + convert(paise) + ' Paise';
  return result + ' Only';
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface InvoicePDFProps {
  invoice: Invoice;
  business: BusinessProfile;
  customer: Customer;
}

// ─── Component ────────────────────────────────────────────────────────────────
const InvoicePDF: React.FC<InvoicePDFProps> = ({ invoice, business, customer }) => {
  const hasGst = business.gstEnabled;

  const itemsWithTax = invoice.items.map(item => {
    const lineTotal = item.quantity * item.rate;
    const taxAmt = lineTotal * (item.gstRate / 100);
    return { ...item, lineTotal, taxAmt, totalWithTax: lineTotal + taxAmt };
  });

  const getBadgeStyle = () => {
    if (invoice.status === 'Paid') return [S.badge, S.badgePaid];
    if (invoice.status === 'Unpaid') return [S.badge, S.badgeUnpaid];
    return [S.badge, S.badgePartial];
  };
  const getBadgeTextStyle = () => {
    if (invoice.status === 'Paid') return [S.badgeText, S.badgeTextPaid];
    if (invoice.status === 'Unpaid') return [S.badgeText, S.badgeTextUnpaid];
    return [S.badgeText, S.badgeTextPartial];
  };

  return (
    <Document
      title={`Invoice ${invoice.invoiceNumber}`}
      author={business.name}
      creator="BillHippo"
    >
      <Page size="A4" style={S.page} wrap>

        {/* ── Repeating Header (fixed on every page) ── */}
        <View fixed>
          <View style={S.headerRow}>
            {/* Left: Brand */}
            <View style={S.brandBlock}>
              <Image
                style={S.logo}
                src="https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c"
              />
              <View>
                <Text style={S.brandName}>BillHippo</Text>
                <Text style={{ fontSize: 7, color: '#64748b' }}>Smart Billing for India</Text>
              </View>
            </View>
            {/* Right: Invoice title */}
            <View>
              <Text style={S.invoiceTitle}>TAX INVOICE</Text>
              <Text style={S.invoiceNo}>#{invoice.invoiceNumber}</Text>
              <View style={getBadgeStyle()}>
                <Text style={getBadgeTextStyle()}>{invoice.status}</Text>
              </View>
            </View>
          </View>
          <View style={S.divider} />
        </View>

        {/* ── Business & Customer Info (only on first page effectively, after fixed) ── */}
        <View style={S.infoGrid}>
          {/* From */}
          <View style={S.infoBox}>
            <Text style={S.infoLabel}>From</Text>
            <Text style={[S.infoValue, { fontSize: 11 }]}>{business.name}</Text>
            <Text style={S.infoValueSm}>{business.address}, {business.city}</Text>
            <Text style={S.infoValueSm}>{business.state} – {business.pincode}</Text>
            {business.gstin && <Text style={[S.infoValueSm, { color: '#4c2de0', fontWeight: 600, marginTop: 2 }]}>GSTIN: {business.gstin}</Text>}
            {business.phone && <Text style={S.infoValueSm}>Ph: {business.phone}</Text>}
            {business.email && <Text style={S.infoValueSm}>{business.email}</Text>}
          </View>

          {/* To */}
          <View style={S.infoBox}>
            <Text style={S.infoLabel}>Bill To</Text>
            <Text style={[S.infoValue, { fontSize: 11 }]}>{customer.name}</Text>
            <Text style={S.infoValueSm}>{customer.address}, {customer.city}</Text>
            <Text style={S.infoValueSm}>{customer.state} – {customer.pincode}</Text>
            {customer.gstin && <Text style={[S.infoValueSm, { color: '#4c2de0', fontWeight: 600, marginTop: 2 }]}>GSTIN: {customer.gstin}</Text>}
            {customer.phone && <Text style={S.infoValueSm}>Ph: {customer.phone}</Text>}
          </View>

          {/* Date / Due */}
          <View style={[S.infoBox, { alignItems: 'flex-end' }]}>
            <Text style={S.infoLabel}>Invoice Date</Text>
            <Text style={S.infoValue}>{invoice.date}</Text>
            <View style={{ marginTop: 10 }}>
              <Text style={S.infoLabel}>GST Type</Text>
              <Text style={S.infoValue}>{invoice.gstType === GSTType.IGST ? 'IGST (Inter-state)' : 'CGST + SGST (Intra-state)'}</Text>
            </View>
          </View>
        </View>

        <View style={S.dividerThin} />

        {/* ── Items Table ── */}
        <View style={S.table}>
          {/* Table header — repeats on every page via fixed */}
          <View style={S.tableHeader} fixed>
            <Text style={[S.tableHeaderText, S.colNo]}>#</Text>
            <Text style={[S.tableHeaderText, S.colDesc]}>Description</Text>
            <Text style={[S.tableHeaderText, S.colHsn]}>HSN/SAC</Text>
            <Text style={[S.tableHeaderText, S.colQty]}>Qty</Text>
            <Text style={[S.tableHeaderText, S.colRate]}>Rate</Text>
            {hasGst && <Text style={[S.tableHeaderText, S.colGst]}>GST%</Text>}
            {hasGst && <Text style={[S.tableHeaderText, S.colTax]}>Tax Amt</Text>}
            <Text style={[S.tableHeaderText, S.colAmt]}>Amount</Text>
          </View>

          {/* Rows — wrap={false} prevents row from splitting across pages */}
          {itemsWithTax.map((item, idx) => (
            <View key={item.id} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]} wrap={false}>
              <Text style={[S.tableCell, S.colNo]}>{idx + 1}</Text>
              <Text style={[S.tableCell, S.colDesc]}>{item.description}</Text>
              <Text style={[S.tableCell, S.colHsn]}>{item.hsnCode || '—'}</Text>
              <Text style={[S.tableCell, S.colQty]}>{item.quantity}</Text>
              <Text style={[S.tableCell, S.colRate]}>{fmt(item.rate)}</Text>
              {hasGst && <Text style={[S.tableCell, S.colGst]}>{item.gstRate}%</Text>}
              {hasGst && <Text style={[S.tableCell, S.colTax]}>{fmt(item.taxAmt)}</Text>}
              <Text style={[S.tableCell, S.colAmt, { fontWeight: 600 }]}>{fmt(item.totalWithTax)}</Text>
            </View>
          ))}
        </View>

        {/* ── Totals Block ── */}
        <View style={S.totalsBlock} wrap={false}>
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

            <View style={S.grandTotalRow}>
              <Text style={S.grandTotalLabel}>TOTAL PAYABLE</Text>
              <Text style={S.grandTotalValue}>{fmt(invoice.totalAmount)}</Text>
            </View>
          </View>
        </View>

        {/* Amount in words */}
        <Text style={S.amountWords}>Amount in words: {toWords(invoice.totalAmount)}</Text>

        <View style={S.dividerThin} />

        {/* ── Bank Details + Notes ── */}
        <View style={S.footerGrid} wrap={false}>
          {(business.bankName || business.accountNumber) && (
            <View style={S.footerBox}>
              <Text style={S.footerLabel}>Bank Details</Text>
              {business.bankName && <Text style={S.footerValue}>Bank: {business.bankName}</Text>}
              {business.accountNumber && <Text style={S.footerValue}>A/c: {business.accountNumber}</Text>}
              {business.ifscCode && <Text style={S.footerValue}>IFSC: {business.ifscCode}</Text>}
              {business.upiId && <Text style={S.footerValue}>UPI: {business.upiId}</Text>}
            </View>
          )}
          {business.defaultNotes && (
            <View style={S.footerBox}>
              <Text style={S.footerLabel}>Notes</Text>
              <Text style={S.footerValue}>{business.defaultNotes}</Text>
            </View>
          )}
          {business.termsAndConditions && (
            <View style={S.footerBox}>
              <Text style={S.footerLabel}>Terms & Conditions</Text>
              <Text style={S.footerValue}>{business.termsAndConditions}</Text>
            </View>
          )}
        </View>

        {/* ── Signature ── */}
        <View style={S.signBox} wrap={false}>
          <View style={S.signLine} />
          <Text style={S.signLabel}>Authorised Signatory – {business.name}</Text>
        </View>

        {/* ── Page number (fixed footer) ── */}
        <Text
          style={S.pageNumber}
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages} | Generated by BillHippo`}
          fixed
        />
      </Page>
    </Document>
  );
};

export default InvoicePDF;
