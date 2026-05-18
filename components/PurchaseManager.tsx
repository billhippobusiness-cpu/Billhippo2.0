/**
 * PurchaseManager — Records goods received from suppliers (inward movements).
 *
 * Each line item picked from the inventory catalogue increments that item's
 * stock on save. Edits and deletes reverse the prior adjustment and reapply
 * the new one, so the inventory page always reflects net movements.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronDown, Pencil, Search, X, ArrowLeft, Save, Loader2,
  CheckCircle, Package, ShoppingBag,
} from 'lucide-react';
import {
  GSTType, type PurchaseItem, type Purchase, type BusinessProfile, type InventoryItem,
} from '../types';
import {
  getBusinessProfile, getInventoryItems, getPurchases,
  addPurchase, updatePurchase, deletePurchase, applyStockAdjustments,
  addInventoryItem,
} from '../lib/firestore';
import DeleteConfirmationModal from './DeleteConfirmationModal';

const currentYear = new Date().getFullYear();

const STATES = [
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat',
  'Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh',
  'Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan',
  'Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
  'Delhi','Jammu and Kashmir','Ladakh','Puducherry','Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu','Lakshadweep','Andaman and Nicobar Islands',
];

const GST_RATES = [0, 5, 12, 18, 28];

const DEFAULT_PROFILE: BusinessProfile = {
  name: 'Your Business', gstin: '', address: '', city: '', state: 'Maharashtra', pincode: '',
  phone: '', email: '', pan: '', gstEnabled: true,
  theme: { templateId: 'modern-2', primaryColor: '#4c2de0', fontFamily: 'Poppins, sans-serif', invoicePrefix: `INV/${currentYear}/`, autoNumbering: true },
};

const inr = (n: number) =>
  `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (d: string) => {
  if (!d) return '';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
};

const newLineItem = (): PurchaseItem => ({
  id: Math.random().toString(36).slice(2, 11),
  description: '',
  hsnCode: '',
  quantity: 1,
  rate: 0,
  gstRate: 18,
});

interface Props { userId: string; }

type Mode = 'list' | 'editing';

const PurchaseManager: React.FC<Props> = ({ userId }) => {
  const [mode, setMode] = useState<Mode>('list');

  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Purchase | null>(null);

  // Form state
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [purchaseNumber, setPurchaseNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [supplierState, setSupplierState] = useState('Maharashtra');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([newLineItem()]);

  // Inventory picker modal
  const [showInventoryPicker, setShowInventoryPicker] = useState(false);
  const [inventorySearch, setInventorySearch] = useState('');
  const [activeDescItemId, setActiveDescItemId] = useState<string | null>(null);

  useEffect(() => { loadData(); }, [userId]);

  async function loadData() {
    try {
      setLoading(true);
      const [profileData, purchaseData] = await Promise.all([
        getBusinessProfile(userId),
        getPurchases(userId),
      ]);
      if (profileData) setProfile(profileData);
      setPurchases(purchaseData);
      // Auto-number
      setPurchaseNumber(`PUR/${currentYear}/${String(purchaseData.length + 1).padStart(3, '0')}`);
    } catch {
      setError('Failed to load purchases. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  async function ensureInventoryLoaded() {
    if (!inventoryLoaded) {
      const data = await getInventoryItems(userId);
      setInventoryItems(data);
      setInventoryLoaded(true);
    }
  }

  // Inter-state purchase ⇒ IGST; same-state ⇒ CGST+SGST
  const gstType = useMemo<GSTType>(() => {
    return supplierState === profile.state ? GSTType.CGST_SGST : GSTType.IGST;
  }, [supplierState, profile.state]);

  const subTotal = items.reduce((s, i) => s + i.quantity * i.rate, 0);
  const taxAmount = items.reduce((s, i) => s + (i.quantity * i.rate * i.gstRate) / 100, 0);
  const grandTotal = subTotal + taxAmount;

  // ── Item handlers ──
  const addRow = () => setItems(prev => [...prev, newLineItem()]);
  const removeRow = (id: string) => setItems(prev => prev.length === 1 ? prev : prev.filter(i => i.id !== id));
  const updateRow = (id: string, field: keyof PurchaseItem, value: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const openInventoryPicker = async () => {
    await ensureInventoryLoaded();
    setInventorySearch('');
    setShowInventoryPicker(true);
  };

  const pickInventoryForLine = async (lineId: string) => {
    await ensureInventoryLoaded();
    setActiveDescItemId(lineId);
  };

  const handlePickInline = (lineId: string, inv: InventoryItem) => {
    setItems(prev => prev.map(i => i.id === lineId ? {
      ...i,
      inventoryItemId: inv.id,
      description: inv.name,
      hsnCode: inv.hsnCode,
      unit: inv.unit,
      quantity: i.quantity || 1,
      // Default cost rate to the inventory's cost price (fallback to selling)
      rate: inv.costPrice && inv.costPrice > 0 ? inv.costPrice : (i.rate || inv.sellingPrice || 0),
      gstRate: inv.gstRate,
    } : i));
    setActiveDescItemId(null);
  };

  const handlePickModal = (inv: InventoryItem) => {
    const firstEmpty = items.find(i => !i.description.trim());
    const newItem: PurchaseItem = {
      id: firstEmpty?.id || Math.random().toString(36).slice(2, 11),
      inventoryItemId: inv.id,
      description: inv.name,
      hsnCode: inv.hsnCode,
      unit: inv.unit,
      quantity: 1,
      rate: inv.costPrice && inv.costPrice > 0 ? inv.costPrice : (inv.sellingPrice || 0),
      gstRate: inv.gstRate,
    };
    if (firstEmpty) {
      setItems(prev => prev.map(i => i.id === firstEmpty.id ? newItem : i));
    } else {
      setItems(prev => [...prev, newItem]);
    }
    setShowInventoryPicker(false);
  };

  // ── Mode handlers ──
  const startNew = () => {
    setEditingPurchase(null);
    setPurchaseNumber(`PUR/${currentYear}/${String(purchases.length + 1).padStart(3, '0')}`);
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setSupplierName('');
    setSupplierGstin('');
    setSupplierState(profile.state || 'Maharashtra');
    setNotes('');
    setItems([newLineItem()]);
    setError(null);
    setSaveSuccess(false);
    setMode('editing');
  };

  const startEdit = (p: Purchase) => {
    setEditingPurchase(p);
    setPurchaseNumber(p.purchaseNumber);
    setPurchaseDate(p.date);
    setSupplierName(p.supplierName);
    setSupplierGstin(p.supplierGstin || '');
    setSupplierState(p.supplierState || profile.state || 'Maharashtra');
    setNotes(p.notes || '');
    setItems(p.items.length ? p.items : [newLineItem()]);
    setError(null);
    setSaveSuccess(false);
    setMode('editing');
  };

  const cancelEdit = () => {
    setMode('list');
    setError(null);
  };

  const handleSave = async () => {
    if (!supplierName.trim()) { setError('Please enter a supplier name'); return; }
    if (items.every(i => !i.description.trim())) { setError('Add at least one item'); return; }
    if (subTotal === 0) { setError('Purchase total cannot be zero'); return; }
    setSaving(true); setError(null);
    try {
      const cgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
      const sgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
      const igst = gstType === GSTType.IGST ? taxAmount : 0;

      // Always fetch the freshest inventory before saving so concurrent edits
      // don't cause duplicate catalogue entries.
      const latestInventory = await getInventoryItems(userId);
      setInventoryItems(latestInventory);
      setInventoryLoaded(true);

      const nameMap = new Map(latestInventory.map(it => [it.name.trim().toLowerCase(), it.id]));
      // HSN map — only use when exactly one inventory item has that HSN (avoids ambiguity)
      const hsnCount = new Map<string, number>();
      const hsnMap   = new Map<string, string>();
      for (const it of latestInventory) {
        if (!it.hsnCode) continue;
        const key = it.hsnCode.trim().toLowerCase();
        hsnCount.set(key, (hsnCount.get(key) ?? 0) + 1);
        hsnMap.set(key, it.id);
      }

      // Drop empty lines; for each remaining line resolve (or auto-create) an
      // inventory entry so stock can be incremented uniformly.
      const rawLines = items.filter(i => i.description.trim());
      const newInventoryCreated: InventoryItem[] = [];
      const cleanItems: PurchaseItem[] = [];
      for (const i of rawLines) {
        let inventoryItemId = i.inventoryItemId;
        if (!inventoryItemId) {
          inventoryItemId = nameMap.get(i.description.trim().toLowerCase());
          if (!inventoryItemId && i.hsnCode) {
            const hsnKey = i.hsnCode.trim().toLowerCase();
            if ((hsnCount.get(hsnKey) ?? 0) === 1) {
              inventoryItemId = hsnMap.get(hsnKey);
            }
          }
        }
        if (!inventoryItemId) {
          // Item isn't in the catalogue yet → create it now with stock = 0.
          // applyStockAdjustments below will increment by the purchase qty.
          const draft: Omit<InventoryItem, 'id'> = {
            name: i.description.trim(),
            hsnCode: i.hsnCode || '',
            unit: i.unit || 'PCS',
            sellingPrice: 0,
            costPrice: i.rate,
            gstRate: i.gstRate,
            stock: 0,
          };
          inventoryItemId = await addInventoryItem(userId, draft);
          // Make the new id discoverable for any subsequent lines with the same name
          nameMap.set(draft.name.toLowerCase(), inventoryItemId);
          newInventoryCreated.push({ id: inventoryItemId, ...draft });
        }
        const { unit, ...rest } = i;
        cleanItems.push({
          ...rest,
          inventoryItemId,
          ...(unit ? { unit } : {}),
        } as PurchaseItem);
      }

      // Keep the local cache in sync so the picker reflects newly-created items
      if (newInventoryCreated.length) {
        setInventoryItems(prev => [...prev, ...newInventoryCreated]);
      }

      const payload: Omit<Purchase, 'id'> = {
        purchaseNumber: purchaseNumber.trim(),
        date: purchaseDate,
        supplierName: supplierName.trim(),
        ...(supplierGstin.trim() ? { supplierGstin: supplierGstin.trim() } : {}),
        supplierState,
        items: cleanItems,
        gstType,
        totalBeforeTax: subTotal,
        cgst, sgst, igst,
        totalAmount: grandTotal,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        stockApplied: true,
      };

      if (editingPurchase) {
        await updatePurchase(userId, editingPurchase.id, payload);
        // Reverse prior stock adjustment then apply new
        if (editingPurchase.stockApplied) {
          await applyStockAdjustments(userId, editingPurchase.items, 'outward');
        }
        await applyStockAdjustments(userId, cleanItems, 'inward');
        setPurchases(prev =>
          prev.map(p => p.id === editingPurchase.id ? { ...p, ...payload } : p)
        );
      } else {
        const id = await addPurchase(userId, payload);
        await applyStockAdjustments(userId, cleanItems, 'inward');
        setPurchases(prev =>
          [{ id, ...payload }, ...prev].sort((a, b) => b.date.localeCompare(a.date))
        );
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      setMode('list');
    } catch (e) {
      console.error(e);
      setError('Failed to save purchase. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    const target = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await deletePurchase(userId, target.id);
      if (target.stockApplied) {
        await applyStockAdjustments(userId, target.items, 'outward');
      }
      setPurchases(prev => prev.filter(p => p.id !== target.id));
    } catch {
      setError('Failed to delete purchase.');
    }
  };

  // ── Filtered list ──
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter(p =>
      p.purchaseNumber.toLowerCase().includes(q) ||
      p.supplierName.toLowerCase().includes(q) ||
      (p.supplierGstin || '').toLowerCase().includes(q),
    );
  }, [purchases, searchQuery]);

  const totalPurchaseValue = useMemo(
    () => purchases.reduce((s, p) => s + (p.totalAmount || 0), 0),
    [purchases],
  );

  // ──────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 text-slate-400 text-sm">
        Loading purchases…
      </div>
    );
  }

  // ── List mode ──
  if (mode === 'list') {
    return (
      <div className="flex flex-col h-full">
        <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900 font-poppins">Purchases</h1>
              <p className="text-xs text-slate-500">
                {purchases.length} bill{purchases.length !== 1 ? 's' : ''} · Total {inr(totalPurchaseValue)}
              </p>
            </div>
          </div>
          <button
            onClick={startNew}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Purchase
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 mb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by bill no., supplier or GSTIN…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {saveSuccess && (
          <div className="mb-4 flex items-center gap-2 text-emerald-600 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
            <CheckCircle size={16} />
            <span className="text-sm font-semibold">Purchase saved · inventory updated</span>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center py-16 gap-3">
            <ShoppingBag className="w-12 h-12 text-slate-200" />
            <p className="text-slate-400 text-sm">
              {searchQuery ? 'No purchases match your search.' : 'No purchases yet. Click "New Purchase" to record one.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Bill No.</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Supplier</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">GSTIN</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Taxable</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">GST</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">Total</th>
                  <th className="text-center px-4 py-3 font-medium text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, idx) => (
                  <tr
                    key={p.id}
                    className={`border-b border-slate-100 hover:bg-emerald-50/40 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/50'}`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900 font-mono text-xs">{p.purchaseNumber}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(p.date)}</td>
                    <td className="px-4 py-3 text-slate-700">{p.supplierName}</td>
                    <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.supplierGstin || '—'}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{inr(p.totalBeforeTax)}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{inr(p.cgst + p.sgst + p.igst)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{inr(p.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => startEdit(p)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(p)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-100 flex items-center justify-between">
              <span className="text-xs text-emerald-700 font-medium">
                {filtered.length} purchase{filtered.length !== 1 ? 's' : ''} shown
              </span>
              <span className="text-sm font-semibold text-emerald-800">
                Total Value: {inr(filtered.reduce((s, p) => s + p.totalAmount, 0))}
              </span>
            </div>
          </div>
        )}

        <DeleteConfirmationModal
          isOpen={deleteConfirm !== null}
          title="Delete this purchase?"
          message={`This will permanently delete purchase ${deleteConfirm?.purchaseNumber} and reverse its stock adjustment. This action cannot be undone.`}
          onCancel={() => setDeleteConfirm(null)}
          onConfirm={handleDelete}
        />
      </div>
    );
  }

  // ── Editing mode ──
  const filteredInventory = inventoryItems.filter(it =>
    !inventorySearch ||
    it.name.toLowerCase().includes(inventorySearch.toLowerCase()) ||
    it.hsnCode.toLowerCase().includes(inventorySearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl px-6 py-4 flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={cancelEdit}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
            title="Back to list"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 font-poppins">
              {editingPurchase ? 'Edit Purchase' : 'New Purchase'}
            </h1>
            <p className="text-xs text-slate-500">
              Recording inward stock from supplier
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openInventoryPicker}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            <Package className="w-4 h-4" />
            Pick from Inventory
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving…' : editingPurchase ? 'Update Purchase' : 'Save Purchase'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-2 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">
          {error}
        </div>
      )}

      {/* Bill / supplier card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bill Number</label>
            <input
              type="text"
              value={purchaseNumber}
              onChange={e => setPurchaseNumber(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Bill Date</label>
            <input
              type="date"
              value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Supplier Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={supplierName}
              onChange={e => setSupplierName(e.target.value)}
              placeholder="e.g. ABC Traders Pvt Ltd"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Supplier GSTIN</label>
            <input
              type="text"
              value={supplierGstin}
              onChange={e => setSupplierGstin(e.target.value.toUpperCase())}
              placeholder="15-char GSTIN"
              maxLength={15}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg uppercase focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Supplier State</label>
            <div className="relative">
              <select
                value={supplierState}
                onChange={e => setSupplierState(e.target.value)}
                className="w-full appearance-none px-3 py-2 text-sm border border-slate-200 rounded-lg pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              >
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              {gstType === GSTType.IGST ? 'Inter-state → IGST applies' : 'Same-state → CGST + SGST'}
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700 font-poppins">Line Items</h2>
          <button
            onClick={addRow}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add row
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500 border-b border-slate-200">
                <th className="py-2 px-2">Item / Description</th>
                <th className="py-2 px-2">HSN</th>
                <th className="py-2 px-2">Unit</th>
                <th className="py-2 px-2 text-right">Qty</th>
                <th className="py-2 px-2 text-right">Rate (Cost)</th>
                <th className="py-2 px-2 text-right">GST %</th>
                <th className="py-2 px-2 text-right">Amount</th>
                <th className="py-2 px-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const lineAmount = it.quantity * it.rate;
                const showSuggest = activeDescItemId === it.id && it.description.trim().length > 0;
                const suggestions = inventoryItems.filter(inv =>
                  inv.name.toLowerCase().includes(it.description.toLowerCase()) ||
                  inv.hsnCode.toLowerCase().includes(it.description.toLowerCase())
                ).slice(0, 6);
                return (
                  <tr key={it.id} className="border-b border-slate-100">
                    <td className="py-2 px-2 relative">
                      <input
                        type="text"
                        value={it.description}
                        onFocus={() => { pickInventoryForLine(it.id); }}
                        onBlur={() => setTimeout(() => setActiveDescItemId(null), 150)}
                        onChange={e => updateRow(it.id, 'description', e.target.value)}
                        placeholder="Item name"
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      />
                      {showSuggest && suggestions.length > 0 && (
                        <div className="absolute z-20 top-full left-2 right-2 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {suggestions.map(inv => (
                            <button
                              key={inv.id}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handlePickInline(it.id, inv)}
                              className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-slate-100 last:border-0"
                            >
                              <p className="text-sm font-medium text-slate-800">{inv.name}</p>
                              <p className="text-xs text-slate-500">
                                HSN: {inv.hsnCode || '—'} · Stock: {inv.stock ?? 0} {inv.unit} · Cost: {inr(inv.costPrice || 0)}
                              </p>
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={it.hsnCode}
                        onChange={e => updateRow(it.id, 'hsnCode', e.target.value)}
                        placeholder="HSN"
                        className="w-24 px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="text"
                        value={it.unit || ''}
                        onChange={e => updateRow(it.id, 'unit', e.target.value)}
                        placeholder="PCS"
                        className="w-16 px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        min={0}
                        value={it.quantity || ''}
                        onChange={e => updateRow(it.id, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1.5 text-sm border border-slate-200 rounded text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <input
                        type="number"
                        min={0}
                        value={it.rate || ''}
                        onChange={e => updateRow(it.id, 'rate', parseFloat(e.target.value) || 0)}
                        className="w-28 px-2 py-1.5 text-sm border border-slate-200 rounded text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
                      />
                    </td>
                    <td className="py-2 px-2">
                      <div className="relative">
                        <select
                          value={it.gstRate}
                          onChange={e => updateRow(it.id, 'gstRate', parseFloat(e.target.value))}
                          className="w-20 appearance-none px-2 py-1.5 text-sm border border-slate-200 rounded text-right pr-6 focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
                        >
                          {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right text-sm font-medium text-slate-800">{inr(lineAmount)}</td>
                    <td className="py-2 px-2 text-right">
                      <button
                        onClick={() => removeRow(it.id)}
                        disabled={items.length === 1}
                        className="p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Remove row"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Sub Total</span>
              <span>{inr(subTotal)}</span>
            </div>
            {gstType === GSTType.CGST_SGST ? (
              <>
                <div className="flex justify-between text-slate-600">
                  <span>CGST</span>
                  <span>{inr(taxAmount / 2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>SGST</span>
                  <span>{inr(taxAmount / 2)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between text-slate-600">
                <span>IGST</span>
                <span>{inr(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-slate-200 font-semibold text-slate-900">
              <span>Total</span>
              <span>{inr(grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory picker modal */}
      {showInventoryPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900 font-poppins">Pick from Inventory</h3>
              <button
                onClick={() => setShowInventoryPicker(false)}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-3 border-b border-slate-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search inventory by name or HSN…"
                  value={inventorySearch}
                  onChange={e => setInventorySearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredInventory.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">No inventory items match.</p>
              ) : (
                filteredInventory.map(inv => (
                  <button
                    key={inv.id}
                    onClick={() => handlePickModal(inv)}
                    className="w-full text-left px-6 py-3 border-b border-slate-100 last:border-0 hover:bg-emerald-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{inv.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          HSN: {inv.hsnCode || '—'} · Unit: {inv.unit} · Stock: {inv.stock ?? 0}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-700">{inr(inv.costPrice || 0)}</p>
                        <p className="text-xs text-slate-400">GST {inv.gstRate}%</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchaseManager;
