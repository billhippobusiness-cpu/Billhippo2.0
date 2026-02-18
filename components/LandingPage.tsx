
import React from 'react';
import { ChevronRight, IndianRupee, BarChart3, ShieldCheck, Sparkles, ArrowRight, Play } from 'lucide-react';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface LandingPageProps {
  onEnterApp: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  return (
    <div className="min-h-screen bg-white font-inter">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center">
            <img src={BILLHIPPO_LOGO} alt="BillHippo" className="h-14 w-auto object-contain" />
          </div>
          <div className="hidden md:flex items-center gap-10">
            <a href="#" className="text-sm font-semibold text-slate-600 hover:text-profee-blue transition-colors">Features</a>
            <a href="#" className="text-sm font-semibold text-slate-600 hover:text-profee-blue transition-colors">Pricing</a>
            <a href="#" className="text-sm font-semibold text-slate-600 hover:text-profee-blue transition-colors">Testimonials</a>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={onEnterApp}
              className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-50 transition-all font-poppins"
            >
              Sign In
            </button>
            <button 
              onClick={onEnterApp}
              className="px-6 py-2.5 bg-profee-blue text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 hover:scale-105 transition-all font-poppins"
            >
              Start Free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-20 items-center">
            <div className="space-y-8 animate-in slide-in-from-left duration-700">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full border border-indigo-100">
                <span className="w-2 h-2 rounded-full bg-profee-blue animate-pulse"></span>
                <span className="text-[10px] font-bold text-profee-blue uppercase tracking-widest font-poppins">Version 2.0 is Live</span>
              </div>
              <h1 className="text-6xl md:text-7xl font-bold font-poppins text-slate-900 leading-[1.1] tracking-tight">
                Billing for <br />
                <span className="text-profee-blue">Small Business</span> <br />
                made easy.
              </h1>
              <p className="text-xl text-slate-500 leading-relaxed max-w-lg">
                The all-in-one Smart Business OS for Indian traders. Generate GST invoices, manage party ledgers, and track outstandings in one sleek interface.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <button 
                  onClick={onEnterApp}
                  className="px-8 py-5 bg-profee-blue text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-2xl shadow-indigo-200 hover:scale-[1.02] active:scale-95 transition-all font-poppins"
                >
                  Launch App Now <ArrowRight size={20} />
                </button>
                <button className="px-8 py-5 bg-white text-slate-700 border border-slate-200 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:bg-slate-50 transition-all font-poppins">
                  <Play size={20} fill="currentColor" /> Watch Demo
                </button>
              </div>
              <div className="flex items-center gap-6 pt-4 grayscale opacity-40">
                <span className="font-poppins font-black text-2xl tracking-tighter">BHARAT</span>
                <span className="font-poppins font-black text-2xl tracking-tighter">GSTIN</span>
                <span className="font-poppins font-black text-2xl tracking-tighter">UPI</span>
              </div>
            </div>

            <div className="relative animate-in zoom-in duration-1000 flex items-center justify-center">
              <div className="absolute -inset-4 bg-gradient-to-tr from-indigo-100 to-transparent rounded-[3rem] blur-3xl opacity-30"></div>
              <div className="relative flex items-center justify-center">
                <img
                  src={BILLHIPPO_LOGO}
                  alt="BillHippo Logo"
                  className="w-[420px] h-[420px] object-contain drop-shadow-2xl"
                />
                {/* Floating Elements */}
                <div className="absolute -bottom-6 -left-10 bg-white p-6 rounded-3xl shadow-2xl border border-slate-50 animate-bounce transition-all duration-3000">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-500 flex items-center justify-center">
                        <IndianRupee size={24} />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Latest Payment</p>
                        <p className="text-xl font-bold font-poppins text-slate-800">₹45,200</p>
                      </div>
                   </div>
                </div>
                <div className="absolute top-20 -right-12 bg-profee-blue p-6 rounded-3xl shadow-2xl text-white transform rotate-3">
                   <BarChart3 size={24} />
                   <p className="mt-2 text-sm font-bold font-poppins">+24% Sales</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-32 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-20">
            <h2 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Everything you need to grow</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">Powerful features designed specifically for the unique needs of Indian businesses.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={IndianRupee} 
              title="GST Invoicing" 
              desc="Generate GST compliant invoices in seconds. Download PDFs instantly."
              color="bg-indigo-50 text-profee-blue"
            />
            <FeatureCard 
              icon={BarChart3} 
              title="Automated Ledger" 
              desc="Full double-entry party ledger with automatic balance tracking."
              color="bg-emerald-50 text-emerald-500"
            />
            <FeatureCard 
              icon={Sparkles} 
              title="AI Design Studio" 
              desc="Create professional promotion flyers using Gemini 2.5 AI."
              color="bg-orange-50 text-orange-500"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-10">
          <div className="flex items-center gap-3">
            <img src={BILLHIPPO_LOGO} alt="BillHippo" className="w-8 h-8 rounded-lg object-contain" />
            <span className="text-xl font-bold font-poppins text-slate-800">BillHippo</span>
          </div>
          <div className="flex gap-10 text-sm font-bold text-slate-400 font-poppins">
            <a href="#" className="hover:text-profee-blue">Twitter</a>
            <a href="#" className="hover:text-profee-blue">LinkedIn</a>
            <a href="#" className="hover:text-profee-blue">Contact Us</a>
          </div>
          <p className="text-xs text-slate-400 font-medium">© 2026 BillHippo. Made with ❤️ for India.</p>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon: Icon, title, desc, color }: any) => (
  <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 hover:shadow-2xl hover:-translate-y-2 transition-all group">
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 ${color}`}>
      <Icon size={28} />
    </div>
    <h3 className="text-xl font-bold font-poppins text-slate-800 mb-4">{title}</h3>
    <p className="text-slate-500 leading-relaxed">{desc}</p>
    <div className="mt-8 flex items-center gap-2 text-profee-blue font-bold text-sm opacity-0 group-hover:opacity-100 transition-opacity font-poppins">
      Learn More <ChevronRight size={16} />
    </div>
  </div>
);

export default LandingPage;
