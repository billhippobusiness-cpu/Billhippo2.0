/**
 * CreditDebitNotes — GST-compliant Credit Note & Debit Note manager
 *
 * Accounting Rules (Section 34, CGST Act 2017):
 *   Credit Note — Issued when reducing the amount a customer owes.
 *     Use cases: Goods returned, price reduction, post-sale discount, quality defect.
 *     Ledger effect: CREDIT entry → reduces customer outstanding balance.
 *     GST effect: Reduces supplier's output tax liability.
 *
 *   Debit Note — Issued when increasing the amount a customer owes.
 *     Use cases: Additional charges, upward price revision, interest on overdue.
 *     Ledger effect: DEBIT entry → increases customer outstanding balance.
 *     GST effect: Increases supplier's output tax liability.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus, Trash2, ChevronDown, Eye, Save, Loader2, FileText,
  ArrowLeft, Download, Pencil, Search, X, CheckCircle, Info,
  TrendingDown, TrendingUp, FileCheck2, Package,
} from 'lucide-react';
import {
  GSTType, CreditDebitNoteItem, CreditNote, DebitNote, Customer, BusinessProfile, InventoryItem,
} from '../types';
import {
  getCustomers, getBusinessProfile,
  getCreditNotes, addCreditNote, updateCreditNote,
  getDebitNotes, addDebitNote, updateDebitNote,
  addLedgerEntry, updateCustomer, getInventoryItems,
} from '../lib/firestore';
import PDFPreviewModal from './pdf/PDFPreviewModal';
import CreditDebitNotePDF from './pdf/CreditDebitNotePDF';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (d: string) => {
  if (!d) return '';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
};

const currentYear = new Date().getFullYear();

const DEFAULT_PROFILE: BusinessProfile = {
  name: 'Your Business', gstin: '', address: '', city: '', state: 'Maharashtra', pincode: '',
  phone: '', email: '', pan: '', gstEnabled: true,
  theme: { templateId: 'modern-2', primaryColor: '#4c2de0', fontFamily: 'Poppins, sans-serif', invoicePrefix: `INV/${currentYear}/`, autoNumbering: true },
};

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Jammu and Kashmir','Ladakh','Puducherry','Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu','Lakshadweep','Andaman and Nicobar Islands',
];

// ─── Component ───────────────────────────────────────────────────────────────
interface CreditDebitNotesProps { userId: string; }

type NoteMode = 'list' | 'editing' | 'preview';
type NoteTab = 'credit' | 'debit';

const CreditDebitNotes: React.FC<CreditDebitNotesProps> = ({ userId }) => {
  // Tab & mode
  const [activeTab, setActiveTab] = useState<NoteTab>('credit');
  const [mode, setMode] = useState<NoteMode>('list');

  // Data
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [debitNotes, setDebitNotes] = useState<DebitNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [editingNote, setEditingNote] = useState<CreditNote | DebitNote | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [noteNumber, setNoteNumber] = useState('');
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0]);
  const [originalInvoiceNumber, setOriginalInvoiceNumber] = useState('');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<CreditDebitNoteItem[]>([
    { id: '1', description: '', hsnCode: '', quantity: 1, rate: 0, gstRate: 18 },
  ]);

  // Customer dropdown
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  // Inventory picker
  const [showInventoryPicker, setShowInventoryPicker] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryLoaded, setInventoryLoaded] = useState(false);

  // PDF modal
  const [pdfModal, setPdfModal] = useState<{
    open: boolean;
    note: CreditNote | DebitNote | null;
    noteType: NoteTab;
    customer: Customer | null;
  }>({ open: false, note: null, noteType: 'credit', customer: null });

  useEffect(() => { loadData(); }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [profileData, customerData, cnData, dnData] = await Promise.all([
        getBusinessProfile(userId),
        getCustomers(userId),
        getCreditNotes(userId),
        getDebitNotes(userId),
      ]);
      if (profileData) setProfile(profileData);
      setCustomers(customerData);
      setCreditNotes(cnData);
      setDebitNotes(dnData);

      // Auto-number for new note
      const cnCount = cnData.length + 1;
      const dnCount = dnData.length + 1;
      setNoteNumber(
        activeTab === 'credit'
          ? `CN/${currentYear}/${String(cnCount).padStart(3, '0')}`
          : `DN/${currentYear}/${String(dnCount).padStart(3, '0')}`
      );
    } catch {
      setError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  // Recalculate auto-number when tab changes (for new notes)
  useEffect(() => {
    if (!editingNote) {
      const count = activeTab === 'credit' ? creditNotes.length + 1 : debitNotes.length + 1;
      const prefix = activeTab === 'credit' ? 'CN' : 'DN';
      setNoteNumber(`${prefix}/${currentYear}/${String(count).padStart(3, '0')}`);
    }
  }, [activeTab, creditNotes.length, debitNotes.length, editingNote]);

  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === selectedCustomerId),
    [selectedCustomerId, customers]
  );

  const gstType = useMemo(() => {
    if (!selectedCustomer) return GSTType.CGST_SGST;
    return selectedCustomer.state === profile.state ? GSTType.CGST_SGST : GSTType.IGST;
  }, [selectedCustomer, profile.state]);

  const subTotal = items.reduce((s, i) => s + i.quantity * i.rate, 0);
  const taxAmount = items.reduce((s, i) => s + i.quantity * i.rate * i.gstRate / 100, 0);
  const grandTotal = subTotal + taxAmount;

  // ── Item handlers ──
  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      { id: Math.random().toString(36).substr(2, 9), description: '', hsnCode: '', quantity: 1, rate: 0, gstRate: 18 },
    ]);
  };
  const handleRemoveItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));
  const handleItemChange = (id: string, field: keyof CreditDebitNoteItem, value: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  // ── Inventory picker ──
  const openInventoryPicker = async () => {
    if (!inventoryLoaded) {
      const data = await getInventoryItems(userId);
      setInventoryItems(data);
      setInventoryLoaded(true);
    }
    setInventorySearch('');
    setShowInventoryPicker(true);
  };

  const handlePickInventoryItem = (item: InventoryItem) => {
    const firstEmpty = items.find(i => !i.description.trim());
    const newLineItem: CreditDebitNoteItem = {
      id: firstEmpty?.id || Math.random().toString(36).substr(2, 9),
      description: item.name,
      hsnCode: item.hsnCode,
      quantity: 1,
      rate: item.sellingPrice,
      gstRate: item.gstRate,
    };
    if (firstEmpty) {
      setItems(prev => prev.map(i => i.id === firstEmpty.id ? newLineItem : i));
    } else {
      setItems(prev => [...prev, newLineItem]);
    }
    setShowInventoryPicker(false);
  };

  // ── Edit note ──
  const handleEditNote = (note: CreditNote | DebitNote, type: NoteTab) => {
    setActiveTab(type);
    setEditingNote(note);
    setSelectedCustomerId(note.customerId);
    setNoteNumber(note.noteNumber);
    setNoteDate(note.date);
    setOriginalInvoiceNumber(note.originalInvoiceNumber || '');
    setReason(note.reason);
    setItems(note.items);
    setError(null);
    setSaveSuccess(false);
    setMode('editing');
  };

  // ── New note ──
  const handleNewNote = (tab?: NoteTab) => {
    const t = tab || activeTab;
    setActiveTab(t);
    setEditingNote(null);
    setSelectedCustomerId('');
    const count = (t === 'credit' ? creditNotes.length : debitNotes.length) + 1;
    const prefix = t === 'credit' ? 'CN' : 'DN';
    setNoteNumber(`${prefix}/${currentYear}/${String(count).padStart(3, '0')}`);
    setNoteDate(new Date().toISOString().split('T')[0]);
    setOriginalInvoiceNumber('');
    setReason('');
    setItems([{ id: '1', description: '', hsnCode: '', quantity: 1, rate: 0, gstRate: 18 }]);
    setError(null);
    setSaveSuccess(false);
    setMode('editing');
  };

  // ── Save / update note ──
  const handleSave = async () => {
    if (!selectedCustomerId) { setError('Please select a customer'); return; }
    if (items.every(i => !i.description.trim())) { setError('Add at least one item with a description'); return; }
    if (subTotal === 0) { setError('Total cannot be zero'); return; }
    if (!reason.trim()) { setError('Please provide a reason for this note'); return; }

    setSaving(true); setError(null);
    try {
      const cgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
      const sgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
      const igst = gstType === GSTType.IGST ? taxAmount : 0;

      const payload = {
        noteNumber, date: noteDate, customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '',
        ...(originalInvoiceNumber.trim() ? { originalInvoiceNumber: originalInvoiceNumber.trim() } : {}),
        reason: reason.trim(),
        items, gstType,
        totalBeforeTax: subTotal, cgst, sgst, igst, totalAmount: grandTotal,
      };

      if (activeTab === 'credit') {
        if (editingNote) {
          await updateCreditNote(userId, editingNote.id, payload);
          setCreditNotes(prev => prev.map(n => n.id === editingNote.id ? { ...n, ...payload } : n));
        } else {
          const noteId = await addCreditNote(userId, payload as Omit<CreditNote, 'id'>);
          // Ledger: Credit entry → reduces customer balance
          await addLedgerEntry(userId, {
            date: noteDate, type: 'Credit', amount: grandTotal,
            description: `Credit Note - ${noteNumber}${originalInvoiceNumber ? ` (Ref: ${originalInvoiceNumber})` : ''}`,
            creditNoteId: noteId, customerId: selectedCustomerId,
          });
          if (selectedCustomer) {
            await updateCustomer(userId, selectedCustomerId, {
              balance: (selectedCustomer.balance || 0) - grandTotal,
            });
          }
          await loadData();
        }
      } else {
        if (editingNote) {
          await updateDebitNote(userId, editingNote.id, payload);
          setDebitNotes(prev => prev.map(n => n.id === editingNote.id ? { ...n, ...payload } : n));
        } else {
          const noteId = await addDebitNote(userId, payload as Omit<DebitNote, 'id'>);
          // Ledger: Debit entry → increases customer balance
          await addLedgerEntry(userId, {
            date: noteDate, type: 'Debit', amount: grandTotal,
            description: `Debit Note - ${noteNumber}${originalInvoiceNumber ? ` (Ref: ${originalInvoiceNumber})` : ''}`,
            debitNoteId: noteId, customerId: selectedCustomerId,
          });
          if (selectedCustomer) {
            await updateCustomer(userId, selectedCustomerId, {
              balance: (selectedCustomer.balance || 0) + grandTotal,
            });
          }
          await loadData();
        }
      }

      setSaveSuccess(true);
      setMode('preview');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Build current note for preview ──
  const buildCurrentNote = (): CreditNote | DebitNote => {
    const cgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
    const sgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
    const igst = gstType === GSTType.IGST ? taxAmount : 0;
    return {
      id: 'preview',
      noteNumber, date: noteDate, customerId: selectedCustomerId,
      customerName: selectedCustomer?.name || '',
      originalInvoiceNumber: originalInvoiceNumber || undefined,
      reason, items, gstType,
      totalBeforeTax: subTotal, cgst, sgst, igst, totalAmount: grandTotal,
    };
  };

  const openPDFModal = (note: CreditNote | DebitNote, type: NoteTab, cust: Customer | null) => {
    setPdfModal({ open: true, note, noteType: type, customer: cust });
  };

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-profee-blue mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400 font-poppins">Loading notes...</p>
        </div>
      </div>
    );
  }

  // ─── PREVIEW VIEW ──────────────────────────────────────────────────────────
  if (mode === 'preview') {
    const note = buildCurrentNote();
    const custObj = selectedCustomer || null;
    return (
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 font-poppins">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('list')} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors">
              <ArrowLeft size={18} /> All Notes
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <button onClick={() => setMode('editing')} className="flex items-center gap-2 text-profee-blue font-bold text-sm hover:underline">
              <Pencil size={18} /> Edit Note
            </button>
          </div>
          <div className="flex gap-4 items-center">
            {saveSuccess && (
              <div className="flex items-center gap-2 text-emerald-500 px-4">
                <CheckCircle size={18} />
                <span className="text-sm font-bold">Note Saved!</span>
              </div>
            )}
            <button
              onClick={() => openPDFModal(note, activeTab, custObj)}
              className="bg-profee-blue text-white px-10 py-4 rounded-2xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              <Download size={18} /> Download PDF
            </button>
          </div>
        </div>

        {/* Saved note detail card */}
        <div className={`bg-white rounded-[2.5rem] p-12 premium-shadow border-2 ${activeTab === 'credit' ? 'border-emerald-100' : 'border-amber-100'}`}>
          <div className="flex justify-between items-start mb-8">
            <div>
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm mb-4 ${activeTab === 'credit' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {activeTab === 'credit' ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                {activeTab === 'credit' ? 'Credit Note' : 'Debit Note'}
              </div>
              <h2 className="text-3xl font-bold text-slate-900">{noteNumber}</h2>
              <p className="text-sm text-slate-400 mt-1">{formatDate(noteDate)} · {selectedCustomer?.name}</p>
              {originalInvoiceNumber && (
                <p className="text-xs text-slate-400 mt-1">Ref. Invoice: {originalInvoiceNumber}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Total Amount</p>
              <p className={`text-4xl font-black ${activeTab === 'credit' ? 'text-emerald-600' : 'text-amber-600'}`}>
                {inr(grandTotal)}
              </p>
            </div>
          </div>
          <div className="bg-slate-50 rounded-2xl p-6 mb-6">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Reason</p>
            <p className="text-sm font-medium text-slate-700">{reason}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className={`text-white text-[10px] font-black uppercase tracking-widest ${activeTab === 'credit' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                  <th className="px-6 py-4 rounded-tl-xl">Description</th>
                  <th className="px-4 py-4 text-center">HSN</th>
                  <th className="px-4 py-4 text-center">Qty</th>
                  <th className="px-4 py-4 text-right">Rate</th>
                  <th className="px-4 py-4 text-center">GST%</th>
                  <th className="px-6 py-4 text-right rounded-tr-xl">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, idx) => (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className="px-6 py-4 text-sm font-medium text-slate-800">{item.description}</td>
                    <td className="px-4 py-4 text-sm text-slate-400 text-center">{item.hsnCode || '—'}</td>
                    <td className="px-4 py-4 text-sm font-bold text-slate-800 text-center">{item.quantity}</td>
                    <td className="px-4 py-4 text-sm text-slate-700 text-right">{inr(item.rate)}</td>
                    <td className="px-4 py-4 text-sm text-slate-400 text-center">{item.gstRate}%</td>
                    <td className="px-6 py-4 text-sm font-black text-slate-900 text-right">
                      {inr(item.quantity * item.rate * (1 + item.gstRate / 100))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex justify-end">
            <div className="space-y-2 w-64">
              <div className="flex justify-between text-sm font-bold text-slate-500">
                <span>Sub Total</span><span className="text-slate-900">{inr(subTotal)}</span>
              </div>
              {gstType === GSTType.CGST_SGST ? (
                <>
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>CGST</span><span>{inr(taxAmount / 2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>SGST</span><span>{inr(taxAmount / 2)}</span>
                  </div>
                </>
              ) : (
                <div className="flex justify-between text-sm text-slate-400">
                  <span>IGST</span><span>{inr(taxAmount)}</span>
                </div>
              )}
              <div className={`flex justify-between text-lg font-black pt-3 border-t-2 ${activeTab === 'credit' ? 'border-emerald-200 text-emerald-600' : 'border-amber-200 text-amber-600'}`}>
                <span>Total</span><span>{inr(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>

        {pdfModal.open && pdfModal.note && (
          <PDFPreviewModal
            open={pdfModal.open}
            onClose={() => setPdfModal({ open: false, note: null, noteType: 'credit', customer: null })}
            document={
              <CreditDebitNotePDF
                note={pdfModal.note}
                noteType={pdfModal.noteType}
                business={profile}
                customer={pdfModal.customer || { id: '', name: pdfModal.note.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 }}
              />
            }
            fileName={`${pdfModal.noteType === 'credit' ? 'Credit' : 'Debit'}-Note-${pdfModal.note.noteNumber.replace(/\//g, '-')}.pdf`}
          />
        )}
      </div>
    );
  }

  // ─── EDITING VIEW ──────────────────────────────────────────────────────────
  if (mode === 'editing') {
    const isCredit = activeTab === 'credit';
    const accentClass = isCredit ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-amber-500 hover:bg-amber-600';
    const accentText = isCredit ? 'text-emerald-600' : 'text-amber-600';
    const accentBorder = isCredit ? 'ring-emerald-50' : 'ring-amber-50';
    const accentBg = isCredit ? 'bg-emerald-50' : 'bg-amber-50';

    return (
      <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 pb-20">
        <div className="flex justify-between items-end mb-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('list')} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors font-poppins">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">
                {editingNote ? 'Edit' : 'New'} {isCredit ? 'Credit Note' : 'Debit Note'}
              </h1>
              <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest font-poppins">
                {editingNote ? `Editing ${editingNote.noteNumber}` : `New Note · ${noteNumber}`}
              </p>
            </div>
          </div>
          <div className="flex gap-4 items-center">
            {error && <span className="text-sm font-bold text-rose-500 font-poppins">{error}</span>}
            <button
              onClick={() => setMode('preview')}
              className="bg-white border border-slate-200 text-slate-700 px-10 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-slate-50 transition-all font-poppins"
            >
              <Eye size={20} /> Preview
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`text-white px-12 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl transition-all font-poppins disabled:opacity-50 ${accentClass}`}
            >
              {saving ? <><Loader2 size={20} className="animate-spin" /> Saving...</> :
               editingNote ? <><Save size={20} /> Update Note</> : <><Save size={20} /> Save Note</>}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">

            {/* Note details card */}
            <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8 font-poppins">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                {/* Customer */}
                <div className="space-y-3 relative">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Party / Customer *</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setShowCustomerDropdown(v => !v); setCustomerSearch(''); setError(null); }}
                      className={`w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ${accentBorder} flex items-center justify-between text-left`}
                    >
                      <span className={selectedCustomer ? 'text-slate-800' : 'text-slate-400'}>
                        {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.state})` : 'Select Customer…'}
                      </span>
                      <ChevronDown size={18} className="text-slate-300 flex-shrink-0" />
                    </button>
                    {showCustomerDropdown && (
                      <div className="absolute z-30 mt-2 w-full bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                        <div className="p-3 border-b border-slate-50">
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                              autoFocus type="text" placeholder="Search customers…"
                              value={customerSearch} onChange={e => setCustomerSearch(e.target.value)}
                              className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 rounded-xl border-none focus:ring-2 ring-indigo-50 font-medium"
                            />
                          </div>
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                          {customers
                            .filter(c =>
                              c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                              (c.state || '').toLowerCase().includes(customerSearch.toLowerCase())
                            )
                            .map(c => (
                              <button
                                key={c.id} type="button"
                                onClick={() => { setSelectedCustomerId(c.id); setShowCustomerDropdown(false); setCustomerSearch(''); setError(null); }}
                                className={`w-full flex items-center justify-between px-5 py-3 text-sm hover:bg-indigo-50 transition-colors text-left ${c.id === selectedCustomerId ? 'bg-indigo-50 text-profee-blue font-bold' : 'font-medium text-slate-700'}`}
                              >
                                <span>{c.name}</span>
                                <span className="text-xs text-slate-400">{c.state}</span>
                              </button>
                            ))}
                          {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && customerSearch && (
                            <p className="px-5 py-3 text-xs text-slate-400 italic">No customers found.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Note Number — editable (auto-generated but user can override) */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">
                    Note Number <span className="normal-case text-[9px] font-medium">(auto-generated, editable)</span>
                  </label>
                  <input
                    className={`w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ${accentBorder}`}
                    value={noteNumber}
                    onChange={e => setNoteNumber(e.target.value)}
                  />
                </div>

                {/* Date */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Note Date</label>
                  <input
                    type="date"
                    className={`w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ${accentBorder}`}
                    value={noteDate}
                    onChange={e => setNoteDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Original Invoice Reference (optional) */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">
                    Original Invoice No. <span className="normal-case font-medium">(optional)</span>
                  </label>
                  <input
                    placeholder="e.g. INV/2026/001"
                    className={`w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-medium text-slate-700 focus:ring-2 ${accentBorder}`}
                    value={originalInvoiceNumber}
                    onChange={e => setOriginalInvoiceNumber(e.target.value)}
                  />
                </div>

                {/* Reason */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Reason *</label>
                  <input
                    placeholder={isCredit ? 'e.g. Goods returned, Quality defect…' : 'e.g. Additional charges, Price revision…'}
                    className={`w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-medium text-slate-700 focus:ring-2 ${accentBorder}`}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Items card */}
            <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8 font-poppins">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold flex items-center gap-3">
                  <Plus className={accentText} size={22} /> Particulars
                </h3>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={openInventoryPicker}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-xs font-bold border border-amber-200"
                  >
                    <Package size={14} /> Pick from Inventory
                  </button>
                  <div className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase ${accentBg} ${accentText}`}>
                    GST Logic: {gstType}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                {items.map((item) => (
                  <div key={item.id} className="grid grid-cols-12 gap-4 items-end animate-in fade-in duration-300">
                    <div className="col-span-5 space-y-2">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-4">Description</label>
                      <input
                        placeholder="Product or service"
                        className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 text-sm font-medium"
                        value={item.description}
                        onChange={e => handleItemChange(item.id, 'description', e.target.value)}
                      />
                    </div>
                    <div className="col-span-1 space-y-2">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2">HSN</label>
                      <input
                        placeholder="HSN"
                        className="w-full bg-slate-50 border-none rounded-2xl px-3 py-3 text-sm font-medium text-center"
                        value={item.hsnCode}
                        onChange={e => handleItemChange(item.id, 'hsnCode', e.target.value)}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-4">Qty</label>
                      <input
                        type="number"
                        className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-black text-center"
                        value={item.quantity}
                        onChange={e => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-4">Rate (₹)</label>
                      <input
                        type="number"
                        className={`w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-black text-center ${accentText}`}
                        value={item.rate}
                        onChange={e => handleItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="col-span-1 space-y-2">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2">GST%</label>
                      <select
                        className="w-full bg-slate-50 border-none rounded-2xl px-2 py-3 text-sm font-bold text-center appearance-none"
                        value={item.gstRate}
                        onChange={e => handleItemChange(item.id, 'gstRate', parseFloat(e.target.value))}
                      >
                        {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                      </select>
                    </div>
                    <div className="col-span-1 pb-2 flex justify-center">
                      <button onClick={() => handleRemoveItem(item.id)} className="p-3 text-rose-400 hover:bg-rose-50 rounded-xl transition-all">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={handleAddItem}
                className={`flex items-center gap-2 font-bold text-sm px-6 py-3 rounded-2xl ${accentBg} ${accentText} hover:opacity-80 transition-all border border-dashed border-current`}
              >
                <Plus size={18} /> Add Line Item
              </button>
            </div>
          </div>

          {/* Summary sidebar */}
          <div className="lg:col-span-4 space-y-8 font-poppins">
            <div className={`rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden ${isCredit ? 'bg-emerald-600' : 'bg-amber-500'}`}>
              <div className="absolute top-0 right-0 p-8 opacity-10">
                {isCredit ? <TrendingDown size={100} /> : <TrendingUp size={100} />}
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-8">Summary Preview</p>
              <div className="space-y-4 mb-10">
                <div className="flex justify-between items-center opacity-80">
                  <span className="text-sm font-medium">Sub Total</span>
                  <span className="text-base font-bold">₹{subTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center opacity-90">
                  <span className="text-sm font-medium">Tax (GST)</span>
                  <span className="text-base font-bold">+ ₹{taxAmount.toLocaleString()}</span>
                </div>
              </div>
              <div className="pt-8 border-t border-white/20 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
                  {isCredit ? 'Total Credit Amount' : 'Total Debit Amount'}
                </p>
                <h3 className="text-4xl font-black">₹{grandTotal.toLocaleString()}</h3>
              </div>
            </div>

            <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-5">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">Quick Info</h4>
              <div className="space-y-3 text-xs font-bold text-slate-500">
                <div className={`p-4 rounded-2xl flex justify-between ${isCredit ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                  <span>Note Type</span>
                  <span className={accentText}>{isCredit ? 'Credit Note' : 'Debit Note'}</span>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl flex justify-between">
                  <span>GST Type</span><span className="text-slate-800">{gstType}</span>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl flex justify-between">
                  <span>Items</span><span className="text-slate-800">{items.length}</span>
                </div>
                <div className={`p-4 rounded-2xl flex items-start gap-2 ${isCredit ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  <Info size={14} className="mt-0.5 flex-shrink-0" />
                  <span className="text-xs leading-relaxed">
                    {isCredit
                      ? 'This will add a Credit ledger entry and reduce the customer\'s outstanding balance.'
                      : 'This will add a Debit ledger entry and increase the customer\'s outstanding balance.'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Click-outside overlay for customer dropdown */}
        {showCustomerDropdown && (
          <div className="fixed inset-0 z-20" onClick={() => setShowCustomerDropdown(false)} />
        )}

        {/* ── Inventory picker modal ── */}
        {showInventoryPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold font-poppins text-slate-900 flex items-center gap-2">
                  <Package size={18} className="text-amber-600" /> Pick from Inventory
                </h2>
                <button
                  onClick={() => setShowInventoryPicker(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="px-6 py-3 border-b border-slate-50">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    autoFocus type="text" placeholder="Search items…"
                    value={inventorySearch} onChange={e => setInventorySearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 rounded-xl border-none focus:ring-2 ring-amber-100 font-poppins font-medium"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {inventoryItems
                  .filter(it =>
                    it.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
                    it.hsnCode.toLowerCase().includes(inventorySearch.toLowerCase())
                  )
                  .map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handlePickInventoryItem(item)}
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-amber-50 border-b border-slate-50 transition-colors text-left group"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-800 group-hover:text-amber-800">{item.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">HSN: {item.hsnCode || '—'} · {item.unit} · GST {item.gstRate}%</p>
                      </div>
                      <div className="text-right flex-shrink-0 ml-4">
                        <p className="text-sm font-black text-slate-900">₹{item.sellingPrice.toLocaleString('en-IN')}</p>
                        {(item.stock ?? 0) > 0
                          ? <p className="text-xs text-emerald-600">Stock: {item.stock}</p>
                          : <p className="text-xs text-rose-500">Out of stock</p>
                        }
                      </div>
                    </button>
                  ))
                }
                {inventoryItems.length === 0 && (
                  <div className="px-6 py-12 text-center text-sm text-slate-400 font-poppins">
                    No inventory items found. Add items from the Inventory page.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {pdfModal.open && pdfModal.note && (
          <PDFPreviewModal
            open={pdfModal.open}
            onClose={() => setPdfModal({ open: false, note: null, noteType: 'credit', customer: null })}
            document={
              <CreditDebitNotePDF
                note={pdfModal.note}
                noteType={pdfModal.noteType}
                business={profile}
                customer={pdfModal.customer || { id: '', name: pdfModal.note.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 }}
              />
            }
            fileName={`${pdfModal.noteType === 'credit' ? 'Credit' : 'Debit'}-Note-${pdfModal.note.noteNumber.replace(/\//g, '-')}.pdf`}
          />
        )}
      </div>
    );
  }

  // ─── LIST VIEW ─────────────────────────────────────────────────────────────
  const currentNotes = activeTab === 'credit' ? creditNotes : debitNotes;
  const q = searchQuery.toLowerCase().trim();
  const filteredNotes = q
    ? currentNotes.filter(n =>
        n.noteNumber.toLowerCase().includes(q) ||
        n.customerName.toLowerCase().includes(q) ||
        n.reason.toLowerCase().includes(q) ||
        formatDate(n.date).includes(q) ||
        n.date.includes(q)
      )
    : currentNotes;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 pb-20">

      {/* ── Page Header ── */}
      <div className="flex justify-between items-end mb-4">
        <div>
          <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Credit &amp; Debit Notes</h1>
          <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest font-poppins">
            GST Compliant · Section 34 CGST Act 2017
          </p>
        </div>
        <button
          onClick={() => handleNewNote(activeTab)}
          className={`text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl transition-all font-poppins hover:scale-105 active:scale-95 ${activeTab === 'credit' ? 'bg-emerald-500 shadow-emerald-100' : 'bg-amber-500 shadow-amber-100'}`}
        >
          <Plus size={20} /> New {activeTab === 'credit' ? 'Credit' : 'Debit'} Note
        </button>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="flex gap-3 bg-slate-100 p-2 rounded-[1.5rem] w-fit">
        <button
          onClick={() => { setActiveTab('credit'); setSearchQuery(''); }}
          className={`flex items-center gap-2 px-8 py-3 rounded-[1.2rem] font-bold text-sm transition-all font-poppins ${
            activeTab === 'credit'
              ? 'bg-white text-emerald-700 shadow-md'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <TrendingDown size={18} /> Credit Notes
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === 'credit' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
            {creditNotes.length}
          </span>
        </button>
        <button
          onClick={() => { setActiveTab('debit'); setSearchQuery(''); }}
          className={`flex items-center gap-2 px-8 py-3 rounded-[1.2rem] font-bold text-sm transition-all font-poppins ${
            activeTab === 'debit'
              ? 'bg-white text-amber-700 shadow-md'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <TrendingUp size={18} /> Debit Notes
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${activeTab === 'debit' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-500'}`}>
            {debitNotes.length}
          </span>
        </button>
      </div>

      {/* ── Explanatory Card ── */}
      {activeTab === 'credit' ? (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-[2rem] p-8 flex gap-6 items-start">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <TrendingDown size={22} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-base font-black text-emerald-800 font-poppins mb-2">When to Issue a Credit Note?</h3>
            <p className="text-sm text-emerald-700 font-poppins leading-relaxed mb-3">
              A <strong>Credit Note</strong> is issued by a supplier under <strong>Section 34 of the CGST Act, 2017</strong> to <em>reduce</em> the amount a customer owes.
              It reduces your GST output tax liability and decreases the customer's outstanding balance in the ledger.
            </p>
            <div className="flex flex-wrap gap-2">
              {['Goods Returned by Customer', 'Post-Sale Discount', 'Defective / Damaged Goods', 'Invoice Cancellation', 'Short-supply Correction'].map(tag => (
                <span key={tag} className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold font-poppins">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 rounded-[2rem] p-8 flex gap-6 items-start">
          <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center flex-shrink-0">
            <TrendingUp size={22} className="text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-black text-amber-800 font-poppins mb-2">When to Issue a Debit Note?</h3>
            <p className="text-sm text-amber-700 font-poppins leading-relaxed mb-3">
              A <strong>Debit Note</strong> is issued by a supplier under <strong>Section 34 of the CGST Act, 2017</strong> to <em>increase</em> the amount a customer owes.
              It increases your GST output tax liability and increases the customer's outstanding balance in the ledger.
            </p>
            <div className="flex flex-wrap gap-2">
              {['Additional Charges Added', 'Upward Price Revision', 'Interest on Overdue Payment', 'Shortfall in Returned Goods', 'Under-billed Correction'].map(tag => (
                <span key={tag} className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold font-poppins">{tag}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Notes List ── */}
      {currentNotes.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] p-16 premium-shadow border border-slate-50 text-center">
          <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto mb-8 ${activeTab === 'credit' ? 'bg-emerald-50' : 'bg-amber-50'}`}>
            <FileCheck2 className={activeTab === 'credit' ? 'text-emerald-500' : 'text-amber-500'} size={40} />
          </div>
          <h3 className="text-2xl font-bold font-poppins text-slate-900 mb-3">
            No {activeTab === 'credit' ? 'credit' : 'debit'} notes yet
          </h3>
          <p className="text-sm text-slate-400 font-medium font-poppins mb-8 max-w-md mx-auto">
            {activeTab === 'credit'
              ? 'Create a credit note when a customer returns goods or you need to issue a discount/refund against an invoice.'
              : 'Create a debit note when you need to charge additional amounts to a customer beyond what was originally invoiced.'}
          </p>
          <button
            onClick={() => handleNewNote(activeTab)}
            className={`text-white px-12 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl transition-all font-poppins mx-auto hover:scale-105 active:scale-95 ${activeTab === 'credit' ? 'bg-emerald-500 shadow-emerald-100' : 'bg-amber-500 shadow-amber-100'}`}
          >
            <Plus size={20} /> Create {activeTab === 'credit' ? 'First Credit Note' : 'First Debit Note'}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] premium-shadow border border-slate-50 overflow-hidden">
          {/* Search */}
          <div className="px-8 pt-8 pb-5 border-b border-slate-50">
            <div className="relative max-w-md">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                type="text"
                placeholder="Search by note #, party, reason, date…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-5 py-3.5 bg-slate-50 rounded-2xl text-sm font-medium text-slate-700 placeholder-slate-300 border-none focus:ring-2 ring-indigo-50 font-poppins"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse font-poppins">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Date</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Note #</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Party Name</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Taxable Amt</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Tax</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Total</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredNotes.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-16 text-center text-sm text-slate-400 font-medium">
                      No notes match &ldquo;{searchQuery}&rdquo;
                    </td>
                  </tr>
                ) : (
                  filteredNotes.map((note, idx) => {
                    const tax = (note.cgst || 0) + (note.sgst || 0) + (note.igst || 0);
                    const custObj = customers.find(c => c.id === note.customerId) || null;
                    return (
                      <tr
                        key={note.id}
                        className={`hover:bg-indigo-50/30 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                        onClick={() => handleEditNote(note, activeTab)}
                      >
                        <td className="px-6 py-4 text-sm font-bold text-slate-600 whitespace-nowrap">
                          {formatDate(note.date)}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-slate-900 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 ${activeTab === 'credit' ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {activeTab === 'credit' ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                            {note.noteNumber}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-700 max-w-[160px] truncate">
                          {note.customerName}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500 max-w-[200px] truncate">
                          {note.reason}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-700 text-right whitespace-nowrap">
                          {inr(note.totalBeforeTax)}
                        </td>
                        <td className={`px-6 py-4 text-sm font-bold text-right whitespace-nowrap ${activeTab === 'credit' ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {inr(tax)}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-slate-900 text-right whitespace-nowrap">
                          {inr(note.totalAmount)}
                        </td>
                        <td className="px-6 py-4" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            {/* View PDF */}
                            <button
                              onClick={() => openPDFModal(note, activeTab, custObj)}
                              title="Preview & Download PDF"
                              className={`p-2 rounded-xl transition-all ${activeTab === 'credit' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white'}`}
                            >
                              <Eye size={15} />
                            </button>
                            {/* Edit */}
                            <button
                              onClick={() => handleEditNote(note, activeTab)}
                              title="Edit Note"
                              className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-700 hover:text-white transition-all"
                            >
                              <Pencil size={15} />
                            </button>
                            {/* Download PDF */}
                            <button
                              onClick={() => openPDFModal(note, activeTab, custObj)}
                              title="Download PDF"
                              className={`p-2 rounded-xl transition-all ${activeTab === 'credit' ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white' : 'bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white'}`}
                            >
                              <Download size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer summary */}
          {filteredNotes.length > 0 && (
            <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center gap-8 font-poppins">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}
              </span>
              <span className="text-[10px] font-bold text-slate-500">
                Total Value:{' '}
                <span className={`font-black ${activeTab === 'credit' ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {inr(filteredNotes.reduce((s, n) => s + n.totalAmount, 0))}
                </span>
              </span>
              <span className="text-[10px] font-bold text-slate-500">
                Total Tax:{' '}
                <span className="text-slate-900 font-black">
                  {inr(filteredNotes.reduce((s, n) => s + (n.cgst || 0) + (n.sgst || 0) + (n.igst || 0), 0))}
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* PDF Preview Modal */}
      {pdfModal.open && pdfModal.note && (
        <PDFPreviewModal
          open={pdfModal.open}
          onClose={() => setPdfModal({ open: false, note: null, noteType: 'credit', customer: null })}
          document={
            <CreditDebitNotePDF
              note={pdfModal.note}
              noteType={pdfModal.noteType}
              business={profile}
              customer={pdfModal.customer || { id: '', name: pdfModal.note.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 }}
            />
          }
          fileName={`${pdfModal.noteType === 'credit' ? 'Credit' : 'Debit'}-Note-${pdfModal.note.noteNumber.replace(/\//g, '-')}.pdf`}
        />
      )}
    </div>
  );
};

export default CreditDebitNotes;
