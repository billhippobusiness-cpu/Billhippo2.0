
import React, { useState } from 'react';
import { ChevronLeft, Download, Search, Filter, Plus, Eye, Printer, Edit3, Zap, MapPin, Building2 } from 'lucide-react';

const LedgerView: React.FC = () => {
  const [isPreview, setIsPreview] = useState(false);
  const entries = [
    { date: '2026-02-04', ref: 'INV/24-25/001', desc: 'Sale of Electrical Goods', debit: 10000, credit: 0, balance: 10000, type: 'Dr' },
    { date: '2026-02-04', ref: 'RCP/4722', desc: 'NEFT Payment - ICICI', debit: 0, credit: 8000, balance: 2000, type: 'Dr' },
    { date: '2026-02-05', ref: 'INV/24-25/003', desc: 'Sale of Cables', debit: 4500, credit: 0, balance: 6500, type: 'Dr' },
    { date: '2026-02-05', ref: 'INV/24-25/002', desc: 'Professional Maintenance', debit: 11000, credit: 0, balance: 17500, type: 'Dr' },
  ];

  const partyInfo = {
    name: 'Radhe Shyam Traders',
    gstin: '27AABCR9108G1Z1',
    address: 'Old Market Area, Mumbai, Maharashtra - 400001',
    id: 'BH-ACC-912'
  };

  const businessInfo = {
    name: 'Foobar Labs',
    gstin: '29ABCED1234F2Z5',
    address: '46, Raghuveer Dham Society, Surat, Gujarat - 395006',
    email: 'foobarlabs@gmail.com',
    phone: '+91 98765 43210'
  };

  const LedgerPreview = () => (
    <div className="bg-white p-12 min-h-[1100px] flex flex-col space-y-10 w-full max-w-[850px] mx-auto print:shadow-none print:p-4 border border-slate-100 shadow-2xl rounded-[2.5rem] font-poppins">
      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-slate-50 pb-8">
        <div className="space-y-4">
           <div className="flex items-center gap-2">
             <div className="w-8 h-8 bg-profee-blue rounded-lg flex items-center justify-center text-white">
                <Zap size={18} fill="currentColor" />
             </div>
             <h1 className="text-xl font-black uppercase tracking-tighter text-slate-800">BillHippo Statement</h1>
           </div>
           <div className="space-y-1">
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Account Statement</h2>
              <p className="text-xs font-bold text-slate-800">Period: Feb 01, 2026 - Feb 28, 2026</p>
           </div>
        </div>
        <div className="text-right space-y-2">
           <h3 className="text-sm font-black text-slate-900">{businessInfo.name}</h3>
           <p className="text-[10px] text-slate-400 font-medium max-w-[200px] ml-auto">{businessInfo.address}</p>
           <p className="text-[10px] font-black text-profee-blue">GSTIN: {businessInfo.gstin}</p>
        </div>
      </div>

      {/* Party Info Box */}
      <div className="bg-slate-50 rounded-[2rem] p-8 border border-slate-100 flex justify-between items-center">
         <div className="space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Account</p>
            <h4 className="text-lg font-black text-slate-800">{partyInfo.name}</h4>
            <p className="text-[10px] text-slate-500 font-medium">{partyInfo.address}</p>
         </div>
         <div className="text-right">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Details</p>
            <p className="text-xs font-bold text-slate-800">ID: {partyInfo.id}</p>
            <p className="text-[10px] font-black text-profee-blue">GSTIN: {partyInfo.gstin}</p>
         </div>
      </div>

      {/* Ledger Table */}
      <div className="flex-1">
        <table className="w-full text-left border-collapse rounded-2xl overflow-hidden shadow-sm border border-slate-100">
          <thead>
            <tr className="text-white text-[10px] font-black uppercase tracking-widest bg-profee-blue">
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Ref / Voucher</th>
              <th className="px-6 py-4">Description</th>
              <th className="px-4 py-4 text-center">Debit (₹)</th>
              <th className="px-4 py-4 text-center">Credit (₹)</th>
              <th className="px-6 py-4 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="text-[11px] font-medium divide-y divide-slate-100 bg-white">
            {entries.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-5 text-slate-400">{item.date}</td>
                <td className="px-6 py-5 font-black text-slate-800">{item.ref}</td>
                <td className="px-6 py-5 text-slate-500 italic">{item.desc}</td>
                <td className="px-4 py-5 text-center font-bold text-rose-500">
                  {item.debit > 0 ? `₹${item.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                </td>
                <td className="px-4 py-5 text-center font-bold text-emerald-500">
                  {item.credit > 0 ? `₹${item.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                </td>
                <td className="px-6 py-5 text-right font-black text-slate-900">
                  ₹{item.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} <span className="text-[8px] opacity-50">{item.type}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals Summary Footer */}
      <div className="grid grid-cols-3 gap-6 pt-10 border-t-2 border-slate-50">
         <div className="p-6 bg-rose-50 rounded-2xl border border-rose-100/50 text-center">
            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">Total Sales (Dr)</p>
            <h5 className="text-xl font-black text-rose-600">₹25,500.00</h5>
         </div>
         <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100/50 text-center">
            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Collections (Cr)</p>
            <h5 className="text-xl font-black text-emerald-600">₹8,000.00</h5>
         </div>
         <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 text-center text-white shadow-xl shadow-slate-200">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Closing Balance</p>
            <h5 className="text-xl font-black">₹17,500.00 <span className="text-[10px] opacity-50">Dr</span></h5>
         </div>
      </div>

      <div className="pt-10 flex justify-between items-center text-[9px] font-bold text-slate-300 uppercase tracking-widest border-t border-slate-50">
         <p>Statement Date: {new Date().toLocaleDateString()}</p>
         <p>Auto-generated by BillHippo Smart OS</p>
         <p>Page 1 of 1</p>
      </div>
    </div>
  );

  if (isPreview) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 font-poppins">
        <div className="flex justify-between items-center mb-6 no-print">
          <button onClick={() => setIsPreview(false)} className="flex items-center gap-2 text-profee-blue font-bold text-sm hover:underline">
            <Edit3 size={18} /> Back to Entry
          </button>
          <div className="flex gap-4">
             <button onClick={() => window.print()} className="bg-white border border-slate-200 px-10 py-4 rounded-2xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm">
               <Printer size={18} /> Print Statement
             </button>
             <button className="bg-profee-blue text-white px-12 py-4 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-xl shadow-indigo-100 hover:scale-105 transition-all">
               <Download size={18} /> Export PDF
             </button>
          </div>
        </div>

        <div className="flex justify-center bg-slate-100 p-12 min-h-screen rounded-[3rem] no-print">
          <div className="print-area">
             <LedgerPreview />
          </div>
        </div>

        <div className="hidden print:block">
           <LedgerPreview />
        </div>

        <style>{`
          @media print {
            body * { visibility: hidden; background: white !important; }
            .print-area, .print-area * { visibility: visible; }
            .print-area { position: absolute; left: 0; top: 0; padding: 0 !important; width: 100%; box-shadow: none !important; }
            .no-print { display: none !important; }
            @page { size: A4; margin: 10mm; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center mb-8 font-poppins">
        <button className="flex items-center gap-2 text-profee-blue font-bold text-sm hover:underline">
          <ChevronLeft size={16} /> All Parties
        </button>
        <div className="flex gap-4">
          <button className="bg-white border border-slate-200 text-slate-600 px-8 py-3 rounded-2xl font-bold flex items-center gap-3 hover:bg-slate-50 transition-all shadow-sm">
            <Filter size={18} /> Filter Records
          </button>
          <button 
            onClick={() => setIsPreview(true)}
            className="bg-white border border-indigo-100 text-profee-blue px-8 py-3 rounded-2xl font-bold flex items-center gap-3 hover:bg-indigo-50 transition-all shadow-sm"
          >
            <Eye size={18} /> Preview Ledger
          </button>
          <button className="bg-profee-blue text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-3 shadow-lg shadow-indigo-100 hover:scale-105 transition-all">
            <Download size={18} /> Download Statement
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] p-12 premium-shadow min-h-[600px] flex flex-col">
        <div className="flex justify-between items-start mb-12">
           <div>
              <h1 className="text-4xl font-bold font-poppins text-slate-900">Party Ledger</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full font-poppins">ACTIVE ACCOUNT</span>
                <p className="text-sm font-medium text-slate-400">Account ID: {partyInfo.id}</p>
              </div>
           </div>
           <div className="text-right">
              <h2 className="text-2xl font-bold font-poppins text-slate-900">{partyInfo.name}</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">GSTIN: {partyInfo.gstin}</p>
           </div>
        </div>

        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left font-poppins">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                <th className="px-6 py-4 rounded-tl-xl">Date</th>
                <th className="px-6 py-4">Voucher No</th>
                <th className="px-6 py-4">Narration</th>
                <th className="px-6 py-4 text-center">Debit (₹)</th>
                <th className="px-6 py-4 text-center">Credit (₹)</th>
                <th className="px-6 py-4 text-right rounded-tr-xl">Balance (₹)</th>
              </tr>
            </thead>
            <tbody className="text-xs font-medium divide-y divide-slate-50">
              {entries.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-6 text-slate-400">{item.date}</td>
                  <td className="px-6 py-6 font-bold text-slate-700">{item.ref}</td>
                  <td className="px-6 py-6 text-slate-500">{item.desc}</td>
                  <td className="px-6 py-6 text-center font-bold text-rose-500">
                    {item.debit > 0 ? `₹${item.debit.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-6 py-6 text-center font-bold text-emerald-500">
                    {item.credit > 0 ? `₹${item.credit.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-6 py-6 text-right font-bold text-rose-500">
                    ₹{item.balance.toLocaleString()} {item.type}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 bg-slate-50 rounded-[2.5rem] p-12 grid grid-cols-1 md:grid-cols-3 gap-8 font-poppins">
           <div className="text-center space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Sales</p>
              <p className="text-3xl font-bold text-rose-500">₹25,500</p>
           </div>
           <div className="text-center space-y-2 border-x border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Collections</p>
              <p className="text-3xl font-bold text-emerald-500">₹8,000</p>
           </div>
           <div className="text-center space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Outstanding Due</p>
              <p className="text-3xl font-bold text-rose-500">₹17,500</p>
           </div>
        </div>

        <div className="mt-12 text-center">
           <p className="text-[8px] text-slate-300 font-bold uppercase tracking-widest font-poppins">Generated by BillHippo for {partyInfo.name}</p>
        </div>
      </div>

      <footer className="text-center py-10 space-y-4">
         <div className="flex justify-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest font-poppins">
            <a href="#" className="hover:text-profee-blue transition-colors">Safety Center</a>
            <span>•</span>
            <a href="#" className="hover:text-profee-blue transition-colors">Help & FAQ</a>
            <span>•</span>
            <span className="text-slate-300">© 2026 BillHippo Smart Billing. All rights reserved.</span>
         </div>
      </footer>
    </div>
  );
};

export default LedgerView;
