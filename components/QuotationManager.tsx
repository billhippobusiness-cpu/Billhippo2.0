
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Plus, Trash2, ChevronDown, Save, Eye, Edit3, CheckCircle, Loader2,
  ArrowLeft, Search, UserPlus, X, ScrollText, Download, Send, FileCheck,
  MessageCircle, Printer, Lock, ClipboardCheck, XCircle, Package,
} from 'lucide-react';
import { GSTType, type InvoiceItem, type InventoryItem, type Customer, type BusinessProfile, type Quotation, type QuotationStatus } from '../types';
import {
  getCustomers, getBusinessProfile, addCustomer, getInventoryItems,
  getQuotations, addQuotation, updateQuotation, deleteQuotation, getTotalQuotationCount,
} from '../lib/firestore';
import PDFPreviewModal from './pdf/PDFPreviewModal';
import QuotationPDF from './pdf/QuotationPDF';
import DeleteConfirmationModal from './DeleteConfirmationModal';

// ── Constants ────────────────────────────────────────────────────────────────

const INDIAN_STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa',
  'Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala',
  'Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland',
  'Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir',
  'Ladakh','Puducherry','Chandigarh','Dadra and Nagar Haveli and Daman and Diu',
  'Lakshadweep','Andaman and Nicobar Islands',
];

