import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Calendar,
  AlertCircle,
  Activity,
  Search,
  Copy,
  CheckCircle2,
  ExternalLink,
  Bell,
  Briefcase,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { ProfessionalProfile, BusinessProfile } from '../../types';
import type { ProView } from './ProLayout';
import OnboardingChecklist from './OnboardingChecklist';

interface ClientData {
  uid: string;
  profile: BusinessProfile;
}

interface ProDashboardProps {
  profile: ProfessionalProfile | null;
  onOpenClient: (uid: string) => void;
  onNavigate: (view: ProView) => void;
}

// TODO: Replace with real-time alert data from Firestore or Cloud Functions
const MOCK_ALERTS = [
  {
    id: '1',
    message: 'GSTR-1 for Oct is due on 11 Nov for all clients',
    sub: 'Filing reminder',
  },
  {
    id: '2',
    message: 'Accept invites from clients to see their GST data here',
    sub: 'Getting started',
  },
  {
    id: '3',
    message: 'Share your referral code so clients can link you from their settings',
    sub: 'Tip',
  },
];

const ProDashboard: React.FC<ProDashboardProps> = ({ profile, onOpenClient, onNavigate }) => {
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

  // TODO: derive from actual filing data; stub to 0 until cloud function provides it
  const statCards = [
    {
      label: 'Total Clients',
      value: clients.length,
      icon: Users,
      bg: 'bg-emerald-50',
      iconCls: 'text-emerald-600',
    },
    {
      label: 'Filings Due This Month',
      value: 0,
      icon: Calendar,
      bg: 'bg-amber-50',
      iconCls: 'text-amber-500',
    },
    {
      label: 'Overdue Filings',
      value: 0,
      icon: AlertCircle,
      bg: 'bg-rose-50',
      iconCls: 'text-rose-500',
    },
    {
      label: 'Active Today',
      value: 0,
      icon: Activity,
      bg: 'bg-indigo-50',
      iconCls: 'text-[#4c2de0]',
    },
  ];

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 font-poppins">
          Welcome back{profile ? `, ${profile.firstName}` : ''}
        </h1>
        <p className="text-sm text-slate-400 font-poppins mt-1">
          {profile?.designation ?? 'Professional Portal'}
          {profile?.firmName ? ` · ${profile.firmName}` : ''}
        </p>
      </div>

      {/* ── Onboarding Checklist — hidden once complete or dismissed ── */}
      <OnboardingChecklist profile={profile} onNavigate={onNavigate} />

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.07 }}
            className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5"
          >
            <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon size={18} className={card.iconCls} />
            </div>
            <p className="text-2xl font-bold text-slate-900 font-poppins">{card.value}</p>
            <p className="text-xs text-slate-400 font-poppins mt-0.5 leading-snug">{card.label}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Main 2-col layout ── */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left — Client List (60%) */}
        <div className="flex-[3] min-w-0">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            {/* Panel header */}
            <div className="px-6 py-5 border-b border-slate-50 flex items-center gap-3">
              <Users size={16} className="text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900 font-poppins">My Clients</h2>
              {clients.length > 0 && (
                <span className="ml-auto text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                  {clients.length}
                </span>
              )}
            </div>

            {/* Search bar */}
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

            {/* Client rows */}
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
              ) : clients.length === 0 ? (
                <EmptyState
                  referralCode={profile?.referralCode ?? ''}
                  onCopy={copyReferralCode}
                  copied={copiedCode}
                />
              ) : (
                <div className="px-6 py-8 text-center">
                  <p className="text-sm text-slate-400 font-poppins">
                    No clients match &ldquo;{search}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right — Alerts (40%) */}
        <div className="flex-[2] min-w-0">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-6 py-5 border-b border-slate-50 flex items-center gap-3">
              <Bell size={16} className="text-amber-500" />
              <h2 className="text-sm font-bold text-slate-900 font-poppins">Recent Alerts</h2>
            </div>
            <div className="divide-y divide-slate-50">
              {MOCK_ALERTS.map((alert) => (
                <div key={alert.id} className="px-6 py-4 flex items-start gap-3">
                  <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bell size={12} className="text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-600 font-poppins leading-relaxed">
                      {alert.message}
                    </p>
                    <p className="text-[10px] text-slate-300 font-poppins mt-0.5">{alert.sub}</p>
                  </div>
                </div>
              ))}
              <div className="px-6 py-4 text-center">
                <p className="text-[10px] text-slate-300 font-poppins">
                  Real-time alerts coming soon
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────

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
          {/* TODO: replace with real filing status from GSTN / Firestore */}
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
    pending: 'bg-amber-50 text-amber-600 border-amber-100',
    overdue: 'bg-rose-50 text-rose-500 border-rose-100',
  }[status];
  return (
    <span
      className={`text-[9px] font-bold font-poppins px-2 py-0.5 rounded-full border uppercase tracking-wide ${cls}`}
    >
      {label}: {status}
    </span>
  );
};

const EmptyState: React.FC<{
  referralCode: string;
  onCopy: () => void;
  copied: boolean;
}> = ({ referralCode, onCopy, copied }) => (
  <div className="px-6 py-12 text-center">
    <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
      <Briefcase size={22} className="text-emerald-400" />
    </div>
    <h3 className="text-sm font-bold text-slate-700 font-poppins mb-1">No clients linked yet</h3>
    <p className="text-xs text-slate-400 font-poppins mb-6 leading-relaxed max-w-xs mx-auto">
      Share your referral code with clients, or ask business owners to send you an invite from their
      Profile Settings page.
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
            : <Copy size={14} className="text-emerald-600" />}
        </button>
      </div>
    )}
  </div>
);

export default ProDashboard;
