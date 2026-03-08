
import React from 'react';
import { IndianRupee, BarChart3, ArrowRight, Play } from 'lucide-react';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

const BLANK_IMAGES = Array.from({ length: 12 }, (_, i) =>
  `https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Feature%20Blank%20images%2F${i + 1}.png?alt=media`
);

interface LandingPageProps {
  onEnterApp: (tab?: 'business' | 'professional') => void;
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
            <a href="#features" className="text-sm font-semibold text-slate-600 hover:text-profee-blue transition-colors">Features</a>
            <a href="#/about" className="text-sm font-semibold text-slate-600 hover:text-profee-blue transition-colors">About</a>
            <a href="#/contact" className="text-sm font-semibold text-slate-600 hover:text-profee-blue transition-colors">Contact Us</a>
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

      {/* ── Feature Sections ── */}

      {/* Section 1 — Print-Ready Rule 46 Compliant Invoices */}
      <section id="features" className="w-full relative">
        <img src={BLANK_IMAGES[0]} alt="Feature 1" className="w-full h-auto block object-contain" loading="eager" />
        {/* Speech bubble text */}
        <div className="absolute pointer-events-none" style={{ left: '24%', top: '17%', width: '24%' }}>
          <p className="text-slate-700 leading-snug" style={{ fontSize: '1.1vw' }}>
            Every invoice guarantees compliance with Rule 46 of the CGST Rules, complete with QR codes.
          </p>
        </div>
        {/* Heading + bullet list on right */}
        <div className="absolute pointer-events-none" style={{ left: '56%', top: '9%', width: '40%' }}>
          <h2 className="font-bold font-poppins text-slate-900 leading-tight mb-4" style={{ fontSize: '2.2vw' }}>
            Print-Ready Rule 46<br />Compliant Invoices
          </h2>
          <ul className="space-y-2 text-slate-700" style={{ fontSize: '1.1vw' }}>
            <li className="flex items-start gap-2"><span className="mt-1 shrink-0">•</span>Multiple beautifully designed templates to match your brand.</li>
            <li className="flex items-start gap-2"><span className="mt-1 shrink-0">•</span>Support for embedded business logos, signatures, and stamps.</li>
            <li className="flex items-start gap-2"><span className="mt-1 shrink-0">•</span>Automatic Indian formatting for Rupee symbols and amount-in-words.</li>
            <li className="flex items-start gap-2"><span className="mt-1 shrink-0">•</span>Print directly from the browser or download as a high-quality PDF.</li>
          </ul>
        </div>
        {/* Overlay: Start Billing for Free */}
        <button
          onClick={() => onEnterApp('business')}
          aria-label="Start Billing for Free"
          className="absolute cursor-pointer bg-transparent border-0 p-0"
          style={{ left: '4.5%', top: '52%', width: '37%', height: '14%' }}
        />
        {/* Overlay: Join Professional Portal */}
        <button
          onClick={() => onEnterApp('professional')}
          aria-label="Join Professional Portal"
          className="absolute cursor-pointer bg-transparent border-0 p-0"
          style={{ left: '62%', top: '52%', width: '34%', height: '14%' }}
        />
      </section>

      {/* Section 2 — Smart Invoicing Engine */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[1]} alt="Feature 2" className="w-full h-auto block object-contain" loading="lazy" />
        <div className="absolute pointer-events-none" style={{ left: '4%', top: '26%', width: '44%' }}>
          <h2 className="font-bold font-poppins text-slate-900 leading-tight mb-3" style={{ fontSize: '2.8vw' }}>
            Smart Invoicing Engine
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4" style={{ fontSize: '1.2vw' }}>
            Create GST-compliant B2B and B2C invoices instantly. Our system automatically computes the right taxes based on your supply type and applies line-item level HSN/SAC codes.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border-2 border-teal-500 text-teal-600 font-semibold px-3 py-1" style={{ fontSize: '0.95vw' }}>CGST, SGST, IGST Auto-Applied</span>
            <span className="rounded-full border-2 border-orange-400 text-orange-500 font-semibold px-3 py-1" style={{ fontSize: '0.95vw' }}>Regular, Composition, Exempt Support</span>
            <span className="rounded-full border-2 border-slate-400 text-slate-600 font-semibold px-3 py-1" style={{ fontSize: '0.95vw' }}>Draft → Sent → Paid Tracking</span>
          </div>
        </div>
      </section>

