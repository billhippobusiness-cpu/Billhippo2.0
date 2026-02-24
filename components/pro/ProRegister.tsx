import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  User,
  Phone,
  Briefcase,
  Building2,
  Gift,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, addDoc, collection, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { generateProfessionalId, getReferrerByCode } from '../../lib/professionalId';
import { getPendingInvitesByEmail } from '../../lib/firestore';
import type { ProfessionalDesignation } from '../../types';
import { Bell } from 'lucide-react';

const BILLHIPPO_LOGO =
  'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

const DESIGNATIONS: ProfessionalDesignation[] = [
  'Tax Consultant',
  'Chartered Accountant',
  'Accountant',
  'GST Practitioner',
  'Company Secretary',
  'Staff',
  'Other',
];

interface ProRegisterProps {
  onGoToSignIn: (redirectHash?: string) => void;
}

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  designation: string;
  firmName: string;
  mobile: string;
  referralCode: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const ProRegister: React.FC<ProRegisterProps> = ({ onGoToSignIn }) => {
  // Read inviteToken from URL query string (e.g. #/pro-register?inviteToken=xxx)
  // window.location.hash is like "#/pro-register?inviteToken=abc", so we parse
  // the query string from the hash portion.
  const inviteToken = (() => {
    const hashStr = window.location.hash; // e.g. "#/pro-register?inviteToken=abc"
    const qIndex = hashStr.indexOf('?');
    if (qIndex === -1) return null;
    return new URLSearchParams(hashStr.slice(qIndex + 1)).get('inviteToken');
  })();

  const [form, setForm] = useState<FormState>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    designation: '',
    firmName: '',
    mobile: '',
    referralCode: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    professionalId: string;
    email: string;
    pendingInviteCount: number;
  } | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  // Link-mode: triggered when email already exists in Firebase Auth (business user
  // wants to add the Professional role to their existing account)
  const [linkMode, setLinkMode] = useState(false);
  // true when the user arrived from the business portal and is already signed in
  // with the same email — no password re-entry is needed in that case.
  const [linkAlreadySignedIn, setLinkAlreadySignedIn] = useState(false);
  const [linkPassword, setLinkPassword] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [showLinkPassword, setShowLinkPassword] = useState(false);

  const setField = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setGlobalError(null);
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.firstName.trim()) errs.firstName = 'Required';
    if (!form.lastName.trim()) errs.lastName = 'Required';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = 'Valid email required';
    if (form.password.length < 8) errs.password = 'Minimum 8 characters';
    if (form.password !== form.confirmPassword)
      errs.confirmPassword = 'Passwords do not match';
    if (!form.designation) errs.designation = 'Required';
    if (form.mobile && !/^[6-9]\d{9}$/.test(form.mobile))
      errs.mobile = '10-digit Indian mobile number';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setGlobalError(null);

    // Holds the newly created Firebase Auth user so we can delete it (rollback)
    // if any subsequent Firestore step fails — preventing ghost accounts.
    let newAuthUser: import('firebase/auth').User | null = null;

    try {
      // 1. Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      newAuthUser = cred.user;
      const uid = cred.user.uid;

      // 2. Generate unique professional ID
      const professionalId = await generateProfessionalId(
        form.designation as ProfessionalDesignation,
        db,
      );

      // 3. Write professionals/{uid}
      await setDoc(doc(db, 'professionals', uid), {
        uid,
        professionalId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        designation: form.designation,
        firmName: form.firmName.trim() || null,
        mobile: form.mobile.trim() || null,
        linkedClients: [],
        referralCode: professionalId,
        totalReferrals: 0,
        createdAt: new Date().toISOString(),
        roles: ['professional'],
      });

      // 4. Handle referral code if provided
      if (form.referralCode.trim()) {
        const referrerProfessionalId = await getReferrerByCode(form.referralCode, db);
        if (referrerProfessionalId) {
          await addDoc(collection(db, 'referrals'), {
            referrerProfessionalId,
            newUserUid: uid,
            newUserEmail: form.email.trim().toLowerCase(),
            createdAt: new Date().toISOString(),
            converted: false,
          });
        }
        // Invalid referral code → silently skip, do not block registration
      }

      // 5. Check for any pending invites assigned to this email by business users
      //    before the professional had an account. The count is shown on the
      //    success screen so the professional knows to look for the banner on
      //    sign-in. Failures here are non-blocking.
      let pendingInviteCount = 0;
      try {
        const pending = await getPendingInvitesByEmail(form.email.trim());
        pendingInviteCount = pending.length;
      } catch {
        // non-blocking
      }

      // 6. Send email verification
      await sendEmailVerification(cred.user);

      // 7. Sign out — user must verify email before signing in
      await signOut(auth);
      newAuthUser = null; // committed — no rollback needed

      // 8. Show success screen (with optional invite redirect and pending invite notice)
      setSuccessData({ professionalId, email: form.email.trim(), pendingInviteCount });
    } catch (err: any) {
      // If the Firebase Auth account was created but a later step failed,
      // delete the ghost account so the user can retry with the same email.
      if (newAuthUser) {
        try { await newAuthUser.delete(); } catch { /* best-effort */ }
      }
      const code = err.code ?? '';
      if (code === 'auth/email-already-in-use') {
        // If the user is already signed in as this very email (e.g. they came
        // from the business portal via "Register as Professional" and their
        // account is Google-only or they simply don't need to re-enter a
        // password), skip password re-entry.
        const currentEmail = auth.currentUser?.email?.toLowerCase() ?? '';
        const formEmail = form.email.trim().toLowerCase();
        setLinkAlreadySignedIn(currentEmail === formEmail);
        setLinkMode(true);
        setGlobalError(null);
      } else if (code === 'auth/weak-password') {
        setGlobalError(
          err.message?.replace('Firebase: ', '') || 'Password is too weak.',
        );
      } else {
        setGlobalError(
          'Something went wrong. Please check your connection and try again.',
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLinkAccount = async () => {
    if (!linkAlreadySignedIn && !linkPassword) return;
    setLinkLoading(true);
    setGlobalError(null);
    try {
      let uid: string;

      if (linkAlreadySignedIn && auth.currentUser?.email?.toLowerCase() === form.email.trim().toLowerCase()) {
        // User is already authenticated (e.g. Google sign-in from business portal).
        // No need to re-authenticate — just use the existing session.
        uid = auth.currentUser.uid;
      } else {
        // User is not signed in or is signed in as a different account.
        // Sign in with their existing BillHippo email/password.
        const cred = await signInWithEmailAndPassword(auth, form.email.trim(), linkPassword);
        uid = cred.user.uid;
      }

      // Check if a professionals/{uid} doc already exists (e.g. created during
      // development or a previous interrupted registration attempt).
      // If it does, we reuse the existing professionalId and preserve any
      // linkedClients that may have been set, but overwrite every other field
      // with the values the user just entered.
      const proSnap = await getDoc(doc(db, 'professionals', uid));

      let professionalId: string;
      let existingLinkedClients: string[] = [];
      let existingTotalReferrals = 0;
      let existingCreatedAt: string | null = null;

      if (proSnap.exists()) {
        const existing = proSnap.data();
        // Reuse the existing professionalId so referral links still work.
        professionalId = (existing.professionalId as string) || await generateProfessionalId(
          form.designation as ProfessionalDesignation,
          db,
        );
        existingLinkedClients  = (existing.linkedClients  as string[]) ?? [];
        existingTotalReferrals = (existing.totalReferrals as number)  ?? 0;
        existingCreatedAt      = (existing.createdAt      as string)  ?? null;
      } else {
        professionalId = await generateProfessionalId(
          form.designation as ProfessionalDesignation,
          db,
        );
      }

      await setDoc(doc(db, 'professionals', uid), {
        uid,
        professionalId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        designation: form.designation,
        firmName: form.firmName.trim() || null,
        mobile: form.mobile.trim() || null,
        linkedClients: existingLinkedClients,
        referralCode: professionalId,
        totalReferrals: existingTotalReferrals,
        createdAt: existingCreatedAt ?? new Date().toISOString(),
        roles: ['professional'],
      });

      // Handle referral code if provided
      if (form.referralCode.trim()) {
        const referrerProfessionalId = await getReferrerByCode(form.referralCode, db);
        if (referrerProfessionalId) {
          await addDoc(collection(db, 'referrals'), {
            referrerProfessionalId,
            newUserUid: uid,
            newUserEmail: form.email.trim().toLowerCase(),
            createdAt: new Date().toISOString(),
            converted: false,
          });
        }
      }

      // Check pending invites
      let pendingInviteCount = 0;
      try {
        const pending = await getPendingInvitesByEmail(form.email.trim());
        pendingInviteCount = pending.length;
      } catch {
        // non-blocking
      }

      if (linkAlreadySignedIn) {
        // User was already signed in — don't sign out.  Reload the page so the
        // app re-reads Firestore, detects role='both', and lands on the
        // Professional Portal directly (no extra sign-in step needed).
        window.location.reload();
      } else {
        // User signed in with a password just now — sign out and show the
        // success screen so they know to verify their email before logging in.
        await signOut(auth);
        setSuccessData({ professionalId, email: form.email.trim(), pendingInviteCount });
      }
    } catch (err: any) {
      const code = err.code ?? '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setGlobalError('Incorrect password. Please try again.');
      } else if (code === 'auth/too-many-requests') {
        setGlobalError('Too many attempts. Please wait a moment and try again.');
      } else {
        setGlobalError('Something went wrong. Please check your connection and try again.');
      }
    } finally {
      setLinkLoading(false);
    }
  };

  const copyProId = () => {
    if (!successData) return;
    navigator.clipboard.writeText(successData.professionalId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // ── Success Screen ──────────────────────────────────────────────────────

  if (successData) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 max-w-md w-full text-center"
        >
          {/* Check icon */}
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>

          <h2 className="text-2xl font-bold font-poppins text-slate-900 mb-2">
            Welcome to BillHippo Professional!
          </h2>
          <p className="text-sm text-slate-500 font-poppins mb-6">
            Your account has been created successfully.
          </p>

          {/* Professional ID highlight box */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-3">
            <p className="text-[10px] font-bold font-poppins text-emerald-600 uppercase tracking-widest mb-2">
              Your Professional ID
            </p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl font-bold font-poppins text-emerald-700 tracking-wider">
                {successData.professionalId}
              </span>
              <button
                onClick={copyProId}
                className="w-8 h-8 rounded-xl bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center"
                title="Copy ID"
                style={{ transition: 'background-color 0.2s' }}
              >
                {copiedId
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  : <Copy className="w-4 h-4 text-emerald-600" />}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400 font-poppins mb-6">
            This is also your referral code. Share it with clients to link them to your account.
          </p>

          {/* Pending invites notice — shown when business users had already assigned this email */}
          {successData.pendingInviteCount > 0 && !inviteToken && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 mb-3 text-xs text-indigo-700 font-poppins text-left leading-relaxed flex items-start gap-2.5">
              <Bell className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-indigo-500" />
              <span>
                <strong>
                  {successData.pendingInviteCount} business client
                  {successData.pendingInviteCount > 1 ? 's have' : ' has'} already assigned you.
                </strong>{' '}
                After signing in, you will see an Accept / Decline notification on your dashboard.
              </span>
            </div>
          )}

          {/* Email verification notice */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 mb-6 text-xs text-amber-700 font-poppins text-left leading-relaxed">
            <strong>Please verify your email before signing in.</strong> A verification link has been
            sent to <strong>{successData.email}</strong>.
            {inviteToken && (
              <span> After verifying, sign in and you will be redirected to accept the invite.</span>
            )}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onGoToSignIn(inviteToken ? `#/invite/${inviteToken}` : undefined)}
            className="w-full h-12 rounded-2xl bg-emerald-600 text-white text-sm font-bold font-poppins flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
            style={{ transition: 'none' }}
          >
            Go to Sign In
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.div>
      </div>
    );
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  const inputCls = (field: keyof FormState, hasRightPad = false) =>
    [
      'w-full bg-slate-50 border text-slate-800 placeholder:text-slate-300',
      'h-12 rounded-2xl pl-11 text-sm outline-none font-poppins font-medium',
      'focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/40',
      hasRightPad ? 'pr-11' : 'pr-4',
      errors[field] ? 'border-rose-300' : 'border-slate-100',
    ].join(' ');

  const iconCls = (field: string) =>
    `absolute left-4 w-4 h-4 pointer-events-none ${focusedInput === field ? 'text-emerald-600' : 'text-slate-300'}`;

  const ErrMsg = ({ field }: { field: keyof FormState }) =>
    errors[field] ? (
      <p className="text-[10px] text-rose-500 font-poppins mt-1 ml-1">{errors[field]}</p>
    ) : null;

  // ── Registration Form ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8fafc] py-10 px-4">
      {/* Page header */}
      <div className="text-center mb-8">
        <img
          src={BILLHIPPO_LOGO}
          alt="BillHippo"
          className="h-14 w-auto object-contain mx-auto mb-3"
        />
        <h1 className="text-2xl font-bold font-poppins text-slate-900">
          Professional Portal Registration
        </h1>
        <p className="text-sm text-slate-400 font-poppins mt-1">
          Free forever. Read-only access to your clients' GST data.
        </p>
        <div className="inline-block mt-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
          <span className="text-xs font-bold font-poppins text-emerald-600 uppercase tracking-wide">
            BillHippo Professional
          </span>
        </div>
      </div>

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl mx-auto bg-white/80 backdrop-blur-xl rounded-3xl border border-slate-200/60 shadow-xl shadow-slate-100/60 p-8"
      >
        {/* Global error */}
        <AnimatePresence>
          {globalError && (
            <motion.div
              key="err"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mb-6 p-3 bg-rose-50 border border-rose-100 rounded-2xl text-xs text-rose-600 font-medium font-poppins text-center"
              style={{ transition: 'none' }}
            >
              {globalError}
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} noValidate>
          {/* Two-column grid on desktop */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">

            {/* First Name */}
            <div>
              <label className="block text-xs font-semibold font-poppins text-slate-500 mb-1.5 ml-1">
                First Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative flex items-center">
                <User className={iconCls('firstName')} style={{ transition: 'color 0.2s' }} />
                <input
                  type="text"
                  placeholder="Rahul"
                  value={form.firstName}
                  onChange={(e) => setField('firstName', e.target.value)}
                  onFocus={() => setFocusedInput('firstName')}
                  onBlur={() => setFocusedInput(null)}
                  className={inputCls('firstName')}
                />
              </div>
              <ErrMsg field="firstName" />
            </div>

            {/* Last Name */}
            <div>
              <label className="block text-xs font-semibold font-poppins text-slate-500 mb-1.5 ml-1">
                Last Name <span className="text-rose-400">*</span>
              </label>
              <div className="relative flex items-center">
                <User className={iconCls('lastName')} style={{ transition: 'color 0.2s' }} />
                <input
                  type="text"
                  placeholder="Sharma"
                  value={form.lastName}
                  onChange={(e) => setField('lastName', e.target.value)}
                  onFocus={() => setFocusedInput('lastName')}
                  onBlur={() => setFocusedInput(null)}
                  className={inputCls('lastName')}
                />
              </div>
              <ErrMsg field="lastName" />
            </div>

            {/* Professional Email */}
            <div>
              <label className="block text-xs font-semibold font-poppins text-slate-500 mb-1.5 ml-1">
                Professional Email <span className="text-rose-400">*</span>
              </label>
              <div className="relative flex items-center">
                <Mail className={iconCls('email')} style={{ transition: 'color 0.2s' }} />
                <input
                  type="email"
                  placeholder="rahul@firm.com"
                  value={form.email}
                  onChange={(e) => setField('email', e.target.value)}
                  onFocus={() => setFocusedInput('email')}
                  onBlur={() => setFocusedInput(null)}
                  className={inputCls('email')}
                />
              </div>
              <ErrMsg field="email" />
            </div>

            {/* Designation */}
            <div>
              <label className="block text-xs font-semibold font-poppins text-slate-500 mb-1.5 ml-1">
                Designation <span className="text-rose-400">*</span>
              </label>
              <div className="relative flex items-center">
                <Briefcase className={iconCls('designation')} style={{ transition: 'color 0.2s' }} />
                <select
                  value={form.designation}
                  onChange={(e) => setField('designation', e.target.value)}
                  onFocus={() => setFocusedInput('designation')}
                  onBlur={() => setFocusedInput(null)}
                  className={`${inputCls('designation')} appearance-none cursor-pointer`}
                >
                  <option value="">Select designation…</option>
                  {DESIGNATIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <ErrMsg field="designation" />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold font-poppins text-slate-500 mb-1.5 ml-1">
                Password <span className="text-rose-400">*</span>
              </label>
              <div className="relative flex items-center">
                <Lock className={iconCls('password')} style={{ transition: 'color 0.2s' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 8 characters"
                  value={form.password}
                  onChange={(e) => setField('password', e.target.value)}
                  onFocus={() => setFocusedInput('password')}
                  onBlur={() => setFocusedInput(null)}
                  className={inputCls('password', true)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4"
                >
                  {showPassword
                    ? <Eye className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.2s' }} />
                    : <EyeOff className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.2s' }} />}
                </button>
              </div>
              <ErrMsg field="password" />
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-semibold font-poppins text-slate-500 mb-1.5 ml-1">
                Confirm Password <span className="text-rose-400">*</span>
              </label>
              <div className="relative flex items-center">
                <Lock className={iconCls('confirmPassword')} style={{ transition: 'color 0.2s' }} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={(e) => setField('confirmPassword', e.target.value)}
                  onFocus={() => setFocusedInput('confirmPassword')}
                  onBlur={() => setFocusedInput(null)}
                  className={inputCls('confirmPassword', true)}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4"
                >
                  {showConfirmPassword
                    ? <Eye className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.2s' }} />
                    : <EyeOff className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.2s' }} />}
                </button>
              </div>
              <ErrMsg field="confirmPassword" />
            </div>

            {/* Firm Name (optional) */}
            <div>
              <label className="block text-xs font-semibold font-poppins text-slate-500 mb-1.5 ml-1">
                Firm Name <span className="text-slate-300 font-normal">(optional)</span>
              </label>
              <div className="relative flex items-center">
                <Building2 className={iconCls('firmName')} style={{ transition: 'color 0.2s' }} />
                <input
                  type="text"
                  placeholder="Sharma & Associates"
                  value={form.firmName}
                  onChange={(e) => setField('firmName', e.target.value)}
                  onFocus={() => setFocusedInput('firmName')}
                  onBlur={() => setFocusedInput(null)}
                  className={inputCls('firmName')}
                />
              </div>
            </div>

            {/* Mobile (optional) */}
            <div>
              <label className="block text-xs font-semibold font-poppins text-slate-500 mb-1.5 ml-1">
                Mobile Number <span className="text-slate-300 font-normal">(optional)</span>
              </label>
              <div className="relative flex items-center">
                <Phone className={iconCls('mobile')} style={{ transition: 'color 0.2s' }} />
                <input
                  type="tel"
                  placeholder="9876543210"
                  value={form.mobile}
                  onChange={(e) =>
                    setField('mobile', e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  onFocus={() => setFocusedInput('mobile')}
                  onBlur={() => setFocusedInput(null)}
                  className={inputCls('mobile')}
                  maxLength={10}
                />
              </div>
              <ErrMsg field="mobile" />
            </div>

            {/* Referral Code — full width */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold font-poppins text-slate-500 mb-0.5 ml-1">
                Referral Code <span className="text-slate-300 font-normal">(optional)</span>
              </label>
              <p className="text-[10px] text-slate-400 font-poppins mb-1.5 ml-1">
                Were you referred by a professional?
              </p>
              <div className="relative flex items-center">
                <Gift className={iconCls('referralCode')} style={{ transition: 'color 0.2s' }} />
                <input
                  type="text"
                  placeholder="e.g. BHPCA00001"
                  value={form.referralCode}
                  onChange={(e) =>
                    setField('referralCode', e.target.value.toUpperCase())
                  }
                  onFocus={() => setFocusedInput('referralCode')}
                  onBlur={() => setFocusedInput(null)}
                  className={inputCls('referralCode')}
                />
              </div>
            </div>
          </div>

          {/* Link existing account — shown when email already has a business account */}
          {linkMode && (
            <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
              <p className="text-sm font-bold font-poppins text-indigo-800 mb-1">
                Email already has a BillHippo account
              </p>
              {linkAlreadySignedIn ? (
                <p className="text-xs text-indigo-600 font-poppins mb-4">
                  You're already signed in as <strong>{form.email.trim()}</strong>. Click below to
                  add the Professional role — no password needed. You'll be able to use both
                  the business and professional portals.
                </p>
              ) : (
                <>
                  <p className="text-xs text-indigo-600 font-poppins mb-4">
                    Enter your existing BillHippo password to add the Professional role to your
                    account. You'll be able to use both the business and professional portals.
                  </p>
                  <div className="relative flex items-center mb-3">
                    <Lock className={`absolute left-4 w-4 h-4 pointer-events-none ${focusedInput === 'linkPassword' ? 'text-indigo-500' : 'text-slate-300'}`} style={{ transition: 'color 0.2s' }} />
                    <input
                      type={showLinkPassword ? 'text' : 'password'}
                      placeholder="Your existing BillHippo password"
                      value={linkPassword}
                      onChange={(e) => { setLinkPassword(e.target.value); setGlobalError(null); }}
                      onFocus={() => setFocusedInput('linkPassword')}
                      onBlur={() => setFocusedInput(null)}
                      className="w-full bg-white border border-indigo-200 text-slate-800 placeholder:text-slate-300 h-12 rounded-2xl pl-11 pr-11 text-sm outline-none font-poppins font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLinkPassword(!showLinkPassword)}
                      className="absolute right-4"
                    >
                      {showLinkPassword
                        ? <Eye className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.2s' }} />
                        : <EyeOff className="w-4 h-4 text-slate-300 hover:text-slate-500" style={{ transition: 'color 0.2s' }} />}
                    </button>
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setLinkMode(false); setLinkPassword(''); setLinkAlreadySignedIn(false); setGlobalError(null); }}
                  className="flex-1 h-10 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold font-poppins hover:bg-slate-50"
                  style={{ transition: 'background-color 0.2s' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLinkAccount}
                  disabled={linkLoading || (!linkAlreadySignedIn && !linkPassword)}
                  className="flex-1 h-10 rounded-xl bg-indigo-600 text-white text-xs font-bold font-poppins flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {linkLoading
                    ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <>Add Professional Role <ArrowRight className="w-3.5 h-3.5" /></>}
                </button>
              </div>
            </div>
          )}

          {/* Submit button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading || linkMode}
            className="w-full mt-8 relative group/button disabled:opacity-60"
            style={{ transition: 'none' }}
          >
            <div
              className="absolute inset-0 bg-emerald-600/20 rounded-2xl blur-xl opacity-0 group-hover/button:opacity-100"
              style={{ transition: 'opacity 0.3s' }}
            />
            <div className="relative bg-emerald-600 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 font-poppins shadow-lg shadow-emerald-100 text-sm">
              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    key="spinner"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{ transition: 'none' }}
                  >
                    <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  </motion.div>
                ) : (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2"
                    style={{ transition: 'none' }}
                  >
                    Create Professional Account
                    <ArrowRight
                      className="w-4 h-4 group-hover/button:translate-x-1"
                      style={{ transition: 'transform 0.3s' }}
                    />
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </motion.button>

          {/* Sign-in link */}
          <p className="text-center text-xs text-slate-400 mt-5 font-poppins">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => onGoToSignIn(inviteToken ? `#/invite/${inviteToken}` : undefined)}
              className="text-emerald-600 font-bold hover:underline"
            >
              Sign in
            </button>
          </p>
        </form>
      </motion.div>

      {/* Footer */}
      <p className="text-center text-[10px] text-slate-300 font-bold uppercase tracking-widest font-poppins mt-8">
        Secured by Firebase &bull; Made for Indian Professionals
      </p>
    </div>
  );
};

export default ProRegister;
