import { DesktopFrame } from '@/features/desktop/frame';
import { RecoveryScreen } from '@/features/data-tools/recovery-screen';

export default function RecoveryRoute() {
  return <DesktopFrame onboard><RecoveryScreen /></DesktopFrame>;
}
