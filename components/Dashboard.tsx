import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { IndianRupee, Users, FileText, AlertTriangle, TrendingUp, Loader2, ChevronDown, Calendar, RefreshCw, X, ExternalLink } from 'lucide-react';
import { Invoice, Customer, LedgerEntry, BusinessProfile } from '../types';
import { getInvoices, getCustomers, getLedgerEntries, getBusinessProfile, saveBusinessProfile } from '../lib/firestore';
import PDFPreviewModal from './pdf/PDFPreviewModal';
import InvoicePDF from './pdf/InvoicePDF';

interface DashboardProps { userId: string; }

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

const Dashboard: React.FC<DashboardProps> = ({ userId }) => {
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

  // ── PDF preview modal ──
  const [pdfModal, setPdfModal] = useState<{ open: boolean; invoice: Invoice | null; customer: Customer | null }>({ open: false, invoice: null, customer: null });

  // ── Stat card hover state for colored glow ──
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

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
            <div className="flex items-center gap-3">
              <Calendar size={18} className="text-profee-blue" />
              <div className="relative">
                <select
                  value={selectedFY}
                  onChange={(e) => handleFYChange(e.target.value)}
                  className="appearance-none bg-slate-50 border-none rounded-2xl px-6 py-3 pr-12 font-bold text-sm text-slate-700 focus:ring-2 ring-indigo-50 font-poppins cursor-pointer"
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

          {/* Data summary chip */}
          <div className="ml-auto hidden md:flex items-center gap-2">
            <div className="px-4 py-2 rounded-xl bg-indigo-50 text-profee-blue text-[10px] font-black uppercase tracking-wider font-poppins">
              {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} found
            </div>
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Sales', value: formatAmount(totalSales), icon: IndianRupee, color: 'bg-profee-blue', shadow: 'shadow-indigo-100', textColor: 'text-profee-blue', hoverShadow: '0 0 0 1px rgba(76,45,224,0.08), 0 8px 20px -4px rgba(0,0,0,0.10), 0 0 40px 8px rgba(76,45,224,0.28), 0 20px 50px -10px rgba(76,45,224,0.22)' },
          { label: 'Collections', value: formatAmount(totalCollections), icon: TrendingUp, color: 'bg-emerald-500', shadow: 'shadow-emerald-100', textColor: 'text-emerald-500', hoverShadow: '0 0 0 1px rgba(16,185,129,0.08), 0 8px 20px -4px rgba(0,0,0,0.10), 0 0 40px 8px rgba(16,185,129,0.28), 0 20px 50px -10px rgba(16,185,129,0.22)' },
          { label: 'Outstanding', value: formatAmount(outstanding), icon: AlertTriangle, color: 'bg-rose-500', shadow: 'shadow-rose-100', textColor: 'text-rose-500', hoverShadow: '0 0 0 1px rgba(244,63,94,0.08), 0 8px 20px -4px rgba(0,0,0,0.10), 0 0 40px 8px rgba(244,63,94,0.28), 0 20px 50px -10px rgba(244,63,94,0.22)' },
          { label: 'Active Parties', value: String(customers.length), icon: Users, color: 'bg-amber-500', shadow: 'shadow-amber-100', textColor: 'text-amber-500', hoverShadow: '0 0 0 1px rgba(245,158,11,0.08), 0 8px 20px -4px rgba(0,0,0,0.10), 0 0 40px 8px rgba(245,158,11,0.28), 0 20px 50px -10px rgba(245,158,11,0.22)' },
        ].map((metric) => (
          <div
            key={metric.label}
            onMouseEnter={() => setHoveredCard(metric.label)}
            onMouseLeave={() => setHoveredCard(null)}
            className="bg-white rounded-[2.5rem] p-8 border border-slate-100 transition-all duration-300 cursor-default"
            style={{
              boxShadow: hoveredCard === metric.label
                ? metric.hoverShadow
                : '0 2px 4px -1px rgba(0,0,0,0.06), 0 8px 16px -4px rgba(0,0,0,0.08), 0 25px 60px -15px rgba(76,45,224,0.22), 0 10px 20px -5px rgba(76,45,224,0.12)',
              transform: hoveredCard === metric.label ? 'translateY(-5px) scale(1.02)' : 'none',
            }}
          >
            <div className="flex justify-between items-start mb-6">
              <div className={`p-4 rounded-2xl text-white ${metric.color} shadow-lg ${metric.shadow}`}><metric.icon size={24} /></div>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-poppins">{metric.label}</p>
            <h3 className={`text-3xl font-bold ${metric.textColor} font-poppins`}>{metric.value}</h3>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50">
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

        <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50">
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

      {/* Smart Alerts */}
      <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50">
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

      {/* Recent Invoices */}
      {invoices.length > 0 && (
        <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50">
          <h3 className="text-xl font-bold font-poppins text-slate-900 mb-6">Recent Invoices</h3>
          <div className="space-y-3">
            {invoices.slice(0, 5).map(inv => {
              const customer = customers.find(c => c.id === inv.customerId) || null;
              return (
                <button
                  key={inv.id}
                  onClick={() => profile && setPdfModal({ open: true, invoice: inv, customer })}
                  className="w-full flex items-center justify-between p-6 bg-slate-50 rounded-2xl hover:bg-indigo-50/60 hover:shadow-sm transition-all duration-200 group text-left"
                >
                  <div className="flex items-center gap-4">
                    <FileText className="text-profee-blue group-hover:scale-110 transition-transform" size={20} />
                    <div>
                      <p className="text-sm font-bold text-slate-800 font-poppins">{inv.invoiceNumber}</p>
                      <p className="text-xs text-slate-400 font-medium">{inv.customerName} • {inv.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-800 font-poppins">₹{inv.totalAmount.toLocaleString('en-IN')}</p>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : inv.status === 'Partial' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>{inv.status}</span>
                    </div>
                    <ExternalLink size={16} className="text-slate-300 group-hover:text-profee-blue transition-colors flex-shrink-0" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoice PDF Preview Modal */}
      {pdfModal.open && pdfModal.invoice && profile && (
        <PDFPreviewModal
          open={pdfModal.open}
          onClose={() => setPdfModal({ open: false, invoice: null, customer: null })}
          document={
            <InvoicePDF
              invoice={pdfModal.invoice}
              business={profile}
              customer={pdfModal.customer || { id: '', name: pdfModal.invoice.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 }}
            />
          }
          fileName={`Invoice-${pdfModal.invoice.invoiceNumber.replace(/\//g, '-')}.pdf`}
        />
      )}
    </div>
  );
};

export default Dashboard;
