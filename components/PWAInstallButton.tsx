import { useState } from 'react';
import { Download, Smartphone, X, CheckCircle } from 'lucide-react';
import { usePWAInstall, type Platform, type Browser } from '../hooks/usePWAInstall';

interface Props {
  variant?: 'hero' | 'banner' | 'compact';
}

const LOGO = 'https://firebasestorage.googleapis.com/v0/b/billhippo-42f95.firebasestorage.app/o/Image%20assets%2FBillhippo%20logo.png?alt=media&token=539dea5b-d69a-4e72-be63-e042f09c267c';

interface Guide {
  title: string;
  subtitle: string;
  steps: { icon: string; text: string }[];
  footer: string;
}

// Build platform-specific install instructions shown when the native prompt
// isn't available (iOS Safari, desktop Safari/Firefox, or when the browser
// hasn't fired `beforeinstallprompt` yet).
function buildGuide(platform: Platform, browser: Browser): Guide {
  // ── iOS / iPadOS ────────────────────────────────────────────────────────
  if (platform === 'ios') {
    if (browser === 'safari') {
      return {
        title: 'Install BillHippo',
        subtitle: 'Add to your Home Screen',
        steps: [
          { icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
          { icon: '📲', text: 'Scroll down and tap "Add to Home Screen"' },
          { icon: '✅', text: 'Tap Add — BillHippo appears on your home screen!' },
        ],
        footer: 'Works on iPhone & iPad · No App Store required',
      };
    }
    return {
      title: 'Install BillHippo',
      subtitle: 'Add to your Home Screen',
      steps: [
        { icon: '🧭', text: 'Open billhippo.in in Safari (installing needs Safari on iOS)' },
        { icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
        { icon: '📲', text: 'Scroll down and tap "Add to Home Screen"' },
        { icon: '✅', text: 'Tap Add — BillHippo appears on your home screen!' },
      ],
      footer: 'Works on iPhone & iPad · No App Store required',
    };
  }

  // ── Android ─────────────────────────────────────────────────────────────
  if (platform === 'android') {
    return {
      title: 'Install BillHippo',
      subtitle: 'Add to your Home Screen',
      steps: [
        { icon: '⋮', text: 'Tap the menu (⋮) at the top-right of your browser' },
        { icon: '📲', text: 'Tap "Install app" or "Add to Home screen"' },
        { icon: '✅', text: 'Tap Install — BillHippo appears on your home screen!' },
      ],
      footer: 'Installs instantly · No Play Store needed',
    };
  }

  // ── Desktop: Safari on macOS (Safari 17+ supports "Add to Dock") ─────────
  if (platform === 'macos' && browser === 'safari') {
    return {
      title: 'Install BillHippo',
      subtitle: 'Add BillHippo to your Dock',
      steps: [
        { icon: '⬆️', text: 'Click the Share button in the Safari toolbar' },
        { icon: '📌', text: 'Choose "Add to Dock"' },
        { icon: '✅', text: 'Click Add — BillHippo opens as its own app' },
      ],
      footer: 'Requires Safari 17 or newer on macOS Sonoma+',
    };
  }

  // ── Desktop: Firefox has no web-app install ──────────────────────────────
  if (browser === 'firefox') {
    return {
      title: 'Install BillHippo',
      subtitle: 'Install as a desktop app',
      steps: [
        { icon: '🌐', text: 'Firefox can\'t install web apps — open billhippo.in in Chrome or Edge' },
        { icon: '⬇️', text: 'Click the install icon on the right of the address bar' },
        { icon: '✅', text: 'Or just click "Launch App Now" to use BillHippo in your browser' },
      ],
      footer: 'BillHippo runs great in any browser — installing is optional',
    };
  }

  // ── Desktop: Chrome / Edge / Chromium (Windows, macOS, Linux) ────────────
  return {
    title: 'Install BillHippo',
    subtitle: 'Install as a desktop app',
    steps: [
      { icon: '🖥️', text: 'Look for the install icon (⊕) at the right end of the address bar' },
      { icon: '🖱️', text: 'Click it, or open the browser menu → "Install BillHippo"' },
      { icon: '✅', text: 'Click Install — BillHippo opens in its own window' },
    ],
    footer: 'Works on Windows, macOS & Linux · No download needed',
  };
}

export default function PWAInstallButton({ variant = 'hero' }: Props) {
  const { canInstall, isIOS, isInstalled, platform, browser, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [installed, setInstalled] = useState(false);

  if (isInstalled || installed) {
    if (variant === 'compact') return null;
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold border border-emerald-100">
        <CheckCircle size={16} /> App Installed
      </div>
    );
  }

  const handleClick = async () => {
    // Preferred path: browser exposed a native install prompt (Android Chrome,
    // desktop Chrome/Edge). This covers Windows, macOS, Linux and Android.
    if (canInstall) {
      const accepted = await install();
      if (accepted) setInstalled(true);
      return;
    }
    // No native prompt — show instructions tailored to this OS + browser.
    setShowGuide(true);
  };

  const guide = buildGuide(platform, browser);

  // ── Compact variant (used in dashboard card) ──────────────────────────────
  if (variant === 'compact') {
    return (
      <>
        <button
          onClick={handleClick}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl shadow-md hover:bg-indigo-700 active:scale-95 transition-all"
        >
          <Download size={15} />
          {isIOS ? 'Add to Home Screen' : 'Download App'}
        </button>
        {showGuide && <InstallGuideModal guide={guide} onClose={() => setShowGuide(false)} />}
      </>
    );
  }

  // ── Banner variant (horizontal strip) ─────────────────────────────────────
  if (variant === 'banner') {
    return (
      <>
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl text-white shadow-xl shadow-indigo-200">
          <img src={LOGO} alt="BillHippo" className="w-12 h-12 object-contain flex-shrink-0 rounded-xl bg-white/10 p-1" />
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm leading-tight">Get the BillHippo App</p>
            <p className="text-xs text-indigo-200 mt-0.5">Install on any device — no App Store needed</p>
          </div>
          <button
            onClick={handleClick}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-white text-indigo-700 text-xs font-black rounded-xl active:scale-95 transition-transform shadow"
          >
            <Download size={14} />
            {isIOS ? 'Add' : 'Install'}
          </button>
        </div>
        {showGuide && <InstallGuideModal guide={guide} onClose={() => setShowGuide(false)} />}
      </>
    );
  }

  // ── Hero variant (large CTA button for landing page) ─────────────────────
  return (
    <>
      <button
        onClick={handleClick}
        className="px-8 py-5 bg-white text-profee-blue border-2 border-indigo-200 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 hover:bg-indigo-50 hover:border-indigo-400 active:scale-95 transition-all font-poppins shadow-lg shadow-indigo-100"
      >
        <Smartphone size={22} />
        {isIOS ? 'Add to Home Screen' : 'Download Free App'}
      </button>
      {showGuide && <InstallGuideModal guide={guide} onClose={() => setShowGuide(false)} />}
    </>
  );
}

// ── Platform-aware install guide modal ────────────────────────────────────────
function InstallGuideModal({ guide, onClose }: { guide: Guide; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <img src={LOGO} alt="BillHippo" className="w-10 h-10 object-contain rounded-xl border border-slate-100" />
              <div>
                <p className="font-black text-slate-800 text-sm">{guide.title}</p>
                <p className="text-xs text-slate-400">{guide.subtitle}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-3">
            {guide.steps.map(({ icon, text }, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-black flex items-center justify-center">
                  {i + 1}
                </span>
                <div className="flex items-start gap-2">
                  <span className="text-base leading-none mt-0.5">{icon}</span>
                  <p className="text-sm text-slate-700 font-medium leading-snug">{text}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-slate-400 mt-4">
            {guide.footer}
          </p>
        </div>
      </div>
    </div>
  );
}
