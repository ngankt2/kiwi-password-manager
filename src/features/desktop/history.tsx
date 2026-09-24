import { useI18n } from '@/shared/hooks/use-i18n';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { isSecret, type ItemSnapshot, type Vault } from '@/domain/entities/vault';
import { getItemColor, getItemIcon, getItemIconImage } from '@/domain/entities/item-icon';
import { BRAND_ICONS } from '@/shared/brand-icons';
import { ITEM_ICON_OPTIONS } from '@/shared/item-icons';
import { restoreVersion } from '@/domain/services/items';
import { folderPath } from '@/domain/services/search';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { useSecretReveal } from '@/shared/hooks/use-secret-reveal';
import { session } from '@/infrastructure/session';
import { useWorkspace } from './workspace';
import { useSecretActions } from './actions';
import { useLabels } from './labels';
import { Button, Dialog, EmptyState, Icon } from './ui';

type Value = { label: string; value: string; comparison?: string; protected: boolean };
function values(snapshot: ItemSnapshot, vault: Vault, labels: ReturnType<typeof useLabels>, i18n: ReturnType<typeof useI18n>): Map<string, Value> {
  const { itemTypes, fieldLabel } = labels;
  const { t } = i18n;
  const icon = getItemIcon(snapshot.metadata);
  const image = getItemIconImage(snapshot.metadata);
  return new Map<string, Value>([
    ['title', { label: t('Tên mục'), value: snapshot.title, protected: false }],
    ['type', { label: t('Loại mục'), value: itemTypes[snapshot.type].label, protected: false }],
    ['icon', { label: t('Biểu tượng'), value: image ? BRAND_ICONS.find((brand) => brand.id === image.brand)?.label ?? t('Ảnh đã lưu') : icon ? i18n.text(ITEM_ICON_OPTIONS[icon].label) : t('Mặc định theo loại mục'), comparison: image?.dataUri, protected: false }],
    ['color', { label: t('Màu biểu tượng'), value: getItemColor(snapshot.metadata) ?? t('Mặc định theo loại mục'), protected: false }],
    ['folder', { label: t('Thư mục'), value: folderPath(vault, snapshot.folderId) || t('Vault gốc'), protected: false }],
    ...snapshot.fields.map((field): [string, Value] => ['field:' + field.id, { label: fieldLabel(field, snapshot.type), value: field.value, protected: isSecret(field) }]),
    ['notes', { label: t('Ghi chú'), value: snapshot.notes, protected: true }],
    ['tags', { label: t('Thẻ'), value: snapshot.tags.join(', '), protected: false }],
    ['favorite', { label: t('Yêu thích'), value: snapshot.favorite ? t('Có') : t('Không'), protected: false }],
    ['attachments', { label: t('Tệp đính kèm'), value: snapshot.attachments.map((file) => file.name + ' (' + file.size + ' B)').join('\n'), protected: false }],
  ]);
}

