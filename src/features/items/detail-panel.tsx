import { useConfirmation } from '@/shared/hooks/use-confirmation';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import { Archive, ArrowLeft, ArrowUpRight, Check, ChevronRight, Copy, Eye, EyeOff, FolderInput, History, MoreHorizontal, Paperclip, Pencil, RotateCcw, Star, Trash2 } from 'lucide-react-native';
import { Button, Chip, Dialog, EmptyState, Eyebrow, IconButton, Select, T } from '@/design-system/components/ui';
import { ReauthDialog } from '@/design-system/components/reauth-dialog';
import { colors } from '@/design-system/tokens';
import { isSecret, type CustomField, type VaultItem } from '@/domain/entities/vault';
import { fieldsForType, TYPE_LABELS } from '@/domain/entities/templates';
import { saveItem, updateItems } from '@/domain/services/items';
import { folderPath } from '@/domain/services/search';
import { isOtpField } from '@/domain/entities/otp';
import { generateFieldOtp } from '@/domain/services/otp';
import { VaultError } from '@/core/errors';
import { fromBase64, wipe } from '@/core/bytes';
import { useAction } from '@/shared/hooks/use-action';
import { useSession } from '@/shared/hooks/use-session';
import { useSecretReveal } from '@/shared/hooks/use-secret-reveal';
import { session } from '@/infrastructure/session';
import { clipboard } from '@/infrastructure/clipboard';
import { exportFile } from '@/infrastructure/filesystem/transfer';
import { ItemIcon } from './item-icon';
import { envContent, ENV_FIELD_ID } from '@/domain/entities/env';
import { EnvPanel } from './env-panel';

export function CredentialField({ field, fields, authorize, literal = false }: { field: CustomField; fields: CustomField[]; authorize: (action: () => Promise<void>) => void; literal?: boolean }) {
  const { t } = useI18n();
  const isOtp = !literal && isOtpField(field);
  const secret = isSecret(field); const [revealed, setRevealed] = useState(false); const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now()); const { settings } = useSession(); const { run } = useAction();
  useEffect(() => { if (!revealed) return; const timer = setTimeout(() => setRevealed(false), 15_000); return () => clearTimeout(timer); }, [revealed]);
  useEffect(() => { if (!isOtp) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [isOtp]);
  useEffect(() => { if (!copied) return; const timer = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(timer); }, [copied]);
  let value = field.value; let remaining: number | null = null; let otpError = false;
  if (isOtp && value) { try { const otp = generateFieldOtp(field, fields, now); value = otp.code; remaining = otp.remaining; } catch { otpError = true; } }
  if (!field.value && !literal) return null;
  const copy = async () => {
    if (otpError) throw new VaultError('VALIDATION');
    const current = isOtp ? generateFieldOtp(field, fields).code : field.value;
    const result = await clipboard.copy(current, settings.clipboardSeconds); setCopied(true);
    session.notify(result.autoClears ? `Copied. Clears in ${settings.clipboardSeconds} seconds.` : settings.clipboardSeconds === 0 ? 'Copied to clipboard.' : 'Copied. This platform cannot safely auto-clear the clipboard.');
  };
  const reveal = async () => { setNow(Date.now()); setRevealed(!revealed); };
  const openWebsite = () => run(async () => {
    const url = new URL(field.value.includes('://') ? field.value : `https://${field.value}`);
    if (!['https:', 'http:'].includes(url.protocol)) throw new VaultError('VALIDATION');
    await Linking.openURL(url.toString());
  });
  return <View style={styles.field}><View style={{ flex: 1, gap: 2, minWidth: 0 }}><T muted style={{ fontSize: 13 }}>{field.label}</T>
    <T mono={secret || field.kind === 'number'} selectable={!secret || revealed} accessibilityLabel={secret && !revealed && !otpError ? `${field.label}, hidden` : undefined}
      accessibilityElementsHidden={secret && !revealed && !otpError} importantForAccessibility={secret && !revealed && !otpError ? 'no-hide-descendants' : 'auto'}
      style={{ fontSize: 17, lineHeight: 22, letterSpacing: secret && !revealed ? 2 : 0, color: otpError ? colors.warning : colors.text }} numberOfLines={revealed ? undefined : 2}>
      {otpError ? t('Chưa tạo được mã TOTP') : secret && !revealed ? '••••••••••••••' : value || t('(trống)')}
    </T>{otpError && <T style={{ fontSize: 13, color: colors.warning }}>{t('Chọn Sửa để kiểm tra khóa bí mật và thiết lập TOTP.')}</T>}
    {remaining !== null && <T muted style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{t('Làm mới sau {count} giây', { count: remaining })}</T>}
  </View><View style={{ flexDirection: 'row', alignItems: 'center' }}>
    {secret && !otpError && <IconButton icon={revealed ? EyeOff : Eye} label={revealed ? `Hide ${field.label}` : `Reveal ${field.label}`} active={revealed} onPress={() => settings.requireAuthenticationToReveal && !revealed ? authorize(reveal) : run(reveal)} />}
    {field.kind === 'url' && !secret && <IconButton icon={ArrowUpRight} label={`Open ${field.label}`} onPress={openWebsite} />}
    <IconButton icon={copied ? Check : Copy} label={`Copy ${field.label}`} active={copied} disabled={otpError} onPress={() => secret && settings.requireAuthenticationToReveal ? authorize(copy) : run(copy)} />
  </View></View>;
}

