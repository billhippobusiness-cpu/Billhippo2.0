
import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit3, Trash2, X, Save, UserCircle, Phone, Mail, MapPin, Loader2, Users } from 'lucide-react';
import { Customer } from '../types';
import { getCustomers, addCustomer, updateCustomer, deleteCustomer } from '../lib/firestore';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry"
];

interface CustomerManagerProps {
  userId: string;
}

const EMPTY_FORM = {
  name: '', gstin: '', phone: '', email: '',
  address: '', city: '', state: 'Maharashtra', pincode: '', balance: 0
};

const CustomerManager: React.FC<CustomerManagerProps> = ({ userId }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadCustomers(); }, [userId]);

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

  const handleEdit = (customer: Customer) => {
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
      balance: customer.balance
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setError(null);
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.city.toLowerCase().includes(search.toLowerCase()) ||
    (c.gstin && c.gstin.toLowerCase().includes(search.toLowerCase()))
  );

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

      {/* Customer Cards */}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(customer => (
            <div key={customer.id} className="bg-white rounded-[2rem] p-8 premium-shadow border border-slate-50 hover:border-indigo-100 transition-all group">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 rounded-2xl bg-profee-blue/10 text-profee-blue flex items-center justify-center font-bold font-poppins text-lg">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(customer)} className="p-2 hover:bg-indigo-50 rounded-xl transition-all">
                    <Edit3 size={16} className="text-profee-blue" />
                  </button>
                  <button onClick={() => handleDelete(customer.id)} className="p-2 hover:bg-rose-50 rounded-xl transition-all">
                    <Trash2 size={16} className="text-rose-400" />
                  </button>
                </div>
              </div>

              <h4 className="text-lg font-bold font-poppins text-slate-900 mb-1">{customer.name}</h4>
              {customer.gstin && <p className="text-[10px] font-bold text-profee-blue uppercase tracking-widest mb-4">GSTIN: {customer.gstin}</p>}

              <div className="space-y-2 text-xs font-medium text-slate-400">
                {customer.phone && (
                  <div className="flex items-center gap-2"><Phone size={12} /> {customer.phone}</div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2"><Mail size={12} /> {customer.email}</div>
                )}
                {customer.city && (
                  <div className="flex items-center gap-2"><MapPin size={12} /> {customer.city}, {customer.state}</div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-50 flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Balance</span>
                <span className={`text-lg font-bold font-poppins ${customer.balance > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {customer.balance === 0 ? 'Settled' : `₹${Math.abs(customer.balance).toLocaleString('en-IN')}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomerManager;
