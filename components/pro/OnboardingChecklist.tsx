/**
 * OnboardingChecklist — first-run guide shown at the top of the Pro Dashboard.
 *
 * Visibility rules:
 *   • Hidden permanently once professionals/{uid}.onboardingComplete = true
 *   • Hidden permanently once professionals/{uid}.onboardingDismissed = true
 *   • Hidden until both the onSnapshot and the one-time Firestore reads resolve
 *
 * Completion tracking:
 *   Item 1 — firmName set in professionals/{uid}        (real-time via onSnapshot)
 *   Item 2 — linkedClients.length > 0                  (real-time via onSnapshot)
 *   Item 3 — activityLog subcollection has ≥ 1 doc     (getDocs on mount)
 *   Item 4 — referrals collection has ≥ 1 doc for pro  (getDocs on mount)
 *
 * When all 4 items are done the component auto-writes onboardingComplete=true
 * and removes itself from the UI.
 */
import React, { useState, useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import {
  doc,
  onSnapshot,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ProfessionalProfile } from '../../types';
import type { ProView } from './ProLayout';

// ── Types ──────────────────────────────────────────────────────────────────

interface OnboardingChecklistProps {
  profile: ProfessionalProfile | null;
  onNavigate: (view: ProView) => void;
}

/** Slice of the professionals/{uid} document we care about here. */
interface LiveProState {
  firmName: string | null;
  linkedClients: string[];
  onboardingDismissed: boolean;
  onboardingComplete: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  profile,
  onNavigate,
}) => {
  const uid     = profile?.uid ?? '';
  const refCode = profile?.referralCode ?? profile?.professionalId ?? '';

  // Real-time from professionals/{uid}
  const [liveState,    setLiveState]    = useState<LiveProState | null>(null);

  // One-time reads
  const [hasActivityLog, setHasActivityLog] = useState(false);
  const [hasReferral,    setHasReferral]    = useState(false);
  const [extraLoaded,    setExtraLoaded]    = useState(false);

  const [dismissing, setDismissing] = useState(false);

  // ── Real-time listener ─────────────────────────────────────────────────
  useEffect(() => {
    if (!uid) return;

    const unsub = onSnapshot(
      doc(db, 'professionals', uid),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        setLiveState({
          firmName:             d.firmName             ?? null,
          linkedClients:        d.linkedClients        ?? [],
          onboardingDismissed:  d.onboardingDismissed  ?? false,
          onboardingComplete:   d.onboardingComplete   ?? false,
        });
      },
      (err) => console.error('[OnboardingChecklist] onSnapshot error:', err),
    );

    return unsub;
  }, [uid]);

  // ── One-time reads on mount ────────────────────────────────────────────
  useEffect(() => {
    if (!uid || !refCode) {
      setExtraLoaded(true);
      return;
    }

    Promise.all([
      // Item 3 — any activity log entry
      getDocs(collection(db, 'professionals', uid, 'activityLog'))
        .then((snap) => snap.size > 0)
        .catch(() => false),

      // Item 4 — any referral for this pro's code
      getDocs(
        query(
          collection(db, 'referrals'),
          where('referrerProfessionalId', '==', refCode),
        ),
      )
        .then((snap) => snap.size > 0)
        .catch(() => false),
    ]).then(([hasLog, hasRef]) => {
      setHasActivityLog(hasLog as boolean);
      setHasReferral(hasRef as boolean);
      setExtraLoaded(true);
    });
  }, [uid, refCode]);

  // ── Derive checklist items ─────────────────────────────────────────────
  const items = [
    {
      id:          'profile',
      label:       'Complete your profile',
      description: 'Add your firm name to finish setting up your professional account.',
      done:        !!(liveState?.firmName),
      cta:         'Go to Profile',
      onCta:       () => onNavigate('profile'),
    },
    {
      id:          'client',
      label:       'Link your first client',
      description: 'Share your referral code, or wait for a client to invite you from their settings.',
      done:        (liveState?.linkedClients?.length ?? 0) > 0,
      cta:         'Share referral code',
      onCta:       () => onNavigate('referrals'),
    },
    {
      id:          'report',
      label:       'View your first GST report',
      description: "Open a client's data in the GST Reports section.",
      done:        hasActivityLog,
      cta:         'Go to GST Reports',
      onCta:       () => onNavigate('reports'),
    },
    {
      id:          'referral',
      label:       'Share your referral code',
      description: 'Invite businesses to BillHippo and earn rewards when they sign up.',
      done:        hasReferral,
      cta:         'Go to Referrals',
      onCta:       () => onNavigate('referrals'),
    },
  ] as const;

  const doneCount = items.filter((i) => i.done).length;
  const allDone   = doneCount === items.length;
  const pct       = Math.round((doneCount / items.length) * 100);

  // ── Auto-complete when all items done ──────────────────────────────────
  useEffect(() => {
    if (!allDone || !uid || !liveState || liveState.onboardingComplete) return;
    updateDoc(doc(db, 'professionals', uid), { onboardingComplete: true }).catch(
      (err) => console.error('[OnboardingChecklist] auto-complete write failed:', err),
    );
  }, [allDone, uid, liveState]);

  // ── Dismiss ────────────────────────────────────────────────────────────
  const handleDismiss = async () => {
    if (!uid || dismissing) return;
    setDismissing(true);
    try {
      await updateDoc(doc(db, 'professionals', uid), { onboardingDismissed: true });
    } catch (err) {
      console.error('[OnboardingChecklist] dismiss failed:', err);
      setDismissing(false);
    }
  };

  // ── Visibility ─────────────────────────────────────────────────────────
  // Wait until both the onSnapshot and one-time reads have resolved before
  // deciding whether to show the checklist — prevents a flash on first render.
  if (!liveState || !extraLoaded) return null;
  if (liveState.onboardingDismissed || liveState.onboardingComplete) return null;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="mb-8 bg-emerald-50 border border-emerald-200 rounded-3xl p-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-bold text-emerald-800 font-poppins">
            Get Started with BillHippo Professional
          </h2>
          <p className="text-sm text-emerald-600/80 font-poppins mt-0.5">
            {doneCount} of {items.length} complete
          </p>
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          title="Dismiss checklist"
          aria-label="Dismiss checklist"
          className="flex-shrink-0 w-8 h-8 rounded-xl bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center text-emerald-600 transition-colors disabled:opacity-50"
        >
          <X size={15} />
        </button>
      </div>

      {/* ── Progress bar ── */}
      <div className="h-1.5 bg-emerald-100 rounded-full mb-5 overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* ── Checklist items ── */}
      <div className="space-y-2.5">
        {items.map((item) => (
          <div
            key={item.id}
            className={`
              flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors
              ${item.done
                ? 'bg-emerald-100/60'
                : 'bg-white border border-emerald-100 shadow-sm'}
            `}
          >
            {/* Status icon */}
            {item.done ? (
              <CheckCircle2
                size={20}
                className="text-emerald-500 flex-shrink-0"
              />
            ) : (
              /* Empty circle — no lucide Circle import needed */
              <div className="w-5 h-5 rounded-full border-2 border-emerald-200 flex-shrink-0" />
            )}

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-semibold font-poppins leading-snug ${
                  item.done
                    ? 'text-emerald-600 line-through decoration-emerald-400 decoration-1'
                    : 'text-slate-700'
                }`}
              >
                {item.label}
              </p>
              {!item.done && (
                <p className="text-xs text-slate-400 font-poppins mt-0.5 leading-relaxed">
                  {item.description}
                </p>
              )}
            </div>

            {/* CTA — only visible when not done */}
            {!item.done && (
              <button
                onClick={item.onCta}
                className="flex-shrink-0 text-xs font-bold font-poppins text-emerald-600 hover:text-emerald-700 hover:underline underline-offset-2 whitespace-nowrap"
              >
                {item.cta} →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OnboardingChecklist;
