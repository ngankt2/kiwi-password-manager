import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useSession } from '@/shared/hooks/use-session';

const colorSchemeQuery = '(prefers-color-scheme: dark)';
const readSystemDark = () => typeof window !== 'undefined' && window.matchMedia(colorSchemeQuery).matches;
const serverSnapshot = () => false;
function subscribeSystemTheme(onChange: () => void) {
  const query = window.matchMedia(colorSchemeQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useDesktopTheme() {
  const { settings } = useSession();
  const systemDark = useSyncExternalStore(subscribeSystemTheme, readSystemDark, serverSnapshot);
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);

  useLayoutEffect(() => {
    // Set the document theme so dialogs and portals inherit the same palette.
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  return dark;
}
