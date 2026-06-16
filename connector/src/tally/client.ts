/**
 * Thin HTTP client for Tally Prime's XML gateway (default http://localhost:9000).
 *
 * MILESTONE B: only `pingTally` (used by the heartbeat to report reachability)
 * and a generic `postXml` are implemented. The request builders and response
 * parsers (List of Ledgers export, Sales voucher import, Ledger master create)
 * arrive in Milestone C.
 */

import axios from "axios";

function baseUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

/**
 * Returns true if the Tally gateway answers. Tally responds to a GET on its
 * port with a small HTML/text body, so any 2xx means it's listening.
 */
export async function pingTally(host: string, port: number): Promise<boolean> {
  try {
    const res = await axios.get(baseUrl(host, port), { timeout: 2500 });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

/** POST a raw Tally XML request envelope and return the response body. */
export async function postXml(host: string, port: number, xml: string): Promise<string> {
  const res = await axios.post(baseUrl(host, port), xml, {
    headers: { "Content-Type": "text/xml;charset=utf-8" },
    timeout: 30_000,
    // Tally returns ISO-8859-1 / windows-1252 in some locales; keep as text.
    responseType: "text",
    transformResponse: [(d) => d],
  });
  return String(res.data);
}
