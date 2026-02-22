/**
 * FilingTracker — per-month GST filing status for all linked clients.
 *
 * Status derivation (MVP):
 *   Filed   — client has at least one invoice in Firestore for the selected month.
 *   Pending — no invoices yet and the selected month is the current month.
 *   Overdue — no invoices and the selected month is a past month.
 *   No Data — used for GSTR-2B (purchase-side) which has no data source yet.
 *
 * TODO: Replace invoice-count heuristic with actual GSTN / GSP API calls
 *       once the portal integration is built (future prompt).
 *
 * FIRESTORE SECURITY TODO (P-13):
 *   Same rules as ProReports — professionals must be listed in the client's
 *   assignedProfessionals with status === 'active' to read their invoices.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Search,
  Download,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Users,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { getInvoices, getBusinessProfile } from '../../lib/firestore';
import type { ProfessionalProfile } from '../../types';

// ── Types ──────────────────────────────────────────────────────────────────

type FilingStatus = 'filed' | 'pending' | 'overdue' | 'no_data';
type StatusFilter = 'all' | 'filed' | 'pending' | 'overdue';

interface ClientFilingRow {
  uid: string;
  name: string;
  gstin: string;
  gstr1: FilingStatus;
  gstr3b: FilingStatus;
  /** Always 'no_data' for MVP — no purchase data source yet */
  gstr2b: FilingStatus;
}

export interface FilingTrackerProps {
  profile: ProfessionalProfile | null;
  /** Called when user clicks "View Reports" — switches portal to reports view */
  onViewReports: (clientUid: string) => void;
}

// ── Constants & helpers ────────────────────────────────────────────────────

// Current month string: "YYYY-MM"
const TODAY_MONTH = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

function getLast12Months(): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return result;
}

