import { Platform } from 'react-native';

// Apple Human Interface Guidelines dark palette (iOS 26 system colors), matching the KeyNest reference.
export const colors = {
  background: '#000000', surface: '#1C1C1E', elevated: '#2C2C2E', strong: '#3A3A3C',
  primary: '#0A84FF', primaryHover: '#409CFF', primaryMuted: 'rgba(10,132,255,0.18)', onPrimary: '#FFFFFF',
  text: '#FFFFFF', secondary: 'rgba(235,235,245,0.6)', muted: 'rgba(235,235,245,0.38)', border: 'rgba(84,84,88,0.6)',
  warning: '#FF9F0A', error: '#FF453A', errorText: '#FF6961', dangerMuted: 'rgba(255,69,58,0.16)',
  success: '#30D158', favorite: '#FFD60A',
  fill: 'rgba(120,120,128,0.24)', fillHover: 'rgba(120,120,128,0.32)', selected: 'rgba(255,255,255,0.1)',
  overlay: 'rgba(0,0,0,0.5)', chrome: 'rgba(28,28,30,0.94)',
};
// San Francisco is the platform default; omitting a family keeps Dynamic Type and optical sizes.
export const fonts = { regular: undefined, medium: undefined, semibold: undefined, bold: undefined, mono: Platform.select({ ios: 'Menlo', default: 'monospace' }) };
export const weights = { regular: '400', medium: '500', semibold: '600', bold: '700' } as const;
export const layout = { sidebar: 260, list: 340, tablet: 760, desktop: 1120, touch: 44, radius: 12 };
export const motion = { fast: 140, normal: 200 };
export const monoFallback = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
