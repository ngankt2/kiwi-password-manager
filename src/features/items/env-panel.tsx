import { Fragment, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { CustomField } from '@/domain/entities/vault';
import { Button, Eyebrow, T } from '@/design-system/components/ui';
import { ReauthDialog } from '@/design-system/components/reauth-dialog';
import { colors } from '@/design-system/tokens';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useEnvView } from '@/shared/hooks/use-env-view';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { clipboard } from '@/infrastructure/clipboard';
import { session } from '@/infrastructure/session';

export function EnvPanel({ raw, renderVariable }: { raw: string; renderVariable: (field: CustomField) => ReactNode }) {
  const { t } = useI18n();
  const view = useEnvView(raw);
  const { settings } = useSession();
  const { run } = useAction();
  const [auth, setAuth] = useState<((password: string) => Promise<void>) | null>(null);
  const authorize = (action: () => Promise<void>) => {
    if (settings.requireAuthenticationToReveal) setAuth(() => async (password: string) => { await session.reauthenticate(password); await action(); });
    else run(action);
  };
  return <View style={{ gap: 14, marginTop: 28 }}>
    <Eyebrow>{t('Nội dung .env')} · {t('{count} biến', { count: view.variables.length })}</Eyebrow>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Button title={t('Từng biến')} small variant={view.mode === 'variables' ? 'primary' : 'secondary'} onPress={() => view.changeMode('variables')} />
      <Button title={t('Developer · .env')} small variant={view.mode === 'developer' ? 'primary' : 'secondary'} onPress={() => view.changeMode('developer')} />
      <Button title={t('Sao chép .env')} small variant="secondary" onPress={() => authorize(async () => {
        const result = await clipboard.copy(raw, settings.clipboardSeconds);
        session.notify(result.autoClears ? t('Đã sao chép. Tự xoá sau {count} giây.', { count: settings.clipboardSeconds }) : t('Đã sao chép vào clipboard.'));
      })} />
    </View>
    {view.mode === 'variables' ? <>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}>{view.rows.map((variable) => <Fragment key={`${view.privacyEpoch}:${variable.line}`}>
        {renderVariable({ id: `env-line-${variable.line}`, label: variable.name, value: variable.value, kind: 'secret', protected: true })}
      </Fragment>)}</View>
      {!view.variables.length && <T muted>{t('Chưa có biến để hiển thị.')}</T>}
      {view.pages > 1 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}><Button title={t('Trang trước')} small variant="secondary" disabled={!view.page} onPress={() => view.setPage(view.page - 1)} /><T>{t('Trang {page} / {pages}', { page: view.page + 1, pages: view.pages })}</T><Button title={t('Trang sau')} small variant="secondary" disabled={view.page + 1 === view.pages} onPress={() => view.setPage(view.page + 1)} /></View>}
    </> : <>
      <Button title={t(view.revealed ? 'Ẩn nội dung .env' : 'Hiện nội dung .env')} variant="secondary" onPress={() => view.revealed ? view.hide() : authorize(async () => view.reveal())} />
      <ScrollView horizontal style={{ maxHeight: 440, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }} contentContainerStyle={{ padding: 16 }}>
        <T mono selectable={view.revealed} style={{ lineHeight: 22 }}>{view.revealed ? raw : t('Nội dung .env đang ẩn.')}</T>
      </ScrollView>
    </>}
    {view.invalidLines.length > 0 && <T muted>{t('{count} dòng chưa phân tích được. Nội dung vẫn được giữ nguyên trong chế độ Developer.', { count: view.invalidLines.length })}</T>}
    {view.duplicateNames.length > 0 && <T muted>{t('{count} tên biến bị lặp. Các lần khai báo được hiển thị theo thứ tự trong file.', { count: view.duplicateNames.length })}</T>}
    <ReauthDialog action={auth} onClose={() => setAuth(null)} />
  </View>;
}
