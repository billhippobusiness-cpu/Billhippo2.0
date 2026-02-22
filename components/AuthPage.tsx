import React, { useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeClosed, ArrowRight } from 'lucide-react';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

type AuthTab = 'business' | 'professional';

interface AuthPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onResetPassword: (email: string) => Promise<void>;
  onCreateProAccount: () => void;
  onLoginSuccess?: (redirectHash: string | null) => void;
  error: string | null;
  initialTab?: AuthTab;
}

const AuthPage: React.FC<AuthPageProps> = ({
  onLogin,
  onSignUp,
  onGoogleLogin,
  onResetPassword,
  onCreateProAccount,
  onLoginSuccess,
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

  // 3D card tilt effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [12, -12]);
  const rotateY = useTransform(mouseX, [-300, 300], [-12, 12]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  const switchTab = (tab: AuthTab) => {
    setActiveTab(tab);
    setEmail('');
    setPassword('');
    setName('');
    setIsSignUp(false);
    setShowPassword(false);
    setResetMessage(null);
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
        style={{ perspective: 1200 }}
      >
        <motion.div
          className="relative"
          style={{ rotateX, rotateY, transformStyle: 'preserve-3d', transition: 'none' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div className="relative group">
            {/* Card glow on hover */}
            <motion.div
              className={`absolute -inset-[1px] rounded-[2rem] opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-700`}
              animate={{
                boxShadow: isPro
                  ? ['0 0 20px 4px rgba(5,150,105,0.06)', '0 0 30px 8px rgba(5,150,105,0.12)', '0 0 20px 4px rgba(5,150,105,0.06)']
                  : ['0 0 20px 4px rgba(76,45,224,0.06)', '0 0 30px 8px rgba(76,45,224,0.12)', '0 0 20px 4px rgba(76,45,224,0.06)'],
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }}
              style={{ transition: 'opacity 0.7s' }}
            />

            {/* Traveling light beams */}
            <div className="absolute -inset-[1px] rounded-[2rem] overflow-hidden pointer-events-none">
              <motion.div
                className={`absolute top-0 left-0 h-[2px] w-[50%] bg-gradient-to-r from-transparent ${isPro ? 'via-emerald-500/60' : 'via-[#4c2de0]/60'} to-transparent`}
                animate={{ left: ['-50%', '100%'] }}
                transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5 }}
                style={{ transition: 'none' }}
              />
              <motion.div
                className={`absolute top-0 right-0 h-[50%] w-[2px] bg-gradient-to-b from-transparent ${isPro ? 'via-emerald-500/60' : 'via-[#4c2de0]/60'} to-transparent`}
                animate={{ top: ['-50%', '100%'] }}
                transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5, delay: 0.75 }}
                style={{ transition: 'none' }}
              />
              <motion.div
                className={`absolute bottom-0 right-0 h-[2px] w-[50%] bg-gradient-to-r from-transparent ${isPro ? 'via-emerald-500/60' : 'via-[#4c2de0]/60'} to-transparent`}
                animate={{ right: ['-50%', '100%'] }}
                transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5, delay: 1.5 }}
                style={{ transition: 'none' }}
              />
              <motion.div
                className={`absolute bottom-0 left-0 h-[50%] w-[2px] bg-gradient-to-b from-transparent ${isPro ? 'via-emerald-500/60' : 'via-[#4c2de0]/60'} to-transparent`}
                animate={{ bottom: ['-50%', '100%'] }}
                transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5, delay: 2.25 }}
                style={{ transition: 'none' }}
              />
            </div>

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