export function NoteSection({ notes, authorize }: { notes: string; authorize: (action: () => Promise<void>) => void }) {
  const { t } = useI18n();
  const { settings } = useSession();
  const { run } = useAction();
  const { revealed, reveal, hide } = useSecretReveal(notes);
  const perform = (action: () => Promise<void>) => settings.requireAuthenticationToReveal ? authorize(action) : run(action);
  return <View style={styles.section}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
      <View style={{ flex: 1 }}><Eyebrow>{t('Ghi chú')}</Eyebrow></View>
      {!!notes && <>
        <Button small variant="ghost" icon={revealed ? EyeOff : Eye} title={t(revealed ? 'Ẩn {name}' : 'Hiện {name}', { name: t('Ghi chú') })} onPress={() => revealed ? hide() : perform(async () => reveal())} />
        <IconButton icon={Copy} label={t('Sao chép {name}', { name: t('Ghi chú') })} onPress={() => perform(async () => {
          const result = await clipboard.copy(notes, settings.clipboardSeconds);
          session.notify(result.autoClears ? t('Đã sao chép. Tự xoá sau {count} giây.', { count: settings.clipboardSeconds }) : t('Đã sao chép vào clipboard.'));
        })} />
      </>}
    </View>
    <View style={{ padding: 16, backgroundColor: colors.surface, borderRadius: 12 }}>
      <T selectable={revealed} mono={!!notes && !revealed} muted={!!notes && !revealed} accessibilityLabel={notes && !revealed ? t('{name}, đang ẩn', { name: t('Ghi chú') }) : undefined} style={{ fontSize: 17, lineHeight: 23 }}>
        {!notes ? t('Chưa có ghi chú.') : revealed ? notes : '••••••••••••'}
      </T>
    </View>
  </View>;
}

