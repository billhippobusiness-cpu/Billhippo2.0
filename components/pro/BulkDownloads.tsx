/**
 * BulkDownloads — Download GST reports for multiple clients in one ZIP file.
 *
 * Generates one CSV per client (same format as per-client ProReports download),
 * bundles them with JSZip, and saves the ZIP with file-saver.
 *
 * FIRESTORE SECURITY TODO (P-13):
 *   Professionals need read access to users/{clientUid}/invoices only if
 *   their UID appears in the client's assignedProfessionals with status=active.
 *   Implement in Prompt P-13.
 */
import React, { useState, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import {
  Download,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Users,
  X,
} from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { getInvoices, getCustomers, getBusinessProfile } from '../../lib/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import type { Invoice, Customer, ProfessionalProfile } from '../../types';
import { GSTType } from '../../types';

// ── Types ──────────────────────────────────────────────────────────────────

type ReportType =
  | 'gstr1'
  | 'b2b'
  | 'b2c'
  | 'purchase'
  | 'hsn'
  | 'filing_status';

interface ClientInfo {
  uid: string;
  name: string;
  gstin: string;
}

export interface BulkDownloadsProps {
  user: FirebaseUser;
  profile: ProfessionalProfile | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const REPORT_OPTIONS: { id: ReportType; label: string; note?: string }[] = [
  { id: 'gstr1',         label: 'GSTR-1 Summary' },
  { id: 'b2b',           label: 'Sales Register (B2B)' },
  { id: 'b2c',           label: 'Sales Register (B2C)' },
  { id: 'purchase',      label: 'Purchase Register',    note: 'Returns placeholder — no purchase data yet' },
  { id: 'hsn',           label: 'HSN Summary' },
  { id: 'filing_status', label: 'Filing Status Report' },
];

const REPORT_FILE_TAG: Record<ReportType, string> = {
  gstr1:         'GSTR1',
  b2b:           'Sales_B2B',
  b2c:           'Sales_B2C',
  purchase:      'Purchase_Register',
  hsn:           'HSN_Summary',
  filing_status: 'Filing_Status',
};

const MONTH_NAMES  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Current year and the two prior years
const YEARS = (() => {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y];
})();

// "YYYY-MM" of today — used for pending vs overdue logic in filing status
const TODAY_MONTH = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
})();

// ── CSV helpers ────────────────────────────────────────────────────────────

