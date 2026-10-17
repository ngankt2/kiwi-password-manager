import { Image } from 'expo-image';

export function BrandSymbol({ size = 48 }: { size?: number }) {
  return <Image source={require('@/assets/branding/kiwi-password-symbol.png')} accessibilityLabel="Kiwi Password" accessible
    contentFit="contain" style={{ width: size, height: size, flexShrink: 0 }} />;
}
