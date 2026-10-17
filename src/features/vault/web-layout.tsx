import { useI18n } from '@/shared/hooks/use-i18n';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { DarkTheme, DefaultTheme, Slot, ThemeProvider } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionBoundary, SessionProvider } from '@/shared/hooks/use-session';
import { DesktopPreferencesProvider } from '@/features/desktop/preferences';
import { DesktopUpdatesProvider } from '@/features/desktop/updates';
import { DesktopToast } from '@/features/desktop/ui';
import { useDesktopTheme } from '@/features/desktop/theme';
import '@/features/desktop/input-controls.css';
import '@/features/desktop/desktop.css';
import '@/features/desktop/refinements.css';
import '@/features/desktop/apple.css';

const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function WebLayout() {
  const { t, locale } = useI18n();
  const dark = useDesktopTheme();
  const navigationTheme = useMemo(() => {
    const base = dark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, primary: 'var(--color-accent)', background: 'var(--color-background)', card: 'var(--color-surface)', text: 'var(--color-text)', border: 'var(--color-border)', notification: 'var(--color-danger)' } };
  }, [dark]);
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  useEffect(() => { document.title = 'Kiro Password Manager'; document.documentElement.lang = locale; }, [locale]);

  return <SafeAreaProvider>
    <ThemeProvider value={navigationTheme}>
      <SessionProvider>
        <DesktopPreferencesProvider>
          <DesktopUpdatesProvider hydrated={hydrated}>
          <SessionBoundary>{hydrated ? <Slot /> : <div className="desktop-loading" role="status"><span className="desktop-spinner" /><span>{t("Đang mở Kiro Password Manager…")}</span></div>}</SessionBoundary>
          {hydrated && <DesktopToast />}
          </DesktopUpdatesProvider>
        </DesktopPreferencesProvider>
      </SessionProvider>
    </ThemeProvider>
  </SafeAreaProvider>;
}
