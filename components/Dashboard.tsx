import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { IndianRupee, Users, FileText, AlertTriangle, TrendingUp, BarChart3, Loader2, ChevronDown, Calendar, RefreshCw, X, ExternalLink, Plus, ChevronRight, ArrowUpRight } from 'lucide-react';
import { Invoice, Customer, LedgerEntry, BusinessProfile } from '../types';
import { getInvoices, getCustomers, getLedgerEntries, getBusinessProfile, saveBusinessProfile } from '../lib/firestore';
import { PDFDirectDownload } from './pdf/PDFPreviewModal';
import InvoicePDF from './pdf/InvoicePDF';
import PWAInstallButton from './PWAInstallButton';

interface DashboardProps { userId: string; onNavigate?: (tab: string) => void; onCreateInvoice?: () => void; }

const COLORS_PIE = ['#10b981', '#f43f5e', '#f59e0b'];

// ── Financial Year helpers (Indian FY: April 1 – March 31) ──

/** Returns the FY label for a given date, e.g. "2025-26" */
function getFYLabel(date: Date): string {
  const month = date.getMonth(); // 0-indexed (0=Jan, 3=Apr)
  const year = month >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
}

/** Returns { start, end } date strings (YYYY-MM-DD) for a FY label like "2025-26" */
function getFYDateRange(fyLabel: string): { start: string; end: string } {
  const startYear = parseInt(fyLabel.split('-')[0], 10);
  return {
    start: `${startYear}-04-01`,
    end: `${startYear + 1}-03-31`,
  };
}

/** Generate FY options from 3 years ago to 1 year ahead of current FY */
function generateFYOptions(): string[] {
  const currentFY = getFYLabel(new Date());
  const currentStartYear = parseInt(currentFY.split('-')[0], 10);
  const options: string[] = [];
  for (let y = currentStartYear - 3; y <= currentStartYear + 1; y++) {
    options.push(`${y}-${String(y + 1).slice(-2)}`);
  }
  return options;
}

