/**
 * ProProfile — view and edit the professional's account details.
 *
 * Editable:    firstName, lastName, designation, firmName, mobile
 * Non-editable: email (Firebase Auth constraint), professionalId, createdAt
 *
 * Password change: re-authenticates with current password via
 * EmailAuthProvider, then calls Firebase Auth updatePassword.
 *
 * All profile field updates are persisted to professionals/{uid}.
 */
import React, { useState } from 'react';
import {
  User,
  Edit3,
  Save,
  Eye,
  EyeClosed,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Lock,
  Mail,
  Building2,
  Users,
  ChevronRight,
  X,
  ArrowLeftRight,
} from 'lucide-react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { db } from '../../lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import type { ProfessionalProfile, ProfessionalDesignation, BusinessProfile, UserRole } from '../../types';
import type { ProView } from './ProLayout';

// ── Constants ──────────────────────────────────────────────────────────────

const DESIGNATIONS: ProfessionalDesignation[] = [
  'Tax Consultant',
  'Chartered Accountant',
  'Accountant',
  'GST Practitioner',
  'Company Secretary',
  'Staff',
  'Other',
];

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProProfileProps {
  user: FirebaseUser;
  profile: ProfessionalProfile | null;
  onNavigate: (view: ProView) => void;
  /** From App.tsx via wrapper — determines which Business Account section to show */
  role?: UserRole | null;
  /** Passed when role === 'both'; used to display the linked business name */
  businessProfile?: BusinessProfile | null;
  /** Navigate to business portal, or create business account (role==='professional') */
  onSwitchToBusiness?: () => void;
}

