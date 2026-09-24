import { Image } from 'expo-image';

export function BrandSymbol({ size = 48 }: { size?: number }) {
  return <Image source={require('@/assets/branding/appkiro-symbol.png')} accessibilityLabel="Kiro Password Manager" accessible
    contentFit="contain" style={{ width: size, height: size, flexShrink: 0 }} />;
}
