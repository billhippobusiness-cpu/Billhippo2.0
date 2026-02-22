import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  XCircle,
  Clock,
  ShieldAlert,
  LogIn,
  UserCheck,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { ProfessionalInvite } from '../../types';

const BILLHIPPO_LOGO =
  'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

type InviteState =
  | { phase: 'loading' }
  | { phase: 'invalid' }
  | { phase: 'expired'; invite: ProfessionalInvite }
  | { phase: 'already_processed'; invite: ProfessionalInvite }
  | { phase: 'not_logged_in'; invite: ProfessionalInvite }
  | { phase: 'ready'; invite: ProfessionalInvite }
  | { phase: 'accepted'; invite: ProfessionalInvite }
  | { phase: 'declined'; invite: ProfessionalInvite }
  | { phase: 'acting' };

interface InviteAcceptProps {
  token: string;
  onGoToSignIn: (redirectHash: string) => void;
}

const InviteAccept: React.FC<InviteAcceptProps> = ({ token, onGoToSignIn }) => {
  const { user, role, professionalProfile } = useAuth();
  const [state, setState] = useState<InviteState>({ phase: 'loading' });
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Load invite on mount ────────────────────────────────────────────────
  useEffect(() => {
    if (!token) {
      setState({ phase: 'invalid' });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'invites', token));
        if (cancelled) return;

        if (!snap.exists()) {
          setState({ phase: 'invalid' });
          return;
        }

        const invite = { id: snap.id, ...snap.data() } as ProfessionalInvite;

        // Expired?
        if (new Date(invite.expiresAt) < new Date()) {
          setState({ phase: 'expired', invite });
          return;
        }

        // Already processed?
        if (invite.status !== 'pending') {
          setState({ phase: 'already_processed', invite });
          return;
        }

        // Not logged in?
        if (!user) {
          setState({ phase: 'not_logged_in', invite });
          return;
        }

        // Must be logged in as a professional
        if (role !== 'professional' && role !== 'both') {
          setState({ phase: 'not_logged_in', invite });
          return;
        }

        setState({ phase: 'ready', invite });
      } catch {
        if (!cancelled) setState({ phase: 'invalid' });
      }
    })();

    return () => { cancelled = true; };
  }, [token, user, role]);

  // ── Accept ──────────────────────────────────────────────────────────────
  const handleAccept = async () => {
    if (state.phase !== 'ready') return;
    const { invite } = state;
    setState({ phase: 'acting' });
    setActionError(null);

    try {
      const now = new Date().toISOString();
      const proUid = user!.uid;
      const proId = professionalProfile?.professionalId ?? '';

      await Promise.all([
        // 1. Update invites/{token}
        updateDoc(doc(db, 'invites', token), {
          status: 'accepted',
          acceptedAt: now,
          professionalUid: proUid,
          professionalId: proId,
        }),
        // 2. Update users/{businessUid}/assignedProfessionals/{token}
        updateDoc(
          doc(db, 'users', invite.businessUserUid, 'assignedProfessionals', token),
          {
            status: 'active',
            linkedAt: now,
            professionalId: proId,
          },
        ),
        // 3. Add businessUserUid to professionals/{proUid}/linkedClients
        updateDoc(doc(db, 'professionals', proUid), {
          linkedClients: arrayUnion(invite.businessUserUid),
        }),
      ]);

      setState({ phase: 'accepted', invite });
    } catch (err: any) {
      setActionError('Failed to accept invite. Please try again.');
      setState({ phase: 'ready', invite: (state as any).invite });
    }
  };

  // ── Decline ─────────────────────────────────────────────────────────────
  const handleDecline = async () => {
    if (state.phase !== 'ready') return;
    const { invite } = state;
    setState({ phase: 'acting' });
    setActionError(null);

    try {
      const now = new Date().toISOString();

      await Promise.all([
        updateDoc(doc(db, 'invites', token), {
          status: 'declined',
          declinedAt: now,
        }),
        updateDoc(
          doc(db, 'users', invite.businessUserUid, 'assignedProfessionals', token),
          { status: 'revoked' },
        ),
      ]);

      setState({ phase: 'declined', invite });
    } catch {
      setActionError('Failed to decline invite. Please try again.');
      setState({ phase: 'ready', invite: (state as any).invite });
    }
  };

  // ── Navigate to sign in (Professional tab) with redirect back ───────────
  const goToSignIn = () => {
    onGoToSignIn(`#/invite/${token}`);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-3xl shadow-xl border border-slate-100 p-10 max-w-md w-full text-center"
      >
        <img
          src={BILLHIPPO_LOGO}
          alt="BillHippo"
          className="h-12 w-auto object-contain mx-auto mb-6"
        />
        {children}
      </motion.div>
    </div>
  );

  // Loading
  if (state.phase === 'loading' || state.phase === 'acting') {
    return (
      <Shell>
        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
        <p className="text-sm text-slate-500 font-poppins">
          {state.phase === 'acting' ? 'Processing…' : 'Verifying invite link…'}
        </p>
      </Shell>
    );
  }

  // Invalid token
  if (state.phase === 'invalid') {
    return (
      <Shell>
        <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-8 h-8 text-rose-500" />
        </div>
        <h2 className="text-xl font-bold font-poppins text-slate-900 mb-2">Invalid Invite Link</h2>
        <p className="text-sm text-slate-500 font-poppins mb-6">
          This invite link is invalid or does not exist. Please check the link in your email and try again.
        </p>
        <button
          onClick={() => { window.location.hash = ''; }}
          className="text-sm text-emerald-600 font-bold font-poppins hover:underline"
        >
          Go to Home
        </button>
      </Shell>
    );
  }

  // Expired
  if (state.phase === 'expired') {
    return (
      <Shell>
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold font-poppins text-slate-900 mb-2">Invite Expired</h2>
        <p className="text-sm text-slate-500 font-poppins mb-2">
          This invite from <strong>{state.invite.businessName}</strong> has expired.
        </p>
        <p className="text-xs text-slate-400 font-poppins mb-6">
          Invite links are valid for 7 days. Ask the business owner to send a new invite.
        </p>
        <button
          onClick={() => { window.location.hash = ''; }}
          className="text-sm text-emerald-600 font-bold font-poppins hover:underline"
        >
          Go to Home
        </button>
      </Shell>
    );
  }

  // Already processed
  if (state.phase === 'already_processed') {
    const { invite } = state;
    const isAccepted = invite.status === 'accepted';
    const isDeclined = invite.status === 'declined';
    return (
      <Shell>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${isAccepted ? 'bg-emerald-100' : 'bg-slate-100'}`}>
          {isAccepted
            ? <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            : <ShieldAlert className="w-8 h-8 text-slate-400" />}
        </div>
        <h2 className="text-xl font-bold font-poppins text-slate-900 mb-2">
          {isAccepted ? 'Already Accepted' : isDeclined ? 'Invite Declined' : 'Invite Already Used'}
        </h2>
        <p className="text-sm text-slate-500 font-poppins mb-6">
          {isAccepted
            ? `You have already accepted the invite from ${invite.businessName}.`
            : isDeclined
            ? `You previously declined the invite from ${invite.businessName}.`
            : `This invite has already been processed (status: ${invite.status}).`}
        </p>
        <button
          onClick={() => { window.location.hash = ''; }}
          className="text-sm text-emerald-600 font-bold font-poppins hover:underline"
        >
          Go to Home
        </button>
      </Shell>
    );
  }

  // Not logged in (or not a professional)
  if (state.phase === 'not_logged_in') {
    const { invite } = state;
    return (
      <Shell>
        <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-4">
          <LogIn className="w-8 h-8 text-indigo-500" />
        </div>
        <h2 className="text-xl font-bold font-poppins text-slate-900 mb-2">Sign In to Accept</h2>

        {/* Invite summary card */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 mb-5 text-left">
          <p className="text-[10px] font-bold font-poppins text-emerald-600 uppercase tracking-widest mb-2">
            Invite Details
          </p>
          <p className="text-sm font-semibold font-poppins text-slate-800">{invite.businessName}</p>
          <p className="text-xs text-slate-500 font-poppins mt-0.5">
            {invite.professionalFirstName} {invite.professionalLastName} &bull; {invite.designation}
          </p>
          <p className="text-xs text-slate-400 font-poppins mt-1">
            Access: <span className="text-slate-600 font-medium">{invite.accessLevel}</span>
          </p>
        </div>

        <p className="text-xs text-slate-400 font-poppins mb-6">
          Sign in with your Professional account to accept or decline this invite.
          Don't have an account?{' '}
          <button
            onClick={() => {
              window.location.hash = `/pro-register?inviteToken=${token}`;
            }}
            className="text-emerald-600 font-bold hover:underline"
          >
            Register as a Professional
          </button>
        </p>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={goToSignIn}
          className="w-full h-12 rounded-2xl bg-emerald-600 text-white text-sm font-bold font-poppins flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
          style={{ transition: 'none' }}
        >
          Sign In to Professional Portal
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </Shell>
    );
  }

  // Accepted
  if (state.phase === 'accepted') {
    const { invite } = state;
    return (
      <Shell>
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold font-poppins text-slate-900 mb-2">
          Invite Accepted!
        </h2>
        <p className="text-sm text-slate-500 font-poppins mb-5">
          You now have <strong>{invite.accessLevel}</strong> access to{' '}
          <strong>{invite.businessName}</strong>'s GST data.
        </p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => { window.location.hash = ''; }}
          className="w-full h-12 rounded-2xl bg-emerald-600 text-white text-sm font-bold font-poppins flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
          style={{ transition: 'none' }}
        >
          Go to Professional Dashboard
          <ArrowRight className="w-4 h-4" />
        </motion.button>
      </Shell>
    );
  }

  // Declined
  if (state.phase === 'declined') {
    return (
      <Shell>
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-xl font-bold font-poppins text-slate-900 mb-2">Invite Declined</h2>
        <p className="text-sm text-slate-500 font-poppins mb-6">
          You have declined the invite from <strong>{state.invite.businessName}</strong>.
        </p>
        <button
          onClick={() => { window.location.hash = ''; }}
          className="text-sm text-emerald-600 font-bold font-poppins hover:underline"
        >
          Go to Dashboard
        </button>
      </Shell>
    );
  }

  // Ready — show accept / decline
  const { invite } = state;
  return (
    <Shell>
      <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
        <UserCheck className="w-8 h-8 text-emerald-600" />
      </div>
      <h2 className="text-xl font-bold font-poppins text-slate-900 mb-1">
        Professional Invite
      </h2>
      <p className="text-xs text-slate-400 font-poppins mb-5">
        You have been invited to access GST data
      </p>

      {/* Invite card */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-2 text-left">
        <p className="text-[10px] font-bold font-poppins text-emerald-600 uppercase tracking-widest mb-3">
          Invite from
        </p>
        <p className="text-base font-bold font-poppins text-slate-800">{invite.businessName}</p>
        <p className="text-xs text-slate-500 font-poppins mt-1">
          Sent to: {invite.professionalFirstName} {invite.professionalLastName}
        </p>
        <div className="mt-3 pt-3 border-t border-emerald-100 grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-slate-400 font-poppins">Designation</p>
            <p className="text-slate-700 font-semibold font-poppins mt-0.5">{invite.designation}</p>
          </div>
          <div>
            <p className="text-slate-400 font-poppins">Access Level</p>
            <p className="text-slate-700 font-semibold font-poppins mt-0.5">{invite.accessLevel}</p>
          </div>
        </div>
      </div>

      {/* Expires notice */}
      <p className="text-[10px] text-slate-400 font-poppins mb-5">
        Expires {new Date(invite.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      {/* Action error */}
      {actionError && (
        <p className="text-xs text-rose-500 font-poppins mb-3">{actionError}</p>
      )}

      {/* Accept */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleAccept}
        className="w-full h-12 rounded-2xl bg-emerald-600 text-white text-sm font-bold font-poppins flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 mb-3"
        style={{ transition: 'none' }}
      >
        <CheckCircle2 className="w-4 h-4" />
        Accept Invite
      </motion.button>

      {/* Decline */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleDecline}
        className="w-full h-12 rounded-2xl border border-slate-200 text-slate-500 text-sm font-bold font-poppins hover:bg-slate-50"
        style={{ transition: 'background-color 0.2s' }}
      >
        Decline
      </motion.button>
    </Shell>
  );
};

export default InviteAccept;
