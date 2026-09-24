import { useI18n } from '@/shared/hooks/use-i18n';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { FIELD_KINDS, ITEM_TYPES, ItemSchema, isSecret, type CustomField, type FieldKind, type ItemType, type VaultItem } from '@/domain/entities/vault';
import { isKeePassOtpSecret, isOtpField } from '@/domain/entities/otp';
import { invalidOtpFieldIds } from '@/domain/services/otp';
import { fieldsForType } from '@/domain/entities/templates';
import { createItem, saveItem } from '@/domain/services/items';
import { toBase64, wipe } from '@/core/bytes';
import { VaultError } from '@/core/errors';
import { session } from '@/infrastructure/session';
import { pickFile } from '@/infrastructure/filesystem/transfer';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { useConfirmation } from '@/shared/hooks/use-confirmation';
import { ConflictDialog } from '@/features/data-tools/conflict-dialog';
import { useDesktopPreferences } from './preferences';
import { useWorkspace } from './workspace';
import { FolderDialog, FolderSelect } from './folders';
import { DesktopGenerator } from './generator';
import { useLabels } from './labels';
import { Button, Dialog, EmptyState, Icon, IconButton, Input, PasswordStrength } from './ui';
import { ItemIconPicker } from './item-icon-picker';
import { ENV_FIELD_ID } from '@/domain/entities/env';

