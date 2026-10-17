import { router } from 'expo-router';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useAction } from '@/shared/hooks/use-action';
import { BrandSymbol } from '@/design-system/components/brand-symbol';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { RELEASE_NOTES } from '@/features/about/release-notes';
import { expo as appConfig } from '../../../app.json';
import { version as appVersion } from '../../../package.json';
import { useWorkspace } from './workspace';
import { useDesktopUpdates } from './updates';
import { Button, Icon } from './ui';
import { SupportLink } from './privacy';

const APPKIRO_URL = `https://appkiro.com?utm_source=${encodeURIComponent(appConfig.name)}`;

export function DesktopAbout() {
  const { t } = useI18n();
  const { run } = useAction();
  const workspace = useWorkspace();
  const updates = useDesktopUpdates();
  const canUpdate = !!desktopBridge()?.updates;
  return <>
    <div className="desktop-detail-toolbar"><button className="desktop-back" onClick={workspace.backToList}><Icon name="chevron_left" />{t('Vault')}</button></div>
    <div className="desktop-detail-scroll"><div className="desktop-about">
      <header className="desktop-about-hero">
        <BrandSymbol size={84} />
        <div className="grow">
          <div className="desktop-about-name"><h1>{appConfig.name}</h1><span className="desktop-about-version">v{appVersion}</span></div>
          <p className="desktop-about-tagline">{t('Mật khẩu của bạn, an toàn trên thiết bị.')}</p>
        </div>
      </header>
      <p className="desktop-about-description">{t('Một nơi an toàn cho mật khẩu, ghi chú bảo mật, thẻ thanh toán, khoá SSH, API key và biến môi trường. Kho được mã hoá bằng AES-256-GCM và Argon2id, chỉ lưu trên thiết bị của bạn, không cần tài khoản và không theo dõi.')}</p>
      <div className="desktop-about-actions">
        {canUpdate && <Button small icon="sync" onClick={updates?.open}>{t('Kiểm tra cập nhật…')}</Button>}
        <a className="desktop-about-link" href={APPKIRO_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => {
          const bridge = desktopBridge();
          if (bridge) { event.preventDefault(); run(() => bridge.openExternal(APPKIRO_URL)); }
        }}>{t('Phát triển bởi {name}', { name: 'AppKiro' })}<Icon name="open_in_new" size={14} /></a>
        <a className="desktop-about-link" href="/privacy" onClick={(event) => { event.preventDefault(); router.push('/privacy'); }}>{t('Chính sách quyền riêng tư')}</a>
        <SupportLink />
      </div>
      <section className="desktop-release-log" aria-labelledby="desktop-release-log-title">
        <h2 id="desktop-release-log-title">{t('Nhật ký phát hành')}</h2>
        <p className="desktop-release-log-subtitle">{t('Theo dõi tính năng mới, cải tiến và cập nhật qua từng phiên bản.')}</p>
        {RELEASE_NOTES.map((release) => <article key={release.version} className="desktop-release">
          <h3>v{release.version}{release.version === appVersion && <span className="desktop-release-badge">{t('Mới nhất')}</span>}</h3>
          <ul>{release.notes.map((note) => <li key={note}>{t(note)}</li>)}</ul>
        </article>)}
      </section>
    </div></div>
  </>;
}
