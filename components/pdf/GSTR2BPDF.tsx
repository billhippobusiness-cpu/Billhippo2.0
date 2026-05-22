import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { GSTR2BData, GSTR2BSupplier } from '../../lib/whitebooksApi';

const S = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', backgroundColor: '#ffffff', padding: '30 40' },
  header:      { backgroundColor: '#0f172a', padding: '16 20', borderRadius: 8, marginBottom: 6 },
  headerTitle: { color: '#ffffff', fontSize: 16, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5 },
  headerSub:   { color: '#94a3b8', fontSize: 9, marginTop: 3 },
  accentBar:   { height: 3, backgroundColor: '#6366f1', borderRadius: 2, marginBottom: 14 },
  sectionTitle:{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  summaryBox:  { backgroundColor: '#eff6ff', borderRadius: 8, padding: '10 14', marginBottom: 14 },
  summaryGrid: { flexDirection: 'row', gap: 0 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel:{ fontSize: 7, color: '#64748b', fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue:{ fontSize: 13, color: '#1e40af', fontFamily: 'Helvetica-Bold', marginTop: 2 },
  divider:     { height: 1, backgroundColor: '#bfdbfe', marginVertical: 10 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#1e40af', padding: '5 4', borderRadius: 4, marginBottom: 2 },
  thCell:      { color: '#ffffff', fontSize: 7, fontFamily: 'Helvetica-Bold' },
  tableRow:    { flexDirection: 'row', padding: '4 4', borderBottomWidth: 1, borderBottomColor: '#dbeafe', borderBottomStyle: 'solid' },
  tableRowAlt: { flexDirection: 'row', padding: '4 4', backgroundColor: '#f8faff', borderBottomWidth: 1, borderBottomColor: '#dbeafe', borderBottomStyle: 'solid' },
  tdCell:      { fontSize: 7, color: '#374151' },
  totalRow:    { flexDirection: 'row', backgroundColor: '#1e3a8a', padding: '6 4', borderRadius: 4, marginTop: 2 },
  totalCell:   { fontSize: 7, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  supplierHeader: { backgroundColor: '#eff6ff', padding: '5 8', borderRadius: 4, marginBottom: 3, marginTop: 8 },
  supplierName:   { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1e40af' },
  supplierGSTIN:  { fontSize: 7, color: '#64748b', fontFamily: 'Helvetica', marginTop: 1 },
  footer:      { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText:  { fontSize: 7, color: '#94a3b8' },
  footerBrand: { fontSize: 7, color: '#6366f1', fontFamily: 'Helvetica-Bold' },
});

function inr(n: number) {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface GSTR2BPDFProps {
  data: GSTR2BData;
  businessName: string;
  businessGSTIN: string;
}

const GSTR2BPDF: React.FC<GSTR2BPDFProps> = ({ data, businessName, businessGSTIN }) => {
  const totalTax = data.totalIGST + data.totalCGST + data.totalSGST;
  const periodFormatted = data.period.length >= 6
    ? `${data.period.slice(0,2)}/${data.period.slice(2)}`
    : data.period;

  return (
    <Document>
      <Page size="A4" style={S.page} orientation="landscape">
        {/* Header */}
        <View style={S.header}>
          <Text style={S.headerTitle}>GSTR-2B — Input Tax Credit Statement</Text>
          <Text style={S.headerSub}>{businessName}  |  GSTIN: {businessGSTIN}  |  Period: {periodFormatted}</Text>
        </View>
        <View style={S.accentBar} />

        {/* Summary */}
        <Text style={S.sectionTitle}>Summary</Text>
        <View style={S.summaryBox}>
          <View style={S.summaryGrid}>
            <View style={S.summaryItem}>
              <Text style={S.summaryLabel}>Suppliers</Text>
              <Text style={S.summaryValue}>{data.suppliers.length}</Text>
            </View>
            <View style={S.summaryItem}>
              <Text style={S.summaryLabel}>Invoices</Text>
              <Text style={S.summaryValue}>{data.invoiceCount}</Text>
            </View>
            <View style={S.summaryItem}>
              <Text style={S.summaryLabel}>Taxable Value</Text>
              <Text style={S.summaryValue}>{inr(data.totalTaxableValue)}</Text>
            </View>
            <View style={S.summaryItem}>
              <Text style={S.summaryLabel}>IGST</Text>
              <Text style={S.summaryValue}>{inr(data.totalIGST)}</Text>
            </View>
            <View style={S.summaryItem}>
              <Text style={S.summaryLabel}>CGST</Text>
              <Text style={S.summaryValue}>{inr(data.totalCGST)}</Text>
            </View>
            <View style={S.summaryItem}>
              <Text style={S.summaryLabel}>SGST</Text>
              <Text style={S.summaryValue}>{inr(data.totalSGST)}</Text>
            </View>
            <View style={S.summaryItem}>
              <Text style={S.summaryLabel}>Total ITC</Text>
              <Text style={[S.summaryValue, { color: '#059669' }]}>{inr(totalTax)}</Text>
            </View>
          </View>
        </View>

        {/* Table header */}
        <Text style={S.sectionTitle}>Invoice-wise Detail</Text>
        <View style={S.tableHeader}>
          <Text style={[S.thCell, { width: 20 }]}>#</Text>
          <Text style={[S.thCell, { width: 90 }]}>Invoice No.</Text>
          <Text style={[S.thCell, { width: 55 }]}>Date</Text>
          <Text style={[S.thCell, { width: 35 }]}>Type</Text>
          <Text style={[S.thCell, { width: 30, textAlign: 'center' }]}>Rate%</Text>
          <Text style={[S.thCell, { width: 65, textAlign: 'right' }]}>Taxable</Text>
          <Text style={[S.thCell, { width: 65, textAlign: 'right' }]}>IGST</Text>
          <Text style={[S.thCell, { width: 65, textAlign: 'right' }]}>CGST</Text>
          <Text style={[S.thCell, { width: 65, textAlign: 'right' }]}>SGST</Text>
          <Text style={[S.thCell, { width: 65, textAlign: 'right' }]}>Total Tax</Text>
          <Text style={[S.thCell, { width: 30, textAlign: 'center' }]}>ITC</Text>
        </View>

        {data.suppliers.map((supplier: GSTR2BSupplier, si: number) => (
          <View key={si}>
            <View style={S.supplierHeader}>
              <Text style={S.supplierName}>{supplier.tradeName || supplier.legalName || supplier.gstin}</Text>
              <Text style={S.supplierGSTIN}>GSTIN: {supplier.gstin}  |  {supplier.invoices.length} invoice{supplier.invoices.length !== 1 ? 's' : ''}  |  ITC: {inr(supplier.totalIGST + supplier.totalCGST + supplier.totalSGST)}</Text>
            </View>
            {supplier.invoices.map((inv, ii) => {
              const rowStyle = ii % 2 === 0 ? S.tableRow : S.tableRowAlt;
              return (
                <View key={ii} style={rowStyle} wrap={false}>
                  <Text style={[S.tdCell, { width: 20 }]}>{ii + 1}</Text>
                  <Text style={[S.tdCell, { width: 90 }]}>{inv.invoiceNumber}</Text>
                  <Text style={[S.tdCell, { width: 55 }]}>{inv.invoiceDate}</Text>
                  <Text style={[S.tdCell, { width: 35 }]}>{inv.invoiceType}</Text>
                  <Text style={[S.tdCell, { width: 30, textAlign: 'center', color: '#6366f1' }]}>{inv.gstRate ? `${inv.gstRate}%` : '—'}</Text>
                  <Text style={[S.tdCell, { width: 65, textAlign: 'right' }]}>{inr(inv.taxableValue)}</Text>
                  <Text style={[S.tdCell, { width: 65, textAlign: 'right' }]}>{inv.igst > 0 ? inr(inv.igst) : '—'}</Text>
                  <Text style={[S.tdCell, { width: 65, textAlign: 'right' }]}>{inv.cgst > 0 ? inr(inv.cgst) : '—'}</Text>
                  <Text style={[S.tdCell, { width: 65, textAlign: 'right' }]}>{inv.sgst > 0 ? inr(inv.sgst) : '—'}</Text>
                  <Text style={[S.tdCell, { width: 65, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: '#1e40af' }]}>{inr(inv.igst + inv.cgst + inv.sgst)}</Text>
                  <Text style={[S.tdCell, { width: 30, textAlign: 'center', color: inv.itcAvailability === 'Yes' ? '#059669' : '#dc2626' }]}>{inv.itcAvailability}</Text>
                </View>
              );
            })}
          </View>
        ))}

        {/* Totals */}
        <View style={S.totalRow}>
          <Text style={[S.totalCell, { width: 230 }]}>GRAND TOTAL ({data.invoiceCount} invoices from {data.suppliers.length} suppliers)</Text>
          <Text style={[S.totalCell, { width: 65, textAlign: 'right' }]}>{inr(data.totalTaxableValue)}</Text>
          <Text style={[S.totalCell, { width: 65, textAlign: 'right' }]}>{inr(data.totalIGST)}</Text>
          <Text style={[S.totalCell, { width: 65, textAlign: 'right' }]}>{inr(data.totalCGST)}</Text>
          <Text style={[S.totalCell, { width: 65, textAlign: 'right' }]}>{inr(data.totalSGST)}</Text>
          <Text style={[S.totalCell, { width: 65, textAlign: 'right' }]}>{inr(totalTax)}</Text>
          <Text style={[S.totalCell, { width: 30 }]}></Text>
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>Generated on {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</Text>
          <Text style={S.footerBrand}>BillHippo — GST Billing for India</Text>
        </View>
      </Page>
    </Document>
  );
};

export default GSTR2BPDF;
