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
} from 'lucide-react';
import { getInvoices, getCustomers, getBusinessProfile, getCreditNotes, getDebitNotes } from '../lib/firestore';
import { downloadGSTR1Excel, downloadGSTR1JSON } from '../lib/gstr1Generator';
import { downloadSalesRegisterExcel, downloadNotesRegisterExcel, downloadHSNExcel, aggregateHSN } from '../lib/salesRegisterExport';
import { Invoice, GSTType, Customer, BusinessProfile, CreditNote, DebitNote } from '../types';
import PDFPreviewModal from './pdf/PDFPreviewModal';
import SalesRegisterPDF from './pdf/SalesRegisterPDF';

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

function generateQuarterOptions(): string[] {
  // Returns last 8 quarters in descending order
  const result: string[] = [];
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Determine current quarter key
  let curQ: number;
  let curYear: number;
  if (month >= 4 && month <= 6) { curQ = 1; curYear = year; }
  else if (month >= 7 && month <= 9) { curQ = 2; curYear = year; }
  else if (month >= 10 && month <= 12) { curQ = 3; curYear = year; }
  else { curQ = 4; curYear = year - 1; }

  for (let i = 0; i < 8; i++) {
    result.push(`${curYear}-Q${curQ}`);
    curQ--;
    if (curQ === 0) {
      curQ = 4;
      curYear--;
    }
  }
  return result;
}

function monthEndDate(ym: string): string {
  // Returns the last day of the month as YYYY-MM-DD
  const [year, month] = ym.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function inr(n: number): string {
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string): string {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}-${m}-${y}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GSTReportsProps {
  userId: string;
  onNavigate?: (tab: string) => void;
}

type ActiveDetail = 'gstr1' | 'gstr3b' | 'taxsummary' | 'salesregister' | null;

// ─── Component ────────────────────────────────────────────────────────────────

const GSTReports: React.FC<GSTReportsProps> = ({ userId, onNavigate }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [debitNotes, setDebitNotes] = useState<DebitNote[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Period state
  const [periodMode, setPeriodMode] = useState<'monthly' | 'quarterly'>('monthly');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedQuarter, setSelectedQuarter] = useState(() => getCurrentIndianQuarter());

  // Detail panel
  const [activeDetail, setActiveDetail] = useState<ActiveDetail>(null);
  const [activeSubTab, setActiveSubTab] = useState<string>('');

  // Download state
  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [generatingJson, setGeneratingJson] = useState(false);

  // PDF Preview
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

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
  const months = useMemo(() => {
    const result: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return result;
  }, []);

  // Quarter options (last 8 quarters)
  const quarterOptions = useMemo(() => generateQuarterOptions(), []);

  // MMYYYY format for GSTR-1 fp
  const fp = useMemo(() => {
    const [year, month] = selectedMonth.split('-');
    return `${month}${year}`;
  }, [selectedMonth]);

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
    else setActiveSubTab('');
  };

  const hasGSTR1Data = filteredInvoices.length > 0;

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
          <div className="flex items-center justify-between mb-4">
            <SubTabBar tabs={subTabs} active={activeSubTab} onChange={setActiveSubTab} />
            {periodMode === 'monthly' && (
              <div className="flex items-center gap-2">
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
              </div>
            )}
            {periodMode === 'quarterly' && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 font-poppins">
                GSTR-1 JSON/Excel available in monthly mode only
              </p>
            )}
          </div>

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
      );
    }

    if (activeDetail === 'gstr3b') {
      const subTabs = [
        { id: 'taxsummary', label: 'Tax Summary Table' },
        { id: 'invoicelist', label: 'Invoice List' },
      ];
      return (
        <div>
          <SubTabBar tabs={subTabs} active={activeSubTab} onChange={setActiveSubTab} />
          <div className="mt-4">
            {activeSubTab === 'taxsummary' && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-slate-500 text-xs font-bold uppercase tracking-wide">Description</th>
                        <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">Taxable Value</th>
                        <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">IGST</th>
                        <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">CGST</th>
                        <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">SGST</th>
                        <th className="px-6 py-3 text-right text-slate-500 text-xs font-bold uppercase tracking-wide">Total Tax</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100">
                        <td className="px-6 py-4 text-sm text-slate-700 font-medium">3.1(a) Outward taxable supplies</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-700">{inr(totalTaxable)}</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-600">{inr(totalIGST)}</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-600">{inr(totalCGST)}</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-600">{inr(totalSGST)}</td>
                        <td className="px-6 py-4 text-sm text-right font-bold text-slate-800">{inr(totalTax)}</td>
                      </tr>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <td className="px-6 py-4 text-sm text-slate-500">3.1(b) Outward taxable (zero rated)</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-400">—</td>
                      </tr>
                      <tr className="border-b border-slate-100">
                        <td className="px-6 py-4 text-sm text-slate-500">3.1(c) Other outward supplies (nil, exempt)</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-400">—</td>
                        <td className="px-6 py-4 text-sm text-right text-slate-400">—</td>
                      </tr>
                      <tr className="bg-indigo-600 text-white font-bold">
                        <td className="px-6 py-4 text-sm">Total Liability (3.1)</td>
                        <td className="px-6 py-4 text-sm text-right">{inr(totalTaxable)}</td>
                        <td className="px-6 py-4 text-sm text-right">{inr(totalIGST)}</td>
                        <td className="px-6 py-4 text-sm text-right">{inr(totalCGST)}</td>
                        <td className="px-6 py-4 text-sm text-right">{inr(totalSGST)}</td>
                        <td className="px-6 py-4 text-sm text-right">{inr(totalTax)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 font-poppins">
                  Note: ITC (input tax credit) details must be filled manually in the GST portal.
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

    return null;
  };

  const detailTitles: Record<NonNullable<ActiveDetail>, string> = {
    gstr1: 'GSTR-1 — Outward Supplies',
    gstr3b: 'GSTR-3B — Summary Return',
    taxsummary: 'Tax Summary',
    salesregister: 'Sales Register',
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

      {/* ── 4 Report cards ── */}
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

        {/* Tax Summary */}
        <ReportCard
          color="bg-amber-500"
          title="Tax Summary"
          desc="Rate-wise tax collected this period"
          status={totalTax > 0 ? 'Ready' : 'No Data'}
          fields={[
            `Total Tax: ${inr(totalTax)}`,
            `Total Sales: ${inr(totalTaxable + totalTax)}`,
            `Invoices: ${filteredInvoices.length}`,
            `GST Rates: ${rateBreakdown.length}`,
          ]}
          onClick={() => openDetail('taxsummary')}
          active={activeDetail === 'taxsummary'}
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

      {/* ── PDF Preview Modal ── */}
      {profile && (
        <PDFPreviewModal
          open={pdfModalOpen}
          onClose={() => setPdfModalOpen(false)}
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
