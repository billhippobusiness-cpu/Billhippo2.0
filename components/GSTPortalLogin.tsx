import React, { useState } from 'react';
import { X, Lock, Smartphone, CheckCircle2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { initiateGSTSession, verifyGSTOTP } from '../lib/whitebooksApi';

interface GSTPortalLoginProps {
  gstin: string;
  userId: string;
  onSuccess: (authToken: string, expiresAt: number, gstUsername: string) => void;
  onClose: () => void;
}

type Step = 'credentials' | 'otp' | 'success';

const GSTPortalLogin: React.FC<GSTPortalLoginProps> = ({ gstin, userId, onSuccess, onClose }) => {
  const [step, setStep] = useState<Step>('credentials');
  const [gstUsername, setGstUsername] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequestOTP = async () => {
    if (!gstUsername.trim()) { setError('Please enter your GST Portal Username'); return; }
    setLoading(true);
    setError(null);
    try {
      await initiateGSTSession(gstin, gstUsername.trim());
      setStep('otp');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to send OTP. Please check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) { setError('Please enter the OTP'); return; }
    setLoading(true);
    setError(null);
    try {
      const { authToken, expiresAt } = await verifyGSTOTP(gstin, otp.trim(), gstUsername, userId);
      setStep('success');
      setTimeout(() => onSuccess(authToken, expiresAt, gstUsername), 1200);
    } catch (err: any) {
      setError(err?.message ?? 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-white rounded-[2.5rem] p-10 w-full max-w-md shadow-2xl font-poppins animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <Lock size={18} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">GST Portal Login</h3>
              <p className="text-[10px] text-slate-400 font-mono tracking-wider mt-0.5">{gstin}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {(['credentials', 'otp', 'success'] as Step[]).map((s, i) => (
            <React.Fragment key={s}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step === s ? 'bg-indigo-600 text-white' :
                (i < (['credentials','otp','success'] as Step[]).indexOf(step)) ? 'bg-emerald-500 text-white' :
                'bg-slate-100 text-slate-400'
              }`}>
                {i < (['credentials','otp','success'] as Step[]).indexOf(step) ? '✓' : i + 1}
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 transition-all ${i < (['credentials','otp','success'] as Step[]).indexOf(step) ? 'bg-emerald-400' : 'bg-slate-100'}`} />}
            </React.Fragment>
          ))}
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-600 font-medium mb-6 flex items-start gap-3">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {step === 'credentials' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-700">
              <p className="font-bold mb-1">Login with your GST Portal credentials</p>
              <p className="text-xs text-blue-600">This is the same username you use at <span className="font-mono">gst.gov.in</span>. An OTP will be sent to your registered mobile number.</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">GST Portal Username</label>
              <input
                autoFocus
                className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-100 text-sm"
                value={gstUsername}
                onChange={e => setGstUsername(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRequestOTP()}
                placeholder="e.g. mygstin_username"
              />
            </div>
            <button
              onClick={handleRequestOTP}
              disabled={loading || !gstUsername.trim()}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
            >
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Smartphone size={18} />}
              {loading ? 'Sending OTP...' : 'Request OTP'}
            </button>
          </div>
        )}

        {step === 'otp' && (
          <div className="space-y-6">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-sm text-emerald-700">
              <p className="font-bold mb-1">OTP sent!</p>
              <p className="text-xs text-emerald-600">Check your mobile number registered with the GST portal. Enter the 6-digit OTP below.</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-2">One-Time Password (OTP)</label>
              <input
                autoFocus
                type="text"
                inputMode="numeric"
                maxLength={6}
                className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-100 text-center text-2xl tracking-[0.5em]"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleVerifyOTP()}
                placeholder="• • • • • •"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setStep('credentials'); setOtp(''); setError(null); }}
                className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all border border-slate-100 flex items-center justify-center gap-2"
              >
                <RefreshCw size={16} /> Resend
              </button>
              <button
                onClick={handleVerifyOTP}
                disabled={loading || otp.length < 4}
                className="flex-1 bg-indigo-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : 'Verify OTP'}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-emerald-500" />
            </div>
            <h4 className="text-lg font-bold text-slate-900">Logged In Successfully!</h4>
            <p className="text-sm text-slate-500">Your GST portal session is active for 6 hours.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GSTPortalLogin;
