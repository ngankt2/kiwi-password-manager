import { router, useLocalSearchParams } from 'expo-router';
import { AppShell } from '@/features/vault/app-shell';
import { VaultScreen } from '@/features/vault/vault-screen';
import { useLayout } from '@/shared/hooks/use-layout';
import { useSession } from '@/shared/hooks/use-session';
import { DetailPanel } from './detail-panel';

export function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { desktop } = useLayout();
  const { vault } = useSession();
  if (desktop) return <VaultScreen detailId={id} />;
  return <AppShell bottomNav={false}>
    <DetailPanel item={vault?.items.find((item) => item.id === id)} onBack={() => router.replace('/vault')} />
  </AppShell>;
}
