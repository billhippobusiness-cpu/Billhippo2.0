import React, { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { IndianRupee, Users, FileText, AlertTriangle, TrendingUp, Loader2 } from 'lucide-react';
import { Invoice, Customer, LedgerEntry } from '../types';
import { getInvoices, getCustomers, getLedgerEntries } from '../lib/firestore';

interface DashboardProps { userId: string; }

const COLORS_PIE = ['#10b981', '#f43f5e', '#f59e0b'];

const Dashboard: React.FC<DashboardProps> = ({ userId }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [inv, cust, ledger] = await Promise.all([
        getInvoices(userId), getCustomers(userId), getLedgerEntries(userId)
      ]);
      setInvoices(inv); setCustomers(cust); setLedgerEntries(ledger);
    } catch (err) { console.error('Dashboard load error:', err); }
    finally { setLoading(false); }
  };

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
      const month = inv.date.substring(0, 7); // YYYY-MM
      if (!months[month]) months[month] = { sales: 0, collections: 0 };
      months[month].sales += inv.totalAmount;
    });
    ledgerEntries.filter(e => e.type === 'Credit').forEach(e => {
      const month = e.date.substring(0, 7);
      if (!months[month]) months[month] = { sales: 0, collections: 0 };
      months[month].collections += e.amount;
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([month, data]) => ({
      name: new Date(month + '-01').toLocaleDateString('en-IN', { month: 'short' }),
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 max-w-7xl mx-auto">
      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Total Sales', value: formatAmount(totalSales), icon: IndianRupee, color: 'bg-profee-blue', shadow: 'shadow-indigo-100', textColor: 'text-profee-blue' },
          { label: 'Collections', value: formatAmount(totalCollections), icon: TrendingUp, color: 'bg-emerald-500', shadow: 'shadow-emerald-100', textColor: 'text-emerald-500' },
          { label: 'Outstanding', value: formatAmount(outstanding), icon: AlertTriangle, color: 'bg-rose-500', shadow: 'shadow-rose-100', textColor: 'text-rose-500' },
          { label: 'Active Parties', value: String(customers.length), icon: Users, color: 'bg-amber-500', shadow: 'shadow-amber-100', textColor: 'text-amber-500' },
        ].map((metric) => (
          <div key={metric.label} className={`bg-white rounded-[2.5rem] p-8 premium-shadow border border-slate-50 hover:scale-[1.02] transition-all duration-300`}>
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
          <p className="text-xs text-slate-400 font-medium mb-8 uppercase tracking-widest">Revenue overview</p>
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
            <div className="h-[280px] flex items-center justify-center"><p className="text-lg font-bold font-poppins text-slate-200">Create invoices to see chart data</p></div>
          )}
        </div>

        <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50">
          <h3 className="text-xl font-bold font-poppins text-slate-900 mb-2">Invoice Status</h3>
          <p className="text-xs text-slate-400 font-medium mb-6 uppercase tracking-widest">{invoices.length} total invoices</p>
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
            <div className="h-[200px] flex items-center justify-center"><p className="text-sm font-bold font-poppins text-slate-200">No invoices yet</p></div>
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
            {invoices.slice(0, 5).map(inv => (
              <div key={inv.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl">
                <div className="flex items-center gap-4">
                  <FileText className="text-profee-blue" size={20} />
                  <div>
                    <p className="text-sm font-bold text-slate-800 font-poppins">{inv.invoiceNumber}</p>
                    <p className="text-xs text-slate-400 font-medium">{inv.customerName} • {inv.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-slate-800 font-poppins">₹{inv.totalAmount.toLocaleString('en-IN')}</p>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-600' : inv.status === 'Partial' ? 'bg-amber-100 text-amber-600' : 'bg-rose-100 text-rose-600'}`}>{inv.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
