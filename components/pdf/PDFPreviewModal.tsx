/**
 * PDFPreviewModal — fixed for React 19 + @react-pdf/renderer v4
 * ──────────────────────────────────────────────────────────────
 * Uses the `usePDF` hook to generate a blob URL, then feeds it
 * into a plain <iframe>.  This avoids the PDFViewer crash on React 19
 * and the cross-origin restrictions that cause a blank screen.
 * Download is a simple <a download> tag — no PDFDownloadLink needed.
 */

import React, { useEffect, useRef } from 'react';
import { usePDF } from '@react-pdf/renderer';
import { X, Download, Loader2, FileText, AlertCircle } from 'lucide-react';

const WhatsAppIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

interface PDFPreviewModalProps {
  open: boolean;
  onClose: () => void;
  document: React.ReactElement;
  fileName: string;
  /** Customer's phone number (digits only, without country code). If provided, WhatsApp button links directly to this number. */
  customerPhone?: string;
  /** Message to pre-fill in WhatsApp. */
  whatsappMessage?: string;
}

const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({
  open,
  onClose,
  document: pdfDocument,
  fileName,
  customerPhone,
  whatsappMessage,
}) => {
  const handleWhatsApp = () => {
    const phone = customerPhone?.replace(/\D/g, '');
    const text = whatsappMessage || `Please find the attached document: ${fileName}`;
    const url = phone
      ? `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };
  // usePDF renders the document into a blob URL in the background
  const [instance, updateInstance] = usePDF({ document: pdfDocument });

  // Re-render if the document prop changes
  const prevDocRef = useRef(pdfDocument);
  useEffect(() => {
    if (prevDocRef.current !== pdfDocument) {
      prevDocRef.current = pdfDocument;
      updateInstance(pdfDocument);
    }
  }, [pdfDocument, updateInstance]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      role="dialog"
      aria-modal="true"
    >
      {/* ── Top toolbar ── */}
      <div
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ backgroundColor: '#0f172a', borderBottom: '1px solid #334155' }}
      >
        {/* Left: file info */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(76,45,224,0.2)' }}>
            <FileText size={16} style={{ color: '#4c2de0' }} />
          </div>
          <div>
            <p className="font-bold text-sm font-poppins truncate max-w-xs" style={{ color: '#f1f5f9' }}>
              {fileName}
            </p>
            <p className="text-[10px] font-medium" style={{ color: '#64748b' }}>
              A4 · PDF · Vector text
            </p>
          </div>
        </div>

        {/* Right: whatsapp + download + close */}
        <div className="flex items-center gap-3">
          {instance.loading ? (
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm font-poppins" style={{ backgroundColor: '#1e293b', color: '#94a3b8' }}>
              <Loader2 size={15} className="animate-spin" />
              Building PDF…
            </div>
          ) : instance.error ? (
            <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>
              <AlertCircle size={15} />
              Render error
            </div>
          ) : (
            <>
              <button
                onClick={handleWhatsApp}
                className="flex items-center gap-2 font-bold text-sm px-4 py-2.5 rounded-xl transition-all font-poppins"
                style={{ backgroundColor: '#25D366', color: '#ffffff' }}
                title={customerPhone ? `Share via WhatsApp with ${customerPhone}` : 'Share via WhatsApp'}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1ebe5a'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#25D366'; }}
              >
                <WhatsAppIcon size={15} />
                <span className="hidden sm:inline">Share</span>
              </button>
              <a
                href={instance.url ?? '#'}
                download={fileName}
                className="flex items-center gap-2 font-bold text-sm px-5 py-2.5 rounded-xl transition-all font-poppins"
                style={{ backgroundColor: '#4c2de0', color: '#ffffff', textDecoration: 'none' }}
              >
                <Download size={15} />
                <span className="hidden sm:inline">Download PDF</span>
                <span className="sm:hidden">PDF</span>
              </a>
            </>
          )}

          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-all"
            style={{ color: '#94a3b8' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#334155'; (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'; }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ── Preview area ── */}
      <div className="flex-1 relative" style={{ backgroundColor: '#475569', overflow: 'hidden' }}>

        {/* Loading overlay */}
        {instance.loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#475569', zIndex: 10 }}>
            <Loader2 size={40} className="animate-spin" style={{ color: '#4c2de0' }} />
            <p className="font-semibold text-sm font-poppins" style={{ color: '#e2e8f0' }}>
              Rendering PDF…
            </p>
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              Building layout · embedding fonts
            </p>
          </div>
        )}

        {/* Error state */}
        {instance.error && !instance.loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4" style={{ backgroundColor: '#475569' }}>
            <AlertCircle size={40} style={{ color: '#ef4444' }} />
            <p className="font-bold text-sm font-poppins" style={{ color: '#fca5a5' }}>
              Failed to render PDF
            </p>
            <p className="text-xs text-center max-w-xs" style={{ color: '#94a3b8' }}>
              {String(instance.error)}
            </p>
            <button
              onClick={() => updateInstance(pdfDocument)}
              className="mt-2 px-6 py-2 rounded-xl font-bold text-sm font-poppins"
              style={{ backgroundColor: '#4c2de0', color: '#fff' }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Actual PDF in iframe — only rendered once blob URL is ready */}
        {!instance.loading && !instance.error && instance.url && (
          <iframe
            src={instance.url}
            title="PDF Preview"
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              display: 'block',
            }}
          />
        )}
      </div>

      {/* ── Bottom hint ── */}
      <div
        className="shrink-0 flex items-center justify-between px-6 py-2"
        style={{ backgroundColor: '#0f172a', borderTop: '1px solid #334155' }}
      >
        <p className="text-[10px] font-medium font-poppins" style={{ color: '#475569' }}>
          Scroll inside the preview · <strong style={{ color: '#25D366' }}>Share</strong> to WhatsApp · <strong style={{ color: '#94a3b8' }}>Download PDF</strong> to save
        </p>
        <p className="text-[10px] font-medium font-poppins" style={{ color: '#334155' }}>
          Powered by BillHippo
        </p>
      </div>
    </div>
  );
};

export default PDFPreviewModal;

/**
 * PDFDirectDownload — renders a PDF document invisibly and auto-downloads it.
 * Mount this component when you want a "Download PDF" button that skips the preview modal.
 * Calls onDone() once the download has been triggered.
 */
interface PDFDirectDownloadProps {
  document: React.ReactElement;
  fileName: string;
  onDone: () => void;
}

export const PDFDirectDownload: React.FC<PDFDirectDownloadProps> = ({
  document: pdfDoc,
  fileName,
  onDone,
}) => {
  const [instance] = usePDF({ document: pdfDoc });
  const doneRef = useRef(false);

  useEffect(() => {
    if (instance.url && !doneRef.current) {
      doneRef.current = true;
      const a = window.document.createElement('a');
      a.href = instance.url;
      a.download = fileName;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      setTimeout(onDone, 100);
    }
  }, [instance.url, fileName, onDone]);

  return null;
};
