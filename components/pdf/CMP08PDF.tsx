/**
 * CMP08PDF — A4 Portrait CMP-08 quarterly statement PDF (composition scheme)
 *
 * Sections:
 *   1. Business Snapshot
 *   2. Turnover Derivation (Bills of Supply − Credit Notes + Debit Notes)
 *   3. Self-Assessed Tax Liability (Table 3 of Form GST CMP-08)
 *
 * Styled to match GSTR3BPDF (indigo theme, rounded section bands and tables).
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
import type { BusinessProfile } from '../../types';
import type { CMP08Data } from '../../lib/compositionReports';
import { COMPOSITION_CATEGORIES } from '../../lib/gstScheme';

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

const BLUE      = '#4c2de0';
const BLUE_SOFT = '#ede9fe';
const DARK      = '#1e293b';
const MID       = '#475569';
const BORDER    = '#e2e8f0';
const ALT       = '#f8fafc';

const S = StyleSheet.create({
  page: {
    fontFamily: 'Poppins',
    fontSize: 8.5,
    backgroundColor: '#FFFFFF',
    paddingTop: 28,
    paddingBottom: 46,
    paddingHorizontal: 32,
    color: DARK,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  logoImage: { width: 48, height: 48, borderRadius: 12, objectFit: 'contain' },
  logoBox:   { width: 48, height: 48, borderRadius: 12, backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center' },
  logoInit:  { fontSize: 19, fontWeight: 700, color: '#fff' },
  bizBlock:  { alignItems: 'flex-end', maxWidth: '62%' },
  bizName:   { fontSize: 12.5, fontWeight: 700, color: DARK, textAlign: 'right' },
  bizAddr:   { fontSize: 7.5, color: MID, textAlign: 'right', marginTop: 2 },
  bizGst:    { fontSize: 7.5, fontWeight: 700, color: BLUE, textAlign: 'right', marginTop: 1 },
  dividerBlue: { height: 2, backgroundColor: BLUE, borderRadius: 2, marginBottom: 12 },
  titleStrip: {
    backgroundColor: BLUE, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14,
  },
  titleLeft:   { fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: 0.4 },
  titleSubtle: { fontSize: 8, color: '#c7bdfb', marginTop: 2 },
  titleRight:  { fontSize: 9, fontWeight: 700, color: '#fff' },
  titleMeta:   { fontSize: 7.5, color: '#c7bdfb', textAlign: 'right', marginTop: 2 },
  section: { marginBottom: 10 },
  sectionHead: { backgroundColor: BLUE_SOFT, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 6 },
  sectionTitle: { fontSize: 9.5, fontWeight: 700, color: BLUE, letterSpacing: 0.3 },
  table: { borderRadius: 8, borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', overflow: 'hidden' },
  trHead: { flexDirection: 'row', backgroundColor: BLUE_SOFT, paddingVertical: 6, paddingHorizontal: 8 },
  th: { fontSize: 7.5, fontWeight: 700, color: BLUE, textTransform: 'uppercase', letterSpacing: 0.3 },
  tr: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 0.4, borderTopColor: BORDER, borderTopStyle: 'solid' },
  trAlt:   { backgroundColor: ALT },
  trTotal: { backgroundColor: BLUE },
  td:      { fontSize: 8, color: DARK },
  tdSoft:  { fontSize: 8, color: MID },
  tdW:     { fontSize: 8, fontWeight: 700, color: '#fff' },
  tdAmt:   { fontSize: 8, color: DARK, textAlign: 'right' },
  tdAmtW:  { fontSize: 8, fontWeight: 700, color: '#fff', textAlign: 'right' },
  closing: {
    marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 0.5, borderColor: BORDER, borderStyle: 'solid', backgroundColor: ALT,
  },
  closingText: { fontSize: 7.5, color: MID, lineHeight: 1.5 },
  footer: { position: 'absolute', bottom: 14, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 6.5, color: '#cbd5e1' },
  footerBrand: { fontSize: 6.5, color: BLUE, fontWeight: 700 },
});

function inr(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  return `${sign}${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

interface KVRow { label: string; value: string; }
const KVTable: React.FC<{ headLeft: string; headRight: string; rows: KVRow[] }> = ({ headLeft, headRight, rows }) => (
  <View style={S.table}>
    <View style={S.trHead}>
      <Text style={[S.th, { width: '40%' }]}>{headLeft}</Text>
      <Text style={[S.th, { width: '60%', textAlign: 'right' }]}>{headRight}</Text>
    </View>
    {rows.map((r, i) => (
      <View key={r.label} style={[S.tr, i % 2 === 1 ? S.trAlt : {}]} wrap={false}>
        <Text style={[S.tdSoft, { width: '40%' }]}>{r.label}</Text>
        <Text style={[S.td, { width: '60%', textAlign: 'right', fontWeight: 600 }]}>{r.value}</Text>
      </View>
    ))}
  </View>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={S.section} wrap={false}>
    <View style={S.sectionHead}>
      <Text style={S.sectionTitle}>{title}</Text>
    </View>
    {children}
  </View>
);

export interface CMP08PDFProps {
  profile: BusinessProfile;
  data: CMP08Data;
  logoUrl?: string;
}

const CMP08PDF: React.FC<CMP08PDFProps> = ({ profile, data, logoUrl }) => {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const info = COMPOSITION_CATEGORIES[data.category];

  const snapshotRows: KVRow[] = [
    { label: 'GSTIN',                value: profile.gstin || '—' },
    { label: 'Legal / Trade Name',   value: profile.name || '—' },
    { label: 'Return Period',        value: data.quarterLabel },
    { label: 'Composition Category', value: info.label },
    { label: 'Applicable Rate',      value: `${data.ratePct}% (${info.cgstPct}% CGST + ${info.sgstPct}% SGST)` },
    { label: 'Filing Due Date',      value: fmtDate(data.dueDate) },
    ...(data.clipped ? [{ label: 'Composition Window', value: `${fmtDate(data.start)} – ${fmtDate(data.end)} (scheme change within quarter)` }] : []),
  ];

  const turnoverRows: KVRow[] = [
    { label: `Bills of Supply issued (${data.invoiceCount})`, value: inr(data.invoiceTotal) },
    { label: `Less: Credit Notes (${data.creditNoteCount})`,  value: data.creditNoteTotal ? `-${inr(data.creditNoteTotal)}` : '0.00' },
    { label: `Add: Debit Notes (${data.debitNoteCount})`,     value: inr(data.debitNoteTotal) },
    { label: 'Net Outward Turnover',                          value: inr(data.outwardTurnover) },
  ];

  return (
    <Document title={`CMP-08 — ${data.quarterLabel} — ${profile.name}`} author={profile.name} creator="BillHippo">
      <Page size="A4" style={S.page} wrap>

        <View fixed>
          <View style={S.headerRow}>
            <View>
              {logoUrl ? (
                <Image src={logoUrl} style={S.logoImage} />
              ) : (
                <View style={S.logoBox}>
                  <Text style={S.logoInit}>{(profile.name || 'B').charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
            <View style={S.bizBlock}>
              <Text style={S.bizName}>{profile.name}</Text>
              <Text style={S.bizAddr}>
                {[profile.address, profile.city, profile.state, profile.pincode].filter(Boolean).join(', ')}
              </Text>
              {profile.gstin ? <Text style={S.bizGst}>GSTIN: {profile.gstin}</Text> : null}
              {profile.phone  ? <Text style={S.bizAddr}>Ph: {profile.phone}</Text> : null}
            </View>
          </View>
          <View style={S.dividerBlue} />

          <View style={S.titleStrip}>
            <View>
              <Text style={S.titleLeft}>CMP-08 — QUARTERLY STATEMENT</Text>
              <Text style={S.titleSubtle}>Self-assessed tax — Composition Scheme (Section 10, CGST Act)</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={S.titleRight}>{data.quarterLabel}</Text>
              <Text style={S.titleMeta}>Generated: {today}</Text>
            </View>
          </View>
        </View>

        <Section title="1. BUSINESS SNAPSHOT">
          <KVTable headLeft="Particulars" headRight="Details" rows={snapshotRows} />
        </Section>

        <Section title="2. OUTWARD TURNOVER DERIVATION">
          <KVTable headLeft="Particulars" headRight="Amount (₹)" rows={turnoverRows} />
        </Section>

        <Section title="3. SUMMARY OF SELF-ASSESSED LIABILITY (TABLE 3, FORM GST CMP-08)">
          <View style={S.table}>
            <View style={S.trHead}>
              <Text style={[S.th, { width: '6%' }]}>Sr.</Text>
              <Text style={[S.th, { width: '42%' }]}>Description</Text>
              <Text style={[S.th, { width: '16%', textAlign: 'right' }]}>Value (₹)</Text>
              <Text style={[S.th, { width: '12%', textAlign: 'right' }]}>IGST</Text>
              <Text style={[S.th, { width: '12%', textAlign: 'right' }]}>CGST</Text>
              <Text style={[S.th, { width: '12%', textAlign: 'right' }]}>SGST</Text>
            </View>
            <View style={S.tr} wrap={false}>
              <Text style={[S.tdSoft, { width: '6%' }]}>1</Text>
              <Text style={[S.tdSoft, { width: '42%' }]}>Outward supplies (including exempt supplies)</Text>
              <Text style={[S.tdAmt, { width: '16%' }]}>{inr(data.outwardTurnover)}</Text>
              <Text style={[S.tdAmt, { width: '12%' }]}>0.00</Text>
              <Text style={[S.tdAmt, { width: '12%' }]}>{inr(data.cgst)}</Text>
              <Text style={[S.tdAmt, { width: '12%' }]}>{inr(data.sgst)}</Text>
            </View>
            <View style={[S.tr, S.trAlt]} wrap={false}>
              <Text style={[S.tdSoft, { width: '6%' }]}>2</Text>
              <Text style={[S.tdSoft, { width: '42%' }]}>Inward supplies attracting reverse charge (self-assess)</Text>
              <Text style={[S.tdAmt, { width: '16%' }]}>0.00</Text>
              <Text style={[S.tdAmt, { width: '12%' }]}>0.00</Text>
              <Text style={[S.tdAmt, { width: '12%' }]}>0.00</Text>
              <Text style={[S.tdAmt, { width: '12%' }]}>0.00</Text>
            </View>
            <View style={[S.tr, S.trTotal]} wrap={false}>
              <Text style={[S.tdW, { width: '6%' }]}>3</Text>
              <Text style={[S.tdW, { width: '42%' }]}>Tax payable (1 + 2)</Text>
              <Text style={[S.tdAmtW, { width: '16%' }]}>{inr(data.taxPayable)}</Text>
              <Text style={[S.tdAmtW, { width: '12%' }]}>0.00</Text>
              <Text style={[S.tdAmtW, { width: '12%' }]}>{inr(data.cgst)}</Text>
              <Text style={[S.tdAmtW, { width: '12%' }]}>{inr(data.sgst)}</Text>
            </View>
          </View>
        </Section>

        <View style={S.closing} wrap={false}>
          <Text style={S.closingText}>
            Tax is computed as net outward turnover × {data.ratePct}% ({info.shortLabel}). Composition taxpayers
            cannot collect tax from recipients or claim input tax credit. Row 2 (reverse-charge inward supplies)
            must be self-assessed — BillHippo does not track RCM purchases. File CMP-08 on the GST portal by {fmtDate(data.dueDate)}.
          </Text>
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            <Text style={S.footerBrand}>BillHippo</Text>  |  CMP-08  |  {data.quarterLabel}
          </Text>
          <Text
            style={S.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
};

export default CMP08PDF;
