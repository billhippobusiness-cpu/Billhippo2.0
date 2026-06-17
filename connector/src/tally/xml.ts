/**
 * Low-level XML helpers shared by the Tally request builders and parsers.
 */

/** Escape a value for safe inclusion in XML text/attributes. */
export function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** "2026-06-16" (or a Date) -> "20260616" as Tally expects. */
export function formatTallyDate(date: string): string {
  const d = String(date || "").slice(0, 10).replace(/-/g, "");
  return /^\d{8}$/.test(d) ? d : new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

/** Format a money amount with 2 decimals (no thousands separators). */
export function formatAmount(n: number): string {
  return (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
}

/** Strip ASCII control characters Tally sometimes emits inside names. */
export function cleanText(s: unknown): string {
  let out = "";
  const str = String(s ?? "");
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c > 31 && c !== 127) out += str[i];
  }
  return out.trim();
}

/**
 * Deterministic, Firestore-safe document id derived from a ledger name, so
 * re-syncing the same ledger upserts the same doc (no duplicates). djb2 hash.
 */
export function ledgerDocId(name: string): string {
  const norm = cleanText(name).toLowerCase();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  }
  return `led_${h.toString(16)}`;
}
