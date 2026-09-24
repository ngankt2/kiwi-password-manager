import { useLocalSearchParams } from 'expo-router';
import { DesktopWorkspace } from '@/features/desktop/workspace';

export function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DesktopWorkspace detailId={id} />;
}
