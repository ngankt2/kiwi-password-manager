import { useCallback, useState } from 'react';
import { createPasswordMask, movePasswordMask, partialPassword } from '@/core/security/partial-password';
import { cryptoProvider } from '@/infrastructure/crypto/provider';
import { useSecretReveal } from './use-secret-reveal';

type Draft = { scope: string; password: string; mask: number[] | null };
type Visibility = 'hidden' | 'partial' | 'full';

export function usePasswordInput(scope: string) {
  const [draft, setDraft] = useState<Draft>({ scope, password: '', mask: null });
  const [mode, setMode] = useState<Visibility>('hidden');
  const visibility = useSecretReveal(scope);
  const password = draft.scope === scope ? draft.password : '';
  const full = visibility.revealed && mode === 'full' && !!password;
  const partial = visibility.revealed && mode === 'partial' && !!password && draft.mask !== null;
  const hide = useCallback(() => setMode('hidden'), []);

  const setPassword = (value: string) => {
    setMode((current) => current === 'partial' || !value ? 'hidden' : current);
    setDraft((current) => ({
      scope, password: value,
      mask: !value || current.scope !== scope || current.mask === null ? null : movePasswordMask(current.password, value, current.mask),
    }));
  };
  const revealPartial = () => {
    if (!password) return;
    const mask = createPasswordMask(cryptoProvider, password, draft.mask ?? []);
    setDraft({ scope, password, mask });
    setMode('partial');
    visibility.reveal();
  };
  const toggleFull = () => {
    if (full) { hide(); return; }
    if (!password) return;
    setMode('full');
    visibility.reveal();
  };

  return { password, setPassword, full, partial, hide, toggleFull, revealPartial,
    preview: partial ? partialPassword(password, draft.mask!) : '', maskedCount: draft.mask?.length ?? 0 };
}

export type PasswordInputState = ReturnType<typeof usePasswordInput>;
