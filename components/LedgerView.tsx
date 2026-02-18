
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Download, Search, Plus, Eye, Printer, Edit3, Loader2, Save, X } from 'lucide-react';
import { Customer, LedgerEntry } from '../types';
import { getCustomers, getLedgerEntries, addLedgerEntry, getBusinessProfile } from '../lib/firestore';
import PDFPreviewModal from './pdf/PDFPreviewModal';
import LedgerPDF from './pdf/LedgerPDF';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface LedgerViewProps { userId: string; }

const LedgerView: React.FC<LedgerViewProps> = ({ userId }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPreview, setIsPreview] = useState(false);
  const [search, setSearch] = useState('');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDesc, setPaymentDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState('BillHippo');
  const [businessInfo, setBusinessInfo] = useState({ gstin: '', address: '', email: '', phone: '' });
  const [showPDFModal, setShowPDFModal] = useState(false);

  useEffect(() => { loadCustomers(); }, [userId]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const [custs, profile] = await Promise.all([getCustomers(userId), getBusinessProfile(userId)]);
      setCustomers(custs);
      if (profile) {
        setBusinessName(profile.name);
        setBusinessInfo({ gstin: profile.gstin, address: `${profile.address}, ${profile.city}, ${profile.state} - ${profile.pincode}`, email: profile.email, phone: profile.phone });
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadEntries = async (customerId: string) => {
    try {
      const data = await getLedgerEntries(userId, customerId);
      setEntries(data);
    } catch (err) { console.error(err); }
  };

  const handleSelectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    loadEntries(id);
  };

  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedCustomerId), [selectedCustomerId, customers]);

  const runningEntries = useMemo(() => {
    let balance = 0;
    return entries.map(e => {
      balance += e.type === 'Debit' ? e.amount : -e.amount;
      return { ...e, runningBalance: balance };
    });
  }, [entries]);

  const totalDebit = entries.filter(e => e.type === 'Debit').reduce((s, e) => s + e.amount, 0);
  const totalCredit = entries.filter(e => e.type === 'Credit').reduce((s, e) => s + e.amount, 0);
  const closingBalance = totalDebit - totalCredit;

  const handleAddPayment = async () => {
    if (!paymentAmount || !selectedCustomerId) return;
    setSaving(true);
    try {
      await addLedgerEntry(userId, {
        date: new Date().toISOString().split('T')[0], type: 'Credit',
        amount: parseFloat(paymentAmount), description: paymentDesc || 'Payment received',
        customerId: selectedCustomerId
      });
      await loadEntries(selectedCustomerId);
      setShowPaymentForm(false); setPaymentAmount(''); setPaymentDesc('');
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) {
    return (<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-profee-blue mx-auto" /></div>);
  }

  // Preview mode
  if (isPreview && selectedCustomer) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 font-poppins">
        <div className="flex justify-between items-center mb-6 no-print">
          <button onClick={() => setIsPreview(false)} className="flex items-center gap-2 text-profee-blue font-bold text-sm hover:underline"><Edit3 size={18} /> Back to Ledger</button>
          <div className="flex gap-3">
            <button onClick={() => window.print()} className="bg-white border border-slate-200 px-10 py-4 rounded-2xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><Printer size={18} /> Print Statement</button>
            <button onClick={() => setShowPDFModal(true)} className="bg-profee-blue text-white px-10 py-4 rounded-2xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"><Download size={18} /> Download PDF</button>
          </div>
        </div>
        <div className="flex justify-center bg-slate-100 p-12 min-h-screen rounded-[3rem] no-print">
          <div className="print-area">
            <div className="bg-white p-12 min-h-[1100px] flex flex-col space-y-10 w-full max-w-[850px] mx-auto border border-slate-100 shadow-2xl rounded-[2.5rem] font-poppins">
              <div className="flex justify-between items-start border-b-2 border-slate-50 pb-8">
                <div className="space-y-4"><div className="flex items-center gap-2"><img src={BILLHIPPO_LOGO} alt="BillHippo" className="w-8 h-8 rounded-lg object-contain" /><h1 className="text-xl font-black uppercase tracking-tighter text-slate-800">BillHippo Statement</h1></div>
                  <div className="space-y-1"><h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Account Statement</h2></div>
                </div>
                <div className="text-right space-y-2"><h3 className="text-sm font-black text-slate-900">{businessName}</h3><p className="text-[10px] text-slate-400 font-medium max-w-[200px] ml-auto">{businessInfo.address}</p><p className="text-[10px] font-black text-profee-blue">GSTIN: {businessInfo.gstin}</p></div>
              </div>
              <div className="bg-slate-50 rounded-[2rem] p-8 border border-slate-100 flex justify-between items-center">
                <div className="space-y-1"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Account</p><h4 className="text-lg font-black text-slate-800">{selectedCustomer.name}</h4><p className="text-[10px] text-slate-500 font-medium">{selectedCustomer.address}, {selectedCustomer.city}, {selectedCustomer.state}</p></div>
                <div className="text-right"><p className="text-[10px] font-black text-profee-blue">GSTIN: {selectedCustomer.gstin || '---'}</p></div>
              </div>
              <div className="flex-1"><table className="w-full text-left border-collapse rounded-2xl overflow-hidden shadow-sm border border-slate-100"><thead><tr className="text-white text-[10px] font-black uppercase tracking-widest bg-profee-blue"><th className="px-6 py-4">Date</th><th className="px-6 py-4">Description</th><th className="px-4 py-4 text-center">Debit</th><th className="px-4 py-4 text-center">Credit</th><th className="px-6 py-4 text-right">Balance</th></tr></thead>
              <tbody className="text-[11px] font-medium divide-y divide-slate-100 bg-white">{runningEntries.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-50"><td className="px-6 py-5 text-slate-400">{item.date}</td><td className="px-6 py-5 text-slate-500 italic">{item.description}</td>
                  <td className="px-4 py-5 text-center font-bold text-rose-500">{item.type === 'Debit' ? `₹${item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                  <td className="px-4 py-5 text-center font-bold text-emerald-500">{item.type === 'Credit' ? `₹${item.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}</td>
                  <td className="px-6 py-5 text-right font-black text-slate-900">₹{item.runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })} <span className="text-[8px] opacity-50">{item.runningBalance >= 0 ? 'Dr' : 'Cr'}</span></td>
                </tr>))}</tbody></table></div>
              <div className="grid grid-cols-3 gap-6 pt-10 border-t-2 border-slate-50">
                <div className="p-6 bg-rose-50 rounded-2xl border border-rose-100/50 text-center"><p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-2">Total Sales (Dr)</p><h5 className="text-xl font-black text-rose-600">₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h5></div>
                <div className="p-6 bg-emerald-50 rounded-2xl border border-emerald-100/50 text-center"><p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-2">Collections (Cr)</p><h5 className="text-xl font-black text-emerald-600">₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</h5></div>
                <div className="p-6 bg-slate-900 rounded-2xl text-center text-white shadow-xl"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Closing Balance</p><h5 className="text-xl font-black">₹{Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })} <span className="text-[10px] opacity-50">{closingBalance >= 0 ? 'Dr' : 'Cr'}</span></h5></div>
              </div>
            </div>
          </div>
        </div>
        <style>{`@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } @page { size: A4; margin: 10mm; } }`}</style>

        {/* PDF Preview Modal */}
        {showPDFModal && selectedCustomer && (
          <PDFPreviewModal
            open={showPDFModal}
            onClose={() => setShowPDFModal(false)}
            document={
              <LedgerPDF
                customer={selectedCustomer}
                entries={entries}
                businessName={businessName}
                businessInfo={businessInfo}
                statementDate={new Date().toLocaleDateString('en-IN')}
              />
            }
            fileName={`Ledger-Statement-${selectedCustomer.name.replace(/\s+/g, '-')}.pdf`}
          />
        )}
      </div>
    );
  }

  // Party list view (no customer selected)
  if (!selectedCustomerId) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 pb-20">
        <div><h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Parties & Ledger</h1><p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">{customers.length} active accounts</p></div>
        <div className="relative"><Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
          <input className="w-full bg-white border border-slate-100 rounded-2xl pl-14 pr-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50 shadow-sm font-poppins" placeholder="Search parties..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {filteredCustomers.length === 0 ? (
          <div className="bg-white rounded-[2.5rem] p-20 premium-shadow border border-slate-50 text-center"><p className="text-xl font-bold font-poppins text-slate-300">No parties found. Add customers first.</p></div>
        ) : (
          <div className="space-y-3">{filteredCustomers.map(c => (
            <button key={c.id} onClick={() => handleSelectCustomer(c.id)} className="w-full bg-white rounded-[2rem] p-8 premium-shadow border border-slate-50 hover:border-indigo-100 transition-all flex justify-between items-center group text-left">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 rounded-2xl bg-profee-blue/10 text-profee-blue flex items-center justify-center font-bold font-poppins text-xl">{c.name.charAt(0)}</div>
                <div><h4 className="text-lg font-bold font-poppins text-slate-900">{c.name}</h4><p className="text-xs text-slate-400 font-medium">{c.city}, {c.state} {c.gstin ? `• GSTIN: ${c.gstin}` : ''}</p></div>
              </div>
              <div className="text-right"><p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Balance</p>
                <p className={`text-2xl font-bold font-poppins ${c.balance > 0 ? 'text-rose-500' : c.balance < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>{c.balance === 0 ? 'Settled' : `₹${Math.abs(c.balance).toLocaleString('en-IN')}`}</p>
              </div>
            </button>
          ))}</div>
        )}
      </div>
    );
  }

  // Customer ledger detail view
  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex justify-between items-center mb-8 font-poppins">
        <button onClick={() => { setSelectedCustomerId(null); setEntries([]); }} className="flex items-center gap-2 text-profee-blue font-bold text-sm hover:underline"><ChevronLeft size={16} /> All Parties</button>
        <div className="flex gap-4">
          <button onClick={() => setShowPaymentForm(true)} className="bg-emerald-500 text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-3 hover:scale-105 transition-all shadow-lg shadow-emerald-100"><Plus size={18} /> Record Payment</button>
          <button onClick={() => setIsPreview(true)} className="bg-white border border-indigo-100 text-profee-blue px-8 py-3 rounded-2xl font-bold flex items-center gap-3 hover:bg-indigo-50 transition-all shadow-sm"><Eye size={18} /> Preview Statement</button>
          <button onClick={() => setShowPDFModal(true)} className="bg-profee-blue text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-3 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"><Download size={18} /> Download PDF</button>
        </div>
      </div>

      {showPaymentForm && (
        <div className="bg-white rounded-[2rem] p-8 premium-shadow border border-emerald-100 space-y-6 animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center"><h3 className="text-lg font-bold font-poppins text-emerald-600">Record Payment (Credit)</h3><button onClick={() => setShowPaymentForm(false)} className="p-2 hover:bg-slate-50 rounded-xl"><X size={20} className="text-slate-400" /></button></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-poppins">
            <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Amount (₹) *</label><input type="number" className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} placeholder="0" /></div>
            <div className="space-y-2 md:col-span-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Description</label><input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700" value={paymentDesc} onChange={e => setPaymentDesc(e.target.value)} placeholder="e.g. NEFT Payment, Cash, UPI..." /></div>
          </div>
          <div className="flex justify-end"><button onClick={handleAddPayment} disabled={saving || !paymentAmount} className="bg-emerald-500 text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 hover:scale-105 transition-all font-poppins disabled:opacity-50">{saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save Payment</button></div>
        </div>
      )}

      <div className="bg-white rounded-[2.5rem] p-12 premium-shadow min-h-[600px] flex flex-col">
        <div className="flex justify-between items-start mb-12">
           <div><h1 className="text-4xl font-bold font-poppins text-slate-900">Party Ledger</h1>
             <div className="flex items-center gap-3 mt-2"><span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full font-poppins">ACTIVE ACCOUNT</span></div>
           </div>
           <div className="text-right"><h2 className="text-2xl font-bold font-poppins text-slate-900">{selectedCustomer?.name}</h2><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">GSTIN: {selectedCustomer?.gstin || '---'}</p></div>
        </div>

        {entries.length === 0 ? (
          <div className="flex-1 flex items-center justify-center"><p className="text-lg font-bold font-poppins text-slate-300">No ledger entries yet. Create an invoice for this customer.</p></div>
        ) : (
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left font-poppins"><thead><tr className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-widest"><th className="px-6 py-4 rounded-tl-xl">Date</th><th className="px-6 py-4">Description</th><th className="px-6 py-4 text-center">Debit (₹)</th><th className="px-6 py-4 text-center">Credit (₹)</th><th className="px-6 py-4 text-right rounded-tr-xl">Balance (₹)</th></tr></thead>
            <tbody className="text-xs font-medium divide-y divide-slate-50">{runningEntries.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-6 text-slate-400">{item.date}</td><td className="px-6 py-6 text-slate-500">{item.description}</td>
                <td className="px-6 py-6 text-center font-bold text-rose-500">{item.type === 'Debit' ? `₹${item.amount.toLocaleString('en-IN')}` : '-'}</td>
                <td className="px-6 py-6 text-center font-bold text-emerald-500">{item.type === 'Credit' ? `₹${item.amount.toLocaleString('en-IN')}` : '-'}</td>
                <td className="px-6 py-6 text-right font-bold text-rose-500">₹{Math.abs(item.runningBalance).toLocaleString('en-IN')} {item.runningBalance >= 0 ? 'Dr' : 'Cr'}</td>
              </tr>
            ))}</tbody></table>
          </div>
        )}

        <div className="mt-12 bg-slate-50 rounded-[2.5rem] p-12 grid grid-cols-1 md:grid-cols-3 gap-8 font-poppins">
           <div className="text-center space-y-2"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Sales</p><p className="text-3xl font-bold text-rose-500">₹{totalDebit.toLocaleString('en-IN')}</p></div>
           <div className="text-center space-y-2 border-x border-slate-200"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Collections</p><p className="text-3xl font-bold text-emerald-500">₹{totalCredit.toLocaleString('en-IN')}</p></div>
           <div className="text-center space-y-2"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Outstanding Due</p><p className="text-3xl font-bold text-rose-500">₹{Math.abs(closingBalance).toLocaleString('en-IN')}</p></div>
        </div>
      </div>

      {/* PDF Preview Modal (detail view) */}
      {showPDFModal && selectedCustomer && (
        <PDFPreviewModal
          open={showPDFModal}
          onClose={() => setShowPDFModal(false)}
          document={
            <LedgerPDF
              customer={selectedCustomer}
              entries={entries}
              businessName={businessName}
              businessInfo={businessInfo}
              statementDate={new Date().toLocaleDateString('en-IN')}
            />
          }
          fileName={`Ledger-Statement-${selectedCustomer.name.replace(/\s+/g, '-')}.pdf`}
        />
      )}
    </div>
  );
};

export default LedgerView;
