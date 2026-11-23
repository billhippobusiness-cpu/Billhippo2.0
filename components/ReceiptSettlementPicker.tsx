/**
 * ReceiptSettlementPicker — asks how a receipt is to be settled.
 *
 *  • Against invoice(s): the user ticks the open invoices this money is for
 *    and can adjust how much goes to each. Anything left over is set off
 *    against the oldest open invoices (FIFO).
 *  • Lump sum: the whole receipt settles the oldest open invoices first.
 *
 * A live preview shows exactly which invoices the receipt will clear, using
 * the same settlement engine the ledger uses (lib/receivables.ts).
 */

import React, { useMemo } from 'react';
import { FileText, Layers, AlertTriangle, Info, Check } from 'lucide-react';
import type { Invoice, LedgerEntry, ReceiptAllocation } from '../types';
import { settleLedger, requestedAllocations, OVERDUE_ALERT_DAYS } from '../lib/receivables';

export type SettlementMode = 'invoice' | 'lumpsum';

export interface SettlementChoice {
  mode: SettlementMode | null;
  /** invoiceId → amount as typed */
  picks: Record<string, string>;
}

export const EMPTY_CHOICE: SettlementChoice = { mode: null, picks: {} };

export interface OpenInvoice {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  days: number;
  outstanding: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string | undefined) => {
  const n = parseFloat(s ?? '');
  return Number.isFinite(n) ? n : 0;
};

/** Invoices with money still open on them, oldest first. */
export function openInvoicesFor(
  entries: LedgerEntry[],
  invoicesMap: Record<string, Invoice>,
  creditNoteInvoice: Map<string, string>,
): OpenInvoice[] {
  const { receivables } = settleLedger(entries, { creditNoteInvoice });
  const descById = new Map<string, string>(entries.map(e => [e.id, e.description]));
  return [...receivables.values()]
    .filter(r => r.invoiceId && r.outstanding > 0)
    .map(r => ({
      invoiceId: r.invoiceId!,
      invoiceNumber: invoicesMap[r.invoiceId!]?.invoiceNumber
        || (descById.get(r.entryId) || '').replace(/^Sale - /, '')
        || 'Invoice',
      date: r.date,
      days: r.days,
      outstanding: r.outstanding,
    }));
}

/** What gets stored on the receipt. Lump sum → an empty list. */
export function choiceToAllocations(choice: SettlementChoice): ReceiptAllocation[] {
  if (choice.mode !== 'invoice') return [];
  return Object.entries(choice.picks)
    .map(([invoiceId, amount]) => ({ invoiceId, amount: r2(num(amount)) }))
    .filter(a => a.amount > 0);
}

/** The choice an existing receipt was saved with, for the edit form. */
export function choiceFromEntry(entry: LedgerEntry): SettlementChoice {
  const requested = requestedAllocations(entry);
  if (requested.length === 0) return { mode: 'lumpsum', picks: {} };
  return {
    mode: 'invoice',
    picks: Object.fromEntries(requested.map(a => [a.invoiceId, String(r2(a.amount))])),
  };
}

/** Sum of the amounts picked against invoices. */
export const pickedTotal = (choice: SettlementChoice) =>
  r2((Object.values(choice.picks) as string[]).reduce((s, v) => s + num(v), 0));

/** Why the choice cannot be saved yet, or null when it can. */
export function settlementChoiceError(
  choice: SettlementChoice,
  amount: number,
  open: OpenInvoice[],
): string | null {
  if (open.length === 0) return null;   // nothing to choose from → advance
  if (!choice.mode) return 'Choose whether this receipt settles specific invoices or is a lump sum.';
  if (choice.mode === 'lumpsum') return null;
  const picked = Object.keys(choice.picks);
  if (picked.length === 0) return 'Tick the invoice(s) this receipt is for.';
  const byId = new Map(open.map(o => [o.invoiceId, o]));
  for (const id of picked) {
    const inv = byId.get(id);
    const value = num(choice.picks[id]);
    if (!inv) continue;
    if (value <= 0) return `Enter the amount received against ${inv.invoiceNumber}.`;
    if (value > inv.outstanding + 0.005) {
      return `${inr(value)} is more than the ${inr(inv.outstanding)} open on ${inv.invoiceNumber}.`;
    }
  }
  const total = pickedTotal(choice);
  if (amount > 0 && total > amount + 0.005) {
    return `${inr(total)} is set against invoices, but the receipt is only ${inr(amount)}.`;
  }
  return null;
}

interface Props {
  /** This customer's ledger, without the receipt being edited. */
  entries: LedgerEntry[];
  invoicesMap: Record<string, Invoice>;
  creditNoteInvoice: Map<string, string>;
  /** Receipt amount; 0 while the field is empty. */
  amount: number;
  date: string;
  choice: SettlementChoice;
  onChange: (choice: SettlementChoice) => void;
  open: OpenInvoice[];
  error: string | null;
}

