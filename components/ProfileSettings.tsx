
import React, { useState, useEffect } from 'react';
import { Save, Building2, MapPin, ShieldCheck, CreditCard, Info, Zap, CheckCircle, Loader2 } from 'lucide-react';
import { BusinessProfile } from '../types';
import { getBusinessProfile, saveBusinessProfile } from '../lib/firestore';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry"
];

const DEFAULT_PROFILE: BusinessProfile = {
  name: '',
  tagline: '',
  gstin: '',
  address: '',
  city: '',
  state: 'Maharashtra',
  pincode: '',
  phone: '',
  email: '',
  pan: '',
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  upiId: '',
  defaultNotes: 'Thank you for your business. Payments are due within 15 days.',
  termsAndConditions: '1. Goods once sold will not be taken back.',
  gstEnabled: true,
  theme: {
    templateId: 'modern-2',
    primaryColor: '#4c2de0',
    fontFamily: 'Poppins, sans-serif',
    invoicePrefix: 'INV/2026/',
    autoNumbering: true
  }
};

interface ProfileSettingsProps {
  userId: string;
}

const ProfileSettings: React.FC<ProfileSettingsProps> = ({ userId }) => {
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState('');

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await getBusinessProfile(userId);
      if (data) {
        setProfile(data);
      }
    } catch (err: any) {
      setError('Failed to load profile. Please refresh.');
      console.error('Load profile error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile.upiId) {
      const upiLink = `upi://pay?pa=${profile.upiId}&pn=${encodeURIComponent(profile.name)}&cu=INR`;
      setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`);
    } else {
      setQrUrl('');
    }
  }, [profile.upiId, profile.name]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await saveBusinessProfile(userId, profile);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError('Failed to save. Please try again.');
      console.error('Save profile error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-profee-blue mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400 font-poppins">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 pb-20">
      <div className="flex justify-between items-end mb-2">
        <div>
          <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">System Settings</h1>
          <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">Business profile and tax configuration</p>
        </div>
        <div className="flex items-center gap-4">
          {saveSuccess && (
            <div className="flex items-center gap-2 text-emerald-500 animate-in fade-in duration-300">
              <CheckCircle size={18} />
              <span className="text-sm font-bold font-poppins">Saved!</span>
            </div>
          )}
          {error && <span className="text-sm font-bold text-rose-500 font-poppins">{error}</span>}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-profee-blue text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95 transition-all font-poppins disabled:opacity-50"
          >
            {isSaving ? <><Loader2 size={20} className="animate-spin" /> Saving...</> : <><Save size={20} /> Save Configuration</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">

          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8">
            <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
              <Building2 className="text-profee-blue" size={22} /> Organization Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-poppins">
              <Input label="Legal Name" value={profile.name} onChange={v => setProfile({...profile, name: v})} placeholder="Your business name" />
              <Input label="Email Address" value={profile.email} onChange={v => setProfile({...profile, email: v})} placeholder="business@email.com" />
              <Input label="GSTIN Number" value={profile.gstin} onChange={v => setProfile({...profile, gstin: v})} placeholder="27AABCB1234A1Z1" />
              <Input label="PAN Number" value={profile.pan} onChange={v => setProfile({...profile, pan: v})} placeholder="ABCDE1234F" />
              <Input label="Contact Number" value={profile.phone} onChange={v => setProfile({...profile, phone: v})} placeholder="+91 98765 43210" />
              <Input label="Business Tagline" value={profile.tagline || ''} onChange={v => setProfile({...profile, tagline: v})} placeholder="Your tagline" />
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8">
            <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
              <CreditCard className="text-emerald-500" size={22} /> Bank & Payments
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-poppins">
              <Input label="Bank Name" value={profile.bankName || ''} onChange={v => setProfile({...profile, bankName: v})} placeholder="HDFC Bank" />
              <Input label="Account Number" value={profile.accountNumber || ''} onChange={v => setProfile({...profile, accountNumber: v})} placeholder="50100234567890" />
              <Input label="IFSC Code" value={profile.ifscCode || ''} onChange={v => setProfile({...profile, ifscCode: v})} placeholder="HDFC0000123" />
              <Input label="UPI ID" value={profile.upiId || ''} onChange={v => setProfile({...profile, upiId: v})} placeholder="name@upi" />
            </div>
            {profile.upiId && (
              <div className="mt-4 p-6 bg-emerald-50/50 rounded-3xl flex items-center gap-6 border border-emerald-100">
                <div className="p-2 bg-white rounded-2xl shadow-sm">
                  <img src={qrUrl} alt="UPI QR" className="w-24 h-24" />
                </div>
                <div>
                   <h4 className="text-sm font-bold font-poppins text-emerald-900">UPI QR Enabled</h4>
                   <p className="text-xs text-emerald-700 mt-1 max-w-xs font-medium">Auto-generated QR will appear in all invoices for instant customer payments.</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-4 font-poppins">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Default Invoice Notes</label>
            <textarea
              className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50 min-h-[100px] resize-none"
              value={profile.defaultNotes}
              onChange={e => setProfile({...profile, defaultNotes: e.target.value})}
            />
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="bg-indigo-600 rounded-[3rem] p-10 text-white shadow-2xl shadow-indigo-200">
             <div className="flex items-center justify-between mb-8">
                <ShieldCheck size={32} className="opacity-80" />
                <button
                  onClick={() => setProfile({...profile, gstEnabled: !profile.gstEnabled})}
                  className={`w-14 h-7 rounded-full relative transition-colors border-2 border-white/20 ${profile.gstEnabled ? 'bg-emerald-400' : 'bg-white/20'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${profile.gstEnabled ? 'translate-x-8' : 'translate-x-1'}`}></div>
                </button>
             </div>
             <h4 className="text-2xl font-bold font-poppins mb-2">GST System</h4>
             <p className="text-sm opacity-80 font-poppins mb-6">Master switch for tax applicability across the business.</p>
             <div className="p-4 bg-white/10 rounded-2xl flex items-center gap-3">
                <Zap size={18} className="text-amber-300" />
                <span className="text-xs font-bold uppercase tracking-wider">{profile.gstEnabled ? 'GST Registered' : 'Non-GST / Composition'}</span>
             </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8">
            <h3 className="text-lg font-bold font-poppins flex items-center gap-3">
              <MapPin className="text-profee-blue" size={20} /> Place of Supply
            </h3>
            <div className="space-y-4 font-poppins">
              <Input label="Street Address" value={profile.address} onChange={v => setProfile({...profile, address: v})} placeholder="Your street address" />
              <div className="grid grid-cols-2 gap-4">
                 <Input label="City" value={profile.city} onChange={v => setProfile({...profile, city: v})} placeholder="City" />
                 <Input label="Pincode" value={profile.pincode} onChange={v => setProfile({...profile, pincode: v})} placeholder="400001" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">State</label>
                <select
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 appearance-none focus:ring-2 ring-indigo-50"
                  value={profile.state}
                  onChange={e => setProfile({...profile, state: e.target.value})}
                >
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white flex flex-col items-center text-center">
             <div className="w-16 h-16 bg-profee-blue rounded-3xl flex items-center justify-center mb-6">
                <Info size={32} />
             </div>
             <h4 className="text-lg font-bold font-poppins mb-2">Support Center</h4>
             <button className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all">Open Ticket</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const Input = ({ label, value, onChange, placeholder = "" }: { label: string, value: string, onChange: (v: string) => void, placeholder?: string }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">{label}</label>
    <input
      className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50"
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
    />
  </div>
);

export default ProfileSettings;
