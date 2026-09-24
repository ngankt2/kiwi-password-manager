import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class KiroSecurityModule extends NativeModule<{ deviceLocked: () => void }> {
  copy(value: string, seconds: number): Promise<string>;
  clearIfOwned(token: string): Promise<boolean>;
  isDeviceLocked(): Promise<boolean>;
}
export const nativeSecurity = requireOptionalNativeModule<KiroSecurityModule>('KiroSecurity');
