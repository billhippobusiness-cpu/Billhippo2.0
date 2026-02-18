/**
 * InvoicePDF — faithfully mirrors the two HTML invoice templates
 *
 * modern-2: Large "INVOICE" heading left + biz name right, slate-50 cards,
 *            Item/HSN/Qty/GST/Amount table, 2-col footer (bank | totals)
 * modern-1: Logo-box | INVOICE centred | Inv#+Date, tinted colour cards,
 *            Item/HSN/Qty/Rate/Amount table, 2-col footer (bank | totals)
 *
 * Theme colours come from business.theme.primaryColor (any hex).
 * Built-in Helvetica used → zero network fetch → no blank-render risk.
 * "Rs." used instead of "₹" (Helvetica lacks the rupee glyph).
 */

import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Invoice, BusinessProfile, Customer, GSTType } from '../../types';

// ─── Static colours (non-themed) ─────────────────────────────────────────────
const DARK   = '#1e293b';
const MID    = '#475569';
const LIGHT  = '#94a3b8';
const SLATE9 = '#f8fafc';       // bg-slate-50
const BORDER = '#e2e8f0';       // border-slate-200
const DIVIDER= '#f1f5f9';       // divide-slate-100
const GREEN  = '#10b981';       // emerald-500 for Tax label

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Convert #rrggbb hex + 0-1 alpha → "rgba(r,g,b,a)" string */
function rgba(hex: string, alpha: number): string {
  if (!hex || hex.length < 7) return `rgba(76,45,224,${alpha})`;
  try {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  } catch { return `rgba(76,45,224,${alpha})`; }
}

