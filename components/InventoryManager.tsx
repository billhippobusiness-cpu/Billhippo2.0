'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  ChevronDown,
  FileDown,
  Loader2,
} from 'lucide-react';
import {
  getInventoryItems,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getInvoices,
  getPurchases,
  getBusinessProfile,
} from '../lib/firestore';
import type { InventoryItem, BusinessProfile } from '../types';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { PDFDirectDownload } from './pdf/PDFPreviewModal';
import InventoryStatementPDF, { type InventoryStatementRow } from './pdf/InventoryStatementPDF';

const UNITS = ['PCS', 'KG', 'GMS', 'LTR', 'MTR', 'BOX', 'NOS', 'SET', 'BAG', 'PKT'];
const GST_RATES = [0, 5, 12, 18, 28];

const emptyForm = (): Omit<InventoryItem, 'id'> => ({
  name: '',
  description: '',
  hsnCode: '',
  unit: 'PCS',
  sellingPrice: 0,
  costPrice: 0,
  gstRate: 18,
  stock: 0,
});

interface Props {
  userId: string;
}

// ── Helpers for inventory statement ──────────────────────────────────────────
const todayISO = () => new Date().toISOString().split('T')[0];
const financialYearStart = () => {
  const now = new Date();
  const yr = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  return `${yr}-04-01`;
};

