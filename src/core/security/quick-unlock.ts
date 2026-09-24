export type QuickUnlockMethod = 'passkey' | 'faceId' | 'touchId' | 'biometric';
export interface QuickUnlockSupport {
  method: QuickUnlockMethod;
  available: boolean;
  reason?: 'unsupported' | 'not-enrolled' | 'insecure';
}
export interface QuickUnlockOptions {
  name?: string;
  prompt?: string;
  signal?: AbortSignal;
}
export interface QuickUnlockPort {
  support?(): Promise<QuickUnlockSupport>;
  available(): Promise<boolean>;
  enrolled(id: string): Promise<boolean>;
  enroll(id: string, binding: string, key: Uint8Array, options?: QuickUnlockOptions): Promise<void>;
  recover(id: string, binding: string, options?: QuickUnlockOptions): Promise<Uint8Array | null>;
  revoke(id: string): Promise<void>;
}
