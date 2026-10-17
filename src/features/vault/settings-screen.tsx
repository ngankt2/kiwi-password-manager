import { useState } from 'react';
import { version as appVersion } from '../../../package.json';
import { vaultFileName } from '@/core/vault-format/file-names';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Download, Info, LockKeyhole, ShieldCheck } from 'lucide-react-native';
import { Button, Divider, Eyebrow, PageHeader, Select, T, ToggleRow } from '@/design-system/components/ui';
import { ReauthDialog } from '@/design-system/components/reauth-dialog';
import { weakensSecurity, type Settings } from '@/core/security/settings';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { useI18n } from '@/shared/hooks/use-i18n';
import { session } from '@/infrastructure/session';
import { exportFile } from '@/infrastructure/filesystem/transfer';
import { AppShell, lockVault } from './app-shell';
import { QuickUnlockSettings } from './quick-unlock-settings';

export function SettingsScreen() {
  const { t } = useI18n();
  const { settings, vault } = useSession();
  const { run, pending } = useAction();
  const [auth, setAuth] = useState<((password: string) => Promise<void>) | null>(null);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    if (weakensSecurity(settings, next)) setAuth(() => async (password: string) => { await session.updateSettings(next, password); });
    else run(() => session.updateSettings(next));
  };

  return <AppShell>
    <ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 24, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 660 }}>
        <PageHeader title="Settings" detail="A vault that works your way." onBack={() => router.replace('/vault')} />
        <QuickUnlockSettings />
        <Eyebrow>Security</Eyebrow>
        <View style={{ gap: 18, marginTop: 20 }}>
          <Select label="Lock after inactivity" value={String(settings.autoLockSeconds)} onChange={(value) => update({ autoLockSeconds: Number(value) as Settings['autoLockSeconds'] })} options={[
            { label: '1 minute', value: '60' }, { label: '3 minutes', value: '180' }, { label: '5 minutes', value: '300' }, { label: '15 minutes', value: '900' }, { label: '30 minutes', value: '1800' }, { label: 'Never', value: '-1' },
          ]} />
          <Select label="Lock after leaving the app" value={String(settings.backgroundLockSeconds)} onChange={(value) => update({ backgroundLockSeconds: Number(value) as Settings['backgroundLockSeconds'] })} options={[
            { label: 'Immediately', value: '0' }, { label: '1 minute', value: '60' }, { label: '3 minutes', value: '180' }, { label: '5 minutes', value: '300' }, { label: '15 minutes', value: '900' }, { label: '30 minutes', value: '1800' }, { label: 'Never', value: '-1' },
          ]} />
          <ToggleRow title="Authenticate before revealing secrets" detail="Ask for your master password before showing or copying a secret." value={settings.requireAuthenticationToReveal} onChange={(value) => update({ requireAuthenticationToReveal: value })} />
          <Select label="Clear clipboard after" value={String(settings.clipboardSeconds)} onChange={(value) => update({ clipboardSeconds: Number(value) as Settings['clipboardSeconds'] })} options={[
            { label: '10 seconds', value: '10' }, { label: '30 seconds', value: '30' }, { label: '1 minute', value: '60' }, { label: 'Do not clear', value: '0' },
          ]} />
          <T muted style={{ fontSize: 12, lineHeight: 20 }}>Copied secrets are cleared after the selected time, unless the clipboard has changed.</T>
        </View>
        <Divider /><Eyebrow>Your vault</Eyebrow>
        <View style={{ gap: 16, marginTop: 20 }}>
          <T weight="semibold">{vaultFileName(vault?.name ?? 'Vault')}</T>
          <T muted style={{ lineHeight: 22 }}>Your vault is stored on this device. Export an encrypted copy to keep a backup in a location you choose.</T>
          <Button title="Export encrypted vault" icon={Download} variant="secondary" loading={pending} onPress={() => run(async () => {
            const file = await session.encryptedExport();
            await exportFile(file.name, file.bytes);
          })} />
          <ToggleRow title="Automatic local backups" detail="Keep earlier encrypted versions when saving changes." value={settings.automaticBackups} onChange={(value) => update({ automaticBackups: value })} />
        </View>
        <Divider /><Eyebrow>Appearance</Eyebrow>
        <ToggleRow title="Compact item rows" detail="Fit more items in your list." value={settings.compactRows} onChange={(value) => update({ compactRows: value })} />
        <ToggleRow title="Reduce motion" detail="Use simpler transitions." value={settings.reduceMotion} onChange={(value) => update({ reduceMotion: value })} />
        <Divider /><Button title="Lock vault" icon={LockKeyhole} variant="secondary" onPress={lockVault} />
        <Button title={t('Giới thiệu')} icon={Info} variant="secondary" style={{ marginTop: 12 }} onPress={() => router.push('/about')} />
        <Button title={t('Chính sách quyền riêng tư')} icon={ShieldCheck} variant="secondary" style={{ marginTop: 12 }} onPress={() => router.push('/privacy')} />
        <T muted style={{ fontSize: 12, textAlign: 'center', marginTop: 24 }}>{t('Phiên bản ứng dụng {version}', { version: appVersion })}</T>
      </View>
    </ScrollView>
    <ReauthDialog action={auth} onClose={() => setAuth(null)} />
  </AppShell>;
}
