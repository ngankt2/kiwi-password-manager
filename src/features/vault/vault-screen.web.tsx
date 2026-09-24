import { DesktopWorkspace } from '@/features/desktop/workspace';

export function VaultScreen({ search = false, detailId }: { search?: boolean; detailId?: string }) {
  return <DesktopWorkspace search={search} detailId={detailId} />;
}
