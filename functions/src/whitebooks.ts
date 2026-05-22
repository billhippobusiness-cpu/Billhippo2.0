import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore } from "firebase-admin/firestore";

const WB_BASE = "https://api.whitebooks.in";

const wbClientId     = defineSecret("WHITEBOOKS_CLIENT_ID");
const wbClientSecret = defineSecret("WHITEBOOKS_CLIENT_SECRET");
const wbEmail        = defineSecret("WHITEBOOKS_EMAIL");

// Base headers — only client_id and client_secret (per Postman collection)
function baseHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "Accept":        "application/json",
    "client_id":     wbClientId.value(),
    "client_secret": wbClientSecret.value(),
    ...(extra ?? {}),
  };
}

// ─── 1. GSTIN Lookup — GET /public/search?email=&gstin= ──────────────────────
// Per Postman: email is query param (first), gstin query param. Headers: client_id, client_secret only.
export const wbLookupGSTIN = onCall(
  { secrets: [wbClientId, wbClientSecret, wbEmail], region: "asia-south1" },
  async (request) => {
    const { gstin } = request.data as { gstin: string };
    if (!gstin || gstin.length !== 15) {
      throw new HttpsError("invalid-argument", "GSTIN must be 15 characters");
    }

    const email = wbEmail.value();
    const g     = gstin.toUpperCase();
    const url   = `${WB_BASE}/public/search?email=${encodeURIComponent(email)}&gstin=${encodeURIComponent(g)}`;

    const res  = await fetch(url, { method: "GET", headers: baseHeaders() });
    const body = await res.text();

    if (!res.ok) {
      throw new HttpsError("not-found", `GSTIN lookup HTTP error ${res.status}: ${body.substring(0, 300)}`);
    }

    if (!body || body.trim() === "" || body.trim() === "null" || body.trim() === "{}") {
      throw new HttpsError("not-found", `GSTIN ${g} not found in GSTN database`);
    }

    const raw = JSON.parse(body);

    if (raw?.status_cd === "0") {
      throw new HttpsError("not-found", `GSTIN lookup failed: ${raw?.error?.message ?? body}`);
    }

    const d = raw.data ?? raw;
    return {
      gstin:                  g,
      legalName:              d.lgnm     ?? d.legal_name  ?? d.legalName  ?? "",
      tradeName:              d.tradeNam ?? d.trade_name  ?? d.tradeName  ?? "",
      address:                d.pradr?.addr?.bnm
                                ? [d.pradr.addr.bnm, d.pradr.addr.st, d.pradr.addr.loc].filter(Boolean).join(", ")
                                : (d.address ?? ""),
      city:                   d.pradr?.addr?.dst  ?? d.city    ?? "",
      // State always derived from GSTIN first 2 digits — most reliable source
      state:                  stateCodeToName(g.substring(0, 2)),
      pincode:                d.pradr?.addr?.pncd ?? d.pincode ?? "",
      stateCode:              g.substring(0, 2),
      registrationDate:       d.rgdt  ?? d.registration_date ?? "",
      taxpayerType:           d.dty   ?? d.taxpayer_type     ?? "",
      status:                 d.sts   ?? d.status            ?? "",
      constitutionOfBusiness: d.ctb   ?? d.constitution_of_business ?? "",
      filingStatus:           d.filingstatus ?? "",
    };
  }
);

