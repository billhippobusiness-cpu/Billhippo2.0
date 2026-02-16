
import React, { useState, useEffect } from 'react';
import { Save, Palette, Type, Hash, Image as ImageIcon, Check, Layout, AlertCircle, Loader2 } from 'lucide-react';
import { BusinessTheme } from '../types';
import { getBusinessProfile, saveBusinessProfile } from '../lib/firestore';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

const COLORS = [
  { name: 'Indigo Premium', value: '#4c2de0' },
  { name: 'Professional Green', value: '#2e7d32' },
  { name: 'Deep Emerald', value: '#10b981' },
  { name: 'Classic Slate', value: '#334155' },
  { name: 'Royal Crimson', value: '#e11d48' },
  { name: 'Ocean Blue', value: '#0284c7' },
];

const TEMPLATES = [
  { id: 'modern-1', name: 'Modern 1', desc: 'Logo Left, Title Center/Right. Professional billing boxes.' },
  { id: 'modern-2', name: 'Modern 2', desc: 'Title Left with Metadata, Logo Right. High-clarity tabular form.' },
  { id: 'minimal', name: 'Minimalist', desc: 'Clean, airy layout for creative services.' },
];

const FONTS = [
  { name: 'Professional Poppins', value: 'Poppins, sans-serif' },
  { name: 'Modern Sans', value: 'Inter, sans-serif' },
  { name: 'Elegant Serif', value: 'Georgia, serif' },
];

interface InvoiceThemeProps { userId: string; }

