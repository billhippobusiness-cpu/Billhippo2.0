/**
 * ProReports — Read-only GST Reports for the Professional Portal.
 *
 * FIRESTORE SECURITY TODO (P-13):
 *   Firestore rules must allow professionals to read users/{clientUid}/invoices
 *   only if their UID is in the client's assignedProfessionals array with
 *   status === 'active'. Implement in Prompt P-13.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Lock,
  Download,
  ChevronDown,
  Calendar,
  Loader2,
  AlertCircle,
  FileText,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { getInvoices, getCustomers, getBusinessProfile } from '../../lib/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import type { Invoice, Customer, BusinessProfile, ProfessionalProfile } from '../../types';
import { GSTType } from '../../types';

// ── Types ──────────────────────────────────────────────────────────────────

type ReportTab = 'gstr1' | 'b2b' | 'b2c' | 'purchase' | 'gstr3b' | 'hsn' | 'itc';

interface ClientInfo {
  uid: string;
  name: string;
  gstin: string;
}

export interface ProReportsProps {
  user: FirebaseUser;
  profile: ProfessionalProfile | null;
  /** Pre-select a client, e.g. when navigating from the "Open" button */
  initialClientUid?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'gstr1',    label: 'GSTR-1 Summary' },
  { id: 'b2b',      label: 'Sales Register (B2B)' },
  { id: 'b2c',      label: 'Sales Register (B2C)' },
  { id: 'purchase', label: 'Purchase Register' },
  { id: 'gstr3b',   label: 'GSTR-3B Summary' },
  { id: 'hsn',      label: 'HSN Summary' },
  { id: 'itc',      label: 'ITC Summary' },
];

// Tabs that have no downloadable data
const NO_DOWNLOAD_TABS: ReportTab[] = ['purchase', 'itc'];

// ── Helpers ────────────────────────────────────────────────────────────────

const INR = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const getLast12Months = (): string[] => {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
};

