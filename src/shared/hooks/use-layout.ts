import { useWindowDimensions } from 'react-native';
import { layout } from '@/design-system/tokens';
export function useLayout() {
  const { width, height } = useWindowDimensions();
  return { width, height, mobile: width < layout.tablet, desktop: width >= layout.desktop, tablet: width >= layout.tablet && width < layout.desktop };
}
