// ── GST ITC set-off (utilisation) working ──
//
// Applies available Input Tax Credit against the output tax liability following
// the statutory order:
//   1. IGST credit → IGST, then CGST, then SGST liability
//   2. CGST credit → CGST, then IGST liability
//   3. SGST credit → SGST, then IGST liability
// Cross-utilisation of CGST ↔ SGST is not permitted.

export interface HeadAmt {
  igst: number;
  cgst: number;
  sgst: number;
}

export interface SetOffResult {
  utilised: HeadAmt;       // ITC applied against each liability head
  cash: HeadAmt;           // balance payable in cash per head
  creditCarried: HeadAmt;  // unused ITC carried forward to the credit ledger
}

export function computeSetOff(liability: HeadAmt, credit: HeadAmt): SetOffResult {
  let li = liability.igst, lc = liability.cgst, ls = liability.sgst;
  let ci = credit.igst, cc = credit.cgst, cs = credit.sgst;
  const utilised: HeadAmt = { igst: 0, cgst: 0, sgst: 0 };
  const apply = (avail: number, due: number) => Math.max(0, Math.min(avail, due));

  // 1. IGST credit → IGST, then CGST, then SGST
  let x = apply(ci, li); li -= x; ci -= x; utilised.igst += x;
  x = apply(ci, lc); lc -= x; ci -= x; utilised.cgst += x;
  x = apply(ci, ls); ls -= x; ci -= x; utilised.sgst += x;

  // 2. CGST credit → CGST, then IGST
  x = apply(cc, lc); lc -= x; cc -= x; utilised.cgst += x;
  x = apply(cc, li); li -= x; cc -= x; utilised.igst += x;

  // 3. SGST credit → SGST, then IGST
  x = apply(cs, ls); ls -= x; cs -= x; utilised.sgst += x;
  x = apply(cs, li); li -= x; cs -= x; utilised.igst += x;

  return {
    utilised,
    cash: { igst: li, cgst: lc, sgst: ls },
    creditCarried: { igst: ci, cgst: cc, sgst: cs },
  };
}

export function headTotal(h: HeadAmt): number {
  return h.igst + h.cgst + h.sgst;
}
