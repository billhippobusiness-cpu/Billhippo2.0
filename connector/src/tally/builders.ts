/**
 * Tally XML request builders.
 *
 * Three request envelopes:
 *  - buildLedgerListRequest: Export → Collection → "List of Ledgers" (with GSTIN)
 *  - buildSalesVoucher:      Import → Vouchers (accounting Sales voucher)
 *  - buildLedgerMaster:      Import → All Masters (create a party ledger)
 */

import { escapeXml, formatAmount, formatTallyDate } from "./xml";

export interface VoucherInput {
  companyName: string;
  date: string;
  voucherNumber: string;
  invoiceId: string;
  partyLedgerName: string;
  salesLedgerName: string;
  gstType: "CGST_SGST" | "IGST";
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  cgstLedgerName: string;
  sgstLedgerName: string;
  igstLedgerName: string;
  narration?: string;
}

export interface LedgerMasterInput {
  companyName: string;
  name: string;
  parent: string; // e.g. "Sundry Debtors"
  gstin?: string;
  address?: string;
  state?: string;
  pincode?: string;
  country?: string;
}

function staticVars(company: string): string {
  return `<STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY></STATICVARIABLES>`;
}

/** Fetch the current company's books-beginning date (so dated ledger lists use
 *  an APPLICABLEFROM within the books — Tally drops dated rows that start
 *  before the books begin). */
export function buildCompanyInfoRequest(companyName: string): string {
  return `<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>BH Company Info</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="BH Company Info" ISMODIFY="No">
      <TYPE>Company</TYPE>
      <FETCH>NAME</FETCH>
      <FETCH>STARTINGFROM</FETCH>
      <FETCH>BOOKSFROM</FETCH>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`;
}

/**
 * Export request for the companies currently OPEN in Tally. A Collection of
 * TYPE "Company" (with no SVCURRENTCOMPANY) returns the loaded companies, so the
 * web UI can offer them as a dropdown instead of asking the user to type a name.
 */
export function buildCompanyListRequest(): string {
  return `<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>BH List of Companies</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="BH List of Companies" ISMODIFY="No">
      <TYPE>Company</TYPE>
      <NATIVEMETHOD>NAME</NATIVEMETHOD>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`;
}

/**
 * Full ledger MASTERS export ("List of Accounts" → All Ledgers). Unlike a
 * restricted collection, this returns each ledger's complete master — including
 * GST registration details and the mailing address — which is what we need to
 * mirror GSTIN/address into BillHippo.
 */
export function buildLedgerMastersRequest(companyName: string): string {
  return `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Export Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <EXPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>List of Accounts</REPORTNAME>
    <STATICVARIABLES>
     <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
     <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
    </STATICVARIABLES>
   </REQUESTDESC>
  </EXPORTDATA>
 </BODY>
</ENVELOPE>`;
}

/** Export request for the full ledger list with GSTIN + mailing address.
 *  Uses <FETCH> (not <NATIVEMETHOD>) so Tally actually includes these member
 *  values — and their child lists — in the exported XML. */
export function buildLedgerListRequest(companyName: string): string {
  return `<ENVELOPE>
 <HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>BH List of Ledgers</ID>
 </HEADER>
 <BODY>
  <DESC>
   <STATICVARIABLES>
    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
    <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>
   </STATICVARIABLES>
   <TDL>
    <TDLMESSAGE>
     <COLLECTION NAME="BH List of Ledgers" ISMODIFY="No">
      <TYPE>Ledger</TYPE>
      <FETCH>NAME</FETCH>
      <FETCH>PARENT</FETCH>
      <FETCH>LEDSTATENAME</FETCH>
      <FETCH>PINCODE</FETCH>
      <FETCH>COUNTRYNAME</FETCH>
      <FETCH>ADDRESS</FETCH>
      <FETCH>PARTYGSTIN</FETCH>
      <FETCH>GSTREGISTRATIONTYPE</FETCH>
      <FETCH>LEDGERMAILINGDETAILS</FETCH>
      <FETCH>LEDGERGSTREGDETAILS</FETCH>
     </COLLECTION>
    </TDLMESSAGE>
   </TDL>
  </DESC>
 </BODY>
</ENVELOPE>`;
}

interface LedgerEntryXml {
  name: string;
  isDebit: boolean;
  amount: number; // absolute value; sign is applied here
}

function ledgerEntryXml(e: LedgerEntryXml): string {
  // Tally convention: debit amounts are negative, credits positive.
  const signed = e.isDebit ? -Math.abs(e.amount) : Math.abs(e.amount);
  return `      <ALLLEDGERENTRIES.LIST>
       <LEDGERNAME>${escapeXml(e.name)}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>${e.isDebit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
       <AMOUNT>${formatAmount(signed)}</AMOUNT>
      </ALLLEDGERENTRIES.LIST>`;
}

