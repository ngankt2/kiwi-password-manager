import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ChevronRight, FileKey2, Fingerprint, FolderOpen, HardDrive, KeyRound, Plus, ShieldCheck } from 'lucide-react-native';
import { BrandSymbol } from '@/design-system/components/brand-symbol';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Button, Dialog, Divider, Eyebrow, IconButton, Input, Logo, StatusPill, T } from '@/design-system/components/ui';
import { colors } from '@/design-system/tokens';
import { useSession } from '@/shared/hooks/use-session';
import { useLayout } from '@/shared/hooks/use-layout';
import { useAction } from '@/shared/hooks/use-action';
import { useI18n } from '@/shared/hooks/use-i18n';
import { useQuickUnlock } from '@/shared/hooks/use-quick-unlock';
import { usePasswordInput } from '@/shared/hooks/use-password-input';
import { quickUnlockCopy } from '@/shared/i18n/quick-unlock';
import { session } from '@/infrastructure/session';
import { pickFile, type PickedFile } from '@/infrastructure/filesystem/transfer';
import { fileHandoff } from './file-handoff';
import { UnlockPasswordInput } from './unlock-password-input';

function VaultIllustration() {
  return <View style={{ alignItems: 'center', marginVertical: 24 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={310} height={248} viewBox="0 0 310 248">
      <Rect x={40} y={17} width={230} height={206} rx={34} fill="#1C1C1E" stroke="#2C2C2E" />
      <Rect x={63} y={40} width={184} height={160} rx={23} fill="#1F2229" stroke="#2F3542" />
      <Rect x={84} y={59} width={142} height={122} rx={17} fill="#1A2638" stroke="#2D4466" />
      <Circle cx={155} cy={119} r={30} fill="#0B2A4F" stroke="#0A84FF" />
      <Path d="M155 99c-7 0-12 5-12 12 0 5 3 9 7 11v14h10v-14c4-2 7-6 7-11 0-7-5-12-12-12Z" fill="#0A84FF" />
      <Path d="M76 90v60M234 90v60" stroke="#3A3A3C" strokeWidth={4} strokeLinecap="round" />
      <Circle cx={108} cy={82} r={2} fill="#48484A" /><Circle cx={202} cy={82} r={2} fill="#48484A" />
      <Circle cx={108} cy={159} r={2} fill="#48484A" /><Circle cx={202} cy={159} r={2} fill="#48484A" />
      <Path d="M36 236h238" stroke="#2C2C2E" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  </View>;
}

export function WelcomeScreen({ mode = 'welcome' }: { mode?: 'welcome' | 'create' | 'unlock' }) {
  const { t } = useI18n();
  const { mobile } = useLayout(); const state = useSession(); const { id } = useLocalSearchParams<{ id?: string }>();
  const { run, pending } = useAction();
  const [file] = useState<PickedFile | null>(() => mode === 'unlock' ? fileHandoff.take() : null);
  const [name, setName] = useState('Personal'); const [confirm, setConfirm] = useState('');
  const [help, setHelp] = useState(false);
  const recent = state.recents.find((vault) => vault.id === id) ?? (mode === 'unlock' ? state.current : null);
  const selectedId = id ?? recent?.id;
  const passwordView = usePasswordInput(`${mode}:${file?.name ?? selectedId ?? ''}`);
  const { password, setPassword, hide: hidePassword } = passwordView;
  const quickUnlock = useQuickUnlock(file ? undefined : selectedId);
  const unlockCopy = quickUnlockCopy(t, quickUnlock.support?.method ?? 'biometric');
  const canCreate = name.trim().length > 0 && password.length >= 12 && password === confirm;
  useFocusEffect(useCallback(() => hidePassword, [hidePassword]));
  useEffect(() => () => { file?.bytes.fill(0); }, [file]);

  const open = () => run(async () => {
    const picked = await pickFile(); if (!picked) return;
    fileHandoff.set(picked);
    router.push(picked.name.toLowerCase().endsWith('.kdbx') ? '/import' : '/unlock');
  });
  const submit = () => run(async () => {
    hidePassword();
    const secret = password; setPassword(''); setConfirm('');
    if (mode === 'create') await session.create(name, secret);
    else if (file) await session.importVault(file.bytes, file.name, secret);
    else if (selectedId) await session.unlock(selectedId, secret);
    router.replace('/vault');
  });

  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={[styles.page, mobile && styles.mobilePage]} keyboardShouldPersistTaps="handled">
    {!mobile && <View style={styles.story}>
      <Logo />
      <View style={{ flex: 1, justifyContent: 'center', maxWidth: 400 }}>
        <Eyebrow>YOUR DIGITAL LIFE. UNDER LOCK.</Eyebrow>
        <T weight="bold" style={styles.hero}>A little more{ '\n' }peace of mind.</T>
        <T muted style={{ fontSize: 15, lineHeight: 25, maxWidth: 335 }}>One private place for your passwords, keys, and everything worth keeping safe.</T>
        <VaultIllustration />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><HardDrive size={16} color={colors.secondary} /><T muted style={{ fontSize: 12 }}>Stored on your device. Always yours.</T></View>
      </View>
      <T muted style={{ fontSize: 11 }}>Thoughtfully simple. Privately secure.</T>
    </View>}
    <View style={[styles.actionPanel, mobile && { padding: 24, flex: 1, borderLeftWidth: 0 }]}>
      {mobile && <View style={{ marginBottom: 36 }}><Logo /></View>}
      {mode !== 'welcome' && <View style={{ alignSelf: 'flex-start', marginLeft: -12, marginBottom: 20 }}><IconButton icon={ArrowLeft} label="Back to vaults" onPress={() => router.replace({ pathname: '/', params: { chooseVault: '1' } })} /></View>}
      <View style={{ width: '100%', maxWidth: 370, alignSelf: 'center', gap: 22 }}>
        <BrandSymbol size={76} />
        <View style={{ gap: 10 }}><T weight="bold" style={styles.title}>{mode === 'create' ? 'Make room for privacy.' : mode === 'unlock' ? 'Welcome back.' : 'Your secrets. Your space.'}</T>
          <T muted style={{ lineHeight: 23 }}>{mode === 'create' ? 'Create an encrypted file that only your master password can open.' : mode === 'unlock' ? `Unlock ${file?.name ?? recent?.name ?? 'your vault'} to pick up where you left off.` : 'Create a vault or open one you already have. No account needed.'}</T>
        </View>
        {mode === 'welcome' ? <>
          <View style={{ gap: 12 }}><Button title="Create a vault" icon={Plus} onPress={() => router.push('/create-vault')} /><Button title="Open a vault" icon={FolderOpen} variant="secondary" loading={pending} onPress={open} /></View>
          <Pressable accessibilityRole="button" onPress={() => router.push('/import')} style={styles.importLink}><ArrowDownToLine size={15} color={colors.secondary} /><T muted style={{ fontSize: 12 }}>Bring your passwords from KeePass</T><ChevronRight size={14} color={colors.secondary} /></Pressable>
          {state.recents.length > 0 && <View><Divider /><Eyebrow>Recent vaults</Eyebrow><View style={{ marginTop: 12, gap: 4 }}>{state.recents.map((vault) => <Pressable key={vault.id} accessibilityRole="button" accessibilityLabel={`Unlock ${vault.name}`} onPress={() => router.push({ pathname: '/unlock', params: { id: vault.id } })} style={({ pressed }) => [styles.recentRow, pressed && { backgroundColor: colors.fill }]}>
            <FileKey2 size={20} color={colors.secondary} /><View style={{ flex: 1 }}><T weight="medium">{vault.name}</T><T muted style={{ fontSize: 11 }}>Encrypted vault file</T></View><ChevronRight size={15} color={colors.secondary} />
          </Pressable>)}</View></View>}
        </> : <>
          {mode === 'create' && <Input label="Vault name" value={name} onChangeText={setName} placeholder="Personal" autoFocus maxLength={200} autoCapitalize="words" />}
          {mode === 'unlock' ? <UnlockPasswordInput value={passwordView} busy={pending || state.busy} onSubmit={submit} />
            : <Input label="Master password" value={password} onChangeText={setPassword} secret placeholder="At least 12 characters" textContentType="newPassword" />}
          {mode === 'create' && <><Input label="Confirm master password" value={confirm} onChangeText={setConfirm} secret onSubmitEditing={submit} error={confirm && confirm !== password ? 'The passwords don’t match.' : undefined} /><View style={styles.passwordNote}><KeyRound size={16} color={colors.secondary} /><T muted style={{ flex: 1, fontSize: 11, lineHeight: 18 }}>Remember this password. There is no reset, and we cannot recover it for you.</T></View></>}
          <Button title={mode === 'create' ? 'Create vault' : 'Unlock vault'} icon={mode === 'create' ? Plus : ArrowRight} loading={pending || state.busy} disabled={mode === 'create' ? !canCreate : (!password || (!file && !selectedId))} onPress={submit} />
          {mode === 'unlock' && !file && quickUnlock.enabled && quickUnlock.support?.available && selectedId && <Button title={unlockCopy.unlock} icon={Fingerprint} loading={pending || state.busy} variant="secondary" onPress={() => run(async () => { await session.quickUnlock(selectedId, { prompt: unlockCopy.unlock }); router.replace('/vault'); })} />}
          {mode === 'unlock' && <Button title="Forgot your master password?" variant="ghost" onPress={() => { hidePassword(); setHelp(true); }} />}
          {mode === 'unlock' && !file && !selectedId && <Button title="Choose a vault file" variant="secondary" icon={FolderOpen} onPress={open} />}
        </>}
        <View style={{ alignItems: 'center', marginTop: 8 }}><StatusPill text="Local-first · No account · No tracking" /></View>
      </View>
      <View style={styles.footer}><ShieldCheck size={14} color={colors.secondary} /><T muted style={{ fontSize: 10 }}>Your vault stays on this device until you export it.</T></View>
    </View>
  </ScrollView><Dialog open={help} title="Your password is the key" onClose={() => setHelp(false)} description="There is no online account or password reset. Try your original password, biometric unlock if you previously enabled it, or open a backup with its original password." footer={<Button title="Got it" onPress={() => setHelp(false)} />} /></SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, page: { flexGrow: 1, flexDirection: 'row', minHeight: 680 }, mobilePage: { flexDirection: 'column', minHeight: '100%' },
  story: { flex: 1, padding: 48, alignItems: 'flex-start', backgroundColor: colors.surface }, hero: { fontSize: 43, lineHeight: 50, letterSpacing: -1.6, marginTop: 17, marginBottom: 20 },
  actionPanel: { flex: 1, padding: 48, borderLeftWidth: 1, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.background }, title: { fontSize: 29, lineHeight: 36, letterSpacing: -0.9 },
  importLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, recentRow: { minHeight: 68, gap: 13, padding: 10, flexDirection: 'row', alignItems: 'center', borderRadius: 10 },
  passwordNote: { flexDirection: 'row', gap: 10, padding: 13, backgroundColor: colors.surface, borderRadius: 9 }, footer: { flexDirection: 'row', justifyContent: 'center', gap: 7, alignItems: 'center', marginTop: 44 },
});
