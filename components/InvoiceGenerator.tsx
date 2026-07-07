
import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, ChevronDown, Printer, Globe, Image as ImageIcon, Save, Eye, Edit3, CheckCircle, Loader2, FileText, ArrowLeft, Download, Pencil, Search, UserPlus, Package, Briefcase, X, RotateCcw, ArchiveX, IndianRupee, Receipt, MessageCircle, User, Building2, MapPin, Landmark, BarChart3, ShieldCheck, StickyNote, Phone, Mail, Lock, Smartphone, CreditCard } from 'lucide-react';
import { GSTType, InvoiceItem, Invoice, Customer, BusinessProfile, InventoryItem, ServiceItem, SupplyType, type Quotation } from '../types';
import HSNSearchModal, { HSNInput } from './HSNSearchModal';
import { getCustomers, getBusinessProfile, addInvoice, getInvoices, updateInvoice, addLedgerEntry, deleteLedgerEntry, getLedgerEntryByInvoiceId, updateCustomer, addCustomer, getInventoryItems, addInventoryItem, getServiceItems, softDeleteInvoice, restoreInvoice, getDeletedInvoices, getTotalInvoiceCount, updateQuotation, applyStockAdjustments } from '../lib/firestore';
import { lookupGSTIN, type GSTINDetails } from '../lib/whitebooksApi';
import { haptic } from '../lib/haptic';
import PDFPreviewModal, { PDFDirectDownload } from './pdf/PDFPreviewModal';
import InvoicePDF from './pdf/InvoicePDF';
import { pdf } from '@react-pdf/renderer';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import ReceiptPDF, { type ReceiptEntry } from './pdf/ReceiptPDF';

const BILLHIPPO_LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

const DEFAULT_PROFILE: BusinessProfile = {
  name: 'Your Business', gstin: '', address: '', city: '', state: 'Maharashtra', pincode: '',
  phone: '', email: '', pan: '', gstEnabled: true,
  theme: { templateId: 'modern-2', primaryColor: '#4c2de0', fontFamily: 'Poppins, sans-serif', invoicePrefix: 'INV/2026/', autoNumbering: true, logoUrl: BILLHIPPO_LOGO }
};

const r2 = (n: number) => Math.round(n * 100) / 100;

// Blend two hex colours (t=0 → a, t=1 → b) — derives the Geometric template's
// navy secondary tone from whatever primary colour the user has selected.
const mixHex = (a: string, b: string, t: number): string => {
  const ah = a.replace('#', ''), bh = b.replace('#', '');
  const ch = (i: number) => {
    const av = parseInt(ah.slice(i, i + 2), 16);
    const bv = parseInt(bh.slice(i, i + 2), 16);
    return Math.round(av * (1 - t) + bv * t).toString(16).padStart(2, '0');
  };
  return `#${ch(0)}${ch(2)}${ch(4)}`;
};

const numberToWords = (amount: number): string => {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
    'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function conv(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + conv(n % 100) : '');
    if (n < 100000) return conv(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + conv(n % 1000) : '');
    if (n < 10000000) return conv(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + conv(n % 100000) : '');
    return conv(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + conv(n % 10000000) : '');
  }
  const rupees = Math.floor(amount);
  const paise  = Math.round((amount - rupees) * 100);
  let result = conv(rupees) + ' Rupees';
  if (paise > 0) result += ' and ' + conv(paise) + ' Paise';
  return result + ' Only';
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
  initialQuotation?: Quotation | null;
  onQuotationConsumed?: () => void;
  initialInvoiceId?: string | null;
  onInvoiceConsumed?: () => void;
  /** Called when the user wants to create a Delivery Challan from the current invoice. */
  onCreateChallan?: (invoice: Invoice) => void;
  /** When true, open straight into the new-invoice creation form. */
  startInCreate?: boolean;
  onCreateConsumed?: () => void;
}

