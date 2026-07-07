
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
  professionalUid?: string;     // Set once they accept
  // Stored at invite time so the collection-group query has everything it needs
  businessName?: string;
  businessUserEmail?: string;
}

/**
 * Shape returned by `subscribePendingInvitesByEmail` / `getPendingInvitesByEmail`.
 * Sourced from the `assignedProfessionals` collection group — purely email-based,
 * no invite-token ID matching required.
 */
export interface PendingAssignment {
  id: string;               // Firestore doc ID (= invite token)
  businessUserUid: string;  // Extracted from doc path (parent.parent.id)
  businessName: string;     // Stored on the doc at invite time
  businessUserEmail: string;
  email: string;            // Professional's email (= the query key)
  firstName: string;
  lastName: string;
  designation: ProfessionalDesignation;
  accessLevel: string;
  status: 'pending' | 'active' | 'revoked';
  invitedAt: string;
  linkedAt?: string;
  professionalId?: string;
  professionalUid?: string;
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
  templateId: 'modern-1' | 'modern-2' | 'geometric' | 'payment-first';
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
  // GST Portal credentials (for fetching GSTR-2B/3B/1)
  gstPortalUsername?: string;
  gstPortalPassword?: string;
  gstRegistrationType?: string;   // e.g. "Regular", "Composition Dealer"
}

export interface ServiceItem {
  id: string;
  name: string;
  description?: string;
  sacCode: string;
  unit: string;
  rate: number;
  gstRate: number;
}

export interface ServiceItem {
  id: string;
  name: string;
  description?: string;
  sacCode: string;
  unit: string;
  rate: number;
  gstRate: number;
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
  // ── Tally integration ──
  // The exact party-ledger name this customer resolves to in Tally. Set once a
  // ledger is matched (by GSTIN or name) or manually mapped, so subsequent
  // pushes always use the Tally-side name even when it differs from `name`.
  tallyLedgerName?: string;
  // How the resolution was made: 'gstin' (authoritative) or 'name'.
  tallyMatchType?: 'gstin' | 'name';
}

