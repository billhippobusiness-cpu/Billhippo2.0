/**
 * GSTR4PDF — A4 Portrait GSTR-4 annual return PDF (composition scheme)
 *
 * Sections:
 *   1. Business Snapshot
 *   2. Outward Supplies / Tax Paid (quarterly, per CMP-08)
 *   3. Inward Supplies (rate-wise, from recorded purchases)
 *
 * Styled to match GSTR3BPDF / CMP08PDF (indigo theme).
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
import type { GSTR4Data } from '../../lib/compositionReports';

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

export interface GSTR4PDFProps {
  profile: BusinessProfile;
  data: GSTR4Data;
  logoUrl?: string;
}

const GSTR4PDF: React.FC<GSTR4PDFProps> = ({ profile, data, logoUrl }) => {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const snapshotRows: KVRow[] = [
    { label: 'GSTIN',              value: profile.gstin || '—' },
    { label: 'Legal / Trade Name', value: profile.name || '—' },
    { label: 'Financial Year',     value: `FY ${data.fyLabel}` },
    { label: 'Scheme',             value: 'Composition (Section 10, CGST Act)' },
    { label: 'Filing Due Date',    value: fmtDate(data.dueDate) },
  ];

  return (
    <Document title={`GSTR-4 — FY ${data.fyLabel} — ${profile.name}`} author={profile.name} creator="BillHippo">
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
              <Text style={S.titleLeft}>GSTR-4 — ANNUAL RETURN</Text>
              <Text style={S.titleSubtle}>Composition Scheme — Section 10, CGST Act</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={S.titleRight}>FY {data.fyLabel}</Text>
              <Text style={S.titleMeta}>Generated: {today}</Text>
            </View>
          </View>
        </View>

        <Section title="1. BUSINESS SNAPSHOT">
          <KVTable headLeft="Particulars" headRight="Details" rows={snapshotRows} />
        </Section>

        <Section title="2. OUTWARD SUPPLIES / TAX PAID (PER CMP-08)">
          <View style={S.table}>
            <View style={S.trHead}>
              <Text style={[S.th, { width: '14%' }]}>Quarter</Text>
              <Text style={[S.th, { width: '30%' }]}>Period</Text>
              <Text style={[S.th, { width: '10%', textAlign: 'right' }]}>Rate</Text>
              <Text style={[S.th, { width: '18%', textAlign: 'right' }]}>Turnover (₹)</Text>
              <Text style={[S.th, { width: '14%', textAlign: 'right' }]}>CGST</Text>
              <Text style={[S.th, { width: '14%', textAlign: 'right' }]}>SGST</Text>
            </View>
            {data.quarters.map((q, i) => (
              <View key={q.quarterKey} style={[S.tr, i % 2 === 1 ? S.trAlt : {}]} wrap={false}>
                <Text style={[S.tdSoft, { width: '14%' }]}>{q.quarterKey.split('-')[1]}</Text>
                <Text style={[S.tdSoft, { width: '30%' }]}>{fmtDate(q.start)} – {fmtDate(q.end)}{q.clipped ? ' (part)' : ''}</Text>
                <Text style={[S.tdAmt, { width: '10%' }]}>{q.ratePct}%</Text>
                <Text style={[S.tdAmt, { width: '18%' }]}>{inr(q.outwardTurnover)}</Text>
                <Text style={[S.tdAmt, { width: '14%' }]}>{inr(q.cgst)}</Text>
                <Text style={[S.tdAmt, { width: '14%' }]}>{inr(q.sgst)}</Text>
              </View>
            ))}
            {data.quarters.length === 0 && (
              <View style={S.tr} wrap={false}>
                <Text style={[S.tdSoft, { width: '100%' }]}>No composition-period quarters in this financial year.</Text>
              </View>
            )}
            <View style={[S.tr, S.trTotal]} wrap={false}>
              <Text style={[S.tdW, { width: '14%' }]}>TOTAL</Text>
              <Text style={[S.tdW, { width: '30%' }]}></Text>
              <Text style={[S.tdAmtW, { width: '10%' }]}></Text>
              <Text style={[S.tdAmtW, { width: '18%' }]}>{inr(data.outwardTotal)}</Text>
              <Text style={[S.tdAmtW, { width: '14%' }]}>{inr(data.taxTotal / 2)}</Text>
              <Text style={[S.tdAmtW, { width: '14%' }]}>{inr(data.taxTotal / 2)}</Text>
            </View>
          </View>
        </Section>

        <Section title="3. INWARD SUPPLIES (RATE-WISE, FROM RECORDED PURCHASES)">
          <View style={S.table}>
            <View style={S.trHead}>
              <Text style={[S.th, { width: '30%' }]}>GST Rate</Text>
              <Text style={[S.th, { width: '38%', textAlign: 'right' }]}>Taxable Value (₹)</Text>
              <Text style={[S.th, { width: '32%', textAlign: 'right' }]}>Tax (₹)</Text>
            </View>
            {data.inwardByRate.map((rw, i) => (
              <View key={rw.gstRate} style={[S.tr, i % 2 === 1 ? S.trAlt : {}]} wrap={false}>
                <Text style={[S.tdSoft, { width: '30%' }]}>{rw.gstRate}%</Text>
                <Text style={[S.tdAmt, { width: '38%' }]}>{inr(rw.taxableValue)}</Text>
                <Text style={[S.tdAmt, { width: '32%' }]}>{inr(rw.tax)}</Text>
              </View>
            ))}
            {data.inwardByRate.length === 0 && (
              <View style={S.tr} wrap={false}>
                <Text style={[S.tdSoft, { width: '100%' }]}>No purchases recorded in the composition period.</Text>
              </View>
            )}
            <View style={[S.tr, S.trTotal]} wrap={false}>
              <Text style={[S.tdW, { width: '30%' }]}>TOTAL ({data.purchaseCount} purchases)</Text>
              <Text style={[S.tdAmtW, { width: '38%' }]}>{inr(data.inwardTaxableTotal)}</Text>
              <Text style={[S.tdAmtW, { width: '32%' }]}>{inr(data.inwardTaxTotal)}</Text>
            </View>
          </View>
        </Section>

        <View style={S.closing} wrap={false}>
          <Text style={S.closingText}>
            GSTR-4 is the annual return for composition taxpayers, due by {fmtDate(data.dueDate)}. Outward figures
            aggregate the quarterly CMP-08 statements; inward figures are rate-wise totals of purchases recorded
            in BillHippo. ITC is not claimable under the composition scheme — GST paid on purchases is a cost.
            Verify reverse-charge inward supplies separately before filing.
          </Text>
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            <Text style={S.footerBrand}>BillHippo</Text>  |  GSTR-4  |  FY {data.fyLabel}
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

export default GSTR4PDF;
