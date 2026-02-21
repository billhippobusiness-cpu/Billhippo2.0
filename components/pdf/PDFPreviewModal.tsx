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

interface PDFPreviewModalProps {
  open: boolean;
  onClose: () => void;
  document: React.ReactElement;
  fileName: string;
}

const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({
  open,
  onClose,
  document: pdfDocument,
  fileName,
}) => {
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

        {/* Right: download + close */}
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
            <a
              href={instance.url ?? '#'}
              download={fileName}
              className="flex items-center gap-2 font-bold text-sm px-5 py-2.5 rounded-xl transition-all font-poppins"
              style={{ backgroundColor: '#4c2de0', color: '#ffffff', textDecoration: 'none' }}
            >
              <Download size={15} />
              Download PDF
            </a>
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
          Scroll inside the preview · click <strong style={{ color: '#94a3b8' }}>Download PDF</strong> to save
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
