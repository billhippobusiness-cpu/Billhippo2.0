/**
 * PendingAssignmentsSection — inline, robust Accept/Decline UI.
 *
 * Replaces the Framer-Motion-animated banner/popup approach.
 * Key fixes over the previous implementation:
 *
 * 1. No Framer Motion height animation — pure React state, no clip/overflow tricks.
 * 2. Race-condition fix — Firestore's onSnapshot removes an invite from the list
 *    the moment it's accepted/declined (status → non-pending).  We hold a ref of
 *    every invite we've ever seen (seenRef) and keep accepted/declined cards
 *    visible for 2–2.5 s via a local "states" map before moving them to "dismissed".
 * 3. Clear, large buttons — h-11 emerald / slate, full error text visible.
 * 4. Proper error surfacing — Firestore errors are caught and shown inline.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  Building2,
  Briefcase,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import {
  subscribePendingInvitesByEmail,
  acceptPendingInvite,
  declinePendingInvite,
} from '../../lib/firestore';
import type { ProfessionalInvite, ProfessionalProfile } from '../../types';

type CardAction = 'idle' | 'accepting' | 'declining' | 'accepted' | 'declined' | 'error';

interface CardState {
  action: CardAction;
  error?: string;
}

interface Props {
  profile: ProfessionalProfile;
}

const PendingAssignmentsSection: React.FC<Props> = ({ profile }) => {
  // Current pending invites from Firestore (status==='pending', not expired)
  const [invites, setInvites] = useState<ProfessionalInvite[]>([]);

  // Per-card UI state: action in progress / result / error
  const [states, setStates] = useState<Record<string, CardState>>({});

  // Invites removed from the visible list after the success timeout
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Snapshot of every invite we've ever received — so we can still render
  // the success/decline card after Firestore removes it from the subscription.
  const seenRef = useRef<Record<string, ProfessionalInvite>>({});

  useEffect(() => {
    if (!profile?.email) return;
    return subscribePendingInvitesByEmail(profile.email, (list) => {
      list.forEach((inv) => {
        seenRef.current[inv.id] = inv;
      });
      setInvites(list);
    });
  }, [profile.email]);

  // Build the visible set:
  //  - All IDs currently pending in Firestore (not yet dismissed)
  //  - Plus any IDs that are locally accepted/declined (not yet dismissed)
  //    — these may have already left the Firestore subscription
  const allIds = new Set([
    ...invites.map((inv) => inv.id),
    ...Object.entries(states)
      .filter(([, s]) => s.action === 'accepted' || s.action === 'declined')
      .map(([id]) => id),
  ]);

  const visible = [...allIds]
    .filter((id) => !dismissed.has(id))
    .map((id) => seenRef.current[id])
    .filter((inv): inv is ProfessionalInvite => Boolean(inv));

  if (visible.length === 0) return null;

  const getAction = (id: string): CardAction => states[id]?.action ?? 'idle';
  const getError  = (id: string): string | undefined => states[id]?.error;

  const handleAccept = async (invite: ProfessionalInvite) => {
    setStates((prev) => ({ ...prev, [invite.id]: { action: 'accepting' } }));
    try {
      await acceptPendingInvite(invite, profile.uid, profile.professionalId);
      setStates((prev) => ({ ...prev, [invite.id]: { action: 'accepted' } }));
      setTimeout(
        () => setDismissed((prev) => new Set([...prev, invite.id])),
        2500,
      );
    } catch (err: unknown) {
      const msg =
        (err as { code?: string })?.code === 'permission-denied'
          ? 'Permission denied — check your account or contact support.'
          : 'Failed to accept. Please try again.';
      setStates((prev) => ({ ...prev, [invite.id]: { action: 'error', error: msg } }));
    }
  };

  const handleDecline = async (invite: ProfessionalInvite) => {
    setStates((prev) => ({ ...prev, [invite.id]: { action: 'declining' } }));
    try {
      await declinePendingInvite(invite);
      setStates((prev) => ({ ...prev, [invite.id]: { action: 'declined' } }));
      setTimeout(
        () => setDismissed((prev) => new Set([...prev, invite.id])),
        2000,
      );
    } catch (err: unknown) {
      const msg =
        (err as { code?: string })?.code === 'permission-denied'
          ? 'Permission denied — check your account or contact support.'
          : 'Failed to decline. Please try again.';
      setStates((prev) => ({ ...prev, [invite.id]: { action: 'error', error: msg } }));
    }
  };

  return (
    <div className="mb-6">
      {/* ── Section header ── */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="relative">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <Bell size={14} className="text-amber-600" />
          </div>
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
            {visible.length}
          </span>
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800 font-poppins">
            Pending Assignment{visible.length > 1 ? 's' : ''}
          </p>
          <p className="text-xs text-slate-400 font-poppins">
            {visible.length} business client{visible.length > 1 ? 's have' : ' has'} assigned
            you — review to accept or decline
          </p>
        </div>
      </div>

      {/* ── Invite cards ── */}
      <div className="space-y-4">
        {visible.map((invite) => {
          const action = getAction(invite.id);
          const error  = getError(invite.id);
          const isActing = action === 'accepting' || action === 'declining';

          /* ── Success: accepted ── */
          if (action === 'accepted') {
            return (
              <div
                key={invite.id}
                className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl"
              >
                <CheckCircle2 size={22} className="text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-emerald-700 font-poppins">
                    Assignment Accepted
                  </p>
                  <p className="text-xs text-emerald-600 font-poppins mt-0.5">
                    You now have <strong>{invite.accessLevel}</strong> access to{' '}
                    <strong>{invite.businessName}</strong>.
                  </p>
                </div>
              </div>
            );
          }

          /* ── Success: declined ── */
          if (action === 'declined') {
            return (
              <div
                key={invite.id}
                className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl"
              >
                <XCircle size={22} className="text-slate-400 flex-shrink-0" />
                <p className="text-sm font-medium text-slate-500 font-poppins">
                  Assignment from <strong>{invite.businessName}</strong> declined.
                </p>
              </div>
            );
          }

          /* ── Active card ── */
          const expiryDate = new Date(invite.expiresAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });

          return (
            <div
              key={invite.id}
              className="bg-white border border-amber-200 rounded-2xl p-5 shadow-sm"
            >
              {/* Business info */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Building2 size={18} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 font-poppins truncate">
                    {invite.businessName}
                  </p>
                  <p className="text-xs text-slate-500 font-poppins mt-0.5">
                    Assigned to: {invite.professionalFirstName} {invite.professionalLastName}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold font-poppins uppercase tracking-wide px-2 py-0.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-full">
                      <Briefcase size={9} />
                      {invite.designation}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold font-poppins uppercase tracking-wide px-2 py-0.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-full">
                      <ShieldCheck size={9} />
                      {invite.accessLevel}
                    </span>
                    <span className="text-[10px] text-slate-400 font-poppins self-center">
                      Expires {expiryDate}
                    </span>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <p className="text-xs text-rose-500 font-poppins mb-3 px-1">{error}</p>
              )}

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleAccept(invite)}
                  disabled={isActing}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-600 text-white text-sm font-bold font-poppins shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {action === 'accepting' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                  {action === 'accepting' ? 'Accepting…' : 'Accept Assignment'}
                </button>

                <button
                  type="button"
                  onClick={() => handleDecline(invite)}
                  disabled={isActing}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border-2 border-slate-200 text-slate-600 text-sm font-bold font-poppins hover:bg-slate-50 hover:border-slate-300 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {action === 'declining' ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <XCircle size={16} />
                  )}
                  {action === 'declining' ? 'Declining…' : 'Decline'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PendingAssignmentsSection;