/** Build a UTF-8 BOM CSV string (Excel-safe). Uses \r\n line endings for ZIP content. */
function makeCSV(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    headers.map(esc).join(','),
    ...rows.map(r => r.map(esc).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

const INR = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── HSN aggregation ────────────────────────────────────────────────────────
// Same algorithm as ProReports.buildHsnMap — keeps the logic consistent.

interface HsnAgg {
  hsn: string; description: string;
  qty: number; taxable: number; cgst: number; sgst: number; igst: number;
}

function aggregateHsn(invoices: Invoice[]): HsnAgg[] {
  const map = new Map<string, HsnAgg>();
  for (const inv of invoices) {
    for (const item of inv.items) {
      const key     = item.hsnCode?.trim() || 'MISC';
      const taxable = item.quantity * item.rate;
      const tax     = taxable * (item.gstRate / 100);
      const isIGST  = inv.gstType === GSTType.IGST;
      const prev    = map.get(key) ?? {
        hsn: key, description: item.description,
        qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0,
      };
      map.set(key, {
        ...prev,
        qty:     prev.qty + item.quantity,
        taxable: prev.taxable + taxable,
        cgst:    prev.cgst  + (isIGST ? 0       : tax / 2),
        sgst:    prev.sgst  + (isIGST ? 0       : tax / 2),
        igst:    prev.igst  + (isIGST ? tax     : 0),
      });
    }
  }
  return Array.from(map.values());
}

// ── Per-report CSV generators ──────────────────────────────────────────────

function genGstr1(invoices: Invoice[], mLabel: string): string {
  if (invoices.length === 0)
    return makeCSV(['Note'], [[`No invoice data for ${mLabel}`]]);
  return makeCSV(
    ['Invoice No','Party Name','Date','Taxable (INR)','CGST (INR)','SGST (INR)','IGST (INR)','Total (INR)'],
    invoices.map(i => [
      i.invoiceNumber, i.customerName, i.date,
      INR(i.totalBeforeTax), INR(i.cgst), INR(i.sgst), INR(i.igst), INR(i.totalAmount),
    ]),
  );
}

function genB2B(
  invoices: Invoice[],
  customerMap: Map<string, Customer>,
  mLabel: string,
): string {
  const b2b = invoices.filter(i => Boolean(customerMap.get(i.customerId)?.gstin));
  if (b2b.length === 0)
    return makeCSV(['Note'], [[`No B2B invoice data for ${mLabel}`]]);
  return makeCSV(
    ['GSTIN','Party Name','Invoice No','Date','Taxable (INR)','CGST (INR)','SGST (INR)','IGST (INR)','Total (INR)'],
    b2b.map(i => [
      customerMap.get(i.customerId)?.gstin ?? '',
      i.customerName, i.invoiceNumber, i.date,
      INR(i.totalBeforeTax), INR(i.cgst), INR(i.sgst), INR(i.igst), INR(i.totalAmount),
    ]),
  );
}

function genB2C(
  invoices: Invoice[],
  customerMap: Map<string, Customer>,
  mLabel: string,
): string {
  const b2c = invoices.filter(i => !customerMap.get(i.customerId)?.gstin);
  if (b2c.length === 0)
    return makeCSV(['Note'], [[`No B2C invoice data for ${mLabel}`]]);
  return makeCSV(
    ['Party Name','Invoice No','Date','Taxable (INR)','CGST (INR)','SGST (INR)','IGST (INR)','Total (INR)'],
    b2c.map(i => [
      i.customerName, i.invoiceNumber, i.date,
      INR(i.totalBeforeTax), INR(i.cgst), INR(i.sgst), INR(i.igst), INR(i.totalAmount),
    ]),
  );
}

function genPurchase(mLabel: string): string {
  return makeCSV(
    ['Note'],
    [
      [`Purchase data not available for ${mLabel}`],
      [''],
      ['The purchase module is not yet active for this client.'],
      ['Purchase data will appear here once the module is enabled.'],
    ],
  );
}

function genHsn(invoices: Invoice[], mLabel: string): string {
  const rows = aggregateHsn(invoices);
  if (rows.length === 0)
    return makeCSV(['Note'], [[`No HSN data for ${mLabel}`]]);
  return makeCSV(
    ['HSN Code','Description','Quantity','Taxable (INR)','CGST (INR)','SGST (INR)','IGST (INR)','Total Tax (INR)'],
    rows.map(h => [
      h.hsn, h.description, h.qty.toFixed(2),
      INR(h.taxable), INR(h.cgst), INR(h.sgst), INR(h.igst),
      INR(h.cgst + h.sgst + h.igst),
    ]),
  );
}

function genFilingStatus(
  invoices: Invoice[],
  clientName: string,
  gstin: string,
  monthStr: string,
  mLabel: string,
): string {
  const hasData = invoices.length > 0;
  const status  = hasData ? 'Filed' : (monthStr >= TODAY_MONTH ? 'Pending' : 'Overdue');
  const note    = hasData
    ? `${invoices.length} invoice(s) found for this period`
    : 'No invoices found for this period';
  return makeCSV(
    ['Client','GSTIN','Period','GSTR-1 Status','GSTR-3B Status','GSTR-2B Status','Note'],
    [[clientName, gstin, mLabel, status, status, 'No Data (purchase module pending)', note]],
  );
}

/** Route to the correct generator based on reportType. */
function buildReportCSV(
  type: ReportType,
  invoices: Invoice[],
  customerMap: Map<string, Customer>,
  clientName: string,
  gstin: string,
  monthStr: string,
  mLabel: string,
): string {
  switch (type) {
    case 'gstr1':         return genGstr1(invoices, mLabel);
    case 'b2b':           return genB2B(invoices, customerMap, mLabel);
    case 'b2c':           return genB2C(invoices, customerMap, mLabel);
    case 'purchase':      return genPurchase(mLabel);
    case 'hsn':           return genHsn(invoices, mLabel);
    case 'filing_status': return genFilingStatus(invoices, clientName, gstin, monthStr, mLabel);
  }
}

// ── Main component ─────────────────────────────────────────────────────────

const BulkDownloads: React.FC<BulkDownloadsProps> = ({ user, profile }) => {
  // Client list
  const [clientList,     setClientList]     = useState<ClientInfo[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selected,       setSelected]       = useState<Set<string>>(new Set());

  // Report settings
  const [reportType, setReportType] = useState<ReportType | ''>('');

  // Period — default to previous month
  const defaultPrev = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }, []);
  const [selMonth, setSelMonth] = useState(defaultPrev.month);
  const [selYear,  setSelYear]  = useState(defaultPrev.year);

  // Progress / feedback
  const [progress,      setProgress]      = useState<{ current: number; total: number } | null>(null);
  const [toast,         setToast]         = useState<{ msg: string; ok: boolean } | null>(null);
  const [failedClients, setFailedClients] = useState<string[]>([]);

  // ── Load client list ─────────────────────────────────────────────────────
  useEffect(() => {
    const uids = profile?.linkedClients ?? [];
    if (uids.length === 0) {
      setClientList([]);
      setClientsLoading(false);
      return;
    }
    setClientsLoading(true);
    Promise.all(
      uids.map(async (uid): Promise<ClientInfo | null> => {
        const biz = await getBusinessProfile(uid);
        if (!biz) return null;
        return { uid, name: biz.name, gstin: biz.gstin || '—' };
      }),
    ).then(results => {
      setClientList(results.filter((r): r is ClientInfo => r !== null));
      setClientsLoading(false);
    });
  }, [profile]);

  // ── Auto-dismiss toast after 5 s ─────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const allSelected  = clientList.length > 0 && selected.size === clientList.length;
  const monthStr     = `${selYear}-${String(selMonth).padStart(2, '0')}`;
  const periodTag    = `${MONTH_SHORT[selMonth - 1]}_${selYear}`;      // e.g. "Feb_2026"
  const mLabel       = `${MONTH_NAMES[selMonth - 1]} ${selYear}`;      // e.g. "February 2026"
  const zipName      = `BillHippo_Reports_${periodTag}.zip`;
  const folderName   = `BillHippo_Bulk_${periodTag}`;
  const canDownload  = selected.size > 0 && reportType !== '' && !progress;

  // ── Selection helpers ────────────────────────────────────────────────────
  const toggleClient = (uid: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });

  const selectAll   = () => setSelected(new Set(clientList.map(c => c.uid)));
  const deselectAll = () => setSelected(new Set());

  // ── Download handler ──────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (!canDownload || !reportType) return;

    const clients = clientList.filter(c => selected.has(c.uid));
    const total   = clients.length;
    const failed: string[] = [];

    setProgress({ current: 0, total });
    setFailedClients([]);

    const zip    = new JSZip();
    const folder = zip.folder(folderName)!;

    for (let idx = 0; idx < clients.length; idx++) {
      const client = clients[idx];
      setProgress({ current: idx + 1, total });

      const safeName = client.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
      const filename = `${safeName}_${REPORT_FILE_TAG[reportType as ReportType]}_${periodTag}.csv`;

      try {
        const [invoices, customers] = await Promise.all([
          getInvoices(client.uid),
          getCustomers(client.uid),
        ]);

        const monthInvoices = invoices.filter(inv => inv.date.startsWith(monthStr));
        const customerMap   = new Map<string, Customer>(customers.map(c => [c.id, c]));

        const csvContent = buildReportCSV(
          reportType as ReportType,
          monthInvoices,
          customerMap,
          client.name,
          client.gstin,
          monthStr,
          mLabel,
        );

        folder.file(filename, csvContent);
      } catch (err) {
        console.error(`BulkDownloads: fetch failed for "${client.name}"`, err);
        failed.push(client.name);
        // Include an error placeholder so the ZIP isn't silently missing a file
        folder.file(
          filename.replace('.csv', '_FETCH_ERROR.txt'),
          `Failed to retrieve data for ${client.name}.\n` +
          `Please try again or check your internet connection.\n\n` +
          `Period: ${mLabel}`,
        );
      }
    }

    // ── Generate ZIP ────────────────────────────────────────────────────────
    try {
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      saveAs(blob, zipName);

      // Log to users/{uid}/professional/main/activityLog
      await addDoc(collection(db, 'users', user.uid, 'professional', 'main', 'activityLog'), {
        action:      'bulk_download',
        reportType,
        period:      monthStr,
        clientCount: clients.length - failed.length,
        timestamp:   new Date().toISOString(),
      });

      const successCount = clients.length - failed.length;
      setToast({
        msg: `Downloaded reports for ${successCount} client${successCount !== 1 ? 's' : ''}`,
        ok:  true,
      });
      setFailedClients(failed);
    } catch (err) {
      console.error('BulkDownloads: ZIP generation failed', err);
      setToast({ msg: 'ZIP generation failed — please try again.', ok: false });
    } finally {
      setProgress(null);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Toast notification ── */}
      {toast && (
        <div
          className={`
            fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5
            rounded-2xl shadow-lg border text-sm font-semibold font-poppins
            transition-all animate-in slide-in-from-top-2
            ${toast.ok
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
              : 'bg-rose-50 border-rose-100 text-rose-600'}
          `}
        >
          {toast.ok
            ? <CheckCircle2 size={15} className="flex-shrink-0" />
            : <AlertTriangle size={15} className="flex-shrink-0" />
          }
          {toast.msg}
          <button
            onClick={() => setToast(null)}
            className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Page header ── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 font-poppins">Bulk Downloads</h1>
        <p className="text-sm text-slate-400 font-poppins mt-1">
          Download GST reports for multiple clients in one go.
        </p>
      </div>

      <div className="max-w-2xl space-y-5">

        {/* ── Step 1: Select Clients ── */}
        <StepCard step={1} title="Select Clients">
          {clientsLoading ? (
            <div className="flex items-center gap-2 py-6">
              <Loader2 size={14} className="animate-spin text-slate-300" />
              <span className="text-xs text-slate-400 font-poppins">Loading clients…</span>
            </div>
          ) : clientList.length === 0 ? (
            <div className="py-8 text-center">
              <Users size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400 font-poppins">No linked clients yet</p>
              <p className="text-xs text-slate-300 font-poppins mt-1">
                Share your referral code from the Dashboard to link clients
              </p>
            </div>
          ) : (
            <>
              {/* Select All / Deselect All row */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-50">
                <div className="flex items-center gap-3">
                  <button
                    onClick={allSelected ? deselectAll : selectAll}
                    className="text-xs font-bold font-poppins text-emerald-600 hover:text-emerald-700 transition-colors"
                  >
                    {allSelected ? 'Deselect All' : 'Select All'}
                  </button>
                  {selected.size > 0 && (
                    <span className="text-[10px] text-slate-400 font-poppins bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-full">
                      {selected.size} / {clientList.length} selected
                    </span>
                  )}
                </div>
                {selected.size > 0 && (
                  <button
                    onClick={deselectAll}
                    className="text-[10px] font-bold font-poppins text-slate-300 hover:text-slate-500 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Checkbox rows */}
              <div className="space-y-2">
                {clientList.map(client => {
                  const checked = selected.has(client.uid);
                  return (
                    <label
                      key={client.uid}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer
                        transition-all border select-none
                        ${checked
                          ? 'bg-emerald-50 border-emerald-100'
                          : 'border-transparent hover:bg-slate-50'}
                      `}
                    >
                      {/* Custom checkbox */}
                      <div
                        className={`
                          w-5 h-5 rounded-md border-2 flex items-center justify-center
                          flex-shrink-0 transition-all duration-150
                          ${checked ? 'bg-emerald-600 border-emerald-600' : 'border-slate-200'}
                        `}
                        onClick={() => toggleClient(client.uid)}
                      >
                        {checked && (
                          <svg viewBox="0 0 10 8" className="w-3 h-3" fill="none" stroke="white" strokeWidth="2">
                            <polyline points="1,4 4,7 9,1" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleClient(client.uid)}
                        className="sr-only"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 font-poppins truncate">
                          {client.name}
                        </p>
                        <p className="text-[10px] font-mono text-slate-400 tracking-wider mt-0.5">
                          {client.gstin}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </StepCard>

        {/* ── Step 2: Report Type ── */}
        <StepCard step={2} title="Select Report Type">
          <div className="space-y-2">
            {REPORT_OPTIONS.map(opt => {
              const checked = reportType === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer
                    transition-all border select-none
                    ${checked
                      ? 'bg-emerald-50 border-emerald-100'
                      : 'border-transparent hover:bg-slate-50'}
                  `}
                >
                  {/* Custom radio */}
                  <div
                    className={`
                      w-5 h-5 rounded-full border-2 flex items-center justify-center
                      flex-shrink-0 transition-all duration-150
                      ${checked ? 'border-emerald-600' : 'border-slate-200'}
                    `}
                  >
                    {checked && <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />}
                  </div>
                  <input
                    type="radio"
                    name="reportType"
                    value={opt.id}
                    checked={checked}
                    onChange={() => setReportType(opt.id)}
                    className="sr-only"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 font-poppins">
                      {opt.label}
                    </p>
                    {opt.note && (
                      <p className="text-[10px] text-slate-400 font-poppins mt-0.5">{opt.note}</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        </StepCard>

        {/* ── Step 3: Period ── */}
        <StepCard step={3} title="Select Period">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 font-poppins mb-2">
                Month
              </label>
              <select
                value={selMonth}
                onChange={e => setSelMonth(Number(e.target.value))}
                className="px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold font-poppins text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/30 cursor-pointer"
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 font-poppins mb-2">
                Year
              </label>
              <select
                value={selYear}
                onChange={e => setSelYear(Number(e.target.value))}
                className="px-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold font-poppins text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500/30 cursor-pointer"
              >
                {YEARS.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            {/* Period preview pill */}
            <div className="pb-0.5">
              <span className="inline-block px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-bold font-poppins text-emerald-600">
                {mLabel}
              </span>
            </div>
          </div>
        </StepCard>

        {/* ── Progress indicator ── */}
        {progress && (
          <div className="bg-white border border-slate-100 shadow-sm rounded-2xl px-6 py-5">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 size={16} className="animate-spin text-emerald-600 flex-shrink-0" />
              <p className="text-sm font-bold text-slate-700 font-poppins">
                Preparing reports…{' '}
                <span className="text-emerald-600">
                  {progress.current} of {progress.total}
                </span>
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-300 font-poppins mt-2">
              Fetching data from Firestore and generating CSVs — do not close this page
            </p>
          </div>
        )}

        {/* ── Failed-clients warning ── */}
        {failedClients.length > 0 && !progress && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl px-5 py-4 flex items-start gap-3">
            <AlertTriangle size={15} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-700 font-poppins mb-1">
                Data unavailable for {failedClients.length}&nbsp;
                client{failedClients.length !== 1 ? 's' : ''}
              </p>
              <p className="text-[10px] text-amber-600 font-poppins leading-relaxed">
                {failedClients.join(', ')}
              </p>
              <p className="text-[10px] text-amber-500 font-poppins mt-1">
                Placeholder files were included in the ZIP. Retry after checking connectivity.
              </p>
            </div>
          </div>
        )}

        {/* ── Download ZIP button ── */}
        <button
          onClick={handleDownload}
          disabled={!canDownload}
          className="
            w-full flex items-center justify-center gap-2.5
            py-4 rounded-2xl font-bold font-poppins text-sm
            transition-all duration-200 shadow-sm
            bg-emerald-600 text-white
            hover:bg-emerald-700 active:scale-[0.98]
            disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100
          "
        >
          {progress
            ? <><Loader2 size={16} className="animate-spin" /> Building ZIP…</>
            : <><Download size={16} /> Download ZIP</>
          }
        </button>

        {/* Hint text when button is disabled */}
        {!canDownload && !progress && (
          <p className="text-[10px] text-slate-300 text-center font-poppins -mt-1">
            {selected.size === 0 && reportType === '' && 'Select clients and a report type to continue'}
            {selected.size === 0 && reportType !== '' && 'Select at least one client to continue'}
            {selected.size > 0  && reportType === '' && 'Select a report type to continue'}
          </p>
        )}

        {/* ZIP contents preview */}
        {canDownload && reportType && (
          <div className="bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4">
            <p className="text-[9px] font-bold font-poppins text-slate-400 uppercase tracking-widest mb-2">
              ZIP preview
            </p>
            <p className="text-xs font-mono text-slate-500 mb-1">{folderName}/</p>
            {Array.from(selected)
              .slice(0, 3)
              .map(uid => {
                const c       = clientList.find(x => x.uid === uid);
                const safe    = c?.name.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '') ?? uid;
                return (
                  <p key={uid} className="text-[10px] font-mono text-slate-400 ml-4">
                    └ {safe}_{REPORT_FILE_TAG[reportType as ReportType]}_{periodTag}.csv
                  </p>
                );
              })}
            {selected.size > 3 && (
              <p className="text-[10px] font-mono text-slate-300 ml-4">
                └ … and {selected.size - 3} more file{selected.size - 3 !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ── StepCard ───────────────────────────────────────────────────────────────

const StepCard: React.FC<{
  step: number;
  title: string;
  children: React.ReactNode;
}> = ({ step, title, children }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
    <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-3">
      <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] font-bold text-white font-poppins">{step}</span>
      </div>
      <h2 className="text-sm font-bold text-slate-800 font-poppins">{title}</h2>
    </div>
    <div className="px-6 py-5">{children}</div>
  </div>
);

export default BulkDownloads;
