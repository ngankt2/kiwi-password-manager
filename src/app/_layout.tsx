import { useEffect } from 'react';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionBoundary, SessionProvider, useSession } from '@/shared/hooks/use-session';
import { Toast } from '@/design-system/components/toast';
import { colors } from '@/design-system/tokens';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
function Navigation() {
  const { status, settings } = useSession();
  // The app uses the platform system font (San Francisco on iOS), so no font files need loading.
  const ready = status !== 'loading';
  useEffect(() => { if (ready) void SplashScreen.hideAsync(); }, [ready]);
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>;
  return <SessionBoundary><Stack screenOptions={{ headerShown: false, animation: settings.reduceMotion ? 'none' : 'fade', contentStyle: { backgroundColor: colors.background } }}>
    <Stack.Screen name="index" />
    <Stack.Protected guard={status === 'unlocked'}><Stack.Screen name="(vault)" /></Stack.Protected>
  </Stack><Toast /></SessionBoundary>;
}
export default function RootLayout() {
  if (__DEV__ && process.env.EXPO_PUBLIC_NATIVE_TESTS === '1') {
    // The development-only harness is removed from release bundles.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const NativeTests = require('../../tests/native/screen').default;
    return <NativeTests />;
  }
  return <SafeAreaProvider><ThemeProvider value={DarkTheme}><SessionProvider><StatusBar style="light" /><Navigation /></SessionProvider></ThemeProvider></SafeAreaProvider>;
}
