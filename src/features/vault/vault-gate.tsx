import { ActivityIndicator, View } from 'react-native';
import { Redirect, Slot } from 'expo-router';
import { colors } from '@/design-system/tokens';
import { useSession } from '@/shared/hooks/use-session';

export function VaultGate() {
  const { status, current, epoch } = useSession();
  if (status === 'loading') return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>;
  if (status !== 'unlocked') return <Redirect href="/" />;
  return <Slot key={`${current?.id}:${epoch}`} />;
}
