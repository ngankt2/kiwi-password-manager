import { useConfirmation } from '@/shared/hooks/use-confirmation';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Check, FolderPlus, Paperclip, Plus, ShieldCheck, Trash2, WandSparkles, X } from 'lucide-react-native';
import { Button, Dialog, Divider, Eyebrow, IconButton, Input, PageHeader, Select, T, ToggleRow } from '@/design-system/components/ui';
import { colors } from '@/design-system/tokens';
import { AppShell, CreateFolderDialog } from '@/features/vault/app-shell';
import { GeneratorPanel } from '@/features/generator/generator-panel';
import { ItemIconPicker } from './item-icon-picker';
import { ENV_FIELD_ID } from '@/domain/entities/env';
import { FIELD_KINDS, ITEM_TYPES, ItemSchema, isSecret, type FieldKind, type ItemType, type VaultItem } from '@/domain/entities/vault';
import { isKeePassOtpSecret, isOtpField } from '@/domain/entities/otp';
import { invalidOtpFieldIds } from '@/domain/services/otp';
import { TYPE_LABELS, fieldsForType } from '@/domain/entities/templates';
import { createItem, saveItem } from '@/domain/services/items';
import { folderPath } from '@/domain/services/search';
import { toBase64, wipe } from '@/core/bytes';
import { VaultError } from '@/core/errors';
import { useAction } from '@/shared/hooks/use-action';
import { useSession } from '@/shared/hooks/use-session';
import { session } from '@/infrastructure/session';
import { pickFile } from '@/infrastructure/filesystem/transfer';

