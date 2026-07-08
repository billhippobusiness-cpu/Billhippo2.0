// ── GST Scheme helpers (Regular vs Composition) ─────────────────────────────
//
// Single source of truth for deriving which GST scheme applies to a document.
// The profile carries an append-only `schemeHistory`; a document's treatment is
// decided by its own date (or its stored `scheme` snapshot), never by the
// profile's *current* scheme — so a mid-year switch leaves history intact.
//
// Pure functions only — no Firebase imports, so PDFs and Excel exports can use
// them freely.

import { BusinessProfile, CompositionCategory, GSTScheme, SchemePeriod } from '../types';

/** GST came into force on 1 July 2017 — baseline for synthesized histories. */
export const GST_EPOCH = '2017-07-01';

/** Mandatory Bill of Supply declaration — Rule 5(1)(f) + Rule 49, CGST Rules. */
export const COMPOSITION_DECLARATION =
  'Composition taxable person, not eligible to collect tax on supplies';

export interface CompositionCategoryInfo {
  label: string;
  shortLabel: string;
  ratePct: number;   // total rate on turnover
  cgstPct: number;
  sgstPct: number;
}

export const COMPOSITION_CATEGORIES: Record<CompositionCategory, CompositionCategoryInfo> = {
  trader:       { label: 'Trader — 1% of taxable turnover',            shortLabel: 'Trader (1%)',           ratePct: 1, cgstPct: 0.5, sgstPct: 0.5 },
  manufacturer: { label: 'Manufacturer — 1% of turnover',              shortLabel: 'Manufacturer (1%)',     ratePct: 1, cgstPct: 0.5, sgstPct: 0.5 },
  restaurant:   { label: 'Restaurant / Catering — 5% of turnover',     shortLabel: 'Restaurant (5%)',       ratePct: 5, cgstPct: 2.5, sgstPct: 2.5 },
  service:      { label: 'Service Provider u/s 10(2A) — 6% of turnover', shortLabel: 'Services (6%)',       ratePct: 6, cgstPct: 3,   sgstPct: 3 },
};

export const DEFAULT_COMPOSITION_CATEGORY: CompositionCategory = 'trader';

/**
 * Normalized scheme history for a profile, ascending by effectiveFrom.
 * Legacy profiles (no stored history) get a synthesized single-entry history:
 * regular since the GST epoch. Callers must gate on `gstEnabled` themselves
 * where "not registered at all" matters.
 */
export function getSchemeHistory(profile: BusinessProfile | null | undefined): SchemePeriod[] {
  const stored = profile?.schemeHistory;
  if (!stored || stored.length === 0) {
    return [{ scheme: 'regular', effectiveFrom: GST_EPOCH }];
  }
  return [...stored].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/**
 * The scheme in force on a given date (YYYY-MM-DD): the latest history entry
 * whose effectiveFrom <= date. Dates before the first entry clamp to the first
 * entry, so onboarding only ever needs to write one entry.
 */
export function getSchemeOnDate(
  profile: BusinessProfile | null | undefined,
  date: string
): { scheme: GSTScheme; category?: CompositionCategory } {
  const history = getSchemeHistory(profile);
  let active = history[0];
  for (const entry of history) {
    if (entry.effectiveFrom <= date) active = entry;
    else break;
  }
  return {
    scheme: active.scheme,
    category: active.scheme === 'composition'
      ? (active.compositionCategory ?? DEFAULT_COMPOSITION_CATEGORY)
      : undefined,
  };
}

/** True when the business is GST-registered AND under composition on `date`. */
export function isCompositionOnDate(
  profile: BusinessProfile | null | undefined,
  date: string
): boolean {
  if (!profile?.gstEnabled) return false;
  return getSchemeOnDate(profile, date).scheme === 'composition';
}

/**
 * The scheme a saved document belongs to: its stored snapshot when present
 * (immune to later history edits), otherwise derived from its date.
 */
export function docScheme(
  doc: { scheme?: GSTScheme; date: string },
  profile: BusinessProfile | null | undefined
): GSTScheme {
  if (doc.scheme) return doc.scheme;
  if (!profile?.gstEnabled) return 'regular';
  return getSchemeOnDate(profile, doc.date).scheme;
}

export interface SchemeRange {
  scheme: GSTScheme;
  category?: CompositionCategory;
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD inclusive
}

/**
 * Splits [start, end] into contiguous sub-ranges at scheme-switch dates.
 * Used by reports to scope GSTR-1/3B vs CMP-08/GSTR-4 around a mid-period
 * switch. Returns a single range when no switch falls inside the period.
 */
export function schemeRangesInPeriod(
  profile: BusinessProfile | null | undefined,
  start: string,
  end: string
): SchemeRange[] {
  if (start > end) return [];
  const history = getSchemeHistory(profile);
  const ranges: SchemeRange[] = [];
  let cursor = start;
  let current = getSchemeOnDate(profile, start);

  for (const entry of history) {
    if (entry.effectiveFrom <= cursor || entry.effectiveFrom > end) continue;
    // Close the running range the day before this switch takes effect.
    ranges.push({ scheme: current.scheme, category: current.category, start: cursor, end: prevDay(entry.effectiveFrom) });
    cursor = entry.effectiveFrom;
    current = {
      scheme: entry.scheme,
      category: entry.scheme === 'composition'
        ? (entry.compositionCategory ?? DEFAULT_COMPOSITION_CATEGORY)
        : undefined,
    };
  }
  ranges.push({ scheme: current.scheme, category: current.category, start: cursor, end });
  return ranges;
}

/** Overall character of a period: one scheme throughout, or mixed. */
export function periodSchemeKind(
  profile: BusinessProfile | null | undefined,
  start: string,
  end: string
): 'regular' | 'composition' | 'mixed' | 'none' {
  if (!profile?.gstEnabled) return 'none';
  const ranges = schemeRangesInPeriod(profile, start, end);
  if (ranges.length === 0) return 'none';
  const schemes = new Set(ranges.map(r => r.scheme));
  if (schemes.size > 1) return 'mixed';
  return ranges[0].scheme;
}

/**
 * Validates and appends a scheme change, returning the new history array.
 * Rules: effectiveFrom strictly after the last entry's, and the scheme must
 * actually change. Throws Error with a user-presentable message otherwise.
 * Legacy profiles get the synthesized baseline persisted alongside the new
 * entry so the stored array is self-contained thereafter.
 */
export function appendSchemeChange(
  profile: BusinessProfile,
  entry: SchemePeriod
): SchemePeriod[] {
  const history = getSchemeHistory(profile);
  const last = history[history.length - 1];
  if (entry.effectiveFrom <= last.effectiveFrom) {
    throw new Error(
      `Effective date must be after the last scheme change (${last.effectiveFrom}).`
    );
  }
  if (entry.scheme === last.scheme) {
    throw new Error(`The business is already on the ${entry.scheme} scheme.`);
  }
  if (entry.scheme === 'composition' && !entry.compositionCategory) {
    throw new Error('Select a composition category.');
  }
  return [...history, entry];
}

/** Day before a YYYY-MM-DD date, as YYYY-MM-DD. */
export function prevDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/** dd-mm-yyyy display form of a YYYY-MM-DD date. */
export function displayDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}-${m}-${y}`;
}
