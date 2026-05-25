import { useState, useEffect } from 'react';
import { X, Download, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa_banner_dismissed_until';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Already running as installed PWA — hide banner
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if user dismissed recently (7-day cooldown)
    const dismissedUntil = localStorage.getItem(DISMISS_KEY);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) return;

    // Detect iOS Safari (no beforeinstallprompt, needs manual instructions)
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream;
    const safari = /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);
    if (ios && safari) {
      setIsIOS(true);
      setVisible(true);
      return;
    }

    // Chrome/Edge/Samsung Android — listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setVisible(false);
    // Snooze for 7 days
    localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    } else {
      dismiss();
    }
    setDeferredPrompt(null);
  };

  if (isInstalled || !visible) return null;

  return (
    /*
     * md:hidden — completely invisible on desktop (≥768px).
     * This component has zero impact on the web experience.
     */
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-[200] px-3 pb-safe">
      <div
        className="mb-3 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
        style={{ boxShadow: '0 -4px 24px rgba(76,45,224,0.15), 0 4px 24px rgba(0,0,0,0.12)' }}
      >
        {/* Purple accent bar */}
        <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600" />

        <div className="flex items-center gap-3 px-4 py-3.5">
          {/* Icon */}
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg">
            <span className="text-white text-xl font-black">₹</span>
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-slate-800 leading-tight">Add BillHippo to Home Screen</p>
            {isIOS ? (
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">
                Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">
                Works offline · No App Store needed
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isIOS && (
              <button
                onClick={install}
                className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl shadow-md active:scale-95 transition-transform"
              >
                <Download size={13} />
                Install
              </button>
            )}
            <button
              onClick={dismiss}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 active:scale-95 transition-transform"
              aria-label="Dismiss"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* iOS step hint */}
        {isIOS && (
          <div className="flex items-center gap-2 px-4 pb-3">
            <Smartphone size={13} className="text-indigo-400 flex-shrink-0" />
            <p className="text-[11px] text-slate-400">
              Tap <span className="inline-block px-1 py-0.5 bg-slate-100 rounded text-slate-600 font-medium text-[10px]">⎋ Share</span> at the bottom of Safari, then scroll and tap "Add to Home Screen"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
