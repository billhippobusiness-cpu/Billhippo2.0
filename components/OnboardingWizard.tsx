import React, { useState } from 'react';
import { Building2, CreditCard, ArrowRight, ArrowLeft, CheckCircle, Loader2, Rocket, Briefcase, ShoppingCart, Search, ShieldCheck } from 'lucide-react';
import { BusinessProfile, CompositionCategory, GSTScheme } from '../types';
import { saveBusinessProfile } from '../lib/firestore';
import { lookupGSTIN } from '../lib/whitebooksApi';
import { COMPOSITION_CATEGORIES, DEFAULT_COMPOSITION_CATEGORY } from '../lib/gstScheme';
import { getFYLabel, getFYDateRange } from '../lib/financialYear';

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

  // GSTIN lookup state
  const [gstinFetching, setGstinFetching] = useState(false);
  const [gstinFetchResult, setGstinFetchResult] = useState<any>(null);
  const [gstinFetchError, setGstinFetchError] = useState<string | null>(null);

  // GST scheme selection (only relevant when gstEnabled)
  const [gstScheme, setGstScheme] = useState<GSTScheme>('regular');
  const [compositionCategory, setCompositionCategory] = useState<CompositionCategory>(DEFAULT_COMPOSITION_CATEGORY);

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
    gstEnabled: false,
    businessType: undefined,
    theme: {
      templateId: 'modern-2',
      primaryColor: '#4c2de0',
      fontFamily: 'Poppins, sans-serif',
      invoicePrefix: 'INV/2026/',
      autoNumbering: true
    }
  });

  const handleFetchGSTIN = async () => {
    const g = profile.gstin.trim().toUpperCase();
    if (g.length !== 15) return;
    setGstinFetching(true);
    setGstinFetchResult(null);
    setGstinFetchError(null);
    try {
      const result = await lookupGSTIN(g);
      setGstinFetchResult(result);
      setProfile(prev => ({
        ...prev,
        name:                prev.name    || result.tradeName || result.legalName,
        address:             result.address || prev.address,
        city:                result.city    || prev.city,
        state:               result.state   || prev.state,
        pincode:             result.pincode || prev.pincode,
        gstRegistrationType: result.taxpayerType || '',
      }));
      // Auto-select the scheme from the portal's taxpayer type (user can change it)
      if (/composition/i.test(result.taxpayerType || '')) setGstScheme('composition');
      else if (result.taxpayerType) setGstScheme('regular');
    } catch (err: any) {
      setGstinFetchError(err?.message ?? 'Could not fetch GSTIN details. Please check and try again.');
    } finally {
      setGstinFetching(false);
    }
  };

  // Step 0 = GST registration (with GSTIN auto-fetch); step 1 = business type;
  // step 2 = business details + address (pre-filled from GSTIN); step 3 = bank.
  const steps = [
    { title: 'GST Registration', subtitle: 'Are you registered under GST?', icon: ShieldCheck },
    { title: 'Business Type', subtitle: 'Tell us what kind of business you run', icon: Briefcase },
    { title: 'Business Details', subtitle: 'Your business & place of supply', icon: Building2 },
    { title: 'Bank & UPI', subtitle: 'Payment details for invoices', icon: CreditCard },
  ];

  const validateStep = (): boolean => {
    setError(null);
    if (step === 0) {
      if (profile.gstEnabled && profile.gstin.trim().length !== 15) {
        setError('Enter your 15-digit GSTIN, or turn off "Registered under GST" to continue');
        return false;
      }
    }
    if (step === 1) {
      if (!profile.businessType) { setError('Please select your business type to continue'); return false; }
    }
    if (step === 2) {
      if (!profile.name.trim()) { setError('Business name is required'); return false; }
      if (!profile.phone.trim()) { setError('Contact number is required'); return false; }
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
      // Seed the scheme history from the onboarding selection. Effective from
      // the current FY start; getSchemeOnDate() clamps earlier dates to the
      // first entry, so one entry is enough.
      const finalProfile: BusinessProfile = { ...profile };
      if (profile.gstEnabled) {
        const fyStart = getFYDateRange(getFYLabel()).start;
        finalProfile.gstScheme = gstScheme;
        finalProfile.schemeHistory = [{
          scheme: gstScheme,
          effectiveFrom: fyStart,
          ...(gstScheme === 'composition' ? { compositionCategory } : {}),
        }];
        if (gstScheme === 'composition') finalProfile.compositionCategory = compositionCategory;
      }
      await saveBusinessProfile(userId, finalProfile);
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

          {/* Step 0: GST Registration */}
          {step === 0 && (
            <div className="space-y-6 font-poppins animate-in fade-in duration-300">

              <p className="text-sm text-slate-500 font-medium -mt-2">
                If your business is registered under GST, enter your GSTIN and we'll auto-fill your legal name and address in the next steps — no manual typing needed.
              </p>

              {/* GST Toggle */}
              <div className="p-6 bg-indigo-50 rounded-2xl flex items-center justify-between border border-indigo-100">
                <div>
                  <p className="text-sm font-bold text-slate-800 font-poppins">Registered under GST?</p>
                  <p className="text-xs text-slate-400 font-medium mt-1">Enable if your business has a GSTIN</p>
                </div>
                <button
                  onClick={() => {
                    setProfile({...profile, gstEnabled: !profile.gstEnabled, gstin: profile.gstEnabled ? '' : profile.gstin});
                    setGstinFetchResult(null);
                    setGstinFetchError(null);
                  }}
                  className={`w-14 h-7 rounded-full relative transition-colors border-2 ${profile.gstEnabled ? 'bg-emerald-400 border-emerald-300' : 'bg-slate-200 border-slate-200'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${profile.gstEnabled ? 'translate-x-8' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* GSTIN input + Fetch button — only when GST enabled */}
              {profile.gstEnabled && (
                <div className="space-y-3">
                  <div className="flex gap-3 items-end">
                    <div className="flex-1">
                      <Input
                        label="GSTIN Number *"
                        value={profile.gstin}
                        onChange={v => {
                          setProfile({...profile, gstin: v.toUpperCase()});
                          setGstinFetchResult(null);
                          setGstinFetchError(null);
                        }}
                        placeholder="27AABCB1234A1Z1"
                      />
                    </div>
                    <button
                      onClick={handleFetchGSTIN}
                      disabled={profile.gstin.trim().length !== 15 || gstinFetching}
                      className="flex items-center gap-2 px-5 py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {gstinFetching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                      {gstinFetching ? 'Fetching...' : 'Fetch Details'}
                    </button>
                  </div>

                  {/* Error */}
                  {gstinFetchError && (
                    <p className="text-xs text-rose-600 font-medium px-2">{gstinFetchError}</p>
                  )}

                  {/* GST Scheme selection */}
                  <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                    <div>
                      <p className="text-sm font-bold text-slate-800 font-poppins">GST Scheme</p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">Composition dealers issue Bills of Supply (no GST charged) and file CMP-08 / GSTR-4 instead of GSTR-1 / GSTR-3B</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setGstScheme('regular')}
                        className={`p-4 rounded-2xl border-2 text-left transition-all ${gstScheme === 'regular' ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        <p className={`text-sm font-bold ${gstScheme === 'regular' ? 'text-indigo-700' : 'text-slate-700'}`}>Regular</p>
                        <p className="text-[11px] text-slate-400 font-medium mt-1">Charge GST on invoices, claim ITC, file GSTR-1 & GSTR-3B</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setGstScheme('composition')}
                        className={`p-4 rounded-2xl border-2 text-left transition-all ${gstScheme === 'composition' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        <p className={`text-sm font-bold ${gstScheme === 'composition' ? 'text-emerald-700' : 'text-slate-700'}`}>Composition</p>
                        <p className="text-[11px] text-slate-400 font-medium mt-1">Fixed tax on turnover, no GST on bills, no ITC, file CMP-08 & GSTR-4</p>
                      </button>
                    </div>
                    {gstScheme === 'composition' && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Composition Category</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(Object.keys(COMPOSITION_CATEGORIES) as CompositionCategory[]).map(cat => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setCompositionCategory(cat)}
                              className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all ${compositionCategory === cat ? 'border-emerald-500 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                            >
                              <p className={`text-xs font-bold ${compositionCategory === cat ? 'text-emerald-700' : 'text-slate-600'}`}>{COMPOSITION_CATEGORIES[cat].shortLabel}</p>
                            </button>
                          ))}
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium">{COMPOSITION_CATEGORIES[compositionCategory].label} — used to compute your CMP-08 quarterly tax</p>
                      </div>
                    )}
                  </div>

                  {/* Success card */}
                  {gstinFetchResult && (
                    <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                      <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3">✓ Details fetched — your name &amp; address will be pre-filled in the next steps</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                        <div>
                          <span className="text-slate-400 font-medium">Legal Name</span>
                          <p className="font-bold text-slate-800">{gstinFetchResult.legalName}</p>
                        </div>
                        {gstinFetchResult.tradeName && gstinFetchResult.tradeName !== gstinFetchResult.legalName && (
                          <div>
                            <span className="text-slate-400 font-medium">Trade Name</span>
                            <p className="font-bold text-slate-800">{gstinFetchResult.tradeName}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-400 font-medium">Registration Type</span>
                          <p className="font-bold text-slate-800">{gstinFetchResult.taxpayerType || '—'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400 font-medium">Status</span>
                          <p className={`font-bold ${/active/i.test(gstinFetchResult.status) ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {gstinFetchResult.status || '—'}
                          </p>
                        </div>
                        {gstinFetchResult.constitutionOfBusiness && (
                          <div>
                            <span className="text-slate-400 font-medium">Constitution</span>
                            <p className="font-bold text-slate-800">{gstinFetchResult.constitutionOfBusiness}</p>
                          </div>
                        )}
                        {gstinFetchResult.registrationDate && (
                          <div>
                            <span className="text-slate-400 font-medium">Registered On</span>
                            <p className="font-bold text-slate-800">{gstinFetchResult.registrationDate}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!profile.gstEnabled && (
                <div className="p-5 bg-slate-50 border border-slate-100 rounded-2xl">
                  <p className="text-sm text-slate-500 font-medium">No problem — you can enter your business details manually in the next steps, and add a GSTIN anytime later from Settings.</p>
                </div>
              )}
            </div>
          )}

          {/* Step 1: Business Type */}
          {step === 1 && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <p className="text-sm text-slate-500 font-medium font-poppins -mt-2 mb-6">
                This helps BillHippo personalise features for you — inventory management is available for Trading businesses only.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Service */}
                <button
                  onClick={() => setProfile({ ...profile, businessType: 'service' })}
                  className={`p-8 rounded-3xl border-2 text-left transition-all duration-200 hover:scale-[1.02] ${
                    profile.businessType === 'service'
                      ? 'border-profee-blue bg-indigo-50 shadow-lg shadow-indigo-100'
                      : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${profile.businessType === 'service' ? 'bg-profee-blue' : 'bg-slate-200'}`}>
                    <Briefcase size={22} className={profile.businessType === 'service' ? 'text-white' : 'text-slate-500'} />
                  </div>
                  <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${profile.businessType === 'service' ? 'text-profee-blue' : 'text-slate-400'}`}>Service</div>
                  <h3 className="text-lg font-bold font-poppins text-slate-900 mb-1">Service Business</h3>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">Consultants, lawyers, agencies, freelancers, IT services, architects, doctors</p>
                  {profile.businessType === 'service' && (
                    <div className="mt-4 flex items-center gap-1.5 text-profee-blue font-bold text-xs">
                      <CheckCircle size={14} /> Selected
                    </div>
                  )}
                </button>
                {/* Trading */}
                <button
                  onClick={() => setProfile({ ...profile, businessType: 'trading' })}
                  className={`p-8 rounded-3xl border-2 text-left transition-all duration-200 hover:scale-[1.02] ${
                    profile.businessType === 'trading'
                      ? 'border-amber-500 bg-amber-50 shadow-lg shadow-amber-100'
                      : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${profile.businessType === 'trading' ? 'bg-amber-500' : 'bg-slate-200'}`}>
                    <ShoppingCart size={22} className={profile.businessType === 'trading' ? 'text-white' : 'text-slate-500'} />
                  </div>
                  <div className={`text-xs font-bold uppercase tracking-widest mb-2 ${profile.businessType === 'trading' ? 'text-amber-600' : 'text-slate-400'}`}>Trading</div>
                  <h3 className="text-lg font-bold font-poppins text-slate-900 mb-1">Trading Business</h3>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed">Retailers, wholesalers, manufacturers, distributors (includes inventory management)</p>
                  {profile.businessType === 'trading' && (
                    <div className="mt-4 flex items-center gap-1.5 text-amber-600 font-bold text-xs">
                      <CheckCircle size={14} /> Selected
                    </div>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Business Details & Address (pre-filled from GSTIN when available) */}
          {step === 2 && (
            <div className="space-y-6 font-poppins animate-in fade-in duration-300">
              {profile.gstEnabled && gstinFetchResult && (
                <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3">
                  <CheckCircle className="text-emerald-500 shrink-0" size={18} />
                  <p className="text-xs font-semibold text-emerald-700">Auto-filled from your GSTIN — review and edit anything if needed.</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <Input label="Business / Legal Name *" value={profile.name} onChange={v => setProfile({...profile, name: v})} placeholder="e.g. Sharma Electronics Pvt Ltd" />
                </div>
                <Input label="Email Address" value={profile.email} onChange={v => setProfile({...profile, email: v})} placeholder="business@email.com" />
                <Input label="Contact Number *" value={profile.phone} onChange={v => setProfile({...profile, phone: v})} placeholder="+91 98765 43210" />
                <Input label="Business Tagline" value={profile.tagline || ''} onChange={v => setProfile({...profile, tagline: v})} placeholder="Your business tagline" />
                <Input label="PAN Number" value={profile.pan} onChange={v => setProfile({...profile, pan: v})} placeholder="ABCDE1234F" />
              </div>

              {/* Address / place of supply */}
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
