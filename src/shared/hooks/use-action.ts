import { useCallback, useEffect, useRef, useState } from 'react';
import { VaultError } from '@/core/errors';
import { session } from '@/infrastructure/session';

export function useAction() {
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = useCallback((action: () => Promise<unknown>) => {
    setPending(true);
    void action().catch((error: unknown) => {
      if (error instanceof VaultError && ['CANCELLED', 'LOCKED'].includes(error.code)) return;
      session.report(error);
    }).finally(() => { if (mounted.current) setPending(false); });
  }, []);
  return { pending, run };
}
