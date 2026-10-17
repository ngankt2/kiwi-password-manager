import { DesktopFrame } from '@/features/desktop/frame';
import { DesktopPrivacy } from '@/features/desktop/privacy';

export default function PrivacyRoute() {
  return <DesktopFrame onboard><DesktopPrivacy /></DesktopFrame>;
}
