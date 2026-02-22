/**
 * ProReferrals — referral code sharing and earned-commission tracking.
 *
 * Referral code display: shows the professional's ID (which doubles as
 * their referral code), copy-to-clipboard, and WhatsApp share.
 *
 * Stats: live count from `referrals` Firestore collection filtered by
 * referrerProfessionalId. Business names are joined from
 * users/{userUid}/profile/main when a userUid is present on the doc.
 */
import React, { useState, useEffect } from 'react';
import {
  Check,
  Send,
  Users,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ProfessionalProfile } from '../../types';

// ── Types ──────────────────────────────────────────────────────────────────

interface ReferralRow {
  id: string;
  email: string;
  businessName: string;
  referredAt: string;
  registered: boolean;
  converted: boolean;
}

export interface ProReferralsProps {
  profile: ProfessionalProfile | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BASE_REF_URL = 'https://billhippo.in/register';

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function copyText(text: string, setFn: (v: boolean) => void) {
  navigator.clipboard.writeText(text).catch(() => {
    // Fallback for browsers that block clipboard API
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  });
  setFn(true);
  setTimeout(() => setFn(false), 2000);
}

// ── Component ──────────────────────────────────────────────────────────────

const ProReferrals: React.FC<ProReferralsProps> = ({ profile }) => {
  const refCode = profile?.referralCode ?? profile?.professionalId ?? '';
  const refLink = `${BASE_REF_URL}?ref=${refCode}`;
  const waText  = `I use BillHippo for GST billing. Use my code ${refCode} when signing up: ${refLink}`;
  const waUrl   = `https://wa.me/?text=${encodeURIComponent(waText)}`;

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [referrals,  setReferrals]  = useState<ReferralRow[]>([]);
  const [fetchError, setFetchError] = useState('');

  // ── Load referrals ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!refCode) return;
    setLoading(true);
    setFetchError('');

    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, 'referrals'),
            where('referrerProfessionalId', '==', refCode),
          ),
        );

        const rows: ReferralRow[] = await Promise.all(
          snap.docs.map(async (d) => {
            const data = d.data();

            // Try to get the business name from the users profile if not stored
            let businessName: string = data.businessName ?? '';
            if (!businessName && data.userUid) {
              try {
                const profileSnap = await getDoc(
                  doc(db, 'users', data.userUid, 'profile', 'main'),
                );
                if (profileSnap.exists()) {
                  businessName =
                    (profileSnap.data() as { name?: string }).name ?? '';
                }
              } catch {
                /* silently ignore — display '—' */
              }
            }

            return {
              id:           d.id,
              email:        data.email        ?? '—',
              businessName: businessName      || '—',
              referredAt:   data.createdAt    ?? '',
              registered:   !!data.userUid,
              converted:    data.converted    ?? false,
            };
          }),
        );

        rows.sort((a, b) => b.referredAt.localeCompare(a.referredAt));
        setReferrals(rows);
      } catch (err) {
        console.error('[ProReferrals] Firestore fetch failed:', err);
        setFetchError('Could not load referrals. Please refresh and try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [refCode]);

  const totalReferred  = referrals.length;
  const convertedCount = referrals.filter((r) => r.converted).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-poppins">Referrals</h1>
        <p className="text-sm text-slate-400 font-poppins mt-1">
          Share your referral code and earn rewards when businesses sign up.
        </p>
      </div>

      {/* ── Referral Code Card ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-emerald-600 to-emerald-700 rounded-3xl p-8 text-white shadow-xl shadow-emerald-100">
        <p className="text-xs font-bold font-poppins uppercase tracking-widest text-emerald-200 mb-2">
          Your Referral Code
        </p>

        <p className="font-mono text-4xl sm:text-5xl font-bold tracking-widest mb-6 select-all">
          {refCode || '—'}
        </p>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          <button
            onClick={() => copyText(refCode, setCopiedCode)}
            disabled={!refCode}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-sm font-semibold font-poppins transition-all disabled:opacity-50"
          >
            {copiedCode ? <Check size={15} /> : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
            )}
            {copiedCode ? 'Copied!' : 'Copy Code'}
          </button>

          <button
            onClick={() => copyText(refLink, setCopiedLink)}
            disabled={!refCode}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-sm font-semibold font-poppins transition-all disabled:opacity-50"
          >
            {copiedLink ? <Check size={15} /> : <ExternalLink size={15} />}
            {copiedLink ? 'Copied!' : 'Copy Link'}
          </button>

          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 bg-[#25D366]/20 hover:bg-[#25D366]/30 border border-[#25D366]/30 rounded-2xl text-sm font-semibold font-poppins transition-all"
          >
            <Send size={15} />
            Share on WhatsApp
          </a>
        </div>

        {/* Shareable link preview */}
        <div className="flex items-center gap-3 bg-black/10 rounded-2xl px-4 py-3">
          <ExternalLink size={13} className="text-emerald-300 flex-shrink-0" />
          <span className="text-xs text-emerald-200 font-mono truncate">{refLink}</span>
        </div>
      </div>

      {/* ── Stats Cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs text-slate-400 font-poppins font-semibold uppercase tracking-wider mb-2">
            Total Referred
          </p>
          <p className="text-3xl font-bold text-slate-800 font-poppins">
            {loading ? '—' : totalReferred}
          </p>
          <p className="text-xs text-slate-300 font-poppins mt-1">businesses invited</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs text-slate-400 font-poppins font-semibold uppercase tracking-wider mb-2">
            Converted to Paid
          </p>
          <p className="text-3xl font-bold text-slate-800 font-poppins">
            {loading ? '—' : convertedCount}
          </p>
          <p className="text-xs text-slate-300 font-poppins mt-1">paid plan upgrades</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <p className="text-xs text-slate-400 font-poppins font-semibold uppercase tracking-wider mb-2">
            Commission Earned
          </p>
          <p className="text-3xl font-bold text-slate-800 font-poppins">₹0</p>
          <p className="text-xs text-amber-400 font-poppins mt-1">Commission plans coming soon</p>
        </div>
      </div>

      {/* ── Referrals Table ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50 flex items-center gap-3">
          <Users size={18} className="text-emerald-500" />
          <h2 className="text-base font-bold text-slate-700 font-poppins">Your Referrals</h2>
          {!loading && referrals.length > 0 && (
            <span className="ml-auto text-xs text-slate-400 font-poppins font-semibold">
              {referrals.length} total
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-poppins">Loading referrals…</span>
          </div>
        ) : fetchError ? (
          <div className="flex items-center justify-center gap-3 py-16 text-rose-400">
            <AlertCircle size={18} />
            <span className="text-sm font-poppins">{fetchError}</span>
          </div>
        ) : referrals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
              <Users size={24} strokeWidth={1.4} className="text-slate-300" />
            </div>
            <p className="text-sm font-bold font-poppins text-slate-400">No referrals yet</p>
            <p className="text-xs font-poppins mt-1 text-slate-300">
              Share your code above to get started
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-poppins">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Business Name
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Referred On
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {referrals.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-4 font-semibold text-slate-700">
                      {row.businessName}
                    </td>
                    <td className="px-6 py-4 text-slate-500">{row.email}</td>
                    <td className="px-6 py-4 text-slate-400">{formatDate(row.referredAt)}</td>
                    <td className="px-6 py-4">
                      {row.registered ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                          <CheckCircle2 size={11} />
                          Registered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-bold">
                          <Clock size={11} />
                          Pending
                        </span>
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

export default ProReferrals;
