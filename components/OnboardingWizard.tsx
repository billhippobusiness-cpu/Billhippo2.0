import React, { useState } from 'react';
import { Building2, MapPin, CreditCard, ArrowRight, ArrowLeft, CheckCircle, Loader2, Rocket, Briefcase, ShoppingCart } from 'lucide-react';
import { BusinessProfile } from '../types';
import { saveBusinessProfile } from '../lib/firestore';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh", "Puducherry"
];

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface OnboardingWizardProps {
  userId: string;
  userName: string;
  userEmail: string;
  onComplete: () => void;
}

const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ userId, userName, userEmail, onComplete }) => {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<BusinessProfile>({
    name: userName || '',
    tagline: '',
    gstin: '',
    address: '',
    city: '',
    state: 'Maharashtra',
    pincode: '',
    phone: '',
    email: userEmail || '',
    pan: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
    defaultNotes: 'Thank you for your business. Payments are due within 15 days.',
    termsAndConditions: '1. Goods once sold will not be taken back.',
    gstEnabled: true,
    businessType: undefined,
    theme: {
      templateId: 'modern-2',
      primaryColor: '#4c2de0',
      fontFamily: 'Poppins, sans-serif',
      invoicePrefix: 'INV/2026/',
      autoNumbering: true
    }
  });

  // Step 0 = business type; steps 1-3 = original wizard steps
  const steps = [
    { title: 'Business Type', subtitle: 'Tell us what kind of business you run', icon: Briefcase },
    { title: 'Business Details', subtitle: 'Tell us about your business', icon: Building2 },
    { title: 'Address & GST', subtitle: 'Your place of supply', icon: MapPin },
    { title: 'Bank & UPI', subtitle: 'Payment details for invoices', icon: CreditCard },
  ];

  const validateStep = (): boolean => {
    setError(null);
    if (step === 0) {
      if (!profile.businessType) { setError('Please select your business type to continue'); return false; }
    }
    if (step === 1) {
      if (!profile.name.trim()) { setError('Business name is required'); return false; }
      if (!profile.phone.trim()) { setError('Contact number is required'); return false; }
    }
    if (step === 2) {
      if (!profile.city.trim()) { setError('City is required'); return false; }
      if (!profile.state.trim()) { setError('State is required'); return false; }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    if (step < steps.length - 1) setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    if (step > 0) setStep(step - 1);
  };

  const handleFinish = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveBusinessProfile(userId, profile);
      onComplete();
    } catch (err: any) {
      setError('Failed to save profile. Please try again.');
      console.error('Onboarding save error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <img src={BILLHIPPO_LOGO} alt="BillHippo" className="w-10 h-10 rounded-xl object-contain" />
          <span className="text-2xl font-bold font-poppins tracking-tight text-slate-800">BillHippo</span>
        </div>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-poppins text-slate-900 tracking-tight">Set up your business profile</h1>
          <p className="text-sm text-slate-400 font-medium mt-2 font-poppins">Complete these steps to start creating invoices</p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 mb-10">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm font-poppins transition-all duration-300 ${
                i < step ? 'bg-emerald-500 text-white' :
                i === step ? 'bg-profee-blue text-white shadow-lg shadow-indigo-200 scale-110' :
                'bg-slate-100 text-slate-400'
              }`}>
                {i < step ? <CheckCircle size={18} /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-12 h-1 rounded-full transition-all duration-300 ${i < step ? 'bg-emerald-500' : 'bg-slate-100'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-50">
          <div className="flex items-center gap-3 mb-8">
            {React.createElement(steps[step].icon, { size: 24, className: 'text-profee-blue' })}
            <div>
              <h2 className="text-xl font-bold font-poppins text-slate-900">{steps[step].title}</h2>
              <p className="text-xs text-slate-400 font-medium font-poppins">{steps[step].subtitle}</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-sm text-rose-600 font-medium text-center">
              {error}
            </div>
          )}

          {/* Step 0: Business Type */}
          {step === 0 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <p className="text-sm text-slate-500 font-medium font-poppins -mt-2 mb-6">
                This helps BillHippo personalise features for you — inventory management is available for Trading businesses only.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Service */}
                <button
                  onClick={() => setProfile({ ...profile, businessType: 'service' })}
                  className={`relative p-8 rounded-[2rem] border-2 text-left transition-all group ${
                    profile.businessType === 'service'
                      ? 'border-profee-blue bg-indigo-50 shadow-lg shadow-indigo-100'
                      : 'border-slate-100 bg-slate-50/60 hover:border-slate-200'
                  }`}
                >
                  {profile.businessType === 'service' && (
                    <div className="absolute top-4 right-4 bg-profee-blue text-white p-1.5 rounded-full">
                      <CheckCircle size={14} />
                    </div>
                  )}
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${
                    profile.businessType === 'service' ? 'bg-profee-blue' : 'bg-slate-200 group-hover:bg-slate-300'
                  }`}>
                    <Briefcase size={26} className={profile.businessType === 'service' ? 'text-white' : 'text-slate-500'} />
                  </div>
                  <h3 className="text-lg font-bold font-poppins text-slate-900 mb-2">Service Business</h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Consultants, lawyers, agencies, freelancers, IT services, architects, doctors, etc.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {['Consulting', 'IT Services', 'Legal', 'Design'].map(t => (
                      <span key={t} className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest ${
                        profile.businessType === 'service' ? 'bg-indigo-100 text-profee-blue' : 'bg-slate-100 text-slate-400'
                      }`}>{t}</span>
                    ))}
                  </div>
                </button>

                {/* Trading */}
                <button
                  onClick={() => setProfile({ ...profile, businessType: 'trading' })}
                  className={`relative p-8 rounded-[2rem] border-2 text-left transition-all group ${
                    profile.businessType === 'trading'
                      ? 'border-amber-400 bg-amber-50 shadow-lg shadow-amber-100'
                      : 'border-slate-100 bg-slate-50/60 hover:border-slate-200'
                  }`}
                >
                  {profile.businessType === 'trading' && (
                    <div className="absolute top-4 right-4 bg-amber-500 text-white p-1.5 rounded-full">
                      <CheckCircle size={14} />
                    </div>
                  )}
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-5 ${
                    profile.businessType === 'trading' ? 'bg-amber-500' : 'bg-slate-200 group-hover:bg-slate-300'
                  }`}>
                    <ShoppingCart size={26} className={profile.businessType === 'trading' ? 'text-white' : 'text-slate-500'} />
                  </div>
                  <h3 className="text-lg font-bold font-poppins text-slate-900 mb-2">Trading Business</h3>
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    Retailers, wholesalers, manufacturers, distributors — any business selling physical goods.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {['Retail', 'Wholesale', 'Manufacturing', 'Distribution'].map(t => (
                      <span key={t} className={`text-[9px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest ${
                        profile.businessType === 'trading' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'
                      }`}>{t}</span>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-amber-100/60">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">
                      ✦ Includes Inventory Management
                    </p>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Business Details */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-poppins animate-in fade-in duration-300">
              <div className="md:col-span-2">
                <Input label="Business / Legal Name *" value={profile.name} onChange={v => setProfile({...profile, name: v})} placeholder="e.g. Sharma Electronics Pvt Ltd" />
              </div>
              <Input label="Email Address" value={profile.email} onChange={v => setProfile({...profile, email: v})} placeholder="business@email.com" />
              <Input label="Contact Number *" value={profile.phone} onChange={v => setProfile({...profile, phone: v})} placeholder="+91 98765 43210" />
              <Input label="Business Tagline" value={profile.tagline || ''} onChange={v => setProfile({...profile, tagline: v})} placeholder="Your business tagline" />
              <Input label="PAN Number" value={profile.pan} onChange={v => setProfile({...profile, pan: v})} placeholder="ABCDE1234F" />
            </div>
          )}

          {/* Step 2: Address & GST */}
          {step === 2 && (
            <div className="space-y-6 font-poppins animate-in fade-in duration-300">
              <Input label="Street Address" value={profile.address} onChange={v => setProfile({...profile, address: v})} placeholder="Shop no. 5, MG Road" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Input label="City *" value={profile.city} onChange={v => setProfile({...profile, city: v})} placeholder="Mumbai" />
                <Input label="Pincode" value={profile.pincode} onChange={v => setProfile({...profile, pincode: v})} placeholder="400001" />
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">State *</label>
                  <select
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 appearance-none focus:ring-2 ring-indigo-50"
                    value={profile.state}
                    onChange={e => setProfile({...profile, state: e.target.value})}
                  >
                    {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <Input label="GSTIN Number" value={profile.gstin} onChange={v => setProfile({...profile, gstin: v})} placeholder="27AABCB1234A1Z1 (leave blank if not registered)" />
              <div className="p-6 bg-indigo-50 rounded-2xl flex items-center justify-between border border-indigo-100">
                <div>
                  <p className="text-sm font-bold text-slate-800 font-poppins">GST Registered?</p>
                  <p className="text-xs text-slate-400 font-medium mt-1">Enable if your business is GST registered</p>
                </div>
                <button
                  onClick={() => setProfile({...profile, gstEnabled: !profile.gstEnabled})}
                  className={`w-14 h-7 rounded-full relative transition-colors border-2 ${profile.gstEnabled ? 'bg-emerald-400 border-emerald-300' : 'bg-slate-200 border-slate-200'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${profile.gstEnabled ? 'translate-x-8' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Bank & UPI */}
          {step === 3 && (
            <div className="space-y-6 font-poppins animate-in fade-in duration-300">
              <p className="text-xs text-slate-400 font-medium -mt-4 mb-2">These details will appear on your invoices for customer payments. You can skip and add later.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input label="Bank Name" value={profile.bankName || ''} onChange={v => setProfile({...profile, bankName: v})} placeholder="HDFC Bank" />
                <Input label="Account Number" value={profile.accountNumber || ''} onChange={v => setProfile({...profile, accountNumber: v})} placeholder="50100234567890" />
                <Input label="IFSC Code" value={profile.ifscCode || ''} onChange={v => setProfile({...profile, ifscCode: v})} placeholder="HDFC0000123" />
                <Input label="UPI ID" value={profile.upiId || ''} onChange={v => setProfile({...profile, upiId: v})} placeholder="name@upi" />
              </div>
              {profile.upiId && (
                <div className="p-5 bg-emerald-50 rounded-2xl flex items-center gap-4 border border-emerald-100">
                  <CheckCircle className="text-emerald-500" size={20} />
                  <p className="text-sm font-bold text-emerald-700 font-poppins">UPI QR code will be auto-generated on your invoices</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-10 pt-8 border-t border-slate-50">
            {step > 0 ? (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors font-poppins"
              >
                <ArrowLeft size={18} /> Back
              </button>
            ) : (
              <div />
            )}
            {step < steps.length - 1 ? (
              <button
                onClick={handleNext}
                className="bg-profee-blue text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95 transition-all font-poppins"
              >
                Next <ArrowRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={saving}
                className="bg-emerald-500 text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-emerald-100 hover:scale-105 active:scale-95 transition-all font-poppins disabled:opacity-50"
              >
                {saving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Rocket size={18} /> Finish Setup</>}
              </button>
            )}
          </div>
        </div>

        {/* Skip option */}
        <div className="text-center mt-6">
          <button
            onClick={handleFinish}
            className="text-sm text-slate-400 font-medium font-poppins hover:text-slate-600 transition-colors underline underline-offset-4"
          >
            Skip for now, I'll set up later
          </button>
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

export default OnboardingWizard;
