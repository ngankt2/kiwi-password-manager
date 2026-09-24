import { Platform } from 'react-native';

export const colors = {
  background: '#121212', surface: '#181818', elevated: '#282828', strong: '#333333',
  primary: '#1DB954', primaryHover: '#1ED760', primaryMuted: '#173523',
  text: '#FFFFFF', secondary: '#A7A7A7', muted: '#797979', border: '#282828',
  warning: '#F59B23', error: '#E22134', dangerMuted: '#371A20',
};
export const fonts = { regular: 'DMSans_400Regular', medium: 'DMSans_500Medium', semibold: 'DMSans_600SemiBold', bold: 'DMSans_700Bold', mono: 'JetBrainsMono_400Regular' };
export const layout = { sidebar: 236, list: 356, tablet: 760, desktop: 1120, touch: 44, radius: 10 };
export const motion = { fast: 140, normal: 200 };
export const monoFallback = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