// ─── 2. Initiate GST Portal Session — GET /authentication/otprequest?email= ───
// Per Postman: email query param. Headers: gst_username, state_cd, ip_address, client_id, client_secret
export const wbInitSession = onCall(
  { secrets: [wbClientId, wbClientSecret, wbEmail], region: "asia-south1" },
  async (request) => {
    const { gstin, gstUsername } = request.data as { gstin: string; gstUsername: string };
    if (!gstin || !gstUsername) {
      throw new HttpsError("invalid-argument", "GSTIN and GST username are required");
    }

    const email     = wbEmail.value();
    const stateCode = gstin.substring(0, 2);
    const url       = `${WB_BASE}/authentication/otprequest?email=${encodeURIComponent(email)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: baseHeaders({
        "gst_username": gstUsername,
        "state_cd":     stateCode,
        "ip_address":   "1.1.1.1",
      }),
    });

    const raw = await res.json().catch(() => ({}));
    if (!res.ok || raw?.status_cd === "0") {
      throw new HttpsError("unavailable", `OTP request failed: ${JSON.stringify(raw)}`);
    }

    const d = raw?.data ?? {};
    const txn =
      d.txn ?? d.auth_token ?? d.authToken ?? d.AuthToken ??
      d.app_key ?? d.appKey ?? d.AppKey ?? d.appkey ??
      raw.header?.txn ??
      raw.txn ?? raw.auth_token ?? raw.authToken ?? raw.AuthToken ??
      raw.app_key ?? raw.appKey ?? raw.AppKey ?? raw.appkey ?? "";

    if (!txn) {
      throw new HttpsError(
        "unavailable",
        `OTP sent, but no transaction ID returned. Full response: ${JSON.stringify(raw)}`
      );
    }

    return { txn, message: "OTP sent to GST-registered mobile/email" };
  }
);

// ─── 3. Verify OTP → store txn for subsequent calls ──────────────────────────
// Per Postman: email + otp in query params. txn in header. Returns AuthToken stored as txn.
export const wbVerifyOTP = onCall(
  { secrets: [wbClientId, wbClientSecret, wbEmail], region: "asia-south1" },
  async (request) => {
    const { gstin, gstUsername, txn, otp, userId } = request.data as {
      gstin: string; gstUsername: string; txn: string; otp: string; userId: string;
    };

    const email     = wbEmail.value();
    const stateCode = gstin.substring(0, 2);
    const url       = `${WB_BASE}/authentication/authtoken?email=${encodeURIComponent(email)}&otp=${encodeURIComponent(otp)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: baseHeaders({
        "gst_username": gstUsername,
        "state_cd":     stateCode,
        "ip_address":   "1.1.1.1",
        "txn":          txn,
      }),
    });

    const raw = await res.json().catch(() => ({}));
    if (!res.ok || raw?.status_cd === "0") {
      throw new HttpsError("unauthenticated", `OTP verification failed: ${JSON.stringify(raw)}`);
    }

    // WhiteBooks GSP: on successful verify the API returns status_cd "1" and
    // echoes the txn in raw.header.txn. The verified txn IS the AuthToken for
    // subsequent API calls — there is no separate AuthToken field.
    const authToken =
      raw?.data?.AuthToken ?? raw?.data?.authToken ?? raw?.data?.auth_token ??
      raw?.data?.txn ?? raw?.AuthToken ?? raw?.header?.txn ?? raw?.txn ?? txn;
    if (!authToken) {
      throw new HttpsError("unavailable", `Auth token missing: ${JSON.stringify(raw)}`);
    }

    const expiresAt = Date.now() + 6 * 60 * 60 * 1000;

    if (userId) {
      await getFirestore()
        .collection("users").doc(userId)
        .collection("gstSessions").doc(gstin.toUpperCase())
        .set({ authToken, txn, expiresAt, gstin: gstin.toUpperCase(), gstUsername, updatedAt: new Date() }, { merge: true });
    }

    return { authToken, expiresAt };
  }
);

