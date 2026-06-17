import React, { useEffect, useMemo, useState } from 'react';
import {
  Landmark, Download, RefreshCw, CheckCircle2, AlertTriangle, Clock,
  Wifi, WifiOff, BookOpen, Send, Info, Search, Loader2, KeyRound, Copy,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import type { TallyConfig, TallyLedger, SyncJob, Customer, Invoice } from '../types';
import {
  subscribeTallyConfig, saveTallyConfig, subscribeTallyLedgers,
  subscribeSyncJobs, enqueueSyncJob, isConnectorOnline,
} from '../lib/tally';
import { getCustomers, getInvoices, updateCustomer } from '../lib/firestore';
import { functions } from '../lib/firebase';
import { resolvePartyLedger, ledgerExistsByName, matchStatusLabel, type PartyMatchResult } from '../lib/tallyMatch';
import { haptic } from '../lib/haptic';

// Set VITE_CONNECTOR_DOWNLOAD_URL in the build env once the signed installer is hosted.
const CONNECTOR_DOWNLOAD_URL = import.meta.env.VITE_CONNECTOR_DOWNLOAD_URL || '';

type TabId = 'connector' | 'ledgers' | 'push';

interface AccountsProps {
  userId: string;
}

const Accounts: React.FC<AccountsProps> = ({ userId }) => {
  const [tab, setTab] = useState<TabId>('connector');
  const [config, setConfig] = useState<TallyConfig | null>(null);
  const [ledgers, setLedgers] = useState<TallyLedger[]>([]);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  // Live subscriptions for connector-driven data.
  useEffect(() => {
    const unsubConfig = subscribeTallyConfig(userId, setConfig);
    const unsubLedgers = subscribeTallyLedgers(userId, setLedgers);
    const unsubJobs = subscribeSyncJobs(userId, setJobs);
    return () => { unsubConfig(); unsubLedgers(); unsubJobs(); };
  }, [userId]);

  // One-shot loads for invoices + customers.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [cust, inv] = await Promise.all([getCustomers(userId), getInvoices(userId)]);
      if (!alive) return;
      setCustomers(cust);
      setInvoices(inv);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [userId]);

  const online = isConnectorOnline(config);

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'connector', label: 'Connector', icon: Download },
    { id: 'ledgers', label: 'Ledger Sync', icon: BookOpen },
    { id: 'push', label: 'Push to Tally', icon: Send },
  ];

  return (
    <div className="py-6 md:py-10">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-14 h-14 rounded-2xl bg-profee-blue/10 flex items-center justify-center flex-shrink-0">
          <Landmark className="text-profee-blue" size={28} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 font-poppins">Accounts</h1>
          <p className="text-slate-500 font-poppins text-sm mt-1">
            Sync your sales invoices to Tally Prime through the BillHippo Desktop Connector.
          </p>
        </div>
        <ConnectorPill online={online} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 border-b border-slate-100 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { haptic('light'); setTab(t.id); }}
            className={`flex items-center gap-2 px-4 py-3 font-semibold font-poppins text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-profee-blue text-profee-blue'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <t.icon size={18} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'connector' && <ConnectorTab userId={userId} config={config} online={online} />}
      {tab === 'ledgers' && (
        <LedgersTab userId={userId} config={config} ledgers={ledgers} online={online} />
      )}
      {tab === 'push' && (
        <PushTab
          userId={userId}
          config={config}
          ledgers={ledgers}
          invoices={invoices}
          customers={customers}
          jobs={jobs}
          loading={loading}
          online={online}
          onCustomerMapped={(c) => setCustomers((prev) => prev.map((x) => (x.id === c.id ? c : x)))}
        />
      )}
    </div>
  );
};

// ── Status pill ───────────────────────────────────────────────────────────────

const ConnectorPill: React.FC<{ online: boolean }> = ({ online }) => (
  <span
    className={`hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold font-poppins ${
      online ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'
    }`}
  >
    {online ? <Wifi size={14} /> : <WifiOff size={14} />}
    {online ? 'Connector online' : 'Connector offline'}
  </span>
);

// ── Pairing code generator ────────────────────────────────────────────────────

const PairingCode: React.FC<{ userId: string; online: boolean }> = ({ online }) => {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Tick so the "expires in" countdown stays live while a code is shown.
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [code]);

  const secondsLeft = code ? Math.max(0, Math.round((expiresAt - now) / 1000)) : 0;
  const expired = code !== null && secondsLeft <= 0;

  const generate = async () => {
    setLoading(true);
    setError(null);
    setCopied(false);
    try {
      const fn = httpsCallable<unknown, { code: string; expiresAt: number }>(functions, 'tallyCreatePairingCode');
      const res = await fn();
      setCode(res.data.code);
      setExpiresAt(res.data.expiresAt);
      setNow(Date.now());
    } catch (e: any) {
      setError(e?.message?.replace('FirebaseError: ', '') || 'Could not generate a code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="mt-6 pt-5 border-t border-slate-100">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound size={16} className="text-profee-blue" />
        <h3 className="font-bold text-slate-700 font-poppins text-sm">Pairing code</h3>
      </div>
      <p className="text-xs text-slate-500 font-poppins mb-3">
        Generate a one-time code, then paste it into the connector's Settings window to link this account.
      </p>

      {code && !expired ? (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono font-bold text-xl tracking-[0.3em] text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
            {code}
          </span>
          <button onClick={copy} className="inline-flex items-center gap-1.5 text-xs font-bold font-poppins text-profee-blue hover:underline">
            <Copy size={14} /> {copied ? 'Copied!' : 'Copy'}
          </button>
          <span className="text-xs text-slate-400 font-poppins">expires in {secondsLeft}s</span>
        </div>
      ) : (
        <button
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-800 text-white font-bold font-poppins text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
          {expired ? 'Generate a new code' : 'Generate pairing code'}
        </button>
      )}

      {error && <p className="text-xs text-rose-500 font-poppins mt-2">{error}</p>}
      {!online && code && !expired && (
        <p className="text-[11px] text-slate-400 font-poppins mt-2">
          Once the connector signs in with this code, the status above turns green.
        </p>
      )}
    </div>
  );
};

// ── Connector tab ─────────────────────────────────────────────────────────────

const ConnectorTab: React.FC<{
  userId: string;
  config: TallyConfig | null;
  online: boolean;
}> = ({ userId, config, online }) => {
  const [form, setForm] = useState({
    companyName: '', tallyPort: 9000, salesLedgerName: '',
    cgstLedgerName: '', sgstLedgerName: '', igstLedgerName: '',
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setForm({
        companyName: config.companyName || '',
        tallyPort: config.tallyPort || 9000,
        salesLedgerName: config.salesLedgerName || '',
        cgstLedgerName: config.cgstLedgerName || '',
        sgstLedgerName: config.sgstLedgerName || '',
        igstLedgerName: config.igstLedgerName || '',
      });
    }
  }, [config]);

  const handleSave = async () => {
    await saveTallyConfig(userId, {
      companyName: form.companyName.trim(),
      tallyPort: Number(form.tallyPort) || 9000,
      salesLedgerName: form.salesLedgerName.trim(),
      cgstLedgerName: form.cgstLedgerName.trim() || 'CGST',
      sgstLedgerName: form.sgstLedgerName.trim() || 'SGST',
      igstLedgerName: form.igstLedgerName.trim() || 'IGST',
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Download card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 font-poppins mb-1">1. Install the connector</h2>
        <p className="text-sm text-slate-500 font-poppins mb-5">
          A lightweight tray app that runs on the PC where Tally Prime is installed. It bridges
          BillHippo and Tally's local gateway — no data leaves your machine for Tally.
        </p>

        <a
          href={CONNECTOR_DOWNLOAD_URL || undefined}
          onClick={(e) => { if (!CONNECTOR_DOWNLOAD_URL) e.preventDefault(); }}
          className={`inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold font-poppins text-sm transition-all ${
            CONNECTOR_DOWNLOAD_URL
              ? 'bg-profee-blue text-white hover:opacity-90 active:scale-95'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          <Download size={18} />
          Download for Windows
        </a>
        {!CONNECTOR_DOWNLOAD_URL && (
          <p className="text-xs text-amber-600 font-poppins mt-3 flex items-center gap-1.5">
            <Clock size={13} /> Connector build coming soon — configure your settings now so it's
            ready on first launch.
          </p>
        )}

        <ol className="mt-6 space-y-3 text-sm text-slate-600 font-poppins list-decimal list-inside">
          <li>Open Tally Prime → <b>F1 → Settings → Connectivity</b> and set
            <b> Client/Server configuration</b> to <b>Both</b>, port <b>9000</b>.</li>
          <li>Keep the company you sync to <b>open</b> in Tally.</li>
          <li>Install &amp; launch the BillHippo connector, then paste your pairing code.</li>
        </ol>

        <PairingCode userId={userId} online={online} />
      </div>

      {/* Settings card */}
      <div className="bg-white rounded-3xl border border-slate-100 p-7 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 font-poppins mb-1">2. Tally settings</h2>
        <p className="text-sm text-slate-500 font-poppins mb-5">
          These tell the connector which company and ledgers to post into.
        </p>

        <div className="space-y-4">
          <Field label="Tally company name" hint="Exactly as it appears in Tally">
            <input
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder="e.g. Acme Traders Pvt Ltd"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30"
            />
          </Field>
          <Field label="Default sales ledger" hint="The credit ledger for sales, e.g. 'Sales Accounts'">
            <input
              value={form.salesLedgerName}
              onChange={(e) => setForm({ ...form, salesLedgerName: e.target.value })}
              placeholder="e.g. Sales Accounts"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30"
            />
          </Field>
          <Field label="Gateway port" hint="Default is 9000">
            <input
              type="number"
              value={form.tallyPort}
              onChange={(e) => setForm({ ...form, tallyPort: Number(e.target.value) })}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30"
            />
          </Field>

          <Field label="GST tax ledgers" hint="Leave blank to use the defaults CGST / SGST / IGST">
            <div className="grid grid-cols-3 gap-2">
              <input
                value={form.cgstLedgerName}
                onChange={(e) => setForm({ ...form, cgstLedgerName: e.target.value })}
                placeholder="CGST"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30"
              />
              <input
                value={form.sgstLedgerName}
                onChange={(e) => setForm({ ...form, sgstLedgerName: e.target.value })}
                placeholder="SGST"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30"
              />
              <input
                value={form.igstLedgerName}
                onChange={(e) => setForm({ ...form, igstLedgerName: e.target.value })}
                placeholder="IGST"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30"
              />
            </div>
          </Field>

          <button
            onClick={handleSave}
            className="w-full py-3 rounded-2xl bg-profee-blue text-white font-bold font-poppins text-sm hover:opacity-90 active:scale-95 transition-all"
          >
            {saved ? 'Saved ✓' : 'Save settings'}
          </button>

          <div className="flex items-center gap-2 text-xs font-poppins pt-1">
            <span className={`w-2 h-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className="text-slate-500">
              {online ? 'Connector is connected and reachable.' : 'Connector not detected yet.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Ledger sync tab ───────────────────────────────────────────────────────────

const LedgersTab: React.FC<{
  userId: string;
  config: TallyConfig | null;
  ledgers: TallyLedger[];
  online: boolean;
}> = ({ userId, ledgers, online }) => {
  const [enqueuing, setEnqueuing] = useState(false);
  const [search, setSearch] = useState('');

  const handleVerify = async () => {
    setEnqueuing(true);
    try {
      await enqueueSyncJob(userId, { type: 'FETCH_LEDGERS', createdBy: userId });
    } finally {
      setEnqueuing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ledgers;
    return ledgers.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.gstin || '').toLowerCase().includes(q),
    );
  }, [ledgers, search]);

  return (
    <div>
      <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-800 font-poppins">Verify Tally ledgers</h2>
          <p className="text-sm text-slate-500 font-poppins mt-1">
            Pull the list of ledgers (with GSTINs) from Tally so BillHippo can match customers
            before pushing invoices.
          </p>
        </div>
        <button
          onClick={handleVerify}
          disabled={enqueuing}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-profee-blue text-white font-bold font-poppins text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
        >
          {enqueuing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
          Verify ledgers
        </button>
      </div>

      {!online && (
        <Banner tone="amber">
          The connector is offline, so this request will queue and run as soon as the connector
          comes online with Tally open.
        </Banner>
      )}

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Search size={16} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ledgers by name or GSTIN…"
            className="flex-1 text-sm font-poppins focus:outline-none"
          />
          <span className="text-xs text-slate-400 font-poppins">{ledgers.length} synced</span>
        </div>

        {ledgers.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No ledgers synced yet"
            subtitle="Click 'Verify ledgers' to pull them from Tally."
          />
        ) : (
          <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
            {filtered.map((l) => (
              <div key={l.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-700 font-poppins text-sm truncate">{l.name}</p>
                  <p className="text-xs text-slate-400 font-poppins">{l.parent || '—'}</p>
                </div>
                {l.gstin && (
                  <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded-md">
                    {l.gstin}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Push tab ──────────────────────────────────────────────────────────────────

const PushTab: React.FC<{
  userId: string;
  config: TallyConfig | null;
  ledgers: TallyLedger[];
  invoices: Invoice[];
  customers: Customer[];
  jobs: SyncJob[];
  loading: boolean;
  online: boolean;
  onCustomerMapped: (c: Customer) => void;
}> = ({ userId, config, ledgers, invoices, customers, jobs, loading, onCustomerMapped }) => {
  const customerById = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  // Latest job per invoice (by createdAt millis), to show a sync status column.
  const latestJobByInvoice = useMemo(() => {
    const map = new Map<string, SyncJob>();
    for (const j of jobs) {
      if (j.type !== 'PUSH_INVOICE' || !j.invoiceId) continue;
      const prev = map.get(j.invoiceId);
      const jt = millis(j.createdAt);
      if (!prev || jt >= millis(prev.createdAt)) map.set(j.invoiceId, j);
    }
    return map;
  }, [jobs]);

  // Latest CREATE_LEDGER job per customer, so a "Creating…" state can show.
  const latestCreateJobByCustomer = useMemo(() => {
    const map = new Map<string, SyncJob>();
    for (const j of jobs) {
      if (j.type !== 'CREATE_LEDGER' || !j.customerId) continue;
      const prev = map.get(j.customerId);
      if (!prev || millis(j.createdAt) >= millis(prev.createdAt)) map.set(j.customerId, j);
    }
    return map;
  }, [jobs]);

  const salesLedgerOk = ledgerExistsByName(config?.salesLedgerName, ledgers);

  const persistMapping = async (customer: Customer, tallyLedgerName: string, matchType: 'gstin' | 'name') => {
    if (customer.tallyLedgerName === tallyLedgerName && customer.tallyMatchType === matchType) return;
    await updateCustomer(userId, customer.id, { tallyLedgerName, tallyMatchType: matchType });
    onCustomerMapped({ ...customer, tallyLedgerName, tallyMatchType: matchType });
  };

  const handlePush = async (inv: Invoice, resolvedName: string, matchType: 'gstin' | 'name') => {
    const customer = customerById.get(inv.customerId);
    // Persist the resolved mapping so future pushes reuse the Tally-side name.
    if (customer) await persistMapping(customer, resolvedName, matchType);
    await enqueueSyncJob(userId, {
      type: 'PUSH_INVOICE',
      invoiceId: inv.id,
      createdBy: userId,
      payloadSnapshot: {
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        partyLedgerName: resolvedName,
        salesLedgerName: config?.salesLedgerName || '',
        totalAmount: inv.totalAmount,
      },
    });
  };

  // Confirm a suggested ledger: save the mapping (then the row becomes pushable).
  const handleConfirmMap = async (inv: Invoice, suggestedName: string) => {
    const customer = customerById.get(inv.customerId);
    if (customer) await persistMapping(customer, suggestedName, 'name');
  };

  // Create the missing party ledger in Tally from the customer's master data.
  const handleCreateLedger = async (inv: Invoice) => {
    if (!inv.customerId) return;
    await enqueueSyncJob(userId, {
      type: 'CREATE_LEDGER',
      customerId: inv.customerId,
      createdBy: userId,
      payloadSnapshot: { customerName: inv.customerName },
    });
  };

  if (loading) {
    return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-slate-300" size={32} /></div>;
  }

  return (
    <div>
      {!salesLedgerOk && (
        <Banner tone="amber">
          {config?.salesLedgerName
            ? <>Sales ledger <b>“{config.salesLedgerName}”</b> isn't in the synced ledger list. Verify ledgers, or check the name in Connector settings.</>
            : <>No default sales ledger set. Add one under <b>Connector → Tally settings</b> before pushing.</>}
        </Banner>
      )}

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {invoices.length === 0 ? (
          <EmptyState icon={Send} title="No invoices yet" subtitle="Create invoices to push them to Tally." />
        ) : (
          <div className="divide-y divide-slate-50">
            {invoices.map((inv) => {
              const customer = customerById.get(inv.customerId);
              const party = resolvePartyLedger(
                customer ?? { name: inv.customerName, gstin: undefined },
                ledgers,
              );
              const job = latestJobByInvoice.get(inv.id);
              const createJob = inv.customerId ? latestCreateJobByCustomer.get(inv.customerId) : undefined;
              // A previously-saved mapping makes the row pushable regardless of
              // the live matcher result (e.g. confirmed suggestion).
              const mappedName = customer?.tallyLedgerName;
              const resolvedName = mappedName || party.tallyLedgerName;
              const matchType: 'gstin' | 'name' =
                customer?.tallyMatchType || (party.status === 'gstin' ? 'gstin' : 'name');
              const canPush = !!mappedName || party.status === 'gstin' || party.status === 'name';
              return (
                <div key={inv.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-slate-700 font-poppins text-sm">{inv.invoiceNumber}</p>
                      <span className="text-xs text-slate-400 font-poppins">{inv.date}</span>
                    </div>
                    <p className="text-sm text-slate-500 font-poppins truncate">{inv.customerName}</p>
                    {mappedName
                      ? <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold font-poppins text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={12} /> Mapped → “{mappedName}”</span>
                      : <PartyBadge party={party} billHippoName={inv.customerName} />}
                  </div>

                  <div className="text-right font-poppins flex-shrink-0">
                    <p className="font-bold text-slate-700 text-sm">₹{inv.totalAmount.toLocaleString('en-IN')}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 sm:w-56 sm:justify-end">
                    <JobStatus job={job} />
                    {canPush && resolvedName ? (
                      <button
                        onClick={() => handlePush(inv, resolvedName, matchType)}
                        title="Queue push to Tally"
                        className="px-4 py-2 rounded-xl text-xs font-bold font-poppins bg-profee-blue text-white hover:opacity-90 active:scale-95 transition-all"
                      >
                        {job?.status === 'failed' ? 'Retry' : 'Push'}
                      </button>
                    ) : party.status === 'suggest' && party.tallyLedgerName ? (
                      <button
                        onClick={() => handleConfirmMap(inv, party.tallyLedgerName!)}
                        title={`Map this customer to the Tally ledger "${party.tallyLedgerName}"`}
                        className="px-3 py-2 rounded-xl text-xs font-bold font-poppins bg-amber-500 text-white hover:opacity-90 active:scale-95 transition-all"
                      >
                        Use this ledger
                      </button>
                    ) : createJob && createJob.status !== 'failed' && createJob.status !== 'success' ? (
                      <span className="text-[11px] font-bold font-poppins text-sky-600 inline-flex items-center gap-1"><Loader2 size={13} className="animate-spin" /> Creating…</span>
                    ) : (
                      <button
                        onClick={() => handleCreateLedger(inv)}
                        disabled={!inv.customerId}
                        title="Create this party ledger in Tally"
                        className="px-3 py-2 rounded-xl text-xs font-bold font-poppins bg-slate-800 text-white hover:opacity-90 active:scale-95 transition-all disabled:opacity-40"
                      >
                        {createJob?.status === 'failed' ? 'Retry create' : 'Create ledger'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Party match badge (the GSTIN-first surface) ───────────────────────────────

const PartyBadge: React.FC<{ party: PartyMatchResult; billHippoName: string }> = ({ party, billHippoName }) => {
  if (party.status === 'gstin') {
    return (
      <div className="mt-1.5">
        <span className="inline-flex items-center gap-1 text-[11px] font-bold font-poppins text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
          <CheckCircle2 size={12} /> {matchStatusLabel('gstin')}
        </span>
        {party.nameDiffers && (
          <p className="mt-1 text-[11px] text-slate-500 font-poppins flex items-center gap-1">
            <Info size={11} className="text-slate-400" />
            In Tally: <b className="text-slate-600">{party.tallyLedgerName}</b>
            <span className="text-slate-300">·</span>
            In BillHippo: <b className="text-slate-600">{billHippoName}</b>
          </p>
        )}
      </div>
    );
  }
  if (party.status === 'name') {
    return (
      <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold font-poppins text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
        <CheckCircle2 size={12} /> {matchStatusLabel('name')}
      </span>
    );
  }
  if (party.status === 'suggest') {
    return (
      <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold font-poppins text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
        <AlertTriangle size={12} /> {matchStatusLabel('suggest')}: “{party.tallyLedgerName}”?
      </span>
    );
  }
  return (
    <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold font-poppins text-rose-500 bg-rose-50 px-2 py-0.5 rounded-full">
      <AlertTriangle size={12} /> {matchStatusLabel('none')}
    </span>
  );
};

// ── Job status chip ───────────────────────────────────────────────────────────

const JobStatus: React.FC<{ job?: SyncJob }> = ({ job }) => {
  if (!job) return null;
  const map: Record<SyncJob['status'], { label: string; cls: string; icon: React.ElementType }> = {
    pending:    { label: 'Pending',    cls: 'text-amber-600',  icon: Clock },
    processing: { label: 'Syncing',    cls: 'text-sky-600',    icon: Loader2 },
    success:    { label: 'Synced',     cls: 'text-emerald-600', icon: CheckCircle2 },
    failed:     { label: 'Failed',     cls: 'text-rose-500',   icon: AlertTriangle },
  };
  const s = map[job.status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold font-poppins ${s.cls}`} title={job.error || ''}>
      <s.icon size={13} className={job.status === 'processing' ? 'animate-spin' : ''} />
      {s.label}
    </span>
  );
};