const Dashboard: React.FC<DashboardProps> = ({ userId, onNavigate, onCreateInvoice }) => {
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allLedgerEntries, setAllLedgerEntries] = useState<LedgerEntry[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Filter state ──
  const [filterMode, setFilterMode] = useState<'fy' | 'custom'>('fy');
  const [selectedFY, setSelectedFY] = useState(() => getFYLabel(new Date()));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // ── Invoice numbering reset modal ──
  const [showResetModal, setShowResetModal] = useState(false);
  const [pendingFY, setPendingFY] = useState('');
  const [savingPrefix, setSavingPrefix] = useState(false);

  // ── PDF direct download target ──
  const [downloadTarget, setDownloadTarget] = useState<{ invoice: Invoice; customer: Customer | null } | null>(null);

  // ── Stat card hover state for colored glow ──
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // ── Drill-down modal ──
  type ModalType = 'sales' | 'collections' | 'outstanding' | 'rate' | null;
  const [detailModal, setDetailModal] = useState<ModalType>(null);

  const fyOptions = useMemo(() => generateFYOptions(), []);

  useEffect(() => { loadData(); }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [inv, cust, ledger, prof] = await Promise.all([
        getInvoices(userId), getCustomers(userId), getLedgerEntries(userId), getBusinessProfile(userId)
      ]);
      setAllInvoices(inv); setCustomers(cust); setAllLedgerEntries(ledger);
      if (prof) setProfile(prof);
    } catch (err) { console.error('Dashboard load error:', err); }
    finally { setLoading(false); }
  };

  // ── Compute active date range ──
  const dateRange = useMemo(() => {
    if (filterMode === 'custom' && customFrom && customTo) {
      return { start: customFrom, end: customTo };
    }
    return getFYDateRange(selectedFY);
  }, [filterMode, selectedFY, customFrom, customTo]);

  // ── Filtered data ──
  const invoices = useMemo(() =>
    allInvoices.filter(i => i.date >= dateRange.start && i.date <= dateRange.end),
    [allInvoices, dateRange]
  );

  const ledgerEntries = useMemo(() =>
    allLedgerEntries.filter(e => e.date >= dateRange.start && e.date <= dateRange.end),
    [allLedgerEntries, dateRange]
  );

  // ── FY change handler (shows reset prompt) ──
  const handleFYChange = useCallback((newFY: string) => {
    const currentFY = getFYLabel(new Date());
    // If switching to a different FY than what the prefix currently reflects, offer reset
    if (newFY !== selectedFY && profile) {
      const currentPrefix = profile.theme?.invoicePrefix || '';
      const prefixYear = currentPrefix.match(/\d{4}/)?.[0];
      const newStartYear = newFY.split('-')[0];
      // Show modal if the new FY start year doesn't match the prefix year
      if (prefixYear && prefixYear !== newStartYear) {
        setPendingFY(newFY);
        setShowResetModal(true);
        return;
      }
    }
    setSelectedFY(newFY);
  }, [selectedFY, profile]);

  // ── Reset invoice numbering ──
  const handleResetNumbering = async () => {
    if (!profile || !pendingFY) return;
    setSavingPrefix(true);
    try {
      const startYear = pendingFY.split('-')[0];
      const newPrefix = `INV/${startYear}/`;
      const updatedProfile = {
        ...profile,
        theme: { ...profile.theme, invoicePrefix: newPrefix }
      };
      await saveBusinessProfile(userId, updatedProfile);
      setProfile(updatedProfile);
    } catch (err) {
      console.error('Failed to update prefix:', err);
    } finally {
      setSavingPrefix(false);
      setSelectedFY(pendingFY);
      setPendingFY('');
      setShowResetModal(false);
    }
  };

  const handleSkipReset = () => {
    setSelectedFY(pendingFY);
    setPendingFY('');
    setShowResetModal(false);
  };

  // ── Metrics ──
  const totalSales = useMemo(() => invoices.reduce((s, i) => s + i.totalAmount, 0), [invoices]);
  const totalCollections = useMemo(() => ledgerEntries.filter(e => e.type === 'Credit').reduce((s, e) => s + e.amount, 0), [ledgerEntries]);
  const outstanding = totalSales - totalCollections;

  const paidCount = invoices.filter(i => i.status === 'Paid').length;
  const unpaidCount = invoices.filter(i => i.status === 'Unpaid').length;
  const partialCount = invoices.filter(i => i.status === 'Partial').length;
  const pieData = [
    { name: 'Paid', value: paidCount || 0 },
    { name: 'Unpaid', value: unpaidCount || 0 },
    { name: 'Partial', value: partialCount || 0 }
  ].filter(d => d.value > 0);

  // Build chart data from invoices grouped by month
  const chartData = useMemo(() => {
    const months: Record<string, { sales: number; collections: number }> = {};
    invoices.forEach(inv => {
      const month = inv.date.substring(0, 7);
      if (!months[month]) months[month] = { sales: 0, collections: 0 };
      months[month].sales += inv.totalAmount;
    });
    ledgerEntries.filter(e => e.type === 'Credit').forEach(e => {
      const month = e.date.substring(0, 7);
      if (!months[month]) months[month] = { sales: 0, collections: 0 };
      months[month].collections += e.amount;
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({
      name: new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
      Sales: Math.round(data.sales), Collections: Math.round(data.collections)
    }));
  }, [invoices, ledgerEntries]);

  // Active parties — distinct customers who appear in at least one invoice this period
  const activePartyCount = useMemo(
    () => new Set(invoices.map(i => i.customerId)).size,
    [invoices]
  );

  // Collection rate — % of sales collected this period
  const collectionRate = totalSales > 0
    ? Math.round((totalCollections / totalSales) * 100)
    : null;

  // Top 5 customers by invoiced amount this period
  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; total: number; count: number }> = {};
    invoices.forEach(inv => {
      if (!map[inv.customerId]) map[inv.customerId] = { name: inv.customerName || 'Unknown', total: 0, count: 0 };
      map[inv.customerId].total += inv.totalAmount;
      map[inv.customerId].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [invoices]);

  // Smart alerts
  const overdueInvoices = invoices.filter(i => {
    if (i.status === 'Paid') return false;
    const invDate = new Date(i.date);
    const daysSince = (Date.now() - invDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 15;
  });

  const formatAmount = (n: number) => {
    if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
    return `₹${n.toLocaleString('en-IN')}`;
  };

  if (loading) {
    return (<div className="flex items-center justify-center min-h-[400px]"><div className="text-center"><Loader2 className="w-8 h-8 animate-spin text-profee-blue mx-auto mb-3" /><p className="text-sm font-bold text-slate-400 font-poppins">Loading dashboard...</p></div></div>);
  }

  const hasData = invoices.length > 0;
  const fyRange = getFYDateRange(selectedFY);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 max-w-7xl mx-auto">

      {/* ═══ Invoice Numbering Reset Modal ═══ */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-6">
              <div className="p-4 rounded-2xl bg-amber-50">
                <RefreshCw className="text-amber-500" size={24} />
              </div>
              <button onClick={handleSkipReset} className="p-2 hover:bg-slate-100 rounded-xl transition-colors"><X size={20} className="text-slate-400" /></button>
            </div>
            <h3 className="text-xl font-bold font-poppins text-slate-900 mb-2">New Financial Year</h3>
            <p className="text-sm text-slate-500 font-medium font-poppins mb-2">
              You're switching to <span className="font-bold text-profee-blue">FY {pendingFY}</span>.
            </p>
            <p className="text-sm text-slate-500 font-medium font-poppins mb-8">
              Would you like to restart your invoice numbering from 001 for this financial year?
            </p>
            <div className="bg-slate-50 rounded-2xl p-5 mb-8 font-poppins">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">New invoice prefix will be</p>
              <p className="text-lg font-bold text-slate-900">INV/{pendingFY.split('-')[0]}/001</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleSkipReset}
                className="flex-1 py-4 px-6 rounded-2xl border border-slate-200 font-bold text-sm text-slate-600 hover:bg-slate-50 transition-all font-poppins"
              >
                No, keep current
              </button>
              <button
                onClick={handleResetNumbering}
                disabled={savingPrefix}
                className="flex-1 py-4 px-6 rounded-2xl bg-profee-blue text-white font-bold text-sm shadow-lg shadow-indigo-100 hover:scale-105 active:scale-95 transition-all font-poppins disabled:opacity-50"
              >
                {savingPrefix ? 'Saving...' : 'Yes, restart from 001'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Business Identity Header — shows which business is logged in ═══ */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-profee-blue font-poppins mb-1">Overview</p>
          <motion.h1
            className="text-2xl md:text-3xl font-bold text-slate-900 font-poppins"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.12 } } }}
          >
            {(profile?.name || 'Your Business').split(' ').map((word, i) => (
              <motion.span
                key={i}
                className="inline-block mr-[0.3em]"
                variants={{
                  hidden: { opacity: 0, y: -18 },
                  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 20 } },
                }}
              >
                {word}
              </motion.span>
            ))}
          </motion.h1>
          {(profile?.gstin || profile?.state) && (
            <p className="text-xs font-bold text-slate-400 font-poppins mt-1 truncate">
              {[profile?.gstin, profile?.state].filter(Boolean).join('  ·  ')}
            </p>
          )}
        </div>
      </div>

      {/* ═══ Download App Banner (mobile-only) ═══ */}
      <div className="md:hidden">
        <PWAInstallButton variant="banner" />
      </div>

      {/* ═══ Filter Bar: FY Dropdown + Custom Date Range ═══ */}
      <div className="bg-white rounded-[2.5rem] p-6 md:p-8 premium-shadow border border-slate-50">
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          {/* Filter mode toggle */}
          <div className="flex bg-slate-100 rounded-2xl p-1.5">
            <button
              onClick={() => setFilterMode('fy')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold font-poppins transition-all ${filterMode === 'fy' ? 'bg-white text-profee-blue shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Financial Year
            </button>
            <button
              onClick={() => setFilterMode('custom')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold font-poppins transition-all ${filterMode === 'custom' ? 'bg-white text-profee-blue shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Custom Dates
            </button>
          </div>

          {filterMode === 'fy' ? (
            /* FY Dropdown */
            <div className="flex items-center gap-3 w-full md:w-auto">
              <Calendar size={18} className="text-profee-blue shrink-0" />
              <div className="relative flex-1 md:flex-none">
                <select
                  value={selectedFY}
                  onChange={(e) => handleFYChange(e.target.value)}
                  className="w-full md:w-auto appearance-none bg-slate-50 border-none rounded-2xl px-5 sm:px-6 py-3 pr-12 font-bold text-sm text-slate-700 focus:ring-2 ring-indigo-50 font-poppins cursor-pointer"
                >
                  {fyOptions.map(fy => (
                    <option key={fy} value={fy}>FY {fy} (Apr {fy.split('-')[0]} – Mar {parseInt(fy.split('-')[0]) + 1})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-poppins hidden md:inline">
                {fyRange.start} to {fyRange.end}
              </span>
            </div>
          ) : (
            /* Custom Date Range */
            <div className="flex items-center gap-3 flex-wrap">
              <Calendar size={18} className="text-profee-blue" />
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-poppins">From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-slate-50 border-none rounded-2xl px-5 py-3 font-bold text-sm text-slate-700 focus:ring-2 ring-indigo-50 font-poppins"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-poppins">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-slate-50 border-none rounded-2xl px-5 py-3 font-bold text-sm text-slate-700 focus:ring-2 ring-indigo-50 font-poppins"
                />
              </div>
              {customFrom && customTo && (
                <button
                  onClick={() => { setCustomFrom(''); setCustomTo(''); }}
                  className="text-xs font-bold text-rose-500 hover:underline font-poppins ml-2"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Create Invoice CTA */}
          <div className="md:ml-auto flex items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              onClick={() => (onCreateInvoice ? onCreateInvoice() : onNavigate?.('invoices'))}
              className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-4 py-3 md:py-2 rounded-2xl md:rounded-xl bg-profee-blue text-white text-xs md:text-[10px] font-black uppercase tracking-wider font-poppins shadow-lg shadow-indigo-100 hover:scale-105 active:scale-95 transition-all"
            >
              <Plus size={14} strokeWidth={3} />
              Create Invoice
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Drill-down Detail Modal ═══ */}
      {detailModal && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setDetailModal(null)}
        >
          <div
            className="bg-white w-full sm:max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            {detailModal === 'sales' && (
              <>
                <div className="flex items-center justify-between px-8 pt-8 pb-4 flex-shrink-0">
                  <div>
                    <h3 className="text-xl font-bold font-poppins text-slate-900">Total Sales</h3>
                    <p className="text-xs text-slate-400 font-medium font-poppins mt-0.5">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} · {formatAmount(totalSales)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setDetailModal(null); onNavigate?.('invoices'); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-profee-blue/10 text-profee-blue text-xs font-bold font-poppins hover:bg-profee-blue/20 transition-colors">
                      View All <ArrowUpRight size={13} />
                    </button>
                    <button onClick={() => setDetailModal(null)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors"><X size={18} className="text-slate-400" /></button>
                  </div>
                </div>
                <div className="overflow-y-auto px-8 pb-8 space-y-2">
                  {invoices.length === 0 ? (
                    <p className="text-center py-12 text-slate-300 font-bold font-poppins">No invoices in this period</p>
                  ) : (
                    invoices.slice().sort((a, b) => b.totalAmount - a.totalAmount).map(inv => (
                      <div key={inv.id} className="flex items-center justify-between py-3 px-4 rounded-2xl hover:bg-slate-50 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-slate-800 font-poppins">{inv.invoiceNumber}</p>
                          <p className="text-xs text-slate-400 font-medium">{inv.customerName} · {inv.date}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-profee-blue font-poppins">{formatAmount(inv.totalAmount)}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : inv.status === 'Partial' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>{inv.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {detailModal === 'collections' && (
              <>
                <div className="flex items-center justify-between px-8 pt-8 pb-4 flex-shrink-0">
                  <div>
                    <h3 className="text-xl font-bold font-poppins text-slate-900">Collections</h3>
                    <p className="text-xs text-slate-400 font-medium font-poppins mt-0.5">Payments received · {formatAmount(totalCollections)}</p>
                  </div>
                  <button onClick={() => setDetailModal(null)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors"><X size={18} className="text-slate-400" /></button>
                </div>
                <div className="overflow-y-auto px-8 pb-8 space-y-2">
                  {ledgerEntries.filter(e => e.type === 'Credit').length === 0 ? (
                    <p className="text-center py-12 text-slate-300 font-bold font-poppins">No collections in this period</p>
                  ) : (
                    ledgerEntries.filter(e => e.type === 'Credit').slice().sort((a, b) => b.date.localeCompare(a.date)).map(e => (
                      <div key={e.id} className="flex items-center justify-between py-3 px-4 rounded-2xl hover:bg-emerald-50/60 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-slate-800 font-poppins">{e.description || 'Payment received'}</p>
                          <p className="text-xs text-slate-400 font-medium">{e.date}</p>
                        </div>
                        <p className="text-sm font-bold text-emerald-600 font-poppins">+{formatAmount(e.amount)}</p>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}

            {detailModal === 'outstanding' && (
              <>
                <div className="flex items-center justify-between px-8 pt-8 pb-4 flex-shrink-0">
                  <div>
                    <h3 className="text-xl font-bold font-poppins text-slate-900">Outstanding</h3>
                    <p className="text-xs text-slate-400 font-medium font-poppins mt-0.5">Unpaid &amp; partial invoices · {formatAmount(outstanding)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setDetailModal(null); onNavigate?.('invoices'); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 text-xs font-bold font-poppins hover:bg-rose-100 transition-colors">
                      View All <ArrowUpRight size={13} />
                    </button>
                    <button onClick={() => setDetailModal(null)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors"><X size={18} className="text-slate-400" /></button>
                  </div>
                </div>
                <div className="overflow-y-auto px-8 pb-8 space-y-2">
                  {invoices.filter(i => i.status !== 'Paid').length === 0 ? (
                    <div className="py-12 text-center">
                      <p className="text-emerald-500 font-bold font-poppins text-sm">🎉 All invoices are paid!</p>
                    </div>
                  ) : (
                    invoices.filter(i => i.status !== 'Paid').slice().sort((a, b) => b.totalAmount - a.totalAmount).map(inv => {
                      const daysSince = Math.floor((Date.now() - new Date(inv.date).getTime()) / (1000 * 60 * 60 * 24));
                      return (
                        <div key={inv.id} className="flex items-center justify-between py-3 px-4 rounded-2xl hover:bg-rose-50/60 transition-colors">
                          <div>
                            <p className="text-sm font-bold text-slate-800 font-poppins">{inv.invoiceNumber}</p>
                            <p className="text-xs text-slate-400 font-medium">{inv.customerName} · {daysSince}d ago</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-rose-600 font-poppins">{formatAmount(inv.totalAmount)}</p>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${inv.status === 'Partial' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>{inv.status}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}

            {detailModal === 'rate' && (() => {
              // Monthly breakdown
              const monthlyData = chartData.map(m => ({
                ...m,
                rate: m.Sales > 0 ? Math.round((m.Collections / m.Sales) * 100) : 0,
              }));
              return (
                <>
                  <div className="flex items-center justify-between px-8 pt-8 pb-4 flex-shrink-0">
                    <div>
                      <h3 className="text-xl font-bold font-poppins text-slate-900">Collection Rate</h3>
                      <p className="text-xs text-slate-400 font-medium font-poppins mt-0.5">Overall: {collectionRate !== null ? `${collectionRate}%` : '—'} collected</p>
                    </div>
                    <button onClick={() => setDetailModal(null)} className="p-2 rounded-xl hover:bg-slate-100 transition-colors"><X size={18} className="text-slate-400" /></button>
                  </div>
                  <div className="overflow-y-auto px-8 pb-8 space-y-3">
                    {/* Summary row */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      {[
                        { label: 'Total Billed', value: formatAmount(totalSales), color: 'text-profee-blue' },
                        { label: 'Collected', value: formatAmount(totalCollections), color: 'text-emerald-600' },
                        { label: 'Pending', value: formatAmount(outstanding), color: 'text-rose-500' },
                      ].map(s => (
                        <div key={s.label} className="bg-slate-50 rounded-2xl p-4 text-center">
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-poppins">{s.label}</p>
                          <p className={`text-base font-bold font-poppins mt-1 ${s.color}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                    {/* Rate bar */}
                    <div className="bg-slate-50 rounded-2xl p-4 mb-2">
                      <div className="flex justify-between text-xs font-bold font-poppins text-slate-500 mb-2">
                        <span>Collection Rate</span>
                        <span>{collectionRate !== null ? `${collectionRate}%` : '—'}</span>
                      </div>
                      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-700" style={{ width: `${collectionRate ?? 0}%` }} />
                      </div>
                    </div>
                    {/* Monthly breakdown */}
                    {monthlyData.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-poppins mb-2 px-1">Monthly Breakdown</p>
                        {monthlyData.map(m => (
                          <div key={m.name} className="flex items-center gap-3 py-2.5 px-4 rounded-2xl hover:bg-slate-50 transition-colors">
                            <span className="text-xs font-bold text-slate-500 font-poppins w-14 flex-shrink-0">{m.name}</span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-cyan-400 to-emerald-500 rounded-full" style={{ width: `${Math.min(m.rate, 100)}%` }} />
                            </div>
                            <span className="text-xs font-bold text-cyan-600 font-poppins w-10 text-right flex-shrink-0">{m.rate}%</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {[
          { label: 'Total Sales', value: formatAmount(totalSales), icon: IndianRupee, color: 'bg-profee-blue', shadow: 'shadow-indigo-100', textColor: 'text-profee-blue', hoverShadow: '0 0 0 1px rgba(76,45,224,0.08), 0 8px 20px -4px rgba(0,0,0,0.10), 0 0 40px 8px rgba(76,45,224,0.28), 0 20px 50px -10px rgba(76,45,224,0.22)', onClick: () => setDetailModal('sales'), hint: 'View invoices' },
          { label: 'Collections', value: formatAmount(totalCollections), icon: TrendingUp, color: 'bg-emerald-500', shadow: 'shadow-emerald-100', textColor: 'text-emerald-500', hoverShadow: '0 0 0 1px rgba(16,185,129,0.08), 0 8px 20px -4px rgba(0,0,0,0.10), 0 0 40px 8px rgba(16,185,129,0.28), 0 20px 50px -10px rgba(16,185,129,0.22)', onClick: () => setDetailModal('collections'), hint: 'View payments' },
          { label: 'Outstanding', value: formatAmount(outstanding), icon: AlertTriangle, color: 'bg-rose-500', shadow: 'shadow-rose-100', textColor: 'text-rose-500', hoverShadow: '0 0 0 1px rgba(244,63,94,0.08), 0 8px 20px -4px rgba(0,0,0,0.10), 0 0 40px 8px rgba(244,63,94,0.28), 0 20px 50px -10px rgba(244,63,94,0.22)', onClick: () => setDetailModal('outstanding'), hint: 'View unpaid' },
          { label: 'Active Parties', value: String(activePartyCount), icon: Users, color: 'bg-amber-500', shadow: 'shadow-amber-100', textColor: 'text-amber-500', hoverShadow: '0 0 0 1px rgba(245,158,11,0.08), 0 8px 20px -4px rgba(0,0,0,0.10), 0 0 40px 8px rgba(245,158,11,0.28), 0 20px 50px -10px rgba(245,158,11,0.22)', onClick: () => onNavigate?.('customers'), hint: 'Go to customers' },
          { label: 'Invoices Raised', value: String(invoices.length), icon: FileText, color: 'bg-violet-500', shadow: 'shadow-violet-100', textColor: 'text-violet-600', hoverShadow: '0 0 0 1px rgba(124,58,237,0.08), 0 8px 20px -4px rgba(0,0,0,0.10), 0 0 40px 8px rgba(124,58,237,0.28), 0 20px 50px -10px rgba(124,58,237,0.22)', onClick: () => onNavigate?.('invoices'), hint: 'Go to invoices' },
          { label: 'Collection Rate', value: collectionRate !== null ? `${collectionRate}%` : '—', icon: BarChart3, color: 'bg-cyan-500', shadow: 'shadow-cyan-100', textColor: 'text-cyan-600', hoverShadow: '0 0 0 1px rgba(6,182,212,0.08), 0 8px 20px -4px rgba(0,0,0,0.10), 0 0 40px 8px rgba(6,182,212,0.28), 0 20px 50px -10px rgba(6,182,212,0.22)', onClick: () => setDetailModal('rate'), hint: 'View breakdown' },
        ].map((metric) => (
          <button
            key={metric.label}
            onClick={metric.onClick}
            onMouseEnter={() => setHoveredCard(metric.label)}
            onMouseLeave={() => setHoveredCard(null)}
            className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 border border-slate-100 transition-all duration-300 cursor-pointer text-left w-full group relative overflow-hidden"
            style={{
              boxShadow: hoveredCard === metric.label
                ? metric.hoverShadow
                : '0 2px 4px -1px rgba(0,0,0,0.06), 0 8px 16px -4px rgba(0,0,0,0.08), 0 25px 60px -15px rgba(76,45,224,0.22), 0 10px 20px -5px rgba(76,45,224,0.12)',
              transform: hoveredCard === metric.label ? 'translateY(-5px) scale(1.02)' : 'none',
            }}
          >
            <div className="flex justify-between items-start mb-4 sm:mb-6">
              <div className={`p-3 sm:p-4 rounded-2xl text-white ${metric.color} shadow-lg ${metric.shadow}`}><metric.icon size={20} /></div>
              <ChevronRight size={15} className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all mt-1" />
            </div>
            <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 sm:mb-2 font-poppins">{metric.label}</p>
            <h3 className={`text-xl sm:text-3xl font-bold ${metric.textColor} font-poppins`}>{metric.value}</h3>
            <p className="text-[9px] font-semibold text-slate-300 font-poppins mt-2 group-hover:text-slate-400 transition-colors">{metric.hint}</p>
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="lg:col-span-2 bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 premium-shadow border border-slate-50">
          <h3 className="text-xl font-bold font-poppins text-slate-900 mb-2">Sales & Collections</h3>
          <p className="text-xs text-slate-400 font-medium mb-8 uppercase tracking-widest">
            {filterMode === 'fy' ? `FY ${selectedFY}` : customFrom && customTo ? `${customFrom} to ${customTo}` : 'Revenue overview'}
          </p>
          {hasData && chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4c2de0" stopOpacity={0.15} /><stop offset="95%" stopColor="#4c2de0" stopOpacity={0} /></linearGradient>
                  <linearGradient id="colorCollections" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.15} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', fontFamily: 'Poppins' }} />
                <Area type="monotone" dataKey="Sales" stroke="#4c2de0" strokeWidth={3} fillOpacity={1} fill="url(#colorSales)" />
                <Area type="monotone" dataKey="Collections" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorCollections)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center"><p className="text-lg font-bold font-poppins text-slate-200">{allInvoices.length > 0 ? 'No invoices in this period' : 'Create invoices to see chart data'}</p></div>
          )}
        </div>

        <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 premium-shadow border border-slate-50">
          <h3 className="text-xl font-bold font-poppins text-slate-900 mb-2">Invoice Status</h3>
          <p className="text-xs text-slate-400 font-medium mb-6 uppercase tracking-widest">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} in period</p>
          {pieData.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={5}>
                    {pieData.map((_, idx) => <Cell key={idx} fill={COLORS_PIE[idx % COLORS_PIE.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-6 mt-4 font-poppins">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-xs font-bold">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS_PIE[i % COLORS_PIE.length] }} />
                    <span className="text-slate-500">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[200px] flex items-center justify-center"><p className="text-sm font-bold font-poppins text-slate-200">No invoices in this period</p></div>
          )}
        </div>
      </div>

      {/* Top Customers + Smart Alerts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">

        {/* Top Customers */}
        <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 premium-shadow border border-slate-50">
          <h3 className="text-xl font-bold font-poppins text-slate-900 mb-2">Top Customers</h3>
          <p className="text-xs text-slate-400 font-medium mb-6 uppercase tracking-widest">By invoiced amount · this period</p>
          {topCustomers.length > 0 ? (
            <div className="space-y-3">
              {topCustomers.map((c, idx) => {
                const pct = totalSales > 0 ? Math.round((c.total / totalSales) * 100) : 0;
                const barColors = ['bg-profee-blue', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-violet-500'];
                return (
                  <div key={c.name} className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-slate-300 font-poppins w-4">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-bold text-slate-700 font-poppins truncate">{c.name}</p>
                        <span className="text-sm font-bold text-slate-500 font-poppins ml-2 flex-shrink-0">{formatAmount(c.total)}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${barColors[idx % barColors.length]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 font-poppins w-8 text-right">{pct}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center">
              <p className="text-sm font-bold font-poppins text-slate-200">No invoices in this period</p>
            </div>
          )}
        </div>

        {/* Smart Alerts */}
        <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 premium-shadow border border-slate-50">
        <h3 className="text-xl font-bold font-poppins text-slate-900 mb-6">Smart Alerts</h3>
        {overdueInvoices.length > 0 ? (
          <div className="space-y-4">
            {overdueInvoices.slice(0, 5).map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-6 bg-rose-50 rounded-2xl border border-rose-100">
                <div className="flex items-center gap-4">
                  <AlertTriangle className="text-rose-400" size={20} />
                  <div>
                    <p className="text-sm font-bold text-slate-800 font-poppins">{inv.customerName || 'Customer'} - {inv.invoiceNumber}</p>
                    <p className="text-xs text-slate-400 font-medium">Overdue since {inv.date}</p>
                  </div>
                </div>
                <span className="text-lg font-bold text-rose-500 font-poppins">₹{inv.totalAmount.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
            <p className="text-sm font-bold text-emerald-600 font-poppins">{hasData ? 'All payments are on track! No overdue invoices.' : 'No invoices yet. Create your first invoice to get started.'}</p>
          </div>
        )}
        </div>

      </div>{/* end Top Customers + Smart Alerts grid */}

      {/* Recent Invoices */}
      {invoices.length > 0 && (
        <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 premium-shadow border border-slate-50">
          <h3 className="text-xl font-bold font-poppins text-slate-900 mb-6">Recent Invoices</h3>
          <div className="space-y-3">
            {invoices.slice(0, 5).map(inv => {
              const customer = customers.find(c => c.id === inv.customerId) || null;
              return (
                <button
                  key={inv.id}
                  onClick={() => profile && setDownloadTarget({ invoice: inv, customer })}
                  className="w-full flex items-center justify-between p-6 bg-slate-50 rounded-2xl hover:bg-indigo-50/60 hover:shadow-sm transition-all duration-200 group text-left"
                >
                  <div className="flex items-center gap-4">
                    <FileText className="text-profee-blue group-hover:scale-110 transition-transform" size={20} />
                    <div>
                      <p className="text-sm font-bold text-slate-800 font-poppins">{inv.invoiceNumber}</p>
                      <p className="text-xs text-slate-400 font-medium">{inv.customerName} • {inv.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                    <div className="text-right">
                      <p className="text-sm sm:text-lg font-bold text-slate-800 font-poppins">₹{inv.totalAmount.toLocaleString('en-IN')}</p>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : inv.status === 'Partial' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>{inv.status}</span>
                    </div>
                    <ExternalLink size={16} className="text-slate-300 group-hover:text-profee-blue transition-colors flex-shrink-0 hidden sm:block" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoice direct download */}
      {downloadTarget && profile && (
        <PDFDirectDownload
          document={
            <InvoicePDF
              invoice={downloadTarget.invoice}
              business={profile}
              customer={downloadTarget.customer || { id: '', name: downloadTarget.invoice.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 }}
            />
          }
          fileName={`Invoice-${downloadTarget.invoice.invoiceNumber.replace(/\//g, '-')}.pdf`}
          onDone={() => setDownloadTarget(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;