const monthLabel = (ym: string) =>
  new Date(ym + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

function triggerCSVDownload(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  // BOM (\uFEFF) ensures Excel opens the file in UTF-8 correctly
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// ── HSN aggregation (shared by HsnTab and download handler) ───────────────

interface HsnRow {
  hsn: string;
  description: string;
  qty: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
}

function buildHsnMap(invoices: Invoice[]): Map<string, HsnRow> {
  const map = new Map<string, HsnRow>();
  for (const inv of invoices) {
    for (const item of inv.items) {
      const key     = item.hsnCode?.trim() || 'MISC';
      const taxable = item.quantity * item.rate;
      const tax     = taxable * (item.gstRate / 100);
      const isIGST  = inv.gstType === GSTType.IGST;
      const prev    = map.get(key) ?? { hsn: key, description: item.description, qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      map.set(key, {
        ...prev,
        qty:     prev.qty + item.quantity,
        taxable: prev.taxable + taxable,
        cgst:    prev.cgst + (isIGST ? 0 : tax / 2),
        sgst:    prev.sgst + (isIGST ? 0 : tax / 2),
        igst:    prev.igst + (isIGST ? tax : 0),
      });
    }
  }
  return map;
}

// ── Main component ─────────────────────────────────────────────────────────

const ProReports: React.FC<ProReportsProps> = ({ user, profile, initialClientUid }) => {
  const [clientList,       setClientList]       = useState<ClientInfo[]>([]);
  const [clientsLoading,   setClientsLoading]   = useState(true);
  const [selectedClientUid, setSelectedClientUid] = useState<string>(initialClientUid ?? '');
  const [selectedMonth,    setSelectedMonth]    = useState(() => getLast12Months()[0]);
  const [activeTab,        setActiveTab]        = useState<ReportTab>('gstr1');
  const [invoices,         setInvoices]         = useState<Invoice[]>([]);
  const [customerMap,      setCustomerMap]      = useState<Map<string, Customer>>(new Map());
  const [dataLoading,      setDataLoading]      = useState(false);
  const [downloading,      setDownloading]      = useState(false);

  const months = useMemo(getLast12Months, []);

  // ── Load client display names for the dropdown ─────────────────────────
  useEffect(() => {
    const uids = profile?.linkedClients ?? [];
    if (uids.length === 0) {
      setClientList([]);
      setClientsLoading(false);
      return;
    }
    setClientsLoading(true);
    Promise.all(
      uids.map(async (uid): Promise<ClientInfo | null> => {
        const biz = await getBusinessProfile(uid);
        if (!biz) return null;
        return { uid, name: biz.name, gstin: biz.gstin };
      }),
    ).then((results) => {
      const valid = results.filter((r): r is ClientInfo => r !== null);
      setClientList(valid);
      // Auto-select first client if none is already chosen
      if (!selectedClientUid && valid.length > 0) {
        setSelectedClientUid(valid[0].uid);
      }
      setClientsLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // ── Load invoices + customers when selected client changes ─────────────
  useEffect(() => {
    if (!selectedClientUid) return;
    setDataLoading(true);
    Promise.all([
      getInvoices(selectedClientUid),
      getCustomers(selectedClientUid),
    ])
      .then(([invs, custs]) => {
        setInvoices(invs);
        const map = new Map<string, Customer>();
        custs.forEach(c => map.set(c.id, c));
        setCustomerMap(map);
        setDataLoading(false);
      })
      .catch(() => setDataLoading(false));
  }, [selectedClientUid]);

  // Invoices for the selected month only
  const monthInvoices = useMemo(
    () => invoices.filter(i => i.date.startsWith(selectedMonth)),
    [invoices, selectedMonth],
  );

  const selectedClient = clientList.find(c => c.uid === selectedClientUid);

  // ── Download handler ───────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    if (!selectedClient || downloading) return;
    setDownloading(true);
    try {
      let headers: string[]             = [];
      let rows:    (string | number)[][] = [];
      let reportType                    = '';

      switch (activeTab) {
        case 'gstr1': {
          reportType = 'GSTR1_Summary';
          headers = ['Invoice No', 'Party Name', 'Date', 'Taxable (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Total (INR)'];
          rows = monthInvoices.map(i => [
            i.invoiceNumber, i.customerName, i.date,
            i.totalBeforeTax, i.cgst, i.sgst, i.igst, i.totalAmount,
          ]);
          break;
        }
        case 'b2b': {
          reportType = 'Sales_B2B';
          const b2b = monthInvoices.filter(i => Boolean(customerMap.get(i.customerId)?.gstin));
          headers = ['GSTIN', 'Party Name', 'Invoice No', 'Date', 'Taxable (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Total (INR)'];
          rows = b2b.map(i => [
            customerMap.get(i.customerId)?.gstin ?? '',
            i.customerName, i.invoiceNumber, i.date,
            i.totalBeforeTax, i.cgst, i.sgst, i.igst, i.totalAmount,
          ]);
          break;
        }
        case 'b2c': {
          reportType = 'Sales_B2C';
          const b2c = monthInvoices.filter(i => !customerMap.get(i.customerId)?.gstin);
          headers = ['Party Name', 'Invoice No', 'Date', 'Taxable (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Total (INR)'];
          rows = b2c.map(i => [
            i.customerName, i.invoiceNumber, i.date,
            i.totalBeforeTax, i.cgst, i.sgst, i.igst, i.totalAmount,
          ]);
          break;
        }
        case 'gstr3b': {
          reportType = 'GSTR3B_Summary';
          const tTaxable = monthInvoices.reduce((s, i) => s + i.totalBeforeTax, 0);
          const tCGST    = monthInvoices.reduce((s, i) => s + i.cgst, 0);
          const tSGST    = monthInvoices.reduce((s, i) => s + i.sgst, 0);
          const tIGST    = monthInvoices.reduce((s, i) => s + i.igst, 0);
          headers = ['Section', 'Taxable (INR)', 'IGST (INR)', 'CGST (INR)', 'SGST (INR)'];
          rows = [
            ['3.1 Outward Supplies (Sales)', tTaxable, tIGST, tCGST, tSGST],
            ['4. ITC Available', 'N/A (no purchase data)', '', '', ''],
          ];
          break;
        }
        case 'hsn': {
          reportType = 'HSN_Summary';
          const hsnRows = Array.from(buildHsnMap(monthInvoices).values());
          headers = ['HSN Code', 'Description', 'Quantity', 'Taxable (INR)', 'CGST (INR)', 'SGST (INR)', 'IGST (INR)', 'Total Tax (INR)'];
          rows = hsnRows.map(h => [
            h.hsn, h.description, h.qty.toFixed(2),
            h.taxable, h.cgst, h.sgst, h.igst, h.cgst + h.sgst + h.igst,
          ]);
          break;
        }
        default:
          setDownloading(false);
          return;
      }

      const safeName = selectedClient.name.replace(/[^a-zA-Z0-9]/g, '_');
      triggerCSVDownload(`BillHippo_${reportType}_${safeName}_${selectedMonth}.csv`, headers, rows);

      // Log download activity — business owner can see this under their assigned professional
      await addDoc(collection(db, 'users', user.uid, 'professional', 'main', 'activityLog'), {
        action:     'download',
        reportType,
        clientUid:  selectedClientUid,
        clientName: selectedClient.name,
        month:      selectedMonth,
        timestamp:  new Date().toISOString(),
      });
    } catch (err) {
      console.error('ProReports download error:', err);
    } finally {
      setDownloading(false);
    }
  }, [
    activeTab, monthInvoices, customerMap,
    selectedClient, selectedClientUid, selectedMonth,
    user.uid, downloading,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 font-poppins">GST Reports</h1>
        <p className="text-sm text-slate-400 font-poppins mt-1">
          Read-only access to your linked clients' GST data
        </p>
      </div>

      {/* ── Client Selector ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-semibold font-poppins text-slate-500 flex-shrink-0">
          <Users size={16} className="text-emerald-600" />
          Viewing:
        </div>

        {clientsLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 size={13} className="animate-spin text-slate-300" />
            <span className="text-sm text-slate-400 font-poppins">Loading clients…</span>
          </div>
        ) : clientList.length === 0 ? (
          <span className="text-sm text-slate-400 font-poppins italic">
            No clients linked yet
          </span>
        ) : (
          <div className="relative">
            <select
              value={selectedClientUid}
              onChange={(e) => setSelectedClientUid(e.target.value)}
              className="pl-4 pr-10 py-2.5 bg-emerald-50 border border-emerald-100 rounded-xl text-sm font-bold font-poppins text-emerald-700 outline-none focus:ring-2 focus:ring-emerald-500/20 appearance-none cursor-pointer min-w-[220px]"
            >
              {clientList.map((c) => (
                <option key={c.uid} value={c.uid}>{c.name}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 pointer-events-none"
            />
          </div>
        )}

        {selectedClient?.gstin && (
          <span className="text-xs font-mono text-slate-400 bg-slate-50 border border-slate-100 px-2.5 py-1.5 rounded-lg tracking-wider">
            {selectedClient.gstin}
          </span>
        )}
      </div>

      {/* ── No client state ── */}
      {!clientsLoading && clientList.length === 0 && (
        <NoClientsState />
      )}

      {/* ── Reports panel (shown only when a client is selected) ── */}
      {selectedClientUid && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

          {/* Tab bar — horizontally scrollable on mobile */}
          <div className="overflow-x-auto border-b border-slate-100">
            <div className="flex min-w-max">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-5 py-4 text-xs font-bold font-poppins whitespace-nowrap
                    transition-all duration-200 border-b-2 -mb-px
                    ${activeTab === tab.id
                      ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                      : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Controls bar: month selector | read-only badge | download */}
          <div className="px-6 py-4 border-b border-slate-50 flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
            {/* Month selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
              <Calendar size={13} className="text-slate-400 flex-shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent border-none outline-none text-xs font-semibold font-poppins text-slate-700 pr-4 cursor-pointer"
              >
                {months.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
            </div>

            <div className="flex-1" />

            {/* Read-only badge */}
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
              <Lock size={11} className="text-slate-400" />
              <span className="text-[9px] font-bold font-poppins text-slate-400 uppercase tracking-widest">
                Read Only Access
              </span>
            </div>

            {/* Download CSV */}
            {!NO_DOWNLOAD_TABS.includes(activeTab) && (
              <button
                onClick={handleDownload}
                disabled={downloading || dataLoading || monthInvoices.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold font-poppins hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150"
                title={monthInvoices.length === 0 ? 'No data for this month' : 'Download as CSV (opens in Excel)'}
              >
                {downloading
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Download size={13} />
                }
                Download CSV
              </button>
            )}
          </div>

          {/* Tab content */}
          <div className="p-6">
            {dataLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <Loader2 size={28} className="animate-spin text-emerald-500 mx-auto mb-3" />
                  <p className="text-xs text-slate-400 font-poppins">Loading client data…</p>
                </div>
              </div>
            ) : (
              <TabContent
                tab={activeTab}
                monthInvoices={monthInvoices}
                customerMap={customerMap}
                selectedMonth={selectedMonth}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Tab content router ─────────────────────────────────────────────────────

interface TabContentProps {
  tab: ReportTab;
  monthInvoices: Invoice[];
  customerMap: Map<string, Customer>;
  selectedMonth: string;
}

const TabContent: React.FC<TabContentProps> = ({ tab, monthInvoices, customerMap, selectedMonth }) => {
  switch (tab) {
    case 'gstr1':    return <Gstr1Tab    invoices={monthInvoices} month={selectedMonth} />;
    case 'b2b':      return <B2bTab      invoices={monthInvoices} customerMap={customerMap} />;
    case 'b2c':      return <B2cTab      invoices={monthInvoices} customerMap={customerMap} />;
    case 'purchase': return <UnavailableTab title="Purchase Register" reason="No purchase data found for this client. The purchase module may not be enabled for their account." />;
    case 'gstr3b':   return <Gstr3bTab   invoices={monthInvoices} month={selectedMonth} />;
    case 'hsn':      return <HsnTab      invoices={monthInvoices} />;
    case 'itc':      return <UnavailableTab title="ITC Summary" reason="ITC data is derived from purchase records. Purchase module integration is coming soon." />;
    default:         return null;
  }
};

// ── GSTR-1 Summary ─────────────────────────────────────────────────────────

const Gstr1Tab: React.FC<{ invoices: Invoice[]; month: string }> = ({ invoices, month }) => {
  const totalTaxable = invoices.reduce((s, i) => s + i.totalBeforeTax, 0);
  const totalCGST    = invoices.reduce((s, i) => s + i.cgst, 0);
  const totalSGST    = invoices.reduce((s, i) => s + i.sgst, 0);
  const totalIGST    = invoices.reduce((s, i) => s + i.igst, 0);
  const totalAmount  = invoices.reduce((s, i) => s + i.totalAmount, 0);

  if (invoices.length === 0) {
    return <EmptyState message={`No invoices for ${monthLabel(month)}`} />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Invoices"  value={invoices.length} mono />
        <StatCard label="Total Taxable"   value={INR(totalTaxable)} />
        <StatCard label="Total CGST"      value={INR(totalCGST)}    color="amber" />
        <StatCard label="Total SGST"      value={INR(totalSGST)}    color="amber" />
        <StatCard label="Total IGST"      value={INR(totalIGST)}    color="indigo" />
      </div>
      <DataTable
        headers={['Invoice No', 'Party Name', 'Date', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']}
        rows={invoices.map(i => [
          i.invoiceNumber, i.customerName, i.date,
          INR(i.totalBeforeTax), INR(i.cgst), INR(i.sgst), INR(i.igst), INR(i.totalAmount),
        ])}
        monoColumns={[0, 2]}
      />
      <div className="flex justify-end">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-5 py-3 text-sm font-bold font-poppins text-emerald-700">
          Grand Total: {INR(totalAmount)}
        </div>
      </div>
    </div>
  );
};

// ── Sales Register — B2B ───────────────────────────────────────────────────

const B2bTab: React.FC<{ invoices: Invoice[]; customerMap: Map<string, Customer> }> = ({
  invoices,
  customerMap,
}) => {
  const b2b = invoices.filter(i => Boolean(customerMap.get(i.customerId)?.gstin));

  if (b2b.length === 0) {
    return (
      <EmptyState
        message="No B2B invoices for this period"
        sub="B2B invoices are those raised to customers with a registered GSTIN"
      />
    );
  }

  return (
    <DataTable
      headers={['GSTIN', 'Party Name', 'Invoice No', 'Date', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']}
      rows={b2b.map(i => {
        const cust = customerMap.get(i.customerId);
        return [
          cust?.gstin ?? '—',
          i.customerName,
          i.invoiceNumber,
          i.date,
          INR(i.totalBeforeTax),
          INR(i.cgst),
          INR(i.sgst),
          INR(i.igst),
          INR(i.totalAmount),
        ];
      })}
      monoColumns={[0, 2, 3]}
    />
  );
};

// ── Sales Register — B2C ───────────────────────────────────────────────────

const B2cTab: React.FC<{ invoices: Invoice[]; customerMap: Map<string, Customer> }> = ({
  invoices,
  customerMap,
}) => {
  const b2c = invoices.filter(i => !customerMap.get(i.customerId)?.gstin);

  if (b2c.length === 0) {
    return (
      <EmptyState
        message="No B2C invoices for this period"
        sub="B2C invoices are those raised to customers without a GSTIN"
      />
    );
  }

  return (
    <DataTable
      headers={['Party Name', 'Invoice No', 'Date', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']}
      rows={b2c.map(i => [
        i.customerName,
        i.invoiceNumber,
        i.date,
        INR(i.totalBeforeTax),
        INR(i.cgst),
        INR(i.sgst),
        INR(i.igst),
        INR(i.totalAmount),
      ])}
      monoColumns={[1, 2]}
    />
  );
};

// ── GSTR-3B Summary ────────────────────────────────────────────────────────

const Gstr3bTab: React.FC<{ invoices: Invoice[]; month: string }> = ({ invoices, month }) => {
  const tTaxable = invoices.reduce((s, i) => s + i.totalBeforeTax, 0);
  const tCGST    = invoices.reduce((s, i) => s + i.cgst, 0);
  const tSGST    = invoices.reduce((s, i) => s + i.sgst, 0);
  const tIGST    = invoices.reduce((s, i) => s + i.igst, 0);
  const tTax     = tCGST + tSGST + tIGST;

  if (invoices.length === 0) {
    return <EmptyState message={`No data for ${monthLabel(month)}`} />;
  }

  return (
    <div className="space-y-5">
      {/* 3.1 Outward Supplies */}
      <section className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
        <p className="text-[10px] font-bold font-poppins text-slate-500 uppercase tracking-widest mb-4">
          3.1 — Outward Taxable Supplies (Other than Zero Rated, Nil &amp; Exempted)
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Taxable Value" value={INR(tTaxable)} />
          <StatCard label="Integrated Tax (IGST)" value={INR(tIGST)} color="indigo" />
          <StatCard label="Central Tax (CGST)"    value={INR(tCGST)} color="amber" />
          <StatCard label="State / UT Tax (SGST)"  value={INR(tSGST)} color="amber" />
        </div>
      </section>

      {/* 4. ITC */}
      <section className="bg-slate-50 border border-slate-100 rounded-2xl p-5">
        <p className="text-[10px] font-bold font-poppins text-slate-500 uppercase tracking-widest mb-3">
          4 — Eligible ITC (Input Tax Credit)
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-400 font-poppins">
          <AlertCircle size={14} className="text-amber-400 flex-shrink-0" />
          ITC data not available — purchase records required (coming in a future update)
        </div>
      </section>

      {/* Net payable estimate */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold font-poppins text-emerald-600 uppercase tracking-widest mb-1">
            Approximate Net Tax Payable (Outward supplies only)
          </p>
          <p className="text-2xl font-bold text-emerald-700 font-poppins">{INR(tTax)}</p>
        </div>
        <CheckCircle2 size={36} className="text-emerald-200" />
      </div>
    </div>
  );
};

// ── HSN Summary ────────────────────────────────────────────────────────────

const HsnTab: React.FC<{ invoices: Invoice[] }> = ({ invoices }) => {
  const rows = useMemo(() => Array.from(buildHsnMap(invoices).values()), [invoices]);

  if (rows.length === 0) {
    return <EmptyState message="No invoice line items found for this period" />;
  }

  return (
    <DataTable
      headers={['HSN Code', 'Description', 'Quantity', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax']}
      rows={rows.map(h => [
        h.hsn,
        h.description,
        h.qty.toFixed(2),
        INR(h.taxable),
        INR(h.cgst),
        INR(h.sgst),
        INR(h.igst),
        INR(h.cgst + h.sgst + h.igst),
      ])}
      monoColumns={[0, 2]}
    />
  );
};

// ── Shared primitives ──────────────────────────────────────────────────────

const UnavailableTab: React.FC<{ title: string; reason: string }> = ({ title, reason }) => (
  <div className="flex items-center justify-center py-20 text-center">
    <div className="max-w-xs">
      <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
        <FileText size={24} className="text-slate-300" />
      </div>
      <h3 className="text-sm font-bold text-slate-600 font-poppins mb-2">{title}</h3>
      <p className="text-xs text-slate-400 font-poppins leading-relaxed">{reason}</p>
    </div>
  </div>
);

const StatCard: React.FC<{
  label: string;
  value: string | number;
  color?: 'default' | 'amber' | 'indigo' | 'rose';
  mono?: boolean;
}> = ({ label, value, color = 'default', mono }) => {
  const valueClass = {
    default: 'text-slate-900',
    amber:   'text-amber-600',
    indigo:  'text-indigo-600',
    rose:    'text-rose-500',
  }[color];
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <p className="text-[9px] font-bold font-poppins text-slate-400 uppercase tracking-widest mb-2 leading-snug">
        {label}
      </p>
      <p className={`text-lg font-bold font-poppins ${valueClass} ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
};

const DataTable: React.FC<{
  headers: string[];
  rows: (string | number)[][];
  monoColumns?: number[];
}> = ({ headers, rows, monoColumns = [] }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-100">
    <table className="w-full text-xs font-poppins border-collapse">
      <thead>
        <tr className="bg-slate-50 border-b border-slate-100">
          {headers.map((h, i) => (
            <th
              key={i}
              className="px-4 py-3 text-left font-bold text-slate-500 text-[9px] uppercase tracking-wide whitespace-nowrap"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={headers.length} className="px-4 py-8 text-center text-slate-400">
              No records
            </td>
          </tr>
        ) : (
          rows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${ri % 2 !== 0 ? 'bg-slate-50/30' : ''}`}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-4 py-3 text-slate-700 whitespace-nowrap ${monoColumns.includes(ci) ? 'font-mono text-[10px] tracking-wide' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

const EmptyState: React.FC<{ message: string; sub?: string }> = ({ message, sub }) => (
  <div className="flex items-center justify-center py-16 text-center">
    <div className="max-w-xs">
      <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
        <AlertCircle size={18} className="text-slate-300" />
      </div>
      <p className="text-sm font-bold text-slate-500 font-poppins">{message}</p>
      {sub && (
        <p className="text-xs text-slate-400 font-poppins mt-2 leading-relaxed">{sub}</p>
      )}
    </div>
  </div>
);

const NoClientsState: React.FC = () => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-8 py-14 text-center">
    <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
      <Users size={24} className="text-emerald-400" />
    </div>
    <h3 className="text-sm font-bold text-slate-700 font-poppins mb-2">
      Select a client to view their GST data
    </h3>
    <p className="text-xs text-slate-400 font-poppins leading-relaxed max-w-xs mx-auto">
      Link clients by sharing your referral code from the Dashboard, or ask clients to invite
      you from their Profile Settings.
    </p>
  </div>
);

export default ProReports;