      {/* Section 3 — Centralized Party Ledger */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[2]} alt="Feature 3" className="w-full h-auto block object-contain" loading="lazy" />
        <div className="absolute pointer-events-none" style={{ left: '4%', top: '62%', width: '44%' }}>
          <h2 className="font-bold font-poppins text-slate-900 leading-tight mb-3" style={{ fontSize: '3vw' }}>
            Centralized Party Ledger
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4" style={{ fontSize: '1.2vw' }}>
            Maintain a complete database of your customers and suppliers. Instantly track outstanding balances and generate statement of accounts per party.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border-2 border-teal-500 text-teal-600 font-semibold px-3 py-1 flex items-center gap-1" style={{ fontSize: '0.95vw' }}><span className="w-2 h-2 rounded-full bg-teal-500 inline-block"></span>GSTIN &amp; PAN Storage</span>
            <span className="rounded-full border-2 border-teal-500 text-teal-600 font-semibold px-3 py-1 flex items-center gap-1" style={{ fontSize: '0.95vw' }}><span className="w-2 h-2 rounded-full bg-teal-500 inline-block"></span>Auto State &amp; Name Lookup</span>
            <span className="rounded-full border-2 border-orange-400 text-orange-500 font-semibold px-3 py-1 flex items-center gap-1" style={{ fontSize: '0.95vw' }}><span className="w-2 h-2 rounded-full bg-orange-400 inline-block"></span>CSV/Excel Bulk Import</span>
          </div>
        </div>
      </section>

      {/* Section 4 — From Proposal to Payment */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[3]} alt="Feature 4" className="w-full h-auto block object-contain" loading="lazy" />
        <div className="absolute pointer-events-none" style={{ left: '4%', top: '6%', width: '43%' }}>
          <h2 className="font-bold font-poppins leading-tight mb-3" style={{ fontSize: '3vw' }}>
            <span className="text-slate-900">From </span>
            <span style={{ color: '#f97316' }}>Proposal</span>
            <span className="text-slate-900"> to </span>
            <span style={{ color: '#f97316' }}>Payment</span>
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4" style={{ fontSize: '1.2vw' }}>
            Secure new business by sending professional proposals. Once accepted, convert quotations directly into GST-ready invoices with a single click.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full text-white font-semibold px-3 py-1" style={{ fontSize: '0.95vw', backgroundColor: '#f97316' }}>Pipeline Value Tracking</span>
            <span className="rounded-full text-white font-semibold px-3 py-1" style={{ fontSize: '0.95vw', backgroundColor: '#22c55e' }}>1-Click Invoice Conversion</span>
            <span className="rounded-full text-white font-semibold px-3 py-1" style={{ fontSize: '0.95vw', backgroundColor: '#8b5cf6' }}>Real-time Status Updates</span>
          </div>
        </div>
      </section>

      {/* Section 5 — Compliant Credit & Debit Notes */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[4]} alt="Feature 5" className="w-full h-auto block object-contain" loading="lazy" />
        <div className="absolute pointer-events-none text-center" style={{ left: '8%', top: '4%', width: '84%' }}>
          <h2 className="font-bold font-poppins text-indigo-700 leading-tight mb-3" style={{ fontSize: '3.5vw' }}>
            Compliant Credit &amp; Debit Notes
          </h2>
          <p className="text-slate-600 leading-relaxed mx-auto mb-4" style={{ fontSize: '1.2vw', maxWidth: '70%' }}>
            Legally adjust invoice values and output tax liabilities while maintaining strict compliance with Section 34 of the CGST Act, 2017.
          </p>
          <div className="flex justify-center flex-wrap gap-3">
            <span className="rounded-full border border-slate-300 text-slate-700 font-semibold px-4 py-1" style={{ fontSize: '0.95vw' }}>Output Tax Adjustments</span>
            <span className="rounded-full border border-slate-300 text-slate-700 font-semibold px-4 py-1" style={{ fontSize: '0.95vw' }}>Outstanding Balance Sync</span>
            <span className="rounded-full border border-slate-300 text-slate-700 font-semibold px-4 py-1" style={{ fontSize: '0.95vw' }}>Defective Goods &amp; Price Revision Workflows</span>
          </div>
        </div>
      </section>

