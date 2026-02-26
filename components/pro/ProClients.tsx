/**
 * ProClients — "My Clients" view for the Professional Portal.
 *
 * Layout:
 *  1. If there are pending assignment invites → amber PendingAssignmentsSection
 *     card with Accept / Decline buttons (auto-dismisses after action).
 *  2. Full linked-client list with search, filing badges, and "Open" button.
 *
 * Replaces the ComingSoon stub that was previously rendered for `clients` view.
 */
import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  ExternalLink,
  Briefcase,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ProfessionalProfile, BusinessProfile } from '../../types';
import PendingAssignmentsSection from './PendingAssignmentsSection';

interface ClientData {
  uid: string;
  profile: BusinessProfile;
}

interface ProClientsProps {
  profile: ProfessionalProfile | null;
  onOpenClient: (uid: string) => void;
}

const ProClients: React.FC<ProClientsProps> = ({ profile, onOpenClient }) => {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  // Load business profiles for each linked client UID
  useEffect(() => {
    const linkedUids = profile?.linkedClients ?? [];
    if (linkedUids.length === 0) {
      setClients([]);
      setClientsLoading(false);
      return;
    }
    setClientsLoading(true);
    Promise.all(
      linkedUids.map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid, 'profile', 'main'));
          if (!snap.exists()) return null;
          return { uid, profile: snap.data() as BusinessProfile };
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      setClients(results.filter((r): r is ClientData => r !== null));
      setClientsLoading(false);
    });
  }, [profile]);

  const copyReferralCode = () => {
    navigator.clipboard.writeText(profile?.referralCode ?? '');
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const filteredClients = clients.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.profile.name?.toLowerCase().includes(q) ||
      c.profile.gstin?.toLowerCase().includes(q) ||
      c.profile.email?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 font-poppins">My Clients</h1>
        <p className="text-sm text-slate-400 font-poppins mt-1">
          Manage your linked business clients
        </p>
      </div>

      {/* ── Pending Assignments ─────────────────────────────────────────────────
          Shown automatically when a business user has sent an invite to this
          professional's email. Disappears after Accept / Decline. */}
      {profile && (
        <div className="mb-6">
          <PendingAssignmentsSection profile={profile} />
        </div>
      )}

      {/* ── Client list ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-50 flex items-center gap-3">
          <Users size={16} className="text-emerald-600" />
          <h2 className="text-sm font-bold text-slate-900 font-poppins">Linked Clients</h2>
          {clients.length > 0 && (
            <span className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              {clients.length}
            </span>
          )}
        </div>

        {/* Search */}
        {clients.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-50">
            <div className="relative flex items-center">
              <Search size={13} className="absolute left-3.5 text-slate-300 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name, GSTIN or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/30 font-poppins"
              />
            </div>
          </div>
        )}

        {/* Rows */}
        <div className="divide-y divide-slate-50">
          {clientsLoading ? (
            <div className="px-6 py-12 text-center">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-400 font-poppins">Loading clients…</p>
            </div>
          ) : filteredClients.length > 0 ? (
            filteredClients.map((client) => (
              <ClientRow
                key={client.uid}
                client={client}
                onOpen={() => onOpenClient(client.uid)}
              />
            ))
          ) : clients.length > 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-slate-400 font-poppins">No clients match your search.</p>
            </div>
          ) : (
            <EmptyState
              referralCode={profile?.referralCode ?? ''}
              onCopy={copyReferralCode}
              copied={copiedCode}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const ClientRow: React.FC<{ client: ClientData; onOpen: () => void }> = ({ client, onOpen }) => {
  const { profile } = client;
  return (
    <div className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800 font-poppins truncate">{profile.name}</p>
        <p className="text-xs text-slate-400 font-mono mt-0.5 tracking-wide">
          {profile.gstin || 'No GSTIN'}
        </p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <FilingBadge label="GSTR-1" status="pending" />
          <FilingBadge label="GSTR-3B" status="pending" />
        </div>
      </div>
      <button
        onClick={onOpen}
        className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 text-emerald-600 text-xs font-bold font-poppins hover:bg-emerald-50 transition-colors"
      >
        Open
        <ExternalLink size={11} />
      </button>
    </div>
  );
};

const FilingBadge: React.FC<{ label: string; status: 'filed' | 'pending' | 'overdue' }> = ({
  label,
  status,
}) => {
  const cls = {
    filed:   'bg-emerald-50 text-emerald-600 border-emerald-100',
    pending: 'bg-amber-50   text-amber-600   border-amber-100',
    overdue: 'bg-rose-50    text-rose-500    border-rose-100',
  }[status];
  return (
    <span className={`text-[9px] font-bold font-poppins px-2 py-0.5 rounded-full border uppercase tracking-wide ${cls}`}>
      {label}: {status}
    </span>
  );
};

const EmptyState: React.FC<{ referralCode: string; onCopy: () => void; copied: boolean }> = ({
  referralCode,
  onCopy,
  copied,
}) => (
  <div className="px-6 py-12 text-center">
    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
      <Briefcase size={22} className="text-emerald-400" />
    </div>
    <h3 className="text-sm font-bold text-slate-700 font-poppins mb-1">No clients linked yet</h3>
    <p className="text-xs text-slate-400 font-poppins mb-6 leading-relaxed max-w-xs mx-auto">
      Ask a business owner to send you an invite from their Professional Access
      settings, or share your referral code.
    </p>
    {referralCode && (
      <div className="inline-flex items-center gap-3 bg-emerald-50 border border-emerald-100 rounded-2xl px-5 py-4">
        <div className="text-left">
          <p className="text-[9px] font-bold font-poppins text-emerald-500 uppercase tracking-widest mb-1">
            Your Referral Code
          </p>
          <p className="text-lg font-bold text-emerald-700 font-poppins tracking-wider">
            {referralCode}
          </p>
        </div>
        <button
          onClick={onCopy}
          title="Copy referral code"
          className="w-8 h-8 rounded-xl bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center transition-colors"
        >
          {copied
            ? <CheckCircle2 size={14} className="text-emerald-600" />
            : <Copy      size={14} className="text-emerald-600" />}
        </button>
      </div>
    )}
  </div>
);

export default ProClients;
