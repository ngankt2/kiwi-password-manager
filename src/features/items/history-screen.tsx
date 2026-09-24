import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Clock3, RotateCcw } from 'lucide-react-native';
import { Button, Dialog, EmptyState, Eyebrow, PageHeader, T } from '@/design-system/components/ui';
import { ReauthDialog } from '@/design-system/components/reauth-dialog';
import { colors } from '@/design-system/tokens';
import { AppShell } from '@/features/vault/app-shell';
import { CredentialField, NoteSection } from './detail-panel';
import { useSession } from '@/shared/hooks/use-session';
import { useAction } from '@/shared/hooks/use-action';
import { session } from '@/infrastructure/session';
import { restoreVersion } from '@/domain/services/items';
import type { ItemVersion } from '@/domain/entities/vault';

export function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const { vault } = useSession(); const { run, pending } = useAction();
  const [selected, setSelected] = useState<ItemVersion | null>(null); const [auth, setAuth] = useState<((password: string) => Promise<void>) | null>(null);
  const item = vault?.items.find((item) => item.id === id);
  if (!item) return null;
  const back = () => router.canGoBack() ? router.back() : router.replace('/vault');
  return <AppShell bottomNav={false}><ScrollView contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 24, paddingBottom: 40 }}><View style={{ width: '100%', maxWidth: 660 }}>
    <PageHeader title="Version history" detail={item.title} onBack={back} /><T muted style={{ marginBottom: 25 }}>A history of your changes. Restoring a version creates a new version and keeps every later change.</T>
    {!item.history.length ? <EmptyState icon={Clock3} title="The beginning of the story" detail="Previous versions will appear here after you edit this item." /> : [...item.history].reverse().map((version, index) => <Pressable key={version.id} accessibilityRole="button" accessibilityLabel={`View version ${item.history.length - index}`} onPress={() => setSelected(version)} style={({ pressed }) => ({ minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 15, padding: 16, backgroundColor: pressed ? colors.elevated : colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 11, marginBottom: 9 })}>
      <Clock3 size={19} color={colors.secondary} /><View style={{ flex: 1, gap: 4 }}><T weight="medium">{version.summary}</T><T muted style={{ fontSize: 11 }}>{new Date(version.savedAt).toLocaleString()}</T></View><T muted style={{ fontSize: 11 }}>v{item.history.length - index}</T><ChevronRight size={16} color={colors.secondary} />
    </Pressable>)}
  </View></ScrollView><Dialog open={selected !== null} title="Previous version" description={selected ? new Date(selected.savedAt).toLocaleString() : undefined} onClose={() => setSelected(null)} footer={<Button title="Restore this version" icon={RotateCcw} loading={pending} onPress={() => run(async () => { if (!selected) return; await session.mutate((vault) => restoreVersion(vault, item.id, selected.id, session.id())); setSelected(null); session.notify('Version restored. Your newer history is preserved.'); })} />}>
    {selected && <><Eyebrow>{selected.snapshot.title}</Eyebrow>{selected.snapshot.fields.map((field) => <CredentialField key={selected.id + ':' + field.id} field={field} fields={selected.snapshot.fields} authorize={(action) => setAuth(() => async (password: string) => { await session.reauthenticate(password); await action(); })} />)}{selected.snapshot.notes && <NoteSection key={selected.id} notes={selected.snapshot.notes} authorize={(action) => setAuth(() => async (password: string) => { await session.reauthenticate(password); await action(); })} />}</>}
  </Dialog><ReauthDialog action={auth} onClose={() => setAuth(null)} /></AppShell>;
}
