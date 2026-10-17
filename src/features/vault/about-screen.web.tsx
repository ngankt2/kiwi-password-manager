import { DesktopWorkspace } from '@/features/desktop/workspace';
import { DesktopAbout } from '@/features/desktop/about';

export function AboutScreen() {
  return <DesktopWorkspace fullWidth><DesktopAbout /></DesktopWorkspace>;
}
