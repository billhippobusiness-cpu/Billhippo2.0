
import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, Printer, Globe, Image as ImageIcon, Save, Eye, Edit3, CheckCircle, Loader2, FileText, ArrowLeft, Download, Pencil, Search, UserPlus, Package, X, RotateCcw, ArchiveX } from 'lucide-react';
import { GSTType, InvoiceItem, Invoice, Customer, BusinessProfile, InventoryItem, SupplyType, type Quotation } from '../types';
import { getCustomers, getBusinessProfile, addInvoice, getInvoices, updateInvoice, addLedgerEntry, updateCustomer, addCustomer, getInventoryItems, softDeleteInvoice, restoreInvoice, getDeletedInvoices, getTotalInvoiceCount, updateQuotation } from '../lib/firestore';
import PDFPreviewModal, { PDFDirectDownload } from './pdf/PDFPreviewModal';
import InvoicePDF from './pdf/InvoicePDF';
import DeleteConfirmationModal from './DeleteConfirmationModal';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

const DEFAULT_PROFILE: BusinessProfile = {
  name: 'Your Business', gstin: '', address: '', city: '', state: 'Maharashtra', pincode: '',
  phone: '', email: '', pan: '', gstEnabled: true,
  theme: { templateId: 'modern-2', primaryColor: '#4c2de0', fontFamily: 'Poppins, sans-serif', invoicePrefix: 'INV/2026/', autoNumbering: true, logoUrl: BILLHIPPO_LOGO }
};

const numberToWords = (num: number) => {
  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const inWords = (n: any): string => {
    if ((n = n.toString()).length > 9) return 'overflow';
    let nArr = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!nArr) return '';
    let str = '';
    str += (parseInt(nArr[1]) !== 0) ? (a[Number(nArr[1])] || b[Number(nArr[1][0])] + ' ' + a[Number(nArr[1][1])]) + 'Crore ' : '';
    str += (parseInt(nArr[2]) !== 0) ? (a[Number(nArr[2])] || b[Number(nArr[2][0])] + ' ' + a[Number(nArr[2][1])]) + 'Lakh ' : '';
    str += (parseInt(nArr[3]) !== 0) ? (a[Number(nArr[3])] || b[Number(nArr[3][0])] + ' ' + a[Number(nArr[3][1])]) + 'Thousand ' : '';
    str += (parseInt(nArr[4]) !== 0) ? a[Number(nArr[4])] + 'Hundred ' : '';
    str += (parseInt(nArr[5]) !== 0) ? ((str !== '') ? 'and ' : '') + (a[Number(nArr[5])] || b[Number(nArr[5][0])] + ' ' + a[Number(nArr[5][1])]) + 'Only' : 'Only';
    return str;
  };
  return inWords(Math.floor(num));
};

// DD-MM-YYYY display helper
const formatDate = (d: string) => {
  if (!d) return '';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d;
};
// INR formatter
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface InvoiceGeneratorProps {
  userId: string;
  /** When set, pre-fills the invoice form with data from a quotation and enters editing mode. */
  initialQuotation?: Quotation | null;
  /** Called after initialQuotation has been consumed so App.tsx can clear it. */
  onQuotationConsumed?: () => void;
}