export interface InvoiceItem {
  id: string;
  description: string;
  notes?: string;
  hsnCode: string;
  quantity: number;
  rate: number;
  gstRate: number;
  // When the line item was picked from the inventory catalogue, this stores
  // the inventory doc id so stock adjustments can be applied on save/edit/delete.
  inventoryItemId?: string;
  unit?: string;
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
  // Set true once stock has been decremented for this invoice's line items;
  // prevents double-application when the invoice is edited.
  stockApplied?: boolean;
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

// ── Purchases ──────────────────────────────────────────────────────────────
// A purchase records goods received from a supplier. Inventory stock is
// incremented for each line item linked to the catalogue. Stored at
// users/{userId}/purchases/{id}.

export interface PurchaseItem {
  id: string;
  // Required when the line should affect inventory stock and appear in the
  // "inward" column of the inventory statement.
  inventoryItemId?: string;
  description: string;
  hsnCode: string;
  unit?: string;
  quantity: number;
  rate: number;          // Cost rate per unit
  gstRate: number;
}

export interface Purchase {
  id: string;
  purchaseNumber: string;       // Supplier's bill / invoice number
  date: string;                 // YYYY-MM-DD
  supplierName: string;
  supplierGstin?: string;
  supplierState?: string;
  items: PurchaseItem[];
  gstType: GSTType;
  totalBeforeTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  notes?: string;
  // Set true once stock has been incremented for this purchase's line items.
  stockApplied?: boolean;
}

// ── Quotations ─────────────────────────────────────────────────────────────
// Quotations are pre-invoice proposals. They are NOT recorded in GST reports,
// ledger entries, or customer balance calculations.

export type QuotationStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Converted';

export interface Quotation {
  id: string;
  quotationNumber: string;
  date: string;
  validUntil?: string;           // Expiry date shown to customer
  customerId: string;
  customerName: string;
  items: InvoiceItem[];          // Reuses InvoiceItem (description, hsnCode, qty, rate, gstRate)
  gstType: GSTType;
  totalBeforeTax: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalAmount: number;
  status: QuotationStatus;
  notes?: string;                // Free-text note for the customer
  convertedInvoiceId?: string;     // Firestore doc ID of the created invoice
  convertedInvoiceNumber?: string; // Human-readable number, e.g. "INV/2026/005"
}

// ── Delivery Challans ──────────────────────────────────────────────────────
// A delivery challan records goods dispatched to a customer before or without
// a tax invoice. Stored at users/{userId}/deliveryChallans/{id}.

export interface DeliveryChallan {
  id: string;
  challanNumber: string;
  date: string;
  customerId: string;
  customerName: string;
  enableShipTo: boolean;
  shipToName?: string;
  shipToGstin?: string;
  shipToAddress?: string;
  shipToCity?: string;
  shipToState?: string;
  shipToPincode?: string;
  items: InvoiceItem[];
  totalQuantity: number;
  totalBeforeTax: number;
  totalAmount: number;
  invoiceId?: string;
  invoiceNumber?: string;
  vehicleNumber?: string;
  transportMode?: string;
  notes?: string;
  status: 'Draft' | 'Dispatched' | 'Delivered';
}

// ── Tally Integration ──────────────────────────────────────────────────────
// The BillHippo Desktop Connector (Electron tray app) bridges Firestore and a
// local Tally Prime instance (HTTP XML gateway on localhost:9000). The web app
// and connector communicate exclusively through these Firestore documents:
//   users/{uid}/tallyConfig/main   → settings + connector heartbeat
//   users/{uid}/tallyLedgers/{id}  → mirror of ledgers that exist in Tally
//   users/{uid}/syncJobs/{id}      → the work queue (push invoice / fetch / create)

export type SyncJobType = 'PUSH_INVOICE' | 'FETCH_LEDGERS' | 'CREATE_LEDGER' | 'ALTER_LEDGER';
export type SyncJobStatus = 'pending' | 'processing' | 'success' | 'failed';

export interface TallyConfig {
  enabled: boolean;
  companyName: string;          // exact Tally company name to import into
  tallyPort: number;            // default 9000
  salesLedgerName: string;      // e.g. "Sales @ 18%" or "Sales Accounts"
  // GST tax ledger names in Tally (default to CGST / SGST / IGST if unset).
  cgstLedgerName?: string;
  sgstLedgerName?: string;
  igstLedgerName?: string;
  defaultRoundOffLedger?: string;
  connectorStatus?: 'online' | 'offline';
  connectorVersion?: string;
  lastHeartbeat?: unknown;      // Firestore Timestamp — connector writes ~every 30s
  lastLedgerSyncAt?: unknown;   // Firestore Timestamp — last successful FETCH_LEDGERS
  discoveredCompanies?: string[]; // companies open in Tally (connector-reported)
  discoveredAt?: unknown;       // Firestore Timestamp — last company/ledger discovery
  lastLedgerRawXml?: string;    // truncated raw Tally ledger response (diagnostics)
  lastLedgerWriteXml?: string;  // last create/edit-ledger request + response (diagnostics)
  lastLedgerSampleXml?: string; // an existing ledger's full master (import-format reference)
  pairingCode?: string;         // one-time code to link a connector (Phase 2)
  pairingCodeExpiresAt?: number;
}

export interface TallyLedger {
  id: string;
  name: string;                 // ledger name exactly as stored in Tally
  parent: string;               // group, e.g. "Sundry Debtors", "Sales Accounts"
  gstin?: string;               // party GSTIN — the authoritative match key
  address?: string;             // mailing address pulled from Tally
  state?: string;
  pincode?: string;
  syncedAt?: unknown;           // Firestore Timestamp
}

export interface SyncJob {
  id: string;
  type: SyncJobType;
  status: SyncJobStatus;
  invoiceId?: string;           // ref to users/{uid}/invoices/{id} (PUSH_INVOICE)
  customerId?: string;          // ref to users/{uid}/customers/{id} (CREATE_LEDGER)
  // Denormalised snapshot of the source data at queue time. Keeps the job
  // self-contained/auditable and limits what the connector must read.
  payloadSnapshot?: Record<string, unknown>;
  attempts: number;
  tallyVoucherId?: string;      // Tally MASTERID / remote id on success
  error?: string;               // human-readable failure reason
  createdAt?: unknown;          // Firestore Timestamp
  updatedAt?: unknown;          // Firestore Timestamp
  createdBy?: string;           // uid that enqueued the job
}
