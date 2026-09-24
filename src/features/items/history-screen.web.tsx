import { useLocalSearchParams } from 'expo-router';
import { DesktopWorkspace } from '@/features/desktop/workspace';
import { DesktopHistory } from '@/features/desktop/history';

export function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <DesktopWorkspace detailId={id}><DesktopHistory key={id} /></DesktopWorkspace>;
}
