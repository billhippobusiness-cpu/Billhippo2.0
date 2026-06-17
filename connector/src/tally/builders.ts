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

/** Export request for the full ledger list, fetching name/parent/GSTIN. */
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
      <NATIVEMETHOD>NAME</NATIVEMETHOD>
      <NATIVEMETHOD>PARENT</NATIVEMETHOD>
      <NATIVEMETHOD>PARTYGSTIN</NATIVEMETHOD>
      <NATIVEMETHOD>GSTIN</NATIVEMETHOD>
      <NATIVEMETHOD>LEDGERMAILINGDETAILS.LIST</NATIVEMETHOD>
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

/**
 * Accounting Sales voucher (no inventory). Balances as:
 *   party (Dr, total) = sales (Cr, taxable) + tax ledgers (Cr).
 * A stable REMOTEID makes a re-push ALTER the same voucher instead of
 * duplicating it.
 */
export function buildSalesVoucher(v: VoucherInput): string {
  const date = formatTallyDate(v.date);
  const entries: string[] = [
    ledgerEntryXml({ name: v.partyLedgerName, isDebit: true, amount: v.total }),
    ledgerEntryXml({ name: v.salesLedgerName, isDebit: false, amount: v.taxable }),
  ];
  if (v.gstType === "IGST") {
    if (v.igst) entries.push(ledgerEntryXml({ name: v.igstLedgerName, isDebit: false, amount: v.igst }));
  } else {
    if (v.cgst) entries.push(ledgerEntryXml({ name: v.cgstLedgerName, isDebit: false, amount: v.cgst }));
    if (v.sgst) entries.push(ledgerEntryXml({ name: v.sgstLedgerName, isDebit: false, amount: v.sgst }));
  }

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

/** Create a party ledger (Sundry Debtor) master with GSTIN + address. */
export function buildLedgerMaster(l: LedgerMasterInput): string {
  const gstin = (l.gstin || "").trim().toUpperCase();
  const regType = gstin ? "Regular" : "Unregistered/Consumer";
  const mailing = `      <LEDGERMAILINGDETAILS.LIST>
       <STATE>${escapeXml(l.state || "")}</STATE>
       <COUNTRY>${escapeXml(l.country || "India")}</COUNTRY>
       <PINCODE>${escapeXml(l.pincode || "")}</PINCODE>
       ${gstin ? `<GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>\n       <GSTIN>${escapeXml(gstin)}</GSTIN>` : ""}
       ${l.address ? `<ADDRESS.LIST TYPE="String"><ADDRESS>${escapeXml(l.address)}</ADDRESS></ADDRESS.LIST>` : ""}
      </LEDGERMAILINGDETAILS.LIST>`;

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
     <LEDGER NAME="${escapeXml(l.name)}" ACTION="Create">
      <NAME>${escapeXml(l.name)}</NAME>
      <PARENT>${escapeXml(l.parent)}</PARENT>
      <ISBILLWISEON>Yes</ISBILLWISEON>
      <GSTREGISTRATIONTYPE>${escapeXml(regType)}</GSTREGISTRATIONTYPE>
      ${gstin ? `<PARTYGSTIN>${escapeXml(gstin)}</PARTYGSTIN>` : ""}
${mailing}
     </LEDGER>
    </TALLYMESSAGE>
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}