      {/* Section 6 — Professional Print-Ready PDFs */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[5]} alt="Feature 6" className="w-full h-auto block object-contain" loading="lazy" />
        <div className="absolute pointer-events-none" style={{ left: '57%', top: '15%', width: '40%' }}>
          <h2 className="font-bold font-poppins text-slate-900 leading-tight mb-3" style={{ fontSize: '2.8vw' }}>
            Professional<br />Print-Ready PDFs
          </h2>
          <p className="text-slate-600 leading-relaxed mb-5" style={{ fontSize: '1.2vw' }}>
            Export stunning, Rule 46 compliant tax invoices and account statements. Customize with your business logo, authorized signatures, and stamp support.
          </p>
          <div className="flex flex-col gap-3">
            <span className="rounded-full bg-indigo-700 text-white font-semibold px-4 py-2 text-center" style={{ fontSize: '0.95vw' }}>Rule 46 Compliant Layouts</span>
            <span className="rounded-full bg-indigo-700 text-white font-semibold px-4 py-2 text-center" style={{ fontSize: '0.95vw' }}>e-Invoice QR Code Ready</span>
            <span className="rounded-full bg-indigo-700 text-white font-semibold px-4 py-2 text-center" style={{ fontSize: '0.95vw' }}>Auto Amount-in-Words (Indian Format)</span>
          </div>
        </div>
      </section>

      {/* Section 7 — Intelligent Item Catalogue */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[6]} alt="Feature 7" className="w-full h-auto block object-contain" loading="lazy" />
        <div className="absolute pointer-events-none" style={{ left: '4%', top: '8%', width: '57%' }}>
          <h2 className="font-bold font-poppins text-slate-900 leading-tight mb-3" style={{ fontSize: '3vw' }}>
            Intelligent Item Catalogue
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4" style={{ fontSize: '1.2vw' }}>
            Pre-populate invoice line items instantly. Maintain a comprehensive master list of goods and services to ensure absolute consistency in pricing and tax application.
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-indigo-600 text-white font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>Pre-configured GST Rates (0% to 28%)</span>
            <span className="rounded-full bg-indigo-600 text-white font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>HSN/SAC Code Binding</span>
            <span className="rounded-full bg-indigo-600 text-white font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>Item-wise Sale History</span>
          </div>
        </div>
      </section>

      {/* Section 8 — The GST Filing Center */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[7]} alt="Feature 8" className="w-full h-auto block object-contain" loading="lazy" />
        <div className="absolute pointer-events-none" style={{ left: '4%', top: '35%', width: '36%' }}>
          <h2 className="font-bold font-poppins text-slate-900 leading-tight mb-3" style={{ fontSize: '3vw' }}>
            The GST<br />Filing Center
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4" style={{ fontSize: '1.2vw' }}>
            Eliminate manual reporting errors. BillHippo continuously aggregates your invoicing data into ready-to-file government summaries.
          </p>
          <div className="flex flex-col gap-2">
            <span className="rounded-full bg-indigo-800 text-white font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>GSTR-1 Outward Supplies</span>
            <span className="rounded-full bg-indigo-800 text-white font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>GSTR-3B Data Prep</span>
            <span className="rounded-full bg-indigo-800 text-white font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>Month-wise Due Date Reminders</span>
          </div>
        </div>
      </section>

      {/* Section 9 — Granular Return Data */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[8]} alt="Feature 9" className="w-full h-auto block object-contain" loading="lazy" />
        <div className="absolute pointer-events-none" style={{ left: '4%', top: '5%', width: '55%' }}>
          <h2 className="font-bold font-poppins text-slate-900 leading-tight mb-3" style={{ fontSize: '3vw' }}>
            Granular Return Data
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4" style={{ fontSize: '1.2vw' }}>
            Complete control over your tax exports. Invoices are automatically classified and aggregated rate-wise, complete with document summaries and advance receipts (Table 11).
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-200 text-slate-700 font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>Govt-Prescribed JSON Export</span>
            <span className="rounded-full bg-slate-200 text-slate-700 font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>Auto-Sort: B2B, B2C Large/Small</span>
            <span className="rounded-full bg-slate-200 text-slate-700 font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>Excel Ready for CA Review</span>
          </div>
        </div>
      </section>

      {/* Section 10 — Real-Time Business Analytics */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[9]} alt="Feature 10" className="w-full h-auto block object-contain" loading="lazy" />
        <div className="absolute pointer-events-none" style={{ left: '4%', top: '8%', width: '43%' }}>
          <h2 className="font-bold font-poppins text-slate-900 leading-tight mb-3" style={{ fontSize: '3vw' }}>
            Real-Time<br />Business Analytics
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4" style={{ fontSize: '1.2vw' }}>
            Gain a crystal-clear picture of your financial health. Track total sales, output tax vs. ITC, and monitor top customers by revenue in real-time.
          </p>
          <div className="flex flex-col gap-2">
            <span className="rounded-full bg-indigo-800 text-white font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>MoM &amp; YoY Revenue Trends</span>
            <span className="rounded-full bg-indigo-800 text-white font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>Receivables Ageing (0–90+ days)</span>
            <span className="rounded-full bg-indigo-800 text-white font-semibold px-4 py-2" style={{ fontSize: '0.95vw' }}>GST Liability Tracking</span>
          </div>
        </div>
      </section>