const InvoiceGenerator: React.FC<InvoiceGeneratorProps> = ({ userId, initialQuotation, onQuotationConsumed }) => {
  const [mode, setMode] = useState<'list' | 'editing' | 'preview'>('list');
  const [sourceQuotationId, setSourceQuotationId] = useState<string | null>(null);
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_PROFILE);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [deletedInvoices, setDeletedInvoices] = useState<Invoice[]>([]);
  const [showDeletedSection, setShowDeletedSection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmInvoice, setDeleteConfirmInvoice] = useState<Invoice | null>(null);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<string | null>(null);

  // PDF Modal state
  const [pdfModal, setPdfModal] = useState<{ open: boolean; invoice: Invoice | null; customer: Customer | null }>({
    open: false, invoice: null, customer: null,
  });

  // Direct download state (mounts PDFDirectDownload invisibly then auto-downloads)
  const [downloadTarget, setDownloadTarget] = useState<{ invoice: Invoice; customer: Customer | null } | null>(null);

  // Edit & search state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Customer dropdown state
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // Quick-create customer modal
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [qcForm, setQcForm] = useState({ name: '', phone: '', gstin: '', state: 'Maharashtra' });
  const [qcSaving, setQcSaving] = useState(false);

  // Inventory picker (trading only)
  const [showInventoryPicker, setShowInventoryPicker] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryLoaded, setInventoryLoaded] = useState(false);

  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', description: '', hsnCode: '', quantity: 1, rate: 0, gstRate: 18 }
  ]);

  // GSTR-1 classification fields
  const [supplyTypeOverride, setSupplyTypeOverride] = useState<SupplyType | ''>('');
  const [reverseCharge, setReverseCharge] = useState(false);
  const [portCode, setPortCode] = useState('');
  const [shippingBillNo, setShippingBillNo] = useState('');
  const [shippingBillDate, setShippingBillDate] = useState('');
  const [exportCountry, setExportCountry] = useState('');

  useEffect(() => { loadData(); }, [userId]);

  // Pre-fill form from a quotation when "Convert to Invoice" is triggered
  useEffect(() => {
    if (!initialQuotation) return;
    setEditingInvoice(null);
    setSelectedCustomerId(initialQuotation.customerId);
    setItems(initialQuotation.items);
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setSupplyTypeOverride('');
    setReverseCharge(false);
    setPortCode('');
    setShippingBillNo('');
    setShippingBillDate('');
    setExportCountry('');
    setError(null);
    setSaveSuccess(false);
    setMode('editing');
    // Store quotation id so we can mark it Converted after save
    setSourceQuotationId(initialQuotation.id);
    onQuotationConsumed?.();
  }, [initialQuotation]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true);
      const [profileData, customerData, invoiceData, deletedData, totalCount] = await Promise.all([
        getBusinessProfile(userId), getCustomers(userId), getInvoices(userId),
        getDeletedInvoices(userId), getTotalInvoiceCount(userId),
      ]);
      if (profileData) setProfile(profileData);
      setCustomers(customerData);
      setAllInvoices(invoiceData);
      setDeletedInvoices(deletedData);
      const prefix = profileData?.theme?.invoicePrefix || 'INV/2026/';
      // Use total count (including deleted) so deleted invoice numbers are never reused
      setInvoiceNumber(`${prefix}${String(totalCount + 1).padStart(3, '0')}`);
    } catch (err) {
      setError('Failed to load data. Please refresh.');
    } finally { setLoading(false); }
  };

  const selectedCustomer = useMemo(() => customers.find(c => c.id === selectedCustomerId), [selectedCustomerId, customers]);
  const gstType = useMemo(() => {
    if (!selectedCustomer) return GSTType.CGST_SGST;
    return selectedCustomer.state === profile.state ? GSTType.CGST_SGST : GSTType.IGST;
  }, [selectedCustomer, profile.state]);

  const subTotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const taxAmount = items.reduce((sum, item) => sum + (item.quantity * item.rate * item.gstRate / 100), 0);
  const grandTotal = subTotal + taxAmount;

  // Auto-detect supply type based on customer GSTIN + state + invoice value
  const autoSupplyType = useMemo((): SupplyType => {
    if (!selectedCustomer) return 'B2CS';
    if (selectedCustomer.gstin) return 'B2B';
    const isInterState = selectedCustomer.state !== profile.state;
    if (isInterState && grandTotal > 250000) return 'B2CL';
    return 'B2CS';
  }, [selectedCustomer, profile.state, grandTotal]);

  const effectiveSupplyType: SupplyType = (supplyTypeOverride || autoSupplyType) as SupplyType;
  const isExportSupply = effectiveSupplyType === 'EXPWP' || effectiveSupplyType === 'EXPWOP';
  const isSEZSupply = effectiveSupplyType === 'SEZWP' || effectiveSupplyType === 'SEZWOP';

  // HSN validation warning (non-blocking)
  const hsnWarning = useMemo(() => {
    const minDigits = profile.annualTurnover === 'above5cr' ? 6 : 4;
    const shortHsn = items.filter(i => i.description && (i.hsnCode || '').trim().length < minDigits);
    if (shortHsn.length === 0) return null;
    return `${shortHsn.length} item(s) have HSN codes shorter than ${minDigits} digits (required for your turnover bracket).`;
  }, [items, profile.annualTurnover]);

  const handleAddItem = () => {
    setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: '', hsnCode: '', quantity: 1, rate: 0, gstRate: 18 }]);
  };
  const handleRemoveItem = (id: string) => { setItems(items.filter(item => item.id !== id)); };
  const handleItemChange = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const handleEditInvoice = (inv: Invoice) => {
    setEditingInvoice(inv);
    setSelectedCustomerId(inv.customerId);
    setInvoiceNumber(inv.invoiceNumber);
    setInvoiceDate(inv.date);
    setItems(inv.items);
    setSupplyTypeOverride((inv.supplyType || '') as SupplyType | '');
    setReverseCharge(inv.reverseCharge || false);
    setPortCode(inv.portCode || '');
    setShippingBillNo(inv.shippingBillNo || '');
    setShippingBillDate(inv.shippingBillDate || '');
    setExportCountry(inv.exportCountry || '');
    setError(null);
    setSaveSuccess(false);
    setMode('editing');
  };

  const handleDeleteInvoice = (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirmInvoice(inv);
  };

  const handleDeleteInvoiceConfirmed = async () => {
    if (!deleteConfirmInvoice) return;
    const inv = deleteConfirmInvoice;
    setDeleteConfirmInvoice(null);
    setDeletingInvoiceId(inv.id);
    // Play the deletion animation, then commit to Firestore
    setTimeout(async () => {
      await softDeleteInvoice(userId, inv.id);
      setAllInvoices(prev => prev.filter(i => i.id !== inv.id));
      setDeletedInvoices(prev => [{ ...inv, deleted: true, deletedAt: new Date().toISOString().split('T')[0] }, ...prev]);
      setDeletingInvoiceId(null);
    }, 400);
  };

  const handleRestoreInvoice = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    await restoreInvoice(userId, inv.id);
    setDeletedInvoices(prev => prev.filter(i => i.id !== inv.id));
    setAllInvoices(prev => [{ ...inv, deleted: false, deletedAt: undefined }, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
  };

  // Quick-create customer handler
  const handleQuickCreateCustomer = async () => {
    if (!qcForm.name.trim()) return;
    setQcSaving(true);
    try {
      const id = await addCustomer(userId, {
        name: qcForm.name.trim(),
        phone: qcForm.phone,
        gstin: qcForm.gstin,
        state: qcForm.state,
        email: '', address: '', city: '', pincode: '', balance: 0,
      });
      const newCustomer: Customer = { id, name: qcForm.name.trim(), phone: qcForm.phone, gstin: qcForm.gstin, state: qcForm.state, email: '', address: '', city: '', pincode: '', balance: 0 };
      setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCustomerId(id);
      setShowQuickCreate(false);
      setQcForm({ name: '', phone: '', gstin: '', state: 'Maharashtra' });
    } finally {
      setQcSaving(false);
    }
  };

  // Open inventory picker (lazy-load items)
  const openInventoryPicker = async () => {
    if (!inventoryLoaded) {
      const data = await getInventoryItems(userId);
      setInventoryItems(data);
      setInventoryLoaded(true);
    }
    setInventorySearch('');
    setShowInventoryPicker(true);
  };

  // Select an inventory item → add as a line item
  const handlePickInventoryItem = (item: InventoryItem) => {
    const firstEmpty = items.find(i => !i.description.trim());
    const newLineItem: InvoiceItem = {
      id: firstEmpty?.id || Math.random().toString(36).substr(2, 9),
      description: item.name,
      hsnCode: item.hsnCode,
      quantity: 1,
      rate: item.sellingPrice,
      gstRate: item.gstRate,
    };
    if (firstEmpty) {
      setItems(prev => prev.map(i => i.id === firstEmpty.id ? newLineItem : i));
    } else {
      setItems(prev => [...prev, newLineItem]);
    }
    setShowInventoryPicker(false);
  };

  const handleFinalize = async () => {
    if (!selectedCustomerId) { setError('Please select a customer'); return; }
    if (items.every(i => !i.description.trim())) { setError('Add at least one item with a description'); return; }
    if (subTotal === 0) { setError('Invoice total cannot be zero'); return; }
    setSaving(true); setError(null);
    try {
      const cgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
      const sgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
      const igst = gstType === GSTType.IGST ? taxAmount : 0;
      const invoicePayload = {
        invoiceNumber, date: invoiceDate, customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '', items, gstType,
        totalBeforeTax: subTotal, cgst, sgst, igst, totalAmount: grandTotal,
        status: (editingInvoice?.status || 'Unpaid') as 'Paid' | 'Unpaid' | 'Partial',
        supplyType: effectiveSupplyType,
        reverseCharge,
        portCode: portCode || undefined,
        shippingBillNo: shippingBillNo || undefined,
        shippingBillDate: shippingBillDate || undefined,
        exportCountry: exportCountry || undefined,
      };

      if (editingInvoice) {
        await updateInvoice(userId, editingInvoice.id, invoicePayload);
        setAllInvoices(prev =>
          prev.map(inv => inv.id === editingInvoice.id ? { ...inv, ...invoicePayload } : inv)
        );
      } else {
        const invoiceId = await addInvoice(userId, invoicePayload);
        await addLedgerEntry(userId, {
          date: invoiceDate, type: 'Debit', amount: grandTotal,
          description: `Sale - ${invoiceNumber}`, invoiceId, customerId: selectedCustomerId
        });
        if (selectedCustomer) {
          await updateCustomer(userId, selectedCustomerId, { balance: (selectedCustomer.balance || 0) + grandTotal });
        }
        // If this invoice was converted from a quotation, mark the quotation as Converted
        if (sourceQuotationId) {
          await updateQuotation(userId, sourceQuotationId, {
            status: 'Converted',
            convertedInvoiceId: invoiceId,
          });
          setSourceQuotationId(null);
        }
      }
      setSaveSuccess(true); setMode('preview');
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError('Failed to save invoice. Please try again.');
    } finally { setSaving(false); }
  };

  // Build a temporary Invoice object from current form state (used for PDF before or after save)
  const buildCurrentInvoice = (): Invoice => {
    const cgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
    const sgst = gstType === GSTType.CGST_SGST ? taxAmount / 2 : 0;
    const igst = gstType === GSTType.IGST ? taxAmount : 0;
    return {
      id: 'preview',
      invoiceNumber,
      date: invoiceDate,
      customerId: selectedCustomerId,
      customerName: selectedCustomer?.name || '',
      items,
      gstType,
      totalBeforeTax: subTotal,
      cgst, sgst, igst,
      totalAmount: grandTotal,
      status: 'Unpaid',
    };
  };

  const openPDFModal = (invoice: Invoice, customer: Customer | null) => {
    setPdfModal({ open: true, invoice, customer });
  };

  const handleNewInvoice = () => {
    setEditingInvoice(null);
    setSelectedCustomerId(''); setItems([{ id: '1', description: '', hsnCode: '', quantity: 1, rate: 0, gstRate: 18 }]);
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setSupplyTypeOverride('');
    setReverseCharge(false);
    setPortCode(''); setShippingBillNo(''); setShippingBillDate(''); setExportCountry('');
    setSourceQuotationId(null);
    setSaveSuccess(false); setError(null); setMode('editing'); loadData();
  };

  const upiQrUrl = useMemo(() => {
    if (!profile.upiId) return '';
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(`upi://pay?pa=${profile.upiId}&pn=${encodeURIComponent(profile.name)}&am=${grandTotal}&cu=INR`)}`;
  }, [profile.upiId, profile.name, grandTotal]);

  // ── Loading state ──
  if (loading) {
    return (<div className="flex items-center justify-center min-h-[400px]"><div className="text-center"><Loader2 className="w-8 h-8 animate-spin text-profee-blue mx-auto mb-3" /><p className="text-sm font-bold text-slate-400 font-poppins">Loading invoice data...</p></div></div>);
  }

  // ── Template components (defined as inline JSX helpers) ──
  const modern2Template = (
    <div className="bg-white p-12 min-h-[1100px] flex flex-col space-y-12 w-full max-w-[850px] mx-auto print:shadow-none print:p-4 border border-slate-50 shadow-2xl rounded-[2.5rem]">
      <div className="flex justify-between items-start">
        <div className="space-y-6">
           <h1 className="text-7xl font-black tracking-tighter uppercase leading-none font-montserrat" style={{ color: profile.theme.primaryColor }}>Invoice</h1>
           <div className="space-y-1 text-[11px] font-bold font-poppins text-slate-400 uppercase tracking-[0.2em]">
              <p>Invoice# <span className="text-slate-900 ml-4 font-black">{invoiceNumber}</span></p>
              <p>Invoice Date <span className="text-slate-900 ml-4 font-black">{invoiceDate}</span></p>
           </div>
        </div>
        <div className="flex flex-col items-end">
           <div className="w-32 h-16 overflow-hidden mb-2">
             {profile.theme.logoUrl ? <img src={profile.theme.logoUrl} className="w-full h-full object-contain object-right" /> : <div className="w-full h-full bg-slate-50 rounded-xl"></div>}
           </div>
           <p className="text-xs font-black uppercase tracking-widest text-slate-900">{profile.name}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-8">
         <div className="p-10 rounded-[2rem] bg-slate-50 border border-slate-100 flex flex-col shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-6" style={{ color: profile.theme.primaryColor }}>Billed by</h3>
            <p className="text-base font-black text-slate-900">{profile.name}</p>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-[240px]">{profile.address}, {profile.city}, {profile.state} - {profile.pincode}</p>
            <div className="mt-6 flex gap-8 border-t border-slate-200 pt-4">
               <div className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">GSTIN</span><span className="text-[10px] font-black text-slate-900">{profile.gstin}</span></div>
               <div className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PAN</span><span className="text-[10px] font-black text-slate-900">{profile.pan}</span></div>
            </div>
         </div>
         <div className="p-10 rounded-[2rem] bg-slate-50 border border-slate-100 flex flex-col shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-[0.3em] mb-6" style={{ color: profile.theme.primaryColor }}>Billed to</h3>
            <p className="text-base font-black text-slate-900">{selectedCustomer?.name || 'Party Not Selected'}</p>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-[240px]">{selectedCustomer?.address || '---'}, {selectedCustomer?.city || '---'}, {selectedCustomer?.state || '---'} - {selectedCustomer?.pincode || '---'}</p>
            <div className="mt-6 flex gap-8 border-t border-slate-200 pt-4">
               <div className="flex flex-col"><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">GSTIN</span><span className="text-[10px] font-black text-slate-900">{selectedCustomer?.gstin || '---'}</span></div>
            </div>
         </div>
      </div>
      <div className="flex-1">
        <table className="w-full text-left border-collapse rounded-[2rem] overflow-hidden shadow-sm border border-slate-100">
          <thead><tr className="text-white text-[11px] font-black uppercase tracking-widest" style={{ backgroundColor: profile.theme.primaryColor }}>
            <th className="px-10 py-6">Item description</th><th className="px-4 py-6 text-center">HSN</th><th className="px-4 py-6 text-center">Qty.</th><th className="px-4 py-6 text-center">GST</th><th className="px-10 py-6 text-right">Amount</th>
          </tr></thead>
          <tbody className="text-xs divide-y divide-slate-100 bg-slate-50/20">
            {items.map((item, idx) => (
              <tr key={item.id} className="font-medium text-slate-700 hover:bg-white transition-colors">
                <td className="px-10 py-6">{idx + 1}. {item.description || 'No description'}</td>
                <td className="px-4 py-6 text-center text-slate-400">{item.hsnCode || '---'}</td>
                <td className="px-4 py-6 text-center font-black">{item.quantity}</td>
                <td className="px-4 py-6 text-center text-slate-400">{item.gstRate}%</td>
                <td className="px-10 py-6 text-right font-black">₹{(item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-20 items-start">
         <div className="space-y-12">
            <div className="flex gap-10 items-start">
               <div className="space-y-5 flex-1">
                  <h4 className="text-[11px] font-black uppercase tracking-[0.3em]" style={{ color: profile.theme.primaryColor }}>Bank & Payments</h4>
                  <div className="text-[10px] font-bold text-slate-400 space-y-2.5 uppercase tracking-tighter">
                     <p className="flex justify-between">A/c Holder <span className="text-slate-900 ml-4 font-black">{profile.name}</span></p>
                     <p className="flex justify-between">A/c Number <span className="text-slate-900 ml-4 font-black">{profile.accountNumber}</span></p>
                     <p className="flex justify-between">IFSC Code <span className="text-slate-900 ml-4 font-black">{profile.ifscCode}</span></p>
                     <p className="flex justify-between">Bank Name <span className="text-slate-900 ml-4 font-black">{profile.bankName}</span></p>
                     <p className="flex justify-between pt-3 border-t border-slate-100">UPI ID <span className="ml-4 font-black" style={{ color: profile.theme.primaryColor }}>{profile.upiId}</span></p>
                  </div>
               </div>
               {profile.upiId && (<div className="flex flex-col items-center"><span className="text-[8px] font-black text-slate-300 uppercase mb-3 tracking-widest">Scan to Pay</span><div className="p-4 bg-white border border-slate-100 shadow-lg rounded-2xl"><img src={upiQrUrl} className="w-24 h-24" /></div></div>)}
            </div>
            <div className="space-y-4">
               <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-emerald-500">Terms and Conditions</h4>
               <p className="text-[10px] text-slate-400 leading-relaxed font-medium italic whitespace-pre-line">{profile.termsAndConditions}</p>
            </div>
         </div>
         <div className="space-y-10">
            <div className="space-y-4 text-sm font-bold text-slate-500 font-poppins px-6">
               <div className="flex justify-between"><span>Sub Total</span><span className="text-slate-900 font-black">₹{subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
               <div className="flex justify-between text-emerald-500 font-black"><span>Tax (GST)</span><span>₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
               {gstType === GSTType.CGST_SGST ? (<>
                 <div className="flex justify-between text-xs font-medium text-slate-400"><span>CGST ({items[0]?.gstRate/2}%)</span><span>₹{(taxAmount/2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                 <div className="flex justify-between text-xs font-medium text-slate-400"><span>SGST ({items[0]?.gstRate/2}%)</span><span>₹{(taxAmount/2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
               </>) : (<div className="flex justify-between text-xs font-medium text-slate-400"><span>IGST ({items[0]?.gstRate}%)</span><span>₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>)}
            </div>
            <div className="pt-8 border-t-2 border-slate-100 flex justify-between items-center px-6 gap-4">
               <span className="text-2xl font-black uppercase tracking-tighter text-slate-900 font-montserrat shrink-0">Total</span>
               <span className="text-4xl font-black text-slate-900 font-montserrat tracking-tighter text-right min-w-0">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 font-poppins space-y-2 shadow-sm">
               <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Amount in Words</p>
               <p className="text-base font-black text-slate-800 leading-tight">{numberToWords(grandTotal)} Only</p>
            </div>
         </div>
      </div>
      <div className="pt-20 text-center border-t border-slate-50 mt-auto">
         <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">Bill generated via <span className="text-slate-900">BillHippo Smart OS</span> • {profile.email} • {profile.phone}</p>
      </div>
    </div>
  );

  const modern1Template = (
    <div className="bg-white w-full max-w-[860px] mx-auto border border-slate-100 print:shadow-none print:border-none shadow-2xl rounded-[2rem] overflow-hidden" style={{ fontFamily: profile.theme.fontFamily }}>

      {/* ── Header ── */}
      <div className="px-10 pt-10">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="w-[68px] h-[68px] rounded-xl overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center flex-shrink-0">
            {profile.theme.logoUrl
              ? <img src={profile.theme.logoUrl} className="w-full h-full object-contain" alt="logo" />
              : <span className="text-2xl font-black" style={{ color: profile.theme.primaryColor }}>{profile.name.charAt(0)}</span>
            }
          </div>
          {/* Centre title */}
          <div className="text-center">
            <h1 className="text-[52px] font-black tracking-tight leading-none font-montserrat" style={{ color: profile.theme.primaryColor }}>Invoice</h1>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.22em] mt-1">GST Compliant Tax Invoice</p>
          </div>
          {/* Right meta */}
          <div className="space-y-2 text-right">
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Invoice #</p>
              <p className="text-sm font-black text-slate-900">{invoiceNumber}</p>
            </div>
            <div>
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Invoice Date</p>
              <p className="text-sm font-black text-slate-900">{invoiceDate}</p>
            </div>
          </div>
        </div>
        {/* Primary colour divider */}
        <div className="h-[3px] rounded-full mt-6" style={{ backgroundColor: profile.theme.primaryColor }}></div>
      </div>

      <div className="px-10 pb-10 flex flex-col space-y-5 mt-6">

        {/* ── Billed by / Billed to ── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl" style={{ backgroundColor: `${profile.theme.primaryColor}12` }}>
            <p className="text-[8px] font-black uppercase tracking-[0.28em] mb-3" style={{ color: profile.theme.primaryColor }}>Billed by</p>
            <p className="text-[13px] font-black text-slate-900">{profile.name}</p>
            {profile.tagline && <p className="text-[9px] text-slate-400 italic mt-0.5">{profile.tagline}</p>}
            <p className="text-[10px] text-slate-500 leading-relaxed mt-1">{profile.address}, {profile.city}, {profile.state} – {profile.pincode}</p>
            <div className="flex gap-6 mt-3 pt-3 border-t border-slate-200/50">
              <div><p className="text-[7px] font-bold text-slate-400 uppercase">GSTIN</p><p className="text-[10px] font-black text-slate-800">{profile.gstin || '—'}</p></div>
              <div><p className="text-[7px] font-bold text-slate-400 uppercase">PAN</p><p className="text-[10px] font-black text-slate-800">{profile.pan || '—'}</p></div>
            </div>
          </div>
          <div className="p-5 rounded-2xl" style={{ backgroundColor: `${profile.theme.primaryColor}12` }}>
            <p className="text-[8px] font-black uppercase tracking-[0.28em] mb-3" style={{ color: profile.theme.primaryColor }}>Billed to</p>
            <p className="text-[13px] font-black text-slate-900">{selectedCustomer?.name || 'Party Name'}</p>
            <p className="text-[10px] text-slate-500 leading-relaxed mt-1">{selectedCustomer?.address || '—'}, {selectedCustomer?.city || '—'}, {selectedCustomer?.state || '—'} – {selectedCustomer?.pincode || '—'}</p>
            {selectedCustomer?.phone && <p className="text-[10px] text-slate-500">{selectedCustomer.phone}</p>}
            <div className="flex gap-6 mt-3 pt-3 border-t border-slate-200/50">
              <div><p className="text-[7px] font-bold text-slate-400 uppercase">GSTIN</p><p className="text-[10px] font-black text-slate-800">{selectedCustomer?.gstin || '—'}</p></div>
            </div>
          </div>
        </div>

        {/* ── Place of Supply / Country of Supply ── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="px-5 py-3 rounded-xl border border-slate-100 bg-slate-50/70">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Place of Supply</p>
            <p className="text-[11px] font-black text-slate-800 mt-0.5">{selectedCustomer?.state || profile.state}</p>
          </div>
          <div className="px-5 py-3 rounded-xl border border-slate-100 bg-slate-50/70">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Country of Supply</p>
            <p className="text-[11px] font-black text-slate-800 mt-0.5">India</p>
          </div>
        </div>

        {/* ── Items Table ── */}
        <div className="rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
          <table className="w-full text-left border-collapse text-[10px]">
            <thead>
              <tr className="text-white font-black uppercase tracking-wide" style={{ backgroundColor: profile.theme.primaryColor }}>
                <th className="px-3 py-3 w-7">#</th>
                <th className="px-3 py-3">Item Description</th>
                <th className="px-2 py-3 text-center">HSN/SAC</th>
                <th className="px-2 py-3 text-center">Qty</th>
                <th className="px-2 py-3 text-center">GST%</th>
                <th className="px-3 py-3 text-right">Taxable Amt</th>
                {gstType === GSTType.CGST_SGST ? (
                  <>
                    <th className="px-2 py-3 text-right">SGST</th>
                    <th className="px-2 py-3 text-right">CGST</th>
                  </>
                ) : (
                  <th className="px-2 py-3 text-right" colSpan={2}>IGST</th>
                )}
                <th className="px-3 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => {
                const taxable = item.quantity * item.rate;
                const itemTax = taxable * item.gstRate / 100;
                const halfTax = itemTax / 2;
                return (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="px-3 py-3 text-slate-400 font-bold">{idx + 1}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{item.description || 'No description'}</td>
                    <td className="px-2 py-3 text-center text-slate-500">{item.hsnCode || '—'}</td>
                    <td className="px-2 py-3 text-center font-black text-slate-800">{item.quantity}</td>
                    <td className="px-2 py-3 text-center text-slate-500">{item.gstRate}%</td>
                    <td className="px-3 py-3 text-right text-slate-700">₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    {gstType === GSTType.CGST_SGST ? (
                      <>
                        <td className="px-2 py-3 text-right text-slate-600">₹{halfTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="px-2 py-3 text-right text-slate-600">₹{halfTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </>
                    ) : (
                      <td className="px-2 py-3 text-right text-slate-600" colSpan={2}>₹{itemTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    )}
                    <td className="px-3 py-3 text-right font-black text-slate-900">₹{(taxable + itemTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Bank Details (left) + Totals (right) ── */}
        <div className="grid grid-cols-2 gap-8 pt-1">
          {/* Left column */}
          <div className="space-y-5">
            {/* Bank details */}
            <div>
              <p className="text-[8px] font-black uppercase tracking-[0.28em] mb-3" style={{ color: profile.theme.primaryColor }}>Bank & Payment Details</p>
              <div className="flex gap-4 items-start">
                <div className="flex-1 space-y-1.5 text-[10px]">
                  {profile.bankName && <div className="flex justify-between"><span className="text-slate-400 font-bold">Bank</span><span className="text-slate-800 font-bold">{profile.bankName}</span></div>}
                  {profile.accountNumber && <div className="flex justify-between"><span className="text-slate-400 font-bold">Account No.</span><span className="text-slate-800 font-bold">{profile.accountNumber}</span></div>}
                  {profile.ifscCode && <div className="flex justify-between"><span className="text-slate-400 font-bold">IFSC</span><span className="text-slate-800 font-bold">{profile.ifscCode}</span></div>}
                  {profile.upiId && <div className="flex justify-between pt-1.5 border-t border-slate-100"><span className="text-slate-400 font-bold">UPI ID</span><span className="font-black" style={{ color: profile.theme.primaryColor }}>{profile.upiId}</span></div>}
                </div>
                {profile.upiId && upiQrUrl && (
                  <div className="flex-shrink-0 flex flex-col items-center">
                    <p className="text-[6px] font-black text-slate-300 uppercase tracking-widest mb-1">Scan to Pay</p>
                    <div className="p-1.5 border border-slate-100 rounded-xl bg-white shadow-sm">
                      <img src={upiQrUrl} className="w-[56px] h-[56px]" alt="UPI QR" />
                    </div>
                  </div>
                )}
              </div>
            </div>
            {/* Terms */}
            {profile.termsAndConditions && (
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.28em] mb-2" style={{ color: profile.theme.primaryColor }}>Terms & Conditions</p>
                <p className="text-[9px] text-slate-500 leading-relaxed whitespace-pre-line">{profile.termsAndConditions}</p>
              </div>
            )}
            {/* Notes */}
            {profile.defaultNotes && (
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.28em] mb-2" style={{ color: profile.theme.primaryColor }}>Additional Notes</p>
                <p className="text-[9px] text-slate-500 italic leading-relaxed">{profile.defaultNotes}</p>
              </div>
            )}
          </div>

          {/* Right column — Totals */}
          <div className="space-y-0.5 text-[11px] font-bold">
            <div className="flex justify-between py-2.5 border-b border-slate-100">
              <span className="text-slate-400">Sub Total</span>
              <span className="text-slate-800">₹{subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            {gstType === GSTType.CGST_SGST ? (
              <>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">CGST</span>
                  <span className="text-slate-700">₹{(taxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">SGST</span>
                  <span className="text-slate-700">₹{(taxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between py-2">
                <span className="text-slate-400">IGST</span>
                <span className="text-slate-700">₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-4 border-t-2" style={{ borderColor: profile.theme.primaryColor }}>
              <span className="text-[22px] font-black tracking-tight font-montserrat" style={{ color: profile.theme.primaryColor }}>Total</span>
              <span className="text-[34px] font-black tracking-tighter font-montserrat" style={{ color: profile.theme.primaryColor }}>₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="pt-3">
              <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Invoice Total (in words)</p>
              <p className="text-[9px] font-black text-slate-700 italic leading-snug mt-1">{numberToWords(grandTotal)} Only</p>
            </div>
          </div>
        </div>

        {/* ── Contact + Signature footer ── */}
        <div className="flex justify-between items-end pt-5 border-t border-slate-100">
          <div className="text-[9px] text-slate-400 font-medium space-y-0.5">
            {profile.email && <p>✉ {profile.email}</p>}
            {profile.phone && <p>✆ {profile.phone}</p>}
          </div>
          <div className="text-right">
            <div className="w-28 border-t border-slate-200 ml-auto mb-1"></div>
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Authorised Signatory</p>
            <p className="text-[9px] font-black text-slate-700 mt-0.5">{profile.name}</p>
          </div>
        </div>

      </div>
    </div>
  );

  const invoiceTemplate = profile.theme.templateId === 'modern-2' ? modern2Template : modern1Template;

  // ═══════════════════════════════════════════
  //  LIST VIEW: Searchable table of all invoices
  // ═══════════════════════════════════════════
  if (mode === 'list') {
    const q = searchQuery.toLowerCase().trim();
    const filteredInvoices = q
      ? allInvoices.filter(inv =>
          inv.invoiceNumber.toLowerCase().includes(q) ||
          inv.customerName.toLowerCase().includes(q) ||
          formatDate(inv.date).includes(q) ||
          inv.date.includes(q) ||
          inv.status.toLowerCase().includes(q)
        )
      : allInvoices;

    return (
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 pb-20">
        {/* ── Header ── */}
        <div className="flex justify-between items-end mb-4">
          <div>
            <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Invoice Maker</h1>
            <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">
              {allInvoices.length} invoice{allInvoices.length !== 1 ? 's' : ''}
              {q ? ` · ${filteredInvoices.length} matching` : ''}
            </p>
          </div>
          <button
            onClick={handleNewInvoice}
            className="bg-profee-blue text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95 transition-all font-poppins"
          >
            <Plus size={20} /> Create Invoice
          </button>
        </div>

        {allInvoices.length === 0 ? (
          <div className="bg-white rounded-[2.5rem] p-16 premium-shadow border border-slate-50 text-center">
            <div className="w-24 h-24 bg-indigo-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8">
              <FileText className="text-profee-blue" size={40} />
            </div>
            <h3 className="text-2xl font-bold font-poppins text-slate-900 mb-3">No invoices yet</h3>
            <p className="text-sm text-slate-400 font-medium font-poppins mb-8 max-w-md mx-auto">
              Create your first invoice to start billing your customers. It only takes a minute.
            </p>
            <button
              onClick={handleNewInvoice}
              className="bg-profee-blue text-white px-12 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95 transition-all font-poppins mx-auto"
            >
              <Plus size={20} /> Create Your First Invoice
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] premium-shadow border border-slate-50 overflow-hidden">
            {/* ── Search bar ── */}
            <div className="px-8 pt-8 pb-5 border-b border-slate-50">
              <div className="relative max-w-md">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                <input
                  type="text"
                  placeholder="Search by invoice #, party, date or status…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-5 py-3.5 bg-slate-50 rounded-2xl text-sm font-medium text-slate-700 placeholder-slate-300 border-none focus:ring-2 ring-indigo-50 font-poppins"
                />
              </div>
            </div>

            {/* ── Table ── */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-poppins">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Date</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">Invoice #</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Party Name</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Taxable Amt</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Tax</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">Invoice Value</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-16 text-center text-sm text-slate-400 font-medium">
                        No invoices match &ldquo;{searchQuery}&rdquo;
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv, idx) => {
                      const tax = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
                      const custObj = customers.find(c => c.id === inv.customerId) || null;
                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-indigo-50/30 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'} ${deletingInvoiceId === inv.id ? 'deleting-item' : ''}`}
                        >
                          <td className="px-6 py-4 text-sm font-bold text-slate-600 whitespace-nowrap">
                            {formatDate(inv.date)}
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-slate-900 whitespace-nowrap">
                            {inv.invoiceNumber}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-700 max-w-[180px] truncate">
                            {inv.customerName}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-700 text-right whitespace-nowrap">
                            {inr(inv.totalBeforeTax)}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-emerald-600 text-right whitespace-nowrap">
                            {inr(tax)}
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-slate-900 text-right whitespace-nowrap">
                            {inr(inv.totalAmount)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-block text-[10px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${
                              inv.status === 'Paid'    ? 'bg-emerald-100 text-emerald-700' :
                              inv.status === 'Partial' ? 'bg-amber-100 text-amber-700'    :
                                                         'bg-rose-100 text-rose-700'
                            }`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              {/* Preview PDF */}
                              <button
                                onClick={() => openPDFModal(inv, custObj)}
                                title="Preview Invoice PDF"
                                className="p-2 rounded-xl bg-indigo-50 text-profee-blue hover:bg-profee-blue hover:text-white transition-all"
                              >
                                <Eye size={15} />
                              </button>
                              {/* Edit */}
                              <button
                                onClick={() => handleEditInvoice(inv)}
                                title="Edit Invoice"
                                className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-700 hover:text-white transition-all"
                              >
                                <Pencil size={15} />
                              </button>
                              {/* Download PDF directly */}
                              <button
                                onClick={() => setDownloadTarget({ invoice: inv, customer: custObj })}
                                title="Download PDF"
                                className="p-2 rounded-xl bg-indigo-50 text-profee-blue hover:bg-profee-blue hover:text-white transition-all"
                              >
                                <Download size={15} />
                              </button>
                              {/* Delete (soft) */}
                              <button
                                onClick={e => handleDeleteInvoice(inv, e)}
                                title="Delete Invoice"
                                className="p-2 rounded-xl bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white transition-all"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* ── Footer summary ── */}
            {filteredInvoices.length > 0 && (
              <div className="px-8 py-5 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center gap-8 font-poppins">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
                </span>
                <span className="text-[10px] font-bold text-slate-500">
                  Total Value: <span className="text-slate-900 font-black">{inr(filteredInvoices.reduce((s, i) => s + i.totalAmount, 0))}</span>
                </span>
                <span className="text-[10px] font-bold text-slate-500">
                  Total Tax: <span className="text-emerald-700 font-black">{inr(filteredInvoices.reduce((s, i) => s + (i.cgst || 0) + (i.sgst || 0) + (i.igst || 0), 0))}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Deleted Invoices Archive ── */}
        {deletedInvoices.length > 0 && (
          <div className="bg-white rounded-[2.5rem] premium-shadow border border-rose-100 overflow-hidden">
            <button
              onClick={() => setShowDeletedSection(v => !v)}
              className="w-full flex items-center justify-between px-8 py-5 hover:bg-rose-50/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ArchiveX size={18} className="text-rose-400" />
                <span className="text-sm font-bold font-poppins text-rose-500">
                  Deleted Invoices ({deletedInvoices.length})
                </span>
                <span className="text-xs font-medium text-rose-300 font-poppins">
                  · Invoice numbers reserved permanently
                </span>
              </div>
              <span className="text-xs font-bold text-rose-300 font-poppins">
                {showDeletedSection ? 'Hide ▲' : 'Show ▼'}
              </span>
            </button>
            {showDeletedSection && (
              <div className="overflow-x-auto border-t border-rose-100">
                <table className="w-full text-left font-poppins">
                  <thead>
                    <tr className="bg-rose-50 border-b border-rose-100">
                      <th className="px-6 py-3 text-[10px] font-black text-rose-300 uppercase tracking-widest">Deleted On</th>
                      <th className="px-6 py-3 text-[10px] font-black text-rose-300 uppercase tracking-widest">Invoice #</th>
                      <th className="px-6 py-3 text-[10px] font-black text-rose-300 uppercase tracking-widest">Party</th>
                      <th className="px-6 py-3 text-[10px] font-black text-rose-300 uppercase tracking-widest text-right">Amount</th>
                      <th className="px-6 py-3 text-[10px] font-black text-rose-300 uppercase tracking-widest text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rose-50">
                    {deletedInvoices.map(inv => {
                      const custObj = customers.find(c => c.id === inv.customerId) || null;
                      return (
                        <tr key={inv.id} className="bg-white opacity-70 hover:opacity-100 transition-opacity">
                          <td className="px-6 py-3 text-sm text-slate-400">{formatDate(inv.deletedAt || inv.date)}</td>
                          <td className="px-6 py-3 text-sm font-bold text-slate-400 line-through">{inv.invoiceNumber}</td>
                          <td className="px-6 py-3 text-sm text-slate-400">{inv.customerName}</td>
                          <td className="px-6 py-3 text-sm font-bold text-slate-400 text-right">{inr(inv.totalAmount)}</td>
                          <td className="px-6 py-3">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => openPDFModal(inv, custObj)}
                                title="Preview Invoice"
                                className="p-1.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-600 hover:text-white transition-all"
                              >
                                <Eye size={13} />
                              </button>
                              <button
                                onClick={e => handleRestoreInvoice(inv, e)}
                                title="Restore Invoice"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all text-xs font-bold"
                              >
                                <RotateCcw size={12} /> Restore
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PDF Preview Modal */}
        {pdfModal.open && pdfModal.invoice && (
          <PDFPreviewModal
            open={pdfModal.open}
            onClose={() => setPdfModal({ open: false, invoice: null, customer: null })}
            document={
              <InvoicePDF
                invoice={pdfModal.invoice}
                business={profile}
                customer={pdfModal.customer || { id: '', name: pdfModal.invoice.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 }}
              />
            }
            fileName={`Invoice-${pdfModal.invoice.invoiceNumber.replace(/\//g, '-')}.pdf`}
          />
        )}

        {/* Direct download — renders PDF invisibly, auto-downloads, then unmounts */}
        {downloadTarget && (
          <PDFDirectDownload
            document={
              <InvoicePDF
                invoice={downloadTarget.invoice}
                business={profile}
                customer={downloadTarget.customer || { id: '', name: downloadTarget.invoice.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 }}
              />
            }
            fileName={`Invoice-${downloadTarget.invoice.invoiceNumber.replace(/\//g, '-')}.pdf`}
            onDone={() => setDownloadTarget(null)}
          />
        )}

        {/* Delete confirmation modal */}
        <DeleteConfirmationModal
          isOpen={deleteConfirmInvoice !== null}
          title={`Delete Invoice ${deleteConfirmInvoice?.invoiceNumber ?? ''}?`}
          message="This invoice will be moved to the deleted archive. The invoice number will not be reused."
          onCancel={() => setDeleteConfirmInvoice(null)}
          onConfirm={handleDeleteInvoiceConfirmed}
        />
      </div>
    );
  }

  // ═══════════════════════════════════════════
  //  PREVIEW VIEW: Formatted invoice
  // ═══════════════════════════════════════════
  if (mode === 'preview') {
    return (
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 font-poppins">
        <div className="flex justify-between items-center mb-6 no-print">
          <div className="flex items-center gap-4">
            <button onClick={() => setMode('list')} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors"><ArrowLeft size={18} /> All Invoices</button>
            <div className="w-px h-5 bg-slate-200" />
            <button onClick={() => setMode('editing')} className="flex items-center gap-2 text-profee-blue font-bold text-sm hover:underline"><Edit3 size={18} /> Edit Invoice</button>
          </div>
          <div className="flex gap-4">
             {saveSuccess && <div className="flex items-center gap-2 text-emerald-500 px-4"><CheckCircle size={18} /><span className="text-sm font-bold">Invoice Saved!</span></div>}
             <button onClick={handleNewInvoice} className="bg-white border border-slate-200 px-8 py-4 rounded-2xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><Plus size={18} /> New Invoice</button>
             <button onClick={() => window.print()} className="bg-white border border-slate-200 px-10 py-4 rounded-2xl text-xs font-bold flex items-center gap-2 hover:bg-slate-50 transition-all shadow-sm"><Printer size={18} /> Print A4</button>
             <button
               onClick={() => openPDFModal(buildCurrentInvoice(), selectedCustomer || null)}
               className="bg-profee-blue text-white px-10 py-4 rounded-2xl text-xs font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
             >
               <Download size={18} /> Download PDF
             </button>
          </div>
        </div>
        <div className="flex justify-center bg-slate-100 p-12 min-h-screen rounded-[3rem] no-print"><div className="print-area">{invoiceTemplate}</div></div>
        <div className="hidden print:block">{invoiceTemplate}</div>
        <style>{`@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; padding: 0 !important; width: 100%; box-shadow: none !important; background: white !important; } .no-print { display: none !important; } @page { size: A4; margin: 10mm; } }`}</style>

        {/* PDF Preview Modal */}
        {pdfModal.open && pdfModal.invoice && (
          <PDFPreviewModal
            open={pdfModal.open}
            onClose={() => setPdfModal({ open: false, invoice: null, customer: null })}
            document={
              <InvoicePDF
                invoice={pdfModal.invoice}
                business={profile}
                customer={pdfModal.customer || { id: '', name: pdfModal.invoice.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 }}
              />
            }
            fileName={`Invoice-${pdfModal.invoice.invoiceNumber.replace(/\//g, '-')}.pdf`}
          />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  //  EDITING VIEW: Invoice creation form
  // ═══════════════════════════════════════════
  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 pb-20">
      <div className="flex justify-between items-end mb-4">
        <div className="flex items-center gap-4">
          <button onClick={() => setMode('list')} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors font-poppins"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-4xl font-bold font-poppins text-slate-900 tracking-tight">Invoice Maker</h1>
            <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">
              {editingInvoice ? `Editing ${editingInvoice.invoiceNumber}` : `New Bill Entry \u2022 ${invoiceNumber}`}
            </p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
           {error && <span className="text-sm font-bold text-rose-500 font-poppins">{error}</span>}
           <button onClick={() => setMode('preview')} className="bg-white border border-slate-200 text-slate-700 px-10 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-slate-50 transition-all font-poppins"><Eye size={20} /> Preview</button>
           <button onClick={handleFinalize} disabled={saving} className="bg-profee-blue text-white px-12 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-xl shadow-indigo-100 hover:scale-105 transition-all font-poppins disabled:opacity-50">
             {saving ? <><Loader2 size={20} className="animate-spin" /> Saving...</> : editingInvoice ? <><Save size={20} /> Update Invoice</> : <><Save size={20} /> Finalize Bill</>}
           </button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8 font-poppins">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="space-y-3 relative">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Party / Customer *</label>
                 {/* Custom customer dropdown */}
                 <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setShowCustomerDropdown(v => !v); setCustomerSearch(''); setError(null); }}
                      className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50 flex items-center justify-between text-left"
                    >
                      <span className={selectedCustomer ? 'text-slate-800' : 'text-slate-400'}>
                        {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.state})` : 'Select Customer…'}
                      </span>
                      <ChevronDown size={18} className="text-slate-300 flex-shrink-0" />
                    </button>
                    {showCustomerDropdown && (
                      <div className="absolute z-30 mt-2 w-full bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                        {/* Search */}
                        <div className="p-3 border-b border-slate-50">
                          <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                            <input
                              autoFocus
                              type="text"
                              placeholder="Search customers…"
                              value={customerSearch}
                              onChange={e => setCustomerSearch(e.target.value)}
                              className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 rounded-xl border-none focus:ring-2 ring-indigo-50 font-medium"
                            />
                          </div>
                        </div>
                        {/* Create new option */}
                        <button
                          type="button"
                          onClick={() => { setShowCustomerDropdown(false); setShowQuickCreate(true); }}
                          className="w-full flex items-center gap-3 px-5 py-3 text-sm font-bold text-profee-blue hover:bg-indigo-50 transition-colors border-b border-slate-50"
                        >
                          <UserPlus size={16} /> + Create New Customer
                        </button>
                        {/* Customer list */}
                        <div className="max-h-52 overflow-y-auto">
                          {customers
                            .filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.state || '').toLowerCase().includes(customerSearch.toLowerCase()))
                            .map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => { setSelectedCustomerId(c.id); setShowCustomerDropdown(false); setCustomerSearch(''); setError(null); }}
                                className={`w-full flex items-center justify-between px-5 py-3 text-sm hover:bg-indigo-50 transition-colors text-left ${c.id === selectedCustomerId ? 'bg-indigo-50 text-profee-blue font-bold' : 'font-medium text-slate-700'}`}
                              >
                                <span>{c.name}</span>
                                <span className="text-xs text-slate-400">{c.state}</span>
                              </button>
                            ))
                          }
                          {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase())).length === 0 && customerSearch && (
                            <p className="px-5 py-3 text-xs text-slate-400 italic">No customers found. Create one above.</p>
                          )}
                        </div>
                      </div>
                    )}
                 </div>
              </div>
              <div className="space-y-3">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Invoice Number</label>
                 <input className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
              </div>
              <div className="space-y-3">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-4">Invoice Date</label>
                 <input type="date" className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700 focus:ring-2 ring-indigo-50" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-8 font-poppins">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold flex items-center gap-3"><Plus className="text-profee-blue" size={22} /> Particulars</h3>
              <div className="flex items-center gap-3">
                {profile.businessType === 'trading' && (
                  <button
                    type="button"
                    onClick={openInventoryPicker}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-xs font-bold border border-amber-200"
                  >
                    <Package size={14} /> Pick from Inventory
                  </button>
                )}
                <div className="px-5 py-2 rounded-xl bg-indigo-50 text-profee-blue text-[10px] font-black uppercase">Tax Logic: {gstType}</div>
              </div>
            </div>
            {hsnWarning && (
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-700 font-medium">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠</span>
                <span>{hsnWarning}</span>
              </div>
            )}
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-3 items-end animate-in fade-in duration-300">
                  <div className="col-span-4 space-y-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-4">Description</label><input placeholder="Product or service" className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 text-sm font-medium" value={item.description} onChange={e => handleItemChange(item.id, 'description', e.target.value)} /></div>
                  <div className="col-span-2 space-y-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-3">HSN/SAC</label><input placeholder="e.g. 9954" className="w-full bg-slate-50 border-none rounded-2xl px-3 py-3 text-sm font-medium font-mono" value={item.hsnCode} onChange={e => handleItemChange(item.id, 'hsnCode', e.target.value)} /></div>
                  <div className="col-span-1 space-y-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2">Qty</label><input type="number" className="w-full bg-slate-50 border-none rounded-2xl px-2 py-3 text-sm font-black text-center" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)} /></div>
                  <div className="col-span-2 space-y-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-4">Rate (₹)</label><input type="number" className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-black text-center text-profee-blue" value={item.rate} onChange={e => handleItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)} /></div>
                  <div className="col-span-2 space-y-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-4">GST %</label><select className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-center appearance-none" value={item.gstRate} onChange={e => handleItemChange(item.id, 'gstRate', parseFloat(e.target.value))}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></div>
                  <div className="col-span-1 pb-2 flex justify-center"><button onClick={() => handleRemoveItem(item.id)} className="p-3 text-rose-400 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={18} /></button></div>
                </div>
              ))}
            </div>
            <button onClick={handleAddItem} className="flex items-center gap-2 font-bold text-sm px-6 py-3 rounded-2xl bg-slate-50 text-profee-blue hover:bg-indigo-50 transition-all border border-dashed border-indigo-200"><Plus size={18} /> Add Line Item</button>
          </div>

          {/* ── GST Classification (GSTR-1 compliance) ── */}
          {selectedCustomerId && (
            <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-6 font-poppins">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-3">
                <span className="text-profee-blue">⬡</span> GST Classification
                <span className="text-[9px] font-bold bg-indigo-50 text-indigo-500 px-2 py-1 rounded-full">GSTR-1</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Supply Type</label>
                  <select
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 text-sm font-bold"
                    value={supplyTypeOverride}
                    onChange={e => setSupplyTypeOverride(e.target.value as SupplyType | '')}
                  >
                    <option value="">Auto ({autoSupplyType})</option>
                    <option value="B2B">B2B — Registered Buyer</option>
                    <option value="B2CS">B2CS — Unregistered (Small / Intra-state)</option>
                    <option value="B2CL">B2CL — Unregistered (Large &gt;₹2.5L / Inter-state)</option>
                    <option value="SEZWP">SEZ — With Payment of Tax</option>
                    <option value="SEZWOP">SEZ — Without Payment of Tax</option>
                    <option value="EXPWP">Export — With Payment of Tax</option>
                    <option value="EXPWOP">Export — Without Payment of Tax</option>
                    <option value="DE">Deemed Export</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Reverse Charge</label>
                  <div className="flex items-center gap-4 bg-slate-50 rounded-2xl px-5 py-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="reverseCharge" checked={!reverseCharge} onChange={() => setReverseCharge(false)} className="accent-indigo-600" />
                      <span className="text-sm font-bold text-slate-700">No (N)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="reverseCharge" checked={reverseCharge} onChange={() => setReverseCharge(true)} className="accent-indigo-600" />
                      <span className="text-sm font-bold text-slate-700">Yes (Y)</span>
                    </label>
                  </div>
                </div>
              </div>
              {(isExportSupply || isSEZSupply) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-50">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Port Code</label>
                    <input
                      placeholder="e.g. INMAA1 (6 chars)"
                      maxLength={6}
                      className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 text-sm font-medium font-mono"
                      value={portCode}
                      onChange={e => setPortCode(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Shipping Bill No.</label>
                    <input
                      placeholder="e.g. 1234567"
                      className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 text-sm font-medium"
                      value={shippingBillNo}
                      onChange={e => setShippingBillNo(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Shipping Bill Date</label>
                    <input
                      type="date"
                      className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 text-sm font-medium"
                      value={shippingBillDate}
                      onChange={e => setShippingBillDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-4">Export Country</label>
                    <input
                      placeholder="e.g. USA, UAE, WLD (for all)"
                      className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 text-sm font-medium"
                      value={exportCountry}
                      onChange={e => setExportCountry(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <p className="text-[10px] text-slate-400 font-medium">
                Supply type: <span className="font-bold text-slate-600">{effectiveSupplyType}</span>
                {!supplyTypeOverride && ' (auto-detected from customer GSTIN & state)'}
              </p>
            </div>
          )}
        </div>
        <div className="lg:col-span-4 space-y-8 font-poppins">
           <div className="bg-slate-900 rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><CheckCircle size={100} /></div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-8">Summary Preview</p>
              <div className="space-y-4 mb-10">
                 <div className="flex justify-between items-center opacity-80"><span className="text-sm font-medium">Sub Total</span><span className="text-base font-bold">₹{subTotal.toLocaleString()}</span></div>
                 <div className="flex justify-between items-center text-emerald-400"><span className="text-sm font-medium">Tax Amount</span><span className="text-base font-bold">+ ₹{taxAmount.toLocaleString()}</span></div>
              </div>
              <div className="pt-8 border-t border-white/10 space-y-2"><p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Grand Total</p><h3 className="text-4xl font-black">₹{grandTotal.toLocaleString()}</h3></div>
           </div>
           <div className="bg-white rounded-[2.5rem] p-10 premium-shadow border border-slate-50 space-y-6">
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-800 flex items-center gap-2"><Globe size={18} className="text-profee-blue" /> Quick Info</h4>
              <div className="space-y-3 text-xs font-bold text-slate-500">
                <div className="p-4 bg-slate-50 rounded-2xl flex justify-between"><span>Template</span><span className="text-slate-800">{profile.theme.templateId}</span></div>
                <div className="p-4 bg-slate-50 rounded-2xl flex justify-between"><span>GST Type</span><span className="text-slate-800">{gstType}</span></div>
                <div className="p-4 bg-slate-50 rounded-2xl flex justify-between"><span>Items</span><span className="text-slate-800">{items.length}</span></div>
              </div>
           </div>
        </div>
      </div>

      {/* ── Click-outside overlay to close customer dropdown ── */}
      {showCustomerDropdown && (
        <div className="fixed inset-0 z-20" onClick={() => setShowCustomerDropdown(false)} />
      )}

      {/* ── Quick-create customer modal ── */}
      {showQuickCreate && (
        <QuickCreateCustomerModal
          form={qcForm}
          setForm={setQcForm}
          onSave={handleQuickCreateCustomer}
          onClose={() => setShowQuickCreate(false)}
          saving={qcSaving}
        />
      )}

      {/* ── Inventory picker modal (trading only) ── */}
      {showInventoryPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold font-poppins text-slate-900 flex items-center gap-2"><Package size={18} className="text-amber-600" /> Pick from Inventory</h2>
              <button onClick={() => setShowInventoryPicker(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"><X size={16} /></button>
            </div>
            <div className="px-6 py-3 border-b border-slate-50">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  autoFocus type="text" placeholder="Search items…"
                  value={inventorySearch} onChange={e => setInventorySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 rounded-xl border-none focus:ring-2 ring-amber-100 font-poppins font-medium"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {inventoryItems
                .filter(it => it.name.toLowerCase().includes(inventorySearch.toLowerCase()) || it.hsnCode.toLowerCase().includes(inventorySearch.toLowerCase()))
                .map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePickInventoryItem(item)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-amber-50 border-b border-slate-50 transition-colors text-left group"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-800 group-hover:text-amber-800">{item.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">HSN: {item.hsnCode || '—'} · {item.unit} · GST {item.gstRate}%</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm font-black text-slate-900">₹{item.sellingPrice.toLocaleString('en-IN')}</p>
                      {(item.stock ?? 0) > 0
                        ? <p className="text-xs text-emerald-600">Stock: {item.stock}</p>
                        : <p className="text-xs text-rose-500">Out of stock</p>
                      }
                    </div>
                  </button>
                ))
              }
              {inventoryItems.length === 0 && (
                <div className="px-6 py-12 text-center text-sm text-slate-400">
                  No inventory items found. Add items from the Inventory page.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════
//  QUICK-CREATE CUSTOMER MODAL
// ══════════════════════════════════════════════════
const QuickCreateCustomerModal: React.FC<{
  form: { name: string; phone: string; gstin: string; state: string };
  setForm: (f: any) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}> = ({ form, setForm, onSave, onClose, saving }) => {
  const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Puducherry','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Lakshadweep','Andaman and Nicobar Islands'];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold font-poppins text-slate-900">New Customer</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 font-poppins">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Customer Name *</label>
            <input
              autoFocus type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Raj Traders"
              className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-indigo-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Phone</label>
            <input
              type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="10-digit mobile"
              className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-indigo-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">GSTIN</label>
            <input
              type="text" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
              placeholder="15-digit GSTIN"
              className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-indigo-100 uppercase"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">State *</label>
            <select
              value={form.state} onChange={e => setForm({ ...form, state: e.target.value })}
              className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-indigo-100 appearance-none"
            >
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-poppins font-medium">Cancel</button>
          <button onClick={onSave} disabled={saving || !form.name.trim()} className="px-5 py-2 text-sm bg-profee-blue hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl font-poppins transition-colors">
            {saving ? 'Saving…' : 'Create Customer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceGenerator;
