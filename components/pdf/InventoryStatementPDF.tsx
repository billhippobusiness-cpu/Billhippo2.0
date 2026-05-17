/**
 * InventoryStatementPDF — A4 Landscape inventory movement report
 *
 * Columns per item:
 *   # | Item | HSN | Unit
 *   | Opening Qty | Opening Rate | Opening Value
 *   | Inward Qty  | Inward Rate  | Inward Value    (← purchases in period)
 *   | Outward Qty | Outward Rate | Outward Value   (← sales in period)
 *   | Closing Qty | Closing Rate | Closing Value
 *
 * Opening rate / closing rate use the item's cost price; inward rate is the
 * weighted-average purchase rate; outward rate is the weighted-average sale rate.
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
const BLUE   = '#4c2de0';
const DARK   = '#1e293b';
const MID    = '#475569';
const LIGHT  = '#94a3b8';
const BORDER = '#e2e8f0';
const ALT    = '#f8fafc';

const S = StyleSheet.create({
  page: {
    fontFamily: 'Poppins',
    fontSize: 7,
    backgroundColor: '#FFFFFF',
    paddingTop: 30,
    paddingBottom: 50,
    paddingHorizontal: 28,
    color: DARK,
  },

  fixedHeader: { marginBottom: 10 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },

  logoImage: { width: 52, height: 52, borderRadius: 6, objectFit: 'contain' },
  logoBox:   { width: 52, height: 52, borderRadius: 6, backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center' },
  logoInit:  { fontSize: 20, fontWeight: 700, color: '#fff' },

  bizBlock: { alignItems: 'flex-end', maxWidth: '60%' },
  bizName:  { fontSize: 13, fontWeight: 700, color: DARK, textAlign: 'right' },
  bizAddr:  { fontSize: 7.5, color: MID, textAlign: 'right', marginTop: 2 },
  bizGst:   { fontSize: 7.5, fontWeight: 700, color: BLUE, textAlign: 'right', marginTop: 1 },

  dividerBlue: { height: 2, backgroundColor: BLUE, borderRadius: 2, marginBottom: 10 },

  titleStrip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  docTitle:   { fontSize: 16, fontWeight: 700, color: DARK },
  docMeta:    { fontSize: 7.5, color: LIGHT },

  // Group header row (Item info | Opening | Inward | Outward | Closing)
  groupHeader: {
    flexDirection: 'row',
    backgroundColor: '#312190',
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  groupCell: {
    fontSize: 7,
    fontWeight: 700,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    textAlign: 'center',
    borderRightWidth: 0.5,
    borderRightColor: 'rgba(255,255,255,0.25)',
    borderRightStyle: 'solid',
  },

  tableHeader: {
    flexDirection: 'row',
    backgroundColor: BLUE,
    paddingVertical: 5,
    paddingHorizontal: 3,
  },
  th: { fontSize: 6.5, fontWeight: 700, color: '#FFFFFF', textTransform: 'uppercase', textAlign: 'center' },
  thLeft: { textAlign: 'left' },

  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER,
    borderBottomStyle: 'solid',
  },
  tableRowAlt:   { backgroundColor: ALT },
  tableRowTotal: { backgroundColor: DARK },
  td:       { fontSize: 6.5, color: MID },
  tdDark:   { fontSize: 6.5, color: DARK, fontWeight: 600 },
  tdWhite:  { fontSize: 6.5, color: '#fff', fontWeight: 700 },
  tdAmt:    { fontSize: 6.5, color: DARK, textAlign: 'right' },
  tdAmtMid: { fontSize: 6.5, color: MID, textAlign: 'right' },
  tdAmtW:   { fontSize: 6.5, color: '#fff', fontWeight: 700, textAlign: 'right' },

  // Item info group (29%): # 3 | Item 14 | HSN 7 | Unit 5
  cNum:  { width: '3%',  textAlign: 'center' },
  cItem: { width: '14%' },
  cHsn:  { width: '7%',  textAlign: 'left' },
  cUnit: { width: '5%',  textAlign: 'center' },

  // Each movement group (~17.75%): Qty 5.5 | Rate 5.75 | Value 6.5
  cQty:   { width: '5.5%',  textAlign: 'right' },
  cRate:  { width: '5.75%', textAlign: 'right' },
  cValue: { width: '6.5%',  textAlign: 'right' },

  // Group widths must match the sum above
  gItem:    { width: '29%' },
  gOpening: { width: '17.75%' },
  gInward:  { width: '17.75%' },
  gOutward: { width: '17.75%' },
  gClosing: { width: '17.75%' },

  summaryRow:  { flexDirection: 'row', gap: 8, marginTop: 10, marginBottom: 8 },
  summaryCard: { flex: 1, borderRadius: 5, padding: 9, borderWidth: 0.5, borderStyle: 'solid', borderColor: BORDER },
  sumLabel:    { fontSize: 6.5, fontWeight: 700, textTransform: 'uppercase', color: LIGHT, letterSpacing: 0.5, marginBottom: 3 },
  sumValue:    { fontSize: 12, fontWeight: 700, color: DARK },
  sumBlue:     { color: BLUE },
  sumGreen:    { color: '#16a34a' },
  sumRed:      { color: '#dc2626' },

  pageFooter: {
    position: 'absolute', bottom: 14, left: 28, right: 28,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  pageFooterText: { fontSize: 6.5, color: '#cbd5e1' },
});

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

function fmtDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

export interface InventoryStatementRow {
  itemId: string;
  name: string;
  hsnCode: string;
  unit: string;
  openingQty: number;
  openingRate: number;
  inwardQty: number;
  inwardRate: number;        // weighted avg purchase rate (0 if none)
  outwardQty: number;
  outwardRate: number;       // weighted avg sale rate (0 if none)
  closingRate: number;
}

export interface InventoryStatementPDFProps {
  profile: BusinessProfile;
  rows: InventoryStatementRow[];
  fromDate: string;          // YYYY-MM-DD
  toDate: string;            // YYYY-MM-DD
  logoUrl?: string;
}

const InventoryStatementPDF: React.FC<InventoryStatementPDFProps> = ({
  profile,
  rows,
  fromDate,
  toDate,
  logoUrl,
}) => {
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const periodLabel = `${fmtDate(fromDate)}  →  ${fmtDate(toDate)}`;

  let sumOpenVal = 0, sumInVal = 0, sumOutVal = 0, sumCloseVal = 0;

  const computed = rows.map((r) => {
    const closingQty = r.openingQty + r.inwardQty - r.outwardQty;
    const openingValue = r.openingQty * r.openingRate;
    const inwardValue  = r.inwardQty  * r.inwardRate;
    const outwardValue = r.outwardQty * r.outwardRate;
    const closingValue = closingQty * r.closingRate;
    sumOpenVal  += openingValue;
    sumInVal    += inwardValue;
    sumOutVal   += outwardValue;
    sumCloseVal += closingValue;
    return { ...r, closingQty, openingValue, inwardValue, outwardValue, closingValue };
  });

  return (
    <Document
      title={`Inventory Statement — ${periodLabel} — ${profile.name}`}
      author={profile.name}
      creator="BillHippo"
    >
      <Page size="A4" orientation="landscape" style={S.page} wrap>

        {/* ── Fixed header ── */}
        <View fixed style={S.fixedHeader}>
          <View style={S.headerRow}>
            <View>
              {logoUrl ? (
                <Image src={logoUrl} style={S.logoImage} />
              ) : (
                <View style={S.logoBox}>
                  <Text style={S.logoInit}>{profile.name.charAt(0).toUpperCase()}</Text>
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
            <Text style={S.docTitle}>INVENTORY STATEMENT</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[S.docMeta, { fontSize: 9, color: MID, fontWeight: 600 }]}>{periodLabel}</Text>
              <Text style={S.docMeta}>Generated: {today}</Text>
            </View>
          </View>

          {/* Group header */}
          <View style={S.groupHeader}>
            <Text style={[S.groupCell, S.gItem]}>Item Details</Text>
            <Text style={[S.groupCell, S.gOpening]}>Opening Stock</Text>
            <Text style={[S.groupCell, S.gInward]}>Inward (Purchases)</Text>
            <Text style={[S.groupCell, S.gOutward]}>Outward (Sales)</Text>
            <Text style={[S.groupCell, S.gClosing, { borderRightWidth: 0 }]}>Closing Stock</Text>
          </View>

          {/* Sub header */}
          <View style={S.tableHeader}>
            <Text style={[S.th, S.cNum]}>#</Text>
            <Text style={[S.th, S.cItem, S.thLeft]}>Item Name</Text>
            <Text style={[S.th, S.cHsn, S.thLeft]}>HSN</Text>
            <Text style={[S.th, S.cUnit]}>Unit</Text>

            <Text style={[S.th, S.cQty]}>Qty</Text>
            <Text style={[S.th, S.cRate]}>Rate</Text>
            <Text style={[S.th, S.cValue]}>Value</Text>

            <Text style={[S.th, S.cQty]}>Qty</Text>
            <Text style={[S.th, S.cRate]}>Rate</Text>
            <Text style={[S.th, S.cValue]}>Value</Text>

            <Text style={[S.th, S.cQty]}>Qty</Text>
            <Text style={[S.th, S.cRate]}>Rate</Text>
            <Text style={[S.th, S.cValue]}>Value</Text>

            <Text style={[S.th, S.cQty]}>Qty</Text>
            <Text style={[S.th, S.cRate]}>Rate</Text>
            <Text style={[S.th, S.cValue]}>Value</Text>
          </View>
        </View>

        {/* ── Data rows ── */}
        {computed.length === 0 ? (
          <View style={[S.tableRow, { justifyContent: 'center', paddingVertical: 20 }]}>
            <Text style={[S.td, { flex: 1, textAlign: 'center', color: LIGHT }]}>
              No inventory items to report for this period.
            </Text>
          </View>
        ) : (
          computed.map((r, idx) => {
            const isAlt = idx % 2 === 1;
            return (
              <View key={r.itemId} style={[S.tableRow, isAlt ? S.tableRowAlt : {}]} wrap={false}>
                <Text style={[S.td, S.cNum]}>{idx + 1}</Text>
                <Text style={[S.tdDark, S.cItem]}>{r.name}</Text>
                <Text style={[S.td, S.cHsn]}>{r.hsnCode || '—'}</Text>
                <Text style={[S.td, S.cUnit]}>{r.unit}</Text>

                <Text style={[S.tdAmt, S.cQty]}>{qty(r.openingQty)}</Text>
                <Text style={[S.tdAmtMid, S.cRate]}>{r.openingRate ? inr(r.openingRate) : '—'}</Text>
                <Text style={[S.tdAmt, S.cValue]}>{inr(r.openingValue)}</Text>

                <Text style={[S.tdAmt, S.cQty]}>{r.inwardQty ? qty(r.inwardQty) : '—'}</Text>
                <Text style={[S.tdAmtMid, S.cRate]}>{r.inwardRate ? inr(r.inwardRate) : '—'}</Text>
                <Text style={[S.tdAmt, S.cValue]}>{r.inwardValue ? inr(r.inwardValue) : '—'}</Text>

                <Text style={[S.tdAmt, S.cQty]}>{r.outwardQty ? qty(r.outwardQty) : '—'}</Text>
                <Text style={[S.tdAmtMid, S.cRate]}>{r.outwardRate ? inr(r.outwardRate) : '—'}</Text>
                <Text style={[S.tdAmt, S.cValue]}>{r.outwardValue ? inr(r.outwardValue) : '—'}</Text>

                <Text style={[S.tdAmt, S.cQty, { fontWeight: 700 }]}>{qty(r.closingQty)}</Text>
                <Text style={[S.tdAmtMid, S.cRate]}>{r.closingRate ? inr(r.closingRate) : '—'}</Text>
                <Text style={[S.tdAmt, S.cValue, { fontWeight: 700 }]}>{inr(r.closingValue)}</Text>
              </View>
            );
          })
        )}

        {/* Totals row */}
        {computed.length > 0 && (
          <View style={[S.tableRow, S.tableRowTotal]} wrap={false}>
            <Text style={[S.tdWhite, S.cNum]}></Text>
            <Text style={[S.tdWhite, S.cItem]}>TOTAL ({computed.length} items)</Text>
            <Text style={[S.tdWhite, S.cHsn]}></Text>
            <Text style={[S.tdWhite, S.cUnit]}></Text>

            <Text style={[S.tdWhite, S.cQty]}></Text>
            <Text style={[S.tdWhite, S.cRate]}></Text>
            <Text style={[S.tdAmtW, S.cValue]}>{inr(sumOpenVal)}</Text>

            <Text style={[S.tdWhite, S.cQty]}></Text>
            <Text style={[S.tdWhite, S.cRate]}></Text>
            <Text style={[S.tdAmtW, S.cValue]}>{inr(sumInVal)}</Text>

            <Text style={[S.tdWhite, S.cQty]}></Text>
            <Text style={[S.tdWhite, S.cRate]}></Text>
            <Text style={[S.tdAmtW, S.cValue]}>{inr(sumOutVal)}</Text>

            <Text style={[S.tdWhite, S.cQty]}></Text>
            <Text style={[S.tdWhite, S.cRate]}></Text>
            <Text style={[S.tdAmtW, S.cValue]}>{inr(sumCloseVal)}</Text>
          </View>
        )}

        {/* Summary cards */}
        <View style={S.summaryRow} wrap={false}>
          <View style={S.summaryCard}>
            <Text style={S.sumLabel}>Opening Value</Text>
            <Text style={S.sumValue}>{inr(sumOpenVal)}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={S.sumLabel}>Inward Value</Text>
            <Text style={[S.sumValue, S.sumGreen]}>{inr(sumInVal)}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={S.sumLabel}>Outward Value</Text>
            <Text style={[S.sumValue, S.sumRed]}>{inr(sumOutVal)}</Text>
          </View>
          <View style={S.summaryCard}>
            <Text style={S.sumLabel}>Closing Value</Text>
            <Text style={[S.sumValue, S.sumBlue]}>{inr(sumCloseVal)}</Text>
          </View>
        </View>

        <View style={S.pageFooter} fixed>
          <Text style={S.pageFooterText}>
            Generated by BillHippo  |  {today}  |  {periodLabel}
          </Text>
          <Text
            style={S.pageFooterText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  );
};

export default InventoryStatementPDF;