export function DesktopHistory() {
  const i18n = useI18n();
  const { t, text, dateTime } = i18n;
  const labels = useLabels();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vault } = useSession();
  const workspace = useWorkspace();
  const { run, pending } = useAction();
  const { authorize, authDialog } = useSecretActions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restore, setRestore] = useState(false);
  const item = vault?.items.find((entry) => entry.id === id);
  const { revealed, reveal, hide } = useSecretReveal(`${id}:${selectedId}:${item?.updatedAt}`);
  if (!vault || !item) return <EmptyState title={t("Không tìm thấy mục")} />;
  const versions = [...item.history.map((version, index) => ({ id: version.id, number: index + 1, snapshot: version.snapshot, summary: text(version.summary), date: version.snapshot.updatedAt, current: false })),
    { id: 'current', number: item.history.length + 1, snapshot: item, summary: item.history.length ? t("Phiên bản đang sử dụng") : t("Đã tạo mục"), date: item.updatedAt, current: true }];
  const selected = versions.find((version) => version.id === selectedId);
  const previous = selected ? values(selected.snapshot, vault, labels, i18n) : new Map<string, Value>();
  const current = values(item, vault, labels, i18n);
  const keys = [...new Set([...previous.keys(), ...current.keys()])];
  const changes = keys.filter((key) => (previous.get(key)?.comparison ?? previous.get(key)?.value) !== (current.get(key)?.comparison ?? current.get(key)?.value)).map((key) => ({
    key, label: current.get(key)?.label ?? previous.get(key)?.label ?? '', before: previous.get(key)?.value ?? '',
    after: current.get(key)?.value ?? '', protected: !!(current.get(key)?.protected || previous.get(key)?.protected),
  }));
  const back = () => { if (selected) { setSelectedId(null); hide(); } else workspace.openItem(item.id); };
  return <>
    <div className="desktop-detail-toolbar"><button className="desktop-back" onClick={back}><Icon name="chevron_left" />{selected ? t("Lịch sử") : t("Chi tiết")}</button></div>
    <div className="desktop-detail-scroll"><div className="desktop-detail-content" style={{ gap: selected ? 18 : 6 }}>
      {!selected ? <>
        <h1 className="desktop-history-title">{t("Lịch sử phiên bản")}</h1><p className="desktop-history-subtitle" style={{ marginBottom: 18 }}>{item.title} · {t('{count} phiên bản', { count: versions.length })}</p>
        {[...versions].reverse().map((version, index) => <button key={version.id} className="desktop-history-row" onClick={() => { setSelectedId(version.id); hide(); }}>
          <div className="desktop-timeline"><span className="desktop-timeline-dot" style={{ background: version.current ? 'var(--color-accent)' : 'var(--color-placeholder)' }} /><span className="desktop-timeline-line" style={{ visibility: index === versions.length - 1 ? 'hidden' : 'visible' }} /></div>
          <div className="desktop-history-row-text"><div className="desktop-history-row-title"><span style={{ fontWeight: 500 }}>{dateTime(version.date)}</span><span className="tiny muted">{t('Phiên bản {count}', { count: version.number })}</span>{version.current && <span className="desktop-version-badge">{t("Hiện tại")}</span>}</div><p>{version.summary}</p></div>
          <span style={{ paddingTop: 12, color: 'var(--color-dim)' }}><Icon name="chevron_right" /></span>
        </button>)}
      </> : <>
        <div><h1 className="desktop-history-title">{t('Phiên bản {count}', { count: selected.number })}</h1><p className="desktop-history-subtitle" style={{ marginTop: 4 }}>{dateTime(selected.date)} · {selected.summary}</p></div>
        {changes.length ? <>
          <div className="desktop-section-heading"><span className="grow">{t("Thay đổi so với hiện tại")}</span>{changes.some((change) => change.protected) && <button className="desktop-text-action" onClick={() => revealed ? hide() : authorize(async () => reveal())}>{revealed ? t("Ẩn giá trị bí mật") : t("Hiện giá trị bí mật")}</button>}</div>
          {changes.map((change) => <div className="desktop-change" key={change.key}><div className="desktop-change-title">{change.label}</div><div className="desktop-change-values">
            <span>{t("Trước")}</span><span className={change.protected ? 'mono' : ''}>{change.protected && !revealed && change.before ? '••••••••••••' : change.before || t("(trống)")}</span>
            <span>{t("Hiện tại")}</span><span className={change.protected ? 'mono' : ''}>{change.protected && !revealed && change.after ? '••••••••••••' : change.after || t("(trống)")}</span>
          </div></div>)}
        </> : <p className="desktop-history-subtitle">{selected.current ? t("Đây là phiên bản hiện tại của mục này.") : t("Các trường thông tin giống với phiên bản hiện tại.")}</p>}
        <div className="desktop-restore-row"><Button variant="primary" disabled={selected.current} onClick={() => setRestore(true)}>{t("Khôi phục phiên bản này")}</Button><span className="desktop-hint">{t("Tạo một phiên bản mới và giữ lại toàn bộ lịch sử.")}</span></div>
      </>}
    </div></div>
    <Dialog open={restore} title={t("Khôi phục phiên bản này?")} description={t("Thông tin của phiên bản đã chọn sẽ được dùng làm phiên bản hiện tại. Những phiên bản mới hơn vẫn được giữ trong lịch sử.")} onClose={() => setRestore(false)}
      footer={<><Button onClick={() => setRestore(false)}>{t("Huỷ")}</Button><Button variant="primary" busy={pending} onClick={() => run(async () => {
        if (!selected || selected.current) return;
        await session.mutate((vault) => restoreVersion(vault, item.id, selected.id, session.id()));
        setRestore(false); setSelectedId(null); hide(); session.notify('Đã khôi phục phiên bản.');
      })}>{t("Khôi phục")}</Button></>} />
    {authDialog}
  </>;
}