      {/* Section 11 — The Professional CA Portal */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[10]} alt="Feature 11" className="w-full h-auto block object-contain" loading="lazy" />
        <div className="absolute pointer-events-none" style={{ left: '4%', top: '5%', width: '45%' }}>
          <h2 className="font-bold font-poppins text-slate-900 leading-tight mb-3" style={{ fontSize: '3vw' }}>
            The Professional CA Portal
          </h2>
          <p className="text-slate-600 leading-relaxed mb-5" style={{ fontSize: '1.2vw' }}>
            A dedicated multi-client management layer. Tax consultants can seamlessly view, manage, and batch-export GSTR-1 data across all linked client businesses from a single login.
          </p>
          <div className="flex flex-col gap-3">
            <span className="rounded-full bg-white border border-slate-200 text-slate-800 font-semibold px-4 py-2 shadow-sm flex items-center gap-2" style={{ fontSize: '1vw' }}>
              <span className="text-indigo-600">⊞</span> Multi-Client Dashboard
            </span>
            <span className="rounded-full bg-white border border-slate-200 text-slate-800 font-semibold px-4 py-2 shadow-sm flex items-center gap-2" style={{ fontSize: '1vw' }}>
              <span className="text-indigo-600">☰</span> White-Label Client Invoices
            </span>
            <span className="rounded-full bg-white border border-slate-200 text-slate-800 font-semibold px-4 py-2 shadow-sm flex items-center gap-2" style={{ fontSize: '1vw' }}>
              <span className="text-indigo-600">🔔</span> Client-Level Filing Alerts
            </span>
          </div>
        </div>
      </section>

      {/* Section 12 — Transform Your Tax Compliance Today (CTA) */}
      <section className="w-full relative">
        <img src={BLANK_IMAGES[11]} alt="Feature 12" className="w-full h-auto block object-contain" loading="lazy" />
        {/* Logo */}
        <div className="absolute pointer-events-none flex justify-center" style={{ left: '38%', top: '2%', width: '24%' }}>
          <img src={BILLHIPPO_LOGO} alt="BillHippo" className="w-full h-auto object-contain" />
        </div>
        {/* Heading */}
        <div className="absolute pointer-events-none text-center" style={{ left: '5%', top: '17%', width: '90%' }}>
          <h2 className="font-bold font-poppins text-indigo-800 leading-tight" style={{ fontSize: '3.5vw' }}>
            Transform Your Tax Compliance Today
          </h2>
        </div>
        {/* Body */}
        <div className="absolute pointer-events-none text-center" style={{ left: '15%', top: '33%', width: '70%' }}>
          <p className="text-slate-600 leading-relaxed" style={{ fontSize: '1.2vw' }}>
            Self-serve onboarding for businesses, or join our Professional Referral Programme to earn tiered commissions on every active client you bring to BillHippo.
          </p>
        </div>
        {/* Clickable button overlays */}
        <button
          onClick={() => onEnterApp('business')}
          aria-label="Start Billing for Free"
          className="absolute cursor-pointer bg-transparent border-0 p-0"
          style={{ left: '5%', top: '47%', width: '34%', height: '18%' }}
        />
        <button
          onClick={() => onEnterApp('professional')}
          aria-label="Join Professional Portal"
          className="absolute cursor-pointer bg-transparent border-0 p-0"
          style={{ left: '62%', top: '47%', width: '34%', height: '18%' }}
        />
        {/* Bottom tags */}
        <div className="absolute pointer-events-none flex justify-center gap-6" style={{ left: '5%', top: '86%', width: '90%' }}>
          <span className="rounded-full bg-white border border-slate-200 text-slate-600 font-medium px-4 py-1" style={{ fontSize: '0.9vw' }}>Direct SMB Onboarding</span>
          <span className="rounded-full bg-white border border-slate-200 text-slate-600 font-medium px-4 py-1" style={{ fontSize: '0.9vw' }}>Professional Commission Tier</span>
          <span className="rounded-full bg-white border border-slate-200 text-slate-600 font-medium px-4 py-1" style={{ fontSize: '0.9vw' }}>billhippo.com</span>
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

export default LandingPage;
