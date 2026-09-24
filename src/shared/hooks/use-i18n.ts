import { useMemo } from 'react';
import { createI18n } from '@/core/i18n';
import { useSession } from './use-session';

export function useI18n() {
  const { settings } = useSession();
  return useMemo(() => createI18n(settings.language), [settings.language]);
}