const InvoiceTheme: React.FC<InvoiceThemeProps> = ({ userId }) => {
  const [theme, setTheme] = useState<BusinessTheme>({
    templateId: 'modern-2',
    primaryColor: '#4c2de0',
    fontFamily: 'Poppins, sans-serif',
    invoicePrefix: 'INV/2026/',
    autoNumbering: true,
    logoUrl: BILLHIPPO_LOGO
  });

  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const profile = await getBusinessProfile(userId);
        if (profile?.theme) setTheme(profile.theme);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    load();
  }, [userId]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const profile = await getBusinessProfile(userId);
      if (profile) {
        await saveBusinessProfile(userId, { ...profile, theme });
      } else {
        await saveBusinessProfile(userId, {
          name: 'Your Business', gstin: '', address: '', city: '', state: 'Maharashtra',
          pincode: '', phone: '', email: '', pan: '', gstEnabled: true, theme
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) { console.error(err); }
    finally { setIsSaving(false); }
  };

  if (loading) {
    return (<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="w-8 h-8 animate-spin text-profee-blue mx-auto" /></div>);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 pb-20">
      <div className="flex justify-between items-end mb-2">
        <div>
          <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Invoice Theme</h1>
          <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">Personalize your brand identity</p>
        </div>
        <div className="flex items-center gap-4">
          {saved && <span className="text-sm font-bold text-emerald-500 font-poppins flex items-center gap-2"><Check size={16} /> Saved!</span>}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-profee-blue text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 transition-all font-poppins disabled:opacity-50"
          >
            {isSaving ? <><Loader2 size={20} className="animate-spin" /> Updating...</> : <><Save size={20} /> Save Theme</>}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-8">
          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8">
            <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
              <Layout className="text-profee-blue" size={22} /> Choose Template Style
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {TEMPLATES.map(t => (
                 <button
                  key={t.id}
                  onClick={() => setTheme({...theme, templateId: t.id as any})}
                  className={`p-5 rounded-[2rem] border-2 text-left transition-all relative ${theme.templateId === t.id ? 'bg-indigo-50 border-profee-blue' : 'bg-white border-slate-50 hover:border-slate-100'}`}
                 >
                    {theme.templateId === t.id && (
                      <div className="absolute top-3 right-3 bg-profee-blue text-white p-1 rounded-full"><Check size={12} /></div>
                    )}
                    <h4 className="font-bold text-slate-800 text-sm mb-1">{t.name}</h4>
                    <p className="text-[9px] text-slate-400 font-medium leading-tight">{t.desc}</p>
                 </button>
               ))}
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8">
            <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
              <Palette className="text-profee-blue" size={22} /> Color & Typography
            </h3>

            <div className="space-y-6">
              <div className="grid grid-cols-6 gap-3">
                 {COLORS.map(c => (
                   <button
                      key={c.value}
                      onClick={() => setTheme({...theme, primaryColor: c.value})}
                      className={`h-12 rounded-xl transition-all ${theme.primaryColor === c.value ? 'ring-4 ring-indigo-100 scale-105 shadow-md' : 'hover:scale-105'}`}
                      style={{ backgroundColor: c.value }}
                   />
                 ))}
              </div>

              <div className="grid grid-cols-3 gap-4">
                 {FONTS.map(f => (
                   <button
                      key={f.value}
                      onClick={() => setTheme({...theme, fontFamily: f.value})}
                      className={`p-4 rounded-xl border flex items-center justify-center transition-all ${theme.fontFamily === f.value ? 'bg-indigo-50 border-profee-blue' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}
                   >
                      <span className="font-bold text-[10px]" style={{ fontFamily: f.value }}>{f.name}</span>
                   </button>
                 ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8">
            <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
              <Hash className="text-orange-500" size={22} /> Sequencing
            </h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Invoice Prefix</label>
                <input
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700"
                  value={theme.invoicePrefix}
                  onChange={e => setTheme({...theme, invoicePrefix: e.target.value})}
                />
              </div>
              <div className="bg-slate-50 p-6 rounded-2xl flex items-center justify-between">
                 <span className="text-sm font-bold text-slate-800">Auto Numbering</span>
                 <button
                    onClick={() => setTheme({...theme, autoNumbering: !theme.autoNumbering})}
                    className={`w-12 h-6 rounded-full relative transition-colors ${theme.autoNumbering ? 'bg-profee-blue' : 'bg-slate-300'}`}
                 >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${theme.autoNumbering ? 'translate-x-7' : 'translate-x-1'}`}></div>
                 </button>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-6 sticky top-10">
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Real-time Preview</p>
           <div className="bg-white rounded-[1rem] p-8 border border-slate-100 shadow-2xl scale-90 origin-top overflow-hidden min-h-[550px]" style={{ fontFamily: theme.fontFamily }}>
              {theme.templateId === 'modern-2' ? (
                <div className="space-y-6">
                   <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h2 className="text-4xl font-black uppercase tracking-tighter leading-none" style={{ color: theme.primaryColor }}>Invoice</h2>
                        <div className="text-[8px] font-bold text-slate-400 space-y-0.5 uppercase tracking-tight mt-2">
                          <p>Invoice# <span className="text-slate-900">{theme.invoicePrefix}004</span></p>
                          <p>Date <span className="text-slate-900">Jun 19, 2019</span></p>
                          <p>Due Date <span className="text-slate-900">Jun 28, 2019</span></p>
                        </div>
                      </div>
                      <div className="w-20 h-10 bg-slate-50 rounded-lg flex items-center justify-center">
                         {theme.logoUrl ? <img src={theme.logoUrl} className="w-full h-full object-contain object-right" /> : <ImageIcon size={16} className="text-slate-300" />}
                      </div>
                   </div>
                   <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                         <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: theme.primaryColor }}>Billed by</p>
                         <p className="text-[9px] font-black text-slate-800 mt-1 truncate">Business Name</p>
                         <div className="h-4 w-full bg-slate-100 mt-2 rounded"></div>
                      </div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                         <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: theme.primaryColor }}>Billed to</p>
                         <p className="text-[9px] font-black text-slate-800 mt-1 truncate">Customer Party</p>
                         <div className="h-4 w-full bg-slate-100 mt-2 rounded"></div>
                      </div>
                   </div>
                   <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <div className="h-6 w-full flex items-center px-2 text-[7px] font-black text-white uppercase tracking-widest" style={{ backgroundColor: theme.primaryColor }}>
                        Items description
                      </div>
                      <div className="p-2 space-y-2">
                         <div className="flex justify-between h-3 items-center">
                           <div className="w-1/2 h-1 bg-slate-100 rounded"></div>
                           <div className="w-1/4 h-1 bg-slate-100 rounded"></div>
                         </div>
                         <div className="flex justify-between h-3 items-center">
                           <div className="w-1/3 h-1 bg-slate-100 rounded"></div>
                           <div className="w-1/4 h-1 bg-slate-100 rounded"></div>
                         </div>
                      </div>
                   </div>
                   <div className="flex justify-end pt-4">
                      <div className="w-1/2 p-3 bg-slate-50 rounded-xl space-y-2">
                         <div className="flex justify-between text-[8px] font-bold text-slate-400"><span>Sub Total</span><span className="text-slate-700">₹40,000.00</span></div>
                         <div className="flex justify-between text-xs font-black border-t border-slate-200 pt-2" style={{ color: theme.primaryColor }}><span>Total</span><span>₹42,480.00</span></div>
                      </div>
                   </div>
                </div>
              ) : theme.templateId === 'modern-1' ? (
                <div className="space-y-6">
                   <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                      <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center">
                         {theme.logoUrl ? <img src={theme.logoUrl} className="w-full h-full object-contain" /> : <ImageIcon size={16} className="text-slate-300" />}
                      </div>
                      <h2 className="text-2xl font-black uppercase tracking-widest" style={{ color: theme.primaryColor }}>Invoice</h2>
                   </div>
                   <div className="flex justify-between text-[8px] font-bold text-slate-400 uppercase">
                      <span># {theme.invoicePrefix}001</span>
                      <span>Date: Jun 19, 2026</span>
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                      <div className="h-16 rounded-xl" style={{ backgroundColor: `${theme.primaryColor}15` }}></div>
                      <div className="h-16 rounded-xl" style={{ backgroundColor: `${theme.primaryColor}15` }}></div>
                   </div>
                   <div className="bg-slate-50 h-24 rounded-2xl border border-slate-100 overflow-hidden">
                      <div className="h-6 w-full" style={{ backgroundColor: theme.primaryColor }}></div>
                   </div>
                   <div className="flex justify-between items-end">
                      <div className="h-10 w-1/2 bg-slate-50 rounded-xl"></div>
                      <div className="h-10 w-1/3 rounded-xl" style={{ backgroundColor: theme.primaryColor }}></div>
                   </div>
                </div>
              ) : (
                <div className="space-y-6 text-center pt-20">
                   <div className="h-12 w-12 rounded-full mx-auto" style={{ backgroundColor: theme.primaryColor }}></div>
                   <p className="text-xs font-bold text-slate-300 italic">Minimal Layout Selected</p>
                </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceTheme;
