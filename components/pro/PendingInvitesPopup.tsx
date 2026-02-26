/**
 * PendingInvitesPopup — floating notification popup for pending professional assignments.
 *
 * Rendered inside ProLayout so it is visible from every view in the Pro Portal.
 * Auto-expands when pending invites first arrive; can be minimised to a pill badge.
 *
 * Accepts/Declines assignments in place — once a card is handled it animates out
 * and the underlying Firestore onSnapshot removes it from the list automatically.
 */
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
} from 'lucide-react';
import {
  subscribePendingInvitesByEmail,
  acceptPendingInvite,
  declinePendingInvite,
} from '../../lib/firestore';
import type { ProfessionalInvite, ProfessionalProfile } from '../../types';

// ── Invite Card ───────────────────────────────────────────────────────────────

const InviteCard: React.FC<{
  invite: ProfessionalInvite;
  profile: ProfessionalProfile;
  onDismiss: () => void;
}> = ({ invite, profile, onDismiss }) => {
  const [actionState, setActionState] = useState<'idle' | 'accepting' | 'declining'>('idle');
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
        className="flex items-center gap-2.5 p-3 bg-emerald-50 border border-emerald-100 rounded-xl"
      >
        <CheckCircle2 size={15} className="text-emerald-600 flex-shrink-0" />
        <div>
          <p className="text-xs font-bold font-poppins text-emerald-700">Invite Accepted</p>
          <p className="text-[10px] text-emerald-600 font-poppins mt-0.5">
            You now have <strong>{invite.accessLevel}</strong> access to{' '}
            <strong>{invite.businessName}</strong>.
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
        className="flex items-center gap-2.5 p-3 bg-slate-50 border border-slate-100 rounded-xl"
      >
        <XCircle size={15} className="text-slate-400 flex-shrink-0" />
        <p className="text-xs font-medium font-poppins text-slate-500">
          Invite from <strong>{invite.businessName}</strong> declined.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-3 space-y-2.5">
      {/* Business info */}
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Building2 size={14} className="text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold font-poppins text-slate-800 truncate">
            {invite.businessName}
          </p>
          <p className="text-[9px] text-slate-500 font-poppins mt-0.5">
            Assigned to: {invite.professionalFirstName} {invite.professionalLastName}
          </p>
        </div>
      </div>

      {/* Detail pills */}
      <div className="flex flex-wrap gap-1.5">
        <span className="inline-flex items-center gap-1 text-[9px] font-bold font-poppins uppercase tracking-wide px-2 py-0.5 bg-white border border-amber-100 text-amber-700 rounded-full">
          <Briefcase size={8} />
          {invite.designation}
        </span>
        <span className="inline-flex items-center gap-1 text-[9px] font-bold font-poppins uppercase tracking-wide px-2 py-0.5 bg-white border border-amber-100 text-amber-700 rounded-full">
          <ShieldCheck size={8} />
          {invite.accessLevel}
        </span>
        <span className="text-[9px] text-slate-400 font-poppins self-center ml-auto">
          Expires {expiryDate}
        </span>
      </div>

      {/* Error */}
      {error && <p className="text-[10px] text-rose-500 font-poppins">{error}</p>}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleAccept}
          disabled={actionState !== 'idle'}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-emerald-600 text-white text-[10px] font-bold font-poppins hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {actionState === 'accepting' ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <CheckCircle2 size={11} />
          )}
          {actionState === 'accepting' ? 'Accepting…' : 'Accept'}
        </button>
        <button
          onClick={handleDecline}
          disabled={actionState !== 'idle'}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border border-slate-200 text-slate-500 text-[10px] font-bold font-poppins hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {actionState === 'declining' ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <XCircle size={11} />
          )}
          {actionState === 'declining' ? 'Declining…' : 'Decline'}
        </button>
      </div>
    </div>
  );
};

// ── Main Popup ────────────────────────────────────────────────────────────────

interface PendingInvitesPopupProps {
  profile: ProfessionalProfile | null;
}

const PendingInvitesPopup: React.FC<PendingInvitesPopupProps> = ({ profile }) => {
  const [invites, setInvites] = useState<ProfessionalInvite[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [autoOpened, setAutoOpened] = useState(false);

  // Subscribe to pending invites for this professional's email
  useEffect(() => {
    if (!profile?.email) return;
    return subscribePendingInvitesByEmail(profile.email, setInvites);
  }, [profile?.email]);

  const visible = invites.filter((inv) => !dismissed.has(inv.id));

  // Auto-expand when invites first appear (on login or new assignment)
  useEffect(() => {
    if (visible.length > 0 && !autoOpened) {
      setExpanded(true);
      setAutoOpened(true);
    }
  }, [visible.length, autoOpened]);

  if (visible.length === 0) return null;

  const dismiss = (id: string) =>
    setDismissed((prev) => new Set([...prev, id]));

  return (
    <div className="fixed bottom-6 right-6 z-50 w-full max-w-[340px]">
      <AnimatePresence mode="wait">
        {expanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="bg-white rounded-2xl shadow-2xl shadow-amber-100/60 border border-amber-200 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Bell size={15} className="text-amber-600" />
                  </div>
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                    {visible.length}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold font-poppins text-slate-800">
                    Pending Assignment{visible.length > 1 ? 's' : ''}
                  </p>
                  <p className="text-[9px] text-slate-400 font-poppins mt-0.5">
                    Review to accept or decline
                  </p>
                </div>
              </div>
              <button
                onClick={() => setExpanded(false)}
                title="Minimise"
                className="w-7 h-7 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ChevronDown size={14} />
              </button>
            </div>

            {/* Invite cards */}
            <div className="p-4 space-y-3 max-h-[55vh] overflow-y-auto">
              <AnimatePresence>
                {visible.map((invite) => (
                  <motion.div
                    key={invite.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.18 }}
                  >
                    <InviteCard
                      invite={invite}
                      profile={profile!}
                      onDismiss={() => dismiss(invite.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : (
          /* Minimised pill — click to re-open */
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.2 }}
            onClick={() => setExpanded(true)}
            className="ml-auto flex items-center gap-2.5 px-4 py-3 bg-white rounded-2xl shadow-xl shadow-amber-100/50 border border-amber-200 hover:bg-amber-50 transition-colors"
          >
            <div className="relative">
              <Bell size={16} className="text-amber-600" />
              <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                {visible.length}
              </span>
            </div>
            <span className="text-xs font-bold font-poppins text-slate-700">
              {visible.length} Pending Assignment{visible.length > 1 ? 's' : ''}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PendingInvitesPopup;
