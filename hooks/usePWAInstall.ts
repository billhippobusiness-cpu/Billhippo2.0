import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform = 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'unknown';
export type Browser = 'chrome' | 'edge' | 'safari' | 'firefox' | 'samsung' | 'other';

interface UsePWAInstall {
  canInstall: boolean;       // true when the native install prompt is available (Chrome/Edge/Android)
  isIOS: boolean;            // true when on iOS/iPadOS Safari (manual steps needed)
  isInstalled: boolean;      // true when already running as standalone PWA
  platform: Platform;        // detected operating system
  browser: Browser;          // detected browser engine
  install: () => Promise<boolean>; // triggers the native prompt; resolves true if accepted
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const uaPlatform = (navigator as any).userAgentData?.platform as string | undefined;

  // iPadOS 13+ Safari reports a desktop "Macintosh" UA, so fall back to touch points.
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/Mac/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';

  if (/android/i.test(ua)) return 'android';
  if (/win/i.test(ua) || /Windows/i.test(uaPlatform || '')) return 'windows';
  if (/mac/i.test(ua) || /macOS/i.test(uaPlatform || '')) return 'macos';
  if (/linux/i.test(ua)) return 'linux';
  return 'unknown';
}

function detectBrowser(): Browser {
  const ua = navigator.userAgent;
  if (/edg\//i.test(ua)) return 'edge';
  if (/samsungbrowser/i.test(ua)) return 'samsung';
  if (/firefox|fxios/i.test(ua)) return 'firefox';
  if (/chrome|crios|chromium/i.test(ua)) return 'chrome';
  if (/safari/i.test(ua)) return 'safari';
  return 'other';
}

export function usePWAInstall(): UsePWAInstall {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [platform, setPlatform] = useState<Platform>('unknown');
  const [browser, setBrowser] = useState<Browser>('other');

  useEffect(() => {
    const detectedPlatform = detectPlatform();
    const detectedBrowser = detectBrowser();
    setPlatform(detectedPlatform);
    setBrowser(detectedBrowser);
    setIsIOS(detectedPlatform === 'ios' && detectedBrowser === 'safari');

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    if (standalone) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const installedHandler = () => {
      setIsInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!prompt) return false;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(null);
    return choice.outcome === 'accepted';
  };

  return {
    canInstall: !!prompt,
    isIOS,
    isInstalled,
    platform,
    browser,
    install,
  };
}
