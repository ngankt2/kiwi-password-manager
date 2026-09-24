import { Redirect, useLocalSearchParams } from 'expo-router';
import { selectRecentVault } from '@/domain/services/session';
import { useSession } from '@/shared/hooks/use-session';
import { WelcomeScreen } from './welcome-screen';

export function HomeScreen() {
  const state = useSession();
  const { chooseVault } = useLocalSearchParams<{ chooseVault?: string }>();
  if (state.status === 'loading') return null;
  if (state.status === 'unlocked') return <Redirect href="/vault" />;
  const recent = selectRecentVault(state);
  if (recent && chooseVault !== '1') return <Redirect href={{ pathname: '/unlock', params: { id: recent.id } }} />;
  return <WelcomeScreen />;
}