export function EditorScreen({ editing = false }: { editing?: boolean }) {
  const { t } = useI18n();
  const { confirm: confirmRemoval, confirmationDialog } = useConfirmation();
  const { id, type, generate } = useLocalSearchParams<{ id?: string; type?: string; generate?: string }>();
  const { vault } = useSession(); const { pending, run } = useAction();
  const existing = vault?.items.find((item) => item.id === id);
  const itemType: ItemType = ITEM_TYPES.includes(type as ItemType) ? type as ItemType : 'login';
  const [draft, setDraft] = useState<VaultItem>(() => existing ? ItemSchema.parse(existing) : createItem(session.id(), itemType));
  const [dirty, setDirty] = useState(false); const [discard, setDiscard] = useState(false); const [submitted, setSubmitted] = useState(false);
  const [generatorField, setGeneratorField] = useState<string | null>(generate ? 'password' : null);
  const [newField, setNewField] = useState(false); const [fieldName, setFieldName] = useState(''); const [fieldKind, setFieldKind] = useState<FieldKind>('secret'); const [newFolder, setNewFolder] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [iconLoading, setIconLoading] = useState(false);
  const otpErrors = useMemo(() => invalidOtpFieldIds(draft.fields.filter((field) => draft.type !== 'env' || field.id !== ENV_FIELD_ID), existing?.fields), [draft.type, draft.fields, existing?.fields]);
  const update = <K extends keyof VaultItem>(key: K, value: VaultItem[K]) => { setDraft((item) => ({ ...item, [key]: value })); setDirty(true); };
  const fieldValue = (fieldId: string, value: string) => { setDraft((item) => ({ ...item, fields: item.fields.map((field) => field.id === fieldId ? { ...field, value } : field) })); setDirty(true); };
  const back = () => { if (router.canGoBack()) router.back(); else router.replace('/vault'); };
  const submit = useCallback(() => {
    setSubmitted(true);
    if (pending || iconLoading) return;
    if (!draft.title.trim() || otpErrors.size) { session.notify(null); return; }
    run(async () => {
      try {
        await session.mutate((vault) => saveItem(vault, draft, session.id()));
        setDirty(false);
        router.replace({ pathname: '/item/[id]', params: { id: draft.id } });
      } catch (error) { if (error instanceof VaultError && error.code === 'CONFLICT') setConflict(true); else throw error; }
    });
  }, [draft, iconLoading, otpErrors, pending, run]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.addEventListener('kiro:save', submit);
    const unload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', unload);
    return () => { document.removeEventListener('kiro:save', submit); window.removeEventListener('beforeunload', unload); };
  }, [submit, dirty]);
  if (!vault || editing && !existing) return null;
  const templateIds = new Set(fieldsForType(draft.type).map((field) => field.id));
  const attachment = () => run(async () => {
    const file = await pickFile(false); if (!file) return;
    try { if (file.bytes.length > 8_388_608) throw new VaultError('LIMIT_EXCEEDED'); update('attachments', [...draft.attachments, { id: session.id(), name: file.name, size: file.bytes.length, data: toBase64(file.bytes), mimeType: 'application/octet-stream' }]); }
    finally { wipe(file.bytes); }
  });
  return <AppShell bottomNav={false}><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><View style={styles.form}>
    <PageHeader title={editing ? 'Edit item' : `New ${TYPE_LABELS[draft.type].toLowerCase()}`} detail={vault.name} onBack={() => dirty ? setDiscard(true) : back()} right={<Button title="Save item" icon={Check} loading={pending} disabled={iconLoading} onPress={submit} />} />
    <View style={styles.identity}><ItemIconPicker item={draft} website={draft.fields.find((field) => field.id === 'website' && !isSecret(field))?.value} onBusyChange={setIconLoading} onChange={(metadata) => update('metadata', metadata)} /><View style={{ flex: 1 }}><Input label="Item name" value={draft.title} onChangeText={(value) => update('title', value)} placeholder={draft.type === 'login' ? 'e.g. My email account' : 'Give it a name'} autoCapitalize="sentences" autoFocus={!editing} error={submitted && !draft.title.trim() ? 'Give this item a name.' : undefined} /></View></View>
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}><View style={{ flex: 1 }}><Select label="Folder" value={draft.folderId ?? ''} onChange={(value) => update('folderId', value || null)} options={[{ label: 'No folder', value: '' }, ...vault.folders.map((folder) => ({ label: folderPath(vault, folder.id), value: folder.id }))]} /></View><IconButton icon={FolderPlus} label="Create folder" onPress={() => setNewFolder(true)} /></View>
    <Divider />
    <View style={{ gap: 20 }}><Eyebrow>{draft.type === 'login' ? 'LOGIN DETAILS' : 'ITEM DETAILS'}</Eyebrow>
      {draft.type === 'env' && <Input label={t('Nội dung .env')} value={draft.fields.find((field) => field.id === ENV_FIELD_ID)?.value ?? ''}
        onChangeText={(value) => fieldValue(ENV_FIELD_ID, value)} multiline maxLength={4_194_304} autoCorrect={false} spellCheck={false} autoCapitalize="none" textAlignVertical="top"
        style={{ minHeight: 320, fontFamily: 'JetBrainsMono_400Regular' }} placeholder={t('Dán nội dung file .env…')} hint={t('Giữ nguyên nội dung, comment và dòng trống. Các giá trị được mã hoá cùng kho.')} />}
      {draft.fields.filter((field) => !(draft.type === 'env' && field.id === ENV_FIELD_ID)).map((field) => <View key={field.id} style={{ gap: 5 }}><Input label={field.label} value={field.value} onChangeText={(value) => fieldValue(field.id, value)} secret={isSecret(field)} multiline={['private-key', 'public-key', 'connection'].includes(field.id) && !isSecret(field)} keyboardType={field.kind === 'number' ? 'numbers-and-punctuation' : field.kind === 'email' ? 'email-address' : 'default'}
        placeholder={isOtpField(field) && !isKeePassOtpSecret(field.label) ? t('Khóa Base32 hoặc otpauth://totp/…') : field.kind === 'url' ? 'https://' : undefined}
        error={submitted && otpErrors.has(field.id) ? t('Thiết lập TOTP không hợp lệ hoặc chưa được hỗ trợ.') : undefined}
        hint={isOtpField(field) && !isKeePassOtpSecret(field.label) ? t('Dán khóa bí mật Base32 hoặc liên kết otpauth://totp/… từ dịch vụ.') : undefined} />
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>{isSecret(field) && !isOtpField(field) && <Button title="Generate" variant="ghost" icon={WandSparkles} small onPress={() => setGeneratorField(field.id)} />}{!templateIds.has(field.id) && <IconButton icon={Trash2} label={`Remove ${field.label}`} onPress={() => confirmRemoval({ title: t('Xoá trường này?'), description: t('Trường “{name}” và giá trị của trường sẽ bị bỏ khỏi bản chỉnh sửa. Thay đổi chỉ được áp dụng khi bạn lưu mục.', { name: field.label || t('Chưa đặt tên') }), confirmLabel: t('Xoá trường'), onConfirm: () => update('fields', draft.fields.filter((entry) => entry.id !== field.id)) })} />}</View>
      </View>)}
      <Input label={draft.type === 'secure-note' ? 'Secure note' : 'Notes'} value={draft.notes} onChangeText={(value) => update('notes', value)} multiline placeholder="Anything else worth keeping…" style={{ minHeight: draft.type === 'secure-note' ? 230 : 125 }} />
    </View>
    <View style={{ marginTop: 18, alignSelf: 'flex-start' }}><Button title="Add custom field" icon={Plus} variant="secondary" onPress={() => setNewField(true)} /></View>
    <Divider /><Input label="Tags" value={draft.tags.join(', ')} onChangeText={(value) => update('tags', value.split(',').map((tag) => tag.trim()).filter(Boolean))} placeholder="work, personal, important" hint="Separate tags with commas." />
    <ToggleRow title="Add to Favorites" detail="Keep this item within easy reach." value={draft.favorite} onChange={(value) => update('favorite', value)} />
    <Divider /><View style={{ gap: 10 }}><Eyebrow>Attachments</Eyebrow>{draft.attachments.map((file) => <View key={file.id} style={styles.attachment}><Paperclip size={15} color={colors.secondary} /><T style={{ flex: 1, fontSize: 12 }} numberOfLines={1}>{file.name}</T><IconButton icon={X} label={`Remove attachment ${file.name}`} onPress={() => confirmRemoval({ title: t('Gỡ tệp đính kèm?'), description: t('Tệp “{name}” sẽ bị gỡ khỏi bản chỉnh sửa. File gốc trên thiết bị vẫn được giữ nguyên. Thay đổi chỉ được áp dụng khi bạn lưu mục.', { name: file.name }), confirmLabel: t('Gỡ tệp'), onConfirm: () => update('attachments', draft.attachments.filter((entry) => entry.id !== file.id)) })} /></View>)}<Button title="Attach a file" icon={Paperclip} variant="secondary" onPress={attachment} /><T muted style={{ fontSize: 11 }}>Up to 8 MB per new attachment. Encrypted inside your vault.</T></View>
    <Divider /><View style={styles.formFooter}><View style={{ flexDirection: 'row', gap: 7, alignItems: 'center', flex: 1 }}><ShieldCheck size={14} color={colors.secondary} /><T muted style={{ fontSize: 11 }}>{iconLoading ? t('Đang tải icon…') : 'Save before locking or leaving the app.'}</T></View><Button title="Cancel" variant="ghost" onPress={() => dirty ? setDiscard(true) : back()} /><Button title="Save item" icon={Check} loading={pending} disabled={iconLoading} onPress={submit} /></View>
  </View></ScrollView>
    <Dialog open={generatorField !== null} title="Password generator" onClose={() => setGeneratorField(null)}><GeneratorPanel onUse={(value) => { if (generatorField) fieldValue(generatorField, value); setGeneratorField(null); }} /></Dialog>
    <Dialog open={newField} title="Add a custom field" onClose={() => setNewField(false)} footer={<Button title="Add field" icon={Plus} disabled={!fieldName.trim()} onPress={() => { update('fields', [...draft.fields, { id: session.id(), label: fieldName.trim(), value: '', kind: fieldKind, protected: fieldKind === 'secret' || fieldKind === 'otp' }]); setFieldName(''); setNewField(false); }} />}><Input label="Field name" value={fieldName} onChangeText={setFieldName} autoFocus /><Select label="Field type" value={fieldKind} onChange={(value) => setFieldKind(value as FieldKind)} options={FIELD_KINDS.map((kind) => ({ value: kind, label: kind === 'otp' ? 'OTP' : kind[0].toUpperCase() + kind.slice(1) }))} /></Dialog>
    <CreateFolderDialog open={newFolder} onClose={() => setNewFolder(false)} />
    <Dialog open={discard} title="Discard unsaved changes?" description="Your saved item will stay as it was." onClose={() => setDiscard(false)} footer={<><Button title="Keep editing" variant="secondary" onPress={() => setDiscard(false)} /><Button title="Discard changes" variant="danger" onPress={back} /></>} />
    <Dialog open={conflict} title="This vault changed on disk" description="Your draft is still here. Reload the saved file, or export your current vault as a separate file before reopening. Kiro will not merge files automatically." onClose={() => setConflict(false)} footer={<Button title="Keep editing" onPress={() => setConflict(false)} />} />
    {confirmationDialog}
  </AppShell>;
}
const styles = StyleSheet.create({ page: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 50, alignItems: 'center' }, form: { width: '100%', maxWidth: 660 }, identity: { flexDirection: 'row', gap: 18, alignItems: 'center', marginTop: 15, marginBottom: 25 }, attachment: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 8 }, formFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' } });
