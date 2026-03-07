
import React from 'react';
import { ShieldCheck, Mail, MapPin } from 'lucide-react';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface PrivacyPolicyPageProps {
  onEnterApp: () => void;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-4">
    <h2 className="text-xl font-bold font-poppins text-slate-900">{title}</h2>
    <div className="text-slate-600 leading-relaxed space-y-3">{children}</div>
  </div>
);

const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onEnterApp }) => {
  return (
    <div className="min-h-screen bg-white font-inter">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <a href="#" className="flex items-center">
            <img src={BILLHIPPO_LOGO} alt="BillHippo" className="h-12 w-auto object-contain" />
          </a>
          <div className="hidden md:flex items-center gap-8">
            <a href="#/about" className="text-sm font-semibold text-slate-600 hover:text-profee-blue transition-colors font-poppins">About</a>
            <a href="#/contact" className="text-sm font-semibold text-slate-600 hover:text-profee-blue transition-colors font-poppins">Contact</a>
            <a href="#/privacy" className="text-sm font-semibold text-profee-blue font-poppins">Privacy</a>
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
      <section className="pt-40 pb-16 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full border border-indigo-100 mb-6">
            <ShieldCheck size={14} className="text-profee-blue" />
            <span className="text-[10px] font-bold text-profee-blue uppercase tracking-widest font-poppins">Your Privacy Matters</span>
          </div>
          <h1 className="text-5xl font-bold font-poppins text-slate-900 leading-tight tracking-tight mb-5">
            Privacy Policy
          </h1>
          <p className="text-slate-500 text-lg leading-relaxed">
            This policy explains how Mehtaji Bizcon LLP collects, uses, and protects your information when you use BillHippo.
          </p>
          <p className="text-sm text-slate-400 mt-4 font-medium">
            Effective Date: 7 March 2026 &nbsp;|&nbsp; Last Updated: 7 March 2026
          </p>
        </div>
      </section>

      {/* Policy Content */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6">
          <div
            className="bg-white rounded-[2rem] border border-slate-100 p-8 md:p-12 space-y-10"
            style={{ boxShadow: '0 2px 4px -1px rgba(0,0,0,0.04), 0 16px 40px -12px rgba(76,45,224,0.08)' }}
          >

            <Section title="1. Introduction">
              <p>
                Mehtaji Bizcon LLP ("we", "our", or "us") operates the BillHippo platform, accessible at billhippo.in. This Privacy Policy describes how we collect, use, disclose, and safeguard your information when you use our services.
              </p>
              <p>
                By using BillHippo, you agree to the collection and use of information in accordance with this policy. If you do not agree, please discontinue use of the platform.
              </p>
            </Section>

            <div className="h-px bg-slate-100" />

            <Section title="2. Information We Collect">
              <p>We collect the following categories of information:</p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li><span className="font-semibold text-slate-700">Account Information:</span> Name, email address, and password (or Google OAuth token) when you register.</li>
                <li><span className="font-semibold text-slate-700">Business Profile:</span> Business name, GSTIN, address, logo, bank details, and business type that you enter during onboarding or in Settings.</li>
                <li><span className="font-semibold text-slate-700">Transaction Data:</span> Invoices, quotations, credit/debit notes, customer records, and ledger entries you create within the app.</li>
                <li><span className="font-semibold text-slate-700">Usage Data:</span> Automatically collected data such as IP address, browser type, device information, pages visited, and actions taken within the platform.</li>
                <li><span className="font-semibold text-slate-700">Communications:</span> Any messages or queries you send us via email or our contact form.</li>
              </ul>
            </Section>

            <div className="h-px bg-slate-100" />

            <Section title="3. How We Use Your Information">
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li>Provide, operate, and maintain the BillHippo platform.</li>
                <li>Generate invoices, reports, and other documents on your behalf.</li>
                <li>Authenticate your identity and protect your account.</li>
                <li>Send transactional communications (e.g., account notifications, security alerts).</li>
                <li>Improve the platform based on usage patterns and feedback.</li>
                <li>Comply with legal and regulatory obligations under Indian law.</li>
              </ul>
              <p>We do not sell your personal data to third parties.</p>
            </Section>

            <div className="h-px bg-slate-100" />

            <Section title="4. Data Storage and Security">
              <p>
                Your data is stored on Google Firebase (Firestore and Firebase Storage), which provides industry-standard encryption at rest and in transit (TLS/HTTPS). Firebase infrastructure is ISO 27001 certified and SOC 2 compliant.
              </p>
              <p>
                While we implement appropriate technical and organisational security measures, no method of electronic storage is 100% secure. We encourage you to use a strong, unique password and enable Google Sign-In where possible.
              </p>
            </Section>

            <div className="h-px bg-slate-100" />

            <Section title="5. Sharing of Information">
              <p>We do not share your personal or business information with third parties except in the following circumstances:</p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li><span className="font-semibold text-slate-700">Service Providers:</span> We use Google Firebase for authentication, database, and file storage. Google's privacy policy governs their handling of data.</li>
                <li><span className="font-semibold text-slate-700">Professional Access:</span> If you invite a CA or accountant through BillHippo Professional, they will be granted access to your business data as authorised by you.</li>
                <li><span className="font-semibold text-slate-700">Legal Requirements:</span> We may disclose information if required to do so by law, court order, or government authority.</li>
              </ul>
            </Section>

            <div className="h-px bg-slate-100" />

            <Section title="6. Cookies and Tracking">
              <p>
                BillHippo uses browser local storage and session storage to maintain your authentication state and application preferences. We do not use third-party advertising cookies or cross-site tracking technologies.
              </p>
              <p>
                Firebase may use cookies for session management and analytics. You can control cookies through your browser settings; however, disabling them may affect platform functionality.
              </p>
            </Section>

            <div className="h-px bg-slate-100" />

            <Section title="7. Data Retention">
              <p>
                We retain your account and business data for as long as your account remains active. If you request deletion of your account, we will delete or anonymise your personal data within 30 days, except where retention is required by law (e.g., GST records which must be retained for 6 years under the GST Act, 2017).
              </p>
            </Section>

            <div className="h-px bg-slate-100" />

            <Section title="8. Your Rights">
              <p>Subject to applicable Indian data protection law, you have the right to:</p>
              <ul className="list-disc list-inside space-y-2 pl-2">
                <li>Access and download a copy of your personal data.</li>
                <li>Correct inaccurate information in your profile.</li>
                <li>Request deletion of your account and associated data.</li>
                <li>Object to processing of your data in certain circumstances.</li>
              </ul>
              <p>
                To exercise any of these rights, please email us at <a href="mailto:info@billhippo.in" className="text-profee-blue font-semibold hover:underline">info@billhippo.in</a>.
              </p>
            </Section>

            <div className="h-px bg-slate-100" />

            <Section title="9. Children's Privacy">
              <p>
                BillHippo is intended for use by businesses and is not directed at children under 18 years of age. We do not knowingly collect personal information from minors. If you believe a minor has provided us with personal information, please contact us immediately.
              </p>
            </Section>

            <div className="h-px bg-slate-100" />

            <Section title="10. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. We will notify you of significant changes by posting a notice within the app or by sending an email to your registered address. The "Last Updated" date at the top of this page will reflect the most recent revision.
              </p>
              <p>
                Continued use of BillHippo after changes are posted constitutes acceptance of the updated policy.
              </p>
            </Section>

            <div className="h-px bg-slate-100" />

            <Section title="11. Contact Us">
              <p>If you have questions, concerns, or requests regarding this Privacy Policy, please reach out to us:</p>
              <div className="mt-4 space-y-4 not-prose">
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-profee-blue flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin size={16} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">Mehtaji Bizcon LLP</p>
                    <p className="text-slate-500 text-sm leading-relaxed mt-0.5">
                      1210, City Center, B/s Heer Party Plot,<br />
                      Science City Road, Sola, Ahmedabad – 380060,<br />
                      Gujarat, India
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-profee-blue flex items-center justify-center flex-shrink-0">
                    <Mail size={16} />
                  </div>
                  <a href="mailto:info@billhippo.in" className="text-profee-blue font-semibold hover:underline">
                    info@billhippo.in
                  </a>
                </div>
              </div>
            </Section>

          </div>
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

export default PrivacyPolicyPage;
