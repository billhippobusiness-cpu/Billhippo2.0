
// ── Professional Portal Types ──────────────────────────────────────────────

export type UserRole = 'business' | 'professional' | 'both';

export type ProfessionalDesignation =
  | 'Tax Consultant'
  | 'Chartered Accountant'
  | 'Accountant'
  | 'GST Practitioner'
  | 'Company Secretary'
  | 'Staff'
  | 'Other';

export interface ProfessionalProfile {
  uid: string;
  professionalId: string;       // Auto-generated: BHPCA00042 format
  firstName: string;
  lastName: string;
  email: string;
  designation: ProfessionalDesignation;
  firmName?: string;
  mobile?: string;
  linkedClients: string[];      // Array of business user UIDs
  referralCode: string;         // Same as professionalId
  totalReferrals: number;
  createdAt: string;
  roles: UserRole[];
}

export interface AssignedProfessional {
  id: string;                   // Firestore doc ID (= invite token)
  firstName: string;
  lastName: string;
  email: string;
  designation: ProfessionalDesignation;
  accessLevel: string;          // 'Full GST Access' | 'Reports Only'
  status: 'pending' | 'active' | 'revoked';
  invitedAt: string;
  linkedAt?: string;
  professionalId?: string;      // Set once they register/accept
}

export interface ProfessionalInvite {
  id: string;
  businessUserUid: string;
  businessUserEmail: string;
  businessName: string;
  professionalEmail: string;
  professionalFirstName: string;
  professionalLastName: string;
  designation: ProfessionalDesignation;
  accessLevel: string;          // 'Full GST Access' | 'Reports Only'
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
  expiresAt: string;            // 7 days from creation
  token: string;                // Unique invite token for URL
}

export interface ClientSummary {
  uid: string;
  businessName: string;
  gstin: string;
  ownerName: string;
  email: string;
  lastActivity: string;
  linkedAt: string;
}

// ── Existing Types ─────────────────────────────────────────────────────────

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

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  upiId?: string;
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
  bankAccounts?: BankAccount[];
  selectedBankId?: string;
  defaultNotes?: string;
  termsAndConditions?: string;
  gstEnabled: boolean;
  businessType?: 'service' | 'trading';
  theme: BusinessTheme;
  signatureUrl?: string;
  // GSTR-1: determines minimum HSN digit requirement (4 for <5cr, 6 for ≥5cr)
  annualTurnover?: 'below5cr' | 'above5cr';
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

export type SupplyType = 'B2B' | 'B2CS' | 'B2CL' | 'SEZWP' | 'SEZWOP' | 'EXPWP' | 'EXPWOP' | 'DE';

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
  deleted?: boolean;
  deletedAt?: string;
  // GSTR-1 classification fields
  supplyType?: SupplyType;
  reverseCharge?: boolean;
  // Export / SEZ specific fields (populated when supplyType is EXPWP/EXPWOP/SEZWP/SEZWOP)
  portCode?: string;
  shippingBillNo?: string;
  shippingBillDate?: string;
  exportCountry?: string;
}

export interface LedgerEntry {
  id: string;
  date: string;
  type: 'Credit' | 'Debit';
  amount: number;
  description: string;
  invoiceId?: string;
  creditNoteId?: string;
  debitNoteId?: string;
  customerId: string;
}

export interface CreditDebitNoteItem {
  id: string;
  description: string;
  hsnCode: string;
  quantity: number;
  rate: number;
  gstRate: number;
}

export interface CreditNote {
  id: string;
  noteNumber: string;
  date: string;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
  reason: string;
  customerId: string;
  customerName: string;
  items: CreditDebitNoteItem[];
  gstType: GSTType;
  totalBeforeTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}

export interface DebitNote {
  id: string;
  noteNumber: string;
  date: string;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
  reason: string;
  customerId: string;
  customerName: string;
  items: CreditDebitNoteItem[];
  gstType: GSTType;
  totalBeforeTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
}
