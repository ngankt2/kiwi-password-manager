import { useEffect, useRef, useState } from 'react';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { useSession } from './use-session';

export function useSecretReveal(scope: string) {
  const { privacyEpoch } = useSession();
  const [visible, setVisible] = useState<{ scope: string; epoch: number } | null>(null);
  const active = useRef(true);
  const revealed = visible?.scope === scope && visible.epoch === privacyEpoch;

  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setVisible(null), 15_000);
    return () => clearTimeout(timer);
  }, [revealed, visible]);

  useEffect(() => {
    const background = () => { active.current = false; setVisible(null); };
    const foreground = () => { active.current = true; };
    const desktop = desktopBridge();
    if (desktop) return desktop.onSecurityEvent((event) => {
      if (event === 'foreground') foreground();
      else background();
    });
    // Native secret views unmount on background through SessionBoundary.
    if (typeof document === 'undefined') return;
    active.current = document.visibilityState === 'visible' && document.hasFocus();
    const visibility = () => document.visibilityState === 'hidden' ? background() : foreground();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', background);
    window.addEventListener('focus', foreground);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', background);
      window.removeEventListener('focus', foreground);
    };
  }, []);

  return {
    revealed,
    reveal: () => { if (active.current) setVisible({ scope, epoch: privacyEpoch }); },
    hide: () => setVisible(null),
  };
}
