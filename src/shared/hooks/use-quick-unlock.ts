import { useCallback, useEffect, useRef, useState } from 'react';
import { safeError } from '@/core/errors';
import type { QuickUnlockSupport } from '@/core/security/quick-unlock';
import { session } from '@/infrastructure/session';

interface QuickUnlockState {
  id?: string;
  support: QuickUnlockSupport | null;
  enabled: boolean;
  checking: boolean;
  error: string | null;
}

export function useQuickUnlock(id?: string) {
  const [state, setState] = useState<QuickUnlockState>({ support: null, enabled: false, checking: true, error: null });
  const requestState = useRef({ revision: 0 });
  const query = useCallback(async (): Promise<QuickUnlockState> => {
    try {
      const [support, enabled] = await Promise.all([
        session.biometrics.support?.() ?? session.biometrics.available().then((available): QuickUnlockSupport => ({ method: 'biometric', available })),
        id ? session.biometrics.enrolled(id) : Promise.resolve(false),
      ]);
      return { id, support, enabled, checking: false, error: null };
    } catch (error) {
      return { id, support: null, enabled: false, checking: false, error: safeError(error, 'QUICK_UNLOCK_UNAVAILABLE').message };
    }
  }, [id]);
  const refresh = useCallback(async () => {
    const request = requestState.current;
    const ticket = ++request.revision;
    const result = await query();
    if (ticket === request.revision) setState(result);
  }, [query]);
  useEffect(() => {
    const request = requestState.current;
    const ticket = ++request.revision;
    void query().then((result) => { if (ticket === request.revision) setState(result); });
    return () => { request.revision++; };
  }, [query]);
  return { ...(state.id === id ? state : { support: null, enabled: false, checking: true, error: null }), refresh };
}
