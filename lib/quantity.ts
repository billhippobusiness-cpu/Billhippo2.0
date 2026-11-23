/**
 * Sum of line-item quantities, for the optional "Total Quantity" row on
 * invoices. Quantities may be fractional (2.5 kg), so the sum is rounded to
 * three decimals to keep float noise like 0.30000000000000004 off the page.
 */
export function totalQuantity(items: { quantity: number }[]): number {
  const sum = items.reduce((s, item) => s + (Number(item.quantity) || 0), 0);
  return Math.round(sum * 1000) / 1000;
}

/** 25 → "25", 12.5 → "12.5", 1234.125 → "1,234.125". */
export function formatQuantity(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}
