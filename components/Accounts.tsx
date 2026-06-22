import React, { useEffect, useMemo, useState } from 'react';
import {
  Landmark, Download, RefreshCw, CheckCircle2, AlertTriangle, Clock,
  Wifi, WifiOff, BookOpen, Send, Info, Search, Loader2, KeyRound, Copy, Plus, Pencil,
  Calendar, Lock,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import type { TallyConfig, TallyLedger, SyncJob, Customer, Invoice, BusinessProfile } from '../types';
import {
  subscribeTallyConfig, saveTallyConfig, subscribeTallyLedgers,
  subscribeSyncJobs, enqueueSyncJob, isConnectorOnline,
  subscribeTallyInvoiceMap, saveTallyInvoiceMap, type TallyInvoiceMapping,
} from '../lib/tally';
import { getInvoices, updateCustomer, addCustomer, subscribeCustomers, getBusinessProfile } from '../lib/firestore';
import { functions } from '../lib/firebase';
import { resolvePartyLedger, ledgerExistsByName, matchStatusLabel, type PartyMatchResult } from '../lib/tallyMatch';
import { haptic } from '../lib/haptic';

// Permanent "latest release" link — GitHub always redirects this to the newest
// published installer, so the button never serves a stale build. Override with
// VITE_CONNECTOR_DOWNLOAD_URL at build time if the installer moves elsewhere.
const CONNECTOR_DOWNLOAD_URL =
  import.meta.env.VITE_CONNECTOR_DOWNLOAD_URL ||
  'https://github.com/billhippobusiness-cpu/Billhippo2.0/releases/latest/download/BillHippo-Connector-Setup.exe';

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
  const [invoiceMap, setInvoiceMap] = useState<Record<string, TallyInvoiceMapping>>({});
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Live subscriptions for connector-driven data + customers, so the Ledger
  // Sync comparison (Tally ledgers ↔ BillHippo customers) is always realtime.
  useEffect(() => {
    const unsubConfig = subscribeTallyConfig(userId, setConfig);
    const unsubLedgers = subscribeTallyLedgers(userId, setLedgers);
    const unsubJobs = subscribeSyncJobs(userId, setJobs);
    const unsubMap = subscribeTallyInvoiceMap(userId, setInvoiceMap);
    const unsubCustomers = subscribeCustomers(userId, setCustomers);
    return () => { unsubConfig(); unsubLedgers(); unsubJobs(); unsubMap(); unsubCustomers(); };
  }, [userId]);

  // One-shot load for invoices + the business profile (for the header identity).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [inv, prof] = await Promise.all([getInvoices(userId), getBusinessProfile(userId)]);
      if (!alive) return;
      setInvoices(inv);
      setProfile(prof);
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
          {profile?.name && (
            <p className="text-[11px] font-bold uppercase tracking-widest text-profee-blue/70 font-poppins mb-0.5 truncate">
              {profile.name}
            </p>
          )}
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800 font-poppins">Accounts</h1>
          <p className="text-slate-500 font-poppins text-sm mt-1">
            Sync your sales invoices to Tally Prime through the BillHippo Desktop Connector.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <ConnectorPill online={online} />
          <TallyMark />
        </div>
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

      {tab === 'connector' && <ConnectorTab userId={userId} config={config} ledgers={ledgers} jobs={jobs} online={online} />}
      {tab === 'ledgers' && (
        <LedgersTab
          userId={userId}
          config={config}
          ledgers={ledgers}
          jobs={jobs}
          customers={customers}
          online={online}
          onCustomerAdded={(c) => setCustomers((prev) => [...prev, c])}
        />
      )}
      {tab === 'push' && (
        <PushTab
          userId={userId}
          config={config}
          ledgers={ledgers}
          invoices={invoices}
          customers={customers}
          jobs={jobs}
          invoiceMap={invoiceMap}
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

// "Works with Tally Prime" mark. Uses the Tally logo image dropped into the
// app's public/ folder; if it isn't present yet, a clean text fallback renders
// so the badge is never broken.
const TallyMark: React.FC = () => {
  const [imgOk, setImgOk] = useState(true);
  return (
    <span
      className="hidden sm:inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white border border-slate-200 shadow-sm"
      title="Push your invoices and ledgers to Tally Prime"
    >
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 font-poppins">Pushes to</span>
      {imgOk ? (
        <img src="/tally-logo.png" alt="Tally" className="h-8 w-auto object-contain" onError={() => setImgOk(false)} />
      ) : (
        <span className="text-lg font-black italic font-poppins" style={{ color: '#E4002B' }}>Tally</span>
      )}
    </span>
  );
};

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
  ledgers: TallyLedger[];
  jobs: SyncJob[];
  online: boolean;
}> = ({ userId, config, ledgers, jobs, online }) => {
  const [form, setForm] = useState({
    companyName: '', tallyPort: 9000, salesLedgerName: '',
    cgstLedgerName: '', sgstLedgerName: '', igstLedgerName: '',
  });
  const [saved, setSaved] = useState(false);
  const [detecting, setDetecting] = useState(false);

  // Companies the connector found open in Tally (drives the company dropdown).
  const companies = config?.discoveredCompanies || [];

  // Surface the most recent detection job so a failure isn't silent.
  const lastDetectJob = useMemo(() => {
    let latest: SyncJob | undefined;
    for (const j of jobs) {
      if (j.type !== 'FETCH_LEDGERS') continue;
      if (!latest || millis(j.createdAt) >= millis(latest.createdAt)) latest = j;
    }
    return latest;
  }, [jobs]);

  // Ledger options grouped by their Tally group, with a fallback to "all" when
  // a group can't be identified, so the user can always pick something.
  const salesOptions = useMemo(() => {
    const sales = ledgers.filter((l) => /sales/i.test(l.parent || ''));
    return (sales.length ? sales : ledgers).map((l) => l.name);
  }, [ledgers]);
  const taxOptions = useMemo(() => {
    const tax = ledgers.filter((l) => /(dut|tax|gst)/i.test(l.parent || ''));
    return (tax.length ? tax : ledgers).map((l) => l.name);
  }, [ledgers]);

  // Load saved config; pre-select GST ledgers by name when the user hasn't
  // chosen yet (e.g. a ledger literally named "CGST" / "Output CGST").
  useEffect(() => {
    if (!config) return;
    const guess = (re: RegExp) => taxOptions.find((n) => re.test(n)) || '';
    setForm((prev) => ({
      companyName: config.companyName || prev.companyName,
      tallyPort: config.tallyPort || 9000,
      salesLedgerName: config.salesLedgerName || prev.salesLedgerName,
      cgstLedgerName: config.cgstLedgerName || prev.cgstLedgerName || guess(/cgst/i),
      sgstLedgerName: config.sgstLedgerName || prev.sgstLedgerName || guess(/sgst|utgst/i),
      igstLedgerName: config.igstLedgerName || prev.igstLedgerName || guess(/igst/i),
    }));
  }, [config, taxOptions]);

  const handleDetect = async () => {
    setDetecting(true);
    try {
      await enqueueSyncJob(userId, { type: 'FETCH_LEDGERS', createdBy: userId });
    } finally {
      // Live config/ledger subscriptions repopulate the dropdowns shortly after.
      setTimeout(() => setDetecting(false), 1800);
    }
  };

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
        <p className="text-sm text-slate-500 font-poppins mb-4">
          Click <b>Detect from Tally</b> and pick from the lists — no typing exact names.
        </p>

        {/* Detect: pulls open companies + ledgers from Tally into the dropdowns. */}
        <button
          onClick={handleDetect}
          disabled={!online || detecting}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold font-poppins text-sm transition-all ${
            online && !detecting
              ? 'bg-slate-800 text-white hover:opacity-90 active:scale-95'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
        >
          <RefreshCw size={16} className={detecting ? 'animate-spin' : ''} />
          {detecting ? 'Detecting…' : 'Detect from Tally'}
        </button>
        {!online ? (
          <p className="text-xs text-amber-600 font-poppins mt-2 flex items-center gap-1.5">
            <Clock size={13} /> Pair the connector and keep Tally open, then detect.
          </p>
        ) : companies.length === 0 && ledgers.length === 0 ? (
          <p className="text-xs text-slate-400 font-poppins mt-2">
            Loads the company open in Tally and its ledgers into the lists below.
          </p>
        ) : companies.length > 1 && !form.companyName ? (
          <p className="text-xs text-amber-600 font-poppins mt-2">
            Multiple companies are open — pick the one to sync below, then Save &amp; Detect again.
          </p>
        ) : null}

        {/* Live result of the last Detect, so a failure is never silent. */}
        {lastDetectJob && (
          <div className="mt-3">
            {lastDetectJob.status === 'failed' ? (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-600 font-poppins">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                <span>
                  <b>Detect failed.</b> {lastDetectJob.error || 'The connector could not reach Tally.'}
                  <br />Check that Tally is open and its gateway is on (F1 → Settings → Connectivity → Both, port 9000).
                </span>
              </div>
            ) : lastDetectJob.status === 'success' ? (
              <p className="text-xs text-emerald-600 font-poppins flex items-center gap-1.5">
                <CheckCircle2 size={13} /> Detected {companies.length || 0} company(ies) and {ledgers.length} ledger(s).
              </p>
            ) : (
              <p className="text-xs text-sky-600 font-poppins flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin" /> Talking to the connector…
              </p>
            )}
          </div>
        )}

        <div className="space-y-4 mt-5">
          <Field label="Tally company" hint={companies.length ? 'Detected from Tally' : 'Detect first, or type it exactly'}>
            <LedgerSelect
              value={form.companyName}
              onChange={(v) => setForm({ ...form, companyName: v })}
              options={companies}
              placeholder="Select company"
              emptyText="e.g. Acme Traders Pvt Ltd"
            />
          </Field>
          <Field label="Default sales ledger" hint="The credit ledger sales post to (pick your usual one)">
            <LedgerSelect
              value={form.salesLedgerName}
              onChange={(v) => setForm({ ...form, salesLedgerName: v })}
              options={salesOptions}
              placeholder="Select sales ledger"
              emptyText="e.g. Sales Accounts"
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

          <Field label="GST tax ledgers" hint="Auto-detected by name — change any that differ in your Tally">
            <div className="grid grid-cols-3 gap-2">
              <LedgerSelect value={form.cgstLedgerName} onChange={(v) => setForm({ ...form, cgstLedgerName: v })} options={taxOptions} placeholder="CGST" emptyText="CGST" compact />
              <LedgerSelect value={form.sgstLedgerName} onChange={(v) => setForm({ ...form, sgstLedgerName: v })} options={taxOptions} placeholder="SGST" emptyText="SGST" compact />
              <LedgerSelect value={form.igstLedgerName} onChange={(v) => setForm({ ...form, igstLedgerName: v })} options={taxOptions} placeholder="IGST" emptyText="IGST" compact />
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

// Common Tally groups offered in the New/Edit ledger form (free text still allowed).
const TALLY_GROUPS = [
  'Sundry Debtors', 'Sundry Creditors', 'Sales Accounts', 'Purchase Accounts',
  'Duties & Taxes', 'Direct Expenses', 'Indirect Expenses', 'Direct Incomes',
  'Indirect Incomes', 'Bank Accounts', 'Cash-in-Hand', 'Current Assets',
  'Current Liabilities', 'Fixed Assets', 'Loans (Liability)', 'Capital Account',
];

interface LedgerFormValues {
  name: string; parent: string; gstin: string; address: string; state: string; pincode: string;
}

const LedgersTab: React.FC<{
  userId: string;
  config: TallyConfig | null;
  ledgers: TallyLedger[];
  jobs: SyncJob[];
  customers: Customer[];
  online: boolean;
  onCustomerAdded: (c: Customer) => void;
}> = ({ userId, config, ledgers, jobs, customers, online, onCustomerAdded }) => {
  const [enqueuing, setEnqueuing] = useState(false);
  const [search, setSearch] = useState('');
  // null = closed; { mode:'create' } or { mode:'edit', ledger } when open.
  const [form, setForm] = useState<{ mode: 'create' | 'edit'; ledger?: TallyLedger } | null>(null);
  // Tally ledger currently being imported into BillHippo as a customer.
  const [importLedger, setImportLedger] = useState<TallyLedger | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Segmented view + bulk-create selection (BillHippo customers → Tally ledgers).
  const [view, setView] = useState<'tally' | 'toCreate' | 'toImport'>('tally');
  const [selectedCust, setSelectedCust] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const isParty = (l: TallyLedger) => /debtor|creditor/i.test(l.parent || '');

  // The BillHippo customer that genuinely represents this ledger — matched by
  // GSTIN (authoritative) or exact customer name only. We deliberately do NOT
  // match on a customer's saved tallyLedgerName, since that's a mapping pointer
  // (it caused ledgers to be wrongly flagged "In BillHippo").
  const matchCustomer = (l: TallyLedger): Customer | undefined =>
    (l.gstin ? customers.find((c) => c.gstin && c.gstin.toLowerCase() === l.gstin!.toLowerCase()) : undefined) ||
    customers.find((c) => c.name.trim().toLowerCase() === l.name.trim().toLowerCase());

  const inBillHippo = (l: TallyLedger) => !!matchCustomer(l);

  // Does a BillHippo customer already exist as a Tally ledger (by GSTIN or name)?
  const customerInTally = (c: Customer) =>
    ledgers.some((l) =>
      (c.gstin && l.gstin && c.gstin.toLowerCase() === l.gstin.toLowerCase()) ||
      l.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
    );

  const latestCreateJobByCustomer = useMemo(() => {
    const m = new Map<string, SyncJob>();
    for (const j of jobs) {
      if (j.type !== 'CREATE_LEDGER' || !j.customerId) continue;
      const p = m.get(j.customerId);
      if (!p || millis(j.createdAt) >= millis(p.createdAt)) m.set(j.customerId, j);
    }
    return m;
  }, [jobs]);

  // The three segmented lists (search-filtered).
  const q = search.trim().toLowerCase();
  const matchQ = (name: string, gstin?: string) =>
    !q || name.toLowerCase().includes(q) || (gstin || '').toLowerCase().includes(q);
  const tallyList = useMemo(() => ledgers.filter((l) => matchQ(l.name, l.gstin)), [ledgers, q]);
  const toCreateList = useMemo(
    () => customers.filter((c) => !customerInTally(c) && matchQ(c.name, c.gstin)),
    [customers, ledgers, q],
  );
  const toImportList = useMemo(
    () => ledgers.filter((l) => isParty(l) && !inBillHippo(l) && matchQ(l.name, l.gstin)),
    [ledgers, customers, q],
  );

  const toggleCust = (id: string) => setSelectedCust((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allCreateSelected = toCreateList.length > 0 && toCreateList.every((c) => selectedCust.has(c.id));
  const toggleAllCreate = () =>
    setSelectedCust(() => (allCreateSelected ? new Set() : new Set(toCreateList.map((c) => c.id))));

  const createLedgerForCustomer = (id: string) =>
    enqueueSyncJob(userId, {
      type: 'CREATE_LEDGER',
      customerId: id,
      createdBy: userId,
      payloadSnapshot: { customerName: customers.find((c) => c.id === id)?.name || '' },
    });

  const handleBulkCreate = async () => {
    setBulkBusy(true);
    try {
      const ids = [...selectedCust].filter((id) => toCreateList.some((c) => c.id === id));
      for (const id of ids) await createLedgerForCustomer(id);
      setSelectedCust(new Set());
      setNotice(`Queued ${ids.length} ledger(s) to create in Tally.`);
      setTimeout(() => setNotice(null), 4000);
    } finally { setBulkBusy(false); }
  };

  const handleImport = async (values: ImportCustomerValues) => {
    const id = await addCustomer(userId, {
      name: values.name.trim(),
      gstin: values.gstin.trim().toUpperCase() || undefined,
      phone: values.phone.trim(),
      email: values.email.trim(),
      address: values.address.trim(),
      city: values.city.trim(),
      state: values.state.trim(),
      pincode: values.pincode.trim(),
      balance: 0,
      // Pre-map to the Tally ledger so invoices for this customer push without
      // any re-matching, using GSTIN as authoritative when present.
      tallyLedgerName: values.name.trim(),
      tallyMatchType: values.gstin.trim() ? 'gstin' : 'name',
    });
    onCustomerAdded({
      id,
      name: values.name.trim(),
      gstin: values.gstin.trim().toUpperCase() || undefined,
      phone: values.phone.trim(),
      email: values.email.trim(),
      address: values.address.trim(),
      city: values.city.trim(),
      state: values.state.trim(),
      pincode: values.pincode.trim(),
      balance: 0,
      tallyLedgerName: values.name.trim(),
      tallyMatchType: values.gstin.trim() ? 'gstin' : 'name',
    });
    const name = values.name.trim();
    setImportLedger(null);
    setNotice(`Added “${name}” to BillHippo customers.`);
    setTimeout(() => setNotice(null), 4000);
  };

  const handleVerify = async () => {
    setEnqueuing(true);
    try {
      await enqueueSyncJob(userId, { type: 'FETCH_LEDGERS', createdBy: userId });
    } finally {
      setEnqueuing(false);
    }
  };

  // Latest create/alter job, so we can show a small success/failure note.
  const lastLedgerJob = useMemo(() => {
    let latest: SyncJob | undefined;
    for (const j of jobs) {
      if (j.type !== 'CREATE_LEDGER' && j.type !== 'ALTER_LEDGER') continue;
      if (!latest || millis(j.createdAt) >= millis(latest.createdAt)) latest = j;
    }
    return latest;
  }, [jobs]);

  // Latest "Verify ledgers" (FETCH_LEDGERS) job, for live verify feedback.
  const lastFetchJob = useMemo(() => {
    let latest: SyncJob | undefined;
    for (const j of jobs) {
      if (j.type !== 'FETCH_LEDGERS') continue;
      if (!latest || millis(j.createdAt) >= millis(latest.createdAt)) latest = j;
    }
    return latest;
  }, [jobs]);

  const submitLedger = async (values: LedgerFormValues, mode: 'create' | 'edit') => {
    await enqueueSyncJob(userId, {
      type: mode === 'edit' ? 'ALTER_LEDGER' : 'CREATE_LEDGER',
      createdBy: userId,
      payloadSnapshot: {
        name: values.name.trim(),
        parent: values.parent.trim(),
        gstin: values.gstin.trim().toUpperCase(),
        address: values.address.trim(),
        state: values.state.trim(),
        pincode: values.pincode.trim(),
      },
    });
    setForm(null);
  };

  return (
    <div>
      <div className="bg-white rounded-3xl border border-slate-100 p-6 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-800 font-poppins">Ledgers (two-way)</h2>
          <p className="text-sm text-slate-500 font-poppins mt-1">
            Match Tally ↔ BillHippo: import Tally parties into BillHippo, or create BillHippo
            customers as Tally ledgers — individually or in bulk.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setForm({ mode: 'create' })}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 text-white font-bold font-poppins text-sm hover:opacity-90 active:scale-95 transition-all"
          >
            <Plus size={18} /> New ledger
          </button>
          <button
            onClick={handleVerify}
            disabled={enqueuing}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-profee-blue text-white font-bold font-poppins text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-60"
          >
            {enqueuing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            Verify ledgers
          </button>
        </div>
      </div>

      {!online && (
        <Banner tone="amber">
          The connector is offline, so this request will queue and run as soon as the connector
          comes online with Tally open.
        </Banner>
      )}

      {notice && (
        <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 font-poppins">
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}

      {lastFetchJob && (
        lastFetchJob.status === 'processing' || lastFetchJob.status === 'pending' ? (
          <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-2xl bg-sky-50 border border-sky-100 text-sm text-sky-700 font-poppins">
            <Loader2 size={18} className="animate-spin" /> Verifying ledgers with Tally…
          </div>
        ) : lastFetchJob.status === 'failed' ? (
          <Banner tone="amber">
            Verify ledgers failed: {lastFetchJob.error || 'unknown error'}.
            {/9000|ECONNREFUSED/i.test(lastFetchJob.error || '') && <> Open Tally with your company loaded and the gateway on (port 9000), then Verify again.</>}
          </Banner>
        ) : lastFetchJob.status === 'success' ? (
          <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 font-poppins">
            <CheckCircle2 size={18} /> Synced {ledgers.length} ledger(s){config?.companyName ? ` from “${config.companyName}”` : ''}.
          </div>
        ) : null
      )}

      {lastLedgerJob && (
        lastLedgerJob.status === 'failed' ? (
          <Banner tone="amber">
            Last ledger {lastLedgerJob.type === 'ALTER_LEDGER' ? 'edit' : 'creation'} failed: {lastLedgerJob.error || 'unknown error'}.
            {/9000|ECONNREFUSED/i.test(lastLedgerJob.error || '') && <> Tally isn't reachable — open Tally with the company loaded and the gateway on (port 9000), then retry.</>}
          </Banner>
        ) : lastLedgerJob.status === 'success' ? (
          <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700 font-poppins">
            <CheckCircle2 size={18} /> Ledger {lastLedgerJob.type === 'ALTER_LEDGER' ? 'updated in' : 'created in'} Tally.
          </div>
        ) : (
          <div className="mb-6 flex items-center gap-2 px-4 py-3 rounded-2xl bg-sky-50 border border-sky-100 text-sm text-sky-700 font-poppins">
            <Loader2 size={18} className="animate-spin" /> Sending ledger to Tally…
          </div>
        )
      )}

      {/* Segmented view: in Tally · only in BillHippo · only in Tally */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {([
          ['tally', `All ledgers (${ledgers.length})`],
          ['toCreate', `Only in BillHippo → create in Tally (${toCreateList.length})`],
          ['toImport', `Only in Tally → import (${toImportList.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => { setView(key); setSelectedCust(new Set()); }}
            className={`px-4 py-2 rounded-2xl text-xs font-bold font-poppins transition-colors ${
              view === key ? 'bg-profee-blue text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <Search size={16} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or GSTIN…"
            className="flex-1 text-sm font-poppins focus:outline-none"
          />
          {view === 'toCreate' && (
            <button
              onClick={handleBulkCreate}
              disabled={selectedCust.size === 0 || bulkBusy}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold font-poppins transition-all ${
                selectedCust.size > 0 && !bulkBusy ? 'bg-slate-800 text-white hover:opacity-90 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Create in Tally{selectedCust.size ? ` (${selectedCust.size})` : ''}
            </button>
          )}
        </div>

        {/* IN TALLY */}
        {view === 'tally' && (
          tallyList.length === 0 ? (
            <EmptyState icon={BookOpen} title="No ledgers" subtitle="Click 'Verify ledgers' to pull them from Tally, or 'New ledger' to create one." />
          ) : (
            <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
              {tallyList.map((l) => {
                const party = isParty(l);
                const imported = inBillHippo(l);
                return (
                  <div key={l.id} className="px-5 py-3 flex items-center gap-3 group">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-700 font-poppins text-sm truncate">{l.name}</p>
                      <p className="text-xs text-slate-400 font-poppins">{l.parent && l.parent !== '[object Object]' ? l.parent : '—'}</p>
                    </div>
                    {l.gstin && <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded-md hidden sm:inline">{l.gstin}</span>}
                    {party && (imported ? (
                      <span title={`Customer in BillHippo: ${matchCustomer(l)?.name || ''}`} className="inline-flex items-center gap-1 text-[11px] font-bold font-poppins text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0"><CheckCircle2 size={12} /> In BillHippo</span>
                    ) : (
                      <button onClick={() => setImportLedger(l)} title="Add this Tally party as a BillHippo customer" className="inline-flex items-center gap-1 text-xs font-bold font-poppins text-emerald-600 hover:underline flex-shrink-0"><Plus size={13} /> Import</button>
                    ))}
                    <button onClick={() => setForm({ mode: 'edit', ledger: l })} className="inline-flex items-center gap-1 text-xs font-bold font-poppins text-profee-blue hover:underline flex-shrink-0"><Pencil size={13} /> Edit</button>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ONLY IN BILLHIPPO → CREATE IN TALLY (bulk) */}
        {view === 'toCreate' && (
          toCreateList.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="All customers are in Tally" subtitle="Every BillHippo customer already has a matching Tally ledger." />
          ) : (
            <>
              <div className="px-5 py-2 border-b border-slate-50 flex items-center gap-3 bg-slate-50/50">
                <input type="checkbox" checked={allCreateSelected} onChange={toggleAllCreate} className="accent-profee-blue" title="Select all" />
                <span className="text-[11px] uppercase tracking-wide text-slate-400 font-poppins font-bold">Tick customers to create them as Tally ledgers</span>
              </div>
              <div className="divide-y divide-slate-50 max-h-[460px] overflow-y-auto">
                {toCreateList.map((c) => {
                  const job = latestCreateJobByCustomer.get(c.id);
                  const creating = job && job.status !== 'failed' && job.status !== 'success';
                  return (
                    <div key={c.id} className="px-5 py-3 flex items-center gap-3">
                      <input type="checkbox" checked={selectedCust.has(c.id)} onChange={() => toggleCust(c.id)} className="accent-profee-blue" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-700 font-poppins text-sm truncate">{c.name}</p>
                        <p className="text-xs text-slate-400 font-poppins">{[c.city, c.state].filter(Boolean).join(', ') || 'Will be created under Sundry Debtors'}</p>
                      </div>
                      {c.gstin && <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded-md hidden sm:inline">{c.gstin}</span>}
                      {job?.status === 'success' ? (
                        <span className="text-[11px] font-bold font-poppins text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 size={12} /> Created</span>
                      ) : creating ? (
                        <span className="text-[11px] font-bold font-poppins text-sky-600 inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Creating…</span>
                      ) : (
                        <button onClick={() => createLedgerForCustomer(c.id)} className="inline-flex items-center gap-1 text-xs font-bold font-poppins text-slate-700 hover:underline flex-shrink-0"><Plus size={13} /> {job?.status === 'failed' ? 'Retry' : 'Create in Tally'}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )
        )}

        {/* ONLY IN TALLY → IMPORT TO BILLHIPPO */}
        {view === 'toImport' && (
          toImportList.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No unmatched Tally parties" subtitle="Every Tally party ledger already exists in BillHippo." />
          ) : (
            <div className="divide-y divide-slate-50 max-h-[480px] overflow-y-auto">
              {toImportList.map((l) => (
                <div key={l.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-700 font-poppins text-sm truncate">{l.name}</p>
                    <p className="text-xs text-slate-400 font-poppins">{l.parent && l.parent !== '[object Object]' ? l.parent : '—'}</p>
                  </div>
                  {l.gstin && <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded-md hidden sm:inline">{l.gstin}</span>}
                  <button onClick={() => setImportLedger(l)} className="inline-flex items-center gap-1 text-xs font-bold font-poppins text-emerald-600 hover:underline flex-shrink-0"><Plus size={13} /> Import to BillHippo</button>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {form && (
        <LedgerForm
          mode={form.mode}
          ledger={form.ledger}
          groupOptions={TALLY_GROUPS}
          canImport={form.mode === 'edit' && !!form.ledger && isParty(form.ledger) && !inBillHippo(form.ledger)}
          customerMatch={form.ledger ? matchCustomer(form.ledger) : undefined}
          onImport={() => { const l = form.ledger || null; setForm(null); setImportLedger(l); }}
          onClose={() => setForm(null)}
          onSubmit={(values) => submitLedger(values, form.mode)}
        />
      )}

      {importLedger && (
        <ImportCustomerForm
          ledger={importLedger}
          customerMatch={matchCustomer(importLedger)}
          onClose={() => setImportLedger(null)}
          onSubmit={handleImport}
        />
      )}
    </div>
  );
};

// ── New / Edit ledger modal ───────────────────────────────────────────────────

const LedgerForm: React.FC<{
  mode: 'create' | 'edit';
  ledger?: TallyLedger;
  groupOptions: string[];
  canImport?: boolean;
  customerMatch?: Customer;
  onImport?: () => void;
  onClose: () => void;
  onSubmit: (values: LedgerFormValues) => Promise<void>;
}> = ({ mode, ledger, groupOptions, canImport, customerMatch, onImport, onClose, onSubmit }) => {
  const [values, setValues] = useState<LedgerFormValues>({
    name: ledger?.name || '',
    parent: ledger?.parent && ledger.parent !== '[object Object]' ? ledger.parent : 'Sundry Debtors',
    gstin: ledger?.gstin || customerMatch?.gstin || '',
    address: ledger?.address || customerMatch?.address || '',
    state: ledger?.state || customerMatch?.state || '',
    pincode: ledger?.pincode || customerMatch?.pincode || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k: keyof LedgerFormValues, v: string) => setValues((p) => ({ ...p, [k]: v }));
  const canSave = values.name.trim() && values.parent.trim();

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try { await onSubmit(values); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800 font-poppins mb-1">
          {mode === 'edit' ? 'Edit ledger in Tally' : 'New ledger in Tally'}
        </h3>
        <p className="text-xs text-slate-500 font-poppins mb-4">
          {mode === 'edit'
            ? 'Change a value and Save to update it in Tally. Leave address fields blank to keep what Tally already has.'
            : 'Creates the ledger in your open Tally company via the connector.'}
        </p>

        {canImport && onImport && (
          <button
            onClick={onImport}
            className="w-full mb-4 py-2.5 rounded-2xl bg-emerald-50 text-emerald-700 font-bold font-poppins text-sm hover:bg-emerald-100 transition-colors inline-flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Import this party into BillHippo as a customer
          </button>
        )}

        <div className="space-y-3">
          <Field label="Ledger name">
            <input
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              disabled={mode === 'edit'}
              placeholder="e.g. Acme Traders Pvt Ltd"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30 disabled:bg-slate-50 disabled:text-slate-400"
            />
          </Field>
          {mode === 'edit' && <p className="-mt-2 text-[11px] text-slate-400 font-poppins">Renaming isn't supported here — create a new ledger if you need a different name.</p>}

          <Field label="Group" hint="Pick a Tally group or type your own">
            <input
              list="tally-groups"
              value={values.parent}
              onChange={(e) => set('parent', e.target.value)}
              placeholder="e.g. Sundry Debtors"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30"
            />
            <datalist id="tally-groups">
              {groupOptions.map((g) => <option key={g} value={g} />)}
            </datalist>
          </Field>

          <Field label="GSTIN" hint="Optional — for party ledgers">
            <input
              value={values.gstin}
              onChange={(e) => set('gstin', e.target.value.toUpperCase())}
              placeholder="e.g. 24ABCDE1234F1Z5"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm font-mono focus:outline-none focus:ring-2 focus:ring-profee-blue/30"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="State"><input value={values.state} onChange={(e) => set('state', e.target.value)} placeholder="Gujarat" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30" /></Field>
            <Field label="Pincode"><input value={values.pincode} onChange={(e) => set('pincode', e.target.value)} placeholder="380001" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30" /></Field>
          </div>
          <Field label="Address" hint="Optional">
            <input value={values.address} onChange={(e) => set('address', e.target.value)} placeholder="Street, City" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30" />
          </Field>
        </div>

        <div className="flex items-center gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-slate-600 font-bold font-poppins text-sm hover:bg-slate-50 transition-colors">Cancel</button>
          <button
            onClick={submit}
            disabled={!canSave || saving}
            className="flex-1 py-2.5 rounded-2xl bg-profee-blue text-white font-bold font-poppins text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {mode === 'edit' ? 'Save to Tally' : 'Create in Tally'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Import Tally ledger → BillHippo customer ───────────────────────────────────

interface ImportCustomerValues {
  name: string; gstin: string; phone: string; email: string;
  address: string; city: string; state: string; pincode: string;
}

const ImportCustomerForm: React.FC<{
  ledger: TallyLedger;
  customerMatch?: Customer;
  onClose: () => void;
  onSubmit: (values: ImportCustomerValues) => Promise<void>;
}> = ({ ledger, customerMatch, onClose, onSubmit }) => {
  const [values, setValues] = useState<ImportCustomerValues>({
    name: ledger.name || '',
    gstin: ledger.gstin || customerMatch?.gstin || '',
    phone: customerMatch?.phone || '',
    email: customerMatch?.email || '',
    address: ledger.address || customerMatch?.address || '',
    city: customerMatch?.city || '',
    state: ledger.state || customerMatch?.state || '',
    pincode: ledger.pincode || customerMatch?.pincode || '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof ImportCustomerValues, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!values.name.trim()) return;
    setSaving(true);
    try { await onSubmit(values); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800 font-poppins mb-1">Add customer to BillHippo</h3>
        <p className="text-xs text-slate-500 font-poppins mb-5">
          Imported from Tally ledger <b>“{ledger.name}”</b>. It will be linked to this ledger, so
          invoices you raise for it push straight to Tally.
        </p>

        <div className="space-y-3">
          <Field label="Customer name">
            <input value={values.name} onChange={(e) => set('name', e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30" />
          </Field>
          <Field label="GSTIN" hint="Authoritative match key when present">
            <input value={values.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="24ABCDE1234F1Z5" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm font-mono focus:outline-none focus:ring-2 focus:ring-profee-blue/30" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Phone"><input value={values.phone} onChange={(e) => set('phone', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30" /></Field>
            <Field label="Email"><input value={values.email} onChange={(e) => set('email', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30" /></Field>
          </div>
          <Field label="Address"><input value={values.address} onChange={(e) => set('address', e.target.value)} placeholder="Street" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30" /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="City"><input value={values.city} onChange={(e) => set('city', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30" /></Field>
            <Field label="State"><input value={values.state} onChange={(e) => set('state', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30" /></Field>
            <Field label="Pincode"><input value={values.pincode} onChange={(e) => set('pincode', e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-poppins text-sm focus:outline-none focus:ring-2 focus:ring-profee-blue/30" /></Field>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-2xl border border-slate-200 text-slate-600 font-bold font-poppins text-sm hover:bg-slate-50 transition-colors">Cancel</button>
          <button
            onClick={submit}
            disabled={!values.name.trim() || saving}
            className="flex-1 py-2.5 rounded-2xl bg-emerald-600 text-white font-bold font-poppins text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add customer
          </button>
        </div>
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
  invoiceMap: Record<string, TallyInvoiceMapping>;
  loading: boolean;
  online: boolean;
  onCustomerMapped: (c: Customer) => void;
}> = ({ userId, config, ledgers, invoices, customers, jobs, invoiceMap, loading, onCustomerMapped }) => {
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [hideSynced, setHideSynced] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [failedOnly, setFailedOnly] = useState(false);
  // Period filter: 'all' | 'custom' | 'fy:<year>' | '<YYYY-MM>'.
  const [period, setPeriod] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [busy, setBusy] = useState<'idle' | 'saving' | 'pushing'>('idle');
  // In-progress, unsaved per-row ledger choices.
  const [edits, setEdits] = useState<Record<string, { party?: string; sales?: string; cgst?: string; sgst?: string; igst?: string }>>({});

  // Ledger options for the editable dropdowns, sourced from real Tally ledgers
  // so the user can never mistype a name (this is what prevents the CGST/SGST
  // style mismatch errors).
  const partyOptions = useMemo(
    () => ledgers.filter((l) => /debtor|creditor/i.test(l.parent || '')).map((l) => l.name),
    [ledgers],
  );
  const salesOptions = useMemo(() => {
    const s = ledgers.filter((l) => /sales/i.test(l.parent || ''));
    return (s.length ? s : ledgers).map((l) => l.name);
  }, [ledgers]);
  const taxOptions = useMemo(
    () => ledgers.filter((l) => /(dut|tax|gst)/i.test(l.parent || '')).map((l) => l.name),
    [ledgers],
  );

  // Period dropdown options derived ONLY from the months/financial years that
  // actually have invoices — so the user never scrolls through empty periods.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthLabel = (ym: string) => {
    const [y, m] = ym.split('-');
    return `${MONTHS[Number(m) - 1] || m} ${y}`;
  };
  const fyLabel = (start: number) => `FY ${start}-${String(start + 1).slice(2)}`;
  const fyStartOf = (date: string) => {
    const yr = Number(date.slice(0, 4));
    const mo = Number(date.slice(5, 7));
    return mo >= 4 ? yr : yr - 1; // Indian FY: Apr–Mar
  };
  const { monthOptions, fyOptions } = useMemo(() => {
    const months = new Set<string>();
    const fys = new Set<number>();
    for (const inv of invoices) {
      const d = (inv.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(d)) {
        months.add(d);
        fys.add(fyStartOf(inv.date || ''));
      }
    }
    return {
      monthOptions: Array.from(months).sort().reverse(),
      fyOptions: Array.from(fys).sort((a, b) => b - a),
    };
  }, [invoices]);

  // Pick the Tally tax ledger that matches a GST rate (e.g. 9 → "CGST 9",
  // 2.5 → "CGST 2.5%"), so different-rate invoices post to the right ledger.
  const numStr = (n: number) => (Number.isInteger(n) ? String(n) : String(n));
  const pickTax = (re: RegExp, num: number, fallback: string) => {
    if (num > 0) {
      const hit = ledgers.find(
        (l) => /(dut|tax|gst)/i.test(l.parent || '') && re.test(l.name) && l.name.includes(numStr(num)),
      );
      if (hit) return hit.name;
    }
    return fallback;
  };
  // Uniform GST rate across the invoice's items; -1 means mixed rates.
  const invoiceRate = (inv: Invoice): number => {
    const rates = Array.from(new Set((inv.items || []).map((i) => Number(i.gstRate) || 0).filter((r) => r > 0)));
    if (!rates.length) return 0;
    return rates.length === 1 ? rates[0] : -1;
  };
  // Sales ledger whose name encodes a rate (e.g. "Sales 18", "Sales @5%").
  const pickSales = (rate: number, fallback: string) => {
    if (rate > 0) {
      const hit = ledgers.find((l) => /sales/i.test(l.parent || '') && l.name.includes(numStr(rate)));
      if (hit) return hit.name;
    }
    return fallback;
  };
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

  // Build the voucher lines for an invoice: one per GST rate. Single-rate uses
  // the row's chosen ledgers + invoice totals; mixed-rate splits per rate with
  // ledgers auto-resolved from the rate.
  const buildLines = (r: { inv: Invoice; isIgst: boolean; sales: string; cgst: string; sgst: string; igst: string }) => {
    const inv = r.inv;
    const groups = new Map<number, number>(); // rate → taxable
    for (const it of inv.items || []) {
      const rt = Number(it.gstRate) || 0;
      groups.set(rt, (groups.get(rt) || 0) + (Number(it.quantity) || 0) * (Number(it.rate) || 0));
    }
    if (groups.size <= 1) {
      return [{
        taxable: Number(inv.totalBeforeTax) || 0,
        cgst: Number(inv.cgst) || 0,
        sgst: Number(inv.sgst) || 0,
        igst: Number(inv.igst) || 0,
        salesLedgerName: r.sales,
        cgstLedgerName: r.cgst,
        sgstLedgerName: r.sgst,
        igstLedgerName: r.igst,
      }];
    }
    const lines: Record<string, unknown>[] = [];
    for (const [rate, taxable] of groups) {
      const half = rate / 2;
      const cgstAmt = round2((taxable * half) / 100);
      const igstAmt = round2((taxable * rate) / 100);
      lines.push({
        taxable: round2(taxable),
        cgst: r.isIgst ? 0 : cgstAmt,
        sgst: r.isIgst ? 0 : cgstAmt,
        igst: r.isIgst ? igstAmt : 0,
        salesLedgerName: pickSales(rate, r.sales),
        cgstLedgerName: pickTax(/cgst/i, half, config?.cgstLedgerName || 'CGST'),
        sgstLedgerName: pickTax(/sgst|utgst/i, half, config?.sgstLedgerName || 'SGST'),
        igstLedgerName: pickTax(/igst/i, rate, config?.igstLedgerName || 'IGST'),
      });
    }
    return lines;
  };

  // Warn when the global sales/tax ledgers in settings don't exist in Tally —
  // the usual cause of "nothing created or altered" push failures.
  const missingConfigLedgers = useMemo(() => {
    if (!ledgers.length) return [] as string[];
    const names = new Set(ledgers.map((l) => l.name.toLowerCase()));
    const effective = [
      config?.salesLedgerName,
      config?.cgstLedgerName || 'CGST',
      config?.sgstLedgerName || 'SGST',
      config?.igstLedgerName || 'IGST',
    ];
    const seen = new Set<string>();
    const missing: string[] = [];
    for (const n of effective) {
      if (!n) continue;
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (!names.has(key)) missing.push(n);
    }
    return missing;
  }, [ledgers, config]);

  const latestJobByInvoice = useMemo(() => {
    const map = new Map<string, SyncJob>();
    for (const j of jobs) {
      if (j.type !== 'PUSH_INVOICE' || !j.invoiceId) continue;
      const prev = map.get(j.invoiceId);
      if (!prev || millis(j.createdAt) >= millis(prev.createdAt)) map.set(j.invoiceId, j);
    }
    return map;
  }, [jobs]);

  const latestCreateJobByCustomer = useMemo(() => {
    const map = new Map<string, SyncJob>();
    for (const j of jobs) {
      if (j.type !== 'CREATE_LEDGER' || !j.customerId) continue;
      const prev = map.get(j.customerId);
      if (!prev || millis(j.createdAt) >= millis(prev.createdAt)) map.set(j.customerId, j);
    }
    return map;
  }, [jobs]);

  // Resolve each row's effective Party + Sales ledger from: live edit → saved
  // mapping → customer mapping / auto-match → default sales ledger.
  const rows = useMemo(() => invoices.map((inv) => {
    const customer = customerById.get(inv.customerId);
    const resolved = resolvePartyLedger(customer ?? { name: inv.customerName, gstin: undefined }, ledgers);
    const job = latestJobByInvoice.get(inv.id);
    const createJob = inv.customerId ? latestCreateJobByCustomer.get(inv.customerId) : undefined;
    const saved = invoiceMap[inv.id];
    const edit = edits[inv.id];
    const party = edit?.party ?? saved?.partyLedgerName ?? customer?.tallyLedgerName ?? resolved.tallyLedgerName ?? '';
    const sales = edit?.sales ?? saved?.salesLedgerName ?? config?.salesLedgerName ?? '';
    // GST rate → rate-matched tax ledgers (editable, saved per invoice).
    const rate = invoiceRate(inv);
    const isIgst = Number(inv.igst) > 0;
    const half = rate > 0 ? rate / 2 : 0;
    const cgst = edit?.cgst ?? saved?.cgstLedgerName ?? pickTax(/cgst/i, half, config?.cgstLedgerName || 'CGST');
    const sgst = edit?.sgst ?? saved?.sgstLedgerName ?? pickTax(/sgst|utgst/i, half, config?.sgstLedgerName || 'SGST');
    const igst = edit?.igst ?? saved?.igstLedgerName ?? pickTax(/igst/i, rate > 0 ? rate : 0, config?.igstLedgerName || 'IGST');
    const mappable = !!party && !!sales;
    return {
      inv, customer, resolved, job, createJob, saved, party, sales,
      rate, isIgst, cgst, sgst, igst,
      gstin: customer?.gstin || '',
      placeOfSupply: customer?.state || '',
      synced: job?.status === 'success',
      // A push is in flight (queued or running) — the Push button must lock so a
      // double/triple click can't enqueue the same voucher more than once.
      inFlight: job?.status === 'pending' || job?.status === 'processing',
      isSaved: !!saved,
      dirty: !!edit,
      mappable,
      // Only a saved-and-unchanged row may be pushed (user's explicit rule).
      pushable: mappable && !!saved && !edit,
      selectable: mappable,
    };
  }), [invoices, customerById, ledgers, latestJobByInvoice, latestCreateJobByCustomer, invoiceMap, edits, config]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (hideSynced && r.synced) return false;
      if (savedOnly && !r.isSaved) return false;
      if (failedOnly && r.job?.status !== 'failed') return false;
      const d = r.inv.date || '';
      if (period === 'custom') {
        if (customFrom && d < customFrom) return false;
        if (customTo && d > customTo) return false;
      } else if (period.startsWith('fy:')) {
        if (fyStartOf(d) !== Number(period.slice(3))) return false;
      } else if (period !== 'all') {
        if (!d.startsWith(period)) return false;
      }
      if (!q) return true;
      return r.inv.invoiceNumber.toLowerCase().includes(q)
        || r.inv.customerName.toLowerCase().includes(q)
        || (r.gstin || '').toLowerCase().includes(q);
    });
  }, [rows, search, hideSynced, savedOnly, failedOnly, period, customFrom, customTo]);

  type Row = typeof rows[number];
  const selectableVisible = visibleRows.filter((r) => r.selectable);
  const allSelected = selectableVisible.length > 0 && selectableVisible.every((r) => selected.has(r.inv.id));

  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(selectableVisible.map((r) => r.inv.id))));
  const toggleOne = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const setEdit = (id: string, key: 'party' | 'sales' | 'cgst' | 'sgst' | 'igst', value: string) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));
  const clearEdit = (id: string) => setEdits((prev) => { const n = { ...prev }; delete n[id]; return n; });

  // Persist a row's mapping (party + sales + rate-matched tax ledgers).
  const saveRow = async (r: Row) => {
    if (!r.party) return;
    if (r.customer && r.customer.tallyLedgerName !== r.party) {
      const matchType: 'gstin' | 'name' = r.customer.gstin ? 'gstin' : 'name';
      await updateCustomer(userId, r.customer.id, { tallyLedgerName: r.party, tallyMatchType: matchType });
      onCustomerMapped({ ...r.customer, tallyLedgerName: r.party, tallyMatchType: matchType });
    }
    await saveTallyInvoiceMap(userId, r.inv.id, {
      partyLedgerName: r.party,
      salesLedgerName: r.sales,
      cgstLedgerName: r.cgst,
      sgstLedgerName: r.sgst,
      igstLedgerName: r.igst,
    });
    clearEdit(r.inv.id);
  };

  const pushRow = async (r: Row) => {
    if (!r.party) return;
    // Block re-enqueue while a push is in flight, or for an already-synced row
    // unless the user has explicitly unfrozen it by selecting its checkbox.
    if (r.inFlight) return;
    if (r.synced && !selected.has(r.inv.id)) return;
    await saveRow(r);
    await enqueueSyncJob(userId, {
      type: 'PUSH_INVOICE',
      invoiceId: r.inv.id,
      createdBy: userId,
      payloadSnapshot: {
        invoiceNumber: r.inv.invoiceNumber,
        date: r.inv.date,
        partyLedgerName: r.party,
        salesLedgerName: r.sales,
        cgstLedgerName: r.cgst,
        sgstLedgerName: r.sgst,
        igstLedgerName: r.igst,
        lines: buildLines(r),
        totalAmount: r.inv.totalAmount,
      },
    });
  };

  const saveSelected = async () => {
    setBusy('saving');
    try {
      for (const r of visibleRows.filter((r) => selected.has(r.inv.id) && r.mappable)) await saveRow(r);
      setSelected(new Set());
    } finally { setBusy('idle'); }
  };
  const pushSelected = async () => {
    setBusy('pushing');
    try {
      // Only saved rows are pushed — unsaved selections are left for review.
      for (const r of visibleRows.filter((r) => selected.has(r.inv.id) && r.pushable && !r.inFlight)) await pushRow(r);
      setSelected(new Set());
    } finally { setBusy('idle'); }
  };
  const selectedSavable = visibleRows.filter((r) => selected.has(r.inv.id) && r.mappable && (r.dirty || !r.isSaved)).length;
  const selectedPushable = visibleRows.filter((r) => selected.has(r.inv.id) && r.pushable).length;

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
      {missingConfigLedgers.length > 0 && (
        <Banner tone="amber">
          These ledgers from your settings don't exist in Tally: <b>{missingConfigLedgers.join(', ')}</b>.
          Pick the correct sales &amp; GST tax ledgers in <b>Connector → Tally settings</b> from the dropdowns and Save —
          otherwise pushes fail with "nothing created or altered".
        </Banner>
      )}

      {/* Toolbar: search · filters · bulk save/send */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 mb-4 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Search size={16} className="text-slate-400 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search invoice, party or GSTIN…"
            className="flex-1 min-w-0 text-sm font-poppins focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap text-xs font-poppins text-slate-500">
          <div className="flex items-center gap-1.5">
            <Calendar size={14} className="text-slate-400" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              title="Show invoices for a month, financial year, or custom date range"
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-poppins text-slate-600 focus:outline-none focus:ring-2 focus:ring-profee-blue/30"
            >
              <option value="all">All periods</option>
              <option value="custom">Custom range…</option>
              {fyOptions.length > 0 && (
                <optgroup label="Financial year">
                  {fyOptions.map((y) => <option key={`fy:${y}`} value={`fy:${y}`}>{fyLabel(y)}</option>)}
                </optgroup>
              )}
              {monthOptions.length > 0 && (
                <optgroup label="Month">
                  {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                </optgroup>
              )}
            </select>
          </div>
          {period === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} title="From date" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-poppins text-slate-600 focus:outline-none focus:ring-2 focus:ring-profee-blue/30" />
              <span className="text-slate-300">→</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} title="To date" className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-poppins text-slate-600 focus:outline-none focus:ring-2 focus:ring-profee-blue/30" />
            </div>
          )}
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={hideSynced} onChange={(e) => setHideSynced(e.target.checked)} className="accent-profee-blue" /> Hide synced</label>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={savedOnly} onChange={(e) => setSavedOnly(e.target.checked)} className="accent-profee-blue" /> Saved only</label>
          <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} className="accent-profee-blue" /> Failed only</label>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={saveSelected}
            disabled={selectedSavable === 0 || busy !== 'idle'}
            title="Save the chosen ledgers for the selected rows (push later)"
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl font-bold font-poppins text-sm transition-all ${
              selectedSavable > 0 && busy === 'idle' ? 'bg-slate-800 text-white hover:opacity-90 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {busy === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Save{selectedSavable ? ` (${selectedSavable})` : ''}
          </button>
          <button
            onClick={pushSelected}
            disabled={selectedPushable === 0 || busy !== 'idle'}
            title="Only saved rows are sent to Tally"
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl font-bold font-poppins text-sm transition-all ${
              selectedPushable > 0 && busy === 'idle' ? 'bg-profee-blue text-white hover:opacity-90 active:scale-95' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {busy === 'pushing' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            Send to Tally{selectedPushable ? ` (${selectedPushable})` : ''}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
        {invoices.length === 0 ? (
          <EmptyState icon={Send} title="No invoices yet" subtitle="Create invoices to push them to Tally." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-poppins">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-100 bg-slate-50/50">
                  <th className="px-3 py-3 w-10"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-profee-blue" title="Select all ready rows" /></th>
                  <th className="px-2 py-3">#</th>
                  <th className="px-3 py-3 whitespace-nowrap">Date</th>
                  <th className="px-3 py-3 whitespace-nowrap">Ref No</th>
                  <th className="px-3 py-3 whitespace-nowrap">Voucher</th>
                  <th className="px-3 py-3 min-w-[200px]">Party A/C (Tally ledger)</th>
                  <th className="px-3 py-3 whitespace-nowrap">GSTIN</th>
                  <th className="px-3 py-3 whitespace-nowrap">Place of Supply</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">Amount</th>
                  <th className="px-3 py-3 min-w-[200px]">Particulars (Sales + GST ledgers)</th>
                  <th className="px-3 py-3 whitespace-nowrap">Status</th>
                  <th className="px-3 py-3 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleRows.map((r, i) => {
                  const { inv, job, createJob, party, sales, selectable, mappable, pushable } = r;
                  const creating = createJob && createJob.status !== 'failed' && createJob.status !== 'success';
                  // A synced row is FROZEN (locked, no edits, no re-push) until the
                  // user ticks its checkbox to unfreeze it — this is what stops
                  // accidental double/triple pushes of an already-sent voucher.
                  const isChecked = selected.has(inv.id);
                  const frozen = r.synced && !isChecked;
                  const rowCls = isChecked
                    ? 'bg-profee-blue/5'
                    : r.synced
                      ? 'bg-emerald-50/70'
                      : job?.status === 'failed'
                        ? 'bg-rose-50/40'
                        : 'hover:bg-slate-50/60';
                  return (
                    <tr key={inv.id} className={rowCls}>
                      <td className="px-3 py-3 align-middle">
                        <input type="checkbox" disabled={!selectable} checked={isChecked} onChange={() => toggleOne(inv.id)} className="accent-profee-blue disabled:opacity-30" title={frozen ? 'Tick to unfreeze this pushed entry' : selectable ? 'Select' : 'Choose a Party ledger first'} />
                      </td>
                      <td className="px-2 py-3 align-middle text-slate-400">{i + 1}</td>
                      <td className="px-3 py-3 align-middle text-slate-500 whitespace-nowrap">{inv.date}</td>
                      <td className="px-3 py-3 align-middle font-bold text-slate-700 whitespace-nowrap">{inv.invoiceNumber}</td>
                      <td className="px-3 py-3 align-middle text-slate-500">Sales</td>
                      <td className="px-3 py-3 align-middle min-w-[200px]">
                        <LedgerSelect value={party} onChange={(v) => setEdit(inv.id, 'party', v)} options={partyOptions} placeholder="Select party ledger" emptyText="Type Tally party ledger" compact disabled={frozen} />
                        {party && party.toLowerCase() !== inv.customerName.toLowerCase() && (
                          <p className="mt-0.5 text-[10px] text-slate-400 font-poppins truncate max-w-[200px]" title={`BillHippo: ${inv.customerName}`}>BillHippo: {inv.customerName}</p>
                        )}
                        {!party && r.customer && (
                          <button onClick={() => handleCreateLedger(inv)} disabled={!!creating} className="mt-1 text-[11px] font-bold font-poppins text-slate-600 hover:underline inline-flex items-center gap-1 disabled:opacity-50">
                            {creating ? <><Loader2 size={11} className="animate-spin" /> Creating…</> : <><Plus size={11} /> Create in Tally</>}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle text-xs font-mono text-slate-500 whitespace-nowrap">{r.gstin || '—'}</td>
                      <td className="px-3 py-3 align-middle text-slate-500 whitespace-nowrap">{r.placeOfSupply || '—'}</td>
                      <td className="px-3 py-3 align-middle text-right font-bold text-slate-700 whitespace-nowrap">₹{inv.totalAmount.toLocaleString('en-IN')}</td>
                      <td className="px-3 py-3 align-middle min-w-[320px]">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 min-w-[130px]">
                            <LedgerSelect value={sales} onChange={(v) => setEdit(inv.id, 'sales', v)} options={salesOptions} placeholder="Select sales ledger" emptyText="Type Tally sales ledger" compact disabled={frozen} />
                          </div>
                          <span className={`flex-shrink-0 text-[10px] font-bold font-poppins px-1.5 py-0.5 rounded ${r.rate === -1 ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                            {r.rate === -1 ? 'Mixed GST' : r.rate > 0 ? `GST ${r.rate}%` : 'No GST'}
                          </span>
                          {r.rate !== 0 && (r.isIgst ? (
                            <div className="w-[110px] flex-shrink-0">
                              <LedgerSelect value={r.igst} onChange={(v) => setEdit(inv.id, 'igst', v)} options={taxOptions} placeholder="IGST ledger" emptyText="IGST" compact disabled={frozen} />
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <div className="w-[100px]"><LedgerSelect value={r.cgst} onChange={(v) => setEdit(inv.id, 'cgst', v)} options={taxOptions} placeholder="CGST" emptyText="CGST" compact disabled={frozen} /></div>
                              <div className="w-[100px]"><LedgerSelect value={r.sgst} onChange={(v) => setEdit(inv.id, 'sgst', v)} options={taxOptions} placeholder="SGST" emptyText="SGST" compact disabled={frozen} /></div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <JobStatus job={job} />
                        {r.isSaved && !r.dirty && !job && <span className="block text-[10px] text-slate-400 font-poppins">Saved</span>}
                        {r.dirty && <span className="block text-[10px] text-amber-500 font-poppins">Unsaved</span>}
                        {job?.status === 'failed' && job.error && (
                          <p className="mt-1 text-[10px] text-rose-500 font-poppins max-w-[180px] leading-tight">{job.error}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {!frozen && mappable && (r.dirty || !r.isSaved) && (
                            <button onClick={() => saveRow(r)} title="Save mapping (push later)" className="px-2.5 py-2 rounded-xl text-xs font-bold font-poppins border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">Save</button>
                          )}
                          {frozen ? (
                            <span className="inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold font-poppins bg-emerald-100 text-emerald-700" title="Pushed to Tally — tick the checkbox to unfreeze and re-push">
                              <Lock size={12} /> Pushed
                            </span>
                          ) : (
                            <button
                              onClick={() => pushRow(r)}
                              disabled={!pushable || r.inFlight}
                              title={r.inFlight ? 'A push is already in progress' : pushable ? 'Push to Tally' : 'Save this row first — only saved rows can be pushed'}
                              className="px-4 py-2 rounded-xl text-xs font-bold font-poppins bg-profee-blue text-white hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {r.inFlight ? 'Pushing…' : r.synced ? 'Re-push' : job?.status === 'failed' ? 'Retry' : 'Push'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visibleRows.length === 0 && (
              <p className="text-center text-sm text-slate-400 font-poppins py-10">No invoices match your filters.</p>
            )}
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

// A dropdown sourced from Tally-detected names. Before detection (no options)
// it degrades to a plain text input so the field is never a dead end. Any saved
// value not present in the list is preserved as a selectable option.
const LedgerSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  emptyText?: string;
  compact?: boolean;
  disabled?: boolean;
}> = ({ value, onChange, options, placeholder, emptyText, compact, disabled }) => {
  const opts = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const o of [...options, value]) {
      if (o && !seen.has(o)) { seen.add(o); list.push(o); }
    }
    return list.sort((a, b) => a.localeCompare(b));
  }, [options, value]);

  const cls = `w-full rounded-xl border border-slate-200 font-poppins text-sm bg-white focus:outline-none focus:ring-2 focus:ring-profee-blue/30 disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed ${
    compact ? 'px-3 py-2.5' : 'px-4 py-3'
  }`;

  if (opts.length === 0) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={emptyText || placeholder}
        className={cls}
        disabled={disabled}
      />
    );
  }
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cls} disabled={disabled}>
      <option value="">{placeholder}</option>
      {opts.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
};

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
