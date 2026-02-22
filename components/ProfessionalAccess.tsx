import React, { useState, useEffect } from 'react';
import {
  Users,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import type { AssignedProfessional, ProfessionalDesignation, BusinessProfile } from '../types';
import {
  subscribeAssignedProfessionals,
  createProfessionalInvite,
  revokeProfessionalAccess,
} from '../lib/firestore';

const MAX_PROS = 5;

const DESIGNATIONS: ProfessionalDesignation[] = [
  'Tax Consultant',
  'Chartered Accountant',
  'Accountant',
  'GST Practitioner',
  'Company Secretary',
  'Staff',
  'Other',
];

const ACCESS_LEVELS = [
  {
    value: 'Full GST Access',
    desc: 'All reports and registers visible',
  },
  {
    value: 'Reports Only',
    desc: 'Only GSTR summaries, no raw transaction data',
  },
];

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  designation: '' as ProfessionalDesignation | '',
  email: '',
  accessLevel: '',
};

interface ProfessionalAccessProps {
  userId: string;
  businessProfile: BusinessProfile | null;
}

// ── Status badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: AssignedProfessional['status'] }> = ({ status }) => {
  const cls = {
    pending: 'bg-amber-100 text-amber-700',
    active:  'bg-emerald-100 text-emerald-700',
    revoked: 'bg-slate-100 text-slate-400',
  }[status];
  return (
    <span
      className={`inline-block text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full ${cls}`}
    >
      {status}
    </span>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ProfessionalAccess: React.FC<ProfessionalAccessProps> = ({ userId, businessProfile }) => {
  const [assigned, setAssigned] = useState<AssignedProfessional[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Real-time listener
  useEffect(() => {
    const unsub = subscribeAssignedProfessionals(userId, setAssigned);
    return unsub;
  }, [userId]);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const setField = <K extends keyof typeof EMPTY_FORM>(field: K, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setFormError(null);
  };

  // Count non-revoked professionals
  const activeCount = assigned.filter((a) => a.status !== 'revoked').length;

  // ── Send invite ─────────────────────────────────────────────────────────

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.firstName.trim()) return setFormError('First name is required.');
    if (!form.lastName.trim()) return setFormError('Last name is required.');
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      return setFormError('A valid email address is required.');
    if (!form.designation) return setFormError('Please select a designation.');
    if (!form.accessLevel) return setFormError('Please select an access level.');

    if (activeCount >= MAX_PROS)
      return setFormError(`You have reached the limit of ${MAX_PROS} assigned professionals.`);

    const duplicate = assigned.some(
      (a) => a.email.toLowerCase() === form.email.trim().toLowerCase() && a.status !== 'revoked',
    );
    if (duplicate) return setFormError('This email already has access assigned.');

    setInviting(true);
    setFormError(null);
    try {
      await createProfessionalInvite(userId, {
        businessUserEmail: businessProfile?.email ?? '',
        businessName: businessProfile?.name ?? '',
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim().toLowerCase(),
        designation: form.designation as ProfessionalDesignation,
        accessLevel: form.accessLevel,
      });
      showToast(`Invite sent to ${form.email.trim()}`);
      setForm(EMPTY_FORM);
    } catch {
      showToast('Failed to send invite. Please try again.', false);
    } finally {
      setInviting(false);
    }
  };

  // ── Revoke access ───────────────────────────────────────────────────────

  const handleRevoke = async (record: AssignedProfessional) => {
    setRevoking(record.id);
    try {
      await revokeProfessionalAccess(userId, record.id, record.professionalId);
      showToast(`Access revoked for ${record.firstName} ${record.lastName}.`);
    } catch {
      showToast('Failed to revoke access. Please try again.', false);
    } finally {
      setRevoking(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-bold font-poppins flex items-center gap-3">
            <Users className="text-profee-blue flex-shrink-0" size={22} />
            Professional Access
          </h3>
          <p className="text-xs text-slate-400 mt-2 ml-9 font-poppins max-w-sm leading-relaxed">
            Grant your tax consultant or accountant read-only access to your GST reports.
            Up to {MAX_PROS} professionals can be assigned.
          </p>
        </div>
        <span
          className={`flex-shrink-0 text-xs font-bold font-poppins px-3 py-1.5 rounded-full whitespace-nowrap ${
            activeCount >= MAX_PROS
              ? 'bg-rose-100 text-rose-600'
              : 'bg-indigo-50 text-profee-blue'
          }`}
        >
          {activeCount} of {MAX_PROS} assigned
        </span>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`flex items-center gap-3 p-4 rounded-2xl text-sm font-medium font-poppins ${
            toast.ok
              ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
              : 'bg-rose-50 border border-rose-100 text-rose-600'
          }`}
        >
          {toast.ok ? (
            <CheckCircle2 size={16} className="flex-shrink-0" />
          ) : (
            <AlertCircle size={16} className="flex-shrink-0" />
          )}
          {toast.msg}
        </div>
      )}

      {/* ── Invite Form ── */}
      <form onSubmit={handleInvite} noValidate className="space-y-5">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Invite a Professional
        </p>

        {formError && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-2xl text-xs text-rose-600 font-medium font-poppins">
            <AlertCircle size={13} className="flex-shrink-0" />
            {formError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* First Name */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 font-poppins">
              First Name *
            </label>
            <input
              type="text"
              placeholder="Rahul"
              value={form.firstName}
              onChange={(e) => setField('firstName', e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-700 font-poppins focus:ring-2 ring-indigo-50 placeholder:text-slate-300 outline-none"
            />
          </div>

          {/* Last Name */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 font-poppins">
              Last Name *
            </label>
            <input
              type="text"
              placeholder="Sharma"
              value={form.lastName}
              onChange={(e) => setField('lastName', e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-700 font-poppins focus:ring-2 ring-indigo-50 placeholder:text-slate-300 outline-none"
            />
          </div>

          {/* Designation */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 font-poppins">
              Designation *
            </label>
            <select
              value={form.designation}
              onChange={(e) => setField('designation', e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-700 font-poppins focus:ring-2 ring-indigo-50 appearance-none cursor-pointer outline-none"
            >
              <option value="">Select designation…</option>
              {DESIGNATIONS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 font-poppins">
              Email Address *
            </label>
            <input
              type="email"
              placeholder="consultant@firm.com"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 text-sm font-medium text-slate-700 font-poppins focus:ring-2 ring-indigo-50 placeholder:text-slate-300 outline-none"
            />
          </div>

          {/* Access Level — full width, card-style picker */}
          <div className="md:col-span-2 space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 font-poppins">
              Access Level *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ACCESS_LEVELS.map((level) => {
                const active = form.accessLevel === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setField('accessLevel', level.value)}
                    className={`flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                      active
                        ? 'border-profee-blue bg-indigo-50'
                        : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                    }`}
                  >
                    <div
                      className={`mt-0.5 w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        active ? 'border-profee-blue bg-profee-blue' : 'border-slate-300'
                      }`}
                    >
                      {active && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className={`text-sm font-bold font-poppins ${active ? 'text-profee-blue' : 'text-slate-700'}`}>
                        {level.value}
                      </p>
                      <p className="text-[10px] text-slate-400 font-poppins mt-0.5">{level.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={inviting || activeCount >= MAX_PROS}
            className="flex items-center gap-2.5 bg-profee-blue text-white px-8 py-3.5 rounded-2xl text-sm font-bold font-poppins shadow-lg shadow-indigo-100 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
          >
            {inviting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
            {inviting ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </form>

      {/* ── Divider ── */}
      <div className="border-t border-slate-50" />

      {/* ── Assigned professionals table ── */}
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5">
          Assigned Professionals
        </p>

        {assigned.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-3xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
              <Users size={28} className="text-slate-300" />
            </div>
            <p className="text-sm font-bold font-poppins text-slate-400">No professionals assigned yet</p>
            <p className="text-xs text-slate-300 font-poppins mt-1">
              Use the form above to invite a consultant or accountant.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full text-sm font-poppins">
              <thead>
                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <th className="text-left px-5 py-3.5">Name</th>
                  <th className="text-left px-5 py-3.5 hidden sm:table-cell">Designation</th>
                  <th className="text-left px-5 py-3.5 hidden md:table-cell">Email</th>
                  <th className="text-left px-5 py-3.5 hidden lg:table-cell">Access Level</th>
                  <th className="text-center px-5 py-3.5">Status</th>
                  <th className="text-center px-5 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {assigned.map((pro) => (
                  <tr key={pro.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-800 text-sm leading-tight">
                        {pro.firstName} {pro.lastName}
                      </p>
                      {/* Show email on small screens */}
                      <p className="text-[10px] text-slate-400 mt-0.5 md:hidden">{pro.email}</p>
                    </td>
                    <td className="px-5 py-4 hidden sm:table-cell">
                      <span className="text-xs text-slate-500 font-medium">{pro.designation}</span>
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className="text-xs text-slate-400">{pro.email}</span>
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      <span className="text-xs text-slate-500 font-medium">
                        {pro.accessLevel || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <StatusBadge status={pro.status} />
                    </td>
                    <td className="px-5 py-4 text-center">
                      {pro.status === 'active' && (
                        <button
                          onClick={() => handleRevoke(pro)}
                          disabled={revoking === pro.id}
                          title="Revoke access"
                          className="flex items-center gap-1.5 text-xs font-bold text-rose-500 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-xl transition-all disabled:opacity-50 mx-auto"
                        >
                          {revoking === pro.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <ShieldOff size={13} />
                          )}
                          Revoke
                        </button>
                      )}
                      {pro.status === 'pending' && (
                        <button
                          onClick={() => handleRevoke(pro)}
                          disabled={revoking === pro.id}
                          title="Cancel invite"
                          className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-rose-500 hover:bg-rose-50 px-3 py-1.5 rounded-xl transition-all disabled:opacity-50 mx-auto"
                        >
                          {revoking === pro.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <ShieldOff size={13} />
                          )}
                          Cancel
                        </button>
                      )}
                      {pro.status === 'revoked' && (
                        <span className="text-xs text-slate-300 font-medium">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfessionalAccess;
