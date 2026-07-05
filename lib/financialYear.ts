// ── Shared Financial Year helpers (Indian FY: April 1 – March 31) ──
//
// The Overview page lets the user pick a financial year. That choice is
// persisted here so other screens (e.g. the Tax Filing Center) can scope their
// month / quarter pickers to the same FY instead of always showing the last 12
// calendar months.

const FY_STORAGE_KEY = 'billhippo_selected_fy';

/** Returns the FY label for a given date, e.g. "2025-26". */
export function getFYLabel(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-indexed (3 = April)
  const year = month >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(-2)}`;
}

/** FY label → start year number, e.g. "2025-26" → 2025. */
export function fyStartYear(fyLabel: string): number {
  return parseInt(fyLabel.split('-')[0], 10);
}

/** Returns { start, end } date strings (YYYY-MM-DD) for a FY label. */
export function getFYDateRange(fyLabel: string): { start: string; end: string } {
  const startYear = fyStartYear(fyLabel);
  return { start: `${startYear}-04-01`, end: `${startYear + 1}-03-31` };
}

/** All 12 months (YYYY-MM) of a FY, latest first (Mar → Apr). */
export function getFYMonths(fyLabel: string): string[] {
  const startYear = fyStartYear(fyLabel);
  const months: string[] = [];
  for (let m = 4; m <= 12; m++) months.push(`${startYear}-${String(m).padStart(2, '0')}`);
  for (let m = 1; m <= 3; m++) months.push(`${startYear + 1}-${String(m).padStart(2, '0')}`);
  return months.reverse(); // latest month first for the dropdown
}

/**
 * The 4 quarter keys of a FY, latest first (Q4 → Q1). Keys are of the form
 * "<fyStartYear>-Q<n>" to match quarterToDateRange() in GSTReports, where all
 * four quarters of a FY share the FY start year (Q4 = Jan–Mar of the next year).
 */
export function getFYQuarters(fyLabel: string): string[] {
  const startYear = fyStartYear(fyLabel);
  return [`${startYear}-Q4`, `${startYear}-Q3`, `${startYear}-Q2`, `${startYear}-Q1`];
}

/** Generate FY options from 3 years ago to 1 year ahead of the current FY. */
export function generateFYOptions(): string[] {
  const currentStartYear = fyStartYear(getFYLabel());
  const options: string[] = [];
  for (let y = currentStartYear - 3; y <= currentStartYear + 1; y++) {
    options.push(`${y}-${String(y + 1).slice(-2)}`);
  }
  return options;
}

/** The FY selected on the Overview page (falls back to the current FY). */
export function getStoredFY(): string {
  try {
    const stored = localStorage.getItem(FY_STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* localStorage unavailable — fall through to the current FY */
  }
  return getFYLabel();
}

/** Persist the Overview-selected FY so other screens can read it. */
export function setStoredFY(fyLabel: string): void {
  try {
    localStorage.setItem(FY_STORAGE_KEY, fyLabel);
  } catch {
    /* ignore persistence failures */
  }
}
