import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, FileKey2, FolderOpen } from 'lucide-react-native';
import { Button, Divider, Eyebrow, Input, Logo, PageHeader, T } from '@/design-system/components/ui';
import { colors } from '@/design-system/tokens';
import { previewKeePass, type KeePassPreview } from '@/core/kdbx/importer';
import { cryptoProvider } from '@/infrastructure/crypto/provider';
import { pickFile, type PickedFile } from '@/infrastructure/filesystem/transfer';
import { session } from '@/infrastructure/session';
import { useAction } from '@/shared/hooks/use-action';
import { fileHandoff } from './file-handoff';

export function ImportScreen() {
  const [file, setFile] = useState<PickedFile | null>(() => fileHandoff.take());
  const [keyFile, setKeyFile] = useState<PickedFile | null>(null);
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [name, setName] = useState('Imported vault');
  const [preview, setPreview] = useState<KeePassPreview | null>(null);
  const { run, pending } = useAction();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => () => { file?.bytes.fill(0); }, [file]);
  useEffect(() => () => { keyFile?.bytes.fill(0); }, [keyFile]);

  const inspect = () => run(async () => {
    if (!file) return;
    const secret = password;
    setPassword('');
    const result = await previewKeePass(cryptoProvider, file.bytes, secret, session.id(), file.name, keyFile?.bytes);
    if (mounted.current) { setPreview(result); setName(result.vault.name || 'Imported vault'); }
  });
  const convert = () => run(async () => {
    if (!preview) return;
    const secret = newPassword;
    setNewPassword(''); setConfirm('');
    await session.create(name, secret, preview.vault);
    if (mounted.current) { setPreview(null); router.replace('/vault'); }
  });

  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center', padding: 24, paddingBottom: 48 }}>
      <View style={{ width: '100%', maxWidth: 600, gap: 18 }}>
        <Logo small />
        <PageHeader title="Bring your passwords home." detail="Import your KeePass database into a new encrypted vault." onBack={() => router.replace({ pathname: '/', params: { chooseVault: '1' } })} />
        {!preview ? <>
          <Eyebrow>Your KeePass file</Eyebrow>
          <Button title={file?.name ?? 'Choose a .kdbx file'} icon={file ? FileKey2 : FolderOpen} variant="secondary" disabled={pending} onPress={() => run(async () => {
            const picked = await pickFile();
            if (picked) setFile(picked);
          })} />
          <Input label="KeePass password" value={password} onChangeText={setPassword} secret onSubmitEditing={inspect} />
          <Button title={keyFile?.name ?? 'Choose key file (optional)'} icon={FolderOpen} variant="ghost" disabled={pending} onPress={() => run(async () => {
            const picked = await pickFile();
            if (picked) setKeyFile(picked);
          })} />
          <Button title="Preview import" icon={ArrowRight} disabled={!file} loading={pending} onPress={inspect} />
        </> : <>
          <Eyebrow>Ready to bring over</Eyebrow>
          <View style={{ padding: 20, gap: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface }}>
            <T weight="semibold">{preview.counts.entries} items · {preview.counts.folders} folders</T>
            <T muted>{preview.counts.attachments} attachments · {preview.counts.history} previous versions</T>
          </View>
          {preview.warnings.map((warning, index) => <T key={index} muted style={{ lineHeight: 22 }}>{warning}</T>)}
          <Divider />
          <Input label="New vault name" value={name} onChangeText={setName} />
          <Input label="New master password" value={newPassword} onChangeText={setNewPassword} secret placeholder="At least 12 characters" />
          <Input label="Confirm master password" value={confirm} onChangeText={setConfirm} secret />
          <Button title="Create imported vault" icon={ArrowRight} loading={pending} disabled={!name.trim() || newPassword.length < 12 || newPassword !== confirm} onPress={convert} />
        </>}
        <T muted style={{ fontSize: 12, lineHeight: 21 }}>Your original KeePass file stays unchanged. Everything is processed on this device.</T>
      </View>
    </ScrollView>
  </SafeAreaView>;
}
