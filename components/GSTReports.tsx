import React, { useState, useEffect, useMemo } from 'react';
import { Download, FileJson, FileSpreadsheet, Calendar, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { getInvoices } from '../lib/firestore';
import { Invoice, GSTType } from '../types';

interface GSTReportsProps { userId: string; }

const GSTReports: React.FC<GSTReportsProps> = ({ userId }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    const load = async () => {
      try { setLoading(true); setInvoices(await getInvoices(userId)); }
      catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, [userId]);

  const filteredInvoices = useMemo(() =>
    invoices.filter(i => i.date.startsWith(selectedMonth)),
    [invoices, selectedMonth]
  );

  const totalTaxable = filteredInvoices.reduce((s, i) => s + i.totalBeforeTax, 0);
  const totalCGST = filteredInvoices.reduce((s, i) => s + i.cgst, 0);
  const totalSGST = filteredInvoices.reduce((s, i) => s + i.sgst, 0);
  const totalIGST = filteredInvoices.reduce((s, i) => s + i.igst, 0);
  const totalTax = totalCGST + totalSGST + totalIGST;
  const b2bCount = filteredInvoices.filter(i => i.gstType === GSTType.CGST_SGST).length;
  const igstCount = filteredInvoices.filter(i => i.gstType === GSTType.IGST).length;

  const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const months = useMemo(() => {
    const result: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return result;
  }, []);

  const reports = [
    { name: 'GSTR-1', desc: 'Outward supplies (Sales) summary', status: filteredInvoices.length > 0 ? 'Ready' : 'No Data',
      fields: [`B2B Invoices: ${b2bCount}`, `Inter-state (IGST): ${igstCount}`, `Total Invoices: ${filteredInvoices.length}`], color: 'bg-indigo-500' },
    { name: 'GSTR-3B', desc: 'Summary of outward & inward supplies', status: filteredInvoices.length > 0 ? 'Ready' : 'No Data',
      fields: [`Taxable Value: ₹${totalTaxable.toLocaleString('en-IN')}`, `CGST: ₹${totalCGST.toLocaleString('en-IN')}`, `SGST: ₹${totalSGST.toLocaleString('en-IN')}`, `IGST: ₹${totalIGST.toLocaleString('en-IN')}`], color: 'bg-purple-500' },
    { name: 'Tax Summary', desc: 'Total tax collected this period', status: totalTax > 0 ? 'Ready' : 'No Data',
      fields: [`Total Tax: ₹${totalTax.toLocaleString('en-IN')}`, `Total Sales: ₹${(totalTaxable + totalTax).toLocaleString('en-IN')}`, `Invoices: ${filteredInvoices.length}`], color: 'bg-amber-500' }
  ];

  if (loading) {
    return (<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-profee-blue mx-auto" /></div>);
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold font-poppins mb-1">Tax Filing Center</h2>
          <p className="text-slate-500 text-sm">GST compliant reports for {monthLabel}</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-2xl">
          <Calendar className="text-slate-500 ml-2" size={20} />
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent border-none outline-none font-semibold text-sm pr-8 font-poppins">
            {months.map(m => <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => (
          <div key={report.name} className="p-8 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col group hover:border-indigo-500/50 transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className={`p-3 rounded-2xl text-white ${report.color}`}><FileTextIcon size={24} /></div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase font-poppins ${report.status === 'Ready' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{report.status}</span>
            </div>
            <h3 className="text-xl font-bold font-poppins mb-2">{report.name}</h3>
            <p className="text-sm text-slate-500 mb-6">{report.desc}</p>
            <div className="space-y-2 mb-8 flex-1">
              {report.fields.map(field => (
                <div key={field} className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-500 font-poppins">{field}</span>
                  <CheckCircle2 size={14} className="text-emerald-500" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 font-poppins">
              <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all"><FileJson size={14} /> JSON</button>
              <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all"><FileSpreadsheet size={14} /> EXCEL</button>
            </div>
          </div>
        ))}
      </div>

      {filteredInvoices.length > 0 && (
        <div className="p-8 rounded-3xl bg-indigo-600 text-white relative overflow-hidden shadow-xl shadow-indigo-600/20 font-poppins">
          <div className="absolute top-0 right-0 p-12 opacity-10"><AlertTriangle size={120} /></div>
          <div className="relative z-10 max-w-2xl">
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-3"><AlertTriangle className="text-amber-400" /> GST Filing Reminder</h3>
            <p className="mb-6 opacity-90 leading-relaxed text-sm">You have {filteredInvoices.length} invoice(s) for {monthLabel} with total tax of ₹{totalTax.toLocaleString('en-IN')}. Ensure timely filing to avoid penalties.</p>
          </div>
        </div>
      )}
    </div>
  );
};

const FileTextIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

export default GSTReports;
