import { useI18n } from '@/shared/hooks/use-i18n';
import { useEffect, useId, useState, type MouseEvent } from 'react';
import { isSecret, type CustomField, type VaultItem } from '@/domain/entities/vault';
import { fieldsForType } from '@/domain/entities/templates';
import { folderPath } from '@/domain/services/search';
import { updateItems } from '@/domain/services/items';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { useSecretReveal } from '@/shared/hooks/use-secret-reveal';
import { session } from '@/infrastructure/session';
import { isOtpField } from '@/domain/entities/otp';
import { generateFieldOtp } from '@/domain/services/otp';
import { fromBase64, wipe } from '@/core/bytes';
import { exportFile } from '@/infrastructure/filesystem/transfer';
import { useSecretActions } from './actions';
import { useLabels } from './labels';
import { Button, EmptyState, Icon, IconButton, ItemTile } from './ui';
import { envContent, ENV_FIELD_ID } from '@/domain/entities/env';
import { EnvPanel } from '@/features/items/env-panel';

export function Credential({ field, fields, itemType, literal = false }: { field: CustomField; fields: CustomField[]; itemType: VaultItem['type']; literal?: boolean }) {
  const { t } = useI18n();
  const { fieldLabel } = useLabels();
  const [revealed, setRevealed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { authorize, copy, openUrl, authDialog } = useSecretActions();
  const secret = isSecret(field);
  const isOtp = !literal && isOtpField(field);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(false), 15_000);
    return () => clearTimeout(timer);
  }, [revealed]);
  useEffect(() => {
    if (!isOtp) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isOtp]);
  if (!field.value && !literal) return null;
  let value = field.value;
  let remaining: number | null = null;
  let otpError = false;
  if (isOtp) {
    try { const result = generateFieldOtp(field, fields, now); value = result.code; remaining = result.remaining; }
    catch { otpError = true; }
  }
  const copyValue = () => {
    if (!otpError) copy(isOtp ? () => generateFieldOtp(field, fields).code : field.value, secret);
  };
  return <div className="desktop-credential">
    <div className="grow">
      <div className="desktop-credential-label">{fieldLabel(field, itemType)}</div>
      <button type="button" className={'desktop-credential-value' + (secret ? ' secret' : '')} onClick={copyValue} disabled={otpError} title={otpError ? undefined : t("Bấm để sao chép")} aria-label={secret && !revealed && !otpError ? t('{name}, đang ẩn', { name: fieldLabel(field, itemType) }) : undefined}>
        {otpError ? t('Chưa tạo được mã TOTP') : secret && !revealed ? '••••••••••••' : value || t('(trống)')}
      </button>
      {otpError && <div className="desktop-error">{t('Chọn Sửa để kiểm tra khóa bí mật và thiết lập TOTP.')}</div>}
      {remaining !== null && <div className="tiny muted">{t('Làm mới sau {count} giây', { count: remaining })}</div>}
    </div>
    <div className="desktop-credential-actions">
      {secret && !otpError && <IconButton icon={revealed ? 'visibility_off' : 'visibility'} label={revealed ? t("Ẩn") : t("Hiện")} onClick={() => revealed ? setRevealed(false) : authorize(async () => { setNow(Date.now()); setRevealed(true); })} />}
      {field.kind === 'url' && !secret && <IconButton icon="open_in_new" label={t("Mở")} onClick={() => openUrl(field.value)} />}
      <IconButton icon="content_copy" label={t("Sao chép")} onClick={copyValue} disabled={otpError} />
    </div>
    {authDialog}
  </div>;
}

function Notes({ notes }: { notes: string }) {
  const { t } = useI18n();
  const { revealed, reveal, hide } = useSecretReveal(notes);
  const { authorize, copy, authDialog } = useSecretActions();
  const contentId = useId();
  return <section className="desktop-detail-section" aria-label={t('Ghi chú')}>
    <div className="desktop-section-heading"><span className="grow">{t('Ghi chú')}</span>
      {notes && <div className="desktop-note-actions">
        <button type="button" className="desktop-text-action" aria-label={t(revealed ? 'Ẩn {name}' : 'Hiện {name}', { name: t('Ghi chú') })} aria-expanded={revealed} aria-controls={contentId}
          onClick={() => revealed ? hide() : authorize(async () => reveal())}>
          <Icon name={revealed ? 'visibility_off' : 'visibility'} size={15} />{t(revealed ? 'Ẩn' : 'Hiện')}
        </button>
        <button type="button" className="desktop-text-action primary" aria-label={t('Sao chép {name}', { name: t('Ghi chú') })} onClick={() => copy(notes, true)}>{t('Sao chép')}</button>
      </div>}
    </div>
    <div id={contentId} className={'desktop-note' + (notes && !revealed ? ' concealed' : '')}>
      {!notes ? t('Chưa có ghi chú.') : revealed ? notes : <span className="desktop-note-mask">
        <Icon name="lock" size={16} /><span className="mono" aria-hidden="true">••••••••••••</span><span className="desktop-sr-only">{t('{name}, đang ẩn', { name: t('Ghi chú') })}</span>
      </span>}
    </div>
    {authDialog}
  </section>;
}