// ── Small shared UI helpers ───────────────────────────────────────────────────

const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div>
    <label className="block text-sm font-semibold text-slate-700 font-poppins mb-1.5">{label}</label>
    {children}
    {hint && <p className="text-xs text-slate-400 font-poppins mt-1">{hint}</p>}
  </div>
);

const Banner: React.FC<{ tone: 'amber'; children: React.ReactNode }> = ({ children }) => (
  <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-100 text-sm text-amber-700 font-poppins">
    <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
    <span>{children}</span>
  </div>
);

const EmptyState: React.FC<{ icon: React.ElementType; title: string; subtitle: string }> = ({ icon: Icon, title, subtitle }) => (
  <div className="py-16 flex flex-col items-center text-center">
    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mb-3">
      <Icon className="text-slate-300" size={26} />
    </div>
    <p className="font-bold text-slate-600 font-poppins">{title}</p>
    <p className="text-sm text-slate-400 font-poppins mt-1">{subtitle}</p>
  </div>
);

function millis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  const anyTs = ts as { toMillis?: () => number; seconds?: number };
  if (typeof anyTs.toMillis === 'function') return anyTs.toMillis();
  if (typeof anyTs.seconds === 'number') return anyTs.seconds * 1000;
  return 0;
}

export default Accounts;