export default function InventoryManager({ userId }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<Omit<InventoryItem, 'id'>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Inventory statement ──
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [statementFrom, setStatementFrom] = useState(financialYearStart());
  const [statementTo, setStatementTo] = useState(todayISO());
  const [statementBuilding, setStatementBuilding] = useState(false);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [statementPdf, setStatementPdf] = useState<{
    rows: InventoryStatementRow[];
    profile: BusinessProfile;
    fromDate: string;
    toDate: string;
  } | null>(null);

  useEffect(() => {
    loadItems();
  }, [userId]);

  async function loadItems() {
    setLoading(true);
    try {
      const data = await getInventoryItems(userId);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        it.name.toLowerCase().includes(q) ||
        it.hsnCode.toLowerCase().includes(q) ||
        (it.description ?? '').toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  const catalogueValue = useMemo(
    () => filtered.reduce((sum, it) => sum + (it.sellingPrice ?? 0) * (it.stock ?? 0), 0),
    [filtered]
  );

  function openAdd() {
    setEditingItem(null);
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEdit(item: InventoryItem) {
    setEditingItem(item);
    setForm({
      name: item.name,
      description: item.description ?? '',
      hsnCode: item.hsnCode,
      unit: item.unit,
      sellingPrice: item.sellingPrice,
      costPrice: item.costPrice ?? 0,
      gstRate: item.gstRate,
      stock: item.stock ?? 0,
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingItem(null);
    setForm(emptyForm());
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingItem) {
        await updateInventoryItem(userId, editingItem.id, form);
        setItems((prev) =>
          prev.map((it) => (it.id === editingItem.id ? { ...it, ...form } : it))
        );
      } else {
        const id = await addInventoryItem(userId, form);
        setItems((prev) => [...prev, { id, ...form }]);
      }
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(id: string) {
    setDeleteConfirm(null);
    setDeletingId(id);
    // Play animation, then commit deletion to Firestore
    setTimeout(async () => {
      await deleteInventoryItem(userId, id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      setDeletingId(null);
    }, 400);
  }

  const inr = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Build inventory statement rows for the selected period ──
  // Logic: current stock is the truth of "now". For any past date `d`, the
  // closing stock at d equals current_stock minus all movements after d.
  //   ClosingQty(to)    = stock - inwardAfter(to)    + outwardAfter(to)
  //   OpeningQty(from)  = stock - inwardAfter(from)  + outwardAfter(from)
  //                     = ClosingQty(to) - inwardInPeriod + outwardInPeriod
  //
  // Inward comes from purchases (line item × inventoryItemId).
  // Outward comes from invoices (line item × inventoryItemId).
  async function buildStatement(): Promise<void> {
    if (!statementFrom || !statementTo || statementFrom > statementTo) {
      setStatementError('Please select a valid date range (From ≤ To).');
      return;
    }
    setStatementBuilding(true);
    setStatementError(null);
    try {
      const [profile, allItems, invoices, purchases] = await Promise.all([
        getBusinessProfile(userId),
        getInventoryItems(userId),
        getInvoices(userId),
        getPurchases(userId),
      ]);
      if (!profile) {
        setStatementError('Business profile not found. Complete onboarding first.');
        return;
      }

      // Build fast-lookup maps for name/HSN → inventory item id (fallback matching).
      // Name lookup is exact case-insensitive. HSN lookup only used when exactly one
      // inventory item has that HSN code (avoids ambiguity).
      const nameMap = new Map(allItems.map(it => [it.name.trim().toLowerCase(), it.id]));
      const hsnCount = new Map<string, number>();
      const hsnMap   = new Map<string, string>();
      for (const it of allItems) {
        if (!it.hsnCode) continue;
        const key = it.hsnCode.trim().toLowerCase();
        hsnCount.set(key, (hsnCount.get(key) ?? 0) + 1);
        hsnMap.set(key, it.id);
      }
      function resolveId(li: { inventoryItemId?: string; description?: string; hsnCode?: string }): string | undefined {
        if (li.inventoryItemId) return li.inventoryItemId;
        if (li.description) {
          const byName = nameMap.get(li.description.trim().toLowerCase());
          if (byName) return byName;
        }
        if (li.hsnCode) {
          const hsnKey = li.hsnCode.trim().toLowerCase();
          if ((hsnCount.get(hsnKey) ?? 0) === 1) return hsnMap.get(hsnKey);
        }
        return undefined;
      }

      // Aggregate movements per inventory item.
      const inPeriod = new Map<string, { qty: number; value: number }>();
      const outPeriod = new Map<string, { qty: number; value: number }>();
      const afterTo = new Map<string, { inQty: number; outQty: number }>();

      const bump = (
        map: Map<string, { qty: number; value: number }>,
        id: string,
        qty: number,
        value: number,
      ) => {
        const cur = map.get(id) || { qty: 0, value: 0 };
        cur.qty += qty;
        cur.value += value;
        map.set(id, cur);
      };
      const bumpAfter = (
        map: Map<string, { inQty: number; outQty: number }>,
        id: string,
        inwardQty: number,
        outwardQty: number,
      ) => {
        const cur = map.get(id) || { inQty: 0, outQty: 0 };
        cur.inQty += inwardQty;
        cur.outQty += outwardQty;
        map.set(id, cur);
      };

      // Inward (purchases) — match by inventoryItemId first, then name, then HSN
      for (const p of purchases) {
        const inRange = p.date >= statementFrom && p.date <= statementTo;
        const after   = p.date > statementTo;
        for (const li of p.items) {
          const id = resolveId(li);
          if (!id) continue;
          const q = li.quantity || 0;
          const v = q * (li.rate || 0);
          if (inRange) bump(inPeriod, id, q, v);
          if (after)   bumpAfter(afterTo, id, q, 0);
        }
      }

      // Outward (invoices) — same fallback matching
      for (const inv of invoices) {
        const inRange = inv.date >= statementFrom && inv.date <= statementTo;
        const after   = inv.date > statementTo;
        for (const li of inv.items) {
          const id = resolveId(li);
          if (!id) continue;
          const q = li.quantity || 0;
          const v = q * (li.rate || 0);
          if (inRange) bump(outPeriod, id, q, v);
          if (after)   bumpAfter(afterTo, id, 0, q);
        }
      }

      const rows: InventoryStatementRow[] = allItems.map((it) => {
        const inP   = inPeriod.get(it.id)  || { qty: 0, value: 0 };
        const outP  = outPeriod.get(it.id) || { qty: 0, value: 0 };
        const aft   = afterTo.get(it.id)   || { inQty: 0, outQty: 0 };
        const currentStock = it.stock ?? 0;
        const closingQty = currentStock - aft.inQty + aft.outQty;
        const openingQty = closingQty - inP.qty + outP.qty;

        // Use cost price for stock valuation; fall back to selling price when not set
        const stockRate = (it.costPrice && it.costPrice > 0) ? it.costPrice : it.sellingPrice;
        // Inward rate = weighted-avg purchase cost; outward rate = weighted-avg invoice rate
        const inwardRate  = inP.qty  > 0 ? inP.value  / inP.qty  : 0;
        const outwardRate = outP.qty > 0 ? outP.value / outP.qty : 0;

        return {
          itemId: it.id,
          name: it.name,
          hsnCode: it.hsnCode,
          unit: it.unit,
          openingQty,
          openingRate: stockRate,
          inwardQty: inP.qty,
          inwardRate,
          outwardQty: outP.qty,
          outwardRate,
          closingRate: stockRate,
        };
      });

      setStatementPdf({ rows, profile, fromDate: statementFrom, toDate: statementTo });
      setShowStatementModal(false);
    } catch (e) {
      console.error(e);
      setStatementError('Failed to build inventory statement. Please try again.');
    } finally {
      setStatementBuilding(false);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
            <Package className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Inventory</h1>
            <p className="text-xs text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''} in catalogue</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setStatementError(null);
              setShowStatementModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 border border-amber-200 text-amber-700 hover:bg-amber-50 text-sm font-medium rounded-lg transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Inventory Statement
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>
      </div>

      {/* ── Search bar ── */}
      <div className="px-6 py-3 bg-white border-b border-gray-100">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or HSN…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Loading inventory…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Package className="w-12 h-12 text-gray-200" />
            <p className="text-gray-400 text-sm">
              {searchQuery ? 'No items match your search.' : 'No items yet. Click "Add Item" to begin.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Item Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">HSN Code</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Unit</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Selling Price</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Cost Price</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">GST %</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Stock</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-100 hover:bg-amber-50/40 transition-colors ${
                      idx % 2 === 0 ? '' : 'bg-gray-50/50'
                    } ${deletingId === item.id ? 'deleting-item' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">
                          {item.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{item.hsnCode || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{inr(item.sellingPrice)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{item.costPrice ? inr(item.costPrice) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-block px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                        {item.gstRate}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-medium ${
                          (item.stock ?? 0) === 0 ? 'text-red-500' : 'text-gray-900'
                        }`}
                      >
                        {item.stock ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(item.id)}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
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

            {/* ── Footer summary ── */}
            <div className="px-4 py-3 bg-amber-50 border-t border-amber-100 flex items-center justify-between">
              <span className="text-xs text-amber-700 font-medium">
                {filtered.length} item{filtered.length !== 1 ? 's' : ''} shown
              </span>
              <span className="text-sm font-semibold text-amber-800">
                Catalogue Value: {inr(catalogueValue)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Delete confirmation modal ── */}
      <DeleteConfirmationModal
        isOpen={deleteConfirm !== null}
        title="Delete Inventory Item?"
        message="This will permanently remove the item from your inventory. This action cannot be undone."
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
      />

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editingItem ? 'Edit Item' : 'Add Inventory Item'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Steel Rod 12mm"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Optional short description"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                />
              </div>

              {/* HSN + Unit row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">HSN Code</label>
                  <input
                    type="text"
                    value={form.hsnCode}
                    onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
                    placeholder="e.g. 7214"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                  <div className="relative">
                    <select
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent bg-white pr-8"
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Selling Price + Cost Price */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Selling Price (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.sellingPrice || ''}
                    onChange={(e) => setForm({ ...form, sellingPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Cost Price (₹)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.costPrice || ''}
                    onChange={(e) => setForm({ ...form, costPrice: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                </div>
              </div>

              {/* GST Rate + Stock */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">GST Rate</label>
                  <div className="flex gap-2 flex-wrap">
                    {GST_RATES.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm({ ...form, gstRate: r })}
                        className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${
                          form.gstRate === r
                            ? 'bg-amber-500 border-amber-500 text-white'
                            : 'border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-700'
                        }`}
                      >
                        {r}%
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stock Qty</label>
                  <input
                    type="number"
                    min={0}
                    value={form.stock || ''}
                    onChange={(e) => setForm({ ...form, stock: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim()}
                className="px-5 py-2 text-sm bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : editingItem ? 'Update Item' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inventory Statement: date range picker ── */}
      {showStatementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Inventory Statement</h2>
              <button
                onClick={() => setShowStatementModal(false)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-xs text-gray-500">
                Generates an A4 PDF with opening, inward (purchases), outward (sales) and
                closing quantities, rates and values per inventory item for the chosen period.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                  <input
                    type="date"
                    value={statementFrom}
                    onChange={e => setStatementFrom(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                  <input
                    type="date"
                    value={statementTo}
                    onChange={e => setStatementTo(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setStatementFrom(financialYearStart());
                    setStatementTo(todayISO());
                  }}
                  className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-700"
                >
                  Current FY
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = new Date();
                    const first = new Date(t.getFullYear(), t.getMonth(), 1).toISOString().split('T')[0];
                    setStatementFrom(first);
                    setStatementTo(todayISO());
                  }}
                  className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-700"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = new Date();
                    const start = new Date(t.getFullYear(), t.getMonth() - 1, 1).toISOString().split('T')[0];
                    const end   = new Date(t.getFullYear(), t.getMonth(), 0).toISOString().split('T')[0];
                    setStatementFrom(start);
                    setStatementTo(end);
                  }}
                  className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-700"
                >
                  Last Month
                </button>
              </div>

              {statementError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {statementError}
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
              <button
                onClick={() => setShowStatementModal(false)}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={buildStatement}
                disabled={statementBuilding}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {statementBuilding
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Building…</>
                  : <><FileDown className="w-4 h-4" /> Generate PDF</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inventory Statement direct download ── */}
      {statementPdf && (
        <PDFDirectDownload
          fileName={`Inventory-Statement-${statementPdf.fromDate}-to-${statementPdf.toDate}.pdf`}
          document={
            <InventoryStatementPDF
              profile={statementPdf.profile}
              rows={statementPdf.rows}
              fromDate={statementPdf.fromDate}
              toDate={statementPdf.toDate}
              logoUrl={statementPdf.profile.theme?.logoUrl}
            />
          }
          onDone={() => setStatementPdf(null)}
        />
      )}
    </div>
  );
}
