import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA install banner — shows on Android when the browser detects the app
 * is installable. Hidden on desktop and after dismissal/install.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed in this session
    if (sessionStorage.getItem('pwa-dismissed')) {
      setDismissed(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('pwa-dismissed', '1');
  };

  if (!deferredPrompt || dismissed) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      left: 16,
      right: 16,
      zIndex: 9999,
      background: 'linear-gradient(135deg, rgba(15,23,42,0.97), rgba(30,41,59,0.97))',
      backdropFilter: 'blur(16px)',
      borderRadius: 16,
      border: '1px solid rgba(6,182,212,0.3)',
      padding: '16px 20px',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(6,182,212,0.1)',
      animation: 'slideUp 0.4s ease-out',
    }}>
      <img
        src="/icon-512.png"
        alt="Vromon"
        style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: '#f1f5f9',
          fontWeight: 600,
          fontSize: 15,
          fontFamily: 'Plus Jakarta Sans, Inter, sans-serif',
        }}>
          Install Vromon
        </div>
        <div style={{
          color: '#94a3b8',
          fontSize: 13,
          marginTop: 2,
        }}>
          Add to home screen for a native app experience
        </div>
      </div>
      <button
        onClick={handleInstall}
        style={{
          background: 'linear-gradient(135deg, #06b6d4, #0ea5e9)',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          padding: '10px 18px',
          fontWeight: 600,
          fontSize: 14,
          cursor: 'pointer',
          fontFamily: 'Inter, sans-serif',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          color: '#64748b',
          fontSize: 20,
          cursor: 'pointer',
          padding: '4px 8px',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
