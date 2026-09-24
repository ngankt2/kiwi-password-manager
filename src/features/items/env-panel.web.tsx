import { Fragment, type ReactNode } from 'react';
import type { CustomField } from '@/domain/entities/vault';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useEnvView } from '@/shared/hooks/use-env-view';
import { useSecretActions } from '@/features/desktop/actions';
import { Button } from '@/features/desktop/ui';

export function EnvPanel({ raw, renderVariable }: { raw: string; renderVariable: (field: CustomField) => ReactNode }) {
  const { t } = useI18n();
  const view = useEnvView(raw);
  const { authorize, copy, authDialog } = useSecretActions();
  return <section className="desktop-detail-section desktop-env">
    <div className="desktop-section-heading"><span className="grow">{t('Nội dung .env')}</span><span className="muted tiny">{t('{count} biến', { count: view.variables.length })}</span></div>
    <div className="desktop-env-toolbar">
      <div className="desktop-env-views" role="group" aria-label={t('Cách xem Env')}>
        <Button small aria-pressed={view.mode === 'variables'} variant={view.mode === 'variables' ? 'primary' : 'secondary'} onClick={() => view.changeMode('variables')}>{t('Từng biến')}</Button>
        <Button small aria-pressed={view.mode === 'developer'} variant={view.mode === 'developer' ? 'primary' : 'secondary'} onClick={() => view.changeMode('developer')}>{t('Developer · .env')}</Button>
      </div>
      <Button small icon="content_copy" onClick={() => copy(raw, true)}>{t('Sao chép .env')}</Button>
    </div>
    {view.mode === 'variables' ? <>
      <div className="desktop-credential-group">{view.rows.map((variable) => <Fragment key={`${view.privacyEpoch}:${variable.line}`}>
        {renderVariable({ id: `env-line-${variable.line}`, label: variable.name, value: variable.value, kind: 'secret', protected: true })}
      </Fragment>)}</div>
      {!view.variables.length && <p className="muted">{t('Chưa có biến để hiển thị.')}</p>}
      {view.pages > 1 && <div className="desktop-env-pagination"><Button small disabled={!view.page} onClick={() => view.setPage(view.page - 1)}>{t('Trang trước')}</Button><span>{t('Trang {page} / {pages}', { page: view.page + 1, pages: view.pages })}</span><Button small disabled={view.page + 1 === view.pages} onClick={() => view.setPage(view.page + 1)}>{t('Trang sau')}</Button></div>}
    </> : <>
      <Button small icon={view.revealed ? 'visibility_off' : 'visibility'} onClick={() => view.revealed ? view.hide() : authorize(async () => view.reveal())}>{t(view.revealed ? 'Ẩn nội dung .env' : 'Hiện nội dung .env')}</Button>
      <pre className="desktop-env-source" tabIndex={0} aria-label={t('Nội dung .env')}>{view.revealed ? raw : t('Nội dung .env đang ẩn.')}</pre>
    </>}
    {view.invalidLines.length > 0 && <p className="desktop-hint">{t('{count} dòng chưa phân tích được. Nội dung vẫn được giữ nguyên trong chế độ Developer.', { count: view.invalidLines.length })}</p>}
    {view.duplicateNames.length > 0 && <p className="desktop-hint">{t('{count} tên biến bị lặp. Các lần khai báo được hiển thị theo thứ tự trong file.', { count: view.duplicateNames.length })}</p>}
    {authDialog}
  </section>;
}
