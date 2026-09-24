import { useEffect, useMemo, useState } from 'react';
import { ENV_PAGE_SIZE, parseEnv } from '@/domain/entities/env';
import { useSession } from './use-session';

export function useEnvView(raw: string) {
  const { privacyEpoch } = useSession();
  const parsed = useMemo(() => parseEnv(raw), [raw]);
  const [mode, setMode] = useState<'variables' | 'developer'>('variables');
  const [requestedPage, setPage] = useState(0);
  const [visible, setVisible] = useState<{ raw: string; epoch: number } | null>(null);
  const revealed = visible?.raw === raw && visible.epoch === privacyEpoch;
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setVisible(null), 15_000);
    return () => clearTimeout(timer);
  }, [revealed, visible]);
  const pages = Math.max(1, Math.ceil(parsed.variables.length / ENV_PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  return { ...parsed, mode, page, pages, privacyEpoch, revealed,
    rows: parsed.variables.slice(page * ENV_PAGE_SIZE, (page + 1) * ENV_PAGE_SIZE), setPage,
    changeMode: (next: typeof mode) => { setVisible(null); setMode(next); },
    reveal: () => setVisible({ raw, epoch: privacyEpoch }), hide: () => setVisible(null),
  };
}