const DEFAULT_PROFILE: BusinessProfile = {
  name: 'Your Business', gstin: '', address: '', city: '', state: 'Maharashtra', pincode: '',
  phone: '', email: '', pan: '', gstEnabled: true,
  theme: { templateId: 'modern-2', primaryColor: '#4c2de0', fontFamily: 'Poppins, sans-serif', invoicePrefix: 'INV/2026/', autoNumbering: true },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = (d: string) => {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
};

const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_CONFIG: Record<QuotationStatus, { label: string; bg: string; text: string; dot: string }> = {
  Draft:     { label: 'Draft',     bg: 'bg-slate-100',  text: 'text-slate-600',  dot: 'bg-slate-400' },
  Sent:      { label: 'Sent',      bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500' },
  Accepted:  { label: 'Accepted',  bg: 'bg-emerald-50', text: 'text-emerald-700',dot: 'bg-emerald-500' },
  Rejected:  { label: 'Rejected',  bg: 'bg-rose-50',    text: 'text-rose-700',   dot: 'bg-rose-500' },
  Converted: { label: 'Converted', bg: 'bg-violet-50',  text: 'text-violet-700', dot: 'bg-violet-500' },
};

// ── Sub-components ───────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: QuotationStatus }> = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-poppins ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
};

interface QuickCreateModalProps {
  form: { name: string; phone: string; gstin: string; state: string };
  setForm: React.Dispatch<React.SetStateAction<{ name: string; phone: string; gstin: string; state: string }>>;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}

const QuickCreateModal: React.FC<QuickCreateModalProps> = ({ form, setForm, onSave, onClose, saving }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
      <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded-t-2xl" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg font-poppins text-slate-800">Quick Add Customer</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <input
            type="text" placeholder="Business / Customer Name *" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-amber-200 font-poppins"
          />
          <input
            type="tel" placeholder="Phone Number" value={form.phone}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
            className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-amber-200 font-poppins"
          />
          <input
            type="text" placeholder="GSTIN (optional)" value={form.gstin}
            onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))}
            className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-amber-200 font-poppins"
          />
          <select
            value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
            className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-amber-200 font-poppins"
          >
            {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 font-poppins">Cancel</button>
          <button
            onClick={onSave} disabled={saving || !form.name.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 font-poppins flex items-center justify-center gap-2"
          >
            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Add Customer'}
          </button>
        </div>
      </div>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

interface QuotationManagerProps {
  userId: string;
  onConvertToInvoice: (quotation: Quotation) => void;
}

const QuotationManager: React.FC<QuotationManagerProps> = ({ userId, onConvertToInvoice }) => {
  const [mode, setMode] = useState<'list' | 'editing' | 'preview'>('list');

  // Data
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allQuotations, setAllQuotations] = useState<Quotation[]>([]);

  // UI states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<Quotation | null>(null);
  const [deleting, setDeleting] = useState(false);

  // PDF modal
  const [pdfModal, setPdfModal] = useState<{ open: boolean; quotation: Quotation | null }>({ open: false, quotation: null });

  // List filter & search
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Currently editing/previewing
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null);
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);

  // Form fields
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [quotationNumber, setQuotationNumber] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', description: '', hsnCode: '', quantity: 1, rate: 0, gstRate: 18 },
  ]);
  const [notes, setNotes] = useState('');

  // Customer dropdown
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // Quick-create customer
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [qcForm, setQcForm] = useState({ name: '', phone: '', gstin: '', state: 'Maharashtra' });
  const [qcSaving, setQcSaving] = useState(false);

  // Inventory picker (trading businesses only)
  const [showInventoryPicker, setShowInventoryPicker] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryLoaded, setInventoryLoaded] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [profileData, customerData, quotationData, totalCount] = await Promise.all([
        getBusinessProfile(userId),
        getCustomers(userId),
        getQuotations(userId),
        getTotalQuotationCount(userId),
      ]);
      if (profileData) setProfile(profileData);
      setCustomers(customerData);
      setAllQuotations(quotationData);
      // Build auto-number for new quotation
      const year = new Date().getFullYear();
      setQuotationNumber(`QT/${year}/${String(totalCount + 1).padStart(3, '0')}`);
    } catch {
      setError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Computed values ────────────────────────────────────────────────────────

  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === selectedCustomerId),
    [selectedCustomerId, customers],
  );

  const gstType = useMemo(() => {
    if (!selectedCustomer) return GSTType.CGST_SGST;
    return selectedCustomer.state === profile.state ? GSTType.CGST_SGST : GSTType.IGST;
  }, [selectedCustomer, profile.state]);

  const subTotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0);
  const taxAmount = items.reduce((sum, item) => sum + item.quantity * item.rate * item.gstRate / 100, 0);
  const grandTotal = subTotal + taxAmount;

  const filteredCustomers = useMemo(
    () => customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())),
    [customers, customerSearch],
  );

  const filteredQuotations = useMemo(() => {
    let q = allQuotations;
    if (statusFilter !== 'All') q = q.filter(i => i.status === statusFilter);
    if (searchQuery.trim()) {
      const sq = searchQuery.toLowerCase();
      q = q.filter(i =>
        i.quotationNumber.toLowerCase().includes(sq) ||
        i.customerName.toLowerCase().includes(sq),
      );
    }
    return q;
  }, [allQuotations, statusFilter, searchQuery]);

  // Stats
  const stats = useMemo(() => ({
    total: allQuotations.length,
    pending: allQuotations.filter(q => q.status === 'Sent' || q.status === 'Draft').length,
    totalValue: allQuotations.filter(q => q.status !== 'Rejected').reduce((s, q) => s + q.totalAmount, 0),
  }), [allQuotations]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const resetForm = async () => {
    setEditingQuotation(null);
    setSelectedCustomerId('');
    setItems([{ id: '1', description: '', hsnCode: '', quantity: 1, rate: 0, gstRate: 18 }]);
    setQuotationDate(new Date().toISOString().split('T')[0]);
    setValidUntil('');
    setNotes('');
    setError(null);
    setSaveSuccess(false);
    // Refresh the auto-number
    const count = await getTotalQuotationCount(userId);
    const year = new Date().getFullYear();
    setQuotationNumber(`QT/${year}/${String(count + 1).padStart(3, '0')}`);
  };

  const handleNewQuotation = async () => {
    await resetForm();
    setMode('editing');
  };

  const handleEditQuotation = (q: Quotation) => {
    setEditingQuotation(q);
    setSelectedCustomerId(q.customerId);
    setQuotationNumber(q.quotationNumber);
    setQuotationDate(q.date);
    setValidUntil(q.validUntil || '');
    setItems(q.items);
    setNotes(q.notes || '');
    setError(null);
    setSaveSuccess(false);
    setMode('editing');
  };

  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      { id: Math.random().toString(36).substr(2, 9), description: '', hsnCode: '', quantity: 1, rate: 0, gstRate: 18 },
    ]);
  };

  const handleRemoveItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleSave = async (asDraft = false) => {
    if (!selectedCustomerId) { setError('Please select a customer'); return; }
    if (items.every(i => !i.description.trim())) { setError('Add at least one item'); return; }
    if (subTotal === 0) { setError('Quotation total cannot be zero'); return; }
    setSaving(true); setError(null);
    try {
      const cgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
      const sgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
      const igst = gstType === GSTType.IGST ? taxAmount : 0;
      // Build payload without undefined fields — Firestore rejects undefined values
      const payload: Omit<Quotation, 'id'> = {
        quotationNumber,
        date: quotationDate,
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '',
        items,
        gstType,
        totalBeforeTax: subTotal,
        cgst, sgst, igst,
        totalAmount: grandTotal,
        status: editingQuotation ? editingQuotation.status : 'Draft',
        ...(validUntil ? { validUntil } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        ...(editingQuotation?.convertedInvoiceId ? { convertedInvoiceId: editingQuotation.convertedInvoiceId } : {}),
      };

      if (editingQuotation) {
        await updateQuotation(userId, editingQuotation.id, payload);
        const updated = { ...editingQuotation, ...payload };
        setAllQuotations(prev => prev.map(q => q.id === editingQuotation.id ? updated : q));
        setPreviewQuotation(updated);
      } else {
        const id = await addQuotation(userId, payload);
        const newQ: Quotation = { id, ...payload };
        setAllQuotations(prev => [newQ, ...prev]);
        setPreviewQuotation(newQ);
      }
      setSaveSuccess(true);
      setMode('preview');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError('Failed to save quotation. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (q: Quotation, newStatus: QuotationStatus) => {
    await updateQuotation(userId, q.id, { status: newStatus });
    const updated = { ...q, status: newStatus };
    setAllQuotations(prev => prev.map(i => i.id === q.id ? updated : i));
    if (previewQuotation?.id === q.id) setPreviewQuotation(updated);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteQuotation(userId, deleteTarget.id);
      setAllQuotations(prev => prev.filter(q => q.id !== deleteTarget.id));
      if (previewQuotation?.id === deleteTarget.id) setMode('list');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleQuickCreateCustomer = async () => {
    if (!qcForm.name.trim()) return;
    setQcSaving(true);
    try {
      const id = await addCustomer(userId, {
        name: qcForm.name.trim(), phone: qcForm.phone, gstin: qcForm.gstin,
        state: qcForm.state, email: '', address: '', city: '', pincode: '', balance: 0,
      });
      const newCust: Customer = {
        id, name: qcForm.name.trim(), phone: qcForm.phone, gstin: qcForm.gstin,
        state: qcForm.state, email: '', address: '', city: '', pincode: '', balance: 0,
      };
      setCustomers(prev => [...prev, newCust].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCustomerId(id);
      setShowQuickCreate(false);
      setQcForm({ name: '', phone: '', gstin: '', state: 'Maharashtra' });
    } finally {
      setQcSaving(false);
    }
  };

  // Inventory picker handlers
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
    const newLineItem: InvoiceItem = {
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

  const handlePreviewQuotation = (q: Quotation) => {
    setPreviewQuotation(q);
    setMode('preview');
  };

  const handleWhatsAppShare = (q: Quotation) => {
    const customer = customers.find(c => c.id === q.customerId);
    const phone = customer?.phone?.replace(/\D/g, '');
    const message = `Dear ${q.customerName},\n\nPlease find your Quotation *${q.quotationNumber}* for ₹${q.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}${q.validUntil ? `\nValid Until: ${formatDate(q.validUntil)}` : ''}.\n\nKindly confirm your acceptance at your earliest convenience.\n\nRegards,\n${profile.name}`;
    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleConvertToInvoice = (q: Quotation) => {
    // Status is NOT changed here — InvoiceGenerator marks it Converted only after Finalize Bill succeeds
    onConvertToInvoice(q);
  };

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400 font-poppins">Loading quotations…</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PREVIEW MODE
  // ══════════════════════════════════════════════════════════════════════════

  if (mode === 'preview' && previewQuotation) {
    const q = previewQuotation;
    const customer = customers.find(c => c.id === q.customerId) ?? null;
    const isConverted = q.status === 'Converted';
    const canConvert = q.status === 'Accepted' || q.status === 'Sent';

    return (
      <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('list')} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors font-poppins">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Quotation</h1>
              <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">{q.quotationNumber} &bull; <StatusBadge status={q.status} /></p>
            </div>
          </div>
          {saveSuccess && (
            <span className="flex items-center gap-2 text-sm font-bold text-emerald-600 font-poppins">
              <CheckCircle size={16} /> Saved!
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* ── Quotation document ── */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-[2.5rem] overflow-hidden premium-shadow border border-amber-50">
              {/* Amber header */}
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-10 pt-10 pb-8 text-white">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-amber-100 text-xs font-bold uppercase tracking-widest mb-1">From</p>
                    <h2 className="text-2xl font-bold font-poppins">{profile.name}</h2>
                    {profile.gstin && <p className="text-amber-100 text-sm mt-0.5">GSTIN: {profile.gstin}</p>}
                    {profile.address && <p className="text-amber-100 text-sm mt-0.5">{profile.address}{profile.city ? `, ${profile.city}` : ''}</p>}
                    {profile.state && <p className="text-amber-100 text-sm">{profile.state} {profile.pincode}</p>}
                  </div>
                  <div className="text-right">
                    <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-2xl px-5 py-2 mb-4">
                      <ScrollText size={18} className="text-white" />
                      <span className="text-xl font-black font-poppins tracking-widest">QUOTATION</span>
                    </div>
                    <p className="text-amber-100 text-xs uppercase tracking-widest">Quotation No.</p>
                    <p className="font-bold text-lg font-poppins">{q.quotationNumber}</p>
                    <p className="text-amber-100 text-xs mt-2 uppercase tracking-widest">Date</p>
                    <p className="font-semibold text-sm">{formatDate(q.date)}</p>
                    {q.validUntil && (
                      <>
                        <p className="text-amber-100 text-xs mt-2 uppercase tracking-widest">Valid Until</p>
                        <p className="font-semibold text-sm">{formatDate(q.validUntil)}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="px-10 py-8 space-y-8">
                {/* Billed to */}
                <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100">
                  <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Billed To</p>
                  <h3 className="font-bold text-lg text-slate-800 font-poppins">{q.customerName}</h3>
                  {customer?.gstin && <p className="text-slate-500 text-sm mt-0.5">GSTIN: {customer.gstin}</p>}
                  {customer?.address && <p className="text-slate-500 text-sm mt-0.5">{customer.address}</p>}
                  {customer?.city && <p className="text-slate-500 text-sm">{customer.city}{customer.state ? `, ${customer.state}` : ''} {customer.pincode}</p>}
                  {customer?.phone && <p className="text-slate-500 text-sm mt-0.5">{customer.phone}</p>}
                  {customer?.email && <p className="text-slate-500 text-sm">{customer.email}</p>}
                </div>

                {/* Items table */}
                <div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-100">
                    <table className="w-full text-sm font-poppins">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider rounded-tl-2xl">#</th>
                          <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">Description</th>
                          <th className="text-left px-4 py-3 font-bold text-xs uppercase tracking-wider">HSN</th>
                          <th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider">Qty</th>
                          <th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider">Rate</th>
                          <th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider">GST%</th>
                          <th className="text-right px-4 py-3 font-bold text-xs uppercase tracking-wider rounded-tr-2xl">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {q.items.filter(i => i.description.trim()).map((item, idx) => {
                          const lineTotal = item.quantity * item.rate;
                          const lineTax = lineTotal * item.gstRate / 100;
                          return (
                            <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                              <td className="px-4 py-3 text-slate-500 text-xs">{idx + 1}</td>
                              <td className="px-4 py-3 font-medium text-slate-800">{item.description}</td>
                              <td className="px-4 py-3 text-slate-500 text-xs">{item.hsnCode || '—'}</td>
                              <td className="px-4 py-3 text-right text-slate-700">{item.quantity}</td>
                              <td className="px-4 py-3 text-right text-slate-700">{inr(item.rate)}</td>
                              <td className="px-4 py-3 text-right text-slate-500">{item.gstRate}%</td>
                              <td className="px-4 py-3 text-right font-bold text-slate-800">{inr(lineTotal + lineTax)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="flex justify-end">
                  <div className="w-72 space-y-2">
                    <div className="flex justify-between text-sm text-slate-600 font-poppins">
                      <span>Taxable Amount</span>
                      <span className="font-semibold">{inr(q.totalBeforeTax)}</span>
                    </div>
                    {q.gstType === GSTType.CGST_SGST ? (
                      <>
                        <div className="flex justify-between text-sm text-slate-500 font-poppins">
                          <span>CGST</span><span>{inr(q.cgst)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-slate-500 font-poppins">
                          <span>SGST</span><span>{inr(q.sgst)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-sm text-slate-500 font-poppins">
                        <span>IGST</span><span>{inr(q.igst)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-black text-lg text-slate-900 border-t border-amber-200 pt-2 font-poppins">
                      <span>Total</span>
                      <span className="text-amber-600">{inr(q.totalAmount)}</span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {q.notes && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                    <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Notes</p>
                    <p className="text-slate-700 text-sm whitespace-pre-wrap font-poppins">{q.notes}</p>
                  </div>
                )}

                {/* Disclaimer */}
                <p className="text-center text-[10px] text-slate-400 font-poppins uppercase tracking-wider border-t border-slate-50 pt-6">
                  This is a Quotation / Proforma only — not a Tax Invoice &bull; Subject to change without prior notice
                </p>
              </div>
            </div>
          </div>

          {/* ── Action panel ── */}
          <div className="lg:col-span-4 space-y-4">
            {/* Edit / Back */}
            {!isConverted && (
              <button
                onClick={() => handleEditQuotation(q)}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition-all font-poppins"
              >
                <Edit3 size={18} /> Edit Quotation
              </button>
            )}
            {isConverted && (
              <div className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-violet-50 border border-violet-100 text-violet-700 font-bold font-poppins text-sm">
                <Lock size={16} /> Converted to Invoice
              </div>
            )}

            {/* Status actions */}
            {!isConverted && (
              <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Update Status</p>
                {q.status !== 'Sent' && (
                  <button
                    onClick={() => handleStatusChange(q, 'Sent')}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 text-blue-700 font-bold text-sm hover:bg-blue-100 transition-all font-poppins"
                  >
                    <Send size={16} /> Mark as Sent
                  </button>
                )}
                {q.status !== 'Accepted' && q.status !== 'Rejected' && (
                  <button
                    onClick={() => handleStatusChange(q, 'Accepted')}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm hover:bg-emerald-100 transition-all font-poppins"
                  >
                    <ClipboardCheck size={16} /> Mark as Accepted
                  </button>
                )}
                {q.status !== 'Rejected' && q.status !== 'Accepted' && (
                  <button
                    onClick={() => handleStatusChange(q, 'Rejected')}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-50 text-rose-700 font-bold text-sm hover:bg-rose-100 transition-all font-poppins"
                  >
                    <XCircle size={16} /> Mark as Rejected
                  </button>
                )}
              </div>
            )}

            {/* Convert to Invoice */}
            {canConvert && (
              <button
                onClick={() => handleConvertToInvoice(q)}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-lg shadow-amber-200 hover:scale-[1.02] transition-all font-poppins"
              >
                <FileCheck size={18} /> Convert to Invoice
              </button>
            )}

            {/* Share & Download */}
            <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Share & Export</p>
              <button
                onClick={() => setPdfModal({ open: true, quotation: q })}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 text-slate-700 font-bold text-sm hover:bg-slate-100 transition-all font-poppins"
              >
                <Download size={16} /> Download PDF
              </button>
              <button
                onClick={() => window.print()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 text-slate-700 font-bold text-sm hover:bg-slate-100 transition-all font-poppins"
              >
                <Printer size={16} /> Print
              </button>
              <button
                onClick={() => handleWhatsAppShare(q)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 font-bold text-sm hover:bg-emerald-100 transition-all font-poppins"
              >
                <MessageCircle size={16} /> Share via WhatsApp
              </button>
            </div>

            {/* Delete */}
            {!isConverted && (
              <button
                onClick={() => setDeleteTarget(q)}
                className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-2xl text-rose-600 border border-rose-100 bg-rose-50 hover:bg-rose-100 font-bold text-sm transition-all font-poppins"
              >
                <Trash2 size={16} /> Delete Quotation
              </button>
            )}
          </div>
        </div>

        {/* PDF Modal */}
        {pdfModal.open && pdfModal.quotation && (
          <PDFPreviewModal
            open={pdfModal.open}
            onClose={() => setPdfModal({ open: false, quotation: null })}
            document={
              <QuotationPDF
                quotation={pdfModal.quotation}
                business={profile}
                customer={customer ?? { id: '', name: pdfModal.quotation.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 }}
              />
            }
            fileName={`Quotation-${pdfModal.quotation.quotationNumber.replace(/\//g, '-')}.pdf`}
          />
        )}

        <DeleteConfirmationModal
          isOpen={!!deleteTarget}
          title="Delete Quotation"
          message={`Are you sure you want to delete ${deleteTarget?.quotationNumber}? This action cannot be undone.`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirmed}
          isDeleting={deleting}
        />
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  EDITING MODE
  // ══════════════════════════════════════════════════════════════════════════

  if (mode === 'editing') {
    return (
      <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 pb-20">
        {/* Header */}
        <div className="flex justify-between items-end">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('list')} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors font-poppins">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">
                {editingQuotation ? 'Edit Quotation' : 'New Quotation'}
              </h1>
              <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">
                {editingQuotation ? `Editing ${editingQuotation.quotationNumber}` : `Draft \u2022 ${quotationNumber}`}
              </p>
            </div>
          </div>
          <div className="flex gap-4 items-center">
            {error && <span className="text-sm font-bold text-rose-500 font-poppins">{error}</span>}
            <button
              onClick={() => { if (previewQuotation) setMode('preview'); }}
              disabled={!previewQuotation}
              className="bg-white border border-slate-200 text-slate-700 px-8 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-slate-50 transition-all font-poppins disabled:opacity-40"
            >
              <Eye size={20} /> Preview
            </button>
            <button
              onClick={() => handleSave()}
              disabled={saving}
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-lg shadow-amber-200 hover:scale-105 transition-all font-poppins disabled:opacity-50"
            >
              {saving ? <><Loader2 size={20} className="animate-spin" /> Saving…</> : <><Save size={20} /> {editingQuotation ? 'Update' : 'Save Quotation'}</>}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left column: main form */}
          <div className="lg:col-span-8 space-y-8">
            <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-amber-50 space-y-8 font-poppins">

              {/* Row 1: Customer | Quotation# | Date | Valid Until */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Customer selector */}
                <div className="space-y-3 relative">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Customer *</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setShowCustomerDropdown(v => !v); setCustomerSearch(''); setError(null); }}
                      className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-amber-100 flex items-center justify-between text-left"
                    >
                      <span className={selectedCustomer ? 'text-slate-800' : 'text-slate-400'}>
                        {selectedCustomer ? `${selectedCustomer.name}` : 'Select Customer…'}
                      </span>
                      <ChevronDown size={18} className="text-slate-300 flex-shrink-0" />
                    </button>
                    {showCustomerDropdown && (
                      <div className="absolute z-30 mt-2 w-full bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                        <div className="p-3 border-b border-slate-50">
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search customers…"
                              value={customerSearch}
                              onChange={e => setCustomerSearch(e.target.value)}
                              className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 rounded-xl border-none focus:ring-2 ring-amber-100 font-medium"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setShowCustomerDropdown(false); setShowQuickCreate(true); }}
                          className="w-full flex items-center gap-3 px-5 py-3 text-sm font-bold text-amber-600 hover:bg-amber-50 transition-colors border-b border-slate-50"
                        >
                          <UserPlus size={16} /> + Create New Customer
                        </button>
                        <div className="max-h-52 overflow-y-auto">
                          {filteredCustomers.length === 0 ? (
                            <p className="text-center text-sm text-slate-400 py-4">No customers found</p>
                          ) : filteredCustomers.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setSelectedCustomerId(c.id); setShowCustomerDropdown(false); }}
                              className={`w-full text-left px-5 py-3 text-sm hover:bg-amber-50 transition-colors ${c.id === selectedCustomerId ? 'bg-amber-50 font-bold text-amber-700' : 'text-slate-700'}`}
                            >
                              <p className="font-semibold">{c.name}</p>
                              <p className="text-xs text-slate-400">{c.state}{c.gstin ? ` · ${c.gstin}` : ''}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quotation number */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Quotation Number</label>
                  <input
                    type="text"
                    value={quotationNumber}
                    onChange={e => setQuotationNumber(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-amber-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Date */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Quotation Date</label>
                  <input
                    type="date"
                    value={quotationDate}
                    onChange={e => setQuotationDate(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-amber-100"
                  />
                </div>
                {/* Valid Until */}
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Valid Until (optional)</label>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-amber-100"
                  />
                </div>
              </div>

              {/* Items table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between ml-4 mr-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Line Items</label>
                  {profile.businessType === 'trading' && (
                    <button
                      type="button"
                      onClick={openInventoryPicker}
                      className="flex items-center gap-2 text-xs font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-xl transition-all font-poppins"
                    >
                      <Package size={14} /> Pick from Inventory
                    </button>
                  )}
                </div>
                <div className="rounded-2xl overflow-hidden border border-slate-100">
                  <table className="w-full text-sm font-poppins">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="text-left px-4 py-3 font-bold text-xs">Description</th>
                        <th className="text-left px-4 py-3 font-bold text-xs w-24">HSN/SAC</th>
                        <th className="text-right px-4 py-3 font-bold text-xs w-20">Qty</th>
                        <th className="text-right px-4 py-3 font-bold text-xs w-28">Rate (₹)</th>
                        <th className="text-right px-4 py-3 font-bold text-xs w-24">GST %</th>
                        <th className="text-right px-4 py-3 font-bold text-xs w-28">Amount</th>
                        <th className="px-3 py-3 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const lineTotal = item.quantity * item.rate;
                        const lineTax = lineTotal * item.gstRate / 100;
                        return (
                          <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={item.description}
                                onChange={e => handleItemChange(item.id, 'description', e.target.value)}
                                placeholder="Product / Service…"
                                className="w-full bg-transparent border-none focus:bg-amber-50 focus:ring-1 ring-amber-200 rounded-lg px-2 py-1 text-sm font-medium text-slate-800 placeholder-slate-300"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={item.hsnCode}
                                onChange={e => handleItemChange(item.id, 'hsnCode', e.target.value)}
                                placeholder="HSN"
                                className="w-full bg-transparent border-none focus:bg-amber-50 focus:ring-1 ring-amber-200 rounded-lg px-2 py-1 text-sm text-slate-600 placeholder-slate-300"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                value={item.quantity}
                                onChange={e => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-full bg-transparent border-none focus:bg-amber-50 focus:ring-1 ring-amber-200 rounded-lg px-2 py-1 text-sm text-right text-slate-700"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="0"
                                value={item.rate}
                                onChange={e => handleItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)}
                                className="w-full bg-transparent border-none focus:bg-amber-50 focus:ring-1 ring-amber-200 rounded-lg px-2 py-1 text-sm text-right text-slate-700"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <select
                                value={item.gstRate}
                                onChange={e => handleItemChange(item.id, 'gstRate', parseFloat(e.target.value))}
                                className="w-full bg-transparent border-none focus:bg-amber-50 focus:ring-1 ring-amber-200 rounded-lg px-2 py-1 text-sm text-right text-slate-700"
                              >
                                {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right text-sm font-bold text-slate-800">
                              {inr(lineTotal + lineTax)}
                            </td>
                            <td className="px-2 py-2">
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                disabled={items.length === 1}
                                className="text-slate-300 hover:text-rose-400 transition-colors disabled:opacity-30 p-1"
                              >
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={handleAddItem}
                  className="flex items-center gap-2 text-amber-600 font-bold text-sm hover:text-amber-700 transition-colors font-poppins px-2"
                >
                  <Plus size={16} /> Add Item
                </button>
              </div>

              {/* Notes */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Notes for Customer (optional)</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Prices are subject to change. Delivery within 7 days of confirmation."
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-medium text-slate-700 focus:ring-2 ring-amber-100 resize-none font-poppins"
                />
              </div>
            </div>
          </div>

          {/* Right column: tax summary */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-[2.5rem] p-8 premium-shadow border border-amber-50 space-y-5 font-poppins">
              <h3 className="font-black text-slate-800 font-poppins">Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Taxable Amount</span>
                  <span className="font-bold">{inr(subTotal)}</span>
                </div>
                {gstType === GSTType.CGST_SGST ? (
                  <>
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>CGST</span><span>{inr(taxAmount / 2)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-slate-500">
                      <span>SGST</span><span>{inr(taxAmount / 2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-sm text-slate-500">
                    <span>IGST</span><span>{inr(taxAmount)}</span>
                  </div>
                )}
                <div className="border-t border-amber-100 pt-3 flex justify-between font-black text-lg text-slate-900">
                  <span>Grand Total</span>
                  <span className="text-amber-600">{inr(grandTotal)}</span>
                </div>
              </div>

              {selectedCustomer && (
                <div className="bg-amber-50 rounded-2xl p-4 space-y-1 text-xs">
                  <p className="font-black text-amber-600 uppercase tracking-widest">GST Type</p>
                  <p className="font-bold text-slate-700">
                    {gstType === GSTType.CGST_SGST ? 'CGST + SGST (Intra-state)' : 'IGST (Inter-state)'}
                  </p>
                  <p className="text-slate-400 text-[10px]">Based on customer state vs. your state</p>
                  <p className="text-amber-600 font-bold text-[10px] mt-2 pt-2 border-t border-amber-100">
                    Not reported in GST Returns
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quick-create customer modal */}
        {showQuickCreate && (
          <QuickCreateModal
            form={qcForm}
            setForm={setQcForm}
            onSave={handleQuickCreateCustomer}
            onClose={() => setShowQuickCreate(false)}
            saving={qcSaving}
          />
        )}

        {/* Inventory picker modal */}
        {showInventoryPicker && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-lg mx-0 sm:mx-4 overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Package size={18} className="text-amber-500" />
                    <h3 className="font-bold text-lg font-poppins text-slate-800">Pick from Inventory</h3>
                  </div>
                  <button
                    onClick={() => setShowInventoryPicker(false)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Search */}
                <div className="relative mb-3">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search inventory…"
                    value={inventorySearch}
                    onChange={e => setInventorySearch(e.target.value)}
                    className="w-full bg-slate-50 rounded-2xl pl-9 pr-4 py-3 text-sm font-medium border-none focus:ring-2 ring-amber-200 font-poppins"
                  />
                </div>

                {/* Items list */}
                <div className="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
                  {inventoryItems
                    .filter(i =>
                      !inventorySearch.trim() ||
                      i.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
                      (i.hsnCode || '').toLowerCase().includes(inventorySearch.toLowerCase())
                    )
                    .map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handlePickInventoryItem(item)}
                        className="w-full text-left px-4 py-3 rounded-2xl hover:bg-amber-50 transition-colors group"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-800 text-sm font-poppins group-hover:text-amber-700">{item.name}</p>
                            <p className="text-xs text-slate-400 font-poppins mt-0.5">
                              HSN: {item.hsnCode || '—'} &bull; GST: {item.gstRate}% &bull; Unit: {item.unit}
                            </p>
                          </div>
                          <div className="text-right ml-3 flex-shrink-0">
                            <p className="font-bold text-sm text-amber-600 font-poppins">
                              ₹{item.sellingPrice.toLocaleString('en-IN')}
                            </p>
                            {item.stock !== undefined && (
                              <p className="text-[10px] text-slate-400 font-poppins">Stock: {item.stock}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  }
                  {inventoryItems.filter(i =>
                    !inventorySearch.trim() ||
                    i.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
                    (i.hsnCode || '').toLowerCase().includes(inventorySearch.toLowerCase())
                  ).length === 0 && (
                    <p className="text-center text-sm text-slate-400 py-8 font-poppins">
                      {inventoryItems.length === 0 ? 'No inventory items found' : 'No items match your search'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  LIST MODE (default)
  // ══════════════════════════════════════════════════════════════════════════

  const STATUS_TABS: (QuotationStatus | 'All')[] = ['All', 'Draft', 'Sent', 'Accepted', 'Rejected', 'Converted'];

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Quotations</h1>
          <p className="text-sm text-slate-400 mt-1 font-medium font-poppins">
            Send proposals to customers — convert to invoice when accepted
          </p>
        </div>
        <button
          onClick={handleNewQuotation}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-lg shadow-amber-200 hover:scale-105 active:scale-95 transition-all font-poppins"
        >
          <Plus size={20} /> New Quotation
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-[2rem] p-6 border border-amber-50 card-shadow">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-poppins">Total Quotations</p>
          <p className="text-4xl font-black text-slate-800 mt-2 font-poppins">{stats.total}</p>
        </div>
        <div className="bg-white rounded-[2rem] p-6 border border-amber-50 card-shadow">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-poppins">Awaiting Response</p>
          <p className="text-4xl font-black text-amber-500 mt-2 font-poppins">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-[2rem] p-6 border border-amber-50 card-shadow">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-poppins">Pipeline Value</p>
          <p className="text-3xl font-black text-slate-800 mt-2 font-poppins">{inr(stats.totalValue)}</p>
        </div>
      </div>

      {/* Search + filter */}
      <div className="bg-white rounded-[2rem] border border-slate-100 p-5 space-y-4 card-shadow">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            type="text"
            placeholder="Search by quotation number or customer…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border-none rounded-2xl pl-10 pr-4 py-3 text-sm font-medium focus:ring-2 ring-amber-100 font-poppins"
          />
        </div>
        {/* Status filter tabs */}
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-4 py-2 rounded-xl text-xs font-bold font-poppins transition-all ${
                statusFilter === tab
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md shadow-amber-200'
                  : 'bg-slate-50 text-slate-500 hover:bg-amber-50 hover:text-amber-700'
              }`}
            >
              {tab}
              {tab !== 'All' && (
                <span className="ml-1.5 opacity-60">
                  ({allQuotations.filter(q => q.status === tab).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Quotations table / empty state */}
      {filteredQuotations.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] p-16 text-center border border-amber-50 card-shadow">
          <div className="w-20 h-20 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <ScrollText size={36} className="text-amber-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 font-poppins mb-2">
            {allQuotations.length === 0 ? 'No quotations yet' : 'No quotations match your filter'}
          </h3>
          <p className="text-slate-400 text-sm font-medium font-poppins mb-8">
            {allQuotations.length === 0
              ? 'Create your first quotation and send it to a customer'
              : 'Try adjusting your search or status filter'}
          </p>
          {allQuotations.length === 0 && (
            <button
              onClick={handleNewQuotation}
              className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-8 py-4 rounded-2xl font-bold font-poppins shadow-lg shadow-amber-100 hover:scale-105 transition-all"
            >
              Create First Quotation
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-slate-50 overflow-hidden card-shadow">
          <div className="overflow-x-auto">
            <table className="w-full font-poppins">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider">Date</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider">Quotation #</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider">Customer</th>
                  <th className="text-right px-6 py-4 text-xs font-bold uppercase tracking-wider">Amount</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider">Valid Until</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider">Status</th>
                  <th className="text-right px-6 py-4 text-xs font-bold uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotations.map((q, idx) => (
                  <tr
                    key={q.id}
                    onClick={() => handlePreviewQuotation(q)}
                    className={`border-t border-slate-50 cursor-pointer hover:bg-amber-50/40 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                  >
                    <td className="px-6 py-4 text-sm text-slate-600">{formatDate(q.date)}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-800">{q.quotationNumber}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{q.customerName}</td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-800 text-right">{inr(q.totalAmount)}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{q.validUntil ? formatDate(q.validUntil) : '—'}</td>
                    <td className="px-6 py-4"><StatusBadge status={q.status} /></td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => handlePreviewQuotation(q)}
                          title="Preview"
                          className="p-2 rounded-xl hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                        >
                          <Eye size={16} />
                        </button>
                        {q.status !== 'Converted' && (
                          <button
                            onClick={() => handleEditQuotation(q)}
                            title="Edit"
                            className="p-2 rounded-xl hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                          >
                            <Edit3 size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => { setPdfModal({ open: true, quotation: q }); }}
                          title="Download PDF"
                          className="p-2 rounded-xl hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
                        >
                          <Download size={16} />
                        </button>
                        {(q.status === 'Accepted' || q.status === 'Sent') && (
                          <button
                            onClick={() => handleConvertToInvoice(q)}
                            title="Convert to Invoice"
                            className="p-2 rounded-xl hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"
                          >
                            <FileCheck size={16} />
                          </button>
                        )}
                        {q.status !== 'Converted' && (
                          <button
                            onClick={() => setDeleteTarget(q)}
                            title="Delete"
                            className="p-2 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table footer */}
          <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex justify-between items-center text-xs font-bold text-slate-500 font-poppins">
            <span>{filteredQuotations.length} quotation{filteredQuotations.length !== 1 ? 's' : ''}</span>
            <span>Total: {inr(filteredQuotations.reduce((s, q) => s + q.totalAmount, 0))}</span>
          </div>
        </div>
      )}

      {/* PDF Modal (from list) */}
      {pdfModal.open && pdfModal.quotation && (
        <PDFPreviewModal
          open={pdfModal.open}
          onClose={() => setPdfModal({ open: false, quotation: null })}
          document={
            <QuotationPDF
              quotation={pdfModal.quotation}
              business={profile}
              customer={customers.find(c => c.id === pdfModal.quotation!.customerId) ?? {
                id: '', name: pdfModal.quotation.customerName, phone: '', email: '',
                address: '', city: '', state: '', pincode: '', balance: 0,
              }}
            />
          }
          fileName={`Quotation-${pdfModal.quotation.quotationNumber.replace(/\//g, '-')}.pdf`}
        />
      )}

      <DeleteConfirmationModal
        isOpen={!!deleteTarget}
        title="Delete Quotation"
        message={`Delete ${deleteTarget?.quotationNumber}? This cannot be undone.`}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirmed}
        isDeleting={deleting}
      />
    </div>
  );
};

export default QuotationManager;
