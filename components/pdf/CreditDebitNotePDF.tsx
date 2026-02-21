/**
 * CreditDebitNotePDF — A4 GST-compliant Credit Note / Debit Note PDF
 * Uses @react-pdf/renderer with Poppins font (same as InvoicePDF).
 *
 * Accounting Rules:
 *  - Credit Note: Issued under Section 34 CGST Act when reducing customer liability
 *    (goods return, price reduction, discount). Reduces output GST.
 *  - Debit Note: Issued under Section 34 CGST Act when increasing customer liability
 *    (additional charges, price upward revision). Increases output GST.
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
import { CreditNote, DebitNote, BusinessProfile, Customer, GSTType } from '../../types';

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

const DARK   = '#1e293b';
const MID    = '#475569';
const LIGHT  = '#94a3b8';
const BORDER = '#e2e8f0';
const ALT    = '#f8fafc';

function toWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
    'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen',
    'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function conv(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '') + ' ';
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred ' + conv(n % 100);
    if (n < 100000) return conv(Math.floor(n / 1000)) + 'Thousand ' + conv(n % 1000);
    if (n < 10000000) return conv(Math.floor(n / 100000)) + 'Lakh ' + conv(n % 100000);
    return conv(Math.floor(n / 10000000)) + 'Crore ' + conv(n % 10000000);
  }
  return conv(Math.floor(amount)).trim() + ' Only';
}

const s = StyleSheet.create({
  page: { fontFamily: 'Poppins', fontSize: 9, color: DARK, padding: 32, backgroundColor: '#ffffff' },
  // header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  noteTypeBox: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, marginBottom: 6 },
  noteTypeText: { fontWeight: 800, fontSize: 20, letterSpacing: 1 },
  noteSubText: { fontSize: 7, fontWeight: 600, color: MID, letterSpacing: 1, marginTop: 2 },
  metaRow: { flexDirection: 'row', gap: 20, marginTop: 6 },
  metaLabel: { fontSize: 6.5, fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8 },
  metaValue: { fontSize: 8, fontWeight: 700, color: DARK },
  businessName: { fontSize: 11, fontWeight: 800, color: DARK, textAlign: 'right' },
  businessDetail: { fontSize: 7, color: MID, textAlign: 'right', marginTop: 2 },
  divider: { height: 2, borderRadius: 1, marginBottom: 14 },
  // cards
  cards: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  card: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: ALT, border: `1pt solid ${BORDER}` },
  cardLabel: { fontSize: 6.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
  cardName: { fontSize: 10, fontWeight: 800, color: DARK },
  cardDetail: { fontSize: 7, color: MID, marginTop: 2, lineHeight: 1.4 },
  cardGstin: { fontSize: 7, fontWeight: 700, color: DARK, marginTop: 4 },
  // original invoice reference
  refBox: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  refItem: { flex: 1, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: ALT, borderRadius: 8, border: `1pt solid ${BORDER}` },
  refLabel: { fontSize: 6, fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8 },
  refValue: { fontSize: 8, fontWeight: 700, color: DARK, marginTop: 1 },
  // table
  table: { marginBottom: 12, borderRadius: 8, overflow: 'hidden', border: `1pt solid ${BORDER}` },
  tableHead: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 4 },
  tableHeadCell: { fontSize: 6.5, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 4, borderTop: `1pt solid ${BORDER}` },
  tableCell: { fontSize: 7.5, color: MID, fontWeight: 500 },
  tableCellBold: { fontSize: 7.5, color: DARK, fontWeight: 700 },
  // totals
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 3 },
  totalsLabel: { fontSize: 8, color: MID, fontWeight: 600, width: 110, textAlign: 'right', paddingRight: 10 },
  totalsValue: { fontSize: 8, color: DARK, fontWeight: 700, width: 90, textAlign: 'right' },
  grandTotalRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingTop: 6, marginTop: 4, borderTop: `2pt solid ${BORDER}` },
  grandTotalLabel: { fontSize: 12, fontWeight: 800, width: 110, textAlign: 'right', paddingRight: 10 },
  grandTotalValue: { fontSize: 12, fontWeight: 800, width: 90, textAlign: 'right' },
  // amount in words
  wordsBox: { padding: 10, backgroundColor: ALT, borderRadius: 8, marginBottom: 12 },
  wordsLabel: { fontSize: 6, fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  wordsText: { fontSize: 8, fontWeight: 700, color: DARK, fontStyle: 'italic' },
  // reason
  reasonBox: { padding: 10, backgroundColor: ALT, borderRadius: 8, marginBottom: 12, border: `1pt solid ${BORDER}` },
  reasonLabel: { fontSize: 6.5, fontWeight: 800, color: LIGHT, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 },
  reasonText: { fontSize: 8, fontWeight: 500, color: MID },
  // footer
  footer: { marginTop: 'auto', paddingTop: 10, borderTop: `1pt solid ${BORDER}`, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  footerLeft: { fontSize: 7, color: LIGHT },
  signBox: { alignItems: 'flex-end' },
  signImage: { width: 72, height: 28, objectFit: 'contain', marginBottom: 2 },
  signLine: { width: 80, height: 1, backgroundColor: BORDER, marginBottom: 3 },
  signLabel: { fontSize: 6, fontWeight: 700, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8 },
  signName: { fontSize: 7, fontWeight: 700, color: DARK, marginTop: 1 },
  // gst note
  gstNote: { fontSize: 6.5, color: LIGHT, fontStyle: 'italic', marginBottom: 6 },
});

interface CreditDebitNotePDFProps {
  note: CreditNote | DebitNote;
  noteType: 'credit' | 'debit';
  business: BusinessProfile;
  customer: Customer;
}

const CreditDebitNotePDF: React.FC<CreditDebitNotePDFProps> = ({ note, noteType, business, customer }) => {
  const primaryColor = business.theme?.primaryColor || '#4c2de0';
  const isCredit = noteType === 'credit';
  const accentColor = isCredit ? '#10b981' : '#f59e0b';
  const noteLabel = isCredit ? 'CREDIT NOTE' : 'DEBIT NOTE';
  const taxAmount = note.cgst + note.sgst + note.igst;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View>
            <View style={[s.noteTypeBox, { backgroundColor: `${accentColor}18` }]}>
              <Text style={[s.noteTypeText, { color: accentColor }]}>{noteLabel}</Text>
            </View>
            <Text style={s.noteSubText}>GST Compliant · Section 34 CGST Act</Text>
            <View style={s.metaRow}>
              <View>
                <Text style={s.metaLabel}>Note No.</Text>
                <Text style={s.metaValue}>{note.noteNumber}</Text>
              </View>
              <View>
                <Text style={s.metaLabel}>Date</Text>
                <Text style={s.metaValue}>{note.date}</Text>
              </View>
              {note.originalInvoiceNumber && (
                <View>
                  <Text style={s.metaLabel}>Ref. Invoice</Text>
                  <Text style={s.metaValue}>{note.originalInvoiceNumber}</Text>
                </View>
              )}
            </View>
          </View>
          <View>
            <Text style={s.businessName}>{business.name}</Text>
            <Text style={s.businessDetail}>{business.address}, {business.city}, {business.state} - {business.pincode}</Text>
            {business.gstin && <Text style={[s.businessDetail, { fontWeight: 700, color: primaryColor }]}>GSTIN: {business.gstin}</Text>}
            {business.pan && <Text style={s.businessDetail}>PAN: {business.pan}</Text>}
          </View>
        </View>

        {/* ── Colour divider ── */}
        <View style={[s.divider, { backgroundColor: accentColor }]} />

        {/* ── Billed by / Billed to ── */}
        <View style={s.cards}>
          <View style={[s.card, { backgroundColor: `${primaryColor}0e` }]}>
            <Text style={[s.cardLabel, { color: primaryColor }]}>Issued by</Text>
            <Text style={s.cardName}>{business.name}</Text>
            <Text style={s.cardDetail}>{business.address}, {business.city}, {business.state} - {business.pincode}</Text>
            <Text style={s.cardGstin}>GSTIN: {business.gstin || '—'} · PAN: {business.pan || '—'}</Text>
          </View>
          <View style={[s.card, { backgroundColor: `${primaryColor}0e` }]}>
            <Text style={[s.cardLabel, { color: primaryColor }]}>Issued to</Text>
            <Text style={s.cardName}>{customer.name}</Text>
            <Text style={s.cardDetail}>{customer.address || '—'}, {customer.city || '—'}, {customer.state || '—'} - {customer.pincode || '—'}</Text>
            {customer.phone && <Text style={s.cardDetail}>{customer.phone}</Text>}
            <Text style={s.cardGstin}>GSTIN: {customer.gstin || '—'}</Text>
          </View>
        </View>

        {/* ── Reference & Reason ── */}
        <View style={s.refBox}>
          <View style={s.refItem}>
            <Text style={s.refLabel}>Place of Supply</Text>
            <Text style={s.refValue}>{customer.state || business.state}</Text>
          </View>
          <View style={s.refItem}>
            <Text style={s.refLabel}>GST Treatment</Text>
            <Text style={s.refValue}>{note.gstType === GSTType.CGST_SGST ? 'CGST + SGST (Intra-state)' : 'IGST (Inter-state)'}</Text>
          </View>
          <View style={s.refItem}>
            <Text style={s.refLabel}>Note Type</Text>
            <Text style={[s.refValue, { color: accentColor }]}>{isCredit ? 'Reduces Customer Balance' : 'Increases Customer Balance'}</Text>
          </View>
        </View>

        {/* ── Reason Box ── */}
        {note.reason && (
          <View style={s.reasonBox}>
            <Text style={s.reasonLabel}>Reason for {isCredit ? 'Credit' : 'Debit'} Note</Text>
            <Text style={s.reasonText}>{note.reason}</Text>
          </View>
        )}

        {/* ── Items Table ── */}
        <View style={s.table}>
          <View style={[s.tableHead, { backgroundColor: accentColor }]}>
            <Text style={[s.tableHeadCell, { width: 20 }]}>#</Text>
            <Text style={[s.tableHeadCell, { flex: 1 }]}>Description</Text>
            <Text style={[s.tableHeadCell, { width: 50, textAlign: 'center' }]}>HSN/SAC</Text>
            <Text style={[s.tableHeadCell, { width: 30, textAlign: 'center' }]}>Qty</Text>
            <Text style={[s.tableHeadCell, { width: 50, textAlign: 'right' }]}>Rate</Text>
            <Text style={[s.tableHeadCell, { width: 35, textAlign: 'center' }]}>GST%</Text>
            <Text style={[s.tableHeadCell, { width: 60, textAlign: 'right' }]}>Taxable</Text>
            {note.gstType === GSTType.CGST_SGST ? (
              <>
                <Text style={[s.tableHeadCell, { width: 50, textAlign: 'right' }]}>CGST</Text>
                <Text style={[s.tableHeadCell, { width: 50, textAlign: 'right' }]}>SGST</Text>
              </>
            ) : (
              <Text style={[s.tableHeadCell, { width: 60, textAlign: 'right' }]}>IGST</Text>
            )}
            <Text style={[s.tableHeadCell, { width: 65, textAlign: 'right' }]}>Total</Text>
          </View>
          {note.items.map((item, idx) => {
            const taxable = item.quantity * item.rate;
            const itemTax = taxable * item.gstRate / 100;
            const halfTax = itemTax / 2;
            return (
              <View key={item.id} wrap={false} style={[s.tableRow, idx % 2 === 0 ? {} : { backgroundColor: ALT }]}>
                <Text style={[s.tableCell, { width: 20 }]}>{idx + 1}</Text>
                <Text style={[s.tableCellBold, { flex: 1 }]}>{item.description || '—'}</Text>
                <Text style={[s.tableCell, { width: 50, textAlign: 'center' }]}>{item.hsnCode || '—'}</Text>
                <Text style={[s.tableCellBold, { width: 30, textAlign: 'center' }]}>{item.quantity}</Text>
                <Text style={[s.tableCell, { width: 50, textAlign: 'right' }]}>₹{item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                <Text style={[s.tableCell, { width: 35, textAlign: 'center' }]}>{item.gstRate}%</Text>
                <Text style={[s.tableCell, { width: 60, textAlign: 'right' }]}>₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                {note.gstType === GSTType.CGST_SGST ? (
                  <>
                    <Text style={[s.tableCell, { width: 50, textAlign: 'right' }]}>₹{halfTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                    <Text style={[s.tableCell, { width: 50, textAlign: 'right' }]}>₹{halfTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                  </>
                ) : (
                  <Text style={[s.tableCell, { width: 60, textAlign: 'right' }]}>₹{itemTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
                )}
                <Text style={[s.tableCellBold, { width: 65, textAlign: 'right' }]}>₹{(taxable + itemTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>
            );
          })}
        </View>

        {/* ── Totals ── */}
        <View style={{ marginBottom: 10 }}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Sub Total</Text>
            <Text style={s.totalsValue}>₹{note.totalBeforeTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          </View>
          {note.gstType === GSTType.CGST_SGST ? (
            <>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>CGST</Text>
                <Text style={s.totalsValue}>₹{note.cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>SGST</Text>
                <Text style={s.totalsValue}>₹{note.sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
              </View>
            </>
          ) : (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>IGST</Text>
              <Text style={s.totalsValue}>₹{note.igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
            </View>
          )}
          <View style={s.grandTotalRow}>
            <Text style={[s.grandTotalLabel, { color: accentColor }]}>Total {isCredit ? 'Credit' : 'Debit'}</Text>
            <Text style={[s.grandTotalValue, { color: accentColor }]}>₹{note.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          </View>
        </View>

        {/* ── Amount in Words ── */}
        <View style={s.wordsBox}>
          <Text style={s.wordsLabel}>Amount in Words</Text>
          <Text style={s.wordsText}>{toWords(note.totalAmount)}</Text>
        </View>

        {/* ── GST Note ── */}
        <Text style={s.gstNote}>
          {isCredit
            ? 'This Credit Note is issued under Section 34 of the CGST Act, 2017. The tax credit noted herein shall reduce the output tax liability of the supplier.'
            : 'This Debit Note is issued under Section 34 of the CGST Act, 2017. The tax noted herein shall increase the output tax liability of the supplier.'}
        </Text>

        {/* ── Footer ── */}
        <View style={s.footer}>
          <View>
            {business.email && <Text style={s.footerLeft}>✉ {business.email}</Text>}
            {business.phone && <Text style={s.footerLeft}>✆ {business.phone}</Text>}
            <Text style={[s.footerLeft, { marginTop: 4, color: '#cbd5e1' }]}>Generated via BillHippo Smart OS</Text>
          </View>
          <View style={s.signBox}>
            {business.signatureUrl
              ? <Image src={business.signatureUrl} style={s.signImage} />
              : <View style={s.signLine} />
            }
            <Text style={s.signLabel}>Authorised Signatory</Text>
            <Text style={s.signName}>{business.name}</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
};

export default CreditDebitNotePDF;
