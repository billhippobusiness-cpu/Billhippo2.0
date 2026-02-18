/**
 * PDFPreviewModal
 * ───────────────
 * A full-screen modal that:
 *  1. Renders a live PDF preview inside an <iframe> using @react-pdf/renderer's PDFViewer.
 *  2. Provides a one-click download button via PDFDownloadLink.
 *  3. Is completely generic — pass any @react-pdf/renderer <Document> as `document`.
 *
 * Usage:
 *   <PDFPreviewModal
 *     open={showPDF}
 *     onClose={() => setShowPDF(false)}
 *     document={<InvoicePDF invoice={inv} business={biz} customer={cust} />}
 *     fileName="invoice-001.pdf"
 *   />
 */

import React, { Suspense, useState } from 'react';
import { PDFViewer, PDFDownloadLink } from '@react-pdf/renderer';
import { X, Download, Loader2, FileText } from 'lucide-react';

interface PDFPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** A pre-instantiated @react-pdf/renderer <Document> element */
  document: React.ReactElement;
  fileName: string;
}

const PDFPreviewModal: React.FC<PDFPreviewModalProps> = ({
  open,
  onClose,
  document: pdfDocument,
  fileName,
}) => {
  const [viewerReady, setViewerReady] = useState(false);

  if (!open) return null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="PDF Preview"
    >
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-900 border-b border-slate-700 shrink-0">
        {/* Left – file name */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-profee-blue/20 flex items-center justify-center">
            <FileText size={16} className="text-profee-blue" />
          </div>
          <div>
            <p className="text-white font-bold text-sm font-poppins truncate max-w-xs">{fileName}</p>
            <p className="text-slate-400 text-[10px] font-medium">A4 · PDF · Vector text</p>
          </div>
        </div>

        {/* Right – actions */}
        <div className="flex items-center gap-3">
          {/* Download button */}
          <PDFDownloadLink document={pdfDocument} fileName={fileName}>
            {({ loading, error }) => (
              <button
                disabled={loading}
                className="flex items-center gap-2 bg-profee-blue hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-indigo-900/30 font-poppins"
              >
                {loading ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Preparing…
                  </>
                ) : error ? (
                  <>
                    <X size={15} />
                    Error
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    Download PDF
                  </>
                )}
              </button>
            )}
          </PDFDownloadLink>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ── PDF Viewer ── */}
      <div className="flex-1 relative overflow-hidden bg-slate-700">
        {/* Loading overlay */}
        {!viewerReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10 bg-slate-700">
            <Loader2 size={36} className="animate-spin text-profee-blue" />
            <p className="text-slate-300 font-semibold text-sm font-poppins">Rendering PDF…</p>
            <p className="text-slate-500 text-xs">Embedding fonts & building layout</p>
          </div>
        )}

        <Suspense fallback={null}>
          <PDFViewer
            width="100%"
            height="100%"
            showToolbar={false}           // hide browser's default toolbar (we have ours)
            style={{ border: 'none' }}
            onLoad={() => setViewerReady(true)}
          >
            {pdfDocument}
          </PDFViewer>
        </Suspense>
      </div>

      {/* ── Bottom hint bar ── */}
      <div className="shrink-0 bg-slate-900 border-t border-slate-700 px-6 py-2 flex items-center justify-between">
        <p className="text-slate-500 text-[10px] font-medium font-poppins">
          Scroll inside the preview to check all pages · Click <strong className="text-slate-300">Download PDF</strong> to save
        </p>
        <p className="text-slate-600 text-[10px] font-medium font-poppins">
          Powered by BillHippo
        </p>
      </div>
    </div>
  );
};

export default PDFPreviewModal;
