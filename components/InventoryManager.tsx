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
} from 'lucide-react';
import {
  getInventoryItems,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from '../lib/firestore';
import type { InventoryItem } from '../types';
import DeleteConfirmationModal from './DeleteConfirmationModal';

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
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
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
    </div>
  );
}
