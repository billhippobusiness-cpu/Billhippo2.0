/**
 * Firestore document shapes shared with the BillHippo web app. Kept in sync with
 * the web `types.ts` Tally section (intentionally duplicated so the connector has
 * no dependency on the web project).
 */

export type SyncJobType = "PUSH_INVOICE" | "FETCH_LEDGERS" | "CREATE_LEDGER" | "ALTER_LEDGER";
export type SyncJobStatus = "pending" | "processing" | "success" | "failed";

export interface SyncJob {
  id: string;
  type: SyncJobType;
  status: SyncJobStatus;
  invoiceId?: string;
  customerId?: string;
  payloadSnapshot?: Record<string, unknown>;
  attempts: number;
  tallyVoucherId?: string;
  error?: string;
}

export interface TallyLedger {
  name: string;
  parent: string;
  gstin?: string;
}