export function DetailPanel({ item, onBack }: { item?: VaultItem; onBack?: () => void }) {
  const { t } = useI18n();
  const { confirm: confirmRemoval, confirmationDialog } = useConfirmation();
  const { vault } = useSession(); const { run } = useAction(); const [menu, setMenu] = useState(false); const [moving, setMoving] = useState(false); const [folder, setFolder] = useState(''); const [deleting, setDeleting] = useState(false);
  const [auth, setAuth] = useState<((password: string) => Promise<void>) | null>(null);
  if (!item || !vault) return <EmptyState title="A space for your secrets" detail="Choose an item to view its details, or add your first password to get started." />;
  const known = new Set(fieldsForType(item.type).map((field) => field.id));
  const fields = item.fields.filter((field) => known.has(field.id) && !(item.type === 'env' && field.id === ENV_FIELD_ID)); const custom = item.fields.filter((field) => !known.has(field.id));
  const authorize = (action: () => Promise<void>) => setAuth(() => async (password: string) => { await session.reauthenticate(password); await action(); });
  const favorite = () => run(() => session.mutate((vault) => updateItems(vault, [item.id], { favorite: !item.favorite }, () => session.id())));
  const organize = (patch: Partial<Pick<VaultItem, 'archivedAt' | 'deletedAt'>>) => run(async () => { await session.mutate((vault) => updateItems(vault, [item.id], patch, () => session.id())); setMenu(false); });
  const infoDate = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <View style={styles.toolbar}>{onBack && <IconButton icon={ArrowLeft} label="Back to items" onPress={onBack} />}<View style={{ flex: 1 }} /><IconButton icon={Star} label={item.favorite ? 'Remove favorite' : 'Add favorite'} active={item.favorite} onPress={favorite} /><Button title="Edit" icon={Pencil} variant="secondary" small onPress={() => router.push({ pathname: '/item/[id]/edit', params: { id: item.id } })} /><IconButton icon={MoreHorizontal} label="Item actions" onPress={() => setMenu(true)} /></View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {(item.deletedAt || item.archivedAt) && <View style={styles.lifecycleBanner}><T muted style={{ flex: 1, fontSize: 15 }}>{item.deletedAt ? 'This item is in Trash.' : 'This item is archived.'}</T><Button title="Restore" variant="ghost" icon={RotateCcw} onPress={() => organize({ deletedAt: null, archivedAt: null })} /></View>}
      <View style={styles.identity}><ItemIcon type={item.type} metadata={item.metadata} large /><View style={{ flex: 1, gap: 5 }}><T weight="bold" style={styles.title}>{item.title || 'Untitled item'}</T><T muted style={{ fontSize: 15 }}>{folderPath(vault, item.folderId) || TYPE_LABELS[item.type]}</T></View></View>
      {item.type === 'env' && <EnvPanel key={item.id + ':' + item.updatedAt} raw={envContent(item)} renderVariable={(field) => <CredentialField field={field} fields={[]} authorize={authorize} literal />} />}
      {fields.some((field) => field.value) && <View style={styles.section}><Eyebrow>{item.type === 'login' ? 'Credentials' : 'Details'}</Eyebrow><View style={styles.fieldBox}>{fields.map((field) => <CredentialField key={item.id + ':' + field.id} field={field} fields={item.fields} authorize={authorize} />)}</View></View>}
      {(item.notes || item.type === 'secure-note') && <NoteSection key={item.id} notes={item.notes} authorize={authorize} />}
      {custom.length > 0 && <View style={styles.section}><Eyebrow>Custom fields</Eyebrow><View style={styles.fieldBox}>{custom.map((field) => <CredentialField key={item.id + ':' + field.id} field={field} fields={item.fields} authorize={authorize} />)}</View></View>}
      {item.attachments.length > 0 && <View style={styles.section}><Eyebrow>Attachments</Eyebrow>{item.attachments.map((attachment) => <Pressable accessibilityRole="button" accessibilityLabel={`Export attachment ${attachment.name}`} key={attachment.id} style={styles.attachment} onPress={() => authorize(async () => { const bytes = fromBase64(attachment.data); try { await exportFile(attachment.name, bytes, true); } finally { wipe(bytes); } })}>
        <Paperclip size={17} color={colors.primary} /><T style={{ flex: 1, fontSize: 17 }} numberOfLines={1}>{attachment.name}</T><T muted style={{ fontSize: 13 }}>{Math.max(1, Math.round(attachment.size / 1024))} KB</T><ArrowUpRight size={15} color={colors.secondary} />
      </Pressable>)}</View>}
      {item.tags.length > 0 && <View style={styles.section}><Eyebrow>Tags</Eyebrow><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{item.tags.map((tag) => <Chip key={tag} label={tag} onPress={() => router.push({ pathname: '/vault', params: { filter: `tag:${tag}` } })} />)}</View></View>}
      <View style={{ gap: 8 }}><Eyebrow>Information</Eyebrow><View style={{ borderRadius: 12, overflow: 'hidden' }}><View style={styles.information}><T muted style={{ fontSize: 17 }}>Created</T><T style={{ fontSize: 17, fontVariant: ['tabular-nums'] }}>{infoDate(item.createdAt)}</T></View><View style={[styles.information, { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}><T muted style={{ fontSize: 17 }}>Last modified</T><T style={{ fontSize: 17, fontVariant: ['tabular-nums'] }}>{infoDate(item.updatedAt)}</T></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Version history" onPress={() => router.push({ pathname: '/item/[id]/history', params: { id: item.id } })} style={styles.historyLink}><History size={18} color={colors.primary} /><T style={{ flex: 1, fontSize: 17 }}>Version history</T><T muted style={{ fontSize: 17 }}>{item.history.length}</T><ChevronRight size={16} color={colors.muted} /></Pressable>
      </View>
    </ScrollView>
    <Dialog open={menu} title="Item actions" onClose={() => setMenu(false)}>
      <Button title="Move to folder" icon={FolderInput} variant="secondary" onPress={() => { setFolder(item.folderId ?? ''); setMenu(false); setMoving(true); }} />
      <Button title={item.archivedAt ? 'Unarchive item' : 'Archive item'} icon={Archive} variant="secondary" onPress={() => organize({ archivedAt: item.archivedAt ? null : new Date().toISOString() })} />
      <Button title={item.deletedAt ? 'Delete permanently' : 'Move to Trash'} icon={Trash2} variant="danger" onPress={() => item.deletedAt ? (setMenu(false), setDeleting(true)) : (setMenu(false), confirmRemoval({ title: t('Chuyển vào Thùng rác?'), description: t('Chuyển {count} mục vào Thùng rác. Bạn có thể khôi phục các mục này bất cứ lúc nào trước khi xoá vĩnh viễn.', { count: 1 }), confirmLabel: t('Chuyển vào Thùng rác'), onConfirm: () => organize({ deletedAt: new Date().toISOString() }) }))} />
    </Dialog>
    <Dialog open={moving} title="Move to folder" onClose={() => setMoving(false)} footer={<Button title="Move item" icon={FolderInput} onPress={() => run(async () => { await session.mutate((vault) => saveItem(vault, { ...item, folderId: folder || null }, session.id(), undefined, 'Item moved')); setMoving(false); })} />}>
      <Select label="Folder" value={folder} onChange={setFolder} options={[{ label: 'No folder', value: '' }, ...vault.folders.map((folder) => ({ label: folderPath(vault, folder.id), value: folder.id }))]} />
    </Dialog>
    <Dialog open={deleting} title="Delete this item permanently?" description="The item and its history will be removed from this vault. Existing encrypted backups may still contain it." onClose={() => setDeleting(false)} footer={<><Button title="Cancel" variant="ghost" onPress={() => setDeleting(false)} /><Button title="Delete permanently" icon={Trash2} variant="danger" onPress={() => run(async () => { await session.mutate((vault) => ({ ...vault, items: vault.items.filter((entry) => entry.id !== item.id) })); setDeleting(false); onBack?.(); })} /></>} />
    {confirmationDialog}
    <ReauthDialog action={auth} onClose={() => setAuth(null)} />
  </View>;
}
const styles = StyleSheet.create({
  toolbar: { minHeight: 56, paddingHorizontal: 12, gap: 4, flexDirection: 'row', alignItems: 'center' }, content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 56 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 28, marginTop: 4 }, title: { fontSize: 28, lineHeight: 34, letterSpacing: 0.2 }, section: { gap: 8, marginBottom: 26 },
  fieldBox: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.surface }, field: { paddingLeft: 16, paddingRight: 4, paddingVertical: 10, minHeight: 64, gap: 6, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  information: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, minHeight: 44, alignItems: 'center', paddingHorizontal: 16, backgroundColor: colors.surface }, historyLink: { flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10, paddingHorizontal: 16, backgroundColor: colors.surface, borderRadius: 12, marginTop: 14 },
  attachment: { flexDirection: 'row', alignItems: 'center', minHeight: 50, backgroundColor: colors.surface, paddingHorizontal: 16, borderRadius: 12, gap: 10 }, lifecycleBanner: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, backgroundColor: colors.surface, borderRadius: 12, marginBottom: 20 },
});
