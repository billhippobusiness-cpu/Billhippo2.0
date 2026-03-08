import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeClosed, ArrowRight, ChevronLeft, Phone, MessageCircle } from 'lucide-react';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

type AuthTab = 'business' | 'professional';

interface AuthPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onSendWhatsAppOtp: (phoneNumber: string) => Promise<void>;
  onVerifyWhatsAppOtp: (phoneNumber: string, otp: string) => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  onCreateProAccount: () => void;
  onLoginSuccess?: (redirectHash: string | null) => void;
  onBackToHome?: () => void;
  error: string | null;
  initialTab?: AuthTab;
}

const AuthPage: React.FC<AuthPageProps> = ({
  onLogin,
  onSignUp,
  onGoogleLogin,
  onSendWhatsAppOtp,
  onVerifyWhatsAppOtp,
  onResetPassword,
  onCreateProAccount,
  onLoginSuccess,
  onBackToHome,
  error,
  initialTab,
}) => {
  // Read pending redirect from sessionStorage (set by InviteAccept → onGoToSignIn)
  const pendingRedirect = sessionStorage.getItem('authRedirectHash') ?? null;

  const [activeTab, setActiveTab] = useState<AuthTab>(
    initialTab ?? (pendingRedirect ? 'professional' : 'business'),
  );
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  // WhatsApp OTP state
  const [whatsappStep, setWhatsappStep] = useState<'idle' | 'phone' | 'otp'>('idle');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setEmail('');
    setPassword('');
    setName('');
    setIsSignUp(false);
    setShowPassword(false);
    setResetMessage(null);
    // Reset WhatsApp OTP flow
    setWhatsappStep('idle');
    setPhone('');
    setOtp('');
    setOtpCooldown(0);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  };

  const finishLogin = () => {
    if (onLoginSuccess) {
      const redirect = sessionStorage.getItem('authRedirectHash');
      sessionStorage.removeItem('authRedirectHash');
      onLoginSuccess(redirect);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResetMessage(null);
    try {
      if (isSignUp) {
        await onSignUp(email, password, name);
      } else {
        await onLogin(email, password);
        finishLogin();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResetMessage(null);
    try {
      await onLogin(email, password);
      finishLogin();
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await onGoogleLogin();
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setResetMessage('Enter your email above, then click "Forgot password?"');
      return;
    }
    setResetLoading(true);
    setResetMessage(null);
    try {
      await onResetPassword(email.trim());
      setResetMessage(`Password reset email sent to ${email}`);
    } catch {
      setResetMessage('Failed to send reset email. Check the address and try again.');
    } finally {
      setResetLoading(false);
    }
  };

  // WhatsApp OTP helpers
  const startCooldown = (seconds = 30) => {
    setOtpCooldown(seconds);
    cooldownRef.current = setInterval(() => {
      setOtpCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Normalise to E.164 (+91 prefix for 10-digit Indian numbers)
  const normalisePhone = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.length === 10) return `+91${digits}`;
    if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
    return raw.trim().startsWith('+') ? raw.trim() : `+${digits}`;
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSendWhatsAppOtp(normalisePhone(phone));
      setWhatsappStep('otp');
      startCooldown(30);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onVerifyWhatsAppOtp(normalisePhone(phone), otp.trim());
      finishLogin();
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (otpCooldown > 0) return;
    setLoading(true);
    try {
      await onSendWhatsAppOtp(normalisePhone(phone));
      startCooldown(30);
    } finally {
      setLoading(false);
    }
  };

  const resetWhatsappFlow = () => {
    setWhatsappStep('idle');
    setPhone('');
    setOtp('');
    setOtpCooldown(0);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  };

  const isPro = activeTab === 'professional';

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] relative overflow-hidden flex items-center justify-center px-4">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-[#f8fafc] to-indigo-50/30" />

      {/* Glow blobs – color shifts per tab */}
      <motion.div
        className={`absolute top-[-20%] left-1/2 transform -translate-x-1/2 w-[800px] h-[600px] rounded-full blur-[120px] transition-all duration-700 ${isPro ? 'bg-emerald-500/[0.06]' : 'bg-[#4c2de0]/[0.06]'}`}
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 8, repeat: Infinity, repeatType: 'mirror' }}
      />
      <motion.div
        className={`absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full blur-[100px] transition-all duration-700 ${isPro ? 'bg-emerald-500/[0.04]' : 'bg-[#4c2de0]/[0.04]'}`}
        animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.1, 1] }}
        transition={{ duration: 6, repeat: Infinity, repeatType: 'mirror', delay: 2 }}
      />

      {/* Dot grid */}
      <div
        className="absolute inset-0 opacity-[0.4] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, ${isPro ? '#059669' : '#4c2de0'} 0.5px, transparent 0.5px)`,
          backgroundSize: '32px 32px',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-sm relative z-10"
      >
        <motion.div
          className="relative"
          whileHover={{ y: -6, scale: 1.01 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <div className="relative group">
            {/* Card glow on hover */}
            <div
              className="absolute -inset-[2px] rounded-[2rem] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-400"
              style={{
                boxShadow: isPro
                  ? '0 0 60px 18px rgba(5,150,105,0.28), 0 0 120px 40px rgba(5,150,105,0.10)'
                  : '0 0 60px 18px rgba(76,45,224,0.28), 0 0 120px 40px rgba(76,45,224,0.10)',
              }}
            />

            {/* ═══ Glass Card ═══ */}
            <div className="relative bg-white/70 backdrop-blur-2xl rounded-[2rem] border border-slate-200/60 shadow-2xl shadow-indigo-100/40 overflow-hidden">

              {/* ── Tab Switcher ── */}
              <div className="flex rounded-t-[2rem] overflow-hidden">
                {(['business', 'professional'] as AuthTab[]).map((tab) => {
                  const isActive = activeTab === tab;
                  const label = tab === 'business' ? 'BillHippo Business' : 'BillHippo Professional';
                  const accentColor = tab === 'business' ? 'bg-[#4c2de0]' : 'bg-emerald-600';
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => switchTab(tab)}
                      className={`flex-1 py-3.5 text-xs font-bold font-poppins tracking-wide relative transition-all duration-200 focus:outline-none
                        ${isActive
                          ? `${accentColor} text-white`
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                    >
                      {label}
                      {/* Accent line at bottom of active tab */}
                      {isActive && (
                        <span
                          className={`absolute bottom-0 left-0 right-0 h-[3px] ${tab === 'business' ? 'bg-indigo-300' : 'bg-emerald-300'}`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* ── Card Body ── */}
              <div className="p-8">
                {/* Subtle inner grid */}
                <div
                  className="absolute inset-0 opacity-[0.02] pointer-events-none"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${isPro ? '#059669' : '#4c2de0'} 0.5px, transparent 0.5px), linear-gradient(45deg, ${isPro ? '#059669' : '#4c2de0'} 0.5px, transparent 0.5px)`,
                    backgroundSize: '24px 24px',
                  }}
                />

                {/* Logo */}
                <div className="text-center space-y-2 mb-6">
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', duration: 0.8 }}
                    className="mx-auto flex items-center justify-center relative"
                    style={{ transition: 'none' }}
                  >
                    <img src={BILLHIPPO_LOGO} alt="BillHippo" className="h-40 w-auto object-contain" />
                  </motion.div>

                  <motion.h1
                    key={activeTab + '-heading'}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-xl font-bold text-slate-900 font-poppins"
                    style={{ transition: 'none' }}
                  >
                    {isPro ? 'Pro Portal Sign In' : (isSignUp ? 'Create Account' : 'Welcome Back')}
                  </motion.h1>

                  <motion.p
                    key={activeTab + '-sub'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: 0.05 }}
                    className="text-slate-400 text-xs font-poppins"
                    style={{ transition: 'none' }}
                  >
                    {isPro
                      ? 'GST data access for your clients'
                      : (isSignUp ? 'Start managing your business today' : 'Sign in to your BillHippo dashboard')}
                  </motion.p>
                </div>

                {/* Error message */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-2xl text-xs text-rose-600 font-medium text-center font-poppins"
                    style={{ transition: 'none' }}
                  >
                    {error}
                  </motion.div>
                )}

                {/* Reset password message */}
                {resetMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-4 p-3 rounded-2xl text-xs font-medium text-center font-poppins ${
                      resetMessage.startsWith('Password reset email sent')
                        ? 'bg-emerald-50 border border-emerald-100 text-emerald-600'
                        : 'bg-amber-50 border border-amber-100 text-amber-600'
                    }`}
                    style={{ transition: 'none' }}
                  >
                    {resetMessage}
                  </motion.div>
                )}

                {/* ── TAB CONTENT ── */}
                <AnimatePresence mode="wait">
                  {activeTab === 'business' ? (
                    <motion.div
                      key="business-form"
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.2 }}
                      style={{ transition: 'none' }}
                    >
                      {/* ── WHATSAPP OTP FLOW (overlays the email form) ── */}
                      <AnimatePresence mode="wait">
                        {whatsappStep === 'phone' && (
                          <motion.div
                            key="wa-phone"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.2 }}
                            style={{ transition: 'none' }}
                          >
                            <form onSubmit={handleSendOtp} className="space-y-4">
                              <div className="text-center mb-2">
                                <div className="flex items-center justify-center gap-2 text-[#25D366]">
                                  <MessageCircle className="w-5 h-5" />
                                  <span className="text-sm font-bold font-poppins">Sign in with WhatsApp</span>
                                </div>
                                <p className="text-xs text-slate-400 font-poppins mt-1">Enter your mobile number to receive an OTP</p>
                              </div>
                              <div className="relative flex items-center rounded-2xl">
                                <Phone className={`absolute left-4 w-4 h-4 ${focusedInput === 'wa-phone' ? 'text-[#25D366]' : 'text-slate-300'}`} style={{ transition: 'color 0.3s' }} />
                                <span className="absolute left-11 text-sm text-slate-400 font-poppins font-medium">+91</span>
                                <input
                                  type="tel"
                                  placeholder="10-digit mobile number"
                                  value={phone}
                                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                                  onFocus={() => setFocusedInput('wa-phone')}
                                  onBlur={() => setFocusedInput(null)}
                                  required
                                  pattern="\d{10}"
                                  className="w-full bg-slate-50 border border-slate-100 focus:border-[#25D366]/40 text-slate-800 placeholder:text-slate-300 h-12 rounded-2xl pl-20 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#25D366]/10 font-poppins font-medium"
                                />
                              </div>
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                type="submit"
                                disabled={loading || phone.length !== 10}
                                className="w-full relative group/button disabled:opacity-50"
                                style={{ transition: 'none' }}
                              >
                                <div className="relative overflow-hidden bg-[#25D366] text-white font-bold h-12 rounded-2xl flex items-center justify-center gap-2 font-poppins shadow-lg shadow-green-100">
                                  {loading
                                    ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    : <><MessageCircle className="w-4 h-4" /><span className="text-sm">Send OTP via WhatsApp</span></>
                                  }
                                </div>
                              </motion.button>
                              <p className="text-center text-xs text-slate-400 font-poppins">
                                <button type="button" onClick={resetWhatsappFlow} className="text-[#4c2de0] font-bold hover:underline">
                                  ← Back to Email Sign In
                                </button>
                              </p>
                            </form>
                          </motion.div>
                        )}

                        {whatsappStep === 'otp' && (
                          <motion.div
                            key="wa-otp"
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.2 }}
                            style={{ transition: 'none' }}
                          >
                            <form onSubmit={handleVerifyOtp} className="space-y-4">
                              <div className="text-center mb-2">
                                <div className="flex items-center justify-center gap-2 text-[#25D366]">
                                  <MessageCircle className="w-5 h-5" />
                                  <span className="text-sm font-bold font-poppins">Enter OTP</span>
                                </div>
                                <p className="text-xs text-slate-400 font-poppins mt-1">
                                  Sent to <span className="font-bold text-slate-600">+91 {phone}</span> on WhatsApp
                                </p>
                              </div>
                              <div className="relative flex items-center rounded-2xl">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  placeholder="6-digit OTP"
                                  value={otp}
                                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                  onFocus={() => setFocusedInput('wa-otp')}
                                  onBlur={() => setFocusedInput(null)}
                                  required
                                  pattern="\d{6}"
                                  autoComplete="one-time-code"
                                  className="w-full bg-slate-50 border border-slate-100 focus:border-[#25D366]/40 text-slate-800 placeholder:text-slate-300 h-12 rounded-2xl px-4 text-center text-xl tracking-[0.4em] outline-none focus:ring-2 focus:ring-[#25D366]/10 font-poppins font-bold"
                                />
                              </div>
                              <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                type="submit"
                                disabled={loading || otp.length !== 6}
                                className="w-full relative group/button disabled:opacity-50"
                                style={{ transition: 'none' }}
                              >
                                <div className="relative overflow-hidden bg-[#25D366] text-white font-bold h-12 rounded-2xl flex items-center justify-center gap-2 font-poppins shadow-lg shadow-green-100">
                                  {loading
                                    ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                    : <><span className="text-sm">Verify & Sign In</span><ArrowRight className="w-4 h-4" /></>
                                  }
                                </div>
                              </motion.button>
                              <div className="flex items-center justify-between">
                                <button type="button" onClick={resetWhatsappFlow} className="text-xs text-slate-400 hover:text-[#4c2de0] font-poppins font-medium" style={{ transition: 'color 0.2s' }}>
                                  ← Change number
                                </button>
                                <button
                                  type="button"
                                  onClick={handleResendOtp}
                                  disabled={otpCooldown > 0 || loading}
                                  className="text-xs text-slate-400 hover:text-[#25D366] font-poppins font-medium disabled:opacity-50"
                                  style={{ transition: 'color 0.2s' }}
                                >
                                  {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend OTP'}
                                </button>
                              </div>
                            </form>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* ── BUSINESS FORM (hidden when WhatsApp flow is active) ── */}
                      <div className={whatsappStep !== 'idle' ? 'hidden' : ''}>
                      {/* ── BUSINESS FORM ── */}
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-3">
                          {/* Business Name (sign up only) */}
                          <AnimatePresence>
                            {isSignUp && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3 }}
                                className="overflow-hidden"
                                style={{ transition: 'none' }}
                              >
                                <div className="relative flex items-center rounded-2xl">
                                  <User className={`absolute left-4 w-4 h-4 ${focusedInput === 'name' ? 'text-[#4c2de0]' : 'text-slate-300'}`} style={{ transition: 'color 0.3s' }} />
                                  <input
                                    type="text"
                                    placeholder="Business Name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    onFocus={() => setFocusedInput('name')}
                                    onBlur={() => setFocusedInput(null)}
                                    required={isSignUp}
                                    className="w-full bg-slate-50 border border-slate-100 focus:border-[#4c2de0]/30 text-slate-800 placeholder:text-slate-300 h-12 rounded-2xl pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#4c2de0]/10 font-poppins font-medium"
                                  />
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Email */}
                          <div className="relative flex items-center rounded-2xl">
                            <Mail className={`absolute left-4 w-4 h-4 ${focusedInput === 'email' ? 'text-[#4c2de0]' : 'text-slate-300'}`} style={{ transition: 'color 0.3s' }} />
                            <input
                              type="email"
                              placeholder="Email address"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              onFocus={() => setFocusedInput('email')}
                              onBlur={() => setFocusedInput(null)}
                              required
                              className="w-full bg-slate-50 border border-slate-100 focus:border-[#4c2de0]/30 text-slate-800 placeholder:text-slate-300 h-12 rounded-2xl pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#4c2de0]/10 font-poppins font-medium"
                            />
                          </div>

                          {/* Password */}
                          <div className="relative flex items-center rounded-2xl">
                            <Lock className={`absolute left-4 w-4 h-4 ${focusedInput === 'password' ? 'text-[#4c2de0]' : 'text-slate-300'}`} style={{ transition: 'color 0.3s' }} />
                            <input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              onFocus={() => setFocusedInput('password')}
                              onBlur={() => setFocusedInput(null)}
                              required
                              minLength={6}
                              className="w-full bg-slate-50 border border-slate-100 focus:border-[#4c2de0]/30 text-slate-800 placeholder:text-slate-300 h-12 rounded-2xl pl-11 pr-11 text-sm outline-none focus:ring-2 focus:ring-[#4c2de0]/10 font-poppins font-medium"
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4">
                              {showPassword
                                ? <Eye className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.3s' }} />
                                : <EyeClosed className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.3s' }} />}
                            </button>
                          </div>
                        </div>

                        {/* Forgot password */}
                        {!isSignUp && (
                          <div className="flex justify-end -mt-1">
                            <button
                              type="button"
                              onClick={handleForgotPassword}
                              disabled={resetLoading}
                              className="text-[10px] text-slate-400 hover:text-[#4c2de0] font-poppins font-medium disabled:opacity-50"
                              style={{ transition: 'color 0.2s' }}
                            >
                              {resetLoading ? 'Sending…' : 'Forgot password?'}
                            </button>
                          </div>
                        )}

                        {/* Sign In / Create Account button */}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="submit"
                          disabled={loading}
                          className="w-full relative group/button mt-1"
                          style={{ transition: 'none' }}
                        >
                          <div className="absolute inset-0 bg-[#4c2de0]/20 rounded-2xl blur-xl opacity-0 group-hover/button:opacity-100" style={{ transition: 'opacity 0.3s' }} />
                          <div className="relative overflow-hidden bg-[#4c2de0] text-white font-bold h-12 rounded-2xl flex items-center justify-center font-poppins shadow-lg shadow-indigo-200">
                            <AnimatePresence mode="wait">
                              {loading ? (
                                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ transition: 'none' }}>
                                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                </motion.div>
                              ) : (
                                <motion.span key="btn-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-sm font-bold" style={{ transition: 'none' }}>
                                  {isSignUp ? 'Create Account' : 'Sign In'}
                                  <ArrowRight className="w-4 h-4 group-hover/button:translate-x-1" style={{ transition: 'transform 0.3s' }} />
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.button>

                        {/* Divider */}
                        <div className="relative flex items-center mt-1">
                          <div className="flex-grow border-t border-slate-100" />
                          <span className="mx-3 text-[10px] text-slate-300 font-bold uppercase tracking-widest font-poppins">or</span>
                          <div className="flex-grow border-t border-slate-100" />
                        </div>

                        {/* Google Sign In */}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          onClick={handleGoogle}
                          disabled={loading}
                          className="w-full relative group/google disabled:opacity-50"
                          style={{ transition: 'none' }}
                        >
                          <div className="relative overflow-hidden bg-white text-slate-700 font-bold h-12 rounded-2xl border border-slate-200 hover:border-slate-300 flex items-center justify-center gap-3 font-poppins hover:shadow-lg hover:shadow-slate-100" style={{ transition: 'border-color 0.3s, box-shadow 0.3s' }}>
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            <span className="text-sm">Continue with Google</span>
                          </div>
                        </motion.button>

                        {/* Divider */}
                        <div className="relative flex items-center">
                          <div className="flex-grow border-t border-slate-100" />
                          <span className="mx-3 text-[10px] text-slate-300 font-bold uppercase tracking-widest font-poppins">or</span>
                          <div className="flex-grow border-t border-slate-100" />
                        </div>

                        {/* WhatsApp Sign In */}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          onClick={() => setWhatsappStep('phone')}
                          disabled={loading}
                          className="w-full relative group/whatsapp disabled:opacity-50"
                          style={{ transition: 'none' }}
                        >
                          <div className="relative overflow-hidden bg-white text-slate-700 font-bold h-12 rounded-2xl border border-slate-200 hover:border-[#25D366]/40 flex items-center justify-center gap-3 font-poppins hover:shadow-lg hover:shadow-green-50" style={{ transition: 'border-color 0.3s, box-shadow 0.3s' }}>
                            {/* WhatsApp logo SVG */}
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" fill="#25D366"/>
                            </svg>
                            <span className="text-sm">Continue with WhatsApp</span>
                          </div>
                        </motion.button>

                        {/* Toggle Sign In / Sign Up */}
                        <p className="text-center text-xs text-slate-400 mt-3 font-poppins">
                          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                          <button
                            type="button"
                            onClick={() => { setIsSignUp(!isSignUp); setResetMessage(null); }}
                            className="text-[#4c2de0] font-bold hover:underline"
                          >
                            {isSignUp ? 'Sign In' : 'Sign Up Free'}
                          </button>
                        </p>
                      </form>
                      </div>{/* end whatsapp-idle wrapper */}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="professional-form"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12 }}
                      transition={{ duration: 0.2 }}
                      style={{ transition: 'none' }}
                    >
                      {/* ── PROFESSIONAL FORM ── */}
                      <form onSubmit={handleProSignIn} className="space-y-4">
                        <div className="space-y-3">
                          {/* Professional Email */}
                          <div className="relative flex items-center rounded-2xl">
                            <Mail className={`absolute left-4 w-4 h-4 ${focusedInput === 'pro-email' ? 'text-emerald-600' : 'text-slate-300'}`} style={{ transition: 'color 0.3s' }} />
                            <input
                              type="email"
                              placeholder="Professional Email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              onFocus={() => setFocusedInput('pro-email')}
                              onBlur={() => setFocusedInput(null)}
                              required
                              className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500/40 text-slate-800 placeholder:text-slate-300 h-12 rounded-2xl pl-11 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500/10 font-poppins font-medium"
                            />
                          </div>

                          {/* Password */}
                          <div className="relative flex items-center rounded-2xl">
                            <Lock className={`absolute left-4 w-4 h-4 ${focusedInput === 'pro-password' ? 'text-emerald-600' : 'text-slate-300'}`} style={{ transition: 'color 0.3s' }} />
                            <input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              onFocus={() => setFocusedInput('pro-password')}
                              onBlur={() => setFocusedInput(null)}
                              required
                              minLength={6}
                              className="w-full bg-slate-50 border border-slate-100 focus:border-emerald-500/40 text-slate-800 placeholder:text-slate-300 h-12 rounded-2xl pl-11 pr-11 text-sm outline-none focus:ring-2 focus:ring-emerald-500/10 font-poppins font-medium"
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4">
                              {showPassword
                                ? <Eye className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.3s' }} />
                                : <EyeClosed className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.3s' }} />}
                            </button>
                          </div>
                        </div>

                        {/* Forgot password */}
                        <div className="flex justify-end -mt-1">
                          <button
                            type="button"
                            onClick={handleForgotPassword}
                            disabled={resetLoading}
                            className="text-[10px] text-slate-400 hover:text-emerald-600 font-poppins font-medium disabled:opacity-50"
                            style={{ transition: 'color 0.2s' }}
                          >
                            {resetLoading ? 'Sending…' : 'Forgot password?'}
                          </button>
                        </div>

                        {/* Sign In to Pro Portal button */}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="submit"
                          disabled={loading}
                          className="w-full relative group/button mt-1"
                          style={{ transition: 'none' }}
                        >
                          <div className="absolute inset-0 bg-emerald-600/20 rounded-2xl blur-xl opacity-0 group-hover/button:opacity-100" style={{ transition: 'opacity 0.3s' }} />
                          <div className="relative overflow-hidden bg-emerald-600 text-white font-bold h-12 rounded-2xl flex items-center justify-center font-poppins shadow-lg shadow-emerald-100">
                            <AnimatePresence mode="wait">
                              {loading ? (
                                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ transition: 'none' }}>
                                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                </motion.div>
                              ) : (
                                <motion.span key="btn-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-sm font-bold" style={{ transition: 'none' }}>
                                  Sign In to Pro Portal
                                  <ArrowRight className="w-4 h-4 group-hover/button:translate-x-1" style={{ transition: 'transform 0.3s' }} />
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                        </motion.button>

                        {/* Divider – New to Professional */}
                        <div className="relative flex items-center mt-2">
                          <div className="flex-grow border-t border-slate-100" />
                          <span className="mx-3 text-[10px] text-slate-400 font-poppins whitespace-nowrap">New to BillHippo Professional?</span>
                          <div className="flex-grow border-t border-slate-100" />
                        </div>

                        {/* Create Professional Account */}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          onClick={onCreateProAccount}
                          disabled={loading}
                          className="w-full h-12 rounded-2xl border-2 border-emerald-600 text-emerald-600 text-sm font-bold font-poppins hover:bg-emerald-50 disabled:opacity-50"
                          style={{ transition: 'background-color 0.2s' }}
                        >
                          Create Professional Account
                        </motion.button>

                        {/* Small disclaimer */}
                        <p className="text-center text-[10px] text-slate-400 font-poppins leading-relaxed">
                          Professional access is free. Read-only GST data access for your clients.
                        </p>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Back to Home */}
      {onBackToHome && (
        <div className="relative z-10 mt-5 text-center">
          <button
            onClick={onBackToHome}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 font-poppins font-medium transition-colors duration-200"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Back to Home
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
        <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest font-poppins">
          Secured by Firebase &bull; Made for Indian Businesses
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
