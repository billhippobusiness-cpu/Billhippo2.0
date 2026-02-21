
import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, Edit3, Trash2, X, Save, UserCircle, Phone, Mail,
  MapPin, Loader2, Users, ChevronLeft, FileText, IndianRupee, Receipt,
} from 'lucide-react';
import { Customer, LedgerEntry, Invoice, BusinessProfile } from '../types';
import {
  getCustomers, addCustomer, updateCustomer, deleteCustomer,
  getLedgerEntries, getInvoices, getBusinessProfile,
} from '../lib/firestore';
import PDFPreviewModal from './pdf/PDFPreviewModal';
import InvoicePDF from './pdf/InvoicePDF';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry"
];

interface CustomerManagerProps { userId: string; }

const EMPTY_FORM = {
  name: '', gstin: '', phone: '', email: '',
  address: '', city: '', state: 'Maharashtra', pincode: '', balance: 0
};

const CustomerManager: React.FC<CustomerManagerProps> = ({ userId }) => {
  // ── Customer list state ──
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Ledger / detail state ──
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [invoicesMap, setInvoicesMap] = useState<Record<string, Invoice>>({});
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);

  // ── PDF / receipt modal state ──
  const [pdfModal, setPdfModal] = useState<{ open: boolean; invoice: Invoice | null }>({ open: false, invoice: null });
  const [receiptModal, setReceiptModal] = useState<{ open: boolean; entry: (LedgerEntry & { runningBalance: number }) | null }>({ open: false, entry: null });

  useEffect(() => {
    loadCustomers();
    loadBusinessProfile();
  }, [userId]);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await getCustomers(userId);
      setCustomers(data);
    } catch (err: any) {
      setError('Failed to load customers.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadBusinessProfile = async () => {
    try {
      const profile = await getBusinessProfile(userId);
      setBusinessProfile(profile);
    } catch (err) { console.error(err); }
  };

  // ── Customer CRUD ──
  const handleSave = async () => {
    if (!formData.name.trim()) { setError('Customer name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateCustomer(userId, editingId, formData);
      } else {
        await addCustomer(userId, formData);
      }
      await loadCustomers();
      resetForm();
    } catch (err: any) {
      setError('Failed to save customer.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this customer? This cannot be undone.')) return;
    try {
      await deleteCustomer(userId, id);
      await loadCustomers();
    } catch (err: any) {
      setError('Failed to delete customer.');
      console.error(err);
    }
  };

  const handleEdit = (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(customer.id);
    setFormData({
      name: customer.name,
      gstin: customer.gstin || '',
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      pincode: customer.pincode,
      balance: customer.balance,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setError(null);
  };

  // ── Open customer ledger ──
  const handleSelectCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setLoadingLedger(true);
    try {
      const [entries, allInvoices] = await Promise.all([
        getLedgerEntries(userId, customer.id),
        getInvoices(userId),
      ]);
      setLedgerEntries(entries);
      const map: Record<string, Invoice> = {};
      allInvoices.forEach(inv => { map[inv.id] = inv; });
      setInvoicesMap(map);
    } catch (err) { console.error(err); }
    finally { setLoadingLedger(false); }
  };

  const handleBack = () => {
    setSelectedCustomer(null);
    setLedgerEntries([]);
    setInvoicesMap({});
    setPdfModal({ open: false, invoice: null });
    setReceiptModal({ open: false, entry: null });
  };

  // ── Running balance ──
  const runningEntries = useMemo(() => {
    let balance = 0;
    return ledgerEntries.map(e => {
      balance += e.type === 'Debit' ? e.amount : -e.amount;
      return { ...e, runningBalance: balance };
    });
  }, [ledgerEntries]);

  const totalDebit = ledgerEntries.filter(e => e.type === 'Debit').reduce((s, e) => s + e.amount, 0);
  const totalCredit = ledgerEntries.filter(e => e.type === 'Credit').reduce((s, e) => s + e.amount, 0);
  const closingBalance = totalDebit - totalCredit;

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.city.toLowerCase().includes(search.toLowerCase()) ||
    (c.gstin && c.gstin.toLowerCase().includes(search.toLowerCase()))
  );

  // ── Loading screen ──
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-profee-blue mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400 font-poppins">Loading customers...</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  //  LEDGER VIEW — shown when a customer is selected
  // ══════════════════════════════════════════════════════
  if (selectedCustomer) {
    return (
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-profee-blue font-bold text-sm hover:underline font-poppins"
          >
            <ChevronLeft size={16} /> All Customers
          </button>
          <button
            onClick={e => handleEdit(selectedCustomer, e)}
            className="flex items-center gap-2 bg-white border border-slate-100 px-5 py-2.5 rounded-2xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm font-poppins"
          >
            <Edit3 size={15} className="text-profee-blue" /> Edit Profile
          </button>
        </div>

        {/* Customer card */}
        <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50">
          <div className="flex items-center gap-6 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-profee-blue/10 text-profee-blue flex items-center justify-center font-bold font-poppins text-2xl">
              {selectedCustomer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-2xl font-bold font-poppins text-slate-900">{selectedCustomer.name}</h2>
              {selectedCustomer.gstin && (
                <p className="text-[10px] font-bold text-profee-blue uppercase tracking-widest mt-1">GSTIN: {selectedCustomer.gstin}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-2 text-xs font-medium text-slate-400">
                {selectedCustomer.phone && <span className="flex items-center gap-1"><Phone size={11} />{selectedCustomer.phone}</span>}
                {selectedCustomer.email && <span className="flex items-center gap-1"><Mail size={11} />{selectedCustomer.email}</span>}
                {selectedCustomer.city && <span className="flex items-center gap-1"><MapPin size={11} />{selectedCustomer.city}, {selectedCustomer.state}</span>}
              </div>
            </div>
            <div className="ml-auto text-right">
              <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Outstanding</p>
              <p className={`text-2xl font-bold font-poppins ${closingBalance > 0 ? 'text-rose-500' : closingBalance < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                {closingBalance === 0 ? 'Settled' : `₹${Math.abs(closingBalance).toLocaleString('en-IN')}`}
              </p>
            </div>
          </div>
        </div>

        {/* Ledger table */}
        <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 min-h-[400px]">
          <h3 className="text-xl font-bold font-poppins text-slate-900 mb-8">Account Ledger</h3>

          {loadingLedger ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-7 h-7 animate-spin text-profee-blue" />
            </div>
          ) : ledgerEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <FileText className="text-slate-200" size={40} />
              <p className="text-sm font-bold font-poppins text-slate-300">No ledger entries yet. Create an invoice for this customer.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-poppins">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                    <th className="px-6 py-4 rounded-tl-2xl">Date</th>
                    <th className="px-6 py-4">Type</th>
                    <th className="px-6 py-4">Description</th>
                    <th className="px-6 py-4 text-right">Debit (₹)</th>
                    <th className="px-6 py-4 text-right">Credit (₹)</th>
                    <th className="px-6 py-4 text-right rounded-tr-2xl">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {runningEntries.map((entry, idx) => {
                    const isInvoice = entry.type === 'Debit' && !!entry.invoiceId;
                    const isPayment = entry.type === 'Credit';

                    return (
                      <tr
                        key={idx}
                        onClick={() => {
                          if (isInvoice && entry.invoiceId) {
                            const inv = invoicesMap[entry.invoiceId];
                            if (inv) setPdfModal({ open: true, invoice: inv });
                          } else if (isPayment) {
                            setReceiptModal({ open: true, entry });
                          }
                        }}
                        className={`transition-colors text-xs font-medium ${(isInvoice || isPayment) ? 'cursor-pointer hover:bg-indigo-50/50' : ''}`}
                      >
                        <td className="px-6 py-5 text-slate-400 whitespace-nowrap">{entry.date}</td>
                        <td className="px-6 py-5">
                          {isInvoice ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-profee-blue text-[10px] font-bold rounded-full">
                              <FileText size={10} /> Invoice
                            </span>
                          ) : isPayment ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full">
                              <Receipt size={10} /> Receipt
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-400 text-[10px] font-bold rounded-full">
                              <IndianRupee size={10} /> Entry
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-slate-600 max-w-[200px] truncate">{entry.description}</td>
                        <td className="px-6 py-5 text-right font-bold text-rose-500">
                          {entry.type === 'Debit' ? `₹${entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="px-6 py-5 text-right font-bold text-emerald-500">
                          {entry.type === 'Credit' ? `₹${entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="px-6 py-5 text-right font-bold text-slate-900">
                          ₹{Math.abs(entry.runningBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          <span className="text-[9px] text-slate-400 ml-1">{entry.runningBalance >= 0 ? 'Dr' : 'Cr'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary footer */}
          {ledgerEntries.length > 0 && (
            <div className="mt-10 grid grid-cols-3 gap-6 font-poppins">
              <div className="bg-rose-50 rounded-2xl p-6 text-center border border-rose-100/50">
                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-2">Total Sales (Dr)</p>
                <p className="text-2xl font-bold text-rose-600">₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-6 text-center border border-emerald-100/50">
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Collections (Cr)</p>
                <p className="text-2xl font-bold text-emerald-600">₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-slate-900 rounded-2xl p-6 text-center text-white shadow-xl">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Closing Balance</p>
                <p className="text-2xl font-bold">
                  ₹{Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  <span className="text-[10px] opacity-50 ml-1">{closingBalance >= 0 ? 'Dr' : 'Cr'}</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Edit form (reused modal, triggered from Edit Profile button) */}
        {showForm && (
          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
                <UserCircle className="text-profee-blue" size={22} />
                Edit Customer
              </h3>
              <button onClick={resetForm} className="p-2 hover:bg-slate-50 rounded-xl transition-all"><X size={20} className="text-slate-400" /></button>
            </div>
            {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm font-bold text-rose-600 font-poppins">{error}</div>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-poppins">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Customer Name *</label>
                <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                  value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Business or person name" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">GSTIN</label>
                <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                  value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value})} placeholder="Optional" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Phone</label>
                <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                  value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+91 98765 43210" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Email</label>
                <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                  value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="customer@email.com" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Address</label>
                <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                  value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Street address" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">City</label>
                <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                  value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} placeholder="City" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Pincode</label>
                <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                  value={formData.pincode} onChange={e => setFormData({...formData, pincode: e.target.value})} placeholder="400001" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">State</label>
                <select className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 appearance-none focus:ring-2 ring-indigo-50"
                  value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})}>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-4">
              <button onClick={resetForm} className="px-8 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all font-poppins">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="bg-profee-blue text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 transition-all font-poppins disabled:opacity-50">
                {saving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Save size={18} /> Update Customer</>}
              </button>
            </div>
          </div>
        )}

        {/* Invoice PDF Modal */}
        {pdfModal.open && pdfModal.invoice && businessProfile && (
          <PDFPreviewModal
            open={pdfModal.open}
            onClose={() => setPdfModal({ open: false, invoice: null })}
            document={
              <InvoicePDF
                invoice={pdfModal.invoice}
                business={businessProfile}
                customer={selectedCustomer}
              />
            }
            fileName={`Invoice-${pdfModal.invoice.invoiceNumber}.pdf`}
          />
        )}

        {/* Receipt detail modal */}
        {receiptModal.open && receiptModal.entry && (
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</span>
                    <span className="text-sm font-bold text-slate-700">{receiptModal.entry.date}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer</span>
                    <span className="text-sm font-bold text-slate-700">{selectedCustomer.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description</span>
                    <span className="text-sm font-bold text-slate-700">{receiptModal.entry.description}</span>
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-6 flex justify-between items-center border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Amount Received</span>
                  <span className="text-2xl font-bold text-emerald-600">₹{receiptModal.entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="bg-slate-900 rounded-2xl p-6 flex justify-between items-center text-white">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Balance After</span>
                  <span className="text-lg font-bold">
                    ₹{Math.abs(receiptModal.entry.runningBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    <span className="text-[10px] opacity-50 ml-1">{receiptModal.entry.runningBalance >= 0 ? 'Dr' : 'Cr'}</span>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setReceiptModal({ open: false, entry: null })}
                className="w-full mt-8 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all border border-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  //  CUSTOMER LIST VIEW
  // ══════════════════════════════════════════════════════
  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 pb-20">
      <div className="flex justify-between items-end mb-2">
        <div>
          <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Customers</h1>
          <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">{customers.length} parties registered</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-profee-blue text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95 transition-all font-poppins"
        >
          <Plus size={20} /> Add Customer
        </button>
      </div>

      {error && !showForm && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm font-bold text-rose-600 font-poppins">{error}</div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
        <input
          className="w-full bg-white border border-slate-100 rounded-2xl pl-14 pr-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50 shadow-sm font-poppins"
          placeholder="Search by name, city, or GSTIN..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
              <UserCircle className="text-profee-blue" size={22} />
              {editingId ? 'Edit Customer' : 'New Customer'}
            </h3>
            <button onClick={resetForm} className="p-2 hover:bg-slate-50 rounded-xl transition-all"><X size={20} className="text-slate-400" /></button>
          </div>

          {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm font-bold text-rose-600 font-poppins">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-poppins">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Customer Name *</label>
              <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Business or person name" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">GSTIN</label>
              <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value})} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Phone</label>
              <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="+91 98765 43210" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Email</label>
              <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="customer@email.com" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Address</label>
              <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Street address" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">City</label>
              <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} placeholder="City" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Pincode</label>
              <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
                value={formData.pincode} onChange={e => setFormData({...formData, pincode: e.target.value})} placeholder="400001" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">State</label>
              <select className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 appearance-none focus:ring-2 ring-indigo-50"
                value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})}>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-4">
            <button onClick={resetForm} className="px-8 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all font-poppins">Cancel</button>
            <button onClick={handleSave} disabled={saving}
              className="bg-profee-blue text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 transition-all font-poppins disabled:opacity-50">
              {saving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Save size={18} /> {editingId ? 'Update' : 'Add Customer'}</>}
            </button>
          </div>
        </div>
      )}

      {/* Horizontal Customer List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] p-20 premium-shadow border border-slate-50 text-center">
          <Users className="mx-auto text-slate-200 mb-4" size={48} />
          <h3 className="text-xl font-bold font-poppins text-slate-400">
            {customers.length === 0 ? 'No customers yet' : 'No results found'}
          </h3>
          <p className="text-sm text-slate-300 font-poppins mt-2">
            {customers.length === 0 ? 'Add your first customer to get started.' : 'Try a different search term.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(customer => (
            <div
              key={customer.id}
              onClick={() => handleSelectCustomer(customer)}
              className="bg-white rounded-[2rem] px-8 py-6 premium-shadow border border-slate-50 hover:border-indigo-100 transition-all cursor-pointer flex items-center gap-6 group"
            >
              {/* Avatar */}
              <div className="w-12 h-12 rounded-2xl bg-profee-blue/10 text-profee-blue flex items-center justify-center font-bold font-poppins text-lg shrink-0">
                {customer.name.charAt(0).toUpperCase()}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-base font-bold font-poppins text-slate-900 truncate">{customer.name}</h4>
                <div className="flex flex-wrap gap-4 mt-1 text-xs font-medium text-slate-400">
                  {customer.gstin && <span className="text-profee-blue font-bold">GSTIN: {customer.gstin}</span>}
                  {customer.phone && <span className="flex items-center gap-1"><Phone size={11} />{customer.phone}</span>}
                  {customer.email && <span className="flex items-center gap-1 hidden sm:flex"><Mail size={11} />{customer.email}</span>}
                  {customer.city && <span className="flex items-center gap-1"><MapPin size={11} />{customer.city}, {customer.state}</span>}
                </div>
              </div>

              {/* Balance */}
              <div className="text-right shrink-0">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Balance</p>
                <p className={`text-lg font-bold font-poppins ${customer.balance > 0 ? 'text-rose-500' : customer.balance < 0 ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {customer.balance === 0 ? 'Settled' : `₹${Math.abs(customer.balance).toLocaleString('en-IN')}`}
                </p>
              </div>

              {/* Edit icon */}
              <button
                onClick={e => handleEdit(customer, e)}
                className="p-2.5 hover:bg-indigo-50 rounded-xl transition-all shrink-0"
                title="Edit customer"
              >
                <Edit3 size={16} className="text-profee-blue" />
              </button>

              {/* Delete icon */}
              <button
                onClick={e => { e.stopPropagation(); handleDelete(customer.id); }}
                className="p-2.5 hover:bg-rose-50 rounded-xl transition-all shrink-0"
                title="Delete customer"
              >
                <Trash2 size={16} className="text-rose-400" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomerManager;
