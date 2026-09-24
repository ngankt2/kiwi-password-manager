import { useEffect } from 'react';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono';
import { SessionBoundary, SessionProvider, useSession } from '@/shared/hooks/use-session';
import { Toast } from '@/design-system/components/toast';
import { colors } from '@/design-system/tokens';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);
function Navigation() {
  const { status, settings } = useSession();
  const [fonts, error] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold, JetBrainsMono_400Regular });
  const ready = status !== 'loading' && (fonts || Boolean(error));
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
