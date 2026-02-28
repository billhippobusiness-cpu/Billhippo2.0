
import React from 'react';
import { ChevronRight, IndianRupee, BarChart3, ShieldCheck, Sparkles, ArrowRight, Play, TrendingUp, Users, AlertTriangle, FileText, Zap, Building2 } from 'lucide-react';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface LandingPageProps {
  onEnterApp: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onEnterApp }) => {
  return (
    <div className="min-h-screen bg-white font-inter">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-28 flex items-center justify-between">
          <div className="flex items-center">
            <img src={BILLHIPPO_LOGO} alt="BillHippo" className="h-20 w-auto object-contain" />
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
      <section className="pt-44 pb-20 overflow-hidden">
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

      {/* ── Stats Banner ── */}
      <section className="py-16 bg-profee-blue relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #ffffff 0.5px, transparent 0.5px)', backgroundSize: '28px 28px' }} />
        <div className="max-w-7xl mx-auto px-6 relative">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center text-white">
            {[
              { value: '50,000+', label: 'Invoices Generated' },
              { value: '2,000+', label: 'Businesses Onboarded' },
              { value: '100%', label: 'GST Compliant' },
              { value: 'Free', label: 'Forever for Basics' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-4xl font-black font-poppins tracking-tight">{stat.value}</p>
                <p className="text-indigo-200 text-sm font-semibold mt-1 font-poppins">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Core Features Grid ── */}
      <section id="features" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full border border-indigo-100">
              <Zap size={14} className="text-profee-blue" />
              <span className="text-[10px] font-bold text-profee-blue uppercase tracking-widest font-poppins">Packed with power</span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold font-poppins text-slate-900 tracking-tight">Everything you need to grow</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">Powerful features designed specifically for the unique needs of Indian businesses and traders.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <FeatureCard
              icon={IndianRupee}
              title="GST Invoice Generation"
              desc="Create fully GST-compliant invoices in seconds. Add line items, apply GST rates, and download professional PDFs to share directly with your customers."
              color="bg-indigo-50 text-profee-blue"
            />
            <FeatureCard
              icon={Users}
              title="Party & Customer Ledger"
              desc="Maintain a complete double-entry ledger for every customer and supplier. Instantly see who owes you, who you owe, and the running balance — all auto-calculated."
              color="bg-emerald-50 text-emerald-600"
            />
            <FeatureCard
              icon={AlertTriangle}
              title="Outstanding Tracker"
              desc="Never let a pending payment slip through. Track overdue invoices, outstanding balances, and collection status across all your parties in one clear view."
              color="bg-rose-50 text-rose-500"
            />
            <FeatureCard
              icon={BarChart3}
              title="Business Analytics Dashboard"
              desc="Visualise your sales trends, collections, and invoice status breakdowns with beautiful charts. Filter by Financial Year or custom date ranges."
              color="bg-violet-50 text-violet-600"
            />
            <FeatureCard
              icon={Sparkles}
              title="AI Design Studio"
              desc="Powered by Google Gemini 2.5. Create stunning promotional flyers, discount announcements, and festival offers — just describe what you want."
              color="bg-orange-50 text-orange-500"
            />
            <FeatureCard
              icon={ShieldCheck}
              title="BillHippo Professional"
              desc="A dedicated portal for CAs, accountants, and tax consultants to manage multiple client businesses under one login. Invite clients, manage their books effortlessly."
              color="bg-teal-50 text-teal-600"
            />
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-32 bg-slate-50/60">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center space-y-4 mb-20">
            <h2 className="text-4xl md:text-5xl font-bold font-poppins text-slate-900 tracking-tight">Up and running in minutes</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">No training needed. No complicated setup. Just sign in and start billing.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-12 relative">
            {/* Connector line */}
            <div className="hidden md:block absolute top-12 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-indigo-100 via-profee-blue to-indigo-100 opacity-40" />
            {[
              { step: '01', icon: Building2, title: 'Create Your Account', desc: 'Sign up in under 30 seconds with Google or email. Set up your business profile with your GSTIN, address, and logo.' },
              { step: '02', icon: Users, title: 'Add Your Parties', desc: 'Add your customers and suppliers with their GST details. Your party ledger is ready to use the moment you add them.' },
              { step: '03', icon: FileText, title: 'Generate & Track', desc: 'Create invoices, record payments, and watch your dashboard update in real time. Know your outstandings at a glance.' },
            ].map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="inline-flex flex-col items-center">
                  <div className="w-24 h-24 rounded-[2rem] bg-white border-2 border-indigo-100 flex items-center justify-center mb-6 shadow-lg shadow-indigo-50 relative">
                    <item.icon size={32} className="text-profee-blue" />
                    <span className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-profee-blue text-white text-xs font-black font-poppins flex items-center justify-center">{item.step}</span>
                  </div>
                  <h3 className="text-xl font-bold font-poppins text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-slate-500 leading-relaxed max-w-xs mx-auto">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BillHippo Pro Highlight ── */}
      <section id="pro" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="relative rounded-[3rem] overflow-hidden bg-gradient-to-br from-slate-900 via-[#1a0a6e] to-emerald-900 p-12 md:p-20">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, #ffffff 0.5px, transparent 0.5px)', backgroundSize: '24px 24px' }} />
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-400 opacity-10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/4" />
            <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-400 opacity-10 blur-3xl rounded-full translate-y-1/2 -translate-x-1/4" />
            <div className="relative grid md:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full border border-white/20">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest font-poppins">BillHippo Professional</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-bold font-poppins text-white leading-tight">Built for CAs & Accountants</h2>
                <p className="text-slate-300 text-lg leading-relaxed">Manage multiple client businesses from a single dashboard. Accept invitations from clients, access their invoices and ledgers, and keep all your practice work organised in one place.</p>
                <ul className="space-y-3">
                  {['Multi-client management under one login', 'Client invitation & access control system', 'Dedicated Pro dashboard with client switcher', 'Full invoice and ledger access per client'].map((point) => (
                    <li key={point} className="flex items-center gap-3 text-slate-300 text-sm">
                      <div className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      </div>
                      {point}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onEnterApp}
                  className="inline-flex items-center gap-2 px-7 py-4 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-400 transition-all font-poppins shadow-lg shadow-emerald-900/40"
                >
                  Get Pro Access <ArrowRight size={16} />
                </button>
              </div>
              <div className="hidden md:grid grid-cols-2 gap-4">
                {[
                  { icon: Users, label: 'Clients Managed', value: '12 Active' },
                  { icon: FileText, label: 'Invoices This Month', value: '340+' },
                  { icon: TrendingUp, label: 'Collections Tracked', value: '₹8.2L' },
                  { icon: ShieldCheck, label: 'GST Returns Ready', value: '100%' },
                ].map((stat) => (
                  <div key={stat.label} className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/10">
                    <stat.icon size={20} className="text-emerald-400 mb-3" />
                    <p className="text-xs text-slate-400 font-semibold font-poppins mb-1">{stat.label}</p>
                    <p className="text-xl font-bold text-white font-poppins">{stat.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="py-32 bg-slate-50/60">
        <div className="max-w-3xl mx-auto px-6 text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold font-poppins text-slate-900 tracking-tight leading-tight">
            Ready to simplify <br /> your billing?
          </h2>
          <p className="text-slate-500 text-xl leading-relaxed">Join thousands of Indian traders and small businesses who manage their invoicing, ledgers, and analytics — all in one place, for free.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onEnterApp}
              className="px-10 py-5 bg-profee-blue text-white rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-2xl shadow-indigo-200 hover:scale-[1.02] active:scale-95 transition-all font-poppins"
            >
              Start for Free <ArrowRight size={20} />
            </button>
            <button
              onClick={onEnterApp}
              className="px-10 py-5 bg-white text-slate-700 border border-slate-200 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:bg-slate-50 transition-all font-poppins"
            >
              Sign In
            </button>
          </div>
          <p className="text-xs text-slate-400 font-medium">No credit card required. Free forever for core features.</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-20 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-10 mb-10">
            <div className="flex items-center gap-3">
              <img src={BILLHIPPO_LOGO} alt="BillHippo" className="w-9 h-9 rounded-xl object-contain" />
              <span className="text-xl font-bold font-poppins text-slate-800">BillHippo</span>
            </div>
            <div className="flex gap-10 text-sm font-bold text-slate-400 font-poppins">
              <a href="#features" className="hover:text-profee-blue transition-colors">Features</a>
              <a href="#pro" className="hover:text-profee-blue transition-colors">Pro</a>
              <a href="#" className="hover:text-profee-blue transition-colors">Twitter</a>
              <a href="#" className="hover:text-profee-blue transition-colors">LinkedIn</a>
              <a href="#" className="hover:text-profee-blue transition-colors">Contact Us</a>
            </div>
            <p className="text-xs text-slate-400 font-medium">© 2026 BillHippo. Made with love for India.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

const FeatureCard = ({ icon: Icon, title, desc, color }: any) => (
  <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 hover:shadow-2xl hover:-translate-y-3 transition-all duration-300 group cursor-default"
    style={{ boxShadow: '0 2px 4px -1px rgba(0,0,0,0.05), 0 8px 24px -6px rgba(76,45,224,0.10)' }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px -4px rgba(0,0,0,0.10), 0 32px 64px -16px rgba(76,45,224,0.18)'; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 4px -1px rgba(0,0,0,0.05), 0 8px 24px -6px rgba(76,45,224,0.10)'; }}
  >
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