const fmtAmt = (n: number) =>
  `Rs.${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toWords(num: number): string {
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
    'Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function conv(n: number): string {
    if (!n) return '';
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n/10)] + (n%10 ? ' '+a[n%10] : '');
    if (n < 1000) return a[Math.floor(n/100)]+' Hundred'+(n%100 ? ' '+conv(n%100) : '');
    if (n < 100000) return conv(Math.floor(n/1000))+' Thousand'+(n%1000 ? ' '+conv(n%1000) : '');
    if (n < 10000000) return conv(Math.floor(n/100000))+' Lakh'+(n%100000 ? ' '+conv(n%100000) : '');
    return conv(Math.floor(n/10000000))+' Crore'+(n%10000000 ? ' '+conv(n%10000000) : '');
  }
  const rupees = Math.floor(num);
  const paise  = Math.round((num - rupees) * 100);
  return conv(rupees)+' Rupees'+(paise ? ' and '+conv(paise)+' Paise' : '')+' Only';
}

// ─── Base page style ──────────────────────────────────────────────────────────
const basePage = {
  fontFamily: 'Helvetica',
  fontSize: 9,
  backgroundColor: '#FFFFFF',
  color: DARK,
  paddingTop: 36,
  paddingBottom: 50,
  paddingHorizontal: 36,
};

// ─── Shared tiny stylesheet (rows / cells used by both templates) ─────────────
const sh = StyleSheet.create({
  // table
  tableRow: {
    flexDirection: 'row' as const,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: DIVIDER,
    borderBottomStyle: 'solid' as const,
  },
  rowAlt: { backgroundColor: SLATE9 },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#FFFFFF', textTransform: 'uppercase' as const },
  td: { fontSize: 8, color: MID },
  tdBold: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },

  // info label / value reused in both
  infoLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase' as const, letterSpacing: 0.8, marginBottom: 3 },
  infoName:  { fontSize: 11, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 2 },
  infoAddr:  { fontSize: 8, color: MID, lineHeight: 1.5 },
  infoBlue:  { fontSize: 8, fontFamily: 'Helvetica-Bold', marginTop: 1 },
  microLabel:{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase' as const, marginBottom: 2 },
  microValue:{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },

  // totals rows
  totLine:  { flexDirection: 'row' as const, justifyContent: 'space-between' as const, paddingVertical: 3 },
  totLabel: { fontSize: 8, color: MID },
  totValue: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK },

  // page number fixed footer
  pageNum: { position: 'absolute' as const, bottom: 18, left: 0, right: 0, textAlign: 'center' as const, fontSize: 7, color: LIGHT },
});

// ─── Props ────────────────────────────────────────────────────────────────────
interface InvoicePDFProps {
  invoice:  Invoice;
  business: BusinessProfile;
  customer: Customer;
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN COMPONENT — dispatches to the right template
// ══════════════════════════════════════════════════════════════════════════════
const InvoicePDF: React.FC<InvoicePDFProps> = ({ invoice, business, customer }) => {
  const primary  = business.theme?.primaryColor || '#4c2de0';
  const template = business.theme?.templateId   || 'modern-2';
  const hasGst   = business.gstEnabled;

  const subTotal   = invoice.totalBeforeTax;
  const taxAmount  = invoice.cgst + invoice.sgst + invoice.igst;
  const grandTotal = invoice.totalAmount;

  if (template === 'modern-1') {
    return <Modern1PDF
      invoice={invoice} business={business} customer={customer}
      primary={primary} hasGst={hasGst}
      subTotal={subTotal} taxAmount={taxAmount} grandTotal={grandTotal}
    />;
  }
  return <Modern2PDF
    invoice={invoice} business={business} customer={customer}
    primary={primary} hasGst={hasGst}
    subTotal={subTotal} taxAmount={taxAmount} grandTotal={grandTotal}
  />;
};

// ─── Shared sub-props ─────────────────────────────────────────────────────────
interface TemplateProps {
  invoice: Invoice; business: BusinessProfile; customer: Customer;
  primary: string; hasGst: boolean;
  subTotal: number; taxAmount: number; grandTotal: number;
}

// ══════════════════════════════════════════════════════════════════════════════
//  MODERN-2 template
//  ┌─────────────────────────────────────────────────────┐
//  │ INVOICE (huge, primaryColor)       │ BusinessName   │
//  │ Invoice# …    Invoice Date …       │                │
//  ├──────────────────┬──────────────────┤
//  │ Billed by (slate-50 card)          │ Billed to      │
//  ├──────────────────────────────────────────────────────┤
//  │ Item desc │ HSN │ Qty │ GST% │ Amount (primaryColor header) │
//  ├──────────────────────────────────────────────────────┤
//  │ Bank & Payments  │  Totals + Grand Total + AmtWords │
//  └──────────────────────────────────────────────────────┘
// ══════════════════════════════════════════════════════════════════════════════
const Modern2PDF: React.FC<TemplateProps> = ({
  invoice, business, customer, primary, hasGst,
  subTotal, taxAmount, grandTotal,
}) => {
  const col = {
    desc: { width: '42%' },
    hsn:  { width: '12%', textAlign: 'center' as const },
    qty:  { width: '10%', textAlign: 'center' as const },
    gst:  { width: '10%', textAlign: 'center' as const },
    amt:  { width: '26%', textAlign: 'right'  as const },
  };

  return (
    <Document title={`Invoice ${invoice.invoiceNumber}`} author={business.name} creator="BillHippo">
      <Page size="A4" style={basePage} wrap>

        {/* ── 1. TOP ROW: huge "INVOICE" left | business name right ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          {/* Left */}
          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 52, fontFamily: 'Helvetica-Bold', color: primary, textTransform: 'uppercase', letterSpacing: -1, lineHeight: 1 }}>
              Invoice
            </Text>
            <View style={{ gap: 3 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 1 }}>Invoice#</Text>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK }}>{invoice.invoiceNumber}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 1 }}>Invoice Date</Text>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK }}>{invoice.date}</Text>
              </View>
            </View>
          </View>
          {/* Right: business name (no logo — CORS safe) */}
          <View style={{ alignItems: 'flex-end' }}>
            <View style={{ width: 80, height: 36, backgroundColor: SLATE9, borderRadius: 6, marginBottom: 4, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 6, color: LIGHT }}>LOGO</Text>
            </View>
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: DARK, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {business.name}
            </Text>
          </View>
        </View>

        {/* ── 2. INFO CARDS (bg-slate-50) ── */}
        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 24 }}>
          {/* Billed by */}
          <View style={{ flex: 1, backgroundColor: SLATE9, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', borderRadius: 8, padding: 14 }}>
            <Text style={[sh.infoLabel, { color: primary, marginBottom: 8 }]}>Billed by</Text>
            <Text style={sh.infoName}>{business.name}</Text>
            <Text style={sh.infoAddr}>{business.address}, {business.city}, {business.state} - {business.pincode}</Text>
            <View style={{ flexDirection: 'row', gap: 24, marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid' }}>
              <View>
                <Text style={sh.microLabel}>GSTIN</Text>
                <Text style={sh.microValue}>{business.gstin || '—'}</Text>
              </View>
              <View>
                <Text style={sh.microLabel}>PAN</Text>
                <Text style={sh.microValue}>{business.pan || '—'}</Text>
              </View>
            </View>
          </View>
          {/* Billed to */}
          <View style={{ flex: 1, backgroundColor: SLATE9, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', borderRadius: 8, padding: 14 }}>
            <Text style={[sh.infoLabel, { color: primary, marginBottom: 8 }]}>Billed to</Text>
            <Text style={sh.infoName}>{customer.name}</Text>
            <Text style={sh.infoAddr}>{customer.address}, {customer.city}, {customer.state} - {customer.pincode}</Text>
            <View style={{ flexDirection: 'row', gap: 24, marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid' }}>
              <View>
                <Text style={sh.microLabel}>GSTIN</Text>
                <Text style={sh.microValue}>{customer.gstin || '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 3. TABLE ── */}
        <View style={{ marginBottom: 24 }}>
          {/* Header — fixed repeats on every page */}
          <View style={{ flexDirection: 'row', backgroundColor: primary, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 4 }} fixed>
            <Text style={[sh.th, col.desc]}>Item description</Text>
            <Text style={[sh.th, col.hsn]}>HSN</Text>
            <Text style={[sh.th, col.qty]}>Qty.</Text>
            {hasGst && <Text style={[sh.th, col.gst]}>GST</Text>}
            <Text style={[sh.th, col.amt]}>Amount</Text>
          </View>

          {invoice.items.map((item, idx) => (
            <View key={item.id} style={[sh.tableRow, idx % 2 === 1 ? sh.rowAlt : {}]} wrap={false}>
              <Text style={[sh.td, col.desc]}>{idx + 1}. {item.description || 'No description'}</Text>
              <Text style={[sh.td, col.hsn]}>{item.hsnCode || '—'}</Text>
              <Text style={[sh.tdBold, col.qty]}>{item.quantity}</Text>
              {hasGst && <Text style={[sh.td, col.gst]}>{item.gstRate}%</Text>}
              <Text style={[sh.tdBold, col.amt]}>{fmtAmt(item.quantity * item.rate)}</Text>
            </View>
          ))}
        </View>

        {/* ── 4. FOOTER (bank left | totals right) ── */}
        <View style={{ flexDirection: 'row', gap: 40, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid' }} wrap={false}>

          {/* Left: Bank & Payments + Terms */}
          <View style={{ flex: 1, gap: 14 }}>
            {(business.bankName || business.accountNumber || business.upiId) && (
              <View style={{ gap: 4 }}>
                <Text style={[sh.infoLabel, { color: primary }]}>Bank &amp; Payments</Text>
                {business.name        && <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 8, color: LIGHT, textTransform: 'uppercase' }}>A/c Holder</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK }}>{business.name}</Text></View>}
                {business.accountNumber && <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 8, color: LIGHT, textTransform: 'uppercase' }}>A/c Number</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK }}>{business.accountNumber}</Text></View>}
                {business.ifscCode     && <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 8, color: LIGHT, textTransform: 'uppercase' }}>IFSC Code</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK }}>{business.ifscCode}</Text></View>}
                {business.bankName     && <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ fontSize: 8, color: LIGHT, textTransform: 'uppercase' }}>Bank Name</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK }}>{business.bankName}</Text></View>}
                {business.upiId        && <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4, borderTopWidth: 0.5, borderTopColor: DIVIDER, borderTopStyle: 'solid', marginTop: 2 }}><Text style={{ fontSize: 8, color: LIGHT, textTransform: 'uppercase' }}>UPI ID</Text><Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: primary }}>{business.upiId}</Text></View>}
              </View>
            )}
            {business.termsAndConditions && (
              <View style={{ gap: 4 }}>
                <Text style={[sh.infoLabel, { color: GREEN }]}>Terms and Conditions</Text>
                <Text style={{ fontSize: 7.5, color: LIGHT, fontFamily: 'Helvetica-Oblique', lineHeight: 1.5 }}>{business.termsAndConditions}</Text>
              </View>
            )}
          </View>

          {/* Right: Totals */}
          <View style={{ flex: 1, gap: 4 }}>
            <View style={sh.totLine}>
              <Text style={sh.totLabel}>Sub Total</Text>
              <Text style={sh.totValue}>{fmtAmt(subTotal)}</Text>
            </View>
            <View style={[sh.totLine, { marginBottom: 2 }]}>
              <Text style={[sh.totLabel, { color: GREEN, fontFamily: 'Helvetica-Bold' }]}>Tax (GST)</Text>
              <Text style={[sh.totValue, { color: GREEN }]}>{fmtAmt(taxAmount)}</Text>
            </View>
            {hasGst && invoice.gstType === GSTType.CGST_SGST && (
              <>
                <View style={sh.totLine}>
                  <Text style={{ fontSize: 7.5, color: LIGHT }}>CGST ({(invoice.items[0]?.gstRate || 0) / 2}%)</Text>
                  <Text style={{ fontSize: 7.5, color: LIGHT }}>{fmtAmt(invoice.cgst)}</Text>
                </View>
                <View style={sh.totLine}>
                  <Text style={{ fontSize: 7.5, color: LIGHT }}>SGST ({(invoice.items[0]?.gstRate || 0) / 2}%)</Text>
                  <Text style={{ fontSize: 7.5, color: LIGHT }}>{fmtAmt(invoice.sgst)}</Text>
                </View>
              </>
            )}
            {hasGst && invoice.gstType === GSTType.IGST && (
              <View style={sh.totLine}>
                <Text style={{ fontSize: 7.5, color: LIGHT }}>IGST ({invoice.items[0]?.gstRate ?? 0}%)</Text>
                <Text style={{ fontSize: 7.5, color: LIGHT }}>{fmtAmt(invoice.igst)}</Text>
              </View>
            )}

            {/* Grand Total */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1.5, borderTopColor: DIVIDER, borderTopStyle: 'solid', marginTop: 4 }}>
              <Text style={{ fontSize: 20, fontFamily: 'Helvetica-Bold', color: DARK, textTransform: 'uppercase' }}>Total</Text>
              <Text style={{ fontSize: 28, fontFamily: 'Helvetica-Bold', color: DARK }}>{fmtAmt(grandTotal)}</Text>
            </View>

            {/* Amount in words */}
            <View style={{ backgroundColor: SLATE9, borderRadius: 6, padding: 8, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', marginTop: 4 }}>
              <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', marginBottom: 3 }}>Amount in Words</Text>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: DARK, lineHeight: 1.4 }}>{toWords(grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* ── 5. BOTTOM ── */}
        <View style={{ marginTop: 24, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: DIVIDER, borderTopStyle: 'solid', alignItems: 'center' }}>
          <Text style={{ fontSize: 7, color: LIGHT, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Bill generated via BillHippo Smart OS  •  {business.email}  •  {business.phone}
          </Text>
        </View>

        <Text style={sh.pageNum} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
//  MODERN-1 template
//  ┌─────────────────────────────────────────────────────┐
//  │ [Logo box]   INVOICE (primaryColor)   Inv# / Date  │
//  │              GST Compliant Tax Invoice              │
//  ├─────────────────────────────────────────────────────┤
//  │ Billed by (tinted card) │ Billed to (tinted card)  │
//  ├─────────────────────────────────────────────────────┤
//  │ Item desc │ HSN │ Qty │ Rate │ Amount (primaryColor header) │
//  ├─────────────────────────────────────────────────────┤
//  │ Bank & Payment Info  │  Sub Total / Tax / GrandTotal│
//  └─────────────────────────────────────────────────────┘
// ══════════════════════════════════════════════════════════════════════════════
const Modern1PDF: React.FC<TemplateProps> = ({
  invoice, business, customer, primary, hasGst,
  subTotal, taxAmount, grandTotal,
}) => {
  const tint = rgba(primary, 0.07);   // matches `${primaryColor}10` in CSS

  const col = {
    desc: { width: '40%' },
    hsn:  { width: '12%', textAlign: 'center' as const },
    qty:  { width: '10%', textAlign: 'center' as const },
    rate: { width: '18%', textAlign: 'right'  as const },
    amt:  { width: '20%', textAlign: 'right'  as const },
  };

  return (
    <Document title={`Invoice ${invoice.invoiceNumber}`} author={business.name} creator="BillHippo">
      <Page size="A4" style={basePage} wrap>

        {/* ── 1. TOP HEADER: [Logo | INVOICE | Inv#] ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: DIVIDER, borderBottomStyle: 'solid', marginBottom: 20 }}>

          {/* Left: Logo placeholder box */}
          <View style={{ width: 60, height: 60, backgroundColor: SLATE9, borderRadius: 8, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 6, color: LIGHT }}>LOGO</Text>
          </View>

          {/* Centre: "INVOICE" + subtitle */}
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 32, fontFamily: 'Helvetica-Bold', color: primary, textTransform: 'uppercase', letterSpacing: 2 }}>
              Invoice
            </Text>
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 1, marginTop: 3 }}>
              GST Compliant Tax Invoice
            </Text>
          </View>

          {/* Right: Inv# + Date */}
          <View style={{ alignItems: 'flex-end', gap: 8 }}>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={sh.microLabel}>Inv #</Text>
              <Text style={sh.microValue}>{invoice.invoiceNumber}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={sh.microLabel}>Date</Text>
              <Text style={sh.microValue}>{invoice.date}</Text>
            </View>
          </View>
        </View>

        {/* ── 2. TINTED INFO CARDS ── */}
        <View style={{ flexDirection: 'row', gap: 14, marginBottom: 22 }}>
          {/* Billed by */}
          <View style={{ flex: 1, backgroundColor: tint, borderRadius: 8, padding: 14, gap: 4 }}>
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Billed by</Text>
            <Text style={sh.infoName}>{business.name}</Text>
            <Text style={sh.infoAddr}>{business.address}, {business.city}, {business.state} - {business.pincode}</Text>
            <View style={{ flexDirection: 'row', gap: 20, marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: rgba(primary, 0.2), borderTopStyle: 'solid' }}>
              <View>
                <Text style={sh.microLabel}>GSTIN</Text>
                <Text style={sh.microValue}>{business.gstin || '—'}</Text>
              </View>
              <View>
                <Text style={sh.microLabel}>PAN</Text>
                <Text style={sh.microValue}>{business.pan || '—'}</Text>
              </View>
            </View>
          </View>

          {/* Billed to */}
          <View style={{ flex: 1, backgroundColor: tint, borderRadius: 8, padding: 14, gap: 4 }}>
            <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: primary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Billed to</Text>
            <Text style={sh.infoName}>{customer.name}</Text>
            <Text style={sh.infoAddr}>{customer.address}, {customer.city}, {customer.state} - {customer.pincode}</Text>
            <View style={{ flexDirection: 'row', gap: 20, marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: rgba(primary, 0.2), borderTopStyle: 'solid' }}>
              <View>
                <Text style={sh.microLabel}>GSTIN</Text>
                <Text style={sh.microValue}>{customer.gstin || '—'}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 3. TABLE (Item desc | HSN | Qty | Rate | Amount) ── */}
        <View style={{ marginBottom: 22 }}>
          <View style={{ flexDirection: 'row', backgroundColor: primary, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 4 }} fixed>
            <Text style={[sh.th, col.desc]}>Item description</Text>
            <Text style={[sh.th, col.hsn]}>HSN</Text>
            <Text style={[sh.th, col.qty]}>Qty.</Text>
            <Text style={[sh.th, col.rate]}>Rate</Text>
            <Text style={[sh.th, col.amt]}>Amount</Text>
          </View>

          {invoice.items.map((item, idx) => (
            <View key={item.id} style={[sh.tableRow, idx % 2 === 1 ? sh.rowAlt : {}]} wrap={false}>
              <Text style={[sh.td, col.desc]}>{idx + 1}. {item.description || 'No Description'}</Text>
              <Text style={[sh.td, col.hsn]}>{item.hsnCode || '—'}</Text>
              <Text style={[sh.tdBold, col.qty]}>{item.quantity}</Text>
              <Text style={[sh.td, col.rate]}>{fmtAmt(item.rate)}</Text>
              <Text style={[sh.tdBold, col.amt]}>{fmtAmt(item.quantity * item.rate)}</Text>
            </View>
          ))}
        </View>

        {/* ── 4. FOOTER: Bank left | Totals right ── */}
        <View style={{ flexDirection: 'row', gap: 40, paddingTop: 14, borderTopWidth: 0.5, borderTopColor: BORDER, borderTopStyle: 'solid' }} wrap={false}>

          {/* Left: Bank & Payment Info + Notes */}
          <View style={{ flex: 1, gap: 12 }}>
            {(business.bankName || business.accountNumber || business.upiId) && (
              <View style={{ gap: 5 }}>
                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: primary, textTransform: 'uppercase', letterSpacing: 1 }}>Bank &amp; Payment Info</Text>
                {business.bankName     && <Text style={{ fontSize: 8, color: MID }}>Bank: <Text style={{ fontFamily: 'Helvetica-Bold', color: DARK }}>{business.bankName}</Text></Text>}
                {business.accountNumber && <Text style={{ fontSize: 8, color: MID }}>A/c: <Text style={{ fontFamily: 'Helvetica-Bold', color: DARK }}>{business.accountNumber}</Text></Text>}
                {business.ifscCode     && <Text style={{ fontSize: 8, color: MID }}>IFSC: <Text style={{ fontFamily: 'Helvetica-Bold', color: DARK }}>{business.ifscCode}</Text></Text>}
                {business.upiId        && <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: primary, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: DIVIDER, borderTopStyle: 'solid' }}>UPI ID: {business.upiId}</Text>}
              </View>
            )}
            {business.defaultNotes && (
              <View style={{ gap: 3 }}>
                <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: LIGHT, textTransform: 'uppercase', letterSpacing: 1 }}>Notes</Text>
                <Text style={{ fontSize: 7.5, color: LIGHT, fontFamily: 'Helvetica-Oblique', lineHeight: 1.5 }}>{business.defaultNotes}</Text>
              </View>
            )}
          </View>

          {/* Right: Totals */}
          <View style={{ flex: 1, gap: 4 }}>
            <View style={sh.totLine}>
              <Text style={sh.totLabel}>Sub Total</Text>
              <Text style={sh.totValue}>{fmtAmt(subTotal)}</Text>
            </View>
            <View style={sh.totLine}>
              <Text style={[sh.totLabel, { color: GREEN, fontFamily: 'Helvetica-Bold' }]}>Tax (GST)</Text>
              <Text style={[sh.totValue, { color: GREEN }]}>{fmtAmt(taxAmount)}</Text>
            </View>
            {hasGst && invoice.gstType === GSTType.CGST_SGST && (
              <>
                <View style={sh.totLine}><Text style={{ fontSize: 7.5, color: LIGHT }}>CGST</Text><Text style={{ fontSize: 7.5, color: LIGHT }}>{fmtAmt(invoice.cgst)}</Text></View>
                <View style={sh.totLine}><Text style={{ fontSize: 7.5, color: LIGHT }}>SGST</Text><Text style={{ fontSize: 7.5, color: LIGHT }}>{fmtAmt(invoice.sgst)}</Text></View>
              </>
            )}
            {hasGst && invoice.gstType === GSTType.IGST && (
              <View style={sh.totLine}><Text style={{ fontSize: 7.5, color: LIGHT }}>IGST</Text><Text style={{ fontSize: 7.5, color: LIGHT }}>{fmtAmt(invoice.igst)}</Text></View>
            )}

            {/* Grand Total — styled in primaryColor like the HTML */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTopWidth: 1.5, borderTopColor: DIVIDER, borderTopStyle: 'solid', marginTop: 4 }}>
              <Text style={{ fontSize: 18, fontFamily: 'Helvetica-Bold', color: primary, textTransform: 'uppercase' }}>Grand Total</Text>
              <Text style={{ fontSize: 26, fontFamily: 'Helvetica-Bold', color: primary }}>{fmtAmt(grandTotal)}</Text>
            </View>
          </View>
        </View>

        <Text style={sh.pageNum} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
};

export default InvoicePDF;
