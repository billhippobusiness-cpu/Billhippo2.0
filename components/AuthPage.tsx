import React, { useState } from 'react';
import { Mail, Lock, User, ArrowRight, Chrome } from 'lucide-react';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface AuthPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string, name: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  error: string | null;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLogin, onSignUp, onGoogleLogin, error }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-10">
          <img src={BILLHIPPO_LOGO} alt="BillHippo" className="w-12 h-12 rounded-2xl object-contain" />
          <span className="text-3xl font-bold font-poppins tracking-tight text-slate-800">BillHippo</span>
        </div>

        {/* Card */}
        <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl border border-slate-50">
          <h2 className="text-2xl font-bold font-poppins text-slate-900 text-center mb-2">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-sm text-slate-400 text-center mb-8 font-poppins">
            {isSignUp ? 'Start managing your business today' : 'Sign in to your BillHippo dashboard'}
          </p>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-2xl text-sm text-rose-600 font-medium text-center">
              {error}
            </div>
          )}

          {/* Google Sign In */}
          <button
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-4 px-6 rounded-2xl border border-slate-200 bg-white text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all mb-6 font-poppins disabled:opacity-50"
          >
            <Chrome size={20} />
            Continue with Google
          </button>

          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-slate-100"></div>
            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">or use email</span>
            <div className="flex-1 h-px bg-slate-100"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <div className="relative">
                <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input
                  type="text"
                  placeholder="Business Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isSignUp}
                  className="w-full bg-slate-50 border-none rounded-2xl pl-14 pr-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-100 placeholder:font-medium placeholder:text-slate-300"
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-slate-50 border-none rounded-2xl pl-14 pr-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-100 placeholder:font-medium placeholder:text-slate-300"
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-slate-50 border-none rounded-2xl pl-14 pr-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-100 placeholder:font-medium placeholder:text-slate-300"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-profee-blue text-white rounded-2xl font-bold text-base flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 hover:scale-[1.02] active:scale-95 transition-all font-poppins disabled:opacity-50"
            >
              {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          <p className="text-center text-sm text-slate-400 mt-6 font-poppins">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-profee-blue font-bold hover:underline"
            >
              {isSignUp ? 'Sign In' : 'Sign Up Free'}
            </button>
          </p>
        </div>

        <p className="text-center text-[10px] text-slate-300 mt-8 font-poppins font-bold uppercase tracking-widest">
          Secured by Firebase &bull; Made for Indian Businesses
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
