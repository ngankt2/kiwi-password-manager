import { LANGUAGE_NAMES, LOCALES, type Locale } from '@/core/i18n';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useAction } from '@/shared/hooks/use-action';
import { session } from '@/infrastructure/session';
import { Icon } from './ui';

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { t, locale } = useI18n();
  const { run, pending } = useAction();
  return <label className={'desktop-language-picker' + (compact ? ' compact' : '')}>
    {compact && <Icon name="language" size={16} />}
    <select className="desktop-select" aria-label={t('Ngôn ngữ hiển thị')} value={locale} disabled={pending} onChange={(event) => {
      const language = event.target.value as Locale;
      run(() => session.updateSettings({ ...session.getSnapshot().settings, language }));
    }}>{LOCALES.map((language) => <option key={language} value={language} lang={language}>{LANGUAGE_NAMES[language]}</option>)}</select>
  </label>;
}