/** Round to 2 decimals (paisa) — Tally stores amounts at 2dp, so we must round
 *  BEFORE summing or the voucher won't balance to the paisa. */
function r2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Accounting Sales voucher (no inventory). Balances as:
 *   party (Dr) = sales (Cr, taxable) + tax ledgers (Cr).
 * The party debit is the EXACT sum of the rounded credit lines (not the
 * invoice's stored grand total), so a sub-paisa rounding difference in the
 * stored total can never leave the voucher unbalanced — which Tally silently
 * rejects (0 created). A stable REMOTEID makes a re-push ALTER the same voucher
 * instead of duplicating it.
 */
export function buildSalesVoucher(v: VoucherInput): string {
  const date = formatTallyDate(v.date);
  const credits: { name: string; amount: number }[] = [
    { name: v.salesLedgerName, amount: r2(v.taxable) },
  ];
  if (v.gstType === "IGST") {
    const igst = r2(v.igst);
    if (igst) credits.push({ name: v.igstLedgerName, amount: igst });
  } else {
    const cgst = r2(v.cgst);
    const sgst = r2(v.sgst);
    if (cgst) credits.push({ name: v.cgstLedgerName, amount: cgst });
    if (sgst) credits.push({ name: v.sgstLedgerName, amount: sgst });
  }
  const total = r2(credits.reduce((s, c) => s + c.amount, 0));
  const entries: string[] = [
    ledgerEntryXml({ name: v.partyLedgerName, isDebit: true, amount: total }),
    ...credits.map((c) => ledgerEntryXml({ name: c.name, isDebit: false, amount: c.amount })),
  ];

  return `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
    ${staticVars(v.companyName)}
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
      <REMOTEID>BillHippo-${escapeXml(v.invoiceId)}</REMOTEID>
      <DATE>${date}</DATE>
      <EFFECTIVEDATE>${date}</EFFECTIVEDATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${escapeXml(v.voucherNumber)}</VOUCHERNUMBER>
      <REFERENCE>${escapeXml(v.voucherNumber)}</REFERENCE>
      <PARTYLEDGERNAME>${escapeXml(v.partyLedgerName)}</PARTYLEDGERNAME>
      <PARTYNAME>${escapeXml(v.partyLedgerName)}</PARTYNAME>
      <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
      <NARRATION>${escapeXml(v.narration || `BillHippo ${v.voucherNumber}`)}</NARRATION>
${entries.join("\n")}
     </VOUCHER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}

/** A single rate-group line of a sales voucher. */
export interface VoucherLine {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  salesLedgerName: string;
  cgstLedgerName: string;
  sgstLedgerName: string;
  igstLedgerName: string;
}

export interface MultiVoucherInput {
  companyName: string;
  date: string;
  voucherNumber: string;
  invoiceId: string;
  partyLedgerName: string;
  gstType: "CGST_SGST" | "IGST";
  lines: VoucherLine[];
  narration?: string;
}

/**
 * Sales voucher with one set of sales + tax lines PER GST RATE, so a mixed-rate
 * invoice posts each rate to its own sales/CGST/SGST(IGST) ledger. The party is
 * debited with the sum of all lines so the voucher always balances.
 */
export function buildSalesVoucherMulti(v: MultiVoucherInput): string {
  const date = formatTallyDate(v.date);
  // Round every credit line first, then debit the party with their exact sum so
  // the voucher always balances to the paisa (see buildSalesVoucher).
  const credits: { name: string; amount: number }[] = [];
  for (const ln of v.lines) {
    const taxable = r2(ln.taxable);
    if (taxable) credits.push({ name: ln.salesLedgerName, amount: taxable });
    if (v.gstType === "IGST") {
      const igst = r2(ln.igst);
      if (igst) credits.push({ name: ln.igstLedgerName, amount: igst });
    } else {
      const cgst = r2(ln.cgst);
      const sgst = r2(ln.sgst);
      if (cgst) credits.push({ name: ln.cgstLedgerName, amount: cgst });
      if (sgst) credits.push({ name: ln.sgstLedgerName, amount: sgst });
    }
  }
  const total = r2(credits.reduce((s, c) => s + c.amount, 0));
  const entries: string[] = [
    ledgerEntryXml({ name: v.partyLedgerName, isDebit: true, amount: total }),
    ...credits.map((c) => ledgerEntryXml({ name: c.name, isDebit: false, amount: c.amount })),
  ];

  return `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
    ${staticVars(v.companyName)}
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">
      <REMOTEID>BillHippo-${escapeXml(v.invoiceId)}</REMOTEID>
      <DATE>${date}</DATE>
      <EFFECTIVEDATE>${date}</EFFECTIVEDATE>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${escapeXml(v.voucherNumber)}</VOUCHERNUMBER>
      <REFERENCE>${escapeXml(v.voucherNumber)}</REFERENCE>
      <PARTYLEDGERNAME>${escapeXml(v.partyLedgerName)}</PARTYLEDGERNAME>
      <PARTYNAME>${escapeXml(v.partyLedgerName)}</PARTYNAME>
      <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
      <NARRATION>${escapeXml(v.narration || `BillHippo ${v.voucherNumber}`)}</NARRATION>
${entries.join("\n")}
     </VOUCHER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}

/** Create or alter a ledger master with optional GSTIN + address. `applicableFrom`
 *  (YYYYMMDD) must be on/after the company's books-begin or Tally drops the
 *  dated mailing/GST rows. */
export function buildLedgerMaster(
  l: LedgerMasterInput,
  action: "Create" | "Alter" = "Create",
  applicableFrom = "20170701",
): string {
  const gstin = (l.gstin || "").trim().toUpperCase();
  const regType = gstin ? "Regular" : "Unregistered/Consumer";
  const country = l.country || "India";
  const af = /^\d{8}$/.test(applicableFrom) ? applicableFrom : "20170701";
  const state = (l.state || "").trim();

  // Address can be multi-line ("a, b" or "a\nb") → one <ADDRESS> per line.
  const addrLines = (l.address || "").split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean);
  const addressList = addrLines.length
    ? `       <ADDRESS.LIST TYPE="String">${addrLines.map((a) => `\n        <ADDRESS>${escapeXml(a)}</ADDRESS>`).join("")}\n       </ADDRESS.LIST>`
    : "";

  // CRITICAL: Tally's master IMPORT expects the dated LED*DETAILS lists, whose
  // tag names differ from the EXPORT names (LEDGER*DETAILS). The address, state,
  // pincode and country must live INSIDE <LEDMAILINGDETAILS.LIST>, and the GSTIN
  // inside <LEDGSTREGDETAILS.LIST> — Tally silently drops a top-level ADDRESS or
  // a LEDGER*-named block, which is why earlier builds created bare ledgers.
  const hasMailing = addrLines.length || state || l.pincode;
  const mailingList = hasMailing
    ? `      <LEDMAILINGDETAILS.LIST>
       <APPLICABLEFROM>${af}</APPLICABLEFROM>
       <MAILINGNAME>${escapeXml(l.name)}</MAILINGNAME>
${addressList}
       <STATE>${escapeXml(state)}</STATE>
       <COUNTRY>${escapeXml(country)}</COUNTRY>
       <PINCODE>${escapeXml(l.pincode || "")}</PINCODE>
      </LEDMAILINGDETAILS.LIST>`
    : "";
  const gstRegList = gstin
    ? `      <LEDGSTREGDETAILS.LIST>
       <APPLICABLEFROM>${af}</APPLICABLEFROM>
       <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>
       <STATE>${escapeXml(state)}</STATE>
       <GSTIN>${escapeXml(gstin)}</GSTIN>
      </LEDGSTREGDETAILS.LIST>`
    : "";

  return `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
    ${staticVars(l.companyName)}
   </REQUESTDESC>
   <REQUESTDATA>
    <TALLYMESSAGE xmlns:UDF="TallyUDF">
     <LEDGER NAME="${escapeXml(l.name)}" ACTION="${action}">
      <NAME>${escapeXml(l.name)}</NAME>
      <PARENT>${escapeXml(l.parent)}</PARENT>
      <ISBILLWISEON>Yes</ISBILLWISEON>
      <COUNTRYNAME>${escapeXml(country)}</COUNTRYNAME>
      <COUNTRYOFRESIDENCE>${escapeXml(country)}</COUNTRYOFRESIDENCE>
      ${state ? `<LEDSTATENAME>${escapeXml(state)}</LEDSTATENAME>` : ""}
      ${l.pincode ? `<PINCODE>${escapeXml(l.pincode)}</PINCODE>` : ""}
      ${gstin ? `<ISGSTAPPLICABLE>&#4; Applicable</ISGSTAPPLICABLE>` : ""}
      <GSTREGISTRATIONTYPE>${escapeXml(regType)}</GSTREGISTRATIONTYPE>
      ${gstin ? `<PARTYGSTIN>${escapeXml(gstin)}</PARTYGSTIN>` : ""}
${mailingList}
${gstRegList}
     </LEDGER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}