const kindLabels: Record<FieldKind, string> = { text: 'Văn bản', secret: 'Bí mật', number: 'Số', url: 'URL', email: 'Email', date: 'Ngày', otp: 'OTP' };
const parseTags = (value: string) => [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
const canGeneratePassword = (field: CustomField) => isSecret(field) && !isOtpField(field) && !['private-key', 'cvv', 'pin'].includes(field.id);

export function DesktopEditor({ editing = false }: { editing?: boolean }) {
  const params = useLocalSearchParams<{ id?: string; type?: string; folder?: string; generate?: string }>();
  const { vault } = useSession();
  const preferences = useDesktopPreferences();
  const existing = vault?.items.find((item) => item.id === params.id);
  const itemType = ITEM_TYPES.includes(params.type as ItemType) ? params.type as ItemType : 'login';
  const folder = params.folder ?? (preferences.filter.startsWith('folder:') ? preferences.filter.slice(7) : null);
  return <EditorForm key={editing ? params.id : 'new-' + itemType} editing={editing} existing={existing} itemType={itemType} folder={folder} generate={!!params.generate} />;
}

function EditorForm({ existing, editing, itemType, folder, generate }: {
  existing?: VaultItem; editing: boolean; itemType: ItemType; folder: string | null; generate: boolean;
}) {
  const { t, text } = useI18n();
  const { fieldLabel } = useLabels();
  const { vault } = useSession();
  const { run, pending } = useAction();
  const { confirm, confirmationDialog } = useConfirmation();
  const workspace = useWorkspace();
  const formId = useId();
  const notesId = useId();
  const envId = useId();
  const [draft, setDraft] = useState<VaultItem>(() => existing ? ItemSchema.parse(existing) : createItem(session.id(), itemType, vault?.folders.some((entry) => entry.id === folder) ? folder : null));
  const [tags, setTags] = useState(() => existing?.tags.join(', ') ?? '');
  const [dirty, setDirty] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [generatorField, setGeneratorField] = useState<string | null>(generate ? 'password' : null);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [iconLoading, setIconLoading] = useState(false);
  const otpErrors = useMemo(() => invalidOtpFieldIds(draft.fields.filter((field) => draft.type !== 'env' || field.id !== ENV_FIELD_ID), existing?.fields), [draft.type, draft.fields, existing?.fields]);
  const touch = () => { setDirty(true); workspace.setDirty(true); };
  const update = <K extends keyof VaultItem>(key: K, value: VaultItem[K]) => { setDraft((draft) => ({ ...draft, [key]: value })); touch(); };
  const updateField = (id: string, patch: Partial<CustomField>) => {
    setDraft((draft) => ({ ...draft, fields: draft.fields.map((field) => field.id === id ? { ...field, ...patch } : field) })); touch();
  };
  const submit = useCallback(() => {
    setSubmitted(true);
    if (pending || iconLoading) return;
    if (!draft.title.trim() || otpErrors.size) {
      session.notify(null);
      requestAnimationFrame(() => {
        const invalid = document.getElementById(formId)?.querySelector<HTMLInputElement>('[aria-invalid="true"]');
        invalid?.focus(); invalid?.scrollIntoView({ block: 'center' });
      });
      return;
    }
    run(async () => {
      try {
        await session.mutate((vault) => saveItem(vault, { ...draft, tags: parseTags(tags) }, session.id(), undefined, 'Item updated'));
        setDirty(false); workspace.setDirty(false); workspace.openItem(draft.id); session.notify('Đã lưu mục.');
      } catch (error) {
        if (error instanceof VaultError && error.code === 'CONFLICT') setConflict(true);
        else throw error;
      }
    });
  }, [draft, formId, iconLoading, otpErrors, pending, run, tags, workspace]);
  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!document.querySelector('dialog[open]')) submit();
      }
    };
    const unload = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    document.addEventListener('keydown', save);
    document.addEventListener('kiro:save', submit);
    window.addEventListener('beforeunload', unload);
    return () => { document.removeEventListener('keydown', save); document.removeEventListener('kiro:save', submit); window.removeEventListener('beforeunload', unload); };
  }, [dirty, submit]);
  if (!vault || editing && !existing) return <EmptyState icon="find_in_page" title={t("Không tìm thấy mục")} description={t("Mục này có thể đã được di chuyển hoặc xoá.")} />;
  const templates = new Set(fieldsForType(draft.type).map((field) => field.id));
  const cancel = () => workspace.navigate(() => existing ? workspace.openItem(existing.id) : workspace.backToList());
  const attach = () => run(async () => {
    const file = await pickFile(false);
    if (!file) return;
    try {
      if (file.bytes.length > 8_388_608) throw new VaultError('LIMIT_EXCEEDED');
      update('attachments', [...draft.attachments, { id: session.id(), name: file.name, data: toBase64(file.bytes), size: file.bytes.length, mimeType: 'application/octet-stream' }]);
    } finally { wipe(file.bytes); }
  });
  return <>
    <div className="desktop-detail-toolbar"><span className="grow" style={{ color: 'var(--color-label)', fontWeight: 500 }}>{editing ? t("Sửa mục") : t('Mục mới')}</span><Button small onClick={cancel}>{t("Huỷ")}</Button><Button form={formId} type="submit" small variant="primary" busy={pending} disabled={iconLoading} title={iconLoading ? t('Đang tải icon…') : t("Lưu (⌘S)")}>{t("Lưu")}</Button></div>
    <div className="desktop-detail-scroll">
      <form id={formId} className="desktop-detail-content desktop-editor" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="desktop-editor-identity"><ItemIconPicker item={draft} website={draft.fields.find((field) => field.id === 'website' && !isSecret(field))?.value} onBusyChange={setIconLoading} onChange={(metadata) => update('metadata', metadata)} /><div className="grow"><Input label={t("Tên mục")} className="desktop-title-input" aria-label={t("Tên mục")} value={draft.title} onChange={(event) => update('title', event.target.value)}
          placeholder={t("Tên mục")} autoFocus={!editing} maxLength={4096} error={submitted && !draft.title.trim() ? t("Tên không được để trống.") : undefined} /></div></div>
        <FolderSelect value={draft.folderId ?? ''} onChange={(value) => update('folderId', value || null)} vault={vault} onCreate={setNewFolderName} />
        {draft.type === 'env' && <div className="desktop-field"><label htmlFor={envId}>{t('Nội dung .env')}</label><textarea id={envId} className="desktop-textarea desktop-env-editor" rows={16}
          value={draft.fields.find((field) => field.id === ENV_FIELD_ID)?.value ?? ''} maxLength={4_194_304}
          onChange={(event) => updateField(ENV_FIELD_ID, { value: event.target.value })} placeholder={t('Dán nội dung file .env…')} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" />
          <span className="desktop-hint">{t('Giữ nguyên nội dung, comment và dòng trống. Các giá trị được mã hoá cùng kho.')}</span></div>}
        {draft.fields.filter((field) => templates.has(field.id) && !(draft.type === 'env' && field.id === ENV_FIELD_ID)).map((field) => <div className="desktop-field" key={field.id}>
            <Input label={fieldLabel(field, draft.type)} value={field.value} onChange={(event) => updateField(field.id, { value: event.target.value })} secret={isSecret(field)}
              autoComplete="off" spellCheck={false} placeholder={isOtpField(field) ? t('Khóa Base32 hoặc otpauth://totp/…') : field.kind === 'url' ? 'https://' : undefined}
              error={submitted && otpErrors.has(field.id) ? t('Thiết lập TOTP không hợp lệ hoặc chưa được hỗ trợ.') : undefined}
              hint={isOtpField(field) ? t('Dán khóa bí mật Base32 hoặc liên kết otpauth://totp/… từ dịch vụ.') : undefined}
              rightAddon={canGeneratePassword(field) && <IconButton icon="auto_awesome" label={t('Tạo mật khẩu cho {name}', { name: fieldLabel(field, draft.type) })} onClick={() => setGeneratorField(field.id)} />} />
          {field.id === 'password' && <PasswordStrength value={field.value} />}
        </div>)}
        <div className="desktop-field"><label htmlFor={notesId}>{t("Ghi chú")}</label><textarea id={notesId} className="desktop-textarea" rows={draft.type === 'secure-note' ? 10 : 6} value={draft.notes}
          onChange={(event) => update('notes', event.target.value)} placeholder={t("Nội dung ghi chú…")} /></div>
        <section className="desktop-detail-section"><h2>{t("Trường tuỳ chỉnh")}</h2>
          {draft.fields.filter((field) => !templates.has(field.id)).map((field) => <div className="desktop-custom-row" key={field.id}>
            <Input label={t("Tên trường tuỳ chỉnh")} labelHidden value={field.label} onChange={(event) => updateField(field.id, { label: event.target.value })} placeholder={t("Tên trường")} maxLength={500} />
            <select className="desktop-select" aria-label={t('Loại trường {name}', { name: field.label })} value={field.kind} onChange={(event) => { const kind = event.target.value as FieldKind; updateField(field.id, { kind, protected: ['secret', 'otp'].includes(kind) }); }}>
              {FIELD_KINDS.map((kind) => <option key={kind} value={kind}>{text(kindLabels[kind])}</option>)}
            </select>
            <Input key={field.kind + String(isSecret(field))} label={t('Giá trị {name}', { name: field.label || t('trường tuỳ chỉnh') })} labelHidden secret={isSecret(field)}
              value={field.value} onChange={(event) => updateField(field.id, { value: event.target.value })} placeholder={t("Giá trị")} spellCheck={false} autoComplete="off"
              error={submitted && otpErrors.has(field.id) ? t('Thiết lập TOTP không hợp lệ hoặc chưa được hỗ trợ.') : undefined}
              hint={isOtpField(field) && !isKeePassOtpSecret(field.label) ? t('Dán khóa bí mật Base32 hoặc liên kết otpauth://totp/… từ dịch vụ.') : undefined}
              rightAddon={canGeneratePassword(field) && <IconButton icon="auto_awesome" label={t('Tạo mật khẩu cho {name}', { name: field.label || t('trường tuỳ chỉnh') })} onClick={() => setGeneratorField(field.id)} />} />
            <IconButton icon="remove_circle" label={t('Xoá trường {name}', { name: field.label })} danger onClick={() => confirm({ title: t("Xoá trường này?"), description: t('Trường “{name}” và giá trị của trường sẽ bị bỏ khỏi bản chỉnh sửa. Thay đổi chỉ được áp dụng khi bạn lưu mục.', { name: field.label || t('Chưa đặt tên') }), confirmLabel: t("Xoá trường"), onConfirm: () => update('fields', draft.fields.filter((entry) => entry.id !== field.id)) })} />
          </div>)}
          <Button className="desktop-add-field" icon="add" onClick={() => update('fields', [...draft.fields, { id: session.id(), label: '', kind: 'text', protected: false, value: '' }])}>{t("Thêm trường")}</Button>
        </section>
        <Input label={t("Thẻ")} value={tags} onChange={(event) => { setTags(event.target.value); touch(); }} placeholder={t("Phân cách bằng dấu phẩy")} />
        <label className="desktop-generator-option"><input type="checkbox" checked={draft.favorite} onChange={(event) => update('favorite', event.target.checked)} />{t("Thêm vào Yêu thích")}</label>
        <section className="desktop-detail-section"><h2>{t("Tệp đính kèm")}</h2>
          {draft.attachments.map((file) => <div className="desktop-attachment" key={file.id}><Icon name="attach_file" /><span className="grow">{file.name}</span><span className="muted tiny">{Math.max(1, Math.round(file.size / 1024))} KB</span><IconButton icon="close" label={t('Xoá tệp {name}', { name: file.name })} onClick={() => confirm({ title: t("Gỡ tệp đính kèm?"), description: t('Tệp “{name}” sẽ bị gỡ khỏi bản chỉnh sửa. File gốc trên thiết bị vẫn được giữ nguyên. Thay đổi chỉ được áp dụng khi bạn lưu mục.', { name: file.name }), confirmLabel: t("Gỡ tệp"), onConfirm: () => update('attachments', draft.attachments.filter((entry) => entry.id !== file.id)) })} /></div>)}
          <Button className="desktop-add-field" icon="attach_file" busy={pending} onClick={attach}>{t("Đính kèm tệp")}</Button>
          <span className="desktop-hint">{t("Tối đa 8 MB mỗi tệp. Được mã hoá cùng Vault.")}</span>
        </section>
        <div className="desktop-editor-save"><Icon name="lock" size={14} /><span className="grow">{iconLoading ? t('Đang tải icon…') : dirty ? t("Bạn có thay đổi chưa lưu") : t("Thông tin được mã hoá trong Vault")}</span><Button small onClick={cancel}>{t("Huỷ")}</Button><Button type="submit" small variant="primary" busy={pending} disabled={iconLoading}>{t("Lưu")}</Button></div>
      </form>
    </div>
    <Dialog open={!!generatorField} title={t("Tạo mật khẩu")} onClose={() => setGeneratorField(null)}>
      {!!generatorField && <DesktopGenerator onClose={() => setGeneratorField(null)} onUse={(value) => { updateField(generatorField, { value }); setGeneratorField(null); }} />}
    </Dialog>
    <FolderDialog open={newFolderName !== null} initialName={newFolderName ?? ''} initialParent={draft.folderId ?? undefined}
      onCreated={(id) => update('folderId', id)} onClose={() => setNewFolderName(null)} />
    <ConflictDialog open={conflict} draft={{ ...draft, tags: parseTags(tags) }} onClose={() => setConflict(false)} />
    {confirmationDialog}
  </>;
}