const InvoiceGenerator: React.FC<InvoiceGeneratorProps> = ({ userId, initialQuotation, onQuotationConsumed, initialInvoiceId, onInvoiceConsumed, onCreateChallan, startInCreate, onCreateConsumed }) => {
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

  // Collect-payment modal state
  const [collectModal, setCollectModal] = useState<{ open: boolean; invoice: Invoice | null }>({ open: false, invoice: null });
  const [collectAmount, setCollectAmount] = useState('');
  const [collectDesc, setCollectDesc]     = useState('');
  const [collectSaving, setCollectSaving] = useState(false);

  // Receipt modal state
  const [receiptModal, setReceiptModal] = useState<{ open: boolean; entry: ReceiptEntry | null; customer: Customer | null }>({ open: false, entry: null, customer: null });
  const [receiptPdfData, setReceiptPdfData] = useState<{ open: boolean; entry: ReceiptEntry | null; customer: Customer | null }>({ open: false, entry: null, customer: null });
  const [receiptDownloadTarget, setReceiptDownloadTarget] = useState<{ document: React.ReactElement; fileName: string } | null>(null);

  // Edit & search state
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Customer dropdown state
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // Quick-create customer modal
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [qcForm, setQcForm] = useState({ name: '', phone: '', gstin: '', state: 'Maharashtra', email: '', address: '', city: '', pincode: '' });
  const [qcSaving, setQcSaving] = useState(false);

  // Inventory picker (trading only)
  const [showInventoryPicker, setShowInventoryPicker] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventorySearch, setInventorySearch] = useState('');
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [showServicesPicker, setShowServicesPicker] = useState(false);
  const [serviceItems, setServiceItems] = useState<ServiceItem[]>([]);
  const [servicesSearch, setServicesSearch] = useState('');
  const [servicesLoaded, setServicesLoaded] = useState(false);
  // Inline description autocomplete
  const [activeDescItemId, setActiveDescItemId] = useState<string | null>(null);

  // Quick-add inventory item from invoice form
  const [showAddInventoryItemModal, setShowAddInventoryItemModal] = useState(false);
  const [addInvItemId, setAddInvItemId] = useState<string | null>(null);
  const [addingInventory, setAddingInventory] = useState(false);
  const [addInvForm, setAddInvForm] = useState({ name: '', hsnCode: '', unit: 'PCS', sellingPrice: '', gstRate: '18', stock: '0' });
  const [showHSNModalForInvAdd, setShowHSNModalForInvAdd] = useState(false);

  // WhatsApp PDF share loading (tracks which invoice row is being processed)
  const [whatsappLoading, setWhatsappLoading] = useState<string | null>(null);

  // HSN search modal
  const [hsnModalItemId, setHsnModalItemId] = useState<string | null>(null);

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

  // Auto-open an invoice in preview mode when navigated from Customers page
  useEffect(() => {
    if (!initialInvoiceId || allInvoices.length === 0) return;
    const inv = allInvoices.find(i => i.id === initialInvoiceId);
    if (inv) {
      handlePreviewInvoice(inv);
      onInvoiceConsumed?.();
    }
  }, [initialInvoiceId, allInvoices]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open straight into the new-invoice creation form when navigated with intent
  useEffect(() => {
    if (!startInCreate) return;
    handleNewInvoice();
    onCreateConsumed?.();
  }, [startInCreate]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const subTotal  = r2(items.reduce((sum, item) => sum + r2(item.quantity * item.rate), 0));
  const taxAmount = r2(items.reduce((sum, item) => sum + r2(r2(item.quantity * item.rate) * item.gstRate / 100), 0));
  const grandTotal = r2(subTotal + taxAmount);
  const roundedTotal = Math.round(grandTotal);
  const roundOff = r2(roundedTotal - grandTotal);

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

  const hsnMinDigits = profile.annualTurnover === 'above5cr' ? 6 : 4;

  // HSN validation warning (non-blocking)
  const hsnWarning = useMemo(() => {
    const shortHsn = items.filter(i => i.description && (i.hsnCode || '').trim().length < hsnMinDigits);
    if (shortHsn.length === 0) return null;
    return `${shortHsn.length} item(s) have HSN codes shorter than ${hsnMinDigits} digits (required for your turnover bracket).`;
  }, [items, hsnMinDigits]);

  const handleHSNSelect = (itemId: string, code: string, _description: string, gstRate: number) => {
    setItems(prev => prev.map(item =>
      item.id === itemId
        ? { ...item, hsnCode: code, gstRate }
        : item
    ));
  };

  const handleAddItem = () => {
    setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: '', notes: '', hsnCode: '', quantity: 1, rate: 0, gstRate: 18 }]);
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

  // Navigate to the in-app preview card for an existing invoice (Eye icon in list)
  const handlePreviewInvoice = (inv: Invoice) => {
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
    setMode('preview');
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
      // Restore stock that was decremented when the invoice was created
      if (inv.stockApplied) {
        await applyStockAdjustments(userId, inv.items, 'inward');
      }
      // Remove the ledger entry created when this invoice was saved, and reverse the customer balance
      const ledgerEntry = await getLedgerEntryByInvoiceId(userId, inv.id);
      if (ledgerEntry) {
        await deleteLedgerEntry(userId, ledgerEntry.id);
        if (inv.customerId) {
          const cust = customers.find(c => c.id === inv.customerId);
          if (cust) {
            await updateCustomer(userId, inv.customerId, { balance: (cust.balance || 0) - ledgerEntry.amount });
            setCustomers(prev => prev.map(c => c.id === inv.customerId ? { ...c, balance: (c.balance || 0) - ledgerEntry.amount } : c));
          }
        }
      }
      setAllInvoices(prev => prev.filter(i => i.id !== inv.id));
      setDeletedInvoices(prev => [{ ...inv, deleted: true, deletedAt: new Date().toISOString().split('T')[0] }, ...prev]);
      setDeletingInvoiceId(null);
    }, 400);
  };

  const handleRestoreInvoice = async (inv: Invoice, e: React.MouseEvent) => {
    e.stopPropagation();
    await restoreInvoice(userId, inv.id);
    // Re-apply stock decrement when restoring a soft-deleted invoice
    if (inv.stockApplied) {
      await applyStockAdjustments(userId, inv.items, 'outward');
    }
    // Re-create the ledger entry that was removed when the invoice was deleted, and restore the customer balance
    const existing = await getLedgerEntryByInvoiceId(userId, inv.id);
    if (!existing && inv.customerId && inv.total) {
      await addLedgerEntry(userId, {
        date: inv.date, type: 'Debit', amount: inv.total,
        description: `Sale - ${inv.invoiceNumber}`, invoiceId: inv.id, customerId: inv.customerId,
      });
      const cust = customers.find(c => c.id === inv.customerId);
      if (cust) {
        await updateCustomer(userId, inv.customerId, { balance: (cust.balance || 0) + inv.total });
        setCustomers(prev => prev.map(c => c.id === inv.customerId ? { ...c, balance: (c.balance || 0) + inv.total } : c));
      }
    }
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
        email: qcForm.email,
        address: qcForm.address,
        city: qcForm.city,
        pincode: qcForm.pincode,
        balance: 0,
      });
      const newCustomer: Customer = { id, name: qcForm.name.trim(), phone: qcForm.phone, gstin: qcForm.gstin, state: qcForm.state, email: qcForm.email, address: qcForm.address, city: qcForm.city, pincode: qcForm.pincode, balance: 0 };
      setCustomers(prev => [...prev, newCustomer].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedCustomerId(id);
      setShowQuickCreate(false);
      setQcForm({ name: '', phone: '', gstin: '', state: 'Maharashtra', email: '', address: '', city: '', pincode: '' });
    } finally {
      setQcSaving(false);
    }
  };

  // Lazy-load inventory items (shared by modal picker and inline autocomplete)
  const ensureInventoryLoaded = async () => {
    if (!inventoryLoaded) {
      const data = await getInventoryItems(userId);
      setInventoryItems(data);
      setInventoryLoaded(true);
    }
  };

  // Open inventory picker modal (lazy-load items)
  const openInventoryPicker = async () => {
    await ensureInventoryLoaded();
    setInventorySearch('');
    setShowInventoryPicker(true);
  };

  const ensureServicesLoaded = async () => {
    if (!servicesLoaded) {
      const data = await getServiceItems(userId);
      setServiceItems(data);
      setServicesLoaded(true);
    }
  };

  const openServicesPicker = async () => {
    await ensureServicesLoaded();
    setServicesSearch('');
    setShowServicesPicker(true);
  };

  const handlePickServiceItem = (item: ServiceItem) => {
    const firstEmpty = items.find(i => !i.description.trim());
    const newLineItem: InvoiceItem = {
      id: firstEmpty?.id || Math.random().toString(36).substr(2, 9),
      description: item.name,
      notes: item.description || '',
      hsnCode: item.sacCode,
      unit: item.unit,
      quantity: 1,
      rate: item.rate,
      gstRate: item.gstRate,
    };
    if (firstEmpty) {
      setItems(prev => prev.map(i => i.id === firstEmpty.id ? newLineItem : i));
    } else {
      setItems(prev => [...prev, newLineItem]);
    }
    setShowServicesPicker(false);
  };

  // Select an inventory item inline from the description autocomplete
  const handleInlinePickInventoryItem = (itemId: string, inv: InventoryItem) => {
    setItems(prev => prev.map(i => i.id === itemId ? {
      ...i,
      inventoryItemId: inv.id,
      description: inv.name,
      notes: inv.description || i.notes || '',
      hsnCode: inv.hsnCode,
      unit: inv.unit,
      quantity: i.quantity || 1,
      rate: inv.sellingPrice,
      gstRate: inv.gstRate,
    } : i));
    setActiveDescItemId(null);
  };

  // Quick-add a new item to inventory from the invoice form, then auto-select it
  const handleAddToInventory = async () => {
    if (!addInvForm.name.trim()) return;
    setAddingInventory(true);
    try {
      const newItem: Omit<InventoryItem, 'id'> = {
        name: addInvForm.name.trim(),
        hsnCode: addInvForm.hsnCode,
        unit: addInvForm.unit,
        sellingPrice: parseFloat(addInvForm.sellingPrice) || 0,
        gstRate: parseFloat(addInvForm.gstRate),
        stock: parseInt(addInvForm.stock) || 0,
      };
      const id = await addInventoryItem(userId, newItem);
      const createdItem: InventoryItem = { id, ...newItem };
      setInventoryItems(prev => [...prev, createdItem]);
      if (addInvItemId) handleInlinePickInventoryItem(addInvItemId, createdItem);
      setShowAddInventoryItemModal(false);
      setAddInvForm({ name: '', hsnCode: '', unit: 'PCS', sellingPrice: '', gstRate: '18', stock: '0' });
    } finally {
      setAddingInventory(false);
    }
  };

  // Select an inventory item → add as a line item (modal picker)
  const handlePickInventoryItem = (item: InventoryItem) => {
    const firstEmpty = items.find(i => !i.description.trim());
    const newLineItem: InvoiceItem = {
      id: firstEmpty?.id || Math.random().toString(36).substr(2, 9),
      inventoryItemId: item.id,
      description: item.name,
      notes: item.description || '',
      hsnCode: item.hsnCode,
      unit: item.unit,
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
      const cgst = gstType === GSTType.CGST_SGST ? r2(taxAmount / 2) : 0;
      const sgst = gstType === GSTType.CGST_SGST ? r2(taxAmount / 2) : 0;
      const igst = gstType === GSTType.IGST ? taxAmount : 0;
      // Omit optional fields when empty — Firestore rejects undefined values
      const invoicePayload = {
        invoiceNumber, date: invoiceDate, customerId: selectedCustomerId,
        customerName: selectedCustomer?.name || '', items, gstType,
        totalBeforeTax: subTotal, cgst, sgst, igst, totalAmount: roundedTotal,
        status: (editingInvoice?.status || 'Unpaid') as 'Paid' | 'Unpaid' | 'Partial',
        stockApplied: true,
        supplyType: effectiveSupplyType,
        reverseCharge,
        ...(portCode         ? { portCode }         : {}),
        ...(shippingBillNo   ? { shippingBillNo }   : {}),
        ...(shippingBillDate ? { shippingBillDate } : {}),
        ...(exportCountry    ? { exportCountry }    : {}),
      };

      if (editingInvoice) {
        await updateInvoice(userId, editingInvoice.id, invoicePayload);
        // Reverse the previously-applied stock decrement (if any), then apply the new one
        if (editingInvoice.stockApplied) {
          await applyStockAdjustments(userId, editingInvoice.items, 'inward');
        }
        await applyStockAdjustments(userId, items, 'outward');
        setAllInvoices(prev =>
          prev.map(inv => inv.id === editingInvoice.id ? { ...inv, ...invoicePayload } : inv)
        );
      } else {
        const invoiceId = await addInvoice(userId, invoicePayload);
        await applyStockAdjustments(userId, items, 'outward');
        // Keep list in sync immediately — no page reload needed
        const newInvoice = { id: invoiceId, ...invoicePayload } as Invoice;
        setAllInvoices(prev =>
          [newInvoice, ...prev]
            .sort((a, b) => b.date.localeCompare(a.date))
        );
        // Set editingInvoice so that returning to edit mode updates rather than creates a duplicate
        setEditingInvoice(newInvoice);
        await addLedgerEntry(userId, {
          date: invoiceDate, type: 'Debit', amount: roundedTotal,
          description: `Sale - ${invoiceNumber}`, invoiceId, customerId: selectedCustomerId
        });
        if (selectedCustomer) {
          await updateCustomer(userId, selectedCustomerId, { balance: (selectedCustomer.balance || 0) + roundedTotal });
        }
        // If this invoice was converted from a quotation, mark the quotation as Converted
        if (sourceQuotationId) {
          await updateQuotation(userId, sourceQuotationId, {
            status: 'Converted',
            convertedInvoiceId: invoiceId,
            convertedInvoiceNumber: invoiceNumber,
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

  // ── Collect Payment: record a Credit ledger entry, update invoice status + customer balance, show receipt ──
  const handleCollectPayment = async () => {
    const inv = collectModal.invoice;
    if (!inv || !collectAmount) return;
    setCollectSaving(true);
    try {
      const amount        = parseFloat(collectAmount);
      const date          = new Date().toISOString().split('T')[0];
      const description   = collectDesc || `Payment for Invoice ${inv.invoiceNumber}`;
      const custObj       = customers.find(c => c.id === inv.customerId);
      const newStatus: 'Paid' | 'Partial' = amount >= inv.totalAmount ? 'Paid' : 'Partial';
      const currentBalance    = custObj?.balance ?? inv.totalAmount;
      const newRunningBalance = currentBalance - amount;

      const entryId = await addLedgerEntry(userId, {
        date, type: 'Credit', amount, description,
        customerId: inv.customerId, invoiceId: inv.id,
      });
      await updateInvoice(userId, inv.id, { status: newStatus });
      if (custObj) {
        await updateCustomer(userId, custObj.id, { balance: newRunningBalance });
        setCustomers(prev => prev.map(c => c.id === custObj.id ? { ...c, balance: newRunningBalance } : c));
      }
      setAllInvoices(prev => prev.map(i => i.id === inv.id ? { ...i, status: newStatus } : i));

      const customer: Customer = custObj || { id: inv.customerId, name: inv.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: newRunningBalance };
      const receiptEntry: ReceiptEntry = {
        id: entryId, date, type: 'Credit', amount, description,
        customerId: inv.customerId, invoiceId: inv.id, runningBalance: newRunningBalance,
      };
      setCollectModal({ open: false, invoice: null });
      setCollectAmount('');
      setCollectDesc('');
      setReceiptModal({ open: true, entry: receiptEntry, customer });
    } catch (err) { console.error(err); }
    finally { setCollectSaving(false); }
  };

  // ── Show receipt for an already-paid invoice (no new ledger entry created) ──
  const handleShowReceiptFromPaidInvoice = (inv: Invoice) => {
    const custObj = customers.find(c => c.id === inv.customerId);
    const customer: Customer = custObj || { id: inv.customerId, name: inv.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 };
    const receiptEntry: ReceiptEntry = {
      id: inv.id, date: inv.date, type: 'Credit',
      amount: inv.totalAmount,
      description: `Payment for Invoice ${inv.invoiceNumber}`,
      customerId: inv.customerId, invoiceId: inv.id,
      runningBalance: custObj?.balance ?? 0,
    };
    setReceiptModal({ open: true, entry: receiptEntry, customer });
  };

  // Build a temporary Invoice object from current form state (used for PDF before or after save)
  const buildCurrentInvoice = (): Invoice => {
    const cgst = gstType === GSTType.CGST_SGST ? r2(taxAmount / 2) : 0;
    const sgst = gstType === GSTType.CGST_SGST ? r2(taxAmount / 2) : 0;
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
      totalAmount: roundedTotal,
      status: 'Unpaid',
    };
  };

  const openPDFModal = (invoice: Invoice, customer: Customer | null) => {
    setPdfModal({ open: true, invoice, customer });
  };

  const handleWhatsAppInvoice = (inv: Invoice, customer: Customer | null) => {
    const phone = customer?.phone?.replace(/\D/g, '');
    const message = `Dear ${inv.customerName},\n\nPlease find your Invoice *${inv.invoiceNumber}* for ₹${inv.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.\n\nThank you for your business!\n\nRegards,\n${profile.name}`;
    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  // Generate PDF blob and share it via WhatsApp (Web Share API on mobile, text-link on desktop)
  const handleShareInvoiceWhatsApp = async (inv: Invoice, custObj: Customer | null) => {
    setWhatsappLoading(inv.id);
    try {
      const customer = custObj || { id: '', name: inv.customerName, phone: '', email: '', address: '', city: '', state: '', pincode: '', balance: 0 };
      const phone = custObj?.phone?.replace(/\D/g, '');
      const message = `Dear ${inv.customerName},\n\nPlease find your Invoice *${inv.invoiceNumber}* for ₹${inv.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.\n\nThank you for your business!\n\nRegards,\n${profile.name}`;
      const fileName = `Invoice-${inv.invoiceNumber.replace(/\//g, '-')}.pdf`;

      const blob = await pdf(<InvoicePDF invoice={inv} business={profile} customer={customer} />).toBlob();
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: message });
      } else {
        // Desktop: download the PDF, then open WhatsApp with a text message
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl; a.download = fileName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        const waUrl = phone
          ? `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`
          : `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
      }
    } catch (err) {
      console.error('WhatsApp share failed:', err);
    } finally {
      setWhatsappLoading(null);
    }
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
                <td className="px-10 py-6">
                  <span className="font-medium">{idx + 1}. {item.description || 'No description'}</span>
                  {item.notes && <p className="text-[10px] text-slate-400 mt-1 font-normal leading-snug">{item.notes}</p>}
                </td>
                <td className="px-4 py-6 text-center text-slate-400">{item.hsnCode || '---'}</td>
                <td className="px-4 py-6 text-center font-black">{item.quantity}</td>
                <td className="px-4 py-6 text-center text-slate-400">{item.gstRate}%</td>
                <td className="px-10 py-6 text-right font-black">₹{r2(item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
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
               {roundOff !== 0 && (
                 <div className="flex justify-between text-xs font-medium text-slate-400">
                   <span>Round Off</span>
                   <span>{roundOff > 0 ? '+' : ''}₹{Math.abs(roundOff).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                 </div>
               )}
            </div>
            <div className="pt-8 border-t-2 border-slate-100 flex justify-between items-center px-6 gap-4">
               <span className="text-2xl font-black uppercase tracking-tighter text-slate-900 font-montserrat shrink-0">Total</span>
               <span className="text-4xl font-black text-slate-900 font-montserrat tracking-tighter text-right min-w-0">₹{roundedTotal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
            </div>
            <div className="p-8 bg-slate-50 rounded-[2rem] border border-slate-100 font-poppins space-y-2 shadow-sm">
               <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Amount in Words</p>
               <p className="text-base font-black text-slate-800 leading-tight">{numberToWords(roundedTotal)}</p>
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
                const taxable = r2(item.quantity * item.rate);
                const itemTax = r2(taxable * item.gstRate / 100);
                const halfTax = r2(itemTax / 2);
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
                  <span className="text-slate-700">₹{r2(taxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-slate-400">SGST</span>
                  <span className="text-slate-700">₹{r2(taxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between py-2">
                <span className="text-slate-400">IGST</span>
                <span className="text-slate-700">₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            {roundOff !== 0 && (
              <div className="flex justify-between py-2">
                <span className="text-slate-400">Round Off</span>
                <span className="text-slate-700">{roundOff > 0 ? '+' : ''}₹{Math.abs(roundOff).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between items-baseline pt-4 border-t-2" style={{ borderColor: profile.theme.primaryColor }}>
              <span className="text-[22px] font-black tracking-tight font-montserrat" style={{ color: profile.theme.primaryColor }}>Total</span>
              <span className="text-[34px] font-black tracking-tighter font-montserrat" style={{ color: profile.theme.primaryColor }}>₹{roundedTotal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
            </div>
            <div className="pt-3">
              <p className="text-[7px] font-bold text-slate-400 uppercase tracking-widest">Invoice Total (in words)</p>
              <p className="text-[9px] font-black text-slate-700 italic leading-snug mt-1">{numberToWords(roundedTotal)}</p>
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

  // ═══════════════════════════════════════════
  //  GEOMETRIC CORPORATE TEMPLATE (on-screen preview)
  //  Teal (primary) + derived navy, angular banners, hexagon badges.
  // ═══════════════════════════════════════════
  const geoTeal = profile.theme.primaryColor;
  const geoNavy = mixHex(profile.theme.primaryColor, '#0e2a4a', 0.68);
  const HEX_CLIP = 'polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%)';
  const geoHex = (icon: React.ReactNode) => (
    <span className="inline-flex items-center justify-center flex-shrink-0" style={{ width: 22, height: 22, backgroundColor: geoTeal, clipPath: HEX_CLIP }}>
      {icon}
    </span>
  );
  const geoLabel = (icon: React.ReactNode, label: string) => (
    <div className="flex items-center gap-1.5">
      {geoHex(icon)}
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white px-3 py-1" style={{ backgroundColor: geoNavy, clipPath: 'polygon(0 0, 100% 0, 94% 100%, 0 100%)' }}>{label}</span>
    </div>
  );

  const geometricTemplate = (
    <div className="bg-white w-full max-w-[860px] mx-auto border border-slate-100 print:shadow-none print:border-none shadow-2xl rounded-[2rem] overflow-hidden" style={{ fontFamily: profile.theme.fontFamily }}>
      <div className="px-10 pt-10 pb-10 flex flex-col space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-[64px] h-[64px] rounded-xl overflow-hidden border-2 flex items-center justify-center flex-shrink-0" style={{ borderColor: geoTeal }}>
              {profile.theme.logoUrl
                ? <img src={profile.theme.logoUrl} className="w-full h-full object-contain" alt="logo" />
                : <span className="text-3xl font-black" style={{ color: geoTeal }}>{profile.name.charAt(0)}</span>}
            </div>
            <div>
              <h1 className="text-[22px] font-black text-slate-900 leading-tight tracking-tight">{profile.name}</h1>
              <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">{profile.address}, {profile.city}</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">{profile.state} – {profile.pincode}</p>
              {profile.gstin && <p className="text-[10px] font-black mt-0.5" style={{ color: geoTeal }}>GSTIN: {profile.gstin}</p>}
              {profile.phone && <p className="text-[10px] text-slate-500">Ph: {profile.phone}</p>}
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="relative">
              <div className="px-6 py-2 text-white text-[26px] font-black tracking-tight" style={{ backgroundColor: geoNavy, clipPath: 'polygon(12% 0, 100% 0, 100% 100%, 0 100%)' }}>INVOICE</div>
              <div className="absolute left-3 -bottom-1 h-[3px] w-10" style={{ backgroundColor: geoTeal }}></div>
            </div>
            <div className="mt-4 space-y-1.5 text-right">
              <div className="flex items-center justify-end gap-3"><span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Invoice #</span><span className="text-[12px] font-black text-slate-900">{invoiceNumber}</span></div>
              <div className="flex items-center justify-end gap-3"><span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Date</span><span className="text-[12px] font-black text-slate-900">{invoiceDate}</span></div>
            </div>
          </div>
        </div>

        {/* Geometric divider */}
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-2" style={{ backgroundColor: geoTeal, clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}></span>
          <span className="w-3 h-2" style={{ backgroundColor: geoNavy, clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}></span>
          <span className="w-3 h-2 opacity-40" style={{ backgroundColor: geoTeal, clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }}></span>
          <span className="flex-1 h-[1.5px] ml-1" style={{ backgroundColor: `${geoNavy}30` }}></span>
        </div>

        {/* ── Billed by / to ── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 pt-4">{geoLabel(<User size={11} className="text-white" strokeWidth={2.5} />, 'Billed By')}</div>
            <div className="px-4 pb-4 pt-3">
              <p className="text-[13px] font-black text-slate-900">{profile.name}</p>
              <p className="text-[10px] text-slate-500 leading-relaxed mt-1">{profile.address}, {profile.city}, {profile.state} – {profile.pincode}</p>
              {profile.phone && <p className="text-[10px] text-slate-500">Ph: {profile.phone}</p>}
              <div className="flex gap-6 mt-3">
                <div><p className="text-[7px] font-bold text-slate-400 uppercase">GSTIN</p><p className="text-[10px] font-black text-slate-800">{profile.gstin || '—'}</p></div>
                <div><p className="text-[7px] font-bold text-slate-400 uppercase">PAN</p><p className="text-[10px] font-black text-slate-800">{profile.pan || '—'}</p></div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <div className="px-4 pt-4">{geoLabel(<Building2 size={11} className="text-white" strokeWidth={2.5} />, 'Billed To')}</div>
            <div className="px-4 pb-4 pt-3">
              <p className="text-[13px] font-black text-slate-900">{selectedCustomer?.name || 'Party Name'}</p>
              <p className="text-[10px] text-slate-500 leading-relaxed mt-1">{selectedCustomer?.address || '—'}, {selectedCustomer?.city || '—'}, {selectedCustomer?.state || '—'} – {selectedCustomer?.pincode || '—'}</p>
              {selectedCustomer?.phone && <p className="text-[10px] text-slate-500">Ph: {selectedCustomer.phone}</p>}
              <div className="flex gap-6 mt-3">
                <div><p className="text-[7px] font-bold text-slate-400 uppercase">GSTIN</p><p className="text-[10px] font-black text-slate-800">{selectedCustomer?.gstin || '—'}</p></div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Place / Country of Supply ── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-slate-50/70">
            {geoHex(<MapPin size={11} className="text-white" strokeWidth={2.5} />)}
            <div><p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Place of Supply</p><p className="text-[11px] font-black text-slate-800 mt-0.5">{selectedCustomer?.state || profile.state}</p></div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-slate-50/70">
            {geoHex(<Globe size={11} className="text-white" strokeWidth={2.5} />)}
            <div><p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Country of Supply</p><p className="text-[11px] font-black text-slate-800 mt-0.5">India</p></div>
          </div>
        </div>

        {/* ── Items table ── */}
        <div className="rounded-xl overflow-hidden border border-slate-100 shadow-sm">
          <table className="w-full text-left border-collapse text-[10px]">
            <thead>
              <tr className="text-white font-black uppercase tracking-wide" style={{ backgroundColor: geoNavy }}>
                <th className="px-3 py-3 w-7">#</th>
                <th className="px-3 py-3">Item Description</th>
                <th className="px-2 py-3 text-center">HSN/SAC</th>
                <th className="px-2 py-3 text-center">Qty</th>
                <th className="px-2 py-3 text-center">GST%</th>
                <th className="px-3 py-3 text-right">Taxable Amt</th>
                {gstType === GSTType.CGST_SGST ? (<><th className="px-2 py-3 text-right">SGST</th><th className="px-2 py-3 text-right">CGST</th></>) : (<th className="px-2 py-3 text-right" colSpan={2}>IGST</th>)}
                <th className="px-3 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item, idx) => {
                const taxable = r2(item.quantity * item.rate);
                const itemTax = r2(taxable * item.gstRate / 100);
                const halfTax = r2(itemTax / 2);
                return (
                  <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="px-3 py-3 text-slate-400 font-bold">{idx + 1}</td>
                    <td className="px-3 py-3 font-semibold text-slate-800">{item.description || 'No description'}</td>
                    <td className="px-2 py-3 text-center text-slate-500">{item.hsnCode || '—'}</td>
                    <td className="px-2 py-3 text-center font-black text-slate-800">{item.quantity}</td>
                    <td className="px-2 py-3 text-center text-slate-500">{item.gstRate}%</td>
                    <td className="px-3 py-3 text-right text-slate-700">₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    {gstType === GSTType.CGST_SGST ? (<><td className="px-2 py-3 text-right text-slate-600">₹{halfTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td className="px-2 py-3 text-right text-slate-600">₹{halfTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></>) : (<td className="px-2 py-3 text-right text-slate-600" colSpan={2}>₹{itemTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>)}
                    <td className="px-3 py-3 text-right font-black text-slate-900">₹{(taxable + itemTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── Bank (left) | Summary + TOTAL (right) ── */}
        <div className="grid grid-cols-2 gap-8 pt-1">
          {/* Left */}
          <div className="space-y-5">
            <div className="space-y-3">
              {geoLabel(<Landmark size={11} className="text-white" strokeWidth={2.5} />, 'Bank & Payment')}
              <div className="flex gap-4 items-start">
                <div className="flex-1 space-y-1.5 text-[10px]">
                  {profile.bankName && <div className="flex justify-between"><span className="text-slate-400 font-bold">Bank</span><span className="text-slate-800 font-bold">{profile.bankName}</span></div>}
                  {profile.accountNumber && <div className="flex justify-between"><span className="text-slate-400 font-bold">Account No.</span><span className="text-slate-800 font-bold">{profile.accountNumber}</span></div>}
                  {profile.ifscCode && <div className="flex justify-between"><span className="text-slate-400 font-bold">IFSC</span><span className="text-slate-800 font-bold">{profile.ifscCode}</span></div>}
                  {profile.upiId && <div className="flex justify-between pt-1.5 border-t border-slate-100"><span className="text-slate-400 font-bold">UPI ID</span><span className="font-black" style={{ color: geoTeal }}>{profile.upiId}</span></div>}
                </div>
                {profile.upiId && upiQrUrl && (
                  <div className="flex-shrink-0 flex flex-col items-center">
                    <p className="text-[6px] font-black uppercase tracking-widest mb-1" style={{ color: geoTeal }}>Scan to Pay</p>
                    <div className="p-1.5 border border-slate-100 rounded-xl bg-white shadow-sm"><img src={upiQrUrl} className="w-[56px] h-[56px]" alt="UPI QR" /></div>
                  </div>
                )}
              </div>
            </div>
            {profile.termsAndConditions && (
              <div className="space-y-2">
                {geoLabel(<ShieldCheck size={11} className="text-white" strokeWidth={2.5} />, 'Terms & Conditions')}
                <p className="text-[9px] text-slate-500 leading-relaxed whitespace-pre-line">{profile.termsAndConditions}</p>
              </div>
            )}
            {profile.defaultNotes && (
              <div className="space-y-2">
                {geoLabel(<StickyNote size={11} className="text-white" strokeWidth={2.5} />, 'Additional Notes')}
                <p className="text-[9px] text-slate-500 italic leading-relaxed">{profile.defaultNotes}</p>
              </div>
            )}
          </div>

          {/* Right */}
          <div className="space-y-3">
            {geoLabel(<BarChart3 size={11} className="text-white" strokeWidth={2.5} />, 'Summary')}
            <div className="text-[11px] font-bold">
              <div className="flex justify-between py-2 border-b border-slate-100"><span className="text-slate-400">Sub Total</span><span className="text-slate-800">₹{subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              {gstType === GSTType.CGST_SGST ? (<>
                <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-400">CGST</span><span className="text-slate-700">₹{r2(taxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-400">SGST</span><span className="text-slate-700">₹{r2(taxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              </>) : (<div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-400">IGST</span><span className="text-slate-700">₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>)}
              {roundOff !== 0 && (<div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-400">Round Off</span><span className="text-slate-700">{roundOff > 0 ? '+' : ''}₹{Math.abs(roundOff).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>)}
            </div>
            {/* Big angular TOTAL banner */}
            <div className="flex items-center justify-between text-white pl-8 pr-5 py-3.5" style={{ backgroundColor: geoTeal, clipPath: 'polygon(9% 0, 100% 0, 100% 100%, 0 100%)' }}>
              <span className="text-[15px] font-black uppercase tracking-widest">Total</span>
              <span className="text-[26px] font-black">₹{roundedTotal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
            </div>
            <div className="relative rounded-xl p-3 overflow-hidden" style={{ backgroundColor: `${geoTeal}14` }}>
              <div className="absolute top-0 right-0 w-9 h-9" style={{ backgroundColor: `${geoTeal}28`, clipPath: 'polygon(100% 0, 100% 100%, 0 0)' }}></div>
              <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: geoTeal }}>Invoice Total (in words)</p>
              <p className="text-[10px] font-black text-slate-700 italic leading-snug mt-1">{numberToWords(roundedTotal)}</p>
            </div>
          </div>
        </div>

        {/* ── Contact + Signature ── */}
        <div className="flex justify-between items-end pt-4 border-t border-slate-100">
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

  // ═══════════════════════════════════════════
  //  PAYMENT FIRST TEMPLATE (on-screen preview)
  //  Navy (primary) + derived teal accent, big "Pay Instantly" QR panel.
  // ═══════════════════════════════════════════
  const pfNavy = profile.theme.primaryColor;
  const pfTeal = mixHex(profile.theme.primaryColor, '#0FB5C4', 0.78);
  const pfTealDark = mixHex(pfTeal, '#04222b', 0.28);

  // Simplified UPI-app marks for the "We Accept" row (functional payment indicators)
  const upiAppMarks = (
    <div className="flex items-center justify-between w-full px-1">
      <span className="flex items-center gap-1">
        <svg width="15" height="10" viewBox="0 0 22 14"><polygon points="0,0 11,0 17,7 6,7" fill="#E97A26" /><polygon points="4,7 15,7 21,14 10,14" fill="#5CA632" /></svg>
        <span className="text-[10px] font-black" style={{ color: '#0B3D7A' }}>UPI</span>
      </span>
      <span className="flex items-center gap-1">
        <svg width="14" height="14" viewBox="0 0 26 26">
          <path d="M4.6 8.4 A9.5 9.5 0 0 1 21 6.6" stroke="#EA4335" strokeWidth="5" fill="none" />
          <path d="M4.6 8.4 A9.5 9.5 0 0 0 5.2 18.6" stroke="#FBBC04" strokeWidth="5" fill="none" />
          <path d="M5.2 18.6 A9.5 9.5 0 0 0 20.4 18.9" stroke="#34A853" strokeWidth="5" fill="none" />
          <path d="M20.4 18.9 A9.5 9.5 0 0 0 21 6.6" stroke="#4285F4" strokeWidth="5" fill="none" />
          <rect x="13" y="10.6" width="9.7" height="4.8" fill="#4285F4" />
          <rect x="12.5" y="5" width="2" height="5.6" fill="#fff" />
        </svg>
        <span className="text-[10px] font-semibold" style={{ color: '#5F6368' }}>Pay</span>
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-flex items-center justify-center rounded" style={{ width: 14, height: 14, backgroundColor: '#5F259F' }}><span className="text-[7px] font-black text-white leading-none">Pe</span></span>
        <span className="text-[9px] font-black" style={{ color: '#5F259F' }}>PhonePe</span>
      </span>
      <span className="flex items-baseline">
        <span className="text-[11px] font-black" style={{ color: '#002970' }}>Pay</span>
        <span className="text-[11px] font-black" style={{ color: '#00B9F1' }}>tm</span>
      </span>
    </div>
  );

  const paymentFirstTemplate = (
    <div className="bg-white w-full max-w-[860px] mx-auto border border-slate-100 print:shadow-none print:border-none shadow-2xl rounded-[2rem] overflow-hidden" style={{ fontFamily: profile.theme.fontFamily }}>
      <div className="px-10 pt-10 pb-10">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-[60px] h-[60px] rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{ backgroundColor: pfTeal }}>
              {profile.theme.logoUrl ? <img src={profile.theme.logoUrl} className="w-full h-full object-contain" alt="logo" /> : <span className="text-3xl font-black text-white">{profile.name.charAt(0)}</span>}
            </div>
            <div>
              <h1 className="text-[22px] font-black leading-tight tracking-tight" style={{ color: pfNavy }}>{profile.name}</h1>
              <div className="space-y-0.5 mt-1">
                <p className="flex items-center gap-1.5 text-[10px] text-slate-500"><MapPin size={10} style={{ color: pfTeal }} strokeWidth={2.5} />{profile.address}, {profile.city}, {profile.state} – {profile.pincode}</p>
                {profile.gstin && <p className="flex items-center gap-1.5 text-[10px] text-slate-500"><FileText size={10} style={{ color: pfTeal }} strokeWidth={2.5} />GSTIN: <span className="font-black" style={{ color: pfNavy }}>{profile.gstin}</span></p>}
                {profile.phone && <p className="flex items-center gap-1.5 text-[10px] text-slate-500"><Phone size={10} style={{ color: pfTeal }} strokeWidth={2.5} />{profile.phone}</p>}
                {profile.email && <p className="flex items-center gap-1.5 text-[10px] text-slate-500"><Mail size={10} style={{ color: pfTeal }} strokeWidth={2.5} />{profile.email}</p>}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <h2 className="text-[46px] font-black leading-none tracking-tight" style={{ color: pfNavy }}>INVOICE</h2>
            <p className="text-[9px] font-black tracking-wide mt-0.5 mb-2" style={{ color: pfTeal }}>PAYMENT-FIRST. FAST. SECURE. EASY.</p>
            <div className="space-y-1.5 text-right">
              <div className="flex items-center justify-end gap-3"><span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Invoice No.</span><span className="text-[12px] font-black text-slate-900 w-24 text-left">{invoiceNumber}</span></div>
              <div className="flex items-center justify-end gap-3"><span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Date</span><span className="text-[12px] font-black text-slate-900 w-24 text-left">{invoiceDate}</span></div>
              <div className="flex items-center justify-end gap-3"><span className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Status</span><span className="w-24 text-left"><span className="inline-block text-[9px] font-black uppercase px-2.5 py-1 rounded-full bg-rose-100 text-rose-500">Unpaid</span></span></div>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 my-6"></div>

        {/* ── Body ── */}
        <div className="flex gap-5">
          {/* LEFT */}
          <div className="w-[58%] space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <User size={11} className="text-white" strokeWidth={2.5} />, label: 'Billed By', name: profile.name, addr: `${profile.address}, ${profile.city}, ${profile.state} – ${profile.pincode}`, ph: profile.phone, gst: profile.gstin },
                { icon: <Building2 size={11} className="text-white" strokeWidth={2.5} />, label: 'Billed To', name: selectedCustomer?.name || 'Party Name', addr: `${selectedCustomer?.address || '—'}, ${selectedCustomer?.city || '—'}, ${selectedCustomer?.state || '—'} – ${selectedCustomer?.pincode || '—'}`, ph: selectedCustomer?.phone, gst: selectedCustomer?.gstin },
              ].map((b, i) => (
                <div key={i} className="rounded-lg border border-slate-100 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: pfNavy }}>
                    {b.icon}<span className="text-[9px] font-black text-white uppercase tracking-wide">{b.label}</span>
                  </div>
                  <div className="p-3">
                    <p className="text-[11px] font-black text-slate-900">{b.name}</p>
                    <p className="text-[9px] text-slate-500 leading-relaxed mt-0.5">{b.addr}</p>
                    {b.ph && <p className="text-[9px] text-slate-500">Ph: {b.ph}</p>}
                    {b.gst && <><p className="text-[7px] font-bold text-slate-400 uppercase mt-1.5">GSTIN</p><p className="text-[10px] font-black" style={{ color: pfNavy }}>{b.gst}</p></>}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100">
                <Globe size={13} style={{ color: pfTeal }} strokeWidth={2.5} />
                <div><p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Place of Supply</p><p className="text-[10px] font-black text-slate-800">{selectedCustomer?.state || profile.state}</p></div>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-100">
                <Globe size={13} style={{ color: pfTeal }} strokeWidth={2.5} />
                <div><p className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Country of Supply</p><p className="text-[10px] font-black text-slate-800">India</p></div>
              </div>
            </div>
            {/* table */}
            <div className="rounded-lg overflow-hidden border border-slate-100">
              <table className="w-full text-left border-collapse text-[8px]">
                <thead>
                  <tr className="text-white font-black uppercase" style={{ backgroundColor: pfNavy }}>
                    <th className="px-1.5 py-2">#</th><th className="px-1.5 py-2">Item Description</th><th className="px-1 py-2 text-center">HSN</th><th className="px-1 py-2 text-center">Qty</th><th className="px-1 py-2 text-right">Rate</th><th className="px-1 py-2 text-center">GST%</th><th className="px-1 py-2 text-right">Taxable</th>
                    {gstType === GSTType.CGST_SGST ? (<><th className="px-1 py-2 text-right">SGST</th><th className="px-1 py-2 text-right">CGST</th></>) : (<th className="px-1 py-2 text-right" colSpan={2}>IGST</th>)}
                    <th className="px-1.5 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item, idx) => {
                    const taxable = r2(item.quantity * item.rate);
                    const itemTax = r2(taxable * item.gstRate / 100);
                    const halfTax = r2(itemTax / 2);
                    return (
                      <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                        <td className="px-1.5 py-2 text-slate-400 font-bold">{idx + 1}</td>
                        <td className="px-1.5 py-2 font-semibold text-slate-800">{item.description || 'No description'}</td>
                        <td className="px-1 py-2 text-center text-slate-500">{item.hsnCode || '—'}</td>
                        <td className="px-1 py-2 text-center font-black text-slate-800">{item.quantity}</td>
                        <td className="px-1 py-2 text-right text-slate-600">{item.rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="px-1 py-2 text-center text-slate-500">{item.gstRate}%</td>
                        <td className="px-1 py-2 text-right text-slate-700">{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        {gstType === GSTType.CGST_SGST ? (<><td className="px-1 py-2 text-right text-slate-600">{halfTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td className="px-1 py-2 text-right text-slate-600">{halfTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></>) : (<td className="px-1 py-2 text-right text-slate-600" colSpan={2}>{itemTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>)}
                        <td className="px-1.5 py-2 text-right font-black text-slate-900">{(taxable + itemTax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT — payment hero */}
          <div className="flex-1">
            <div className="rounded-2xl overflow-hidden border-2" style={{ borderColor: pfTeal }}>
              <div className="flex items-center justify-center gap-2 py-2.5" style={{ backgroundColor: pfNavy }}>
                <Lock size={12} className="text-white" strokeWidth={2.5} /><span className="text-[11px] font-black text-white uppercase tracking-widest">Pay Instantly</span>
              </div>
              <div className="flex flex-col items-center px-4 py-4" style={{ backgroundColor: pfTeal }}>
                {profile.upiId && upiQrUrl ? (<>
                  <p className="text-[9px] font-black text-white uppercase tracking-widest mb-2">Scan to Pay</p>
                  <div className="bg-white rounded-lg p-2"><img src={upiQrUrl} className="w-[110px] h-[110px]" alt="UPI QR" /></div>
                  <p className="text-[9px] font-black text-white uppercase tracking-widest mt-3 mb-1.5">UPI ID</p>
                  <div className="bg-white rounded-md py-1.5 px-3 w-full text-center"><span className="text-[12px] font-black" style={{ color: pfNavy }}>{profile.upiId}</span></div>
                </>) : (
                  <p className="text-[9px] font-black text-white uppercase tracking-widest py-4">Payment Details Below</p>
                )}
              </div>
              <div className="text-center px-4 py-3" style={{ backgroundColor: pfTealDark }}>
                <p className="text-[9px] font-black text-white uppercase tracking-widest">Total Amount Due</p>
                <p className="text-[34px] font-black text-white leading-none mt-1">₹{roundedTotal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</p>
                <p className="text-[9px] font-medium text-white/90 mt-1.5 leading-snug">{numberToWords(roundedTotal)}</p>
              </div>
              <div className="bg-white px-3 py-2.5">
                <p className="text-center text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: pfTeal }}>We Accept</p>
                {upiAppMarks}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom: Payment details + Summary ── */}
        <div className="flex gap-6 mt-6">
          <div className="w-[58%] space-y-4">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide mb-2" style={{ color: pfNavy }}><Receipt size={12} strokeWidth={2.5} />Payment Details</p>
              <div className="space-y-1.5 text-[10px]">
                {profile.bankName && <div className="flex items-center gap-2"><Landmark size={11} className="text-slate-400" /><span className="text-slate-500 w-20">Bank</span><span className="font-bold text-slate-800">{profile.bankName}</span></div>}
                {profile.accountNumber && <div className="flex items-center gap-2"><CreditCard size={11} className="text-slate-400" /><span className="text-slate-500 w-20">Account No.</span><span className="font-bold text-slate-800">{profile.accountNumber}</span></div>}
                {profile.ifscCode && <div className="flex items-center gap-2"><FileText size={11} className="text-slate-400" /><span className="text-slate-500 w-20">IFSC</span><span className="font-bold text-slate-800">{profile.ifscCode}</span></div>}
                {profile.upiId && <div className="flex items-center gap-2"><Smartphone size={11} className="text-slate-400" /><span className="text-slate-500 w-20">UPI ID</span><span className="font-black" style={{ color: pfTeal }}>{profile.upiId}</span></div>}
              </div>
            </div>
            {profile.termsAndConditions && (<div>
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: pfNavy }}><ShieldCheck size={12} strokeWidth={2.5} />Terms & Conditions</p>
              <p className="text-[9px] text-slate-500 leading-relaxed whitespace-pre-line">{profile.termsAndConditions}</p>
            </div>)}
            {profile.defaultNotes && (<div>
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: pfNavy }}><StickyNote size={12} strokeWidth={2.5} />Additional Notes</p>
              <p className="text-[9px] text-slate-500 italic leading-relaxed">{profile.defaultNotes}</p>
            </div>)}
          </div>
          <div className="flex-1">
            <div className="rounded-xl border border-slate-100 overflow-hidden">
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wide px-4 py-2.5 bg-slate-50" style={{ color: pfNavy }}><Receipt size={12} strokeWidth={2.5} />Invoice Summary</p>
              <div className="px-4 py-2 text-[10px]">
                <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-500">Sub Total</span><span className="font-black text-slate-800">₹{subTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                {gstType === GSTType.CGST_SGST ? (<>
                  <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-500">CGST</span><span className="font-bold text-slate-700">₹{r2(taxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-500">SGST</span><span className="font-bold text-slate-700">₹{r2(taxAmount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
                </>) : (<div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-500">IGST</span><span className="font-bold text-slate-700">₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>)}
                {roundOff !== 0 && <div className="flex justify-between py-1.5 border-b border-slate-100"><span className="text-slate-500">Round Off</span><span className="font-bold text-slate-700">{roundOff > 0 ? '+' : ''}₹{Math.abs(roundOff).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>}
              </div>
              <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: pfNavy }}>
                <span className="text-[12px] font-black text-white uppercase tracking-wide">Total Due</span>
                <span className="text-[22px] font-black text-white">₹{roundedTotal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-between items-end pt-5 mt-5 border-t border-slate-100">
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

  const invoiceTemplate = profile.theme.templateId === 'modern-2'
    ? modern2Template
    : profile.theme.templateId === 'geometric'
      ? geometricTemplate
      : profile.theme.templateId === 'payment-first'
        ? paymentFirstTemplate
        : modern1Template;

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
        <div className="flex justify-between items-center mb-4 gap-3">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold font-poppins text-slate-900 tracking-tight">Invoice Maker</h1>
            <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">
              {allInvoices.length} invoice{allInvoices.length !== 1 ? 's' : ''}
              {q ? ` · ${filteredInvoices.length} matching` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => { haptic('light'); loadData(); }}
              className="bg-white border border-slate-200 p-3 sm:px-6 sm:py-4 rounded-2xl font-bold flex items-center gap-2 hover:bg-slate-50 active:scale-95 transition-all font-poppins text-sm text-slate-500 shadow-sm"
            >
              <RotateCcw size={16} /> <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => { haptic('medium'); handleNewInvoice(); }}
              className="bg-profee-blue text-white px-5 sm:px-10 py-3 sm:py-4 rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-indigo-100 active:scale-95 transition-all font-poppins whitespace-nowrap"
            >
              <Plus size={20} /> <span className="hidden sm:inline">Create Invoice</span><span className="sm:hidden">Create</span>
            </button>
          </div>
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

            {/* ── Mobile card list (shown < md) ── */}
            <div className="md:hidden divide-y divide-slate-50">
              {filteredInvoices.length === 0 ? (
                <p className="px-6 py-10 text-center text-sm text-slate-400 font-medium">No invoices match &ldquo;{searchQuery}&rdquo;</p>
              ) : (
                filteredInvoices.map(inv => {
                  const tax = (inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0);
                  const custObj = customers.find(c => c.id === inv.customerId) || null;
                  return (
                    <div
                      key={inv.id}
                      className={`px-5 py-4 active:bg-indigo-50/40 transition-colors ${deletingInvoiceId === inv.id ? 'deleting-item' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900 font-poppins">{inv.invoiceNumber}</p>
                          <p className="text-sm font-medium text-slate-600 truncate">{inv.customerName}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{formatDate(inv.date)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-black text-slate-900 font-poppins">{inr(inv.totalAmount)}</p>
                          <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full mt-1 ${
                            inv.status === 'Paid'    ? 'bg-emerald-100 text-emerald-700' :
                            inv.status === 'Partial' ? 'bg-amber-100 text-amber-700'    :
                                                       'bg-rose-100 text-rose-700'
                          }`}>{inv.status}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => { haptic('light'); handlePreviewInvoice(inv); }} title="Preview" className="flex-1 py-2 rounded-xl bg-indigo-50 text-profee-blue text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"><Eye size={14} /> View</button>
                        <button onClick={() => { haptic('light'); handleEditInvoice(inv); }} title="Edit" className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"><Pencil size={14} /> Edit</button>
                        <button onClick={() => { haptic('light'); setDownloadTarget({ invoice: inv, customer: custObj }); }} title="PDF" className="flex-1 py-2 rounded-xl bg-indigo-50 text-profee-blue text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"><Download size={14} /> PDF</button>
                        <button
                          onClick={() => { haptic('medium'); handleShareInvoiceWhatsApp(inv, custObj); }}
                          title="Share via WhatsApp"
                          disabled={whatsappLoading === inv.id}
                          className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-60"
                        >
                          {whatsappLoading === inv.id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />} WA
                        </button>
                        {(inv.status === 'Unpaid' || inv.status === 'Partial') && (
                          <button onClick={() => { haptic('medium'); setCollectModal({ open: true, invoice: inv }); }} title="Collect" className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"><IndianRupee size={14} /> Collect</button>
                        )}
                        {inv.status === 'Paid' && (
                          <button onClick={() => { haptic('light'); handleShowReceiptFromPaidInvoice(inv); }} title="Receipt" className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-600 text-xs font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"><Receipt size={14} /> Receipt</button>
                        )}
                        <button onClick={e => { haptic('medium'); handleDeleteInvoice(inv, e); }} title="Delete" className="p-2 rounded-xl bg-rose-50 text-rose-400 active:scale-95 transition-all"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ── Table (hidden on mobile) ── */}
            <div className="hidden md:block overflow-x-auto">
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
                              {/* Preview — navigate to in-app preview card */}
                              <button
                                onClick={() => handlePreviewInvoice(inv)}
                                title="Preview Invoice"
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
                              {/* Download PDF */}
                              <button
                                onClick={() => setDownloadTarget({ invoice: inv, customer: custObj })}
                                title="Download PDF"
                                className="p-2 rounded-xl bg-indigo-50 text-profee-blue hover:bg-profee-blue hover:text-white transition-all"
                              >
                                <Download size={15} />
                              </button>
                              {/* WhatsApp — share PDF */}
                              <button
                                onClick={() => handleShareInvoiceWhatsApp(inv, custObj)}
                                title="Share via WhatsApp"
                                disabled={whatsappLoading === inv.id}
                                className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all disabled:opacity-60"
                              >
                                {whatsappLoading === inv.id
                                  ? <Loader2 size={15} className="animate-spin" />
                                  : <MessageCircle size={15} />}
                              </button>
                              {/* Collect Payment — for unpaid / partially-paid invoices */}
                              {(inv.status === 'Unpaid' || inv.status === 'Partial') && (
                                <button
                                  onClick={() => setCollectModal({ open: true, invoice: inv })}
                                  title="Collect Payment"
                                  className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all"
                                >
                                  <IndianRupee size={15} />
                                </button>
                              )}
                              {/* Receipt — for fully paid invoices */}
                              {inv.status === 'Paid' && (
                                <button
                                  onClick={() => handleShowReceiptFromPaidInvoice(inv)}
                                  title="Download Receipt"
                                  className="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all"
                                >
                                  <Receipt size={15} />
                                </button>
                              )}
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
            </div>{/* end hidden md:block table wrapper */}

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
            customerPhone={pdfModal.customer?.phone}
            whatsappMessage={`Dear ${pdfModal.invoice.customerName},\n\nPlease find your Invoice *${pdfModal.invoice.invoiceNumber}* for ₹${pdfModal.invoice.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}.\n\nThank you for your business!\n\nRegards,\n${profile.name}`}
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

        {/* HSN Search Modal (invoice line items) */}
        {hsnModalItemId && (
          <HSNSearchModal
            isOpen={true}
            onClose={() => setHsnModalItemId(null)}
            onSelect={(code, desc, gst) => {
              handleHSNSelect(hsnModalItemId, code, desc, gst);
              setHsnModalItemId(null);
            }}
            minDigits={hsnMinDigits}
            currentValue={items.find(i => i.id === hsnModalItemId)?.hsnCode ?? ''}
          />
        )}

        {/* HSN Search Modal (quick-add inventory item) */}
        {showHSNModalForInvAdd && (
          <HSNSearchModal
            isOpen={true}
            onClose={() => setShowHSNModalForInvAdd(false)}
            onSelect={(code, _desc, gst) => {
              setAddInvForm(f => ({ ...f, hsnCode: code, gstRate: String(gst) }));
              setShowHSNModalForInvAdd(false);
            }}
            minDigits={hsnMinDigits}
            currentValue={addInvForm.hsnCode}
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

        {/* ── Collect Payment modal ── */}
        {collectModal.open && collectModal.invoice && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 w-full max-w-md shadow-2xl font-poppins animate-sheet-up sm:animate-in sm:fade-in sm:zoom-in-95 duration-200 pb-safe">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                    <IndianRupee size={18} className="text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Collect Payment</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{collectModal.invoice.invoiceNumber} · {collectModal.invoice.customerName}</p>
                  </div>
                </div>
                <button
                  onClick={() => { setCollectModal({ open: false, invoice: null }); setCollectAmount(''); setCollectDesc(''); }}
                  className="p-2 hover:bg-slate-50 rounded-xl transition-all"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
              <div className="bg-indigo-50 rounded-2xl p-4 flex justify-between items-center mb-6 border border-indigo-100">
                <span className="text-xs font-bold text-profee-blue uppercase tracking-widest">Invoice Total</span>
                <span className="text-xl font-bold text-profee-blue">{inr(collectModal.invoice.totalAmount)}</span>
              </div>
              <div className="space-y-4 font-poppins">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Amount Received (₹) *</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700"
                    value={collectAmount}
                    onChange={e => setCollectAmount(e.target.value)}
                    placeholder={collectModal.invoice.totalAmount.toString()}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-4">Description</label>
                  <input
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 font-bold text-slate-700"
                    value={collectDesc}
                    onChange={e => setCollectDesc(e.target.value)}
                    placeholder="e.g. NEFT, UPI, Cash..."
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => { setCollectModal({ open: false, invoice: null }); setCollectAmount(''); setCollectDesc(''); }}
                  className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all border border-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { haptic('heavy'); handleCollectPayment(); }}
                  disabled={collectSaving || !collectAmount}
                  className="flex-1 py-4 rounded-2xl font-bold bg-emerald-500 text-white active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl shadow-emerald-100 disabled:opacity-50"
                >
                  {collectSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {collectSaving ? 'Saving...' : 'Record & Get Receipt'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Receipt detail modal ── */}
        {receiptModal.open && receiptModal.entry && receiptModal.customer && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="bg-white rounded-t-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 w-full max-w-md shadow-2xl font-poppins animate-sheet-up sm:animate-in sm:fade-in sm:zoom-in-95 duration-200 pb-safe">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                    <Receipt size={18} className="text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Payment Receipt</h3>
                </div>
                <button onClick={() => setReceiptModal({ open: false, entry: null, customer: null })} className="p-2 hover:bg-slate-50 rounded-xl transition-all">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>
              <div className="space-y-5">
                <div className="bg-slate-50 rounded-2xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Date</span>
                    <span className="text-sm font-bold text-slate-700">{receiptModal.entry.date}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Customer</span>
                    <span className="text-sm font-bold text-slate-700">{receiptModal.customer.name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Description</span>
                    <span className="text-sm font-bold text-slate-700">{receiptModal.entry.description}</span>
                  </div>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-6 flex justify-between items-center border border-emerald-100">
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Amount Received</span>
                  <span className="text-2xl font-bold text-emerald-600">{inr(receiptModal.entry.amount)}</span>
                </div>
                <div className="bg-slate-900 rounded-2xl p-6 flex justify-between items-center text-white">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Balance After</span>
                  <span className="text-lg font-bold">
                    ₹{Math.abs(receiptModal.entry.runningBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    <span className="text-[10px] opacity-50 ml-1">{receiptModal.entry.runningBalance >= 0 ? 'Dr' : 'Cr'}</span>
                  </span>
                </div>
              </div>
              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setReceiptModal({ open: false, entry: null, customer: null })}
                  className="flex-1 py-4 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all border border-slate-100"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const { entry, customer } = receiptModal;
                    setReceiptModal({ open: false, entry: null, customer: null });
                    setReceiptPdfData({ open: true, entry, customer });
                  }}
                  className="flex-1 py-4 rounded-2xl font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  <Eye size={16} /> View PDF
                </button>
                <button
                  onClick={() => {
                    const { entry, customer } = receiptModal;
                    setReceiptModal({ open: false, entry: null, customer: null });
                    setReceiptDownloadTarget({
                      document: (
                        <ReceiptPDF
                          entry={entry!}
                          customer={customer!}
                          businessName={profile.name}
                          businessInfo={{
                            gstin: profile.gstin || '',
                            address: [profile.address, profile.city, profile.state, profile.pincode].filter(Boolean).join(', '),
                            phone: profile.phone || '',
                            email: profile.email || '',
                          }}
                          logoUrl={profile.theme?.logoUrl}
                          signatureUrl={profile.signatureUrl}
                        />
                      ),
                      fileName: `Receipt-${customer!.name.replace(/\s+/g, '-')}-${entry!.date}.pdf`,
                    });
                  }}
                  className="flex-1 py-4 rounded-2xl font-bold bg-profee-blue text-white hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xl shadow-indigo-100"
                >
                  <Download size={16} /> Download
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Receipt PDF preview modal ── */}
        {receiptPdfData.open && receiptPdfData.entry && receiptPdfData.customer && (
          <PDFPreviewModal
            open={receiptPdfData.open}
            onClose={() => setReceiptPdfData({ open: false, entry: null, customer: null })}
            document={
              <ReceiptPDF
                entry={receiptPdfData.entry}
                customer={receiptPdfData.customer}
                businessName={profile.name}
                businessInfo={{
                  gstin: profile.gstin || '',
                  address: [profile.address, profile.city, profile.state, profile.pincode].filter(Boolean).join(', '),
                  phone: profile.phone || '',
                  email: profile.email || '',
                }}
                logoUrl={profile.theme?.logoUrl}
                signatureUrl={profile.signatureUrl}
              />
            }
            fileName={`Receipt-${receiptPdfData.customer.name.replace(/\s+/g, '-')}-${receiptPdfData.entry.date}.pdf`}
            customerPhone={receiptPdfData.customer.phone}
            whatsappMessage={`Dear ${receiptPdfData.customer.name},\n\nYour payment of ₹${receiptPdfData.entry.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} has been received. Please find your receipt attached.\n\nRegards,\n${profile.name}`}
          />
        )}

        {/* ── Headless receipt direct-download ── */}
        {receiptDownloadTarget && (
          <PDFDirectDownload
            document={receiptDownloadTarget.document}
            fileName={receiptDownloadTarget.fileName}
            onDone={() => setReceiptDownloadTarget(null)}
          />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════
  //  PREVIEW VIEW: Formatted invoice
  // ═══════════════════════════════════════════
  if (mode === 'preview') {
    return (
      <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20 font-poppins">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4 sm:mb-6 no-print">
          <div className="flex items-center gap-3 sm:gap-4">
            <button onClick={() => { haptic('light'); setMode('list'); }} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors"><ArrowLeft size={18} /> All Invoices</button>
            <div className="w-px h-5 bg-slate-200" />
            <button onClick={() => { haptic('light'); setMode('editing'); }} className="flex items-center gap-2 text-profee-blue font-bold text-sm hover:underline"><Edit3 size={18} /> Edit</button>
          </div>
          <div className="flex gap-2 sm:gap-4 flex-wrap">
             {saveSuccess && <div className="flex items-center gap-2 text-emerald-500 px-2"><CheckCircle size={18} /><span className="text-sm font-bold">Saved!</span></div>}
             <button onClick={() => { haptic('light'); handleNewInvoice(); }} className="flex-1 sm:flex-none bg-white border border-slate-200 px-4 sm:px-8 py-3 sm:py-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"><Plus size={16} /> <span className="hidden sm:inline">New Invoice</span><span className="sm:hidden">New</span></button>
             {onCreateChallan && editingInvoice && (
               <button
                 onClick={() => { haptic('medium'); onCreateChallan(editingInvoice); }}
                 className="flex-1 sm:flex-none bg-amber-50 border border-amber-200 text-amber-700 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-amber-100 active:scale-95 transition-all shadow-sm"
                 title="Create a Delivery Challan from this invoice"
               >
                 <FileText size={16} /> <span className="hidden sm:inline">Delivery Challan</span><span className="sm:hidden">Challan</span>
               </button>
             )}
             {editingInvoice && (editingInvoice.status === 'Unpaid' || editingInvoice.status === 'Partial') && (
               <button
                 onClick={() => { haptic('medium'); setCollectModal({ open: true, invoice: editingInvoice }); }}
                 className="flex-1 sm:flex-none bg-emerald-500 text-white px-4 sm:px-8 py-3 sm:py-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 active:scale-95 transition-all shadow-lg shadow-emerald-100"
               >
                 <IndianRupee size={16} /> <span className="hidden sm:inline">Collect Payment</span><span className="sm:hidden">Collect</span>
               </button>
             )}
             <button onClick={() => { haptic('light'); window.print(); }} className="hidden sm:flex flex-1 sm:flex-none bg-white border border-slate-200 px-4 sm:px-10 py-3 sm:py-4 rounded-2xl text-xs font-bold items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all shadow-sm"><Printer size={16} /> Print</button>
             <button
               onClick={() => { haptic('light'); handleShareInvoiceWhatsApp(buildCurrentInvoice(), selectedCustomer || null); }}
               className="flex-1 sm:flex-none bg-emerald-500 text-white px-4 sm:px-8 py-3 sm:py-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-emerald-600 active:scale-95 transition-all shadow-lg shadow-emerald-100"
             >
               <MessageCircle size={16} /> <span className="hidden sm:inline">WhatsApp</span><span className="sm:hidden">WA</span>
             </button>
             <button
               onClick={() => { haptic('medium'); setDownloadTarget({ invoice: buildCurrentInvoice(), customer: selectedCustomer || null }); }}
               className="flex-1 sm:flex-none bg-profee-blue text-white px-4 sm:px-10 py-3 sm:py-4 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all shadow-lg shadow-indigo-100"
             >
               <Download size={16} /> <span className="hidden sm:inline">Download PDF</span><span className="sm:hidden">PDF</span>
             </button>
          </div>
        </div>
        <div className="bg-slate-100 p-2 sm:p-12 min-h-screen rounded-2xl sm:rounded-[3rem] no-print overflow-x-auto"><div className="print-area mx-auto w-[760px] min-w-[760px] sm:w-full sm:min-w-0 sm:max-w-[850px]">{invoiceTemplate}</div></div>
        <div className="hidden print:block">{invoiceTemplate}</div>
        <style>{`@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; padding: 0 !important; width: 100%; box-shadow: none !important; background: white !important; } .no-print { display: none !important; } @page { size: A4; margin: 10mm; } }`}</style>

        {/* Direct download — renders PDF invisibly and auto-downloads */}
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
      </div>
    );
  }

  // ═══════════════════════════════════════════
  //  EDITING VIEW: Invoice creation form
  // ═══════════════════════════════════════════
  return (
    <div className="max-w-7xl mx-auto space-y-6 sm:space-y-10 animate-in fade-in slide-in-from-bottom-4 pb-20">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-2 sm:mb-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <button onClick={() => { haptic('light'); setMode('list'); }} className="flex items-center gap-2 text-slate-500 font-bold text-sm hover:text-slate-700 transition-colors font-poppins p-2 -ml-2"><ArrowLeft size={18} /></button>
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold font-poppins text-slate-900 tracking-tight">Invoice Maker</h1>
            <p className="text-xs text-slate-400 font-medium mt-1 uppercase tracking-widest">
              {editingInvoice ? `Editing ${editingInvoice.invoiceNumber}` : `New Bill Entry \u2022 ${invoiceNumber}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 sm:gap-4 items-center flex-wrap">
           {error && <span className="text-sm font-bold text-rose-500 font-poppins w-full sm:w-auto">{error}</span>}
           <button onClick={() => { haptic('light'); setMode('preview'); }} className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-700 px-5 sm:px-10 py-3 sm:py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-50 active:scale-95 transition-all font-poppins"><Eye size={18} /> Preview</button>
           <button onClick={() => { haptic('heavy'); handleFinalize(); }} disabled={saving} className="flex-1 sm:flex-none bg-profee-blue text-white px-6 sm:px-12 py-3 sm:py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-indigo-100 active:scale-95 transition-all font-poppins disabled:opacity-50">
             {saving ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : editingInvoice ? <><Save size={18} /> Update</> : <><Save size={18} /> Finalize</>}
           </button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-10 premium-shadow border border-slate-50 space-y-6 sm:space-y-8 font-poppins">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-8">
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
          <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-10 premium-shadow border border-slate-50 space-y-6 sm:space-y-8 font-poppins">
            <div className="flex justify-between items-center mb-2 sm:mb-4 gap-2 flex-wrap">
              <h3 className="text-lg sm:text-xl font-bold flex items-center gap-3"><Plus className="text-profee-blue" size={22} /> Particulars</h3>
              <div className="flex items-center gap-3">
                {profile.businessType === 'service' && (
                  <button
                    type="button"
                    onClick={openServicesPicker}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors text-xs font-bold border border-indigo-200"
                  >
                    <Briefcase size={14} /> Pick from Services
                  </button>
                )}
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
                <div key={item.id} className="animate-in fade-in duration-300">
                  {/* Mobile layout: stacked card */}
                  <div className="sm:hidden bg-slate-50/60 rounded-2xl p-4 space-y-3 border border-slate-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Item {items.indexOf(item) + 1}</span>
                      <button onClick={() => handleRemoveItem(item.id)} className="p-2 text-rose-400 active:bg-rose-50 rounded-xl transition-all"><Trash2 size={16} /></button>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Description *</label>
                      <div className="relative">
                        <input
                          placeholder="Product or service"
                          autoComplete="off"
                          className="w-full bg-white border-none rounded-xl px-4 py-3 text-sm font-medium shadow-sm"
                          value={item.description}
                          onChange={e => handleItemChange(item.id, 'description', e.target.value)}
                          onFocus={() => { setActiveDescItemId(item.id); if (profile.businessType === 'trading') ensureInventoryLoaded(); }}
                          onBlur={() => setTimeout(() => setActiveDescItemId(null), 160)}
                        />
                        {profile.businessType === 'trading' && activeDescItemId === item.id && (() => {
                          const q = item.description.toLowerCase().trim();
                          const filtered = (q.length === 0 ? inventoryItems : inventoryItems.filter(inv => inv.name.toLowerCase().includes(q) || (inv.hsnCode || '').toLowerCase().includes(q))).slice(0, 6);
                          return (
                            <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                              <button
                                type="button"
                                onMouseDown={() => { setAddInvItemId(item.id); setAddInvForm(f => ({ ...f, name: item.description.trim() })); setActiveDescItemId(null); setShowAddInventoryItemModal(true); }}
                                className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100 border-b border-amber-100 transition-colors text-left"
                              >
                                <Plus size={14} className="text-amber-600 flex-shrink-0" />
                                <span className="text-sm font-bold text-amber-700">Add item to inventory</span>
                              </button>
                              {filtered.map(inv => (
                                <button key={inv.id} type="button" onMouseDown={() => handleInlinePickInventoryItem(item.id, inv)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-50 border-b border-slate-50 last:border-0 transition-colors text-left">
                                  <div className="min-w-0"><p className="text-sm font-bold text-slate-800 truncate">{inv.name}</p><p className="text-xs text-slate-400 mt-0.5">HSN: {inv.hsnCode || '—'} · GST {inv.gstRate}%</p></div>
                                  <div className="text-right flex-shrink-0 ml-3"><p className="text-sm font-black text-slate-900">₹{inv.sellingPrice.toLocaleString('en-IN')}</p></div>
                                </button>
                              ))}
                              {filtered.length === 0 && (
                                <p className="px-4 py-3 text-xs text-slate-400 font-medium">No matching items — add a new one above.</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <input placeholder="Note (optional)" className="w-full bg-transparent border border-dashed border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-500 placeholder-slate-300 focus:outline-none focus:border-indigo-200" value={item.notes || ''} onChange={e => handleItemChange(item.id, 'notes', e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1 pb-4">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">HSN/SAC</label>
                        <HSNInput
                          value={item.hsnCode}
                          onChange={v => handleItemChange(item.id, 'hsnCode', v)}
                          onSelectEntry={(code, desc, gst) => handleHSNSelect(item.id, code, desc, gst)}
                          minDigits={hsnMinDigits}
                          className="w-full bg-white border-none rounded-xl px-3 py-3 pr-8 text-sm font-medium font-mono shadow-sm focus:outline-none"
                          placeholder="e.g. 9954"
                          onOpenModal={() => setHsnModalItemId(item.id)}
                        />
                      </div>
                      <div className="space-y-1"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Qty</label><input type="number" inputMode="decimal" className="w-full bg-white border-none rounded-xl px-3 py-3 text-sm font-black text-center shadow-sm" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)} /></div>
                      <div className="space-y-1"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Rate (₹)</label><input type="number" inputMode="decimal" className="w-full bg-white border-none rounded-xl px-3 py-3 text-sm font-black text-center text-profee-blue shadow-sm" value={item.rate} onChange={e => handleItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)} /></div>
                      <div className="space-y-1"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">GST %</label><select className="w-full bg-white border-none rounded-xl px-3 py-3 text-sm font-bold text-center appearance-none shadow-sm" value={item.gstRate} onChange={e => handleItemChange(item.id, 'gstRate', parseFloat(e.target.value))}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></div>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                      <span className="text-xs text-slate-400 font-medium">Amount</span>
                      <span className="text-base font-black text-slate-900">₹{r2(item.quantity * item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  {/* Desktop layout: original 12-col grid */}
                  <div className="hidden sm:grid grid-cols-12 gap-3 items-start">
                    <div className="col-span-3 space-y-1.5">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-4">Description</label>
                      <div className="relative">
                        <input
                          placeholder="Product or service"
                          autoComplete="off"
                          className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3 text-sm font-medium"
                          value={item.description}
                          onChange={e => handleItemChange(item.id, 'description', e.target.value)}
                          onFocus={() => { setActiveDescItemId(item.id); if (profile.businessType === 'trading') ensureInventoryLoaded(); }}
                          onBlur={() => setTimeout(() => setActiveDescItemId(null), 160)}
                        />
                        {profile.businessType === 'trading' && activeDescItemId === item.id && (() => {
                          const q = item.description.toLowerCase().trim();
                          const filtered = (q.length === 0 ? inventoryItems : inventoryItems.filter(inv => inv.name.toLowerCase().includes(q) || (inv.hsnCode || '').toLowerCase().includes(q))).slice(0, 6);
                          return (
                            <div className="absolute top-full left-0 right-0 z-40 mt-1 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
                              <button
                                type="button"
                                onMouseDown={() => { setAddInvItemId(item.id); setAddInvForm(f => ({ ...f, name: item.description.trim() })); setActiveDescItemId(null); setShowAddInventoryItemModal(true); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 border-b border-amber-100 transition-colors text-left"
                              >
                                <Plus size={14} className="text-amber-600 flex-shrink-0" />
                                <span className="text-sm font-bold text-amber-700">Add item to inventory</span>
                              </button>
                              {filtered.map(inv => (
                                <button key={inv.id} type="button" onMouseDown={() => handleInlinePickInventoryItem(item.id, inv)} className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-amber-50 border-b border-slate-50 last:border-0 transition-colors text-left group">
                                  <div className="min-w-0"><p className="text-sm font-bold text-slate-800 group-hover:text-amber-800 truncate">{inv.name}</p><p className="text-xs text-slate-400 mt-0.5">HSN: {inv.hsnCode || '—'} · {inv.unit} · GST {inv.gstRate}%</p></div>
                                  <div className="text-right flex-shrink-0 ml-3"><p className="text-sm font-black text-slate-900">₹{inv.sellingPrice.toLocaleString('en-IN')}</p>{(inv.stock ?? 0) > 0 ? <p className="text-xs text-emerald-600">Stock: {inv.stock}</p> : <p className="text-xs text-rose-400">Out of stock</p>}</div>
                                </button>
                              ))}
                              {filtered.length === 0 && (
                                <p className="px-4 py-2.5 text-xs text-slate-400 font-medium">No matching items — add a new one above.</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <input placeholder="Add a note or specification… (optional)" className="w-full bg-transparent border border-dashed border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-500 placeholder-slate-300 focus:outline-none focus:border-indigo-200 transition-colors" value={item.notes || ''} onChange={e => handleItemChange(item.id, 'notes', e.target.value)} />
                    </div>
                    <div className="col-span-2 space-y-2 pb-4">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-3">HSN/SAC</label>
                      <HSNInput
                        value={item.hsnCode}
                        onChange={v => handleItemChange(item.id, 'hsnCode', v)}
                        onSelectEntry={(code, desc, gst) => handleHSNSelect(item.id, code, desc, gst)}
                        minDigits={hsnMinDigits}
                        className="w-full bg-slate-50 border-none rounded-2xl px-3 py-3 pr-8 text-sm font-medium font-mono focus:outline-none"
                        placeholder="e.g. 9954"
                        onOpenModal={() => setHsnModalItemId(item.id)}
                      />
                    </div>
                    <div className="col-span-2 space-y-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-2">Qty</label><input type="number" className="w-full bg-slate-50 border-none rounded-2xl px-3 py-3 text-sm font-black text-center" value={item.quantity} onChange={e => handleItemChange(item.id, 'quantity', parseFloat(e.target.value) || 0)} /></div>
                    <div className="col-span-2 space-y-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-4">Rate (₹)</label><input type="number" className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-black text-center text-profee-blue" value={item.rate} onChange={e => handleItemChange(item.id, 'rate', parseFloat(e.target.value) || 0)} /></div>
                    <div className="col-span-2 space-y-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-4">GST %</label><select className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3 text-sm font-bold text-center appearance-none" value={item.gstRate} onChange={e => handleItemChange(item.id, 'gstRate', parseFloat(e.target.value))}>{[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}</select></div>
                    <div className="col-span-1 pb-2 flex justify-center"><button onClick={() => handleRemoveItem(item.id)} className="p-3 text-rose-400 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={18} /></button></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={handleAddItem} className="flex items-center gap-2 font-bold text-sm px-6 py-3 rounded-2xl bg-slate-50 text-profee-blue hover:bg-indigo-50 transition-all border border-dashed border-indigo-200"><Plus size={18} /> Add Line Item</button>
              {profile.businessType === 'trading' && (
                <button
                  type="button"
                  onClick={openInventoryPicker}
                  className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-sm font-bold border border-dashed border-amber-200"
                >
                  <Package size={16} /> Pick from Inventory
                </button>
              )}
            </div>
          </div>

          {/* ── GST Classification (GSTR-1 compliance) ── */}
          {selectedCustomerId && (
            <div className="bg-white rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-10 premium-shadow border border-slate-50 space-y-6 font-poppins">
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
        <div className="lg:col-span-4 space-y-6 sm:space-y-8 font-poppins">
           <div className="bg-slate-900 rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10"><CheckCircle size={100} /></div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-8">Summary Preview</p>
              <div className="space-y-4 mb-10">
                 <div className="flex justify-between items-center opacity-80"><span className="text-sm font-medium">Sub Total</span><span className="text-base font-bold">₹{subTotal.toLocaleString()}</span></div>
                 <div className="flex justify-between items-center text-emerald-400"><span className="text-sm font-medium">Tax Amount</span><span className="text-base font-bold">+ ₹{taxAmount.toLocaleString()}</span></div>
              </div>
              <div className="pt-8 border-t border-white/10 space-y-2"><p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Grand Total</p><h3 className="text-4xl font-black">₹{roundedTotal.toLocaleString()}</h3></div>
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

      {/* ── Quick-add item to inventory (from description dropdown) ── */}
      {showAddInventoryItemModal && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-[2rem] sm:rounded-2xl shadow-2xl w-full max-w-md sm:mx-4 animate-sheet-up sm:animate-none">
            <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold font-poppins text-slate-900 flex items-center gap-2">
                <Package size={18} className="text-amber-600" /> Add Item to Inventory
              </h2>
              <button onClick={() => setShowAddInventoryItemModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"><X size={16} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Item Name *</label>
                <input
                  autoFocus
                  value={addInvForm.name}
                  onChange={e => setAddInvForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Laptop, Consulting Service"
                  className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-medium font-poppins focus:outline-none focus:ring-2 ring-amber-100"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">HSN/SAC Code</label>
                  <HSNInput
                    value={addInvForm.hsnCode}
                    onChange={v => setAddInvForm(f => ({ ...f, hsnCode: v }))}
                    onSelectEntry={(code, _desc, gstRate) => setAddInvForm(f => ({ ...f, hsnCode: code, gstRate: String(gstRate) }))}
                    minDigits={hsnMinDigits}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 pr-8 text-sm font-medium font-mono focus:outline-none"
                    placeholder="e.g. 8471"
                    onOpenModal={() => setShowHSNModalForInvAdd(true)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Unit</label>
                  <select
                    value={addInvForm.unit}
                    onChange={e => setAddInvForm(f => ({ ...f, unit: e.target.value }))}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-medium appearance-none focus:outline-none"
                  >
                    {['PCS', 'NOS', 'KGS', 'MTR', 'LTR', 'BOX', 'SET', 'HRS'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Selling Price (₹) *</label>
                  <input
                    type="number" inputMode="decimal"
                    value={addInvForm.sellingPrice}
                    onChange={e => setAddInvForm(f => ({ ...f, sellingPrice: e.target.value }))}
                    placeholder="0"
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-medium text-center focus:outline-none focus:ring-2 ring-amber-100"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">GST Rate</label>
                  <select
                    value={addInvForm.gstRate}
                    onChange={e => setAddInvForm(f => ({ ...f, gstRate: e.target.value }))}
                    className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-bold text-center appearance-none focus:outline-none"
                  >
                    {[0, 5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Opening Stock</label>
                <input
                  type="number" inputMode="numeric"
                  value={addInvForm.stock}
                  onChange={e => setAddInvForm(f => ({ ...f, stock: e.target.value }))}
                  placeholder="0"
                  className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 text-sm font-medium text-center focus:outline-none focus:ring-2 ring-amber-100"
                />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowAddInventoryItemModal(false)}
                className="flex-1 py-3 rounded-xl font-bold text-slate-500 border border-slate-100 hover:bg-slate-50 font-poppins text-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToInventory}
                disabled={addingInventory || !addInvForm.name.trim()}
                className="flex-1 py-3 rounded-xl font-bold bg-amber-500 text-white hover:bg-amber-600 font-poppins text-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-100"
              >
                {addingInventory ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {addingInventory ? 'Adding…' : 'Add to Inventory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Services picker modal (service providers only) ── */}
      {showServicesPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-[2rem] sm:rounded-2xl shadow-2xl w-full max-w-lg sm:mx-4 max-h-[85vh] flex flex-col animate-sheet-up sm:animate-none">
            <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold font-poppins text-slate-900 flex items-center gap-2"><Briefcase size={18} className="text-indigo-600" /> Pick from Services</h2>
              <button onClick={() => setShowServicesPicker(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"><X size={16} /></button>
            </div>
            <div className="px-6 py-3 border-b border-slate-50">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  autoFocus type="text" placeholder="Search services…"
                  value={servicesSearch} onChange={e => setServicesSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 rounded-xl border-none focus:ring-2 ring-indigo-100 font-poppins font-medium"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {serviceItems
                .filter(it => it.name.toLowerCase().includes(servicesSearch.toLowerCase()) || it.sacCode.toLowerCase().includes(servicesSearch.toLowerCase()))
                .map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handlePickServiceItem(item)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-indigo-50 border-b border-slate-50 transition-colors text-left group"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-800 group-hover:text-indigo-800">{item.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">SAC: {item.sacCode || '—'} · {item.unit} · GST {item.gstRate}%</p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="text-sm font-black text-slate-900">₹{item.rate.toLocaleString('en-IN')}</p>
                    </div>
                  </button>
                ))
              }
              {serviceItems.length === 0 && (
                <div className="px-6 py-12 text-center text-sm text-slate-400">
                  No services found. Add services from the Services page.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Inventory picker modal (trading only) ── */}
      {showInventoryPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="bg-white rounded-t-[2rem] sm:rounded-2xl shadow-2xl w-full max-w-lg sm:mx-4 max-h-[85vh] flex flex-col animate-sheet-up sm:animate-none">
            <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 bg-slate-200 rounded-full" /></div>
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
  form: { name: string; phone: string; gstin: string; state: string; email: string; address: string; city: string; pincode: string };
  setForm: (f: any) => void;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
}> = ({ form, setForm, onSave, onClose, saving }) => {
  const STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Ladakh','Puducherry','Chandigarh','Dadra and Nagar Haveli and Daman and Diu','Lakshadweep','Andaman and Nicobar Islands'];

  const [gstinFetching, setGstinFetching] = useState(false);
  const [gstinFetchResult, setGstinFetchResult] = useState<GSTINDetails | null>(null);
  const [gstinFetchError, setGstinFetchError] = useState<string | null>(null);

  const handleFetchGSTIN = async () => {
    const g = form.gstin.trim().toUpperCase();
    if (!g || g.length !== 15) {
      setGstinFetchError('Please enter a valid 15-character GSTIN');
      return;
    }
    setGstinFetching(true);
    setGstinFetchResult(null);
    setGstinFetchError(null);
    try {
      const result = await lookupGSTIN(g);
      setGstinFetchResult(result);
      setForm({
        ...form,
        name: form.name || result.tradeName || result.legalName,
        address: form.address || result.address,
        city: form.city || result.city,
        state: result.state || form.state,
        pincode: form.pincode || result.pincode,
      });
    } catch (err: any) {
      setGstinFetchError(err?.message ?? 'Could not fetch GSTIN details. Check GSTIN and try again.');
    } finally {
      setGstinFetching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-[2rem] sm:rounded-2xl shadow-2xl w-full max-w-sm sm:mx-4 max-h-[92vh] flex flex-col animate-sheet-up sm:animate-none">
        {/* Pull indicator on mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 flex-shrink-0">
          <h2 className="text-base font-bold font-poppins text-slate-900">New Customer</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 space-y-4 font-poppins overflow-y-auto flex-1">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Customer Name *</label>
            <input
              autoFocus type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Raj Traders"
              className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-indigo-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">GSTIN</label>
            <div className="flex gap-2">
              <input
                type="text" value={form.gstin} onChange={e => { setForm({ ...form, gstin: e.target.value.toUpperCase() }); setGstinFetchResult(null); setGstinFetchError(null); }}
                placeholder="15-digit GSTIN"
                className="flex-1 bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-indigo-100 uppercase"
              />
              <button
                type="button"
                onClick={handleFetchGSTIN}
                disabled={gstinFetching || !form.gstin || form.gstin.length !== 15}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
              >
                {gstinFetching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                {gstinFetching ? 'Fetching…' : 'Fetch'}
              </button>
            </div>
            {gstinFetchError && (
              <p className="mt-1.5 text-xs text-rose-500 font-medium">{gstinFetchError}</p>
            )}
            {gstinFetchResult && (
              <div className="mt-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl space-y-1.5">
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Details Fetched — Form auto-filled</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-slate-400">Legal Name:</span> <span className="font-bold text-slate-700">{gstinFetchResult.legalName}</span></div>
                  {gstinFetchResult.tradeName && gstinFetchResult.tradeName !== gstinFetchResult.legalName && (
                    <div><span className="text-slate-400">Trade Name:</span> <span className="font-bold text-slate-700">{gstinFetchResult.tradeName}</span></div>
                  )}
                  <div><span className="text-slate-400">Type:</span> <span className="font-bold text-slate-700">{gstinFetchResult.taxpayerType || '—'}</span></div>
                  <div>
                    <span className="text-slate-400">Status:</span>{' '}
                    <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded-full ${gstinFetchResult.status?.toLowerCase() === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
                      {gstinFetchResult.status || '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}
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
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Email</label>
            <input
              type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="customer@example.com"
              className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-indigo-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Address</label>
            <input
              type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
              placeholder="Street / Building"
              className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-indigo-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">City</label>
              <input
                type="text" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })}
                placeholder="City"
                className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-indigo-100"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Pincode</label>
              <input
                type="text" value={form.pincode} onChange={e => setForm({ ...form, pincode: e.target.value })}
                placeholder="6-digit PIN"
                className="w-full bg-slate-50 rounded-xl px-4 py-3 text-sm font-medium border-none focus:ring-2 ring-indigo-100"
              />
            </div>
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
        <div className="px-6 py-4 pb-safe border-t border-slate-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 px-4 py-3 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-poppins font-medium">Cancel</button>
          <button onClick={() => { haptic('medium'); onSave(); }} disabled={saving || !form.name.trim()} className="flex-1 px-5 py-3 text-sm bg-profee-blue hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl font-poppins transition-colors active:scale-95">
            {saving ? 'Saving…' : 'Create Customer'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvoiceGenerator;
