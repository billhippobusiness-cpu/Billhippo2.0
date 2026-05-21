import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface GSTINDetails {
  gstin: string;
  legalName: string;
  tradeName: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  stateCode: string;
  registrationDate: string;
  taxpayerType: string;
  status: string;
  constitutionOfBusiness: string;
  filingStatus: string;
}

export interface GSTR2BSupplierInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceType: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  itcAvailability: string;
}

export interface GSTR2BSupplier {
  gstin: string;
  tradeName: string;
  legalName: string;
  invoices: GSTR2BSupplierInvoice[];
  totalTaxable: number;
  totalIGST: number;
  totalCGST: number;
  totalSGST: number;
}

export interface GSTR2BData {
  gstin: string;
  period: string;
  generationDate: string;
  suppliers: GSTR2BSupplier[];
  totalTaxableValue: number;
  totalIGST: number;
  totalCGST: number;
  totalSGST: number;
  invoiceCount: number;
}

export interface GSTR3BOnlineData {
  gstin: string;
  period: string;
  filedDate: string;
  outwardTaxable: number;
  outwardTax: number;
  outwardIGST: number;
  outwardCGST: number;
  outwardSGST: number;
  itcIGST: number;
  itcCGST: number;
  itcSGST: number;
  netTaxPayable: number;
}

export interface GSTR1OnlineInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  receiverGSTIN: string;
  receiverName: string;
  placeOfSupply: string;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  invoiceValue: number;
}

export interface GSTR1OnlineData {
  gstin: string;
  period: string;
  filedDate: string;
  b2bInvoices: GSTR1OnlineInvoice[];
  totalTaxableValue: number;
  totalIGST: number;
  totalCGST: number;
  totalSGST: number;
}

export async function lookupGSTIN(gstin: string): Promise<GSTINDetails> {
  const fn = httpsCallable<{ gstin: string }, GSTINDetails>(functions, 'wbLookupGSTIN');
  const result = await fn({ gstin });
  return result.data;
}

export async function initiateGSTSession(gstin: string, gstUsername: string): Promise<{ message: string }> {
  const fn = httpsCallable<{ gstin: string; gstUsername: string }, { message: string }>(functions, 'wbInitSession');
  const result = await fn({ gstin, gstUsername });
  return result.data;
}

export async function verifyGSTOTP(
  gstin: string, otp: string, gstUsername: string, userId: string
): Promise<{ authToken: string; expiresAt: number }> {
  const fn = httpsCallable<
    { gstin: string; otp: string; gstUsername: string; userId: string },
    { authToken: string; expiresAt: number }
  >(functions, 'wbVerifyOTP');
  const result = await fn({ gstin, otp, gstUsername, userId });
  return result.data;
}

export async function fetchGSTR2B(gstin: string, period: string, authToken: string): Promise<GSTR2BData> {
  const fn = httpsCallable<{ gstin: string; period: string; authToken: string }, GSTR2BData>(functions, 'wbFetchGSTR2B');
  const result = await fn({ gstin, period, authToken });
  return result.data;
}

export async function fetchGSTR3BOnline(gstin: string, period: string, authToken: string): Promise<GSTR3BOnlineData> {
  const fn = httpsCallable<{ gstin: string; period: string; authToken: string }, GSTR3BOnlineData>(functions, 'wbFetchGSTR3B');
  const result = await fn({ gstin, period, authToken });
  return result.data;
}

export async function fetchGSTR1Online(gstin: string, period: string, authToken: string): Promise<GSTR1OnlineData> {
  const fn = httpsCallable<{ gstin: string; period: string; authToken: string }, GSTR1OnlineData>(functions, 'wbFetchGSTR1');
  const result = await fn({ gstin, period, authToken });
  return result.data;
}
