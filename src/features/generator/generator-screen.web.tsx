import { useI18n } from '@/shared/hooks/use-i18n';
import { DesktopWorkspace, useWorkspace } from '@/features/desktop/workspace';
import { DesktopGenerator } from '@/features/desktop/generator';
import { Icon } from '@/features/desktop/ui';

function GeneratorPage() {
  const { t } = useI18n();
  const workspace = useWorkspace();
  return <><div className="desktop-detail-toolbar"><button className="desktop-back" onClick={workspace.backToList}><Icon name="chevron_left" />{t('Vault')}</button></div>
    <div className="desktop-detail-scroll"><div className="desktop-detail-content" style={{ maxWidth: 484 }}>
      <div><h1 className="desktop-history-title">{t('Tạo mật khẩu')}</h1><p className="desktop-history-subtitle" style={{ marginTop: 4 }}>{t('Tạo mật khẩu ngẫu nhiên hoặc cụm từ dễ nhớ.')}</p></div>
      <DesktopGenerator />
    </div></div></>;
}
export function GeneratorScreen() { return <DesktopWorkspace fullWidth><GeneratorPage /></DesktopWorkspace>; }
