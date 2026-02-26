import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  CheckCircle2,
  XCircle,
  Building2,
  Briefcase,
  ShieldCheck,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  subscribePendingInvitesByEmail,
  acceptPendingInvite,
  declinePendingInvite,
} from '../../lib/firestore';
import type { ProfessionalInvite, ProfessionalProfile } from '../../types';

interface PendingInvitesBannerProps {
  profile: ProfessionalProfile;
}

type ActionState = 'idle' | 'accepting' | 'declining';

const InviteCard: React.FC<{
  invite: ProfessionalInvite;
  profile: ProfessionalProfile;
  onDismiss: () => void;
}> = ({ invite, profile, onDismiss }) => {
  const [actionState, setActionState] = useState<ActionState>('idle');
  const [result, setResult] = useState<'accepted' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setActionState('accepting');
    setError(null);
    try {
      await acceptPendingInvite(invite, profile.uid, profile.professionalId);
      setResult('accepted');
      setTimeout(onDismiss, 2500);
    } catch {
      setError('Failed to accept. Please try again.');
      setActionState('idle');
    }
  };

  const handleDecline = async () => {
    setActionState('declining');
    setError(null);
    try {
      await declinePendingInvite(invite);
      setResult('declined');
      setTimeout(onDismiss, 2000);
    } catch {
      setError('Failed to decline. Please try again.');
      setActionState('idle');
    }
  };

  const expiryDate = new Date(invite.expiresAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  if (result === 'accepted') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl"
      >
        <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-bold font-poppins text-emerald-700">
            Invite Accepted
          </p>
          <p className="text-xs text-emerald-600 font-poppins mt-0.5">
            You now have <strong>{invite.accessLevel}</strong> access to{' '}
            <strong>{invite.businessName}</strong>'s GST data.
          </p>
        </div>
      </motion.div>
    );
  }

  if (result === 'declined') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-2xl"
      >
        <XCircle size={18} className="text-slate-400 flex-shrink-0" />
        <p className="text-sm font-medium font-poppins text-slate-500">
          Invite from <strong>{invite.businessName}</strong> declined.
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      className="border border-amber-200 bg-amber-50/60 rounded-2xl p-4 space-y-3"
    >
      {/* Business info */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Building2 size={16} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold font-poppins text-slate-800 truncate">
            {invite.businessName}
          </p>
          <p className="text-[10px] text-slate-500 font-poppins mt-0.5">
            Assigned to: {invite.professionalFirstName} {invite.professionalLastName}
          </p>
        </div>
      </div>

      {/* Details pills */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-poppins uppercase tracking-wide px-2.5 py-1 bg-white border border-amber-100 text-amber-700 rounded-full">
          <Briefcase size={10} />
          {invite.designation}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold font-poppins uppercase tracking-wide px-2.5 py-1 bg-white border border-amber-100 text-amber-700 rounded-full">
          <ShieldCheck size={10} />
          {invite.accessLevel}
        </span>
        <span className="text-[10px] text-slate-400 font-poppins self-center ml-auto">
          Expires {expiryDate}
        </span>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-rose-500 font-poppins">{error}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleAccept}
          disabled={actionState !== 'idle'}
          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl bg-emerald-600 text-white text-xs font-bold font-poppins shadow-sm shadow-emerald-100 hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {actionState === 'accepting' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <CheckCircle2 size={13} />
          )}
          {actionState === 'accepting' ? 'Accepting…' : 'Accept'}
        </button>
        <button
          onClick={handleDecline}
          disabled={actionState !== 'idle'}
          className="flex-1 flex items-center justify-center gap-2 h-9 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold font-poppins hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {actionState === 'declining' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <XCircle size={13} />
          )}
          {actionState === 'declining' ? 'Declining…' : 'Decline'}
        </button>
      </div>
    </motion.div>
  );
};

// ── Main banner ───────────────────────────────────────────────────────────────

const PendingInvitesBanner: React.FC<PendingInvitesBannerProps> = ({ profile }) => {
  const [invites, setInvites] = useState<ProfessionalInvite[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!profile?.email) return;
    const unsub = subscribePendingInvitesByEmail(profile.email, setInvites);
    return unsub;
  }, [profile?.email]);

  const visible = invites.filter((inv) => !dismissed.has(inv.id));

  if (visible.length === 0) return null;

  const dismiss = (id: string) =>
    setDismissed((prev) => new Set([...prev, id]));

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white border border-amber-200 rounded-[1.75rem] p-6 shadow-sm shadow-amber-50"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 mb-1"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <Bell size={16} className="text-amber-600" />
            </div>
            {visible.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                {visible.length}
              </span>
            )}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold font-poppins text-slate-800">
              Pending Assignment{visible.length > 1 ? 's' : ''}
            </p>
            <p className="text-[10px] text-slate-400 font-poppins mt-0.5">
              {visible.length} business client{visible.length > 1 ? 's have' : ' has'} assigned you — review to accept or decline
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp size={16} className="text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronDown size={16} className="text-slate-400 flex-shrink-0" />
        )}
      </button>

      {/* Invite cards */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            key="cards"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="space-y-3 mt-4"
          >
            {visible.map((invite) => (
              <InviteCard
                key={invite.id}
                invite={invite}
                profile={profile}
                onDismiss={() => dismiss(invite.id)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PendingInvitesBanner;
