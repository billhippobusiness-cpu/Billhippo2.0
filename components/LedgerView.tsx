
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Download, Search, Plus, Eye, Printer, Edit3, Loader2, Save, X, Receipt, MessageCircle } from 'lucide-react';
import { Customer, LedgerEntry } from '../types';
import { getCustomers, getLedgerEntries, addLedgerEntry, deleteLedgerEntry, updateCustomer, getDeletedInvoices, getBusinessProfile } from '../lib/firestore';
import { pdf } from '@react-pdf/renderer';
import PDFPreviewModal, { PDFDirectDownload } from './pdf/PDFPreviewModal';
import LedgerPDF from './pdf/LedgerPDF';
import ReceiptPDF, { type ReceiptEntry } from './pdf/ReceiptPDF';

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
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [receiptModal, setReceiptModal] = useState<{ open: boolean; entry: ReceiptEntry | null }>({ open: false, entry: null });
  const [receiptInlinePreview, setReceiptInlinePreview] = useState<{ open: boolean; entry: ReceiptEntry | null }>({ open: false, entry: null });
  const [receiptWaLoading, setReceiptWaLoading] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState<{ document: React.ReactElement; fileName: string } | null>(null);

  useEffect(() => { loadCustomers(); }, [userId]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const [custs, profile] = await Promise.all([getCustomers(userId), getBusinessProfile(userId)]);
      setCustomers(custs);
      if (profile) {
        setBusinessName(profile.name);
        setBusinessInfo({ gstin: profile.gstin, address: `${profile.address}, ${profile.city}, ${profile.state} - ${profile.pincode}`, email: profile.email, phone: profile.phone });
        setLogoUrl(profile.theme?.logoUrl);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const loadEntries = async (customerId: string) => {
    try {
      const [data, deletedInvoices] = await Promise.all([
        getLedgerEntries(userId, customerId),
        getDeletedInvoices(userId),
      ]);
      const deletedInvoiceIds = new Set(deletedInvoices.map(inv => inv.id));
      // Auto-clean stale ledger entries whose invoice was deleted before the fix was deployed
      const staleEntries = data.filter(e => e.invoiceId && deletedInvoiceIds.has(e.invoiceId));
      if (staleEntries.length > 0) {
        const staleTotal = staleEntries.reduce((sum, e) => sum + e.amount, 0);
        await Promise.all(staleEntries.map(e => deleteLedgerEntry(userId, e.id)));
        const custList = await getCustomers(userId);
        const cust = custList.find(c => c.id === customerId);
        if (cust) {
          await updateCustomer(userId, customerId, { balance: (cust.balance || 0) - staleTotal });
          setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, balance: (c.balance || 0) - staleTotal } : c));
        }
      }
      setEntries(data.filter(e => !e.invoiceId || !deletedInvoiceIds.has(e.invoiceId)));
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
      const amount = parseFloat(paymentAmount);
      const date = new Date().toISOString().split('T')[0];
      const description = paymentDesc || 'Payment received';
      const newRunningBalance = closingBalance - amount;

      const entryId = await addLedgerEntry(userId, {
        date, type: 'Credit', amount, description, customerId: selectedCustomerId,
      });

      const receiptEntry: ReceiptEntry = {
        id: entryId, date, type: 'Credit', amount, description,
        customerId: selectedCustomerId, runningBalance: newRunningBalance,
      };

      await loadEntries(selectedCustomerId);
      setShowPaymentForm(false);
      setPaymentAmount('');
      setPaymentDesc('');
      setReceiptModal({ open: true, entry: receiptEntry });
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const filteredCustomers = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  const handleReceiptWhatsApp = async (entry: ReceiptEntry, customer: Customer) => {
    setReceiptWaLoading(true);
    try {
      const phone = customer.phone?.replace(/\D/g, '');
      const message = `Dear ${customer.name},\n\nYour payment of ₹${entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} has been received. Please find your receipt attached.\n\nRegards,\n${businessName}`;
      const fileName = `Receipt-${customer.name.replace(/\s+/g, '-')}-${entry.date}.pdf`;
      const blob = await pdf(
        <ReceiptPDF entry={entry} customer={customer} businessName={businessName} businessInfo={businessInfo} logoUrl={logoUrl} />
      ).toBlob();
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: message });
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = blobUrl; a.download = fileName;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        const waText = `${message}\n\n(PDF downloaded — please attach it to this chat)`;
        const url = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(waText)}` : `https://wa.me/?text=${encodeURIComponent(waText)}`;
        window.open(url, '_blank');
      }
    } catch (err) { console.error('WhatsApp receipt share failed:', err); }
    finally { setReceiptWaLoading(false); }
  };

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
            <button
              onClick={async () => {
                const phone = selectedCustomer.phone?.replace(/\D/g, '');
                const message = `Dear ${selectedCustomer.name},\n\nPlease find your account statement attached.\n\nRegards,\n${businessName}`;
                const fileName = `Ledger-Statement-${selectedCustomer.name.replace(/\s+/g, '-')}.pdf`;
                try {
                  const blob = await pdf(
                    <LedgerPDF customer={selectedCustomer} entries={entries} businessName={businessName} businessInfo={businessInfo} statementDate={new Date().toLocaleDateString('en-IN')} />
                  ).toBlob();
                  const file = new File([blob], fileName, { type: 'application/pdf' });
                  if (navigator.canShare?.({ files: [file] })) {
                    await navigator.share({ files: [file], text: message });
                  } else {
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a'); a.href = blobUrl; a.download = fileName;
                    document.body.appendChild(a); a.click(); document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                    const waText = `${message}\n\n(PDF downloaded — please attach it to this chat)`;
                    const url = phone ? `https://wa.me/91${phone}?text=${encodeURIComponent(waText)}` : `https://wa.me/?text=${encodeURIComponent(waText)}`;
                    window.open(url, '_blank');
                  }
                } catch (err) { console.error('WhatsApp share failed:', err); }
              }}
              className="bg-emerald-500 text-white px-8 py-4 rounded-2xl text-xs font-bold flex items-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100"
            >
              <MessageCircle size={18} /> WhatsApp
            </button>
            <button
              onClick={() => setDownloadTarget({ document: <LedgerPDF customer={selectedCustomer} entries={entries} businessName={businessName} businessInfo={businessInfo} statementDate={new Date().toLocaleDateString('en-IN')} />, fileName: `Ledger-Statement-${selectedCustomer.name.replace(/\s+/g, '-')}.pdf` })}
              className="bg-profee-blue text-white px-10 py-4 rounded-2xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              <Download size={18} /> Download PDF
            </button>
          </div>
        </div>
        <div className="bg-slate-100 p-2 sm:p-12 min-h-screen rounded-2xl sm:rounded-[3rem] no-print overflow-x-auto">
          <div className="print-area mx-auto w-[760px] min-w-[760px] sm:w-full sm:min-w-0 sm:max-w-[850px]">
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

        {/* Ledger direct download */}
        {downloadTarget && (
          <PDFDirectDownload
            document={downloadTarget.document}
            fileName={downloadTarget.fileName}
            onDone={() => setDownloadTarget(null)}
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
          <button onClick={() => setDownloadTarget({ document: <LedgerPDF customer={selectedCustomer!} entries={entries} businessName={businessName} businessInfo={businessInfo} statementDate={new Date().toLocaleDateString('en-IN')} />, fileName: `Ledger-Statement-${selectedCustomer!.name.replace(/\s+/g, '-')}.pdf` })} className="bg-profee-blue text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-3 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"><Download size={18} /> Download PDF</button>
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
            <tbody className="text-xs font-medium divide-y divide-slate-50">{runningEntries.map((item, idx) => {
              const isPayment = item.type === 'Credit' && !item.creditNoteId;
              return (
                <tr
                  key={idx}
                  onClick={() => { if (isPayment) setReceiptModal({ open: true, entry: item }); }}
                  className={`transition-colors ${isPayment ? 'cursor-pointer hover:bg-emerald-50/50' : 'hover:bg-slate-50'}`}
                >
                  <td className="px-6 py-6 text-slate-400">{item.date}</td>
                  <td className="px-6 py-6 text-slate-500">
                    <div className="flex items-center gap-2">
                      {isPayment && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full whitespace-nowrap">
                          <Receipt size={10} /> Receipt
                        </span>
                      )}
                      {item.description}
                    </div>
                  </td>
                  <td className="px-6 py-6 text-center font-bold text-rose-500">{item.type === 'Debit' ? `₹${item.amount.toLocaleString('en-IN')}` : '-'}</td>
                  <td className="px-6 py-6 text-center font-bold text-emerald-500">{item.type === 'Credit' ? `₹${item.amount.toLocaleString('en-IN')}` : '-'}</td>
                  <td className="px-6 py-6 text-right font-bold text-rose-500">₹{Math.abs(item.runningBalance).toLocaleString('en-IN')} {item.runningBalance >= 0 ? 'Dr' : 'Cr'}</td>
                </tr>
              );
            })}</tbody></table>
          </div>
        )}

        <div className="mt-12 bg-slate-50 rounded-[2.5rem] p-12 grid grid-cols-1 md:grid-cols-3 gap-8 font-poppins">
           <div className="text-center space-y-2"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Sales</p><p className="text-3xl font-bold text-rose-500">₹{totalDebit.toLocaleString('en-IN')}</p></div>
           <div className="text-center space-y-2 border-x border-slate-200"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Collections</p><p className="text-3xl font-bold text-emerald-500">₹{totalCredit.toLocaleString('en-IN')}</p></div>
           <div className="text-center space-y-2"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Outstanding Due</p><p className="text-3xl font-bold text-rose-500">₹{Math.abs(closingBalance).toLocaleString('en-IN')}</p></div>
        </div>
      </div>


      {/* Receipt detail modal */}
      {receiptModal.open && receiptModal.entry && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl font-poppins animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <Receipt size={18} className="text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Payment Receipt</h3>
              </div>
              <button onClick={() => setReceiptModal({ open: false, entry: null })} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="space-y-5">
              <div className="bg-slate-50 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Date</span>
                  <span className="text-sm font-bold text-slate-700">{receiptModal.entry.date}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Customer</span>
                  <span className="text-sm font-bold text-slate-700">{selectedCustomer.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Description</span>
                  <span className="text-sm font-bold text-slate-700">{receiptModal.entry.description}</span>
                </div>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-6 flex justify-between items-center border border-emerald-100">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Amount Received</span>
                <span className="text-2xl font-bold text-emerald-600">₹{receiptModal.entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="bg-slate-900 rounded-2xl p-6 flex justify-between items-center text-white">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Balance After</span>
                <span className="text-lg font-bold">
                  ₹{Math.abs(receiptModal.entry.runningBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  <span className="text-[10px] opacity-50 ml-1">{receiptModal.entry.runningBalance >= 0 ? 'Dr' : 'Cr'}</span>
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-8">
              <button
                onClick={() => {
                  const entry = receiptModal.entry!;
                  setReceiptModal({ open: false, entry: null });
                  setReceiptInlinePreview({ open: true, entry });
                }}
                className="py-4 rounded-2xl font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Eye size={15} /> View
              </button>
              <button
                onClick={() => { if (receiptModal.entry && selectedCustomer) handleReceiptWhatsApp(receiptModal.entry, selectedCustomer); }}
                disabled={receiptWaLoading}
                className="py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 text-sm transition-all disabled:opacity-60"
                style={{ backgroundColor: '#25D366' }}
              >
                {receiptWaLoading
                  ? <Loader2 size={15} className="animate-spin" />
                  : <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                }
                WA
              </button>
              <button
                onClick={() => {
                  const entry = receiptModal.entry!;
                  setReceiptModal({ open: false, entry: null });
                  setDownloadTarget({
                    document: <ReceiptPDF entry={entry} customer={selectedCustomer!} businessName={businessName} businessInfo={businessInfo} logoUrl={logoUrl} />,
                    fileName: `Receipt-${selectedCustomer!.name.replace(/\s+/g, '-')}-${entry.date}.pdf`,
                  });
                }}
                className="py-4 rounded-2xl font-bold bg-profee-blue text-white hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Download size={15} /> Download
              </button>
              <button
                onClick={() => setReceiptModal({ open: false, entry: null })}
                className="py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all border border-slate-100 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline receipt preview (no PDF viewer — rendered as HTML card) */}
      {receiptInlinePreview.open && receiptInlinePreview.entry && selectedCustomer && (() => {
        const e = receiptInlinePreview.entry;
        const drCr = e.runningBalance >= 0 ? 'Dr' : 'Cr';
        const receiptId = `RCP-${(e.id ?? Date.now().toString()).slice(-6).toUpperCase()}`;
        const fmtDate = (d: string) => { const p = d.split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; };
        return (
          <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
            {/* toolbar */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 shrink-0" style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(76,45,224,0.2)' }}>
                  <Receipt size={16} style={{ color: '#4c2de0' }} />
                </div>
                <div>
                  <p className="font-bold text-sm font-poppins truncate max-w-[180px] sm:max-w-xs" style={{ color: '#f1f5f9' }}>Payment Receipt</p>
                  <p className="text-[10px] font-medium" style={{ color: '#64748b' }}>{receiptId} · {fmtDate(e.date)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (selectedCustomer) handleReceiptWhatsApp(e, selectedCustomer); }}
                  disabled={receiptWaLoading}
                  className="flex items-center gap-2 font-bold text-sm px-3 sm:px-4 py-2.5 rounded-xl transition-all font-poppins disabled:opacity-60"
                  style={{ backgroundColor: '#25D366', color: '#fff' }}
                >
                  {receiptWaLoading
                    ? <Loader2 size={15} className="animate-spin" />
                    : <svg width={15} height={15} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                  }
                  <span className="hidden sm:inline">Share</span>
                </button>
                <a
                  href="#"
                  onClick={e2 => {
                    e2.preventDefault();
                    setReceiptInlinePreview({ open: false, entry: null });
                    setDownloadTarget({
                      document: <ReceiptPDF entry={e} customer={selectedCustomer!} businessName={businessName} businessInfo={businessInfo} logoUrl={logoUrl} />,
                      fileName: `Receipt-${selectedCustomer!.name.replace(/\s+/g, '-')}-${e.date}.pdf`,
                    });
                  }}
                  className="flex items-center gap-2 font-bold text-sm px-3 sm:px-5 py-2.5 rounded-xl transition-all font-poppins"
                  style={{ backgroundColor: '#4c2de0', color: '#fff', textDecoration: 'none' }}
                >
                  <Download size={15} />
                  <span className="hidden sm:inline">Download PDF</span>
                  <span className="sm:hidden">PDF</span>
                </a>
                <button
                  onClick={() => setReceiptInlinePreview({ open: false, entry: null })}
                  className="p-2 rounded-xl transition-all"
                  style={{ color: '#94a3b8' }}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* receipt card */}
            <div className="flex-1 overflow-y-auto py-8 px-4" style={{ backgroundColor: '#475569' }}>
              <div className="bg-white rounded-[2rem] p-8 sm:p-12 w-full max-w-2xl mx-auto shadow-2xl font-poppins space-y-6">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-slate-100 pb-6">
                  <div className="flex items-center gap-3">
                    {logoUrl
                      ? <img src={logoUrl} alt={businessName} className="w-14 h-14 rounded-xl object-contain border border-slate-100" />
                      : <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-black text-white" style={{ backgroundColor: '#4c2de0' }}>{businessName.charAt(0).toUpperCase()}</div>
                    }
                    <div>
                      <p className="text-base font-black text-slate-800">{businessName}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 max-w-[200px]">{businessInfo.address}</p>
                      {businessInfo.gstin && <p className="text-[10px] font-bold mt-0.5" style={{ color: '#4c2de0' }}>GSTIN: {businessInfo.gstin}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-black text-slate-800 uppercase tracking-tight">Payment Receipt</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-widest">Receipt ID</p>
                    <p className="text-sm font-black" style={{ color: '#4c2de0' }}>{receiptId}</p>
                    <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-widest">Date</p>
                    <p className="text-sm font-black text-slate-700">{fmtDate(e.date)}</p>
                  </div>
                </div>

                {/* From / To */}
                <div className="flex justify-between items-start bg-slate-50 rounded-2xl p-5 border border-slate-100">
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">From (Supplier)</p>
                    <p className="text-sm font-black text-slate-800">{businessName}</p>
                    {businessInfo.gstin && <p className="text-[10px] font-bold mt-0.5" style={{ color: '#4c2de0' }}>GSTIN: {businessInfo.gstin}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Received From</p>
                    <p className="text-sm font-black text-slate-800">{selectedCustomer.name}</p>
                    {selectedCustomer.city && <p className="text-[10px] text-slate-500 mt-0.5">{selectedCustomer.city}, {selectedCustomer.state}</p>}
                    {selectedCustomer.phone && <p className="text-[10px] text-slate-500">Ph: {selectedCustomer.phone}</p>}
                  </div>
                </div>

                {/* Description / Date */}
                <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-3">
                  <div className="flex justify-between items-center border-b border-slate-200 pb-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Description / Narration</span>
                    <span className="text-sm font-bold text-slate-700">{e.description}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Payment Date</span>
                    <span className="text-sm font-bold text-slate-700">{fmtDate(e.date)}</span>
                  </div>
                </div>

                {/* Amount received */}
                <div className="flex justify-between items-center rounded-2xl p-5 border border-emerald-200" style={{ backgroundColor: '#f0fdf4' }}>
                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#16a34a' }}>Amount Received</span>
                  <span className="text-2xl font-black" style={{ color: '#16a34a' }}>₹{e.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>

                {/* Balance after */}
                <div className="flex justify-between items-center bg-slate-900 rounded-2xl p-5">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Outstanding Balance After Payment</span>
                  <span className="text-lg font-black text-white">
                    ₹{Math.abs(e.runningBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    <span className="text-[10px] text-slate-400 ml-1">{drCr}</span>
                  </span>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                  <p className="text-[9px] text-slate-300 font-medium">Generated by BillHippo</p>
                  <p className="text-[9px] text-slate-300 font-medium">This is a computer-generated receipt</p>
                </div>
              </div>
            </div>

            {/* bottom hint */}
            <div className="shrink-0 px-6 py-2 flex items-center justify-between" style={{ backgroundColor: '#0f172a', borderTop: '1px solid #334155' }}>
              <p className="text-[10px] font-medium font-poppins" style={{ color: '#475569' }}>
                <strong style={{ color: '#25D366' }}>Share</strong> to WhatsApp · <strong style={{ color: '#94a3b8' }}>Download PDF</strong> to save
              </p>
              <p className="text-[10px] font-medium font-poppins" style={{ color: '#334155' }}>Powered by BillHippo</p>
            </div>
          </div>
        );
      })()}

      {/* Headless PDF direct-download (no modal shown) */}
      {downloadTarget && (
        <PDFDirectDownload
          document={downloadTarget.document}
          fileName={downloadTarget.fileName}
          onDone={() => setDownloadTarget(null)}
        />
      )}
    </div>
  );
};

export default LedgerView;
