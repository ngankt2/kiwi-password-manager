import { router } from 'expo-router';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useAction } from '@/shared/hooks/use-action';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { PRIVACY_INTRO, PRIVACY_SECTIONS, SUPPORT_URL, privacyUpdatedDate } from '@/features/about/privacy';
import { Icon } from './ui';

export function SupportLink() {
  const { t } = useI18n();
  const { run } = useAction();
  return <a className="desktop-about-link" href={SUPPORT_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => {
    const bridge = desktopBridge();
    if (bridge) { event.preventDefault(); run(() => bridge.openExternal(SUPPORT_URL)); }
  }}>{t('Liên hệ hỗ trợ')}<Icon name="open_in_new" size={14} /></a>;
}

export function DesktopPrivacy() {
  const { t, locale } = useI18n();
  return <div className="desktop-detail-scroll"><div className="desktop-about">
    <button className="desktop-back" onClick={() => router.canGoBack() ? router.back() : router.replace('/')}><Icon name="chevron_left" />{t('Quay lại')}</button>
    <header>
      <div className="desktop-about-name"><h1>{t('Chính sách quyền riêng tư')}</h1></div>
      <p className="desktop-about-tagline">{t('Cập nhật lần cuối: {date}', { date: privacyUpdatedDate(locale) })}</p>
    </header>
    <p className="desktop-about-description">{t(PRIVACY_INTRO)}</p>
    <section className="desktop-release-log">
      {PRIVACY_SECTIONS.map((section) => <article key={section.title} className="desktop-release desktop-privacy-section">
        <h3>{t(section.title)}</h3>
        {section.paragraphs.map((paragraph) => <p key={paragraph} className="desktop-about-description">{t(paragraph)}</p>)}
      </article>)}
    </section>
    <div className="desktop-about-actions"><SupportLink /></div>
  </div></div>;
}
