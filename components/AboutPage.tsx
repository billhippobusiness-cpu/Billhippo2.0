
import React from 'react';
import { ArrowRight, MapPin, Mail, Building2, Target, Users, Zap, ShieldCheck } from 'lucide-react';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface AboutPageProps {
  onEnterApp: () => void;
}

const AboutPage: React.FC<AboutPageProps> = ({ onEnterApp }) => {
  return (
    <div className="min-h-screen bg-white font-inter">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <a href="#" className="flex items-center">
            <img src={BILLHIPPO_LOGO} alt="BillHippo" className="h-12 w-auto object-contain" />
          </a>
          <div className="hidden md:flex items-center gap-8">
            <a href="#/about" className="text-sm font-semibold text-profee-blue font-poppins">About</a>
            <a href="#/contact" className="text-sm font-semibold text-slate-600 hover:text-profee-blue transition-colors font-poppins">Contact</a>
            <a href="#/privacy" className="text-sm font-semibold text-slate-600 hover:text-profee-blue transition-colors font-poppins">Privacy</a>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={onEnterApp}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all font-poppins"
            >
              Sign In
            </button>
            <button
              onClick={onEnterApp}
              className="px-5 py-2.5 bg-profee-blue text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:scale-105 transition-all font-poppins"
            >
              Start Free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-40 pb-20 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full border border-indigo-100 mb-6">
            <Building2 size={14} className="text-profee-blue" />
            <span className="text-[10px] font-bold text-profee-blue uppercase tracking-widest font-poppins">Our Story</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold font-poppins text-slate-900 leading-tight tracking-tight mb-6">
            Building India's Smartest <br />
            <span className="text-profee-blue">Billing Platform</span>
          </h1>
          <p className="text-xl text-slate-500 leading-relaxed max-w-2xl mx-auto">
            We started BillHippo with a simple belief — every Indian small business deserves powerful tools without complexity or cost.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <h2 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Our Mission</h2>
              <p className="text-slate-500 text-lg leading-relaxed">
                Millions of Indian traders, shopkeepers, and service providers run their businesses on paper registers and spreadsheets. We're changing that.
              </p>
              <p className="text-slate-500 text-lg leading-relaxed">
                BillHippo provides a GST-compliant invoicing, ledger management, and business analytics platform designed specifically for the unique needs of Indian SMEs — intuitive enough for anyone to use from day one, powerful enough to grow with your business.
              </p>
              <button
                onClick={onEnterApp}
                className="inline-flex items-center gap-2 px-7 py-4 bg-profee-blue text-white rounded-2xl font-bold text-sm hover:scale-[1.02] transition-all font-poppins shadow-lg shadow-indigo-200"
              >
                Start for Free <ArrowRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-6">
              {[
                { icon: Target, label: 'Mission', value: 'Simplify billing for every Indian business', color: 'bg-indigo-50 text-profee-blue' },
                { icon: Users, label: 'Community', value: '2,000+ businesses onboarded', color: 'bg-emerald-50 text-emerald-600' },
                { icon: Zap, label: 'Speed', value: 'Invoice in under 30 seconds', color: 'bg-amber-50 text-amber-600' },
                { icon: ShieldCheck, label: 'Compliance', value: '100% GST compliant', color: 'bg-rose-50 text-rose-500' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-white p-6 rounded-2xl border border-slate-100"
                  style={{ boxShadow: '0 2px 4px -1px rgba(0,0,0,0.05), 0 8px 24px -6px rgba(76,45,224,0.08)' }}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${item.color}`}>
                    <item.icon size={20} />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider font-poppins mb-1">{item.label}</p>
                  <p className="text-sm font-semibold text-slate-800 leading-snug">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Company Info */}
      <section className="py-24 bg-slate-50/60">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">The Company Behind BillHippo</h2>
            <p className="text-slate-500 mt-4 text-lg">Registered and operating from the heart of Ahmedabad, Gujarat.</p>
          </div>
          <div className="bg-white rounded-[2.5rem] border border-slate-100 p-10 md:p-14 space-y-8"
            style={{ boxShadow: '0 2px 4px -1px rgba(0,0,0,0.05), 0 16px 40px -12px rgba(76,45,224,0.12)' }}
          >
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-poppins mb-2">Legal Entity</p>
              <p className="text-2xl font-bold font-poppins text-slate-900">Mehtaji Bizcon LLP</p>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="grid md:grid-cols-2 gap-8">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-profee-blue flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MapPin size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-poppins mb-2">Registered Address</p>
                  <p className="text-slate-700 leading-relaxed">
                    1210, City Center,<br />
                    B/s Heer Party Plot,<br />
                    Science City Road, Sola,<br />
                    Ahmedabad – 380060,<br />
                    Gujarat, India
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-profee-blue flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Mail size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-poppins mb-2">Email</p>
                  <a
                    href="mailto:info@billhippo.in"
                    className="text-profee-blue font-semibold hover:underline"
                  >
                    info@billhippo.in
                  </a>
                  <p className="text-slate-400 text-sm mt-1">We respond within 24 business hours</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 bg-white">
        <div className="max-w-2xl mx-auto px-6 text-center space-y-6">
          <h2 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Ready to get started?</h2>
          <p className="text-slate-500 text-lg leading-relaxed">Join thousands of Indian businesses managing their invoicing and ledgers with BillHippo — completely free.</p>
          <button
            onClick={onEnterApp}
            className="px-10 py-5 bg-profee-blue text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-2xl shadow-indigo-200 hover:scale-[1.02] active:scale-95 transition-all font-poppins mx-auto"
          >
            Start for Free <ArrowRight size={20} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-14 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <img src={BILLHIPPO_LOGO} alt="BillHippo" className="w-8 h-8 rounded-xl object-contain" />
              <span className="text-lg font-bold font-poppins text-slate-800">BillHippo</span>
            </div>
            <div className="flex gap-8 text-sm font-bold text-slate-400 font-poppins flex-wrap justify-center">
              <a href="#" className="hover:text-profee-blue transition-colors">Home</a>
              <a href="#/about" className="hover:text-profee-blue transition-colors">About</a>
              <a href="#/contact" className="hover:text-profee-blue transition-colors">Contact Us</a>
              <a href="#/privacy" className="hover:text-profee-blue transition-colors">Privacy Policy</a>
            </div>
            <p className="text-xs text-slate-400 font-medium">© 2026 Mehtaji Bizcon LLP. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AboutPage;
