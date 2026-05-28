/**
 * DeliveryChallan — Full delivery challan manager for BillHippo 2.0
 *
 * Features:
 * - List / editing / preview modes
 * - Pre-fill from an existing invoice (convert to challan)
 * - Bill To + optional Ship To sections
 * - Items table with HSN search modal
 * - Transport details
 * - PDF preview modal + direct download
 * - Show / hide prices toggle
 * - Status management (Draft / Dispatched / Delivered)
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Plus, Trash2, ArrowLeft, Download, Pencil, Search, X, CheckCircle,
  Loader2, Eye, Save, FileText, Truck, Package, ToggleLeft, ToggleRight,
  ExternalLink,
} from 'lucide-react';
import {
  DeliveryChallan as DeliveryChallanType,
  InvoiceItem,
  Customer,
  BusinessProfile,
  Invoice,
} from '../types';
import {
  getCustomers,
  getBusinessProfile,
  getDeliveryChallans,
  addDeliveryChallan,
  updateDeliveryChallan,
  deleteDeliveryChallan,
} from '../lib/firestore';
import PDFPreviewModal, { PDFDirectDownload } from './pdf/PDFPreviewModal';
import DeliveryChallanPDF from './pdf/DeliveryChallanPDF';
import HSNSearchModal, { HSNInput } from './HSNSearchModal';
import { haptic } from '../lib/haptic';

// ─── Constants ────────────────────────────────────────────────────────────────
const r2 = (n: number) => Math.round(n * 100) / 100;
const currentYear = new Date().getFullYear();

const DEFAULT_PROFILE: BusinessProfile = {
  name: 'Your Business',
  gstin: '',
  address: '',
  city: '',
  state: 'Maharashtra',
  pincode: '',
  phone: '',
  email: '',
  pan: '',
  gstEnabled: true,
  theme: {
    templateId: 'modern-2',
    primaryColor: '#4c2de0',
    fontFamily: 'Poppins, sans-serif',
    invoicePrefix: `INV/${currentYear}/`,
    autoNumbering: true,
  },
};

const TRANSPORT_MODES = ['Road', 'Rail', 'Air', 'Ship', 'Other'] as const;

const BLANK_ITEM = (): InvoiceItem => ({
  id: Math.random().toString(36).substr(2, 9),
  description: '',
  hsnCode: '',
  quantity: 1,
  rate: 0,
  gstRate: 18,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (d: string) => {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
};

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: 'Draft' | 'Dispatched' | 'Delivered' }> = ({ status }) => {
  const styles = {
    Draft:      'bg-slate-100 text-slate-600',
    Dispatched: 'bg-amber-100 text-amber-700',
    Delivered:  'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-poppins ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'Draft' ? 'bg-slate-400' : status === 'Dispatched' ? 'bg-amber-500' : 'bg-emerald-500'
      }`} />
      {status}
    </span>
  );
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface DeliveryChallanProps {
  userId: string;
  initialInvoice?: Invoice | null;
  onChallanConsumed?: () => void;
  onNavigate?: (tab: string) => void;
}

type ChallanMode = 'list' | 'editing' | 'preview';

// ─── Component ────────────────────────────────────────────────────────────────
const DeliveryChallan: React.FC<DeliveryChallanProps> = ({
  userId,
  initialInvoice,
  onChallanConsumed,
  onNavigate,
}) => {
  // ── Mode ──
  const [mode, setMode] = useState<ChallanMode>('list');

  // ── Data ──
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [challans, setChallans] = useState<DeliveryChallanType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Form ──
  const [editingChallan, setEditingChallan] = useState<DeliveryChallanType | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [challanNumber, setChallanNumber] = useState('');
  const [challanDate, setChallanDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceRef, setInvoiceRef] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([{ ...BLANK_ITEM(), id: '1' }]);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [transportMode, setTransportMode] = useState('');
  const [notes, setNotes] = useState('');
  const [challanStatus, setChallanStatus] = useState<'Draft' | 'Dispatched' | 'Delivered'>('Draft');

  // ── Ship To ──
  const [enableShipTo, setEnableShipTo] = useState(false);
  const [shipToName, setShipToName] = useState('');
  const [shipToGstin, setShipToGstin] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');
  const [shipToCity, setShipToCity] = useState('');
  const [shipToState, setShipToState] = useState('');
  const [shipToPincode, setShipToPincode] = useState('');

  // ── PDF options ──
  const [showPrices, setShowPrices] = useState(true);

  // ── Customer dropdown ──
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // ── PDF / Download state ──
  const [pdfModal, setPdfModal] = useState<{
    open: boolean;
    challan: DeliveryChallanType | null;
    customer: Customer | null;
  }>({ open: false, challan: null, customer: null });

  const [downloadTarget, setDownloadTarget] = useState<{
    challan: DeliveryChallanType;
    customer: Customer | null;
  } | null>(null);

  // ── HSN modal ──
  const [hsnModalItemId, setHsnModalItemId] = useState<string | null>(null);

  // ── Search ──
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Load data ─────────────────────────────────────────────────────────────
  useEffect(() => { loadData(); }, [userId]);

  // ─── Pre-fill from invoice ──────────────────────────────────────────────────
  useEffect(() => {
    if (!initialInvoice) return;
    setEditingChallan(null);
    setSelectedCustomerId(initialInvoice.customerId);
    setItems(initialInvoice.items.map(item => ({ ...item })));
    setChallanDate(new Date().toISOString().split('T')[0]);
    setInvoiceRef(initialInvoice.invoiceNumber);
    setVehicleNumber('');
    setTransportMode('');
    setNotes('');
    setChallanStatus('Draft');
    setEnableShipTo(false);
    setShipToName(''); setShipToGstin(''); setShipToAddress('');
    setShipToCity(''); setShipToState(''); setShipToPincode('');
    setError(null);
    setSaveSuccess(false);
    setMode('editing');
    onChallanConsumed?.();
  }, [initialInvoice]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true);
      const [profileData, customerData, challanData] = await Promise.all([
        getBusinessProfile(userId),
        getCustomers(userId),
        getDeliveryChallans(userId),
      ]);
      if (profileData) setProfile(profileData);
      setCustomers(customerData);
      setChallans(challanData);
      // Auto-generate challan number for next new challan
      const nextNum = challanData.length + 1;
      setChallanNumber(`DC/${currentYear}/${String(nextNum).padStart(3, '0')}`);
    } catch {
      setError('Failed to load data. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Derived state ─────────────────────────────────────────────────────────
  const selectedCustomer = useMemo(
    () => customers.find(c => c.id === selectedCustomerId) || null,
    [selectedCustomerId, customers]
  );

  const hsnMinDigits = profile.annualTurnover === 'above5cr' ? 6 : 4;

  const computedTotals = useMemo(() => {
    const subTotal   = r2(items.reduce((s, i) => s + r2(i.quantity * i.rate), 0));
    const taxAmount  = r2(items.reduce((s, i) => s + r2(r2(i.quantity * i.rate) * (i.gstRate / 100)), 0));
    const grandTotal = r2(subTotal + taxAmount);
    const totalQty   = items.reduce((s, i) => s + i.quantity, 0);
    return { subTotal, taxAmount, grandTotal, totalQty };
  }, [items]);

  const filteredChallans = useMemo(() => {
    if (!searchQuery.trim()) return challans;
    const q = searchQuery.toLowerCase();
    return challans.filter(c =>
      c.challanNumber.toLowerCase().includes(q) ||
      c.customerName.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q) ||
      c.date.includes(q)
    );
  }, [challans, searchQuery]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers;
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.gstin || '').toLowerCase().includes(q) ||
      c.phone.includes(q)
    );
  }, [customers, customerSearch]);

  // ─── Item handlers ─────────────────────────────────────────────────────────
  const handleAddItem = () => {
    haptic('light');
    setItems(prev => [...prev, BLANK_ITEM()]);
  };

  const handleRemoveItem = (id: string) => {
    haptic('medium');
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof InvoiceItem, value: string | number) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const handleHSNSelect = (itemId: string, code: string, _desc: string, gstRate: number) => {
    setItems(prev => prev.map(i =>
      i.id === itemId ? { ...i, hsnCode: code, gstRate } : i
    ));
    setHsnModalItemId(null);
  };

  // ─── Challan form builders ─────────────────────────────────────────────────
  const resetForm = () => {
    setEditingChallan(null);
    setSelectedCustomerId('');
    setCustomerSearch('');
    setItems([{ ...BLANK_ITEM(), id: '1' }]);
    setChallanDate(new Date().toISOString().split('T')[0]);
    setInvoiceRef('');
    setVehicleNumber('');
    setTransportMode('');
    setNotes('');
    setChallanStatus('Draft');
    setEnableShipTo(false);
    setShipToName(''); setShipToGstin(''); setShipToAddress('');
    setShipToCity(''); setShipToState(''); setShipToPincode('');
    setError(null);
    setSaveSuccess(false);
    const nextNum = challans.length + 1;
    setChallanNumber(`DC/${currentYear}/${String(nextNum).padStart(3, '0')}`);
  };

  const handleNewChallan = () => {
    haptic('light');
    resetForm();
    setMode('editing');
  };

  const handleEditChallan = (challan: DeliveryChallanType) => {
    haptic('light');
    setEditingChallan(challan);
    setSelectedCustomerId(challan.customerId);
    setCustomerSearch('');
    setChallanNumber(challan.challanNumber);
    setChallanDate(challan.date);
    setInvoiceRef(challan.invoiceNumber || '');
    setItems(challan.items.map(i => ({ ...i })));
    setVehicleNumber(challan.vehicleNumber || '');
    setTransportMode(challan.transportMode || '');
    setNotes(challan.notes || '');
    setChallanStatus(challan.status);
    setEnableShipTo(challan.enableShipTo);
    setShipToName(challan.shipToName || '');
    setShipToGstin(challan.shipToGstin || '');
    setShipToAddress(challan.shipToAddress || '');
    setShipToCity(challan.shipToCity || '');
    setShipToState(challan.shipToState || '');
    setShipToPincode(challan.shipToPincode || '');
    setError(null);
    setSaveSuccess(false);
    setMode('editing');
  };

  const handlePreviewChallan = (challan: DeliveryChallanType) => {
    haptic('light');
    setEditingChallan(challan);
    setSelectedCustomerId(challan.customerId);
    setCustomerSearch('');
    setChallanNumber(challan.challanNumber);
    setChallanDate(challan.date);
    setInvoiceRef(challan.invoiceNumber || '');
    setItems(challan.items.map(i => ({ ...i })));
    setVehicleNumber(challan.vehicleNumber || '');
    setTransportMode(challan.transportMode || '');
    setNotes(challan.notes || '');
    setChallanStatus(challan.status);
    setEnableShipTo(challan.enableShipTo);
    setShipToName(challan.shipToName || '');
    setShipToGstin(challan.shipToGstin || '');
    setShipToAddress(challan.shipToAddress || '');
    setShipToCity(challan.shipToCity || '');
    setShipToState(challan.shipToState || '');
    setShipToPincode(challan.shipToPincode || '');
    setError(null);
    setSaveSuccess(false);
    setMode('preview');
  };

  const buildCurrentChallan = (): DeliveryChallanType => {
    const { subTotal, taxAmount, grandTotal, totalQty } = computedTotals;
    return {
      id: editingChallan?.id || 'preview',
      challanNumber,
      date: challanDate,
      customerId: selectedCustomerId,
      customerName: selectedCustomer?.name || '',
      enableShipTo,
      ...(enableShipTo ? {
        shipToName, shipToGstin, shipToAddress,
        shipToCity, shipToState, shipToPincode,
      } : {}),
      items,
      totalQuantity: totalQty,
      totalBeforeTax: subTotal,
      totalAmount: grandTotal,
      ...(invoiceRef ? { invoiceNumber: invoiceRef } : {}),
      ...(vehicleNumber ? { vehicleNumber } : {}),
      ...(transportMode ? { transportMode } : {}),
      ...(notes ? { notes } : {}),
      status: challanStatus,
    };
  };

  // ─── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!selectedCustomerId) { setError('Please select a customer'); return; }
    if (items.every(i => !i.description.trim())) { setError('Add at least one item with a description'); return; }

    haptic('medium');
    setSaving(true);
    setError(null);

    try {
      const { subTotal, taxAmount, grandTotal, totalQty } = computedTotals;
      const payload: Omit<DeliveryChallanType, 'id'> = {
        challanNumber,
        date: challanDate,
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '',
        enableShipTo,
        ...(enableShipTo ? {
          shipToName: shipToName || undefined,
          shipToGstin: shipToGstin || undefined,
          shipToAddress: shipToAddress || undefined,
          shipToCity: shipToCity || undefined,
          shipToState: shipToState || undefined,
          shipToPincode: shipToPincode || undefined,
        } : {}),
        items,
        totalQuantity: totalQty,
        totalBeforeTax: subTotal,
        totalAmount: grandTotal,
        ...(invoiceRef ? { invoiceNumber: invoiceRef } : {}),
        ...(vehicleNumber ? { vehicleNumber } : {}),
        ...(transportMode ? { transportMode } : {}),
        ...(notes ? { notes } : {}),
        status: challanStatus,
      };

      if (editingChallan) {
        await updateDeliveryChallan(userId, editingChallan.id, payload);
        const updated = { ...editingChallan, ...payload };
        setChallans(prev => prev.map(c => c.id === editingChallan.id ? updated : c));
        setEditingChallan(updated);
      } else {
        const newId = await addDeliveryChallan(userId, payload);
        const newChallan: DeliveryChallanType = { id: newId, ...payload };
        setChallans(prev => [newChallan, ...prev]);
        setEditingChallan(newChallan);
      }

      setSaveSuccess(true);
      setMode('preview');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      setError('Failed to save challan. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (challanId: string) => {
    if (!window.confirm('Delete this delivery challan? This action cannot be undone.')) return;
    haptic('heavy');
    try {
      await deleteDeliveryChallan(userId, challanId);
      setChallans(prev => prev.filter(c => c.id !== challanId));
    } catch {
      setError('Failed to delete challan.');
    }
  };

  // ─── WhatsApp share ────────────────────────────────────────────────────────
  const buildWhatsAppMessage = (challan: DeliveryChallanType) =>
    `Dear ${challan.customerName},\n\nPlease find attached the Delivery Challan *${challan.challanNumber}* dated ${formatDate(challan.date)} for ${challan.totalQuantity} item(s).\n\nRegards,\n${profile.name}`;

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-profee-blue mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400 font-poppins">Loading delivery challans...</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  PREVIEW VIEW
  // ══════════════════════════════════════════════════════════════════════════════
  if (mode === 'preview') {
    const challan = buildCurrentChallan();
    const custObj = selectedCustomer;
    const primaryColor = profile.theme?.primaryColor || '#4c2de0';

    return (
      <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20 font-poppins">

        {/* ── Top bar ── */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMode('list')}
              className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors"
            >
              <ArrowLeft size={18} /> All Challans
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <button
              onClick={() => setMode('editing')}
              className="flex items-center gap-2 text-profee-blue font-bold text-sm hover:underline"
            >
              <Pencil size={16} /> Edit
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {saveSuccess && (
              <div className="flex items-center gap-2 text-emerald-500 px-4">
                <CheckCircle size={18} />
                <span className="text-sm font-bold">Saved!</span>
              </div>
            )}

            {/* Show Prices toggle */}
            <button
              onClick={() => { haptic('light'); setShowPrices(p => !p); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              {showPrices ? <ToggleRight size={18} className="text-profee-blue" /> : <ToggleLeft size={18} />}
              {showPrices ? 'Prices On' : 'Prices Off'}
            </button>

            {/* WhatsApp */}
            {custObj?.phone && (
              <a
                href={`https://wa.me/91${custObj.phone.replace(/\D/g, '')}?text=${encodeURIComponent(buildWhatsAppMessage(challan))}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                style={{ backgroundColor: '#25D366' }}
              >
                <ExternalLink size={15} /> WhatsApp
              </a>
            )}

            {/* Preview PDF */}
            <button
              onClick={() => setPdfModal({ open: true, challan, customer: custObj })}
              className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all"
            >
              <Eye size={16} /> Preview PDF
            </button>

            {/* Download PDF */}
            <button
              onClick={() => setDownloadTarget({ challan, customer: custObj })}
              className="flex items-center gap-2 px-5 py-2.5 bg-profee-blue text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"
            >
              <Download size={16} /> Download PDF
            </button>
          </div>
        </div>

        {/* ── Preview card ── */}
        <div className="bg-white rounded-[2rem] premium-shadow border border-slate-50 overflow-hidden">

          {/* Header */}
          <div className="px-8 pt-8 pb-6 border-b border-slate-50" style={{ borderTop: `4px solid ${primaryColor}` }}>
            <div className="flex flex-wrap justify-between items-start gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-base"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Truck size={18} />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-slate-900 font-poppins">{challanNumber}</h2>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Delivery Challan</p>
                  </div>
                </div>
                <p className="text-sm text-slate-500 font-medium mt-1">
                  {formatDate(challanDate)} · {custObj?.name || challan.customerName}
                </p>
                {invoiceRef && (
                  <p className="text-xs text-slate-400 mt-1">Ref. Invoice: {invoiceRef}</p>
                )}
              </div>
              <div className="text-right">
                <StatusBadge status={challanStatus} />
                <p className="text-3xl font-black text-slate-900 mt-3">
                  {challan.totalQuantity} <span className="text-base font-bold text-slate-400">items</span>
                </p>
                {showPrices && (
                  <p className="text-sm font-bold text-emerald-600">{inr(computedTotals.grandTotal)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Bill To / Ship To */}
          <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 border-b border-slate-50">
            <div className="bg-slate-50 rounded-2xl p-5">
              <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: primaryColor }}>Bill To</p>
              <p className="text-sm font-black text-slate-900">{custObj?.name || '—'}</p>
              {custObj?.address && (
                <p className="text-xs text-slate-500 leading-relaxed mt-1">
                  {custObj.address}, {custObj.city}, {custObj.state} – {custObj.pincode}
                </p>
              )}
              {custObj?.phone && <p className="text-xs text-slate-400 mt-1">Ph: {custObj.phone}</p>}
              {custObj?.gstin && <p className="text-xs font-bold text-slate-600 mt-1">GSTIN: {custObj.gstin}</p>}
            </div>
            <div className="bg-slate-50 rounded-2xl p-5">
              <p className="text-[10px] font-black uppercase tracking-widest mb-3 text-slate-400">Ship To</p>
              {enableShipTo ? (
                <>
                  <p className="text-sm font-black text-slate-900">{shipToName || '—'}</p>
                  {shipToAddress && (
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">
                      {shipToAddress}{shipToCity ? `, ${shipToCity}` : ''}{shipToState ? `, ${shipToState}` : ''}{shipToPincode ? ` – ${shipToPincode}` : ''}
                    </p>
                  )}
                  {shipToGstin && <p className="text-xs font-bold text-slate-600 mt-1">GSTIN: {shipToGstin}</p>}
                </>
              ) : (
                <p className="text-sm text-slate-400 italic">Same as Bill To</p>
              )}
            </div>
          </div>

          {/* Transport details */}
          {(vehicleNumber || transportMode) && (
            <div className="px-8 py-4 bg-slate-50/50 border-b border-slate-50 flex flex-wrap gap-6">
              {vehicleNumber && (
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vehicle No.</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{vehicleNumber}</p>
                </div>
              )}
              {transportMode && (
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Transport Mode</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">{transportMode}</p>
                </div>
              )}
            </div>
          )}

          {/* Items table */}
          <div className="px-8 py-6 overflow-x-auto">
            <table className="w-full text-left border-collapse rounded-2xl overflow-hidden border border-slate-100">
              <thead>
                <tr className="text-white text-[10px] font-black uppercase tracking-widest" style={{ backgroundColor: primaryColor }}>
                  <th className="px-4 py-3 w-8">#</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-3 py-3 text-center">HSN/SAC</th>
                  <th className="px-3 py-3 text-center">Qty</th>
                  <th className="px-3 py-3 text-center">Unit</th>
                  {showPrices && (
                    <>
                      <th className="px-3 py-3 text-right">Rate</th>
                      <th className="px-3 py-3 text-center">GST%</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((item, idx) => {
                  const lineTotal = r2(item.quantity * item.rate);
                  const itemTax   = r2(lineTotal * (item.gstRate / 100));
                  return (
                    <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      <td className="px-4 py-3 text-slate-400 font-bold text-xs">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-slate-800">{item.description || '—'}</p>
                        {item.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{item.notes}</p>}
                      </td>
                      <td className="px-3 py-3 text-center text-xs text-slate-500">{item.hsnCode || '—'}</td>
                      <td className="px-3 py-3 text-center text-sm font-black text-slate-800">{item.quantity}</td>
                      <td className="px-3 py-3 text-center text-xs text-slate-500">{item.unit || '—'}</td>
                      {showPrices && (
                        <>
                          <td className="px-3 py-3 text-right text-xs text-slate-600">{inr(item.rate)}</td>
                          <td className="px-3 py-3 text-center text-xs text-slate-500">{item.gstRate}%</td>
                          <td className="px-4 py-3 text-right text-sm font-black text-slate-900">{inr(lineTotal + itemTax)}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-xs font-black text-slate-700 uppercase tracking-wider">Total</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-center text-sm font-black text-slate-900">{computedTotals.totalQty}</td>
                  <td className="px-3 py-3" />
                  {showPrices && (
                    <>
                      <td className="px-3 py-3" />
                      <td className="px-3 py-3" />
                      <td className="px-4 py-3 text-right text-sm font-black text-slate-900">{inr(computedTotals.grandTotal)}</td>
                    </>
                  )}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals summary (when prices are shown) */}
          {showPrices && (
            <div className="px-8 pb-6 flex justify-end">
              <div className="w-full max-w-xs space-y-2">
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-slate-500">Sub Total</span>
                  <span className="font-bold text-slate-800">{inr(computedTotals.subTotal)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium text-emerald-600">
                  <span>GST</span>
                  <span className="font-bold">{inr(computedTotals.taxAmount)}</span>
                </div>
                <div className="flex justify-between pt-3 border-t-2 border-slate-200">
                  <span className="text-base font-black text-slate-900">Total</span>
                  <span className="text-xl font-black" style={{ color: primaryColor }}>{inr(computedTotals.grandTotal)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {notes && (
            <div className="px-8 pb-6 border-t border-slate-50 pt-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Notes</p>
              <p className="text-sm text-slate-600 leading-relaxed">{notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/30 text-center">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">
              Generated by <span className="text-slate-700">BillHippo Smart OS</span>
              {profile.email ? ` · ${profile.email}` : ''}
            </p>
          </div>
        </div>

        {/* PDF Preview Modal */}
        {pdfModal.open && pdfModal.challan && (
          <PDFPreviewModal
            open={pdfModal.open}
            onClose={() => setPdfModal({ open: false, challan: null, customer: null })}
            document={
              <DeliveryChallanPDF
                challan={pdfModal.challan}
                business={profile}
                customer={pdfModal.customer || {
                  id: '', name: pdfModal.challan.customerName, phone: '', email: '',
                  address: '', city: '', state: '', pincode: '', balance: 0,
                }}
                showPrices={showPrices}
              />
            }
            fileName={`Challan-${pdfModal.challan.challanNumber.replace(/\//g, '-')}.pdf`}
            customerPhone={pdfModal.customer?.phone}
            whatsappMessage={buildWhatsAppMessage(pdfModal.challan)}
          />
        )}

        {/* PDF Direct Download */}
        {downloadTarget && (
          <PDFDirectDownload
            document={
              <DeliveryChallanPDF
                challan={downloadTarget.challan}
                business={profile}
                customer={downloadTarget.customer || {
                  id: '', name: downloadTarget.challan.customerName, phone: '', email: '',
                  address: '', city: '', state: '', pincode: '', balance: 0,
                }}
                showPrices={showPrices}
              />
            }
            fileName={`Challan-${downloadTarget.challan.challanNumber.replace(/\//g, '-')}.pdf`}
            onDone={() => setDownloadTarget(null)}
          />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  EDITING VIEW
  // ══════════════════════════════════════════════════════════════════════════════
  if (mode === 'editing') {
    const primaryColor = profile.theme?.primaryColor || '#4c2de0';

    return (
      <div className="max-w-7xl mx-auto animate-in fade-in duration-500 pb-24 font-poppins">

        {/* ── Page header ── */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => setMode('list')}
            className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors"
          >
            <ArrowLeft size={18} /> All Challans
          </button>
          <div className="w-px h-5 bg-slate-200" />
          <h1 className="text-xl font-black text-slate-900">
            {editingChallan ? 'Edit Challan' : 'New Delivery Challan'}
          </h1>
        </div>

        {error && (
          <div className="mb-6 px-5 py-3 bg-rose-50 border border-rose-100 rounded-2xl text-sm font-bold text-rose-600 flex items-center gap-2">
            <X size={16} /> {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT COLUMN ── */}
          <div className="lg:col-span-8 space-y-6">

            {/* ── 1. Party & Challan details ── */}
            <div className="bg-white rounded-[2rem] premium-shadow border border-slate-50 p-6 space-y-5">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">Party & Challan Details</h2>

              {/* Customer dropdown */}
              <div className="relative">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Customer / Party *</label>
                <div
                  className="w-full flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 cursor-pointer border-2 transition-colors"
                  style={{ borderColor: showCustomerDropdown ? primaryColor : 'transparent' }}
                  onClick={() => { setShowCustomerDropdown(v => !v); setCustomerSearch(''); }}
                >
                  <span className={`text-sm font-medium ${selectedCustomer ? 'text-slate-800' : 'text-slate-400'}`}>
                    {selectedCustomer ? selectedCustomer.name : 'Select a customer…'}
                  </span>
                  <Package size={16} className="text-slate-300 shrink-0" />
                </div>
                {showCustomerDropdown && (
                  <div className="absolute z-30 left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                    <div className="p-3 border-b border-slate-50">
                      <input
                        type="text"
                        placeholder="Search customers…"
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        autoFocus
                        className="w-full bg-slate-50 rounded-xl px-4 py-2.5 text-sm font-medium border-none focus:ring-2 ring-indigo-100"
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {filteredCustomers.length === 0 ? (
                        <p className="px-4 py-6 text-sm text-slate-400 text-center">No customers found</p>
                      ) : (
                        filteredCustomers.map(c => (
                          <button
                            key={c.id}
                            onClick={() => { setSelectedCustomerId(c.id); setShowCustomerDropdown(false); setCustomerSearch(''); }}
                            className="w-full text-left px-4 py-3 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0"
                          >
                            <p className="text-sm font-bold text-slate-800">{c.name}</p>
                            <p className="text-xs text-slate-400">{c.phone}{c.gstin ? ` · GSTIN: ${c.gstin}` : ''}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Challan Number</label>
                  <input
                    type="text"
                    value={challanNumber}
                    onChange={e => setChallanNumber(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Date</label>
                  <input
                    type="date"
                    value={challanDate}
                    onChange={e => setChallanDate(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                  />
                </div>
              </div>
            </div>

            {/* ── 2. Ship To (toggle) ── */}
            <div className="bg-white rounded-[2rem] premium-shadow border border-slate-50 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">Ship To Address</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Enable if delivery is to a different address</p>
                </div>
                <button
                  onClick={() => { haptic('light'); setEnableShipTo(v => !v); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                  style={enableShipTo
                    ? { backgroundColor: `${primaryColor}15`, color: primaryColor }
                    : { backgroundColor: '#f1f5f9', color: '#64748b' }
                  }
                >
                  {enableShipTo
                    ? <ToggleRight size={20} style={{ color: primaryColor }} />
                    : <ToggleLeft size={20} />
                  }
                  {enableShipTo ? 'Enabled' : 'Disabled'}
                </button>
              </div>

              {enableShipTo && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-50">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Ship To Name / Company</label>
                    <input
                      type="text"
                      value={shipToName}
                      onChange={e => setShipToName(e.target.value)}
                      placeholder="Recipient name or company"
                      className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">GSTIN (optional)</label>
                    <input
                      type="text"
                      value={shipToGstin}
                      onChange={e => setShipToGstin(e.target.value.toUpperCase())}
                      placeholder="Ship-to party GSTIN"
                      className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Address</label>
                    <input
                      type="text"
                      value={shipToAddress}
                      onChange={e => setShipToAddress(e.target.value)}
                      placeholder="Street address"
                      className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">City</label>
                    <input
                      type="text"
                      value={shipToCity}
                      onChange={e => setShipToCity(e.target.value)}
                      placeholder="City"
                      className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">State</label>
                    <input
                      type="text"
                      value={shipToState}
                      onChange={e => setShipToState(e.target.value)}
                      placeholder="State"
                      className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Pincode</label>
                    <input
                      type="text"
                      value={shipToPincode}
                      onChange={e => setShipToPincode(e.target.value)}
                      placeholder="Pincode"
                      className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── 3. Particulars (Items) ── */}
            <div className="bg-white rounded-[2rem] premium-shadow border border-slate-50 p-6 space-y-4">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">Particulars</h2>

              {/* Items */}
              <div className="space-y-3">
                {items.map((item, idx) => (
                  <div key={item.id} className="bg-slate-50 rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-slate-400">Item {idx + 1}</span>
                      {items.length > 1 && (
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1.5 rounded-xl bg-rose-50 text-rose-400 hover:bg-rose-100 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Description</label>
                      <input
                        type="text"
                        value={item.description}
                        onChange={e => handleItemChange(item.id, 'description', e.target.value)}
                        placeholder="Item description"
                        className="w-full bg-white border-none rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                      />
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Notes (optional)</label>
                      <input
                        type="text"
                        value={item.notes || ''}
                        onChange={e => handleItemChange(item.id, 'notes', e.target.value)}
                        placeholder="Additional notes"
                        className="w-full bg-white border-none rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 focus:ring-2 ring-indigo-100"
                      />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* HSN */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">HSN/SAC</label>
                        <HSNInput
                          value={item.hsnCode}
                          onChange={val => handleItemChange(item.id, 'hsnCode', val)}
                          onOpenModal={() => setHsnModalItemId(item.id)}
                          minDigits={hsnMinDigits}
                        />
                      </div>

                      {/* Qty */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantity</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={e => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                          className="w-full bg-white border-none rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                        />
                      </div>

                      {/* Unit */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Unit</label>
                        <input
                          type="text"
                          value={item.unit || ''}
                          onChange={e => handleItemChange(item.id, 'unit', e.target.value)}
                          placeholder="PCS / KG / MTR"
                          className="w-full bg-white border-none rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                        />
                      </div>

                      {/* Rate */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Rate (₹)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate}
                          onChange={e => handleItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)}
                          className="w-full bg-white border-none rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                        />
                      </div>

                      {/* GST% */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">GST%</label>
                        <select
                          value={item.gstRate}
                          onChange={e => handleItemChange(item.id, 'gstRate', parseFloat(e.target.value))}
                          className="w-full bg-white border-none rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                        >
                          {[0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 9, 12, 18, 28].map(r => (
                            <option key={r} value={r}>{r}%</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add item button */}
              <button
                onClick={handleAddItem}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-200 text-sm font-bold text-slate-400 hover:border-profee-blue hover:text-profee-blue transition-all"
              >
                <Plus size={16} /> Add Item
              </button>
            </div>

            {/* ── 4. Transport & Reference ── */}
            <div className="bg-white rounded-[2rem] premium-shadow border border-slate-50 p-6 space-y-5">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">Transport & Reference</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Vehicle Number</label>
                  <input
                    type="text"
                    value={vehicleNumber}
                    onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="e.g. MH 02 AB 1234"
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Transport Mode</label>
                  <select
                    value={transportMode}
                    onChange={e => setTransportMode(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                  >
                    <option value="">Select mode…</option>
                    {TRANSPORT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Reference Invoice #</label>
                  <input
                    type="text"
                    value={invoiceRef}
                    onChange={e => setInvoiceRef(e.target.value)}
                    placeholder="e.g. INV/2026/001"
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Status</label>
                  <select
                    value={challanStatus}
                    onChange={e => setChallanStatus(e.target.value as 'Draft' | 'Dispatched' | 'Delivered')}
                    className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100"
                  >
                    <option value="Draft">Draft</option>
                    <option value="Dispatched">Dispatched</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Any additional notes for this challan…"
                  rows={3}
                  className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-medium text-slate-800 focus:ring-2 ring-indigo-100 resize-none"
                />
              </div>
            </div>
          </div>

          {/* ── RIGHT COLUMN ── */}
          <div className="lg:col-span-4 space-y-5">

            {/* ── 5. Summary ── */}
            <div className="bg-white rounded-[2rem] premium-shadow border border-slate-50 p-6 space-y-4 sticky top-4">
              <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">Summary</h2>

              <div className="space-y-2 text-sm font-medium">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Items</span>
                  <span className="font-bold text-slate-800">{items.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Qty</span>
                  <span className="font-bold text-slate-800">{computedTotals.totalQty}</span>
                </div>
                {showPrices && (
                  <>
                    <div className="flex justify-between pt-2 border-t border-slate-100">
                      <span className="text-slate-400">Sub Total</span>
                      <span className="font-bold text-slate-800">{inr(computedTotals.subTotal)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600">
                      <span>GST</span>
                      <span className="font-bold">{inr(computedTotals.taxAmount)}</span>
                    </div>
                    <div className="flex justify-between pt-3 border-t-2 border-slate-100">
                      <span className="font-black text-slate-900">Grand Total</span>
                      <span className="font-black text-lg" style={{ color: primaryColor }}>
                        {inr(computedTotals.grandTotal)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* ── 6. PDF Options ── */}
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">PDF Options</p>
                <button
                  onClick={() => { haptic('light'); setShowPrices(p => !p); }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all"
                  style={showPrices
                    ? { backgroundColor: `${primaryColor}10`, borderColor: `${primaryColor}30` }
                    : { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }
                  }
                >
                  <div className="text-left">
                    <p className="text-sm font-bold" style={{ color: showPrices ? primaryColor : '#64748b' }}>
                      Show Prices
                    </p>
                    <p className="text-xs text-slate-400">Include rates and amounts in PDF</p>
                  </div>
                  {showPrices
                    ? <ToggleRight size={22} style={{ color: primaryColor }} />
                    : <ToggleLeft size={22} className="text-slate-300" />
                  }
                </button>
              </div>

              {/* ── 7. Save / Preview ── */}
              <div className="space-y-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-black text-white transition-all disabled:opacity-60 shadow-md"
                  style={{ backgroundColor: primaryColor }}
                >
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {saving ? 'Saving…' : (editingChallan ? 'Update Challan' : 'Save Challan')}
                </button>

                {editingChallan && (
                  <button
                    onClick={() => setMode('preview')}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
                  >
                    <Eye size={16} /> Preview
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* HSN Search Modal */}
        {hsnModalItemId !== null && (
          <HSNSearchModal
            isOpen={true}
            onClose={() => setHsnModalItemId(null)}
            onSelect={(code, desc, gst) => handleHSNSelect(hsnModalItemId, code, desc, gst)}
            minDigits={hsnMinDigits}
            currentValue={items.find(i => i.id === hsnModalItemId)?.hsnCode || ''}
          />
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════════
  //  LIST VIEW
  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-7xl mx-auto animate-in fade-in duration-500 font-poppins pb-20">

      {/* ── Page header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Delivery Challans</h1>
          <p className="text-sm text-slate-400 font-medium mt-0.5">Manage goods dispatch documents</p>
        </div>
        <button
          onClick={handleNewChallan}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white shadow-md transition-all hover:opacity-90"
          style={{ backgroundColor: profile.theme?.primaryColor || '#4c2de0' }}
        >
          <Plus size={18} /> New Challan
        </button>
      </div>

      {error && (
        <div className="mb-6 px-5 py-3 bg-rose-50 border border-rose-100 rounded-2xl text-sm font-bold text-rose-600 flex items-center gap-2">
          <X size={16} /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {challans.length === 0 ? (
        /* ── Empty state ── */
        <div className="bg-white rounded-[2.5rem] premium-shadow border border-slate-50 flex flex-col items-center justify-center py-24 px-8 text-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
            style={{ backgroundColor: `${profile.theme?.primaryColor || '#4c2de0'}15` }}
          >
            <Truck size={36} style={{ color: profile.theme?.primaryColor || '#4c2de0' }} />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">No Delivery Challans Yet</h2>
          <p className="text-sm text-slate-400 font-medium max-w-xs mb-8">
            Create your first delivery challan to track goods dispatched to customers.
          </p>
          <button
            onClick={handleNewChallan}
            className="flex items-center gap-2 px-8 py-4 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90 shadow-md"
            style={{ backgroundColor: profile.theme?.primaryColor || '#4c2de0' }}
          >
            <Plus size={18} /> Create Delivery Challan
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] premium-shadow border border-slate-50 overflow-hidden">

          {/* ── Search bar ── */}
          <div className="px-8 pt-8 pb-5 border-b border-slate-50">
            <div className="relative max-w-md">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                type="text"
                placeholder="Search by challan #, party, status…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-5 py-3.5 bg-slate-50 rounded-2xl text-sm font-medium text-slate-700 placeholder-slate-300 border-none focus:ring-2 ring-indigo-50 font-poppins"
              />
            </div>
          </div>

          {/* ── Mobile card list (< md) ── */}
          <div className="md:hidden divide-y divide-slate-50">
            {filteredChallans.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-400 font-medium">
                No challans match &ldquo;{searchQuery}&rdquo;
              </p>
            ) : (
              filteredChallans.map(challan => {
                const custObj = customers.find(c => c.id === challan.customerId) || null;
                return (
                  <div key={challan.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">{challan.challanNumber}</p>
                        <p className="text-sm font-medium text-slate-600 truncate">{challan.customerName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{formatDate(challan.date)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <StatusBadge status={challan.status} />
                        <p className="text-xs text-slate-500 mt-1">{challan.totalQuantity} items</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => { haptic('light'); handlePreviewChallan(challan); }}
                        className="flex-1 py-2 rounded-xl bg-indigo-50 text-profee-blue text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                      >
                        <Eye size={13} /> View
                      </button>
                      <button
                        onClick={() => { haptic('light'); handleEditChallan(challan); }}
                        className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                      >
                        <Pencil size={13} /> Edit
                      </button>
                      <button
                        onClick={() => {
                          haptic('light');
                          setDownloadTarget({ challan, customer: custObj });
                        }}
                        className="flex-1 py-2 rounded-xl bg-indigo-50 text-profee-blue text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                      >
                        <Download size={13} /> PDF
                      </button>
                      <button
                        onClick={() => { haptic('heavy'); handleDelete(challan.id); }}
                        className="p-2 rounded-xl bg-rose-50 text-rose-400 active:scale-95 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Desktop table (hidden on mobile) ── */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse font-poppins">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Date</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Challan #</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Party Name</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center whitespace-nowrap">Total Qty</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Amount</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredChallans.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-sm text-slate-400 font-medium">
                      No challans match &ldquo;{searchQuery}&rdquo;
                    </td>
                  </tr>
                ) : (
                  filteredChallans.map((challan, idx) => {
                    const custObj = customers.find(c => c.id === challan.customerId) || null;
                    return (
                      <tr
                        key={challan.id}
                        className={`hover:bg-indigo-50/20 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}
                      >
                        <td className="px-6 py-4 text-sm font-bold text-slate-600 whitespace-nowrap">
                          {formatDate(challan.date)}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-slate-900 whitespace-nowrap">
                          {challan.challanNumber}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-slate-700 max-w-[180px] truncate">
                          {challan.customerName}
                        </td>
                        <td className="px-6 py-4 text-sm font-black text-slate-800 text-center">
                          {challan.totalQuantity}
                        </td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-700 text-right whitespace-nowrap">
                          {inr(challan.totalAmount)}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge status={challan.status} />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handlePreviewChallan(challan)}
                              title="Preview Challan"
                              className="p-2 rounded-xl bg-indigo-50 text-profee-blue hover:bg-profee-blue hover:text-white transition-all"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              onClick={() => handleEditChallan(challan)}
                              title="Edit Challan"
                              className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-700 hover:text-white transition-all"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => setPdfModal({ open: true, challan, customer: custObj })}
                              title="Preview PDF"
                              className="p-2 rounded-xl bg-indigo-50 text-profee-blue hover:bg-profee-blue hover:text-white transition-all"
                            >
                              <FileText size={15} />
                            </button>
                            <button
                              onClick={() => setDownloadTarget({ challan, customer: custObj })}
                              title="Download PDF"
                              className="p-2 rounded-xl bg-indigo-50 text-profee-blue hover:bg-profee-blue hover:text-white transition-all"
                            >
                              <Download size={15} />
                            </button>
                            <button
                              onClick={() => handleDelete(challan.id)}
                              title="Delete Challan"
                              className="p-2 rounded-xl bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all"
                            >
                              <Trash2 size={15} />
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
        </div>
      )}

      {/* ── PDF Preview Modal (from list) ── */}
      {pdfModal.open && pdfModal.challan && (
        <PDFPreviewModal
          open={pdfModal.open}
          onClose={() => setPdfModal({ open: false, challan: null, customer: null })}
          document={
            <DeliveryChallanPDF
              challan={pdfModal.challan}
              business={profile}
              customer={pdfModal.customer || {
                id: '', name: pdfModal.challan.customerName, phone: '', email: '',
                address: '', city: '', state: '', pincode: '', balance: 0,
              }}
              showPrices={showPrices}
            />
          }
          fileName={`Challan-${pdfModal.challan.challanNumber.replace(/\//g, '-')}.pdf`}
          customerPhone={pdfModal.customer?.phone}
          whatsappMessage={buildWhatsAppMessage(pdfModal.challan)}
        />
      )}

      {/* ── PDF Direct Download ── */}
      {downloadTarget && (
        <PDFDirectDownload
          document={
            <DeliveryChallanPDF
              challan={downloadTarget.challan}
              business={profile}
              customer={downloadTarget.customer || {
                id: '', name: downloadTarget.challan.customerName, phone: '', email: '',
                address: '', city: '', state: '', pincode: '', balance: 0,
              }}
              showPrices={showPrices}
            />
          }
          fileName={`Challan-${downloadTarget.challan.challanNumber.replace(/\//g, '-')}.pdf`}
          onDone={() => setDownloadTarget(null)}
        />
      )}

      {/* ── HSN Modal ── */}
      {hsnModalItemId !== null && (
        <HSNSearchModal
          isOpen={true}
          onClose={() => setHsnModalItemId(null)}
          onSelect={(code, desc, gst) => handleHSNSelect(hsnModalItemId, code, desc, gst)}
          minDigits={hsnMinDigits}
          currentValue={items.find(i => i.id === hsnModalItemId)?.hsnCode || ''}
        />
      )}
    </div>
  );
};

export default DeliveryChallan;