// ─── 4. Fetch GSTR-2B — GET /gstr2b/all ──────────────────────────────────────
// Per Postman: gstin, rtnprd, filenum, email in query. txn (AuthToken) in header.
export const wbFetchGSTR2B = onCall(
  { secrets: [wbClientId, wbClientSecret, wbEmail], region: "asia-south1" },
  async (request) => {
    const { gstin, period, authToken, gstUsername } = request.data as {
      gstin: string; period: string; authToken: string; gstUsername: string;
    };

    const email     = wbEmail.value();
    const stateCode = gstin.substring(0, 2);
    const g         = gstin.toUpperCase();
    const url       = `${WB_BASE}/gstr2b/all?gstin=${g}&rtnprd=${period}&filenum=1&email=${encodeURIComponent(email)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: baseHeaders({
        "gst_username": gstUsername,
        "state_cd":     stateCode,
        "ip_address":   "1.1.1.1",
        "txn":          authToken,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new HttpsError("unavailable", `GSTR-2B fetch failed (${res.status}): ${txt.substring(0, 300)}`);
    }

    const raw = await res.json();
    if (raw?.status_cd === "0") {
      throw new HttpsError("unavailable", `GSTR-2B error: ${raw?.error?.message ?? JSON.stringify(raw)}`);
    }
    const result = normalizeGSTR2B(gstin, period, raw);
    // If nothing found, surface the top-level keys so the client can see the raw shape
    if (result.invoiceCount === 0) {
      const topKeys = JSON.stringify(Object.keys(raw?.data ?? raw ?? {}));
      console.info(`GSTR-2B: 0 invoices. Top keys: ${topKeys}. status_cd=${raw?.status_cd}`);
    }
    return result;
  }
);

// ─── 5. Fetch GSTR-3B — GET /gstr3b/retsum ───────────────────────────────────
// Per Postman: gstin, retperiod, email in query. txn in header.
export const wbFetchGSTR3B = onCall(
  { secrets: [wbClientId, wbClientSecret, wbEmail], region: "asia-south1" },
  async (request) => {
    const { gstin, period, authToken, gstUsername } = request.data as {
      gstin: string; period: string; authToken: string; gstUsername: string;
    };

    const email     = wbEmail.value();
    const stateCode = gstin.substring(0, 2);
    const g         = gstin.toUpperCase();
    const url       = `${WB_BASE}/gstr3b/retsum?gstin=${g}&retperiod=${period}&email=${encodeURIComponent(email)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: baseHeaders({
        "gst_username": gstUsername,
        "state_cd":     stateCode,
        "ip_address":   "1.1.1.1",
        "txn":          authToken,
      }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new HttpsError("unavailable", `GSTR-3B fetch failed (${res.status}): ${txt.substring(0, 300)}`);
    }

    const raw = await res.json();
    if (raw?.status_cd === "0") {
      throw new HttpsError("unavailable", `GSTR-3B error: ${raw?.error?.message ?? JSON.stringify(raw)}`);
    }
    return normalizeGSTR3B(gstin, period, raw);
  }
);

// ─── 6. Fetch GSTR-1 — GET /gstr1/retsum + /gstr1/b2b + /gstr1/b2cs + /gstr1/cdnr ──
export const wbFetchGSTR1 = onCall(
  { secrets: [wbClientId, wbClientSecret, wbEmail], region: "asia-south1" },
  async (request) => {
    const { gstin, period, authToken, gstUsername } = request.data as {
      gstin: string; period: string; authToken: string; gstUsername: string;
    };
    const email     = wbEmail.value();
    const stateCode = gstin.substring(0, 2);
    const g         = gstin.toUpperCase();

    const hdrs = baseHeaders({
      "gst_username": gstUsername,
      "state_cd":     stateCode,
      "ip_address":   "1.1.1.1",
      "txn":          authToken,
    });

    const fetchSection = async (path: string): Promise<any> => {
      try {
        const res = await fetch(`${WB_BASE}${path}`, { method: "GET", headers: hdrs });
        if (!res.ok) { console.warn(`GSTR-1 ${path} HTTP ${res.status}`); return null; }
        const raw = await res.json();
        if (raw?.status_cd === "0") { console.warn(`GSTR-1 ${path} API error: ${raw?.error?.message ?? raw?.status_cd}`); return null; }
        return raw;
      } catch (e) {
        console.warn(`GSTR-1 ${path} exception: ${e}`);
        return null;
      }
    };

    // Parallel fetch: summary + three invoice sections
    const [rsRaw, b2bRaw, b2csRaw, cdnrRaw] = await Promise.all([
      fetchSection(`/gstr1/retsum?gstin=${g}&retperiod=${period}&email=${encodeURIComponent(email)}`),
      fetchSection(`/gstr1/b2b?gstin=${g}&retperiod=${period}&email=${encodeURIComponent(email)}&actionrequired=R`),
      fetchSection(`/gstr1/b2cs?gstin=${g}&retperiod=${period}&email=${encodeURIComponent(email)}`),
      fetchSection(`/gstr1/cdnr?gstin=${g}&retperiod=${period}&email=${encodeURIComponent(email)}&actionrequired=R`),
    ]);

    if (!rsRaw && !b2bRaw && !b2csRaw && !cdnrRaw) {
      throw new HttpsError("unavailable", "GSTR-1: All section fetches failed. Please check your GST portal session.");
    }

    if (rsRaw) console.info(`GSTR-1 retsum (first 1500): ${JSON.stringify(rsRaw).substring(0, 1500)}`);
    if (b2bRaw) console.info(`GSTR-1 b2b (first 1500): ${JSON.stringify(b2bRaw).substring(0, 1500)}`);

    const result = normalizeGSTR1Full(gstin, period, rsRaw, b2bRaw, b2csRaw, cdnrRaw);
    console.info(`GSTR-1 result: b2b=${result.b2bInvoices.length} b2cs=${result.b2csEntries.length} cdnr=${result.cdnrNotes.length} txval=${result.totalTaxableValue}`);
    return result;
  }
);

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeGSTR2B(gstin: string, period: string, raw: any) {
  const d = raw.data?.data ?? raw.data ?? raw;
  const suppliers: any[] = [];
  let totalTaxable = 0, totalIGST = 0, totalCGST = 0, totalSGST = 0, invoiceCount = 0;

  const buyerState = gstin.substring(0, 2);
  const b2bList: any[] =
    d?.docdata?.b2b ?? d?.data?.docdata?.b2b ??
    d?.b2b ?? d?.data?.b2b ?? [];

  // Log first invoice structure for debugging
  if (b2bList.length > 0 && b2bList[0].inv?.length > 0) {
    const firstInv = b2bList[0].inv[0];
    const firstItm = firstInv.itms?.[0] ?? firstInv.items?.[0];
    console.info(`GSTR-2B first invoice keys: ${JSON.stringify(Object.keys(firstInv))}`);
    console.info(`GSTR-2B first invoice sample: inum=${firstInv.inum} idt=${firstInv.idt} inv_dt=${firstInv.inv_dt} dt=${firstInv.dt} val=${firstInv.val} txval=${firstInv.txval} iamt=${firstInv.iamt} camt=${firstInv.camt} samt=${firstInv.samt} rt=${firstInv.rt}`);
    if (firstItm) {
      const det = firstItm.itm_det ?? firstItm;
      console.info(`GSTR-2B first itm_det keys: ${JSON.stringify(Object.keys(firstItm))} | det keys: ${JSON.stringify(Object.keys(det))}`);
      console.info(`GSTR-2B first itm_det: txval=${det.txval} rt=${det.rt} iamt=${det.iamt} camt=${det.camt} samt=${det.samt} igst=${det.igst} cgst=${det.cgst} sgst=${det.sgst}`);
    }
  }

  for (const supplier of b2bList) {
    const supplierState = (supplier.ctin ?? "").substring(0, 2);
    const isInterState = supplierState !== "" && buyerState !== "" && supplierState !== buyerState;

    const invoices = (supplier.inv ?? supplier.invoices ?? []).map((inv: any) => {
      const items = inv.itms ?? inv.items ?? [];

      // Step 1: collect from itm_det line items
      let taxable = 0, igst = 0, cgst = 0, sgst = 0, gstRate = 0;
      for (const itm of items) {
        const detail = itm.itm_det ?? itm;
        taxable += Number(detail.txval ?? 0);
        igst    += Number(detail.iamt ?? detail.igst ?? 0);
        cgst    += Number(detail.camt ?? detail.cgst ?? 0);
        sgst    += Number(detail.samt ?? detail.sgst ?? 0);
        if (!gstRate) gstRate = Number(detail.rt ?? detail.rate ?? 0);
      }

      // Step 2: invoice-level amounts fallback when itm_det is empty
      const invTxval = Number(inv.txval ?? 0);
      const invVal   = Number(inv.val   ?? 0);
      if (taxable === 0 && igst === 0 && cgst === 0 && sgst === 0) {
        taxable = invTxval > 0 ? invTxval : invVal;
        igst    = Number(inv.iamt ?? inv.igst ?? 0);
        cgst    = Number(inv.camt ?? inv.cgst ?? 0);
        sgst    = Number(inv.samt ?? inv.sgst ?? 0);
        if (!gstRate) gstRate = Number(inv.rt ?? inv.rate ?? 0);
      }

      // Step 3: rate-based fallback (when GST rate field IS present but tax amounts are 0)
      if (taxable > 0 && igst === 0 && cgst === 0 && sgst === 0 && gstRate > 0) {
        if (isInterState) {
          igst = Math.round(taxable * gstRate) / 100;
        } else {
          cgst = Math.round(taxable * gstRate / 2) / 100;
          sgst = Math.round(taxable * gstRate / 2) / 100;
        }
      }

      // Step 4: val-minus-txval fallback (derive tax when txval and val are both present)
      // invTxval = taxable, invVal = total invoice value including tax
      if (taxable > 0 && igst === 0 && cgst === 0 && sgst === 0 && invTxval > 0 && invVal > invTxval + 0.01) {
        const derivedTax = invVal - invTxval;
        if (isInterState) {
          igst = Math.round(derivedTax * 100) / 100;
        } else {
          cgst = Math.round(derivedTax / 2 * 100) / 100;
          sgst = Math.round(derivedTax / 2 * 100) / 100;
        }
        if (!gstRate) {
          const rawRate = derivedTax / invTxval * 100;
          gstRate = ([5, 12, 18, 28] as number[]).reduce((a, b) => Math.abs(b - rawRate) < Math.abs(a - rawRate) ? b : a);
        }
      }

      // Step 5: derive rate from tax amounts (when API doesn't return rt field)
      if (!gstRate && taxable > 0 && (igst + cgst + sgst) > 0) {
        const totalTax = igst + cgst + sgst;
        const rawRate = totalTax / taxable * 100;
        gstRate = ([5, 12, 18, 28] as number[]).reduce((a, b) => Math.abs(b - rawRate) < Math.abs(a - rawRate) ? b : a);
      }

      const itcRaw = inv.itcavl ?? "";
      const itcAvailability = itcRaw === "Y" ? "Yes" : itcRaw === "N" ? "No" : (itcRaw || "Yes");

      return {
        invoiceNumber:  inv.inum ?? inv.invoice_number ?? "",
        invoiceDate:    inv.idt  ?? inv.inv_dt ?? inv.dt ?? inv.date ?? inv.invoice_date ?? "",
        invoiceType:    inv.typ  ?? inv.inv_typ ?? "B2B",
        placeOfSupply:  inv.pos  ?? "",
        reverseCharge:  inv.rchrg === "Y",
        taxableValue:   taxable,
        igst, cgst, sgst, cess: 0,
        itcAvailability,
        gstRate,
      };
    });
    const sTotal = invoices.reduce(
      (acc: any, i: any) => ({ taxable: acc.taxable + i.taxableValue, igst: acc.igst + i.igst, cgst: acc.cgst + i.cgst, sgst: acc.sgst + i.sgst }),
      { taxable: 0, igst: 0, cgst: 0, sgst: 0 }
    );
    suppliers.push({
      gstin: supplier.ctin ?? supplier.gstin ?? "", tradeName: supplier.trdnm ?? supplier.trade_name ?? "",
      legalName: supplier.lgnm ?? supplier.legal_name ?? "", invoices,
      totalTaxable: sTotal.taxable, totalIGST: sTotal.igst, totalCGST: sTotal.cgst, totalSGST: sTotal.sgst,
    });
    totalTaxable += sTotal.taxable; totalIGST += sTotal.igst; totalCGST += sTotal.cgst;
    totalSGST += sTotal.sgst; invoiceCount += invoices.length;
  }
  return { gstin, period, suppliers, totalTaxableValue: totalTaxable, totalIGST, totalCGST, totalSGST, invoiceCount, generationDate: d.gendt ?? "" };
}

function normalizeGSTR3B(gstin: string, period: string, raw: any) {
  const d = raw.data ?? raw;
  const sup  = d.sup_details ?? d.supDetails ?? {};
  const itc  = d.itc_elg     ?? d.itcElg     ?? {};
  const intr = d.intr_ltfee  ?? d.intrLtfee  ?? {};
  const igst = sup?.osup_det?.iamt  ?? 0;
  const cgst = sup?.osup_det?.camt  ?? 0;
  const sgst = sup?.osup_det?.samt  ?? 0;
  return {
    gstin, period,
    filedDate:      d.filed_date ?? d.filedDate ?? "",
    outwardTaxable: sup?.osup_det?.txval ?? 0,
    outwardTax:     igst + cgst + sgst,
    outwardIGST:    igst,
    outwardCGST:    cgst,
    outwardSGST:    sgst,
    itcIGST:        itc?.itc_avl?.find((x: any) => x.ty === "IMPG")?.iamt ?? 0,
    itcCGST:        itc?.itc_avl?.reduce((s: number, x: any) => s + (x.camt ?? 0), 0) ?? 0,
    itcSGST:        itc?.itc_avl?.reduce((s: number, x: any) => s + (x.samt ?? 0), 0) ?? 0,
    netTaxPayable:  intr?.intr_details?.iamt ?? 0,
  };
}

function normalizeGSTR1Full(gstin: string, period: string, rsRaw: any, b2bRaw: any, b2csRaw: any, cdnrRaw: any) {
  // Filed date from retsum
  const rsD = rsRaw?.data?.data ?? rsRaw?.data ?? rsRaw ?? {};
  const filedDate = rsD.filed_date ?? rsD.filedDate ?? rsD.filing_dt ?? rsD.dt ?? "";

  // ── B2B Invoices ──────────────────────────────────────────────────────────────
  const b2bInvoices: any[] = [];
  if (b2bRaw) {
    const d = b2bRaw?.data?.data ?? b2bRaw?.data ?? b2bRaw;
    for (const supplier of (d?.b2b ?? [])) {
      for (const inv of (supplier.inv ?? [])) {
        let taxable = 0, igst = 0, cgst = 0, sgst = 0, gstRate = 0;
        for (const itm of (inv.itms ?? [])) {
          const dt = itm.itm_det ?? itm;
          taxable += Number(dt.txval ?? 0);
          igst    += Number(dt.iamt  ?? 0);
          cgst    += Number(dt.camt  ?? 0);
          sgst    += Number(dt.samt  ?? 0);
          if (!gstRate) gstRate = Number(dt.rt ?? 0);
        }
        if (taxable === 0 && igst === 0 && cgst === 0 && sgst === 0) {
          taxable = Number(inv.txval ?? 0);
          igst    = Number(inv.iamt  ?? 0);
          cgst    = Number(inv.camt  ?? 0);
          sgst    = Number(inv.samt  ?? 0);
        }
        b2bInvoices.push({
          supplierGSTIN:  supplier.ctin ?? "",
          supplierName:   supplier.trdnm ?? supplier.lgnm ?? "",
          invoiceNumber:  inv.inum ?? "",
          invoiceDate:    inv.idt ?? inv.inv_dt ?? "",
          invoiceValue:   Number(inv.val ?? (taxable + igst + cgst + sgst)),
          placeOfSupply:  inv.pos ?? "",
          reverseCharge:  (inv.rchrg ?? "N") === "Y",
          taxableValue:   taxable,
          igst, cgst, sgst, gstRate,
        });
      }
    }
  }

  // ── B2CS Entries ─────────────────────────────────────────────────────────────
  const b2csEntries: any[] = [];
  if (b2csRaw) {
    const d = b2csRaw?.data?.data ?? b2csRaw?.data ?? b2csRaw;
    for (const entry of (d?.b2cs ?? [])) {
      b2csEntries.push({
        supplyType:    entry.sply_ty ?? "INTRA",
        placeOfSupply: entry.pos ?? "",
        gstRate:       Number(entry.rt ?? 0),
        taxableValue:  Number(entry.txval ?? 0),
        igst:          Number(entry.iamt ?? 0),
        cgst:          Number(entry.camt ?? 0),
        sgst:          Number(entry.samt ?? 0),
      });
    }
  }

  // ── CDNR Notes ────────────────────────────────────────────────────────────────
  const cdnrNotes: any[] = [];
  if (cdnrRaw) {
    const d = cdnrRaw?.data?.data ?? cdnrRaw?.data ?? cdnrRaw;
    for (const receiver of (d?.cdnr ?? [])) {
      for (const nt of (receiver.nt ?? [])) {
        let taxable = 0, igst = 0, cgst = 0, sgst = 0;
        for (const itm of (nt.itms ?? [])) {
          const dt = itm.itm_det ?? itm;
          taxable += Number(dt.txval ?? 0);
          igst    += Number(dt.iamt  ?? 0);
          cgst    += Number(dt.camt  ?? 0);
          sgst    += Number(dt.samt  ?? 0);
        }
        cdnrNotes.push({
          receiverGSTIN: receiver.ctin ?? "",
          receiverName:  receiver.trdnm ?? receiver.lgnm ?? "",
          noteType:      nt.ntty ?? "C",
          noteNumber:    nt.nt_num ?? "",
          noteDate:      nt.nt_dt ?? "",
          noteValue:     Number(nt.val ?? 0),
          taxableValue:  taxable,
          igst, cgst, sgst,
        });
      }
    }
  }

  // ── Section totals: prefer retsum B2B section, fallback to invoice data ──────
  let totalTaxable = 0, totalIGST = 0, totalCGST = 0, totalSGST = 0;
  const secSum: any[] = rsD.sec_sum ?? rsD.secSum ?? [];
  if (secSum.length > 0) {
    console.info(`GSTR-1 sec_sum: ${JSON.stringify(secSum.map((s: any) => ({ nm: s.sec_nm, txval: s.txval })))}`);
    let b2bSec = secSum.find((s: any) => (s.sec_nm ?? "").toUpperCase() === "B2B");
    if (!b2bSec) b2bSec = secSum.find((s: any) => (s.sec_nm ?? "").toUpperCase().startsWith("B2B"));
    if (b2bSec) {
      totalTaxable = Number(b2bSec.txval ?? 0);
      totalIGST    = Number(b2bSec.iamt  ?? 0);
      totalCGST    = Number(b2bSec.camt  ?? 0);
      totalSGST    = Number(b2bSec.samt  ?? 0);
    } else {
      for (const s of secSum) {
        totalTaxable += Number(s.txval ?? 0);
        totalIGST    += Number(s.iamt  ?? 0);
        totalCGST    += Number(s.camt  ?? 0);
        totalSGST    += Number(s.samt  ?? 0);
      }
    }
  }
  // Derive totals from B2B invoice data when retsum gave zeros
  if (totalTaxable === 0 && b2bInvoices.length > 0) {
    totalTaxable = b2bInvoices.reduce((s: number, i: any) => s + i.taxableValue, 0);
    totalIGST    = b2bInvoices.reduce((s: number, i: any) => s + i.igst, 0);
    totalCGST    = b2bInvoices.reduce((s: number, i: any) => s + i.cgst, 0);
    totalSGST    = b2bInvoices.reduce((s: number, i: any) => s + i.sgst, 0);
  }

  return {
    gstin, period, filedDate,
    b2bInvoices, b2csEntries, cdnrNotes,
    totalTaxableValue: totalTaxable,
    totalIGST, totalCGST, totalSGST,
  };
}

// ─── State code → State name ──────────────────────────────────────────────────
function stateCodeToName(code: string): string {
  const map: Record<string, string> = {
    "01": "Jammu and Kashmir",  "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh",         "05": "Uttarakhand",      "06": "Haryana",
    "07": "Delhi",              "08": "Rajasthan",        "09": "Uttar Pradesh",
    "10": "Bihar",              "11": "Sikkim",           "12": "Arunachal Pradesh",
    "13": "Nagaland",           "14": "Manipur",          "15": "Mizoram",
    "16": "Tripura",            "17": "Meghalaya",        "18": "Assam",
    "19": "West Bengal",        "20": "Jharkhand",        "21": "Odisha",
    "22": "Chhattisgarh",       "23": "Madhya Pradesh",   "24": "Gujarat",
    "26": "Dadra and Nagar Haveli and Daman and Diu",      "27": "Maharashtra",
    "28": "Andhra Pradesh",     "29": "Karnataka",        "30": "Goa",
    "31": "Lakshadweep",        "32": "Kerala",           "33": "Tamil Nadu",
    "34": "Puducherry",         "35": "Andaman and Nicobar Islands",
    "36": "Telangana",          "37": "Andhra Pradesh",   "38": "Ladakh",
  };
  return map[code] ?? "";
}
