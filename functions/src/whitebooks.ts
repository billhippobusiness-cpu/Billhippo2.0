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

// ─── 6. Fetch GSTR-1 — GET /gstr1/retsum ─────────────────────────────────────
// Per Postman: gstin, retperiod, email in query. txn in header.
export const wbFetchGSTR1 = onCall(
  { secrets: [wbClientId, wbClientSecret, wbEmail], region: "asia-south1" },
  async (request) => {
    const { gstin, period, authToken, gstUsername } = request.data as {
      gstin: string; period: string; authToken: string; gstUsername: string;
    };

    const email     = wbEmail.value();
    const stateCode = gstin.substring(0, 2);
    const g         = gstin.toUpperCase();
    // smrytyp=E was incorrect (Export section only); use retsum without smrytyp for full summary
    const url       = `${WB_BASE}/gstr1/retsum?gstin=${g}&retperiod=${period}&email=${encodeURIComponent(email)}`;

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
      throw new HttpsError("unavailable", `GSTR-1 fetch failed (${res.status}): ${txt.substring(0, 300)}`);
    }

    const raw = await res.json();
    if (raw?.status_cd === "0") {
      throw new HttpsError("unavailable", `GSTR-1 error: ${raw?.error?.message ?? JSON.stringify(raw)}`);
    }
    const result = normalizeGSTR1(gstin, period, raw);
    // Log structure so we can see the raw shape during debugging
    const topKeys = JSON.stringify(Object.keys(raw?.data?.data ?? raw?.data ?? raw ?? {}));
    console.info(`GSTR-1 raw top-keys: ${topKeys} | totals: txval=${result.totalTaxableValue} igst=${result.totalIGST} cgst=${result.totalCGST} sgst=${result.totalSGST}`);
    return result;
  }
);

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeGSTR2B(gstin: string, period: string, raw: any) {
  // Try multiple response nesting levels WhiteBooks may use
  const d = raw.data?.data ?? raw.data ?? raw;
  const suppliers: any[] = [];
  let totalTaxable = 0, totalIGST = 0, totalCGST = 0, totalSGST = 0, invoiceCount = 0;

  const buyerState = gstin.substring(0, 2);
  const b2bList: any[] =
    d?.docdata?.b2b ?? d?.data?.docdata?.b2b ??
    d?.b2b ?? d?.data?.b2b ?? [];
  for (const supplier of b2bList) {
    const supplierState = (supplier.ctin ?? "").substring(0, 2);
    const invoices = (supplier.inv ?? supplier.invoices ?? []).map((inv: any) => {
      const items = inv.itms ?? inv.items ?? [];
      let taxable = 0, igst = 0, cgst = 0, sgst = 0, gstRate = 0;
      for (const itm of items) {
        const detail = itm.itm_det ?? itm;
        taxable += Number(detail.txval ?? 0);
        // Try both iamt/camt/samt (NIC format) and igst/cgst/sgst (alternative naming)
        igst    += Number(detail.iamt ?? detail.igst ?? 0);
        cgst    += Number(detail.camt ?? detail.cgst ?? 0);
        sgst    += Number(detail.samt ?? detail.sgst ?? 0);
        if (!gstRate) gstRate = Number(detail.rt ?? detail.rate ?? 0);
      }
      // Fallback: amounts directly on invoice
      if (taxable === 0 && igst === 0 && cgst === 0 && sgst === 0) {
        taxable = Number(inv.txval ?? inv.val ?? 0);
        igst    = Number(inv.iamt ?? inv.igst ?? 0);
        cgst    = Number(inv.camt ?? inv.cgst ?? 0);
        sgst    = Number(inv.samt ?? inv.sgst ?? 0);
        if (!gstRate) gstRate = Number(inv.rt ?? inv.rate ?? 0);
      }
      // Rate-based fallback: when taxable is known but all tax amounts are 0
      if (taxable > 0 && igst === 0 && cgst === 0 && sgst === 0 && gstRate > 0) {
        const isInterState = supplierState !== buyerState;
        if (isInterState) {
          igst = Math.round(taxable * gstRate) / 100;
        } else {
          cgst = Math.round(taxable * gstRate / 2) / 100;
          sgst = Math.round(taxable * gstRate / 2) / 100;
        }
      }
      return {
        invoiceNumber:   inv.inum ?? inv.invoice_number ?? "",
        invoiceDate:     inv.idt  ?? inv.invoice_date   ?? "",
        invoiceType:     inv.typ  ?? "B2B",
        placeOfSupply:   inv.pos  ?? "",
        reverseCharge:   inv.rchrg === "Y",
        taxableValue:    taxable,
        igst, cgst, sgst, cess: 0,
        itcAvailability: inv.itcavl ?? "Yes",
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

function normalizeGSTR1(gstin: string, period: string, raw: any) {
  const d = raw.data?.data ?? raw.data ?? raw;
  const filedDate = d.filed_date ?? d.filedDate ?? d.dt ?? "";

  // Format 1: sec_sum array (full return summary — most common from /gstr1/retsum)
  const secSum: any[] = d.sec_sum ?? d.secSum ?? [];
  if (secSum.length > 0) {
    const b2b = secSum.find((s: any) => (s.sec_nm ?? s.secNm ?? "").toUpperCase() === "B2B");
    const igst = Number(b2b?.iamt ?? 0);
    const cgst = Number(b2b?.camt ?? 0);
    const sgst = Number(b2b?.samt ?? 0);
    return {
      gstin, period, filedDate,
      b2bInvoices: [],
      totalTaxableValue: Number(b2b?.txval ?? 0),
      totalIGST: igst, totalCGST: cgst, totalSGST: sgst,
    };
  }

  // Format 2: sup_details object (GSTR-3B-style aggregate)
  const sup = d.sup_details ?? d.supDetails ?? null;
  if (sup) {
    const igst = Number(sup?.osup_det?.iamt ?? 0);
    const cgst = Number(sup?.osup_det?.camt ?? 0);
    const sgst = Number(sup?.osup_det?.samt ?? 0);
    return {
      gstin, period, filedDate,
      b2bInvoices: [],
      totalTaxableValue: Number(sup?.osup_det?.txval ?? 0),
      totalIGST: igst, totalCGST: cgst, totalSGST: sgst,
    };
  }

  // Format 3: top-level aggregate fields (gt = grand total)
  if (d.gt !== undefined || d.cur_gt !== undefined) {
    const totalGT = Number(d.gt ?? d.cur_gt ?? 0);
    return {
      gstin, period, filedDate,
      b2bInvoices: [],
      totalTaxableValue: totalGT,
      totalIGST: 0, totalCGST: 0, totalSGST: 0,
    };
  }

  // Format 4: b2b invoice array
  const b2bList: any[] = d?.b2b ?? d?.data?.b2b ?? [];
  const b2bInvoices = b2bList.flatMap((supplier: any) =>
    (supplier.inv ?? []).map((inv: any) => {
      const items = inv.itms ?? [];
      let taxable = 0, igst = 0, cgst = 0, sgst = 0;
      for (const itm of items) {
        const dt = itm.itm_det ?? itm;
        taxable += dt.txval ?? 0; igst += dt.iamt ?? 0; cgst += dt.camt ?? 0; sgst += dt.samt ?? 0;
      }
      if (taxable === 0 && igst === 0 && cgst === 0 && sgst === 0) {
        taxable = inv.txval ?? 0; igst = inv.iamt ?? 0; cgst = inv.camt ?? 0; sgst = inv.samt ?? 0;
      }
      return {
        invoiceNumber: inv.inum ?? "", invoiceDate: inv.idt ?? "",
        receiverGSTIN: supplier.ctin ?? "", receiverName: supplier.trdnm ?? supplier.lgnm ?? "",
        placeOfSupply: inv.pos ?? "", taxableValue: taxable, igst, cgst, sgst,
        invoiceValue: taxable + igst + cgst + sgst,
      };
    })
  );
  return {
    gstin, period, filedDate: d.filed_date ?? d.filedDate ?? "", b2bInvoices,
    totalTaxableValue: b2bInvoices.reduce((s: number, i: any) => s + i.taxableValue, 0),
    totalIGST: b2bInvoices.reduce((s: number, i: any) => s + i.igst, 0),
    totalCGST: b2bInvoices.reduce((s: number, i: any) => s + i.cgst, 0),
    totalSGST: b2bInvoices.reduce((s: number, i: any) => s + i.sgst, 0),
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
