import React, { useState } from 'react';
import { Download, FileJson, FileSpreadsheet, Calendar, ChevronRight, AlertTriangle, CheckCircle2 } from 'lucide-react';

const GSTReports: React.FC = () => {
  const [selectedMonth, setSelectedMonth] = useState('October 2024');

  const reports = [
    { 
      name: 'GSTR-1', 
      desc: 'Outward supplies (Sales) summary', 
      status: 'Ready',
      fields: ['B2B Invoices', 'B2C Large', 'B2C Small', 'CDNR', 'Exports'],
      color: 'bg-indigo-500'
    },
    { 
      name: 'GSTR-3B', 
      desc: 'Summary of outward & inward supplies', 
      status: 'Ready',
      fields: ['Outward Taxable', 'Eligible ITC', 'Reverse Charge', 'Exempt/Nil Rated'],
      color: 'bg-purple-500'
    },
    { 
      name: 'GSTR-2A/2B', 
      desc: 'Auto-drafted ITC statement', 
      status: 'Review Required',
      fields: ['B2B Invoices', 'Credit Notes', 'ISD Credits', 'Import Goods'],
      color: 'bg-amber-500'
    }
  ];

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold font-poppins mb-1">Tax Filing Center</h2>
          <p className="text-slate-500">GST compliant exports and reconciliation for your business</p>
        </div>
        <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 p-2 rounded-2xl">
          <Calendar className="text-slate-500 ml-2" size={20} />
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent border-none outline-none font-semibold text-sm pr-8 font-poppins"
          >
            <option>October 2024</option>
            <option>September 2024</option>
            <option>August 2024</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.map((report) => (
          <div key={report.name} className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col group hover:border-indigo-500/50 transition-all duration-300">
            <div className="flex items-center justify-between mb-6">
              <div className={`p-3 rounded-2xl text-white ${report.color}`}>
                <FileText size={24} />
              </div>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase font-poppins ${report.status === 'Ready' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                {report.status}
              </span>
            </div>
            
            <h3 className="text-xl font-bold font-poppins mb-2">{report.name}</h3>
            <p className="text-sm text-slate-500 mb-6">{report.desc}</p>
            
            <div className="space-y-2 mb-8 flex-1">
              {report.fields.map(field => (
                <div key={field} className="flex items-center justify-between text-xs font-medium">
                  <span className="text-slate-400 font-poppins">{field}</span>
                  <CheckCircle2 size={14} className="text-emerald-500" />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 font-poppins">
              <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all">
                <FileJson size={14} /> JSON
              </button>
              <button className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all">
                <FileSpreadsheet size={14} /> EXCEL
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-8 rounded-3xl bg-indigo-600 text-white relative overflow-hidden shadow-xl shadow-indigo-600/20 font-poppins">
        <div className="absolute top-0 right-0 p-12 opacity-10">
          <AlertTriangle size={120} />
        </div>
        <div className="relative z-10 max-w-2xl">
          <h3 className="text-2xl font-bold mb-4 flex items-center gap-3">
            <AlertTriangle className="text-amber-400" /> GST Reconciliation Alert
          </h3>
          <p className="mb-6 opacity-90 leading-relaxed text-sm">
            We found 3 invoices from your suppliers in GSTR-2B that are not matching your records. 
            This could lead to ITC claim denials. Reconcile now to ensure full credit.
          </p>
          <button className="px-6 py-3 bg-white text-indigo-600 rounded-2xl font-bold hover:bg-slate-100 transition-all shadow-lg">
            Start Reconciliation Process
          </button>
        </div>
      </div>
    </div>
  );
};

const FileText = ({ size, className }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);

export default GSTReports;