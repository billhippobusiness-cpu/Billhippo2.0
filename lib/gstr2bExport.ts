import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { GSTR2BData } from './whitebooksApi';

const HEADER_FILL  = { fgColor: { rgb: "1E40AF" } };  // deep blue
const HEADER_FONT  = { bold: true, color: { rgb: "FFFFFF" }, sz: 10 };
const SECTION_FILL = { fgColor: { rgb: "EFF6FF" } };  // light blue
const SECTION_FONT = { bold: true, color: { rgb: "1E3A8A" }, sz: 10 };
const TOTAL_FILL   = { fgColor: { rgb: "1E3A8A" } };
const TOTAL_FONT   = { bold: true, color: { rgb: "FFFFFF" }, sz: 10 };
const BORDER = { top: { style: "thin", color: { rgb: "DBEAFE" } }, bottom: { style: "thin", color: { rgb: "DBEAFE" } }, left: { style: "thin", color: { rgb: "DBEAFE" } }, right: { style: "thin", color: { rgb: "DBEAFE" } } };

function cell(v: string | number, bold = false, fill?: any, font?: any, numFmt?: string): any {
  return {
    v, t: typeof v === 'number' ? 'n' : 's',
    s: { fill: fill ?? { fgColor: { rgb: "FFFFFF" } }, font: font ?? { bold, sz: 10, name: "Calibri" }, border: BORDER, alignment: { vertical: "center", wrapText: false } },
    ...(numFmt ? { z: numFmt } : {}),
  };
}

function numCell(v: number, fill?: any): any {
  return cell(v, false, fill, { sz: 10, name: "Calibri" }, '#,##0.00');
}

export function downloadGSTR2BExcel(data: GSTR2BData, businessName: string, businessGSTIN: string): void {
  const rows: any[][] = [];

  // Title row
  rows.push([cell(`GSTR-2B — ${businessName} (${businessGSTIN})`, true, { fgColor: { rgb: "0F172A" } }, { bold: true, color: { rgb: "FFFFFF" }, sz: 14, name: "Calibri" })]);
  rows.push([cell(`Period: ${data.period.slice(0,2)}/${data.period.slice(2)} | Generated: ${data.generationDate || 'N/A'} | Total Suppliers: ${data.suppliers.length}`, false, { fgColor: { rgb: "EFF6FF" } }, { sz: 10, name: "Calibri", color: { rgb: "1E3A8A" } })]);
  rows.push([]);

  // Summary section
  rows.push([
    cell("SUMMARY", true, HEADER_FILL, HEADER_FONT),
    cell("", false, HEADER_FILL),
    cell("", false, HEADER_FILL),
    cell("Taxable Value", true, HEADER_FILL, HEADER_FONT),
    cell("IGST", true, HEADER_FILL, HEADER_FONT),
    cell("CGST", true, HEADER_FILL, HEADER_FONT),
    cell("SGST", true, HEADER_FILL, HEADER_FONT),
    cell("Total Tax", true, HEADER_FILL, HEADER_FONT),
  ]);
  rows.push([
    cell("Total ITC Available (B2B)", true, SECTION_FILL, SECTION_FONT),
    cell("", false, SECTION_FILL),
    cell("", false, SECTION_FILL),
    numCell(data.totalTaxableValue, SECTION_FILL),
    numCell(data.totalIGST, SECTION_FILL),
    numCell(data.totalCGST, SECTION_FILL),
    numCell(data.totalSGST, SECTION_FILL),
    numCell(data.totalIGST + data.totalCGST + data.totalSGST, SECTION_FILL),
  ]);
  rows.push([]);

  // Invoice detail header (13 columns: added GST Rate % between Type and Taxable Value)
  rows.push([
    cell("#", true, HEADER_FILL, HEADER_FONT),
    cell("Supplier GSTIN", true, HEADER_FILL, HEADER_FONT),
    cell("Supplier Name", true, HEADER_FILL, HEADER_FONT),
    cell("Invoice #", true, HEADER_FILL, HEADER_FONT),
    cell("Invoice Date", true, HEADER_FILL, HEADER_FONT),
    cell("Type", true, HEADER_FILL, HEADER_FONT),
    cell("GST Rate %", true, HEADER_FILL, HEADER_FONT),
    cell("Taxable Value", true, HEADER_FILL, HEADER_FONT),
    cell("IGST", true, HEADER_FILL, HEADER_FONT),
    cell("CGST", true, HEADER_FILL, HEADER_FONT),
    cell("SGST", true, HEADER_FILL, HEADER_FONT),
    cell("Total Tax", true, HEADER_FILL, HEADER_FONT),
    cell("ITC", true, HEADER_FILL, HEADER_FONT),
  ]);

  function deriveRate(inv: any): number {
    if (inv.gstRate) return inv.gstRate;
    const totalTax = (inv.igst ?? 0) + (inv.cgst ?? 0) + (inv.sgst ?? 0);
    if (totalTax > 0 && inv.taxableValue > 0) {
      const raw = totalTax / inv.taxableValue * 100;
      return [5, 12, 18, 28].reduce((a: number, b: number) => Math.abs(b - raw) < Math.abs(a - raw) ? b : a);
    }
    return 0;
  }

  let rowNum = 1;
  for (const supplier of data.suppliers) {
    for (const inv of supplier.invoices) {
      const rate = deriveRate(inv);
      const altFill = rowNum % 2 === 0 ? { fgColor: { rgb: "F8FAFF" } } : { fgColor: { rgb: "FFFFFF" } };
      rows.push([
        cell(rowNum, false, altFill),
        cell(supplier.gstin, false, altFill),
        cell(supplier.tradeName || supplier.legalName, false, altFill),
        cell(inv.invoiceNumber, false, altFill),
        cell(inv.invoiceDate, false, altFill),
        cell(inv.invoiceType, false, altFill),
        cell(rate ? `${rate}%` : '—', false, altFill),
        numCell(inv.taxableValue, altFill),
        numCell(inv.igst, altFill),
        numCell(inv.cgst, altFill),
        numCell(inv.sgst, altFill),
        numCell(inv.igst + inv.cgst + inv.sgst, altFill),
        cell(inv.itcAvailability, false, altFill),
      ]);
      rowNum++;
    }
  }

  // Totals row
  const tot = { t: data.totalTaxableValue, i: data.totalIGST, c: data.totalCGST, s: data.totalSGST };
  rows.push([
    cell(`TOTAL (${rowNum - 1} invoices)`, true, TOTAL_FILL, TOTAL_FONT),
    cell("", false, TOTAL_FILL), cell("", false, TOTAL_FILL),
    cell("", false, TOTAL_FILL), cell("", false, TOTAL_FILL), cell("", false, TOTAL_FILL),
    cell("", false, TOTAL_FILL),
    numCell(tot.t, TOTAL_FILL),
    numCell(tot.i, TOTAL_FILL),
    numCell(tot.c, TOTAL_FILL),
    numCell(tot.s, TOTAL_FILL),
    numCell(tot.i + tot.c + tot.s, TOTAL_FILL),
    cell("", false, TOTAL_FILL),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    {wch:5},{wch:18},{wch:28},{wch:20},{wch:14},{wch:8},
    {wch:10},{wch:16},{wch:14},{wch:14},{wch:14},{wch:14},{wch:8}
  ];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
  ];
  ws['!rows'] = [{ hpt: 30 }, { hpt: 20 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GSTR-2B');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `GSTR-2B-${businessGSTIN}-${data.period}.xlsx`);
}