export function Detail({ item, onEdit, onHistory, onMenu, onBack, onTag }: {
  item?: VaultItem; onEdit: () => void; onHistory: () => void; onMenu: (event: MouseEvent<HTMLButtonElement>) => void; onBack: () => void; onTag: (tag: string) => void;
}) {
  const { t } = useI18n();
  const { itemTypes, dateTime } = useLabels();
  const { vault } = useSession();
  const { run } = useAction();
  const { authorize, authDialog } = useSecretActions();
  if (!item || !vault) return <><div className="desktop-detail-toolbar" /><EmptyState>
    <div className="desktop-empty-shortcuts"><span>⌘K</span><span>{t("Tìm kiếm")}</span><span>⌘N</span><span>{t("Mục mới")}</span><span>↑ ↓</span><span>{t("Di chuyển trong danh sách")}</span><span>⌘L</span><span>{t("Khoá Vault")}</span></div>
  </EmptyState></>;
  const template = new Set(fieldsForType(item.type).map((field) => field.id));
  const fields = item.fields.filter((field) => template.has(field.id) && field.value && !(item.type === 'env' && field.id === ENV_FIELD_ID));
  const custom = item.fields.filter((field) => !template.has(field.id) && field.value);
  const favorite = () => run(() => session.mutate((vault) => updateItems(vault, [item.id], { favorite: !item.favorite }, () => session.id())));
  return <>
    <div className="desktop-detail-toolbar desktop-detail-header">
      <button className="desktop-back desktop-mobile-only" onClick={onBack}><Icon name="chevron_left" />{t("Danh sách")}</button>
      <div className="desktop-detail-identity grow"><ItemTile type={item.type} metadata={item.metadata} size={60} /><div className="grow"><h1>{item.title || t("Chưa đặt tên")}</h1><p>{itemTypes[item.type].label}{item.folderId ? ' · ' + folderPath(vault, item.folderId) : ''}</p></div></div>
      <div className="desktop-detail-actions">
        <IconButton icon="star" label={item.favorite ? t("Bỏ yêu thích") : t("Thêm vào Yêu thích")} active={item.favorite} onClick={favorite} />
        <IconButton icon="more_horiz" label={t("Thêm thao tác")} onClick={onMenu} />
        {!item.deletedAt && <Button small onClick={onEdit} title={t("Sửa (⌘E)")}>{t("Sửa")}</Button>}
      </div>
    </div>
    <div className="desktop-detail-scroll"><div className="desktop-detail-content">
      {(item.archivedAt || item.deletedAt) && <div className="desktop-banner"><Icon name={item.deletedAt ? 'delete' : 'archive'} /><span className="grow">{item.deletedAt ? t("Mục này đang ở trong Thùng rác.") : t("Mục này đã được lưu trữ.")}</span><Button small onClick={() => run(() => session.mutate((vault) => updateItems(vault, [item.id], { deletedAt: null, archivedAt: null }, () => session.id())))}>{t("Khôi phục")}</Button></div>}
      {item.type === 'env' && <EnvPanel key={item.id + ':' + item.updatedAt} raw={envContent(item)} renderVariable={(field) => <Credential field={field} fields={[]} itemType="env" literal />} />}
      {fields.length > 0 && <section className="desktop-detail-section"><h2>{item.type === 'login' ? t("Thông tin đăng nhập") : t('Thông tin')}</h2><div className="desktop-credential-group">{fields.map((field) => <Credential key={item.id + ':' + field.id} field={field} fields={item.fields} itemType={item.type} />)}</div></section>}
      {(item.notes || item.type === 'secure-note') && <Notes key={item.id} notes={item.notes} />}
      {custom.length > 0 && <section className="desktop-detail-section"><h2>{t("Trường tuỳ chỉnh")}</h2><div className="desktop-credential-group">{custom.map((field) => <Credential key={item.id + ':' + field.id} field={field} fields={item.fields} itemType={item.type} />)}</div></section>}
      {item.attachments.length > 0 && <section className="desktop-detail-section"><h2>{t("Tệp đính kèm")}</h2>{item.attachments.map((file) => <button key={file.id} className="desktop-attachment" onClick={() => authorize(async () => {
        const bytes = fromBase64(file.data);
        try { await exportFile(file.name, bytes, true); } finally { wipe(bytes); }
      }, true)}><Icon name="attach_file" /><span className="grow">{file.name}</span><span className="muted tiny">{Math.max(1, Math.round(file.size / 1024))} KB</span><Icon name="download" /></button>)}</section>}
      {item.tags.length > 0 && <section className="desktop-detail-section"><h2>{t("Thẻ")}</h2><div className="desktop-tags">{item.tags.map((tag) => <button key={tag} className="desktop-tag" onClick={() => onTag(tag)}>{tag}</button>)}</div></section>}
      <section className="desktop-detail-section"><h2>{t("Thông tin")}</h2><div className="desktop-information"><span>{t("Loại")}</span><span>{itemTypes[item.type].label}</span><span>{t("Thư mục")}</span><span>{folderPath(vault, item.folderId) || t("Vault gốc")}</span><span>{t("Ngày tạo")}</span><span>{dateTime(item.createdAt)}</span><span>{t("Cập nhật")}</span><span>{dateTime(item.updatedAt)}</span></div></section>
      <button className="desktop-history-link" onClick={onHistory}><Icon name="history" size={19} /><span className="grow">{t("Lịch sử phiên bản")}<span className="muted" style={{ marginLeft: 8 }}>{item.history.length + 1}</span></span><Icon name="chevron_right" /></button>
    </div></div>
    {authDialog}
  </>;
}
