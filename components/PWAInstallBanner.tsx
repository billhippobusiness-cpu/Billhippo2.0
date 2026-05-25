import { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

const DISMISS_KEY = 'pwa_banner_dismissed_until';

const LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

export default function PWAInstallBanner() {
  const { canInstall, isIOS, isInstalled, install } = usePWAInstall();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isInstalled) return;
    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) return;
    if (canInstall || isIOS) setVisible(true);
  }, [canInstall, isIOS, isInstalled]);

  const dismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  };

  const handleInstall = async () => {
    await install();
    setVisible(false);
  };

  if (isInstalled || !visible) return null;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-[200] px-3 pb-safe">
      <div
        className="mb-3 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
        style={{ boxShadow: '0 -4px 24px rgba(76,45,224,0.15), 0 4px 24px rgba(0,0,0,0.12)' }}
      >
        <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600" />
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden border border-slate-100 shadow">
            <img src={LOGO} alt="BillHippo" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-800 leading-tight">Add BillHippo to Home Screen</p>
            {isIOS ? (
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">
                Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">Works offline · No App Store needed</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isIOS && (
              <button
                onClick={handleInstall}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md active:scale-95 transition-transform"
              >
                <Download size={13} /> Install
              </button>
            )}
            <button onClick={dismiss} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 active:scale-95 transition-transform" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        </div>
        {isIOS && (
          <div className="flex items-center gap-2 px-4 pb-3">
            <Smartphone size={13} className="text-indigo-400 flex-shrink-0" />
            <p className="text-[11px] text-slate-400">
              Tap <span className="inline-block px-1 py-0.5 bg-slate-100 rounded text-slate-600 font-medium text-[10px]">⎋ Share</span> at the bottom of Safari, then tap "Add to Home Screen"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
