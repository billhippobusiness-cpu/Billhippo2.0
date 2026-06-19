/**
 * Parsers for Tally XML responses.
 *  - parseLedgers: "List of Ledgers" collection export → TallyLedger[]
 *  - parseImportResult: import (voucher/master) response → success or throw
 */

import { XMLParser } from "fast-xml-parser";
import { cleanText } from "./xml";
import type { TallyLedger } from "../shared/types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: true,
  trimValues: true,
  isArray: (name) => name === "LEDGER" || name === "COMPANY",
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/**
 * Extract text from a value that fast-xml-parser may return as a string OR as an
 * object (when the element carries attributes, the text lands under "#text").
 * Without this, an object stringifies to "[object Object]".
 */
function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return cleanText((o["#text"] ?? o["_"] ?? "") as string | number);
  }
  return cleanText(v);
}

/** Recursively search a parsed object for the first GSTIN-looking value. */
function findGstin(node: unknown): string | undefined {
  if (node == null) return undefined;
  if (typeof node === "object") {
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      const k = key.toUpperCase();
      if (k.includes("GST") && (typeof val === "string" || typeof val === "number")) {
        const s = cleanText(val).toUpperCase().replace(/[^0-9A-Z]/g, "");
        if (/^[0-9]{2}[0-9A-Z]{13}$/.test(s)) return s;
      }
      const nested = findGstin(val);
      if (nested) return nested;
    }
  }
  return undefined;
}

/** Recursively find the first value whose key matches one of `keys`. */
function findByKeys(node: unknown, keys: string[]): string | undefined {
  if (node == null) return undefined;
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (keys.includes(k.toUpperCase()) && (typeof v === "string" || typeof v === "number")) {
        const s = cleanText(v);
        if (s) return s;
      }
    }
    for (const v of Object.values(node as Record<string, unknown>)) {
      const r = findByKeys(v, keys);
      if (r) return r;
    }
  }
  return undefined;
}

/** Recursively collect the first ADDRESS (string or multi-line list). */
function findAddress(node: unknown): string | undefined {
  if (node == null) return undefined;
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.toUpperCase() === "ADDRESS") {
        const joined = Array.isArray(v) ? v.map(textOf).filter(Boolean).join(", ") : textOf(v);
        if (joined) return joined;
      }
    }
    for (const v of Object.values(node as Record<string, unknown>)) {
      const r = findAddress(v);
      if (r) return r;
    }
  }
  return undefined;
}

/** Parse a "List of Companies" export into the open company names. */
export function parseCompanies(xml: string): string[] {
  const obj = parser.parse(xml) as Record<string, any>;
  const collection = obj?.ENVELOPE?.BODY?.DATA?.COLLECTION ?? obj?.ENVELOPE?.BODY?.DATA ?? {};
  const companies = asArray<Record<string, any>>(collection?.COMPANY);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of companies) {
    const name = cleanText(c?.["@_NAME"] ?? c?.NAME);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/** Recursively collect every <LEDGER> object anywhere in the parsed tree, so we
 *  handle both the custom-collection and the masters-export envelope shapes. */
function collectLedgers(node: unknown, acc: Record<string, any>[]): void {
  if (node == null) return;
  if (Array.isArray(node)) { for (const n of node) collectLedgers(n, acc); return; }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.toUpperCase() === "LEDGER") {
        for (const x of asArray(v as any)) if (x && typeof x === "object") acc.push(x);
      } else {
        collectLedgers(v, acc);
      }
    }
  }
}

export function parseLedgers(xml: string): TallyLedger[] {
  const obj = parser.parse(xml) as Record<string, any>;
  const ledgers: Record<string, any>[] = [];
  collectLedgers(obj, ledgers);

  const out: TallyLedger[] = [];
  for (const l of ledgers) {
    const name = textOf(l?.["@_NAME"] ?? l?.NAME);
    if (!name) continue;
    const address = findAddress(l);
    const state = findByKeys(l, ["LEDSTATENAME", "STATENAME", "STATE", "PRIORSTATENAME"]);
    const pincode = findByKeys(l, ["PINCODE"]);
    out.push({
      name,
      parent: textOf(l?.PARENT),
      gstin: findGstin(l),
      ...(address ? { address } : {}),
      ...(state ? { state } : {}),
      ...(pincode ? { pincode } : {}),
    });
  }
  return out;
}

export interface ImportResult {
  created: number;
  altered: number;
  errors: number;
  exceptions: number;
  lastVoucherId?: string;
}

/**
 * Parse an import response. Throws an Error (with Tally's message) when the
 * import reported errors/exceptions or a LINEERROR.
 *
 * `allowNoop` (used for ledger create/alter) tolerates a 0-created/0-altered
 * result, which Tally legitimately returns when a ledger already exists or an
 * "Alter" didn't change any value. For vouchers we keep the strict check so an
 * empty body is treated as a soft failure and retried.
 */
export function parseImportResult(xml: string, allowNoop = false): ImportResult {
  const obj = parser.parse(xml) as Record<string, any>;
  const env = obj?.ENVELOPE ?? {};
  const body = env?.BODY ?? {};
  const result = body?.DATA?.IMPORTRESULT ?? body?.IMPORTRESULT ?? {};

  // A LINEERROR can appear at several levels; surface it verbatim.
  const lineError =
    result?.LINEERROR ?? body?.DATA?.LINEERROR ?? env?.HEADER?.LINEERROR ?? body?.LINEERROR;
  const num = (v: unknown) => (v === undefined || v === null ? 0 : Number(v) || 0);

  const res: ImportResult = {
    created: num(result?.CREATED),
    altered: num(result?.ALTERED),
    errors: num(result?.ERRORS),
    exceptions: num(result?.EXCEPTIONS),
    lastVoucherId: result?.LASTVCHID ? String(result.LASTVCHID) : undefined,
  };

  if (lineError) {
    throw new Error(`Tally rejected the request: ${cleanText(lineError)}`);
  }
  if (res.errors > 0 || res.exceptions > 0) {
    throw new Error(
      `Tally import had ${res.errors} error(s) and ${res.exceptions} exception(s). ` +
        `Check that all ledgers exist and Debit=Credit.`,
    );
  }
  if (!allowNoop && res.created === 0 && res.altered === 0) {
    // Some Tally builds return an empty/again-structured body; treat a totally
    // empty result as a soft failure so the job retries rather than silently
    // reporting success.
    throw new Error("Tally returned no confirmation (nothing created or altered). Is the correct company open?");
  }
  return res;
}
