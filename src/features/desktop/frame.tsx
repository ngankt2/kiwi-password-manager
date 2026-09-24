import type { CSSProperties, ReactNode } from 'react';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { useDesktopPreferences } from './preferences';
import { LanguagePicker } from './language-picker';
import { useAction } from '@/shared/hooks/use-action';
import { useSession } from '@/shared/hooks/use-session';
import { useI18n } from '@/shared/hooks/use-i18n';
import { expo as appConfig } from '../../../app.json';
import { version as appVersion } from '../../../package.json';
import { useDesktopUpdates } from './updates';

const APPKIRO_URL = `https://appkiro.com?utm_source=${encodeURIComponent(appConfig.name)}`;

export function TrafficLights() {
  return <div className="desktop-traffic-lights" aria-hidden="true"><i /><i /><i /></div>;
}

export function DesktopFrame({ children, onboard = false, footerStart }: { children: ReactNode; onboard?: boolean; footerStart?: ReactNode }) {
  const preferences = useDesktopPreferences();
  const { run } = useAction();
  const { settings } = useSession();
  const { t } = useI18n();
  const native = !!desktopBridge();
  const updates = useDesktopUpdates();
  return <div className={'desktop-canvas' + (native ? ' native-desktop' : '') + (settings.reduceMotion ? ' reduce-motion' : '')} style={{ '--sidebar-width': preferences.sideWidth + 'px', '--list-width': preferences.listWidth + 'px' } as CSSProperties}>
    <main className={'desktop-window layout-' + preferences.layout + (preferences.comfortable ? ' comfortable' : '') + (onboard ? ' onboard' : '')}>
      {onboard && <div className="desktop-onboard-chrome"><TrafficLights /><LanguagePicker compact /></div>}
      {children}
      <footer className="desktop-app-footer">
        {footerStart && <div className="desktop-app-footer-start">{footerStart}</div>}
        <div className="desktop-app-footer-end">
          {native && desktopBridge()?.updates ? <button type="button" className="desktop-app-version" title={t('Phiên bản ứng dụng {version}', { version: appVersion })} onClick={updates?.open}>v{appVersion}</button>
            : <span className="desktop-app-version" title={t('Phiên bản ứng dụng {version}', { version: appVersion })}>v{appVersion}</span>}
          <span className="desktop-footer-divider" aria-hidden="true" />
          <a href={APPKIRO_URL} target="_blank" rel="noopener noreferrer" onClick={(event) => {
            const bridge = desktopBridge();
            if (bridge) { event.preventDefault(); run(() => bridge.openExternal(APPKIRO_URL)); }
          }}>build by <span>appkiro.com</span></a>
        </div>
      </footer>
    </main>
  </div>;
}
