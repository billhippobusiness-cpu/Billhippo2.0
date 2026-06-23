'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  ChevronDown,
} from 'lucide-react';
import {
  getServiceItems,
  addServiceItem,
  updateServiceItem,
  deleteServiceItem,
} from '../lib/firestore';
import type { ServiceItem } from '../types';
import DeleteConfirmationModal from './DeleteConfirmationModal';

const UNITS = ['HRS', 'DAYS', 'MONTHS', 'NOS', 'SESSIONS', 'VISITS', 'PCS', 'SET'];
const GST_RATES = [0, 5, 12, 18, 28];

const emptyForm = (): Omit<ServiceItem, 'id'> => ({
  name: '',
  description: '',
  sacCode: '',
  unit: 'HRS',
  rate: 0,
  gstRate: 18,
});

interface Props {
  userId: string;
}

export default function ServicesManager({ userId }: Props) {
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ServiceItem | null>(null);
  const [form, setForm] = useState<Omit<ServiceItem, 'id'>>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadItems();
  }, [userId]);

  async function loadItems() {
    setLoading(true);
    try {
      const data = await getServiceItems(userId);
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
        it.sacCode.toLowerCase().includes(q) ||
        (it.description ?? '').toLowerCase().includes(q)
    );
  }, [items, searchQuery]);

  function openAdd() {
    setEditingItem(null);
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEdit(item: ServiceItem) {
    setEditingItem(item);
    setForm({
      name: item.name,
      description: item.description ?? '',
      sacCode: item.sacCode,
      unit: item.unit,
      rate: item.rate,
      gstRate: item.gstRate,
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
        await updateServiceItem(userId, editingItem.id, form);
        setItems((prev) =>
          prev.map((it) => (it.id === editingItem.id ? { ...it, ...form } : it))
        );
      } else {
        const id = await addServiceItem(userId, form);
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
    setTimeout(async () => {
      await deleteServiceItem(userId, id);
      setItems((prev) => prev.filter((it) => it.id !== id));
      setDeletingId(null);
    }, 400);
  }

  const inr = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">Services Catalogue</h1>
            <p className="text-xs text-gray-500 truncate">{items.length} service{items.length !== 1 ? 's' : ''} in catalogue</p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          <Plus className="w-4 h-4 shrink-0" />
          Add Service
        </button>
      </div>

      {/* ── Search bar ── */}
      <div className="px-4 sm:px-6 py-3 bg-white border-b border-gray-100">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or SAC code…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
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
      <div className="flex-1 overflow-auto px-3 sm:px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            Loading services…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <Briefcase className="w-12 h-12 text-gray-200" />
            <p className="text-gray-400 text-sm">
              {searchQuery ? 'No services match your search.' : 'No services yet. Click "Add Service" to begin.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Service Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">SAC Code</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Unit</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Rate</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">GST %</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={`border-b border-gray-100 hover:bg-indigo-50/40 transition-colors ${
                        idx % 2 === 0 ? '' : 'bg-gray-50/50'
                      } ${deletingId === item.id ? 'opacity-0 transition-opacity duration-300' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        {item.description && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{item.sacCode || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                      <td className="px-4 py-3 text-right text-gray-900 font-medium">{inr(item.rate)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-block px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-medium">
                          {item.gstRate}%
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
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
            </div>

            {/* ── Footer summary ── */}
            <div className="px-4 py-3 bg-indigo-50 border-t border-indigo-100 flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-indigo-700 font-medium">
                {filtered.length} service{filtered.length !== 1 ? 's' : ''} shown
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Delete confirmation modal ── */}
      <DeleteConfirmationModal
        isOpen={deleteConfirm !== null}
        title="Delete Service?"
        message="This will permanently remove the service from your catalogue. This action cannot be undone."
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
      />

      {/* ── Add / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editingItem ? 'Edit Service' : 'Add Service'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Service Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Web Design Consultation"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
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
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>

              {/* SAC Code + Unit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">SAC Code</label>
                  <input
                    type="text"
                    value={form.sacCode}
                    onChange={(e) => setForm({ ...form, sacCode: e.target.value })}
                    placeholder="e.g. 998314"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                  <div className="relative">
                    <select
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent bg-white pr-8"
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Rate */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Rate (₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.rate || ''}
                  onChange={(e) => setForm({ ...form, rate: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                />
              </div>

              {/* GST Rate */}
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
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-700'
                      }`}
                    >
                      {r}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

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
                className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
              >
                {saving ? 'Saving…' : editingItem ? 'Update Service' : 'Add Service'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
