
import React, { useState } from 'react';
import { ArrowRight, MapPin, Mail, Clock, Send } from 'lucide-react';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface ContactPageProps {
  onEnterApp: () => void;
}

const ContactPage: React.FC<ContactPageProps> = ({ onEnterApp }) => {
  const [formState, setFormState] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormState((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Opens the user's mail client pre-filled with the form data
    const subject = encodeURIComponent(formState.subject || 'BillHippo Enquiry');
    const body = encodeURIComponent(
      `Name: ${formState.name}\nEmail: ${formState.email}\n\n${formState.message}`
    );
    window.location.href = `mailto:info@billhippo.in?subject=${subject}&body=${body}`;
    setSubmitted(true);
  };

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
            <a href="#/contact" className="text-sm font-semibold text-profee-blue font-poppins">Contact</a>
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
      <section className="pt-40 pb-16 bg-gradient-to-b from-indigo-50/60 to-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 rounded-full border border-indigo-100 mb-6">
            <Mail size={14} className="text-profee-blue" />
            <span className="text-[10px] font-bold text-profee-blue uppercase tracking-widest font-poppins">We're here to help</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold font-poppins text-slate-900 leading-tight tracking-tight mb-5">
            Get in Touch
          </h1>
          <p className="text-xl text-slate-500 leading-relaxed">
            Have a question, a suggestion, or need support? Reach out to us — we respond within 24 business hours.
          </p>
        </div>
      </section>

      {/* Contact Info + Form */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-14 items-start">

          {/* Contact Details */}
          <div className="space-y-8">
            <h2 className="text-3xl font-bold font-poppins text-slate-900">Contact Information</h2>
            <p className="text-slate-500 leading-relaxed">
              We are a small, dedicated team based in Ahmedabad. Whether you need help with a feature or want to explore a partnership, we'd love to hear from you.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-profee-blue flex items-center justify-center flex-shrink-0">
                  <MapPin size={22} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-poppins mb-1">Address</p>
                  <p className="text-slate-700 leading-relaxed">
                    1210, City Center,<br />
                    B/s Heer Party Plot,<br />
                    Science City Road, Sola,<br />
                    Ahmedabad – 380060,<br />
                    Gujarat, India
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-profee-blue flex items-center justify-center flex-shrink-0">
                  <Mail size={22} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-poppins mb-1">Email</p>
                  <a href="mailto:info@billhippo.in" className="text-profee-blue font-semibold text-lg hover:underline">
                    info@billhippo.in
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-profee-blue flex items-center justify-center flex-shrink-0">
                  <Clock size={22} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest font-poppins mb-1">Response Time</p>
                  <p className="text-slate-700 font-semibold">Within 24 business hours</p>
                  <p className="text-slate-400 text-sm mt-0.5">Monday – Saturday, 10am – 6pm IST</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div
            className="bg-white rounded-[2rem] border border-slate-100 p-8 md:p-10"
            style={{ boxShadow: '0 2px 4px -1px rgba(0,0,0,0.05), 0 16px 40px -12px rgba(76,45,224,0.10)' }}
          >
            {submitted ? (
              <div className="text-center py-10 space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mx-auto">
                  <Send size={28} />
                </div>
                <h3 className="text-xl font-bold font-poppins text-slate-900">Message Sent!</h3>
                <p className="text-slate-500">Your email client should have opened. We'll get back to you soon.</p>
                <button
                  onClick={() => setSubmitted(false)}
                  className="mt-4 text-sm font-semibold text-profee-blue hover:underline font-poppins"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <h3 className="text-xl font-bold font-poppins text-slate-900 mb-2">Send us a message</h3>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-poppins mb-1.5">Your Name</label>
                  <input
                    type="text"
                    name="name"
                    required
                    value={formState.name}
                    onChange={handleChange}
                    placeholder="Rajesh Sharma"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-profee-blue/30 focus:border-profee-blue transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-poppins mb-1.5">Your Email</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formState.email}
                    onChange={handleChange}
                    placeholder="rajesh@example.com"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-profee-blue/30 focus:border-profee-blue transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-poppins mb-1.5">Subject</label>
                  <select
                    name="subject"
                    value={formState.subject}
                    onChange={handleChange}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-profee-blue/30 focus:border-profee-blue transition-all bg-white"
                  >
                    <option value="">Select a subject</option>
                    <option value="General Enquiry">General Enquiry</option>
                    <option value="Technical Support">Technical Support</option>
                    <option value="Billing / Account">Billing / Account</option>
                    <option value="Partnership">Partnership</option>
                    <option value="Feedback">Feedback</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-poppins mb-1.5">Message</label>
                  <textarea
                    name="message"
                    required
                    value={formState.message}
                    onChange={handleChange}
                    rows={5}
                    placeholder="Tell us how we can help you..."
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-profee-blue/30 focus:border-profee-blue transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-4 bg-profee-blue text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:scale-[1.01] active:scale-95 transition-all font-poppins"
                >
                  Send Message <ArrowRight size={16} />
                </button>
                <p className="text-xs text-slate-400 text-center">This will open your default email client.</p>
              </form>
            )}
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

export default ContactPage;
