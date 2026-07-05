import React, { useState, useEffect, useMemo } from 'react';
import {
  Download,
  FileJson,
  FileSpreadsheet,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  X,
  ChevronRight,
  ArrowLeft,
  TrendingUp,
  IndianRupee,
  FileText,
  AlertCircle,
  Lock,
  Cloud,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import { getInvoices, getCustomers, getBusinessProfile, getCreditNotes, getDebitNotes, saveGSTRCache, loadGSTRCache, loadGSTSession } from '../lib/firestore';
import { downloadGSTR1Excel, downloadGSTR1JSON } from '../lib/gstr1Generator';
import { downloadSalesRegisterExcel, downloadNotesRegisterExcel, downloadHSNExcel, aggregateHSN } from '../lib/salesRegisterExport';
import { Invoice, GSTType, Customer, BusinessProfile, CreditNote, DebitNote } from '../types';
import PDFPreviewModal, { PDFDirectDownload } from './pdf/PDFPreviewModal';
import SalesRegisterPDF from './pdf/SalesRegisterPDF';
import GSTR3BPDF from './pdf/GSTR3BPDF';
import { fetchGSTR2B, fetchGSTR3BOnline, fetchGSTR1Online, GSTR2BData, GSTR3BOnlineData, GSTR1OnlineData } from '../lib/whitebooksApi';
import GSTPortalLogin from './GSTPortalLogin';
import { downloadGSTR2BExcel } from '../lib/gstr2bExport';
import GSTR2BPDF from './pdf/GSTR2BPDF';
import { getStoredFY, getFYLabel, getFYMonths, getFYQuarters, fyStartYear } from '../lib/financialYear';

// ─── Helper functions ─────────────────────────────────────────────────────────

function getCurrentIndianQuarter(): string {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  // Indian FY: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
  if (month >= 4 && month <= 6) return `${year}-Q1`;
  if (month >= 7 && month <= 9) return `${year}-Q2`;
  if (month >= 10 && month <= 12) return `${year}-Q3`;
  // month 1-3 belongs to Q4 of the previous FY year
  return `${year - 1}-Q4`;
}

function getQuarterMonths(q: 1 | 2 | 3 | 4, year: number): string[] {
  // Returns YYYY-MM strings for all months in the quarter
  if (q === 1) return [`${year}-04`, `${year}-05`, `${year}-06`];
  if (q === 2) return [`${year}-07`, `${year}-08`, `${year}-09`];
  if (q === 3) return [`${year}-10`, `${year}-11`, `${year}-12`];
  // Q4: Jan-Mar of year+1
  return [`${year + 1}-01`, `${year + 1}-02`, `${year + 1}-03`];
}

function quarterToDateRange(qKey: string): { start: string; end: string } {
  // qKey format: "YYYY-Q1" | "YYYY-Q2" | "YYYY-Q3" | "YYYY-Q4"
  const [yearStr, qPart] = qKey.split('-');
  const year = parseInt(yearStr, 10);
  const q = parseInt(qPart.replace('Q', ''), 10) as 1 | 2 | 3 | 4;
  if (q === 1) return { start: `${year}-04-01`, end: `${year}-06-30` };
  if (q === 2) return { start: `${year}-07-01`, end: `${year}-09-30` };
  if (q === 3) return { start: `${year}-10-01`, end: `${year}-12-31` };
  // Q4: Jan-Mar of year+1
  return { start: `${year + 1}-01-01`, end: `${year + 1}-03-31` };
}

function quarterLabel(qKey: string): string {
  const [yearStr, qPart] = qKey.split('-');
  const year = parseInt(yearStr, 10);
  const q = parseInt(qPart.replace('Q', ''), 10);
  const fyStart = year;
  const fyEnd = year + 1;
  const fyLabel = `FY ${fyStart}-${String(fyEnd).slice(2)}`;
  const monthRanges: Record<number, string> = {
    1: 'Apr – Jun',
    2: 'Jul – Sep',
    3: 'Oct – Dec',
    4: 'Jan – Mar',
  };
  return `Q${q} ${fyLabel} (${monthRanges[q]})`;
}

/** Default month to preselect for a FY: the current month if it falls inside
 *  the FY, otherwise the FY's latest month. */
function defaultMonthForFY(fyLabel: string): string {
  const now = new Date();
  const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const fyMonths = getFYMonths(fyLabel);
  return fyMonths.includes(curYm) ? curYm : fyMonths[0];
}

/** Default quarter to preselect for a FY: the current quarter if the FY is the
 *  current one, otherwise the FY's latest quarter. */
function defaultQuarterForFY(fyLabel: string): string {
  if (fyLabel === getFYLabel()) return getCurrentIndianQuarter();
  return getFYQuarters(fyLabel)[0];
}

function monthEndDate(ym: string): string {
  // Returns the last day of the month as YYYY-MM-DD
  const [year, month] = ym.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function inr(n: number | undefined | null): string {
  return `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

function fmtFetchedAt(ms: number): string {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GSTReportsProps {
  userId: string;
  onNavigate?: (tab: string) => void;
}

type ActiveDetail = 'gstr1' | 'gstr3b' | 'taxsummary' | 'salesregister' | 'gstr2b' | null;

// ─── Component ────────────────────────────────────────────────────────────────

const GSTReports: React.FC<GSTReportsProps> = ({ userId, onNavigate }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [debitNotes, setDebitNotes] = useState<DebitNote[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Period state — scoped to the financial year chosen on the Overview page
  const [selectedFY] = useState(() => getStoredFY());
  const [periodMode, setPeriodMode] = useState<'monthly' | 'quarterly'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(() => defaultMonthForFY(getStoredFY()));
  const [selectedQuarter, setSelectedQuarter] = useState(() => defaultQuarterForFY(getStoredFY()));

  // Detail panel
  const [activeDetail, setActiveDetail] = useState<ActiveDetail>(null);
  const [activeSubTab, setActiveSubTab] = useState<string>('');

  // Download state
  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [generatingJson, setGeneratingJson] = useState(false);

  // PDF Preview
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [gstr3bPdfOpen, setGstr3bPdfOpen] = useState(false);

  // GSTR-1 view toggle: 'app' = invoices from this app, 'portal' = fetched portal data
  const [gstr1View, setGstr1View] = useState<'app' | 'portal'>('app');

  // ── WhiteBooks / GST Portal state ──
  const [gstSession, setGstSession] = useState<{ authToken: string; expiresAt: number; gstUsername: string } | null>(null);
  const [showPortalLogin, setShowPortalLogin] = useState(false);
  const [portalDataPeriod, setPortalDataPeriod] = useState<string>('');
  const [gstr2bData, setGstr2bData] = useState<GSTR2BData | null>(null);
  const [gstr3bOnline, setGstr3bOnline] = useState<GSTR3BOnlineData | null>(null);
  const [gstr1Online, setGstr1Online] = useState<GSTR1OnlineData | null>(null);
  const [portalFetching, setPortalFetching] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [gstr2bPdfOpen, setGstr2bPdfOpen] = useState(false);
  // Cache fetch timestamps keyed by type
  const [cacheFetchedAt, setCacheFetchedAt] = useState<{ '2b'?: number; '3b'?: number; '1'?: number }>({});
  // Bulk / FY fetch
  const [showBulkFetch, setShowBulkFetch] = useState(false);
  const [bulkFetchYear, setBulkFetchYear] = useState(() => fyStartYear(getStoredFY()));
  const [bulkProgress, setBulkProgress] = useState<Record<string, 'idle' | 'fetching' | 'done' | 'error'>>({});
  const [bulkFetching, setBulkFetching] = useState(false);

  // Load data
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [invData, custData, profileData, cnData, dnData] = await Promise.all([
          getInvoices(userId),
          getCustomers(userId),
          getBusinessProfile(userId),
          getCreditNotes(userId),
          getDebitNotes(userId),
        ]);
        setInvoices(invData);
        setCustomers(custData);
        setProfile(profileData);
        setCreditNotes(cnData);
        setDebitNotes(dnData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  // Customer map
  const custMap = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  // Month options (last 12 months)
  // Months of the selected financial year (Apr–Mar), latest first
  const months = useMemo(() => getFYMonths(selectedFY), [selectedFY]);

  // Quarters of the selected financial year (Q4–Q1), latest first
  const quarterOptions = useMemo(() => getFYQuarters(selectedFY), [selectedFY]);

  // MMYYYY format for GSTR-1 fp
  const fp = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    return `${month}${year}`;
  }, [selectedMonth]);

  // MMYYYY format for WhiteBooks API (same as fp)
  const wbPeriod = fp; // Already in MMYYYY format

  // Load cached GSTR data whenever the period or GSTIN changes
  useEffect(() => {
    if (!profile?.gstin || !wbPeriod) return;
    const gstin = profile.gstin;
    (async () => {
      const [c2b, c3b, c1] = await Promise.all([
        loadGSTRCache(userId, '2b', gstin, wbPeriod),
        loadGSTRCache(userId, '3b', gstin, wbPeriod),
        loadGSTRCache(userId, '1', gstin, wbPeriod),
      ]);
      if (c2b) { setGstr2bData(c2b.data as GSTR2BData); setCacheFetchedAt(p => ({ ...p, '2b': c2b.fetchedAt })); }
      else { setGstr2bData(null); setCacheFetchedAt(p => ({ ...p, '2b': undefined })); }
      if (c3b) { setGstr3bOnline(c3b.data as GSTR3BOnlineData); setCacheFetchedAt(p => ({ ...p, '3b': c3b.fetchedAt })); }
      else { setGstr3bOnline(null); setCacheFetchedAt(p => ({ ...p, '3b': undefined })); }
      if (c1) { setGstr1Online(c1.data as GSTR1OnlineData); setCacheFetchedAt(p => ({ ...p, '1': c1.fetchedAt })); }
      else { setGstr1Online(null); setCacheFetchedAt(p => ({ ...p, '1': undefined })); setGstr1View('app'); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, profile?.gstin, wbPeriod]);

  // Filtered data
  const filteredInvoices = useMemo(() => {
    if (periodMode === 'monthly') {
      return invoices.filter(i => i.date.startsWith(selectedMonth));
    }
    const { start, end } = quarterToDateRange(selectedQuarter);
    return invoices.filter(i => i.date >= start && i.date <= end);
  }, [invoices, periodMode, selectedMonth, selectedQuarter]);

  const filteredCreditNotes = useMemo(() => {
    if (periodMode === 'monthly') {
      return creditNotes.filter(cn => cn.date.startsWith(selectedMonth));
    }
    const { start, end } = quarterToDateRange(selectedQuarter);
    return creditNotes.filter(cn => cn.date >= start && cn.date <= end);
  }, [creditNotes, periodMode, selectedMonth, selectedQuarter]);

  const filteredDebitNotes = useMemo(() => {
    if (periodMode === 'monthly') {
      return debitNotes.filter(dn => dn.date.startsWith(selectedMonth));
    }
    const { start, end } = quarterToDateRange(selectedQuarter);
    return debitNotes.filter(dn => dn.date >= start && dn.date <= end);
  }, [debitNotes, periodMode, selectedMonth, selectedQuarter]);

  // Aggregate calculations
  const totalTaxable = useMemo(() => filteredInvoices.reduce((s, i) => s + i.totalBeforeTax, 0), [filteredInvoices]);
  const totalCGST = useMemo(() => filteredInvoices.reduce((s, i) => s + i.cgst, 0), [filteredInvoices]);
  const totalSGST = useMemo(() => filteredInvoices.reduce((s, i) => s + i.sgst, 0), [filteredInvoices]);
  const totalIGST = useMemo(() => filteredInvoices.reduce((s, i) => s + i.igst, 0), [filteredInvoices]);
  const totalTax = totalCGST + totalSGST + totalIGST;
  const b2bCount = useMemo(() => filteredInvoices.filter(i => i.gstType === GSTType.CGST_SGST).length, [filteredInvoices]);
  const igstCount = useMemo(() => filteredInvoices.filter(i => i.gstType === GSTType.IGST).length, [filteredInvoices]);

  // Outstanding dues
  const unpaidInvoices = useMemo(
    () => filteredInvoices.filter(i => i.status === 'Unpaid' || i.status === 'Partial'),
    [filteredInvoices]
  );
  const outstandingTax = useMemo(
    () => unpaidInvoices.reduce((s, i) => s + i.cgst + i.sgst + i.igst, 0),
    [unpaidInvoices]
  );

  // Period label
  const periodLabel = useMemo(() => {
    if (periodMode === 'monthly') {
      return new Date(selectedMonth + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }
    return quarterLabel(selectedQuarter);
  }, [periodMode, selectedMonth, selectedQuarter]);

  // HSN aggregated data
  const hsnRows = useMemo(() => aggregateHSN(filteredInvoices), [filteredInvoices]);

  // Rate-wise breakdown for Tax Summary
  const rateBreakdown = useMemo(() => {
    const map = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number; tax: number; count: number }>();
    for (const inv of filteredInvoices) {
      for (const item of inv.items) {
        const rate = item.gstRate;
        const taxableAmt = item.quantity * item.rate;
        const gstAmt = taxableAmt * (rate / 100);
        const isIGST = inv.igst > 0 && inv.cgst === 0;
        const existing = map.get(rate) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, count: 0 };
        map.set(rate, {
          taxable: existing.taxable + taxableAmt,
          cgst: existing.cgst + (isIGST ? 0 : gstAmt / 2),
          sgst: existing.sgst + (isIGST ? 0 : gstAmt / 2),
          igst: existing.igst + (isIGST ? gstAmt : 0),
          tax: existing.tax + gstAmt,
          count: existing.count + 1,
        });
      }
    }
    return Array.from(map.entries())
      .map(([rate, vals]) => ({ rate, ...vals }))
      .sort((a, b) => a.rate - b.rate);
  }, [filteredInvoices]);

  // Filing deadlines
  const filingDeadlines = useMemo(() => {
    const now = new Date();
    let refDate: Date;
    if (periodMode === 'monthly') {
      const [y, m] = selectedMonth.split('-').map(Number);
      refDate = new Date(y, m - 1, 1); // first day of selected month
    } else {
      const { end } = quarterToDateRange(selectedQuarter);
      const [y, m] = end.split('-').map(Number);
      refDate = new Date(y, m - 1, 1); // first day of end month of quarter
    }

    const nextMonthYear = refDate.getMonth() === 11
      ? refDate.getFullYear() + 1
      : refDate.getFullYear();
    const nextMonth = (refDate.getMonth() + 1) % 12 + 1;

    const gstr1Due = new Date(nextMonthYear, nextMonth - 1, 11);
    const gstr3bDue = new Date(nextMonthYear, nextMonth - 1, 20);

    const diffDaysGSTR1 = Math.ceil((gstr1Due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const diffDaysGSTR3B = Math.ceil((gstr3bDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    const getColor = (days: number) => {
      if (days < 0) return 'text-red-600 bg-red-50 border-red-200';
      if (days <= 5) return 'text-amber-600 bg-amber-50 border-amber-200';
      return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    };

    const getIcon = (days: number) => {
      if (days < 0) return <AlertCircle size={14} className="shrink-0" />;
      if (days <= 5) return <AlertTriangle size={14} className="shrink-0" />;
      return <CheckCircle2 size={14} className="shrink-0" />;
    };

    const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    return {
      gstr1: { date: fmt(gstr1Due), days: diffDaysGSTR1, color: getColor(diffDaysGSTR1), icon: getIcon(diffDaysGSTR1) },
      gstr3b: { date: fmt(gstr3bDue), days: diffDaysGSTR3B, color: getColor(diffDaysGSTR3B), icon: getIcon(diffDaysGSTR3B) },
    };
  }, [periodMode, selectedMonth, selectedQuarter]);

  // GSTR-1 download handlers (monthly only)
  const handleDownloadExcel = async () => {
    if (!profile || filteredInvoices.length === 0 || periodMode !== 'monthly') return;
    setGeneratingExcel(true);
    try {
      downloadGSTR1Excel({
        profile,
        invoices: filteredInvoices,
        customers,
        creditNotes: filteredCreditNotes,
        debitNotes: filteredDebitNotes,
        fp,
      });
    } finally {
      setGeneratingExcel(false);
    }
  };

  const handleDownloadJson = async () => {
    if (!profile || filteredInvoices.length === 0 || periodMode !== 'monthly') return;
    setGeneratingJson(true);
    try {
      downloadGSTR1JSON({
        profile,
        invoices: filteredInvoices,
        customers,
        creditNotes: filteredCreditNotes,
        debitNotes: filteredDebitNotes,
        fp,
      });
    } finally {
      setGeneratingJson(false);
    }
  };

  // Open detail panel
  const openDetail = (detail: ActiveDetail) => {
    setActiveDetail(detail);
    // Set default sub-tab per detail
    if (detail === 'gstr1') setActiveSubTab('b2b');
    else if (detail === 'gstr3b') setActiveSubTab('taxsummary');
    else if (detail === 'taxsummary') setActiveSubTab('ratewise');
    else if (detail === 'salesregister') setActiveSubTab('salesreg');
    else if (detail === 'gstr2b') setActiveSubTab('summary');
    else setActiveSubTab('');
  };

  const hasGSTR1Data = filteredInvoices.length > 0;

  const isSessionActive = () => gstSession && gstSession.expiresAt > Date.now();

  // Restore GST session from Firestore so user doesn't re-login on every page refresh
  useEffect(() => {
    if (!profile?.gstin) return;
    loadGSTSession(userId, profile.gstin).then(saved => {
      if (saved) setGstSession(saved);
    });
  }, [userId, profile?.gstin]);

  const handlePortalLogin = (authToken: string, expiresAt: number, gstUsername: string) => {
    setGstSession({ authToken, expiresAt, gstUsername });
    setShowPortalLogin(false);
  };

  const classifyPortalError = (err: any): string => {
    const msg: string = err?.message ?? '';
    if (/unauthenticated|token|txn|session/i.test(msg))
      return 'GST Portal session expired. Please disconnect and reconnect to the GST Portal.';
    if (/unavailable|network|timeout|fetch/i.test(msg))
      return 'Could not reach the GST Portal. Check your connection and try again.';
    return msg || 'Failed to fetch GST data. Please try again.';
  };

  // Bulk fetch all months for a financial year (Apr–Mar)
  const handleBulkFetch = async () => {
    if (!profile?.gstin || !gstSession) return;
    setBulkFetching(true);
    const months: string[] = [];
    for (let m = 4; m <= 12; m++) months.push(`${String(m).padStart(2, '0')}${bulkFetchYear}`);
    for (let m = 1; m <= 3; m++) months.push(`${String(m).padStart(2, '0')}${bulkFetchYear + 1}`);

    for (const period of months) {
      setBulkProgress(p => ({ ...p, [period]: 'fetching' }));
      try {
        const [d2b, d3b, d1] = await Promise.allSettled([
          fetchGSTR2B(profile.gstin, period, gstSession.authToken, gstSession.gstUsername),
          fetchGSTR3BOnline(profile.gstin, period, gstSession.authToken, gstSession.gstUsername),
          fetchGSTR1Online(profile.gstin, period, gstSession.authToken, gstSession.gstUsername),
        ]);
        if (d2b.status === 'fulfilled') await saveGSTRCache(userId, '2b', profile.gstin, period, d2b.value as unknown as Record<string, any>);
        if (d3b.status === 'fulfilled') await saveGSTRCache(userId, '3b', profile.gstin, period, d3b.value as unknown as Record<string, any>);
        if (d1.status === 'fulfilled') await saveGSTRCache(userId, '1', profile.gstin, period, d1.value as unknown as Record<string, any>);
        setBulkProgress(p => ({ ...p, [period]: 'done' }));
      } catch (err: any) {
        setPortalError(err?.message ?? `Failed to fetch GST data for period ${period}. Session may have expired.`);
        setBulkProgress(p => ({ ...p, [period]: 'error' }));
      }
    }
    setBulkFetching(false);
  };

  const handleFetchGSTR2B = async () => {
    if (!profile?.gstin || !gstSession) return;
    setPortalFetching(true);
    setPortalError(null);
    try {
      const data = await fetchGSTR2B(profile.gstin, wbPeriod, gstSession.authToken, gstSession.gstUsername);
      setGstr2bData(data);
      setPortalDataPeriod(periodLabel);
      const now = Date.now();
      setCacheFetchedAt(p => ({ ...p, '2b': now }));
      await saveGSTRCache(userId, '2b', profile.gstin, wbPeriod, data as unknown as Record<string, any>);
    } catch (err: any) {
      setPortalError(classifyPortalError(err));
    } finally {
      setPortalFetching(false);
    }
  };

  const handleFetchGSTR3BOnline = async () => {
    if (!profile?.gstin || !gstSession) return;
    setPortalFetching(true);
    setPortalError(null);
    try {
      const data = await fetchGSTR3BOnline(profile.gstin, wbPeriod, gstSession.authToken, gstSession.gstUsername);
      setGstr3bOnline(data);
      const now = Date.now();
      setCacheFetchedAt(p => ({ ...p, '3b': now }));
      await saveGSTRCache(userId, '3b', profile.gstin, wbPeriod, data as unknown as Record<string, any>);
    } catch (err: any) {
      setPortalError(classifyPortalError(err));
    } finally {
      setPortalFetching(false);
    }
  };

  const handleFetchGSTR1Online = async () => {
    if (!profile?.gstin || !gstSession) return;
    setPortalFetching(true);
    setPortalError(null);
    try {
      const data = await fetchGSTR1Online(profile.gstin, wbPeriod, gstSession.authToken, gstSession.gstUsername);
      setGstr1Online(data);
      setGstr1View('portal'); // auto-switch to portal view on successful fetch
      const now = Date.now();
      setCacheFetchedAt(p => ({ ...p, '1': now }));
      await saveGSTRCache(userId, '1', profile.gstin, wbPeriod, data as unknown as Record<string, any>);
    } catch (err: any) {
      setPortalError(classifyPortalError(err));
    } finally {
      setPortalFetching(false);
    }
  };

  // ─── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
      </div>
    );
  }

  // ─── Sub-tables ───────────────────────────────────────────────────────────────

  const InvoiceTableRows = ({ invList, emptyMsg }: { invList: Invoice[]; emptyMsg: string }) => {
    const sorted = [...invList].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) {
      return (
        <tr>
          <td colSpan={12} className="text-center py-10 text-slate-400 text-sm font-poppins">
            {emptyMsg}
          </td>
        </tr>
      );
    }
    return (
      <>
        {sorted.map((inv, idx) => {
          const gstin = custMap.get(inv.customerId)?.gstin ?? '—';
          const tax = inv.cgst + inv.sgst + inv.igst;
          return (
            <tr
              key={inv.id}
              className="hover:bg-indigo-50/30 cursor-pointer transition-colors border-b border-slate-100"
              onClick={() => onNavigate?.('invoices')}
            >
              <td className="px-4 py-3 text-xs text-slate-500">{idx + 1}</td>
              <td className="px-4 py-3 text-xs text-slate-600">{fmtDate(inv.date)}</td>
              <td className="px-4 py-3 text-xs font-semibold text-slate-800">{inv.invoiceNumber}</td>
              <td className="px-4 py-3 text-xs text-slate-700">{inv.customerName}</td>
              <td className="px-4 py-3 text-xs text-slate-500 font-mono">{gstin}</td>
              <td className="px-4 py-3 text-xs text-right text-slate-700">{inr(inv.totalBeforeTax)}</td>
              <td className="px-4 py-3 text-xs text-right text-slate-600">{inv.igst > 0 ? inr(inv.igst) : '—'}</td>
              <td className="px-4 py-3 text-xs text-right text-slate-600">{inv.cgst > 0 ? inr(inv.cgst) : '—'}</td>
              <td className="px-4 py-3 text-xs text-right text-slate-600">{inv.sgst > 0 ? inr(inv.sgst) : '—'}</td>
              <td className="px-4 py-3 text-xs text-right font-semibold text-slate-700">{inr(tax)}</td>
              <td className="px-4 py-3 text-xs text-right font-bold text-slate-900">{inr(inv.totalAmount)}</td>
              <td className="px-4 py-3 text-xs text-center">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-700' :
                  inv.status === 'Unpaid' ? 'bg-red-100 text-red-700' :
                  'bg-amber-100 text-amber-700'
                }`}>{inv.status}</span>
              </td>
              <td className="px-2 py-3"><ChevronRight size={14} className="text-slate-300" /></td>
            </tr>
          );
        })}
        {/* Totals row */}
        <tr className="bg-slate-800 text-white font-bold">
          <td className="px-4 py-3 text-xs" colSpan={5}>TOTAL ({sorted.length} invoices)</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, i) => s + i.totalBeforeTax, 0))}</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, i) => s + i.igst, 0))}</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, i) => s + i.cgst, 0))}</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, i) => s + i.sgst, 0))}</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, i) => s + i.cgst + i.sgst + i.igst, 0))}</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, i) => s + i.totalAmount, 0))}</td>
          <td colSpan={2}></td>
        </tr>
      </>
    );
  };

  const NoteTableRows = ({ noteList, emptyMsg }: { noteList: (CreditNote | DebitNote)[]; emptyMsg: string }) => {
    const sorted = [...noteList].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length === 0) {
      return (
        <tr>
          <td colSpan={9} className="text-center py-10 text-slate-400 text-sm font-poppins">
            {emptyMsg}
          </td>
        </tr>
      );
    }
    return (
      <>
        {sorted.map((note, idx) => {
          const linkedInv = (note as CreditNote).originalInvoiceNumber ?? '—';
          return (
            <tr
              key={note.id}
              className="hover:bg-indigo-50/30 cursor-pointer transition-colors border-b border-slate-100"
              onClick={() => onNavigate?.('notes')}
            >
              <td className="px-4 py-3 text-xs text-slate-500">{idx + 1}</td>
              <td className="px-4 py-3 text-xs text-slate-600">{fmtDate(note.date)}</td>
              <td className="px-4 py-3 text-xs font-semibold text-slate-800">{note.noteNumber}</td>
              <td className="px-4 py-3 text-xs text-slate-700">{note.customerName}</td>
              <td className="px-4 py-3 text-xs text-slate-500">{linkedInv}</td>
              <td className="px-4 py-3 text-xs text-right text-slate-700">{inr(note.totalBeforeTax)}</td>
              <td className="px-4 py-3 text-xs text-right text-slate-600">{note.igst > 0 ? inr(note.igst) : '—'}</td>
              <td className="px-4 py-3 text-xs text-right text-slate-600">{note.cgst > 0 ? inr(note.cgst) : '—'}</td>
              <td className="px-4 py-3 text-xs text-right text-slate-600">{note.sgst > 0 ? inr(note.sgst) : '—'}</td>
              <td className="px-4 py-3 text-xs text-right font-bold text-slate-900">{inr(note.totalAmount)}</td>
              <td className="px-2 py-3"><ChevronRight size={14} className="text-slate-300" /></td>
            </tr>
          );
        })}
        <tr className="bg-slate-800 text-white font-bold">
          <td className="px-4 py-3 text-xs" colSpan={5}>TOTAL ({sorted.length} notes)</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, n) => s + n.totalBeforeTax, 0))}</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, n) => s + n.igst, 0))}</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, n) => s + n.cgst, 0))}</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, n) => s + n.sgst, 0))}</td>
          <td className="px-4 py-3 text-xs text-right">{inr(sorted.reduce((s, n) => s + n.totalAmount, 0))}</td>
          <td></td>
        </tr>
      </>
    );
  };

  // ─── Render detail panel content ─────────────────────────────────────────────

  const renderDetailContent = () => {
    if (activeDetail === 'gstr1') {
      const subTabs = [
        { id: 'b2b', label: 'B2B Invoices' },
        { id: 'b2cs', label: 'B2CS / B2CL' },
        { id: 'creditnotes', label: 'Credit Notes' },
        { id: 'debitnotes', label: 'Debit Notes' },
      ];
      const b2bInvoices = filteredInvoices.filter(i => i.gstType === GSTType.CGST_SGST || (custMap.get(i.customerId)?.gstin));
      const b2csInvoices = filteredInvoices.filter(i => i.gstType === GSTType.IGST);

      return (
        <div>
          {/* ── View toggle: App Data ↔ Portal Data ── */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center bg-slate-100 rounded-2xl p-1 gap-1">
              <button
                onClick={() => setGstr1View('app')}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                  gstr1View === 'app'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileText size={13} /> App Data
              </button>
              <button
                onClick={() => { setGstr1View('portal'); }}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                  gstr1View === 'portal'
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Cloud size={13} /> Portal Data
                {gstr1Online && <span className="ml-1 w-2 h-2 rounded-full bg-emerald-400 inline-block" />}
              </button>
            </div>

            {/* Right-side actions depend on active view */}
            {gstr1View === 'app' && (
              <div className="flex items-center gap-2">
                {periodMode === 'monthly' && (
                  <>
                    <button
                      onClick={handleDownloadJson}
                      disabled={!hasGSTR1Data || generatingJson}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed font-poppins"
                    >
                      {generatingJson ? <Loader2 size={13} className="animate-spin" /> : <FileJson size={13} />}
                      JSON
                    </button>
                    <button
                      onClick={handleDownloadExcel}
                      disabled={!hasGSTR1Data || generatingExcel}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed font-poppins"
                    >
                      {generatingExcel ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
                      Excel
                    </button>
                  </>
                )}
                {periodMode === 'quarterly' && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-poppins">
                    JSON/Excel available in monthly mode only
                  </p>
                )}
              </div>
            )}

            {gstr1View === 'portal' && (
              <div className="flex items-center gap-2">
                {cacheFetchedAt['1'] && <span className="text-xs text-slate-400">Cached · {fmtFetchedAt(cacheFetchedAt['1'])}</span>}
                {isSessionActive() ? (
                  <button
                    onClick={handleFetchGSTR1Online}
                    disabled={portalFetching}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 transition-all disabled:opacity-50"
                  >
                    {portalFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {cacheFetchedAt['1'] ? 'Refresh GSTR-1' : 'Fetch Filed GSTR-1'}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowPortalLogin(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all"
                  >
                    <Lock size={12} /> Connect Portal
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── APP DATA VIEW ── */}
          {gstr1View === 'app' && (
            <div>
              <SubTabBar tabs={subTabs} active={activeSubTab} onChange={setActiveSubTab} />
              <div className="mt-4">
                {activeSubTab === 'b2b' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          {['#', 'Date', 'Invoice #', 'Party', 'GSTIN', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total Tax', 'Total Amt', 'Status', ''].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <InvoiceTableRows invList={b2bInvoices} emptyMsg="No B2B invoices for this period." />
                      </tbody>
                    </table>
                  </div>
                )}
                {activeSubTab === 'b2cs' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          {['#', 'Date', 'Invoice #', 'Party', 'GSTIN', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total Tax', 'Total Amt', 'Status', ''].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <InvoiceTableRows invList={b2csInvoices} emptyMsg="No B2CS / B2CL invoices for this period." />
                      </tbody>
                    </table>
                  </div>
                )}
                {activeSubTab === 'creditnotes' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          {['#', 'Date', 'Note #', 'Party', 'Linked Invoice', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total Amt', ''].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <NoteTableRows noteList={filteredCreditNotes} emptyMsg="No credit notes for this period." />
                      </tbody>
                    </table>
                  </div>
                )}
                {activeSubTab === 'debitnotes' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          {['#', 'Date', 'Note #', 'Party', 'Linked Invoice', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total Amt', ''].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <NoteTableRows noteList={filteredDebitNotes} emptyMsg="No debit notes for this period." />
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── PORTAL DATA VIEW ── */}
          {gstr1View === 'portal' && (
            <div>
              {gstr1Online ? (
                <div className="space-y-5">
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Taxable Value', value: inr(gstr1Online.totalTaxableValue), color: 'bg-indigo-50 border-indigo-100 text-indigo-700' },
                      { label: 'IGST', value: inr(gstr1Online.totalIGST), color: 'bg-purple-50 border-purple-100 text-purple-700' },
                      { label: 'CGST', value: inr(gstr1Online.totalCGST), color: 'bg-teal-50 border-teal-100 text-teal-700' },
                      { label: 'SGST', value: inr(gstr1Online.totalSGST), color: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
                    ].map(card => (
                      <div key={card.label} className={`rounded-2xl border p-4 ${card.color}`}>
                        <p className="text-xs font-bold uppercase tracking-wide opacity-70 mb-1">{card.label}</p>
                        <p className="text-lg font-bold">{card.value}</p>
                        <p className="text-xs mt-0.5 opacity-60">Filed on GST Portal</p>
                      </div>
                    ))}
                  </div>

                  {/* Comparison table */}
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-5 py-3 border-b border-slate-200 flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide">App vs Portal Comparison</h4>
                      {gstr1Online.filedDate && (
                        <span className="text-xs text-slate-400">Filed on portal: {gstr1Online.filedDate}</span>
                      )}
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="py-2.5 px-5 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Field</th>
                          <th className="py-2.5 px-5 text-right text-xs font-bold text-indigo-600 uppercase tracking-wide">Your App</th>
                          <th className="py-2.5 px-5 text-right text-xs font-bold text-teal-600 uppercase tracking-wide">Filed on Portal</th>
                          <th className="py-2.5 px-5 text-right text-xs font-bold text-slate-500 uppercase tracking-wide">Difference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          { label: 'Taxable Value (B2B)', app: filteredInvoices.filter(i => custMap.get(i.customerId)?.gstin).reduce((s, i) => s + i.totalBeforeTax, 0), portal: gstr1Online.totalTaxableValue },
                          { label: 'IGST', app: totalIGST, portal: gstr1Online.totalIGST },
                          { label: 'CGST', app: totalCGST, portal: gstr1Online.totalCGST },
                          { label: 'SGST', app: totalSGST, portal: gstr1Online.totalSGST },
                          { label: 'Total Tax', app: totalIGST + totalCGST + totalSGST, portal: gstr1Online.totalIGST + gstr1Online.totalCGST + gstr1Online.totalSGST },
                        ].map(row => {
                          const diff = row.app - row.portal;
                          const isMatch = Math.abs(diff) < 1;
                          return (
                            <tr key={row.label} className="hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-5 text-xs font-medium text-slate-700">{row.label}</td>
                              <td className="py-3 px-5 text-xs font-bold text-indigo-700 text-right">{inr(row.app as number)}</td>
                              <td className="py-3 px-5 text-xs font-bold text-teal-700 text-right">{inr(row.portal as number)}</td>
                              <td className={`py-3 px-5 text-xs font-bold text-right ${isMatch ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {isMatch ? '✓ Match' : `${diff > 0 ? '+' : ''}${inr(diff as number)}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Info note */}
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <ShieldCheck size={12} className="text-teal-500" />
                    Portal data fetched from GST portal via WhiteBooks GSP. Switch to <strong>App Data</strong> to see invoices created in this app.
                  </p>
                </div>
              ) : (
                /* Not yet fetched */
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-teal-50 flex items-center justify-center">
                    <Cloud size={28} className="text-teal-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-700 mb-1">No portal data fetched yet</p>
                    <p className="text-xs text-slate-400 max-w-xs">
                      {isSessionActive()
                        ? 'Click "Fetch Filed GSTR-1" to download your filed return data from the GST portal.'
                        : 'Connect to the GST portal first, then fetch your filed GSTR-1 data.'}
                    </p>
                  </div>
                  {isSessionActive() ? (
                    <button
                      onClick={handleFetchGSTR1Online}
                      disabled={portalFetching}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-700 transition-all disabled:opacity-50"
                    >
                      {portalFetching ? <Loader2 size={16} className="animate-spin" /> : <Cloud size={16} />}
                      {portalFetching ? 'Fetching...' : 'Fetch Filed GSTR-1'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowPortalLogin(true)}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all"
                    >
                      <Lock size={16} /> Connect GST Portal
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    if (activeDetail === 'gstr3b') {
      const subTabs = [
        { id: 'taxsummary', label: 'Tax Summary Table' },
        { id: 'invoicelist', label: 'Invoice List' },
      ];
      return (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <SubTabBar tabs={subTabs} active={activeSubTab} onChange={setActiveSubTab} />
            <button
              onClick={() => setGstr3bPdfOpen(true)}
              disabled={!profile}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-poppins shrink-0"
            >
              <FileText size={13} />
              Download PDF
            </button>
          </div>
          <div className="mt-4">
            {activeSubTab === 'taxsummary' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">Description</th>
                        <th className="px-6 py-3 text-left text-slate-400 text-xs font-bold uppercase tracking-wide">Source</th>
                        <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">Taxable Value</th>
                        <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">IGST</th>
                        <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">CGST</th>
                        <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">SGST</th>
                        <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* 3.1(a) — Your App row */}
                      <tr className="border-b border-slate-100">
                        <td className="px-6 py-3 text-sm text-slate-700 font-medium" rowSpan={gstr3bOnline ? 2 : 1}>3.1(a) Outward taxable supplies</td>
                        <td className="px-6 py-3 text-xs font-bold text-indigo-500">BillHippo</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-700">{inr(totalTaxable)}</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-600">{inr(totalIGST)}</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-600">{inr(totalCGST)}</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-600">{inr(totalSGST)}</td>
                        <td className="px-6 py-3 text-sm text-right font-bold text-slate-800">{inr(totalTax)}</td>
                      </tr>
                      {/* 3.1(a) — Portal filed row (when available) */}
                      {gstr3bOnline && (
                        <tr className="border-b border-slate-200 bg-teal-50/60">
                          <td className="px-6 py-3 text-xs font-bold text-teal-600 flex items-center gap-1"><Cloud size={11} /> Filed (Portal)</td>
                          <td className="px-6 py-3 text-sm text-right font-semibold text-teal-700">{inr(gstr3bOnline.outwardTaxable)}</td>
                          <td className="px-6 py-3 text-sm text-right font-semibold text-teal-700">{inr(gstr3bOnline.outwardIGST)}</td>
                          <td className="px-6 py-3 text-sm text-right font-semibold text-teal-700">{inr(gstr3bOnline.outwardCGST)}</td>
                          <td className="px-6 py-3 text-sm text-right font-semibold text-teal-700">{inr(gstr3bOnline.outwardSGST)}</td>
                          <td className="px-6 py-3 text-sm text-right font-bold text-teal-800">{inr(gstr3bOnline.outwardTax ?? (gstr3bOnline.outwardIGST + gstr3bOnline.outwardCGST + gstr3bOnline.outwardSGST))}</td>
                        </tr>
                      )}
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <td className="px-6 py-3 text-sm text-slate-500">3.1(b) Outward taxable (zero rated)</td>
                        <td className="px-6 py-3 text-xs text-slate-400">—</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-400">—</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="px-6 py-3 text-sm text-slate-500">3.1(c) Other outward supplies (nil, exempt)</td>
                        <td className="px-6 py-3 text-xs text-slate-400">—</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-3 text-sm text-right text-slate-400">—</td>
                      </tr>
                      <tr className="bg-indigo-600 text-white font-bold">
                        <td className="px-6 py-4 text-sm">Total Liability (3.1)</td>
                        <td className="px-6 py-4 text-xs">BillHippo</td>
                        <td className="px-6 py-4 text-sm text-right">{inr(totalTaxable)}</td>
                        <td className="px-6 py-4 text-sm text-right">{inr(totalIGST)}</td>
                        <td className="px-6 py-4 text-sm text-right">{inr(totalCGST)}</td>
                        <td className="px-6 py-4 text-sm text-right">{inr(totalSGST)}</td>
                        <td className="px-6 py-4 text-sm text-right">{inr(totalTax)}</td>
                      </tr>
                      {gstr3bOnline && (
                        <tr className="bg-teal-600 text-white font-bold">
                          <td className="px-6 py-4 text-sm">Total Liability (3.1)</td>
                          <td className="px-6 py-4 text-xs">Filed (Portal)</td>
                          <td className="px-6 py-4 text-sm text-right">{inr(gstr3bOnline.outwardTaxable)}</td>
                          <td className="px-6 py-4 text-sm text-right">{inr(gstr3bOnline.outwardIGST)}</td>
                          <td className="px-6 py-4 text-sm text-right">{inr(gstr3bOnline.outwardCGST)}</td>
                          <td className="px-6 py-4 text-sm text-right">{inr(gstr3bOnline.outwardSGST)}</td>
                          <td className="px-6 py-4 text-sm text-right">{inr(gstr3bOnline.outwardTax ?? (gstr3bOnline.outwardIGST + gstr3bOnline.outwardCGST + gstr3bOnline.outwardSGST))}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 font-poppins">
                  Note: ITC (input tax credit) details must be filled manually in the GST portal.
                  {gstr3bOnline && <span className="text-teal-600 font-bold ml-2">· Teal rows = filed data from GST portal</span>}
                </p>
              </div>
            )}
            {activeSubTab === 'invoicelist' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['#', 'Date', 'Invoice #', 'Party', 'GSTIN', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total Tax', 'Total Amt', 'Status', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <InvoiceTableRows invList={filteredInvoices} emptyMsg="No invoices for this period." />
                  </tbody>
                </table>
              </div>
            )}

              {/* Portal comparison */}
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <Cloud size={15} className="text-indigo-500" /> Compare with GST Portal (Filed GSTR-3B)
                  </h4>
                  {isSessionActive() ? (
                    <div className="flex items-center gap-2">
                      {cacheFetchedAt['3b'] && <span className="text-xs text-slate-400">Cached · {fmtFetchedAt(cacheFetchedAt['3b'])}</span>}
                      <button
                        onClick={handleFetchGSTR3BOnline}
                        disabled={portalFetching}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all disabled:opacity-50"
                      >
                        {portalFetching ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        {cacheFetchedAt['3b'] ? 'Refresh' : 'Fetch Filed Data'}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowPortalLogin(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-200 text-slate-600 font-bold text-xs hover:bg-indigo-600 hover:text-white transition-all"
                    >
                      <Lock size={12} /> Connect Portal
                    </button>
                  )}
                </div>
                {gstr3bOnline ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-2 px-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wide">Field</th>
                          <th className="py-2 px-3 text-right text-xs font-bold text-indigo-600 uppercase tracking-wide">Your App (BillHippo)</th>
                          <th className="py-2 px-3 text-right text-xs font-bold text-teal-600 uppercase tracking-wide">GST Portal (Filed)</th>
                          <th className="py-2 px-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wide">Difference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[
                          { label: 'Taxable Value', app: totalTaxable, portal: gstr3bOnline.outwardTaxable },
                          { label: 'IGST', app: totalIGST, portal: gstr3bOnline.outwardIGST },
                          { label: 'CGST', app: totalCGST, portal: gstr3bOnline.outwardCGST },
                          { label: 'SGST', app: totalSGST, portal: gstr3bOnline.outwardSGST },
                          { label: 'Total Tax', app: totalTax, portal: gstr3bOnline.outwardTax ?? (gstr3bOnline.outwardIGST + gstr3bOnline.outwardCGST + gstr3bOnline.outwardSGST) },
                        ].map(row => {
                          const diff = row.app - row.portal;
                          const diffColor = Math.abs(diff) < 1 ? 'text-emerald-600' : diff > 0 ? 'text-amber-600' : 'text-rose-600';
                          return (
                            <tr key={row.label} className="hover:bg-white transition-colors">
                              <td className="py-2.5 px-3 text-xs font-medium text-slate-700">{row.label}</td>
                              <td className="py-2.5 px-3 text-xs font-bold text-indigo-700 text-right">{inr(row.app)}</td>
                              <td className="py-2.5 px-3 text-xs font-bold text-teal-700 text-right">{inr(row.portal)}</td>
                              <td className={`py-2.5 px-3 text-xs font-bold text-right ${diffColor}`}>
                                {Math.abs(diff) < 1 ? '✓ Match' : `${diff > 0 ? '+' : ''}${inr(diff)}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {gstr3bOnline.filedDate && (
                      <p className="text-xs text-slate-400 mt-3 text-right">Filed on: {gstr3bOnline.filedDate}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-4">
                    {isSessionActive() ? 'Click "Fetch Filed Data" to compare with your filed GSTR-3B' : 'Connect to GST Portal to compare with filed returns'}
                  </p>
                )}
              </div>
          </div>
        </div>
      );
    }

    if (activeDetail === 'taxsummary') {
      const subTabs = [
        { id: 'ratewise', label: 'Rate-wise Breakdown' },
        { id: 'invoicelist', label: 'Invoice List' },
      ];
      return (
        <div>
          <SubTabBar tabs={subTabs} active={activeSubTab} onChange={setActiveSubTab} />
          <div className="mt-4">
            {activeSubTab === 'ratewise' && (
              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">GST Rate</th>
                      <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">Taxable Value</th>
                      <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">IGST</th>
                      <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">CGST</th>
                      <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">SGST</th>
                      <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">Total Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-10 text-slate-400 text-sm font-poppins">No data for this period.</td>
                      </tr>
                    ) : (
                      <>
                        {rateBreakdown.map(row => (
                          <tr key={row.rate} className="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors">
                            <td className="px-6 py-4 text-sm font-bold text-indigo-600">{row.rate}%</td>
                            <td className="px-6 py-4 text-sm text-right text-slate-700">{inr(row.taxable)}</td>
                            <td className="px-6 py-4 text-sm text-right text-slate-600">{row.igst > 0 ? inr(row.igst) : '—'}</td>
                            <td className="px-6 py-4 text-sm text-right text-slate-600">{row.cgst > 0 ? inr(row.cgst) : '—'}</td>
                            <td className="px-6 py-4 text-sm text-right text-slate-600">{row.sgst > 0 ? inr(row.sgst) : '—'}</td>
                            <td className="px-6 py-4 text-sm text-right font-bold text-slate-800">{inr(row.tax)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-800 text-white font-bold">
                          <td className="px-6 py-4 text-sm">TOTAL</td>
                          <td className="px-6 py-4 text-sm text-right">{inr(rateBreakdown.reduce((s, r) => s + r.taxable, 0))}</td>
                          <td className="px-6 py-4 text-sm text-right">{inr(rateBreakdown.reduce((s, r) => s + r.igst, 0))}</td>
                          <td className="px-6 py-4 text-sm text-right">{inr(rateBreakdown.reduce((s, r) => s + r.cgst, 0))}</td>
                          <td className="px-6 py-4 text-sm text-right">{inr(rateBreakdown.reduce((s, r) => s + r.sgst, 0))}</td>
                          <td className="px-6 py-4 text-sm text-right">{inr(rateBreakdown.reduce((s, r) => s + r.tax, 0))}</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            {activeSubTab === 'invoicelist' && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['#', 'Date', 'Invoice #', 'Party', 'GSTIN', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total Tax', 'Total Amt', 'Status', ''].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <InvoiceTableRows invList={filteredInvoices} emptyMsg="No invoices for this period." />
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activeDetail === 'salesregister') {
      const subTabs = [
        { id: 'salesreg', label: 'Sales Register' },
        { id: 'creditnotes', label: 'Credit Notes' },
        { id: 'debitnotes', label: 'Debit Notes' },
        { id: 'hsn', label: 'HSN Summary' },
      ];

      return (
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <SubTabBar tabs={subTabs} active={activeSubTab} onChange={setActiveSubTab} />
            <div className="flex items-center gap-2 shrink-0">
              {activeSubTab === 'salesreg' && (
                <>
                  <button
                    onClick={() => setPdfModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all font-poppins"
                  >
                    <FileText size={13} />
                    Download PDF
                  </button>
                  <button
                    onClick={() => {
                      if (!profile) return;
                      downloadSalesRegisterExcel({
                        profile,
                        invoices: filteredInvoices,
                        customers,
                        periodLabel,
                      });
                    }}
                    disabled={!profile}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-poppins"
                  >
                    <FileSpreadsheet size={13} />
                    Download Excel
                  </button>
                </>
              )}
              {activeSubTab === 'creditnotes' && (
                <button
                  onClick={() => {
                    if (!profile) return;
                    downloadNotesRegisterExcel({
                      profile,
                      notes: filteredCreditNotes,
                      noteType: 'Credit',
                      periodLabel,
                    });
                  }}
                  disabled={!profile}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-poppins"
                >
                  <FileSpreadsheet size={13} />
                  Download Excel
                </button>
              )}
              {activeSubTab === 'debitnotes' && (
                <button
                  onClick={() => {
                    if (!profile) return;
                    downloadNotesRegisterExcel({
                      profile,
                      notes: filteredDebitNotes,
                      noteType: 'Debit',
                      periodLabel,
                    });
                  }}
                  disabled={!profile}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-poppins"
                >
                  <FileSpreadsheet size={13} />
                  Download Excel
                </button>
              )}
              {activeSubTab === 'hsn' && (
                <button
                  onClick={() => {
                    if (!profile) return;
                    downloadHSNExcel({
                      profile,
                      invoices: filteredInvoices,
                      periodLabel,
                    });
                  }}
                  disabled={!profile}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-poppins"
                >
                  <FileSpreadsheet size={13} />
                  Download Excel
                </button>
              )}
            </div>
          </div>

          {activeSubTab === 'salesreg' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['#', 'Date', 'Invoice #', 'Party', 'GSTIN', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total Tax', 'Total Amt', 'Status', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <InvoiceTableRows invList={filteredInvoices} emptyMsg="No invoices for this period." />
                </tbody>
              </table>
            </div>
          )}

          {activeSubTab === 'creditnotes' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['#', 'Date', 'Note #', 'Party', 'Linked Invoice', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total Amt', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <NoteTableRows noteList={filteredCreditNotes} emptyMsg="No credit notes for this period." />
                </tbody>
              </table>
            </div>
          )}

          {activeSubTab === 'debitnotes' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['#', 'Date', 'Note #', 'Party', 'Linked Invoice', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total Amt', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <NoteTableRows noteList={filteredDebitNotes} emptyMsg="No debit notes for this period." />
                </tbody>
              </table>
            </div>
          )}

          {activeSubTab === 'hsn' && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {['HSN Code', 'Description', 'UQC', 'Total Qty', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hsnRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-10 text-slate-400 text-sm font-poppins">
                        No HSN data for this period.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {hsnRows.map(row => (
                        <tr key={row.hsnCode} className="border-b border-slate-100 hover:bg-indigo-50/30 transition-colors">
                          <td className="px-4 py-3 text-xs font-bold text-slate-800 font-mono">{row.hsnCode}</td>
                          <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">{row.description}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{row.uqc}</td>
                          <td className="px-4 py-3 text-xs text-right text-slate-700">{row.totalQty.toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3 text-xs text-right text-slate-700">{inr(row.taxableValue)}</td>
                          <td className="px-4 py-3 text-xs text-right text-slate-600">{row.cgst > 0 ? inr(row.cgst) : '—'}</td>
                          <td className="px-4 py-3 text-xs text-right text-slate-600">{row.sgst > 0 ? inr(row.sgst) : '—'}</td>
                          <td className="px-4 py-3 text-xs text-right text-slate-600">{row.igst > 0 ? inr(row.igst) : '—'}</td>
                          <td className="px-4 py-3 text-xs text-right font-bold text-slate-800">{inr(row.totalTax)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-800 text-white font-bold">
                        <td className="px-4 py-3 text-xs" colSpan={4}>TOTAL</td>
                        <td className="px-4 py-3 text-xs text-right">{inr(hsnRows.reduce((s, r) => s + r.taxableValue, 0))}</td>
                        <td className="px-4 py-3 text-xs text-right">{inr(hsnRows.reduce((s, r) => s + r.cgst, 0))}</td>
                        <td className="px-4 py-3 text-xs text-right">{inr(hsnRows.reduce((s, r) => s + r.sgst, 0))}</td>
                        <td className="px-4 py-3 text-xs text-right">{inr(hsnRows.reduce((s, r) => s + r.igst, 0))}</td>
                        <td className="px-4 py-3 text-xs text-right">{inr(hsnRows.reduce((s, r) => s + r.totalTax, 0))}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    if (activeDetail === 'gstr2b') {
      return (
        <div className="space-y-6">
          {/* Actions bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {!isSessionActive() ? (
                <button
                  onClick={() => setShowPortalLogin(true)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  <Lock size={14} /> Connect GST Portal
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleFetchGSTR2B}
                    disabled={portalFetching}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 text-white font-bold text-sm hover:bg-teal-700 transition-all shadow-lg shadow-teal-100 disabled:opacity-50"
                  >
                    {portalFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {portalFetching ? 'Fetching...' : (cacheFetchedAt['2b'] ? 'Refresh GSTR-2B' : 'Fetch GSTR-2B')}
                  </button>
                  {cacheFetchedAt['2b'] && (
                    <span className="text-xs text-slate-400">Cached · {fmtFetchedAt(cacheFetchedAt['2b'])}</span>
                  )}
                </div>
              )}
              {gstr2bData && (
                <>
                  <button
                    onClick={() => setGstr2bPdfOpen(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-indigo-600 hover:text-white transition-all"
                  >
                    <FileText size={14} /> PDF
                  </button>
                  <button
                    onClick={() => profile && downloadGSTR2BExcel(gstr2bData, profile.name, profile.gstin)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-indigo-600 hover:text-white transition-all"
                  >
                    <FileSpreadsheet size={14} /> Excel
                  </button>
                </>
              )}
            </div>
            {portalDataPeriod && gstr2bData && (
              <p className="text-xs text-slate-400 font-poppins">Data for: <span className="font-bold text-slate-600">{portalDataPeriod}</span></p>
            )}
          </div>

          {portalError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-sm text-rose-600 flex items-start gap-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {portalError}
            </div>
          )}

          {!gstr2bData && !portalError && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
                <Cloud size={28} className="text-teal-400" />
              </div>
              <p className="text-base font-bold text-slate-700 mb-2">No GSTR-2B data loaded</p>
              <p className="text-sm text-slate-400 max-w-sm">
                {isSessionActive()
                  ? 'Click "Fetch GSTR-2B" to load your Input Tax Credit data from the GST portal for this period.'
                  : 'Connect to the GST portal first, then fetch your GSTR-2B data.'
                }
              </p>
            </div>
          )}

          {gstr2bData && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-teal-50 border border-teal-100 p-4">
                  <p className="text-xs font-bold text-teal-600 uppercase tracking-wide mb-1">Suppliers</p>
                  <p className="text-2xl font-bold text-teal-700">{gstr2bData.suppliers.length}</p>
                </div>
                <div className="rounded-2xl bg-blue-50 border border-blue-100 p-4">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-1">Invoices</p>
                  <p className="text-2xl font-bold text-blue-700">{gstr2bData.invoiceCount}</p>
                </div>
                <div className="rounded-2xl bg-indigo-50 border border-indigo-100 p-4">
                  <p className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1">Taxable Value</p>
                  <p className="text-lg font-bold text-indigo-700">{inr(gstr2bData.totalTaxableValue)}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-1">Total ITC</p>
                  <p className="text-lg font-bold text-emerald-700">{inr(gstr2bData.totalIGST + gstr2bData.totalCGST + gstr2bData.totalSGST)}</p>
                </div>
              </div>

              {/* ITC Breakdown */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-center">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">IGST Credit</p>
                  <p className="text-xl font-bold text-slate-800">{inr(gstr2bData.totalIGST)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-center">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">CGST Credit</p>
                  <p className="text-xl font-bold text-slate-800">{inr(gstr2bData.totalCGST)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 text-center">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">SGST Credit</p>
                  <p className="text-xl font-bold text-slate-800">{inr(gstr2bData.totalSGST)}</p>
                </div>
              </div>

              {/* Supplier-wise table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {['#', 'Supplier GSTIN', 'Supplier Name', 'Invoices', 'Taxable', 'IGST', 'CGST', 'SGST', 'Total ITC'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gstr2bData.suppliers.map((s, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-teal-50/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600">{s.gstin}</td>
                        <td className="px-4 py-3 text-xs font-semibold text-slate-800">{s.tradeName || s.legalName || '—'}</td>
                        <td className="px-4 py-3 text-xs text-center"><span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-bold">{s.invoices.length}</span></td>
                        <td className="px-4 py-3 text-xs text-right">{inr(s.totalTaxable)}</td>
                        <td className="px-4 py-3 text-xs text-right">{s.totalIGST > 0 ? inr(s.totalIGST) : '—'}</td>
                        <td className="px-4 py-3 text-xs text-right">{s.totalCGST > 0 ? inr(s.totalCGST) : '—'}</td>
                        <td className="px-4 py-3 text-xs text-right">{s.totalSGST > 0 ? inr(s.totalSGST) : '—'}</td>
                        <td className="px-4 py-3 text-xs text-right font-bold text-teal-600">{inr(s.totalIGST + s.totalCGST + s.totalSGST)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-800 text-white font-bold">
                      <td className="px-4 py-3 text-xs" colSpan={4}>TOTAL ({gstr2bData.suppliers.length} suppliers, {gstr2bData.invoiceCount} invoices)</td>
                      <td className="px-4 py-3 text-xs text-right">{inr(gstr2bData.totalTaxableValue)}</td>
                      <td className="px-4 py-3 text-xs text-right">{inr(gstr2bData.totalIGST)}</td>
                      <td className="px-4 py-3 text-xs text-right">{inr(gstr2bData.totalCGST)}</td>
                      <td className="px-4 py-3 text-xs text-right">{inr(gstr2bData.totalSGST)}</td>
                      <td className="px-4 py-3 text-xs text-right">{inr(gstr2bData.totalIGST + gstr2bData.totalCGST + gstr2bData.totalSGST)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      );
    }

    return null;
  };

  const detailTitles: Record<NonNullable<ActiveDetail>, string> = {
    gstr1: 'GSTR-1 — Outward Supplies',
    gstr3b: 'GSTR-3B — Summary Return',
    taxsummary: 'Tax Summary',
    salesregister: 'Sales Register',
    gstr2b: 'GSTR-2B — Portal Data',
  };

  // ─── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 font-poppins">

      {/* ── Header / Period selector ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 p-8 rounded-3xl bg-white border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold font-poppins mb-1">Tax Filing Center</h2>
          <p className="text-slate-500 text-sm">GST compliant reports for {periodLabel}</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Monthly / Quarterly toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-2xl">
            <button
              onClick={() => setPeriodMode('monthly')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                periodMode === 'monthly' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setPeriodMode('quarterly')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                periodMode === 'quarterly' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Quarterly
            </button>
          </div>

          {/* Period dropdown */}
          <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-2xl">
            <Calendar className="text-slate-500 ml-2" size={18} />
            {periodMode === 'monthly' ? (
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="bg-transparent border-none outline-none font-semibold text-sm pr-6 font-poppins"
              >
                {months.map(m => (
                  <option key={m} value={m}>
                    {new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedQuarter}
                onChange={e => setSelectedQuarter(e.target.value)}
                className="bg-transparent border-none outline-none font-semibold text-sm pr-6 font-poppins"
              >
                {quarterOptions.map(q => (
                  <option key={q} value={q}>{quarterLabel(q)}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick stats bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatChip
          icon={<FileText size={16} className="text-indigo-600" />}
          label="Total Invoices"
          value={String(filteredInvoices.length)}
          bg="bg-indigo-50"
        />
        <StatChip
          icon={<IndianRupee size={16} className="text-emerald-600" />}
          label="Total Sales"
          value={inr(totalTaxable + totalTax)}
          bg="bg-emerald-50"
        />
        <StatChip
          icon={<TrendingUp size={16} className="text-purple-600" />}
          label="Total Tax"
          value={inr(totalTax)}
          bg="bg-purple-50"
        />
        <StatChip
          icon={<AlertCircle size={16} className="text-amber-600" />}
          label="Credit / Debit Notes"
          value={`${filteredCreditNotes.length} / ${filteredDebitNotes.length}`}
          bg="bg-amber-50"
        />
      </div>

      {/* ── GST Portal Session Status ── */}
      <div className={`rounded-2xl border p-4 flex items-center justify-between gap-4 ${isSessionActive() ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
        <div className="flex items-center gap-3">
          {isSessionActive()
            ? <ShieldCheck size={18} className="text-emerald-500 shrink-0" />
            : <WifiOff size={18} className="text-slate-400 shrink-0" />
          }
          <div>
            <p className={`text-sm font-bold ${isSessionActive() ? 'text-emerald-700' : 'text-slate-600'}`}>
              {isSessionActive() ? `GST Portal Connected (${gstSession!.gstUsername})` : 'GST Portal Not Connected'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {isSessionActive()
                ? `Session expires: ${new Date(gstSession!.expiresAt).toLocaleTimeString('en-IN')}`
                : 'Connect to fetch GSTR-2B, compare GSTR-3B & GSTR-1 data from GST portal'
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSessionActive() && (
            <button
              onClick={() => setShowBulkFetch(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-all"
            >
              <Calendar size={14} />
              Fetch Year Data
            </button>
          )}
          <button
            onClick={() => setShowPortalLogin(true)}
            disabled={!profile?.gstin}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40 ${isSessionActive() ? 'bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100'}`}
          >
            <Cloud size={15} />
            {isSessionActive() ? 'Reconnect' : 'Connect to GST Portal'}
          </button>
        </div>
      </div>

      {/* ── Report cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* GSTR-1 */}
        <ReportCard
          color="bg-indigo-500"
          title="GSTR-1"
          desc="Outward supplies — GST portal compliant Excel & JSON"
          status={hasGSTR1Data ? 'Ready' : 'No Data'}
          fields={[
            `B2B Invoices: ${b2bCount}`,
            `Inter-state (IGST): ${igstCount}`,
            `Total Invoices: ${filteredInvoices.length}`,
            `Credit Notes: ${filteredCreditNotes.length}`,
          ]}
          onClick={() => openDetail('gstr1')}
          active={activeDetail === 'gstr1'}
        />

        {/* GSTR-3B */}
        <ReportCard
          color="bg-purple-500"
          title="GSTR-3B"
          desc="Summary of outward & inward supplies"
          status={filteredInvoices.length > 0 ? 'Ready' : 'No Data'}
          fields={[
            `Taxable: ${inr(totalTaxable)}`,
            `CGST: ${inr(totalCGST)}`,
            `SGST: ${inr(totalSGST)}`,
            `IGST: ${inr(totalIGST)}`,
          ]}
          onClick={() => openDetail('gstr3b')}
          active={activeDetail === 'gstr3b'}
        />

        {/* Sales Register */}
        <ReportCard
          color="bg-emerald-500"
          title="Sales Register"
          desc="Full register with PDF & Excel export"
          status={filteredInvoices.length > 0 ? 'Ready' : 'No Data'}
          fields={[
            `Invoices: ${filteredInvoices.length}`,
            `Credit Notes: ${filteredCreditNotes.length}`,
            `Debit Notes: ${filteredDebitNotes.length}`,
            `HSN Codes: ${hsnRows.length}`,
          ]}
          onClick={() => openDetail('salesregister')}
          active={activeDetail === 'salesregister'}
        />

        {/* GSTR-2B Portal */}
        <ReportCard
          color="bg-teal-500"
          title="GSTR-2B"
          desc="Input Tax Credit from GST Portal — fetch & compare"
          status={gstr2bData ? 'Fetched' : isSessionActive() ? 'Ready' : 'Login Required'}
          fields={[
            gstr2bData ? `Suppliers: ${gstr2bData.suppliers.length}` : 'Connect to GST Portal',
            gstr2bData ? `Invoices: ${gstr2bData.invoiceCount}` : 'Auto-fetch GSTR-2B data',
            gstr2bData ? `ITC: ${inr(gstr2bData.totalIGST + gstr2bData.totalCGST + gstr2bData.totalSGST)}` : 'Download as PDF & Excel',
            gstr2bData ? `Period: ${portalDataPeriod}` : 'Compare with your purchases',
          ]}
          onClick={() => openDetail('gstr2b')}
          active={activeDetail === 'gstr2b'}
        />
      </div>

      {/* ── Detail panel ── */}
      {activeDetail !== null && (
        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          {/* Panel header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setActiveDetail(null)}
                className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-500"
                aria-label="Close panel"
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <h3 className="text-lg font-bold text-slate-900">{detailTitles[activeDetail]}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{periodLabel}</p>
              </div>
            </div>
            <button
              onClick={() => setActiveDetail(null)}
              className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Panel content */}
          <div className="p-6 md:p-8">
            {renderDetailContent()}
          </div>
        </div>
      )}

      {/* ── Filing deadline reminder ── */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-8">
        <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Calendar size={18} className="text-indigo-500" />
          GST Filing Deadlines
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className={`rounded-2xl border p-4 flex items-start gap-3 ${filingDeadlines.gstr1.color}`}>
            {filingDeadlines.gstr1.icon}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-0.5">GSTR-1</p>
              <p className="text-sm font-semibold">Due: {filingDeadlines.gstr1.date}</p>
              <p className="text-xs mt-0.5">
                {filingDeadlines.gstr1.days < 0
                  ? `Overdue by ${Math.abs(filingDeadlines.gstr1.days)} days`
                  : filingDeadlines.gstr1.days === 0
                  ? 'Due today'
                  : `${filingDeadlines.gstr1.days} days remaining`}
              </p>
            </div>
          </div>
          <div className={`rounded-2xl border p-4 flex items-start gap-3 ${filingDeadlines.gstr3b.color}`}>
            {filingDeadlines.gstr3b.icon}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-0.5">GSTR-3B</p>
              <p className="text-sm font-semibold">Due: {filingDeadlines.gstr3b.date}</p>
              <p className="text-xs mt-0.5">
                {filingDeadlines.gstr3b.days < 0
                  ? `Overdue by ${Math.abs(filingDeadlines.gstr3b.days)} days`
                  : filingDeadlines.gstr3b.days === 0
                  ? 'Due today'
                  : `${filingDeadlines.gstr3b.days} days remaining`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Outstanding tax dues ── */}
      {unpaidInvoices.length > 0 && (
        <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-8">
          <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            Outstanding Tax Dues
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1">Unpaid / Partial</p>
              <p className="text-2xl font-bold text-amber-700">{unpaidInvoices.length}</p>
              <p className="text-xs text-amber-600 mt-0.5">invoices</p>
            </div>
            <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
              <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">Estimated Tax Due</p>
              <p className="text-2xl font-bold text-red-700">{inr(outstandingTax)}</p>
              <p className="text-xs text-red-500 mt-0.5">on unpaid invoices</p>
            </div>
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Outstanding Amount</p>
              <p className="text-2xl font-bold text-slate-700">{inr(unpaidInvoices.reduce((s, i) => s + i.totalAmount, 0))}</p>
              <p className="text-xs text-slate-400 mt-0.5">total receivable</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate?.('invoices')}
            className="mt-4 flex items-center gap-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            View unpaid invoices <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ── Sales Register direct download ── */}
      {pdfModalOpen && profile && (
        <PDFDirectDownload
          document={
            <SalesRegisterPDF
              profile={profile}
              invoices={filteredInvoices}
              customers={customers}
              periodLabel={periodLabel}
              logoUrl={profile.theme?.logoUrl}
            />
          }
          fileName={`Sales_Register_${periodLabel.replace(/[^a-zA-Z0-9\-_]/g, '_')}.pdf`}
          onDone={() => setPdfModalOpen(false)}
        />
      )}

      {/* ── GSTR-3B direct download ── */}
      {gstr3bPdfOpen && profile && (
        <PDFDirectDownload
          document={
            <GSTR3BPDF
              profile={profile}
              invoices={filteredInvoices}
              customers={customers}
              creditNotes={filteredCreditNotes}
              debitNotes={filteredDebitNotes}
              periodLabel={periodLabel}
              natureOfReturn={periodMode === 'monthly' ? 'Monthly' : 'Quarterly'}
              logoUrl={profile.theme?.logoUrl}
            />
          }
          fileName={`GSTR-3B_${periodLabel.replace(/[^a-zA-Z0-9\-_]/g, '_')}.pdf`}
          onDone={() => setGstr3bPdfOpen(false)}
        />
      )}

      {/* Bulk FY Fetch Modal */}
      {showBulkFetch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-lg shadow-2xl font-poppins">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900">Fetch Year Data</h3>
              <button onClick={() => { setShowBulkFetch(false); setBulkProgress({}); }} className="p-2 hover:bg-slate-50 rounded-xl">
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <div className="flex items-center gap-3 mb-6">
              <label className="text-sm font-bold text-slate-600">Financial Year:</label>
              <select
                value={bulkFetchYear}
                onChange={e => setBulkFetchYear(Number(e.target.value))}
                className="bg-slate-50 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 border-none focus:ring-2 ring-indigo-100"
              >
                {[0, 1, 2, 3].map(i => {
                  const y = new Date().getFullYear() - i;
                  return <option key={y} value={y}>FY {y}-{String(y + 1).slice(2)}</option>;
                })}
              </select>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {(() => {
                const months: { label: string; period: string }[] = [];
                const labels = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'];
                for (let m = 4; m <= 12; m++) months.push({ label: labels[m - 4], period: `${String(m).padStart(2, '0')}${bulkFetchYear}` });
                for (let m = 1; m <= 3; m++) months.push({ label: labels[9 + m - 1], period: `${String(m).padStart(2, '0')}${bulkFetchYear + 1}` });
                return months.map(({ label, period }) => {
                  const st = bulkProgress[period];
                  return (
                    <div key={period} className={`rounded-xl p-3 text-center text-xs font-bold border ${
                      st === 'done' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                      st === 'fetching' ? 'bg-indigo-50 border-indigo-200 text-indigo-600 animate-pulse' :
                      st === 'error' ? 'bg-rose-50 border-rose-200 text-rose-600' :
                      'bg-slate-50 border-slate-200 text-slate-500'
                    }`}>
                      {label}
                      <div className="text-[9px] mt-1 font-normal opacity-70">{period}</div>
                      {st === 'done' && <div className="text-[10px]">✓</div>}
                      {st === 'error' && <div className="text-[10px]">✗</div>}
                    </div>
                  );
                });
              })()}
            </div>
            {!isSessionActive() ? (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-xl p-3 mb-4 font-medium">Connect to GST Portal first to fetch data.</p>
            ) : null}
            <button
              onClick={handleBulkFetch}
              disabled={bulkFetching || !isSessionActive()}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100"
            >
              {bulkFetching ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              {bulkFetching ? 'Fetching...' : `Fetch All Months for FY ${bulkFetchYear}-${String(bulkFetchYear + 1).slice(2)}`}
            </button>
            <p className="text-xs text-slate-400 text-center mt-3">Data is saved locally — you won't need to fetch again unless it changes.</p>
          </div>
        </div>
      )}

      {/* GST Portal Login Modal */}
      {showPortalLogin && profile?.gstin && (
        <GSTPortalLogin
          gstin={profile.gstin}
          prefilledUsername={profile.gstPortalUsername}
          onSuccess={handlePortalLogin}
          onClose={() => setShowPortalLogin(false)}
        />
      )}

      {/* GSTR-2B direct download */}
      {gstr2bPdfOpen && gstr2bData && profile && (
        <PDFDirectDownload
          document={<GSTR2BPDF data={gstr2bData} businessName={profile.name} businessGSTIN={profile.gstin} />}
          fileName={`GSTR-2B-${profile.gstin}-${gstr2bData.period}.pdf`}
          onDone={() => setGstr2bPdfOpen(false)}
        />
      )}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SubTabBarProps {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}

const SubTabBar: React.FC<SubTabBarProps> = ({ tabs, active, onChange }) => (
  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl flex-wrap">
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all font-poppins whitespace-nowrap ${
          active === tab.id
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'bg-transparent text-slate-500 hover:text-slate-700'
        }`}
      >
        {tab.label}
      </button>
    ))}
  </div>
);

interface StatChipProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  bg: string;
}

const StatChip: React.FC<StatChipProps> = ({ icon, label, value, bg }) => (
  <div className={`rounded-2xl ${bg} border border-transparent p-4 flex items-center gap-3`}>
    <div className="shrink-0">{icon}</div>
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 truncate">{label}</p>
      <p className="text-sm font-bold text-slate-800 truncate">{value}</p>
    </div>
  </div>
);

interface ReportCardProps {
  color: string;
  title: string;
  desc: string;
  status: string;
  fields: string[];
  onClick: () => void;
  active: boolean;
}

const ReportCard: React.FC<ReportCardProps> = ({ color, title, desc, status, fields, onClick, active }) => (
  <div
    onClick={onClick}
    className={`p-6 rounded-3xl bg-white border shadow-sm flex flex-col cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${
      active ? 'border-indigo-500 shadow-indigo-100' : 'border-slate-200 hover:border-indigo-300'
    }`}
  >
    <div className="flex items-center justify-between mb-5">
      <div className={`p-2.5 rounded-2xl text-white ${color}`}>
        <FileText size={20} />
      </div>
      <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase font-poppins ${
        status === 'Ready' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'
      }`}>
        {status}
      </span>
    </div>
    <h3 className="text-lg font-bold font-poppins mb-1">{title}</h3>
    <p className="text-xs text-slate-500 mb-4 leading-relaxed flex-1">{desc}</p>
    <div className="space-y-1.5 border-t border-slate-100 pt-4">
      {fields.map(field => (
        <div key={field} className="flex items-center justify-between text-xs">
          <span className="text-slate-500 font-poppins">{field}</span>
          <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
        </div>
      ))}
    </div>
    <div className="mt-4 flex items-center justify-center gap-1 text-xs font-bold text-indigo-600">
      View Details <ChevronRight size={13} />
    </div>
  </div>
);

export default GSTReports;
