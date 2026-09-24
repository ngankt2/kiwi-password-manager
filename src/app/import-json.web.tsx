import { DesktopFrame } from '@/features/desktop/frame';
import { JsonImportScreen } from '@/features/data-tools/json-import-screen';

export default function JsonImportRoute() {
  return <DesktopFrame onboard><JsonImportScreen /></DesktopFrame>;
}
