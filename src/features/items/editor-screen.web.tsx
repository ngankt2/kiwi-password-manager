import { useLocalSearchParams } from 'expo-router';
import { DesktopWorkspace } from '@/features/desktop/workspace';
import { DesktopEditor } from '@/features/desktop/editor';

export function EditorScreen({ editing = false }: { editing?: boolean }) {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <DesktopWorkspace detailId={id}><DesktopEditor editing={editing} /></DesktopWorkspace>;
}
