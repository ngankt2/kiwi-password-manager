import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { AppShell } from '@/features/vault/app-shell';
import { Icon } from '@/features/desktop/ui';
import { useI18n } from '@/shared/hooks/use-i18n';

export function ToolLayout({ title, detail, children }: { title: string; detail: string; children: ReactNode }) {
  const { t } = useI18n();
  return <AppShell>
    <div className="desktop-detail-toolbar"><button className="desktop-back" onClick={() => router.replace('/settings')}><Icon name="chevron_left" />{t('Cài đặt')}</button></div>
    <div className="desktop-detail-scroll"><div className="desktop-detail-content desktop-settings desktop-data-tool">
      <header><h1 className="desktop-history-title">{title}</h1><p className="desktop-history-subtitle" style={{ marginTop: 4 }}>{detail}</p></header>
      {children}
    </div></div>
  </AppShell>;
}
