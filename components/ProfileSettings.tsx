
import React, { useState, useEffect } from 'react';
import { Save, Building2, MapPin, ShieldCheck, CreditCard, Info, Zap, CheckCircle, Loader2, Upload, ImageIcon, PenLine, X, Briefcase, ShoppingCart, Plus, Pencil, Trash2, Check } from 'lucide-react';
import { BusinessProfile, BankAccount } from '../types';
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
  onBusinessTypeChange?: (type: 'service' | 'trading') => void;
}

const ProfileSettings: React.FC<ProfileSettingsProps> = ({ userId, onBusinessTypeChange }) => {
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [signatureUploading, setSignatureUploading] = useState(false);

  // Multi-bank state
  const [showBankForm, setShowBankForm] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankForm, setBankForm] = useState({ bankName: '', accountNumber: '', ifscCode: '', upiId: '' });

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await getBusinessProfile(userId);
      if (data) {
        // Migrate old single-bank fields into bankAccounts array
        if (!data.bankAccounts?.length && (data.bankName || data.accountNumber || data.ifscCode)) {
          const migrated: BankAccount = {
            id: 'default',
            bankName: data.bankName || '',
            accountNumber: data.accountNumber || '',
            ifscCode: data.ifscCode || '',
            upiId: data.upiId || '',
          };
          setProfile({ ...data, bankAccounts: [migrated], selectedBankId: 'default' });
        } else {
          setProfile(data);
        }
      }
    } catch (err: any) {
      setError('Failed to load profile. Please refresh.');
      console.error('Load profile error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const selectedBank = profile.bankAccounts?.find(b => b.id === profile.selectedBankId);
    const effectiveUpi = selectedBank?.upiId || profile.upiId || '';
    if (effectiveUpi) {
      const upiLink = `upi://pay?pa=${effectiveUpi}&pn=${encodeURIComponent(profile.name)}&cu=INR`;
      setQrUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`);
    } else {
      setQrUrl('');
    }
  }, [profile.upiId, profile.name, profile.selectedBankId, profile.bankAccounts]);

  // Compress & convert image to PNG data URL (preserves transparency)
  const compressImage = (file: File, maxWidth: number, maxHeight: number): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new window.Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const scale = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d')!;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setError(null);
    try {
      const dataUrl = await compressImage(file, 400, 400);
      setProfile(p => ({ ...p, theme: { ...p.theme, logoUrl: dataUrl } }));
    } catch {
      setError('Failed to process logo image. Please try again.');
    } finally {
      setLogoUploading(false);
      e.target.value = '';
    }
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSignatureUploading(true);
    setError(null);
    try {
      const dataUrl = await compressImage(file, 600, 200);
      setProfile(p => ({ ...p, signatureUrl: dataUrl }));
    } catch {
      setError('Failed to process signature image. Please try again.');
    } finally {
      setSignatureUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      // Sync selected bank into top-level fields for backward compat with PDFs
      const selectedBank = profile.bankAccounts?.find(b => b.id === profile.selectedBankId);
      const profileToSave: BusinessProfile = selectedBank
        ? { ...profile, bankName: selectedBank.bankName, accountNumber: selectedBank.accountNumber, ifscCode: selectedBank.ifscCode, upiId: selectedBank.upiId || '' }
        : profile;
      await saveBusinessProfile(userId, profileToSave);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      if (profile.businessType) onBusinessTypeChange?.(profile.businessType);
    } catch (err: any) {
      setError('Failed to save. Please try again.');
      console.error('Save profile error:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddBank = () => {
    if (!bankForm.bankName.trim() || !bankForm.accountNumber.trim()) return;
    const newBank: BankAccount = { id: Date.now().toString(), ...bankForm };
    const bankAccounts = [...(profile.bankAccounts || []), newBank];
    const selectedBankId = profile.selectedBankId || newBank.id;
    setProfile(p => ({ ...p, bankAccounts, selectedBankId }));
    setBankForm({ bankName: '', accountNumber: '', ifscCode: '', upiId: '' });
    setShowBankForm(false);
  };

  const handleUpdateBank = () => {
    if (!editingBankId) return;
    const bankAccounts = (profile.bankAccounts || []).map(b =>
      b.id === editingBankId ? { ...b, ...bankForm } : b
    );
    setProfile(p => ({ ...p, bankAccounts }));
    setEditingBankId(null);
    setBankForm({ bankName: '', accountNumber: '', ifscCode: '', upiId: '' });
  };

  const handleDeleteBank = (id: string) => {
    const bankAccounts = (profile.bankAccounts || []).filter(b => b.id !== id);
    const selectedBankId = profile.selectedBankId === id ? (bankAccounts[0]?.id || undefined) : profile.selectedBankId;
    setProfile(p => ({ ...p, bankAccounts, selectedBankId }));
    if (editingBankId === id) setEditingBankId(null);
  };

  const handleSelectBank = (id: string) => {
    setProfile(p => ({ ...p, selectedBankId: id }));
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

          {/* ── Business Branding: Logo & Signature ── */}
          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8">
            <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
              <ImageIcon className="text-profee-blue" size={22} /> Business Branding
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

              {/* Logo */}
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-bold text-slate-700 font-poppins">Business Logo</p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Recommended: <span className="font-bold text-slate-500">400×400 px</span>, PNG with transparent background. Max ~500 KB.
                  </p>
                </div>
                <div className="w-32 h-32 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden relative">
                  {profile.theme?.logoUrl ? (
                    <img src={profile.theme.logoUrl} alt="Business logo" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-300">
                      <ImageIcon size={28} />
                      <span className="text-[10px] font-medium">No logo</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className={`cursor-pointer flex items-center gap-2 bg-indigo-50 text-profee-blue px-4 py-2.5 rounded-xl text-sm font-bold font-poppins hover:bg-indigo-100 transition-all ${logoUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                    {logoUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {logoUploading ? 'Processing…' : 'Upload Logo'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleLogoUpload}
                      disabled={logoUploading}
                    />
                  </label>
                  {profile.theme?.logoUrl && (
                    <button
                      onClick={() => setProfile(p => ({ ...p, theme: { ...p.theme, logoUrl: undefined } }))}
                      className="flex items-center gap-1.5 text-rose-400 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-rose-50 transition-all"
                    >
                      <X size={14} /> Remove
                    </button>
                  )}
                </div>
              </div>

              {/* Signature */}
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-bold text-slate-700 font-poppins">Authorised Signature</p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Recommended: <span className="font-bold text-slate-500">600×200 px</span>, PNG with transparent background. Max ~500 KB.
                  </p>
                </div>
                <div className="w-52 h-24 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden">
                  {profile.signatureUrl ? (
                    <img src={profile.signatureUrl} alt="Signature" className="w-full h-full object-contain p-2" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-300">
                      <PenLine size={24} />
                      <span className="text-[10px] font-medium">No signature</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className={`cursor-pointer flex items-center gap-2 bg-indigo-50 text-profee-blue px-4 py-2.5 rounded-xl text-sm font-bold font-poppins hover:bg-indigo-100 transition-all ${signatureUploading ? 'opacity-60 pointer-events-none' : ''}`}>
                    {signatureUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {signatureUploading ? 'Processing…' : 'Upload Signature'}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={handleSignatureUpload}
                      disabled={signatureUploading}
                    />
                  </label>
                  {profile.signatureUrl && (
                    <button
                      onClick={() => setProfile(p => ({ ...p, signatureUrl: undefined }))}
                      className="flex items-center gap-1.5 text-rose-400 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-rose-50 transition-all"
                    >
                      <X size={14} /> Remove
                    </button>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* ── Business Type ── */}
          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-6">
            <div>
              <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
                <ShoppingCart className="text-amber-500" size={22} /> Business Type
              </h3>
              <p className="text-xs text-slate-400 mt-1.5 ml-10 font-poppins">Determines available features. Trading unlocks Inventory Management.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Service option */}
              <button
                type="button"
                onClick={() => setProfile(p => ({ ...p, businessType: 'service' }))}
                className={`relative flex flex-col items-start gap-3 p-6 rounded-2xl border-2 transition-all text-left ${
                  profile.businessType === 'service' || !profile.businessType
                    ? 'border-profee-blue bg-indigo-50'
                    : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  profile.businessType === 'service' || !profile.businessType
                    ? 'bg-profee-blue text-white'
                    : 'bg-slate-200 text-slate-400'
                }`}>
                  <Briefcase size={20} />
                </div>
                <div>
                  <p className={`text-sm font-bold font-poppins ${
                    profile.businessType === 'service' || !profile.businessType ? 'text-profee-blue' : 'text-slate-500'
                  }`}>Service</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-poppins leading-relaxed">Consulting, IT, Legal, Design</p>
                </div>
                {(profile.businessType === 'service' || !profile.businessType) && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-profee-blue flex items-center justify-center">
                    <CheckCircle size={12} className="text-white" />
                  </div>
                )}
              </button>

              {/* Trading option */}
              <button
                type="button"
                onClick={() => setProfile(p => ({ ...p, businessType: 'trading' }))}
                className={`relative flex flex-col items-start gap-3 p-6 rounded-2xl border-2 transition-all text-left ${
                  profile.businessType === 'trading'
                    ? 'border-amber-500 bg-amber-50'
                    : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  profile.businessType === 'trading'
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-200 text-slate-400'
                }`}>
                  <ShoppingCart size={20} />
                </div>
                <div>
                  <p className={`text-sm font-bold font-poppins ${
                    profile.businessType === 'trading' ? 'text-amber-700' : 'text-slate-500'
                  }`}>Trading</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-poppins leading-relaxed">Retail, Wholesale, Manufacturing</p>
                </div>
                {profile.businessType === 'trading' && (
                  <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
                    <CheckCircle size={12} className="text-white" />
                  </div>
                )}
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  profile.businessType === 'trading'
                    ? 'bg-amber-200 text-amber-800'
                    : 'bg-slate-200 text-slate-400'
                }`}>
                  + Inventory
                </span>
              </button>
            </div>
            {profile.businessType === 'trading' && (
              <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 rounded-xl border border-amber-100">
                <ShoppingCart size={14} className="text-amber-600 flex-shrink-0" />
                <p className="text-xs font-bold text-amber-700 font-poppins">Inventory Management tab is enabled. Save to apply changes.</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
                <CreditCard className="text-emerald-500" size={22} /> Bank & Payments
              </h3>
              <button
                onClick={() => { setShowBankForm(true); setEditingBankId(null); setBankForm({ bankName: '', accountNumber: '', ifscCode: '', upiId: '' }); }}
                className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2.5 rounded-xl text-sm font-bold font-poppins hover:bg-emerald-100 transition-all"
              >
                <Plus size={15} /> Add Bank
              </button>
            </div>

            {/* Bank account list */}
            <div className="space-y-3">
              {(profile.bankAccounts || []).map(bank => (
                <div
                  key={bank.id}
                  className={`rounded-2xl border-2 transition-all ${profile.selectedBankId === bank.id ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-100 bg-slate-50'}`}
                >
                  {editingBankId === bank.id ? (
                    <div className="p-6 space-y-4 font-poppins">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input label="Bank Name" value={bankForm.bankName} onChange={v => setBankForm(f => ({ ...f, bankName: v }))} placeholder="HDFC Bank" />
                        <Input label="Account Number" value={bankForm.accountNumber} onChange={v => setBankForm(f => ({ ...f, accountNumber: v }))} placeholder="50100234567890" />
                        <Input label="IFSC Code" value={bankForm.ifscCode} onChange={v => setBankForm(f => ({ ...f, ifscCode: v }))} placeholder="HDFC0000123" />
                        <Input label="UPI ID" value={bankForm.upiId} onChange={v => setBankForm(f => ({ ...f, upiId: v }))} placeholder="name@upi" />
                      </div>
                      <div className="flex gap-3 pt-1">
                        <button onClick={handleUpdateBank} className="px-6 py-2.5 bg-profee-blue text-white rounded-xl text-sm font-bold font-poppins hover:scale-105 active:scale-95 transition-all">Update</button>
                        <button onClick={() => setEditingBankId(null)} className="px-6 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-white transition-all font-poppins">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-5 flex items-center gap-4">
                      {/* Select tick */}
                      <button
                        onClick={() => handleSelectBank(bank.id)}
                        className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center border-2 transition-all ${profile.selectedBankId === bank.id ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'}`}
                        title="Set as active bank"
                      >
                        {profile.selectedBankId === bank.id && <Check size={15} className="text-white" />}
                      </button>
                      {/* Bank info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm font-poppins truncate">{bank.bankName}</p>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">A/c: {bank.accountNumber}{bank.ifscCode ? ` · IFSC: ${bank.ifscCode}` : ''}</p>
                        {bank.upiId && <p className="text-xs text-emerald-600 font-bold mt-0.5">UPI: {bank.upiId}</p>}
                      </div>
                      {profile.selectedBankId === bank.id && (
                        <span className="text-[10px] font-black bg-emerald-200 text-emerald-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider flex-shrink-0">Active</span>
                      )}
                      {/* Edit / Delete */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => { setEditingBankId(bank.id); setBankForm({ bankName: bank.bankName, accountNumber: bank.accountNumber, ifscCode: bank.ifscCode, upiId: bank.upiId || '' }); setShowBankForm(false); }}
                          className="p-2 hover:bg-white rounded-xl transition-all text-slate-400 hover:text-profee-blue"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteBank(bank.id)}
                          className="p-2 hover:bg-white rounded-xl transition-all text-slate-400 hover:text-rose-500"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Empty state */}
              {(!profile.bankAccounts || profile.bankAccounts.length === 0) && !showBankForm && (
                <div className="text-center py-8 text-slate-300">
                  <CreditCard size={32} className="mx-auto mb-2" />
                  <p className="text-sm font-bold font-poppins">No bank accounts added yet</p>
                </div>
              )}
            </div>

            {/* Add bank form */}
            {showBankForm && (
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4 font-poppins">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">New Bank Account</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input label="Bank Name" value={bankForm.bankName} onChange={v => setBankForm(f => ({ ...f, bankName: v }))} placeholder="HDFC Bank" />
                  <Input label="Account Number" value={bankForm.accountNumber} onChange={v => setBankForm(f => ({ ...f, accountNumber: v }))} placeholder="50100234567890" />
                  <Input label="IFSC Code" value={bankForm.ifscCode} onChange={v => setBankForm(f => ({ ...f, ifscCode: v }))} placeholder="HDFC0000123" />
                  <Input label="UPI ID" value={bankForm.upiId} onChange={v => setBankForm(f => ({ ...f, upiId: v }))} placeholder="name@upi" />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={handleAddBank} className="px-6 py-2.5 bg-profee-blue text-white rounded-xl text-sm font-bold font-poppins hover:scale-105 active:scale-95 transition-all">Save Bank</button>
                  <button onClick={() => setShowBankForm(false)} className="px-6 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-500 hover:bg-white transition-all font-poppins">Cancel</button>
                </div>
              </div>
            )}

            {/* UPI QR for selected bank */}
            {qrUrl && (
              <div className="p-6 bg-emerald-50/50 rounded-3xl flex items-center gap-6 border border-emerald-100">
                <div className="p-2 bg-white rounded-2xl shadow-sm">
                  <img src={qrUrl} alt="UPI QR" className="w-24 h-24" />
                </div>
                <div>
                  <h4 className="text-sm font-bold font-poppins text-emerald-900">UPI QR Enabled</h4>
                  <p className="text-xs text-emerald-700 mt-1 max-w-xs font-medium">Auto-generated QR for the active bank will appear in all invoices for instant customer payments.</p>
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
