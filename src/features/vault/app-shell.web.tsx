import type { ReactNode } from 'react';
import type { ItemFilter } from '@/domain/services/search';
import { DesktopWorkspace } from '@/features/desktop/workspace';

export { lockVault, navigateFilter } from '@/features/desktop/actions';
export { FolderDialog as CreateFolderDialog } from '@/features/desktop/folders';

export function AppShell({ children, filter }: { children: ReactNode; filter?: ItemFilter; bottomNav?: boolean }) {
  return <DesktopWorkspace fullWidth filter={filter}>{children}</DesktopWorkspace>;
}
