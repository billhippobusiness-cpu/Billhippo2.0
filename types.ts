
export enum GSTType {
  CGST_SGST = 'CGST_SGST',
  IGST = 'IGST'
}

export interface BusinessTheme {
  templateId: 'modern-1' | 'modern-2' | 'minimal';
  primaryColor: string;
  fontFamily: string;
  logoUrl?: string;
  invoicePrefix: string;
  autoNumbering: boolean;
}

export interface BusinessProfile {
  name: string;
  gstin: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  pan: string;
  tagline?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  upiId?: string;
  defaultNotes?: string;
  termsAndConditions?: string;
  gstEnabled: boolean;
  businessType?: 'service' | 'trading';
  theme: BusinessTheme;
  signatureUrl?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  description?: string;
  hsnCode: string;
  unit: string;
  sellingPrice: number;
  costPrice?: number;
  gstRate: number;
  stock?: number;
}

export interface Customer {
  id: string;
  name: string;
  gstin?: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  balance: number;
}

export interface InvoiceItem {
  id: string;
  description: string;
  hsnCode: string;
  quantity: number;
  rate: number;
  gstRate: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  items: InvoiceItem[];
  gstType: GSTType;
  totalBeforeTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  status: 'Paid' | 'Unpaid' | 'Partial';
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: 'Credit' | 'Debit';
  amount: number;
  description: string;
  invoiceId?: string;
  customerId: string;
}
