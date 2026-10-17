import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform, View, Text } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import * as Device from 'expo-device';
import { AutoLockPolicy } from '@/core/security/auto-lock';
import { session } from '@/infrastructure/session';
import { clipboard } from '@/infrastructure/clipboard';
import { nativeSecurity } from '@/infrastructure/security/native-module';
import { desktopBridge } from '@/infrastructure/desktop/bridge';
import { fileHandoff } from '@/features/vault/file-handoff';
import { colors } from '@/design-system/tokens';

const ActivityContext = createContext({ visible: true, activity: () => {} });
export const useSession = () => useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
export const useActivity = () => useContext(ActivityContext);

/** Unmount secret views and drafts; never keep them rendered under a cover. */
export function SessionBoundary({ children }: { children: ReactNode }) {
  const { visible } = useActivity();
  const { privacyEpoch } = useSession();
  return <View key={privacyEpoch} style={{ flex: 1 }}>
    {visible ? children : <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.text, fontSize: 20 }}>Kiwi Password</Text></View>}
  </View>;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const snapshot = useSession();
  const [visible, setVisible] = useState(true);
  const initialized = useRef(false);
  const policy = useRef<AutoLockPolicy | null>(null);
  if (policy.current === null) policy.current = new AutoLockPolicy(snapshot.settings, () => { session.lock(); fileHandoff.clear(); void clipboard.clear().catch(() => undefined); });

  useEffect(() => {
    if (!initialized.current) { initialized.current = true; void session.initialize(); }
  }, []);
  useEffect(() => { policy.current?.configure(snapshot.settings); }, [snapshot.settings]);
  useEffect(() => { if (snapshot.status === 'unlocked') policy.current?.reset(); }, [snapshot.status]);
  useEffect(() => {
    let lifecycle = 0;
    const background = () => {
      lifecycle++;
      // Desktop drafts stay mounted during the configured grace period. An
      // actual lock still wipes the session and remounts its privacy boundary.
      if (Platform.OS !== 'web') { setVisible(false); fileHandoff.clear(); }
      policy.current?.background();
    };
    const foreground = () => { policy.current?.foreground(); setVisible(true); void clipboard.resume().catch(() => undefined); };
    const tick = setInterval(() => { if (session.getSnapshot().status === 'unlocked') policy.current?.tick(); }, 1000);
    if (Platform.OS === 'web') {
      const desktop = desktopBridge();
      const change = () => {
        if (document.visibilityState === 'hidden' || !document.hasFocus()) background();
        else { lifecycle++; foreground(); }
      };
      const activity = () => policy.current?.activity();
      // The native host provides one authoritative focus stream, including native
      // file dialogs. Mixing it with DOM visibility events cancels deadlines.
      if (!desktop) {
        document.addEventListener('visibilitychange', change);
        window.addEventListener('blur', change);
        window.addEventListener('focus', change);
      }
      document.addEventListener('keydown', activity);
      document.addEventListener('pointerdown', activity);
      document.addEventListener('pointermove', activity, { passive: true });
      document.addEventListener('wheel', activity, { passive: true });
      const unsubscribe = desktop?.onSecurityEvent((event) => {
        if (event === 'deviceLocked' || event === 'lock') { lifecycle++; policy.current?.deviceLocked(); if (event === 'deviceLocked') setVisible(false); }
        else if (event === 'background') background();
        else {
          const revision = ++lifecycle;
          void desktop.isDeviceLocked().then((locked) => {
            if (revision !== lifecycle) return;
            if (locked) { policy.current?.deviceLocked(); setVisible(false); }
            else foreground();
          }).catch(() => { if (revision === lifecycle) { policy.current?.deviceLocked(); foreground(); } });
        }
      });
      return () => {
        lifecycle++; clearInterval(tick); unsubscribe?.();
        document.removeEventListener('visibilitychange', change); window.removeEventListener('blur', change); window.removeEventListener('focus', change);
        document.removeEventListener('keydown', activity); document.removeEventListener('pointerdown', activity);
        document.removeEventListener('pointermove', activity); document.removeEventListener('wheel', activity);
      };
    }
    // Allow visual automation only in an opted-in simulator development build.
    const simulatorUiTest = __DEV__ && process.env.EXPO_PUBLIC_NATIVE_UI_TESTS === '1' && !Device.isDevice;
    if (!simulatorUiTest) void ScreenCapture.preventScreenCaptureAsync('vault').catch(() => undefined);
    if (Platform.OS === 'ios') void ScreenCapture.enableAppSwitcherProtectionAsync(1).catch(() => undefined);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') background();
      else if (state === 'active') {
        void nativeSecurity?.isDeviceLocked().then((locked) => { if (locked) policy.current?.deviceLocked(); }).catch(() => undefined);
        foreground();
      }
    });
    const lock = nativeSecurity?.addListener('deviceLocked', () => policy.current?.deviceLocked());
    return () => { clearInterval(tick); subscription.remove(); lock?.remove(); };
  }, []);
  return <ActivityContext.Provider value={{ visible, activity: () => policy.current?.activity() }}>{children}</ActivityContext.Provider>;
}
