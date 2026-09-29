import React, { useState, useEffect } from 'react';
import { Download, Smartphone, X } from 'lucide-react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already running in standalone/PWA mode
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      setIsStandalone(true);
    }

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  if (!deferredPrompt || isDismissed || isStandalone) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-slate-900 border border-sky-500/40 rounded-2xl p-4 shadow-2xl shadow-sky-950/50 flex items-start gap-3 backdrop-blur-md">
        <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>

        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white">Install SafeHome AI App</h4>
            <button
              onClick={() => setIsDismissed(true)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            Install to your Android home screen for fullscreen camera streaming and automatic background wake-lock.
          </p>
          <div className="pt-2">
            <button
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition shadow-md shadow-sky-500/20"
            >
              <Download className="w-3.5 h-3.5" /> Install App
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
