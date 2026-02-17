import React, { useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeClosed, ArrowRight } from 'lucide-react';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface AuthPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  error: string | null;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLogin, onSignUp, onGoogleLogin, error }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        await onSignUp(email, password, name);
      } else {
        await onLogin(email, password);
      }
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

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] relative overflow-hidden flex items-center justify-center px-4">
      {/* Background – light theme matching landing page */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-[#f8fafc] to-indigo-50/30" />

      {/* Soft indigo glow blobs (landing page style) */}
      <motion.div
        className="absolute top-[-20%] left-1/2 transform -translate-x-1/2 w-[800px] h-[600px] rounded-full bg-[#4c2de0]/[0.06] blur-[120px]"
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 8, repeat: Infinity, repeatType: 'mirror' }}
      />
      <motion.div
        className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#4c2de0]/[0.04] blur-[100px]"
        animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.1, 1] }}
        transition={{ duration: 6, repeat: Infinity, repeatType: 'mirror', delay: 2 }}
      />
      <motion.div
        className="absolute top-[30%] left-[-5%] w-[400px] h-[400px] rounded-full bg-indigo-100/40 blur-[80px]"
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 7, repeat: Infinity, repeatType: 'mirror', delay: 1 }}
      />

      {/* Subtle dot grid pattern */}
      <div className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: 'radial-gradient(circle, #4c2de0 0.5px, transparent 0.5px)',
          backgroundSize: '32px 32px'
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-sm relative z-10"
        style={{ perspective: 1200 }}
      >
        {/*
          IMPORTANT: style={{ transition: 'none' }} overrides the global
          * { transition: all 0.3s } rule so framer-motion can control
          rotateX/rotateY instantly on each mouse move.
          transformStyle: 'preserve-3d' enables the 3D depth effect.
        */}
        <motion.div
          className="relative"
          style={{ rotateX, rotateY, transformStyle: 'preserve-3d', transition: 'none' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <div className="relative group">
            {/* Card glow on hover – indigo tint */}
            <motion.div
              className="absolute -inset-[1px] rounded-[2rem] opacity-0 group-hover:opacity-100"
              animate={{
                boxShadow: [
                  '0 0 20px 4px rgba(76,45,224,0.06)',
                  '0 0 30px 8px rgba(76,45,224,0.12)',
                  '0 0 20px 4px rgba(76,45,224,0.06)'
                ]
              }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }}
              style={{ transition: 'opacity 0.7s' }}
            />

            {/* Traveling light beams – indigo themed */}
            <div className="absolute -inset-[1px] rounded-[2rem] overflow-hidden">
              {/* Top beam */}
              <motion.div
                className="absolute top-0 left-0 h-[2px] w-[50%] bg-gradient-to-r from-transparent via-[#4c2de0]/60 to-transparent"
                animate={{ left: ['-50%', '100%'] }}
                transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5 }}
                style={{ transition: 'none' }}
              />
              {/* Right beam */}
              <motion.div
                className="absolute top-0 right-0 h-[50%] w-[2px] bg-gradient-to-b from-transparent via-[#4c2de0]/60 to-transparent"
                animate={{ top: ['-50%', '100%'] }}
                transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5, delay: 0.75 }}
                style={{ transition: 'none' }}
              />
              {/* Bottom beam */}
              <motion.div
                className="absolute bottom-0 right-0 h-[2px] w-[50%] bg-gradient-to-r from-transparent via-[#4c2de0]/60 to-transparent"
                animate={{ right: ['-50%', '100%'] }}
                transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5, delay: 1.5 }}
                style={{ transition: 'none' }}
              />
              {/* Left beam */}
              <motion.div
                className="absolute bottom-0 left-0 h-[50%] w-[2px] bg-gradient-to-b from-transparent via-[#4c2de0]/60 to-transparent"
                animate={{ bottom: ['-50%', '100%'] }}
                transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity, repeatDelay: 1.5, delay: 2.25 }}
                style={{ transition: 'none' }}
              />

              {/* Corner glow spots – indigo */}
              <motion.div className="absolute top-0 left-0 h-[6px] w-[6px] rounded-full bg-[#4c2de0]/30 blur-[2px]" animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity, repeatType: 'mirror' }} style={{ transition: 'none' }} />
              <motion.div className="absolute top-0 right-0 h-[8px] w-[8px] rounded-full bg-[#4c2de0]/40 blur-[2px]" animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 2.4, repeat: Infinity, repeatType: 'mirror', delay: 0.5 }} style={{ transition: 'none' }} />
              <motion.div className="absolute bottom-0 right-0 h-[8px] w-[8px] rounded-full bg-[#4c2de0]/40 blur-[2px]" animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 2.2, repeat: Infinity, repeatType: 'mirror', delay: 1 }} style={{ transition: 'none' }} />
              <motion.div className="absolute bottom-0 left-0 h-[6px] w-[6px] rounded-full bg-[#4c2de0]/30 blur-[2px]" animate={{ opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2.3, repeat: Infinity, repeatType: 'mirror', delay: 1.5 }} style={{ transition: 'none' }} />
            </div>

            {/* Card border glow */}
            <div className="absolute -inset-[0.5px] rounded-[2rem] bg-gradient-to-r from-[#4c2de0]/10 via-[#4c2de0]/20 to-[#4c2de0]/10 opacity-0 group-hover:opacity-100" style={{ transition: 'opacity 0.5s' }} />

            {/* ═══ Glass Card – Light Theme ═══ */}
            <div className="relative bg-white/70 backdrop-blur-2xl rounded-[2rem] p-8 border border-slate-200/60 shadow-2xl shadow-indigo-100/40 overflow-hidden">
              {/* Subtle inner grid pattern */}
              <div className="absolute inset-0 opacity-[0.02]"
                style={{
                  backgroundImage: `linear-gradient(135deg, #4c2de0 0.5px, transparent 0.5px), linear-gradient(45deg, #4c2de0 0.5px, transparent 0.5px)`,
                  backgroundSize: '24px 24px'
                }}
              />

              {/* Logo & Header */}
              <div className="text-center space-y-2 mb-6">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', duration: 0.8 }}
                  className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center relative overflow-hidden"
                  style={{ transition: 'none' }}
                >
                  <img src={BILLHIPPO_LOGO} alt="BillHippo" className="w-10 h-10 object-contain" />
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-2xl font-bold text-slate-900 font-poppins"
                  style={{ transition: 'none' }}
                >
                  {isSignUp ? 'Create Account' : 'Welcome Back'}
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-slate-400 text-xs font-poppins"
                  style={{ transition: 'none' }}
                >
                  {isSignUp ? 'Start managing your business today' : 'Sign in to your BillHippo dashboard'}
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

              {/* Form */}
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
                        <div className="relative">
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
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Email */}
                  <div className="relative">
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
                  </div>

                  {/* Password */}
                  <div className="relative">
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
                        {showPassword ? (
                          <Eye className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.3s' }} />
                        ) : (
                          <EyeClosed className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.3s' }} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sign In button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full relative group/button mt-2"
                  style={{ transition: 'none' }}
                >
                  <div className="absolute inset-0 bg-[#4c2de0]/20 rounded-2xl blur-xl opacity-0 group-hover/button:opacity-100" style={{ transition: 'opacity 0.3s' }} />
                  <div className="relative overflow-hidden bg-[#4c2de0] text-white font-bold h-12 rounded-2xl flex items-center justify-center font-poppins shadow-lg shadow-indigo-200">
                    <AnimatePresence mode="wait">
                      {loading ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center" style={{ transition: 'none' }}>
                          <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        </motion.div>
                      ) : (
                        <motion.span key="btn-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 text-sm font-bold" style={{ transition: 'none' }}>
                          {isSignUp ? 'Create Account' : 'Sign In'}
                          <ArrowRight className="w-4 h-4 group-hover/button:translate-x-1" style={{ transition: 'transform 0.3s' }} />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.button>

                {/* Divider */}
                <div className="relative mt-3 mb-3 flex items-center">
                  <div className="flex-grow border-t border-slate-100"></div>
                  <span className="mx-3 text-[10px] text-slate-300 font-bold uppercase tracking-widest font-poppins">or</span>
                  <div className="flex-grow border-t border-slate-100"></div>
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
                <motion.p
                  className="text-center text-xs text-slate-400 mt-5 font-poppins"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  style={{ transition: 'none' }}
                >
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button
                    type="button"
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-[#4c2de0] font-bold hover:underline"
                  >
                    {isSignUp ? 'Sign In' : 'Sign Up Free'}
                  </button>
                </motion.p>
              </form>
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