const ReceiptSettlementPicker: React.FC<Props> = ({
  entries, invoicesMap, creditNoteInvoice, amount, date, choice, onChange, open, error,
}) => {
  const togglePick = (inv: OpenInvoice) => {
    const picks = { ...choice.picks };
    if (picks[inv.invoiceId] !== undefined) {
      delete picks[inv.invoiceId];
    } else {
      const others = (Object.values(picks) as string[]).reduce((s, v) => s + num(v), 0);
      const remaining = r2(amount - others);
      const share = amount > 0 && remaining > 0 ? Math.min(inv.outstanding, remaining) : inv.outstanding;
      picks[inv.invoiceId] = String(r2(share));
    }
    onChange({ ...choice, picks });
  };

  // What saving this receipt would do, worked out by the same engine the
  // ledger uses — so the preview can never disagree with the result.
  const preview = useMemo(() => {
    if (!(amount > 0) || error) return null;
    if (open.length > 0 && !choice.mode) return null;
    const PREVIEW_ID = '__receipt_preview__';
    const s = settleLedger([
      ...entries,
      {
        id: PREVIEW_ID, date: date || '9999-12-31', type: 'Credit', amount,
        description: '', customerId: '', allocations: choiceToAllocations(choice),
      },
    ], { creditNoteInvoice });
    const credit = s.credits.get(PREVIEW_ID);
    if (!credit) return null;
    const descById = new Map<string, string>(entries.map(e => [e.id, e.description]));
    return {
      lines: credit.applied.map(a => {
        const after = s.receivables.get(a.receivableEntryId);
        return {
          key: `${a.receivableEntryId}-${a.fifo}`,
          label: (a.invoiceId && invoicesMap[a.invoiceId]?.invoiceNumber)
            || (descById.get(a.receivableEntryId) || '').replace(/^Sale - /, ''),
          amount: a.amount,
          fifo: a.fifo,
          left: after?.outstanding ?? 0,
        };
      }),
      advance: credit.unapplied,
    };
  }, [entries, invoicesMap, creditNoteInvoice, amount, date, choice, open.length, error]);

  if (open.length === 0) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 text-slate-500 text-xs font-medium font-poppins">
        <Info size={16} className="text-profee-blue shrink-0 mt-0.5" />
        <span>This customer has no open invoices. The receipt will be kept as an advance and set off against their next invoice automatically.</span>
      </div>
    );
  }

  const modeButton = (mode: SettlementMode, Icon: typeof FileText, title: string, hint: string) => {
    const active = choice.mode === mode;
    return (
      <button
        type="button"
        onClick={() => onChange({ mode, picks: mode === 'invoice' ? choice.picks : {} })}
        aria-pressed={active}
        className={`flex-1 text-left p-4 rounded-2xl border-2 transition-all ${active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}
      >
        <span className={`flex items-center gap-2 text-sm font-bold ${active ? 'text-emerald-700' : 'text-slate-700'}`}>
          <Icon size={16} /> {title}
          {active && <Check size={14} className="ml-auto" />}
        </span>
        <span className="block text-[11px] text-slate-400 font-medium mt-1">{hint}</span>
      </button>
    );
  };

  return (
    <div className="space-y-4 font-poppins">
      <div className="space-y-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Is this receipt against a particular invoice, or a lump sum?</p>
        <div className="flex flex-col sm:flex-row gap-3">
          {modeButton('invoice', FileText, 'Against invoice(s)', 'Pick the invoice(s) this payment settles')}
          {modeButton('lumpsum', Layers, 'Lump sum', 'Settle the oldest open invoices first (FIFO)')}
        </div>
      </div>

      {choice.mode === 'invoice' && (
        <div className="rounded-2xl border border-slate-100 divide-y divide-slate-50 max-h-72 overflow-y-auto">
          {open.map(inv => {
            const picked = choice.picks[inv.invoiceId] !== undefined;
            const late = inv.days > OVERDUE_ALERT_DAYS;
            return (
              <div key={inv.invoiceId} className={`flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2 px-4 py-3 ${picked ? 'bg-emerald-50/40' : ''}`}>
                <input
                  type="checkbox"
                  checked={picked}
                  onChange={() => togglePick(inv)}
                  className="w-4 h-4 accent-emerald-500 shrink-0 cursor-pointer"
                  aria-label={`Settle ${inv.invoiceNumber}`}
                />
                <button type="button" onClick={() => togglePick(inv)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-bold text-slate-800 truncate">{inv.invoiceNumber}</p>
                  <p className="text-[11px] font-medium text-slate-400">
                    {inv.date} · <span className={late ? 'text-rose-600 font-bold' : ''}>{inv.days} {inv.days === 1 ? 'day' : 'days'} pending</span>
                  </p>
                </button>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Open</p>
                  <p className={`text-sm font-bold ${late ? 'text-rose-600' : 'text-slate-700'}`}>{inr(inv.outstanding)}</p>
                </div>
                {picked && (
                  // Own line on phones (indented under the invoice), inline from sm up
                  <div className="basis-full sm:basis-auto pl-7 sm:pl-0 shrink-0">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={choice.picks[inv.invoiceId]}
                      onChange={e => onChange({ ...choice, picks: { ...choice.picks, [inv.invoiceId]: e.target.value } })}
                      className="w-full sm:w-28 bg-white border border-emerald-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 text-right focus:ring-2 ring-emerald-100"
                      aria-label={`Amount against ${inv.invoiceNumber}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && choice.mode && (
        <p className="flex items-center gap-2 text-xs font-bold text-rose-600 ml-1">
          <AlertTriangle size={14} /> {error}
        </p>
      )}

      {preview && (preview.lines.length > 0 || preview.advance > 0) && (
        <div className="rounded-2xl bg-slate-50 p-4 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">This receipt will settle</p>
          {preview.lines.map(line => (
            <div key={line.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="font-bold text-slate-700 truncate">
                {line.label}
                {line.fifo && <span className="ml-2 text-[10px] font-semibold text-slate-400">oldest first</span>}
              </span>
              <span className="font-bold text-emerald-600 shrink-0">
                {inr(line.amount)}
                <span className="ml-2 font-medium text-slate-400">{line.left > 0 ? `${inr(line.left)} still open` : 'cleared'}</span>
              </span>
            </div>
          ))}
          {preview.advance > 0 && (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-bold text-slate-700">Kept as advance</span>
              <span className="font-bold text-profee-blue">{inr(preview.advance)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReceiptSettlementPicker;