const monthLabel = (ym: string) =>
  new Date(ym + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

function deriveStatus(hasInvoices: boolean, month: string): FilingStatus {
  if (hasInvoices) return 'filed';
  return month >= TODAY_MONTH ? 'pending' : 'overdue';
}

function triggerCSVDownload(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
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

// ── Badge configuration ────────────────────────────────────────────────────

interface BadgeCfg { label: string; cls: string; Icon?: React.ElementType }

const BADGE: Record<FilingStatus, BadgeCfg> = {
  filed:   { label: 'Filed',    cls: 'bg-emerald-50 text-emerald-600 border-emerald-100',  Icon: CheckCircle2 },
  pending: { label: 'Pending',  cls: 'bg-amber-50   text-amber-600   border-amber-100',    Icon: Clock        },
  overdue: { label: 'Overdue',  cls: 'bg-rose-50    text-rose-500    border-rose-100',     Icon: AlertTriangle },
  no_data: { label: 'No Data',  cls: 'bg-slate-50   text-slate-400   border-slate-100'    },
};

const STATUS_LABEL: Record<FilingStatus, string> = {
  filed: 'Filed', pending: 'Pending', overdue: 'Overdue', no_data: 'No Data',
};

// Skeleton column widths (matches table columns)
const SKELETON_WIDTHS = [144, 128, 72, 72, 72, 88];

// ── Main component ─────────────────────────────────────────────────────────

const FilingTracker: React.FC<FilingTrackerProps> = ({ profile, onViewReports }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => getLast12Months()[0]);
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all');
  const [search,        setSearch]        = useState('');
  const [rows,          setRows]          = useState<ClientFilingRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [exporting,     setExporting]     = useState(false);

  const months = useMemo(getLast12Months, []);

  // ── Fetch all clients' profiles + invoice counts for the selected month ──
  useEffect(() => {
    const uids = profile?.linkedClients ?? [];
    if (uids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    Promise.all(
      uids.map(async (uid): Promise<ClientFilingRow | null> => {
        try {
          const [biz, invoices] = await Promise.all([
            getBusinessProfile(uid),
            getInvoices(uid),
          ]);
          if (!biz) return null;

          // Derive status: does the client have any invoice for this month?
          const hasInvoices = invoices.some(inv => inv.date.startsWith(selectedMonth));
          const status      = deriveStatus(hasInvoices, selectedMonth);

          return {
            uid,
            name:   biz.name,
            gstin:  biz.gstin || '—',
            // GSTR-1 and GSTR-3B both derive from invoice data (same source)
            gstr1:  status,
            gstr3b: status,
            // GSTR-2B requires purchase-side data — not available in MVP
            gstr2b: 'no_data',
          };
        } catch {
          return null;
        }
      }),
    ).then(results => {
      setRows(results.filter((r): r is ClientFilingRow => r !== null));
      setLoading(false);
    });
  }, [profile, selectedMonth]);

  // ── Derived / filtered data ────────────────────────────────────────────

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => !q || r.name.toLowerCase().includes(q))
      .filter(r => {
        const core = [r.gstr1, r.gstr3b]; // ignore gstr2b in filter logic
        switch (statusFilter) {
          case 'filed':   return core.every(s => s === 'filed');
          case 'pending': return core.some(s => s === 'pending');
          case 'overdue': return core.some(s => s === 'overdue');
          default:        return true;
        }
      });
  }, [rows, search, statusFilter]);

  const totalClients  = rows.length;
  const allFiledCount = rows.filter(r => r.gstr1 === 'filed' && r.gstr3b === 'filed').length;
  const overdueCount  = rows.filter(r => r.gstr1 === 'overdue' || r.gstr3b === 'overdue').length;
  const actionNeeded  = rows.filter(r =>
    r.gstr1 === 'pending' || r.gstr1 === 'overdue' ||
    r.gstr3b === 'pending' || r.gstr3b === 'overdue',
  ).length;

  // ── Export handler ────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    if (exporting || rows.length === 0) return;
    setExporting(true);
    triggerCSVDownload(
      `BillHippo_FilingStatus_${selectedMonth}.csv`,
      ['Client Name', 'GSTIN', 'GSTR-1', 'GSTR-3B', 'GSTR-2B'],
      filteredRows.map(r => [
        r.name, r.gstin,
        STATUS_LABEL[r.gstr1],
        STATUS_LABEL[r.gstr3b],
        STATUS_LABEL[r.gstr2b],
      ]),
    );
    setExporting(false);
  }, [exporting, rows.length, filteredRows, selectedMonth]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-poppins">Filing Tracker</h1>
          <p className="text-sm text-slate-400 font-poppins mt-1">
            GST return status for all linked clients · {monthLabel(selectedMonth)}
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || loading || rows.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold font-poppins hover:bg-emerald-700 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0"
          title={rows.length === 0 ? 'No client data to export' : 'Download status report as CSV'}
        >
          {exporting
            ? <Loader2 size={13} className="animate-spin" />
            : <Download size={13} />
          }
          Export Status Report
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          label="Total Clients"
          value={loading ? '—' : totalClients}
          Icon={Users}
          iconBg="bg-slate-50"
          iconCls="text-slate-500"
          valueCls="text-slate-900"
        />
        <SummaryCard
          label="All Filed"
          value={loading ? '—' : allFiledCount}
          Icon={CheckCircle2}
          iconBg="bg-emerald-50"
          iconCls="text-emerald-600"
          valueCls="text-emerald-700"
        />
        <SummaryCard
          label="Action Needed"
          value={loading ? '—' : actionNeeded}
          Icon={RefreshCw}
          iconBg="bg-amber-50"
          iconCls="text-amber-500"
          valueCls="text-amber-600"
          highlight={!loading && actionNeeded > 0}
          highlightColor="amber"
        />
        <SummaryCard
          label="Overdue"
          value={loading ? '—' : overdueCount}
          Icon={AlertTriangle}
          iconBg="bg-rose-50"
          iconCls="text-rose-500"
          valueCls="text-rose-500"
          highlight={!loading && overdueCount > 0}
          highlightColor="rose"
        />
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 mb-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
        {/* Month selector */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2">
          <Calendar size={13} className="text-slate-400 flex-shrink-0" />
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="bg-transparent border-none outline-none text-xs font-semibold font-poppins text-slate-700 pr-4 cursor-pointer"
          >
            {months.map(m => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['all', 'filed', 'pending', 'overdue'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`
                px-3 py-1.5 rounded-lg text-[10px] font-bold font-poppins
                uppercase tracking-wide transition-all duration-150
                ${statusFilter === f
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-400 border border-slate-100 hover:border-slate-200 hover:text-slate-600'}
              `}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Client search */}
        <div className="relative flex items-center flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 text-slate-300 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by client name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/30 font-poppins"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 text-slate-300 hover:text-slate-500 transition-colors text-xs font-bold font-poppins"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* ── Main table ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-poppins border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['Client Name', 'GSTIN', 'GSTR-1', 'GSTR-3B', 'GSTR-2B', 'Actions'].map(h => (
                  <th
                    key={h}
                    className="px-5 py-3.5 text-left text-[9px] font-bold uppercase tracking-wide text-slate-500 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                // ── Skeleton rows ──────────────────────────────────────
                Array.from({ length: 5 }).map((_, ri) => (
                  <tr key={ri} className="border-b border-slate-50">
                    {SKELETON_WIDTHS.map((w, ci) => (
                      <td key={ci} className="px-5 py-4">
                        <div
                          className="h-4 bg-slate-100 rounded-lg animate-pulse"
                          style={{ width: w, animationDelay: `${ri * 80}ms` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredRows.length === 0 ? (
                // ── Empty state ────────────────────────────────────────
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <EmptyTableState hasClients={rows.length > 0} />
                  </td>
                </tr>
              ) : (
                // ── Data rows ──────────────────────────────────────────
                filteredRows.map((row, ri) => (
                  <tr
                    key={row.uid}
                    className={`
                      border-b border-slate-50 hover:bg-slate-50/60 transition-colors
                      ${ri % 2 !== 0 ? 'bg-slate-50/20' : ''}
                      ${(row.gstr1 === 'overdue' || row.gstr3b === 'overdue') ? 'border-l-2 border-l-rose-200' : ''}
                    `}
                  >
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-800 whitespace-nowrap">{row.name}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-mono text-[10px] text-slate-400 tracking-wider bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">
                        {row.gstin}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={row.gstr1} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={row.gstr3b} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={row.gstr2b} />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => onViewReports(row.uid)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 text-emerald-600 text-[10px] font-bold font-poppins hover:bg-emerald-50 transition-colors whitespace-nowrap"
                      >
                        View Reports
                        <ExternalLink size={10} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        {!loading && filteredRows.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-50 flex items-center justify-between gap-4">
            <p className="text-[10px] text-slate-400 font-poppins">
              {filteredRows.length === rows.length
                ? `${rows.length} client${rows.length !== 1 ? 's' : ''}`
                : `Showing ${filteredRows.length} of ${rows.length} clients`
              }
            </p>
            <p className="text-[9px] text-slate-300 font-poppins text-right">
              Status derived from invoice data ·{' '}
              <span className="italic">TODO: GST portal API integration</span>
            </p>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div className="mt-4 flex items-start gap-2 px-1">
        <AlertCircle size={12} className="text-slate-300 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-300 font-poppins leading-relaxed">
          Filing status is approximated from invoice creation data in BillHippo — it does not
          reflect actual return submission status on the GST portal. GSTR-2B status requires
          purchase-side data which is not yet available.
        </p>
      </div>
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: FilingStatus }> = ({ status }) => {
  const { label, cls, Icon } = BADGE[status];
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-2.5 py-1 rounded-full border
        text-[9px] font-bold font-poppins uppercase tracking-wide
        ${cls}
      `}
    >
      {Icon && <Icon size={9} />}
      {label}
    </span>
  );
};

const SummaryCard: React.FC<{
  label: string;
  value: number | string;
  Icon: React.ElementType;
  iconBg: string;
  iconCls: string;
  valueCls: string;
  highlight?: boolean;
  highlightColor?: 'amber' | 'rose';
}> = ({ label, value, Icon, iconBg, iconCls, valueCls, highlight, highlightColor }) => {
  const borderCls = highlight
    ? highlightColor === 'rose'
      ? 'border-rose-100 shadow-rose-50/80'
      : 'border-amber-100 shadow-amber-50/80'
    : 'border-slate-100';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${borderCls}`}>
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
        <Icon size={18} className={iconCls} />
      </div>
      <p className={`text-2xl font-bold font-poppins ${valueCls}`}>{value}</p>
      <p className="text-[10px] text-slate-400 font-poppins mt-0.5 font-medium leading-snug">
        {label}
      </p>
    </div>
  );
};

const EmptyTableState: React.FC<{ hasClients: boolean }> = ({ hasClients }) => (
  <div className="max-w-xs mx-auto">
    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4">
      <Users size={20} className="text-slate-300" />
    </div>
    {hasClients ? (
      <>
        <p className="text-sm font-bold text-slate-500 font-poppins mb-1">
          No clients match your filters
        </p>
        <p className="text-xs text-slate-400 font-poppins">
          Try clearing the search or changing the status filter
        </p>
      </>
    ) : (
      <>
        <p className="text-sm font-bold text-slate-500 font-poppins mb-1">
          No linked clients yet
        </p>
        <p className="text-xs text-slate-400 font-poppins leading-relaxed">
          Share your referral code from the Dashboard to link clients to your account
        </p>
      </>
    )}
  </div>
);

export default FilingTracker;