interface Toast {
  msg: string;
  ok: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatMemberSince(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

// ── Component ──────────────────────────────────────────────────────────────

const ProProfile: React.FC<ProProfileProps> = ({
  user,
  profile,
  onNavigate,
  role,
  businessProfile,
  onSwitchToBusiness,
}) => {
  // ── Profile edit state ───────────────────────────────────────────────────
  const [editMode,    setEditMode]    = useState(false);
  const [firstName,   setFirstName]   = useState(profile?.firstName   ?? '');
  const [lastName,    setLastName]    = useState(profile?.lastName    ?? '');
  const [designation, setDesignation] = useState<ProfessionalDesignation>(
    profile?.designation ?? 'Tax Consultant',
  );
  const [firmName,    setFirmName]    = useState(profile?.firmName    ?? '');
  const [mobile,      setMobile]      = useState(profile?.mobile      ?? '');
  const [saving,      setSaving]      = useState(false);

  // ── Password change state ────────────────────────────────────────────────
  const [showPwSection,  setShowPwSection]  = useState(false);
  const [currentPw,      setCurrentPw]      = useState('');
  const [newPw,          setNewPw]          = useState('');
  const [confirmPw,      setConfirmPw]      = useState('');
  const [showCurrentPw,  setShowCurrentPw]  = useState(false);
  const [showNewPw,      setShowNewPw]      = useState(false);
  const [pwSaving,       setPwSaving]       = useState(false);

  // ── Toast ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Edit mode helpers ────────────────────────────────────────────────────
  const startEdit = () => {
    setFirstName(profile?.firstName    ?? '');
    setLastName(profile?.lastName     ?? '');
    setDesignation(profile?.designation ?? 'Tax Consultant');
    setFirmName(profile?.firmName     ?? '');
    setMobile(profile?.mobile         ?? '');
    setEditMode(true);
  };

  const cancelEdit = () => setEditMode(false);

  // ── Save profile ─────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      showToast('First name and last name are required.', false);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'professionals', user.uid), {
        firstName:   firstName.trim(),
        lastName:    lastName.trim(),
        designation,
        firmName:    firmName.trim(),
        mobile:      mobile.trim(),
        updatedAt:   serverTimestamp(),
      });
      setEditMode(false);
      showToast('Profile saved successfully.', true);
    } catch (err) {
      console.error('[ProProfile] Save failed:', err);
      showToast('Could not save profile. Please try again.', false);
    } finally {
      setSaving(false);
    }
  };

  // ── Change password ──────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!currentPw) {
      showToast('Please enter your current password.', false);
      return;
    }
    if (newPw.length < 8) {
      showToast('New password must be at least 8 characters.', false);
      return;
    }
    if (newPw !== confirmPw) {
      showToast('New passwords do not match.', false);
      return;
    }

    setPwSaving(true);
    try {
      const credential = EmailAuthProvider.credential(user.email ?? '', currentPw);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setShowPwSection(false);
      showToast('Password updated successfully.', true);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        showToast('Current password is incorrect.', false);
      } else {
        showToast('Could not update password. Please try again.', false);
      }
    } finally {
      setPwSaving(false);
    }
  };

  // ── Derived display values ───────────────────────────────────────────────
  const displayName =
    profile
      ? `${profile.firstName} ${profile.lastName}`
      : (user.displayName ?? user.email?.split('@')[0] ?? 'Professional');

  const initials = displayName
    .split(' ')
    .map((w) => w[0] ?? '')
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const clientCount = profile?.linkedClients?.length ?? 0;

  // ── Field input helper ───────────────────────────────────────────────────
  const fieldClass =
    'w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-poppins ' +
    'text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ' +
    'focus:border-emerald-400 bg-white';

  const labelClass =
    'block text-xs font-bold text-slate-400 font-poppins uppercase tracking-wider mb-1.5';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-2xl">
      {/* ── Toast ── */}
      {toast && (
        <div
          className={`
            fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5
            rounded-2xl shadow-lg border text-sm font-semibold font-poppins
            animate-in slide-in-from-top-2
            ${toast.ok
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
              : 'bg-rose-50 border-rose-100 text-rose-600'}
          `}
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-poppins">My Profile</h1>
          <p className="text-sm text-slate-400 font-poppins mt-1">
            Manage your professional information
          </p>
        </div>
        {!editMode && (
          <button
            onClick={startEdit}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-semibold font-poppins transition-all shadow-sm shadow-emerald-200 flex-shrink-0"
          >
            <Edit3 size={15} />
            Edit Profile
          </button>
        )}
      </div>

      {/* ── Profile Card ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 sm:p-8">
        {/* Avatar + ID badge */}
        <div className="flex items-start gap-5 mb-7 pb-7 border-b border-slate-50">
          <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center text-white text-xl font-bold font-poppins flex-shrink-0 shadow-sm shadow-emerald-200">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-800 font-poppins truncate">
              {displayName}
            </h2>
            {profile?.designation && (
              <p className="text-sm text-slate-400 font-poppins">{profile.designation}</p>
            )}
            {profile?.professionalId && (
              <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-full">
                <span className="text-[9px] font-bold font-poppins text-emerald-400 uppercase tracking-widest">
                  Pro ID
                </span>
                <span className="text-sm font-mono font-bold text-emerald-700">
                  {profile.professionalId}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Editable fields */}
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* First Name */}
            <div>
              <label className={labelClass}>First Name</label>
              {editMode ? (
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={fieldClass}
                />
              ) : (
                <p className="text-sm font-semibold text-slate-700 font-poppins py-2.5">
                  {profile?.firstName || '—'}
                </p>
              )}
            </div>

            {/* Last Name */}
            <div>
              <label className={labelClass}>Last Name</label>
              {editMode ? (
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={fieldClass}
                />
              ) : (
                <p className="text-sm font-semibold text-slate-700 font-poppins py-2.5">
                  {profile?.lastName || '—'}
                </p>
              )}
            </div>
          </div>

          {/* Designation */}
          <div>
            <label className={labelClass}>Designation</label>
            {editMode ? (
              <select
                value={designation}
                onChange={(e) => setDesignation(e.target.value as ProfessionalDesignation)}
                className={fieldClass}
              >
                {DESIGNATIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm font-semibold text-slate-700 font-poppins py-2.5">
                {profile?.designation || '—'}
              </p>
            )}
          </div>

          {/* Firm Name */}
          <div>
            <label className={labelClass}>
              Firm Name{' '}
              <span className="text-slate-300 font-normal normal-case tracking-normal">
                (optional)
              </span>
            </label>
            {editMode ? (
              <input
                type="text"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                placeholder="e.g. Sharma & Associates"
                className={fieldClass + ' placeholder:text-slate-300'}
              />
            ) : (
              <p className="text-sm font-semibold text-slate-700 font-poppins py-2.5">
                {profile?.firmName || '—'}
              </p>
            )}
          </div>

          {/* Mobile */}
          <div>
            <label className={labelClass}>
              Mobile Number{' '}
              <span className="text-slate-300 font-normal normal-case tracking-normal">
                (optional)
              </span>
            </label>
            {editMode ? (
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="+91 98765 43210"
                className={fieldClass + ' placeholder:text-slate-300'}
              />
            ) : (
              <p className="text-sm font-semibold text-slate-700 font-poppins py-2.5">
                {profile?.mobile || '—'}
              </p>
            )}
          </div>

          {/* Save / Cancel */}
          {editMode && (
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl text-sm font-semibold font-poppins transition-all shadow-sm shadow-emerald-200"
              >
                {saving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-sm font-semibold font-poppins transition-all"
              >
                <X size={15} />
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Account Information (non-editable) ───────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6 space-y-5">
        <h3 className="text-xs font-bold text-slate-400 font-poppins uppercase tracking-wider">
          Account Information
        </h3>

        {/* Email */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
            <Mail size={14} className="text-slate-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-poppins font-semibold">Email Address</p>
            <p className="text-sm font-semibold text-slate-700 font-poppins mt-0.5">
              {user.email ?? '—'}
            </p>
            <p className="text-[10px] text-slate-300 font-poppins mt-0.5">
              Email cannot be changed
            </p>
          </div>
        </div>

        {/* Professional ID */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <User size={14} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-poppins font-semibold">Professional ID</p>
            <p className="text-sm font-mono font-bold text-emerald-700 mt-0.5">
              {profile?.professionalId ?? '—'}
            </p>
            <p className="text-[10px] text-slate-300 font-poppins mt-0.5">
              This is your unique identifier and referral code
            </p>
          </div>
        </div>

        {/* Member Since */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
            <Building2 size={14} className="text-slate-400" />
          </div>
          <div>
            <p className="text-xs text-slate-400 font-poppins font-semibold">Member Since</p>
            <p className="text-sm font-semibold text-slate-700 font-poppins mt-0.5">
              {formatMemberSince(profile?.createdAt ?? '')}
            </p>
          </div>
        </div>
      </div>

      {/* ── Linked Clients mini-view ──────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <Users size={16} className="text-emerald-500" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700 font-poppins">Linked Clients</p>
              <p className="text-xs text-slate-400 font-poppins">
                {clientCount} client{clientCount !== 1 ? 's' : ''} currently linked
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('clients')}
            className="flex items-center gap-1 text-xs text-emerald-600 font-semibold font-poppins hover:underline flex-shrink-0"
          >
            Manage via My Clients
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* ── My Business Account ──────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 p-6">
        <h3 className="text-xs font-bold text-slate-400 font-poppins uppercase tracking-wider mb-5">
          My Business Account
        </h3>

        {role === 'both' ? (
          /* Dual-account: show linked business + switch button */
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                <Building2 size={14} className="text-[#4c2de0]" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-poppins font-semibold">Active Business</p>
                <p className="text-sm font-bold text-slate-700 font-poppins">
                  {businessProfile?.name ?? 'BillHippo Business'}
                </p>
              </div>
            </div>
            <button
              onClick={onSwitchToBusiness}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#4c2de0] hover:bg-[#3d23b5] text-white rounded-2xl text-sm font-semibold font-poppins transition-all shadow-sm"
            >
              <ArrowLeftRight size={14} />
              Switch to Business
            </button>
          </div>
        ) : (
          /* Professional-only: offer to create a business account */
          <div className="space-y-3">
            <p className="text-sm text-slate-400 font-poppins leading-relaxed">
              Want to create invoices for your own firm? Subscribe to BillHippo
              Business and manage both accounts from one login.
            </p>
            <button
              onClick={onSwitchToBusiness}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#4c2de0] hover:bg-[#3d23b5] text-white rounded-2xl text-sm font-semibold font-poppins transition-all shadow-sm"
            >
              <Building2 size={14} />
              Subscribe to BillHippo Business
            </button>
          </div>
        )}
      </div>

      {/* ── Password Change ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
        {/* Toggle header */}
        <button
          onClick={() => setShowPwSection(!showPwSection)}
          className="w-full flex items-center justify-between px-6 py-5 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center">
              <Lock size={14} className="text-slate-400" />
            </div>
            <span className="text-sm font-bold text-slate-700 font-poppins">
              Change Password
            </span>
          </div>
          <ChevronRight
            size={16}
            className={`text-slate-300 transition-transform duration-200 ${
              showPwSection ? 'rotate-90' : ''
            }`}
          />
        </button>

        {/* Expandable form */}
        {showPwSection && (
          <div className="px-6 pb-6 border-t border-slate-50 space-y-4">
            <div className="pt-5 space-y-4">
              {/* Current Password */}
              <div>
                <label className={labelClass}>Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    value={currentPw}
                    onChange={(e) => setCurrentPw(e.target.value)}
                    placeholder="Enter current password"
                    className={fieldClass + ' pr-10 placeholder:text-slate-300'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showCurrentPw ? <EyeClosed size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className={labelClass}>New Password</label>
                <div className="relative">
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                    placeholder="At least 8 characters"
                    className={fieldClass + ' pr-10 placeholder:text-slate-300'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw(!showNewPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showNewPw ? <EyeClosed size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className={labelClass}>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Re-enter new password"
                  className={fieldClass + ' placeholder:text-slate-300'}
                />
              </div>

              <button
                onClick={handleChangePassword}
                disabled={pwSaving || !currentPw || !newPw || !confirmPw}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-2xl text-sm font-semibold font-poppins transition-all shadow-sm shadow-emerald-200"
              >
                {pwSaving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Lock size={15} />
                )}
                {pwSaving ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProProfile;
