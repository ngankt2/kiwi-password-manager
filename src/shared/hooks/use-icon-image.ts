import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { IconError, validateCachedIcon } from '@/core/icon-image';
import { iconWebsiteOrigin, normalizeIconUrl } from '@/core/icon-url';
import { canFetchAutomaticIcon, getItemIconImage, sameItemIconChoice, withItemIconImage, type ItemIconImage } from '@/domain/entities/item-icon';
import type { ItemSnapshot } from '@/domain/entities/vault';
import { fetchItemIcon } from '@/infrastructure/icons/fetch-icon';
import type { BrandIcon } from '@/shared/brand-icons';

type Status = { busy: boolean; automatic: boolean; error: IconError['code'] | null; origin: string | null };
type Pending = { controller: AbortController; automatic: boolean; origin: string | null };

export function useIconImage({ metadata, website = '', onChange, onBusyChange }: {
  metadata: ItemSnapshot['metadata']; website?: string;
  onChange: (metadata: ItemSnapshot['metadata']) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const origin = iconWebsiteOrigin(website);
  const latest = useRef({ metadata, origin, onChange });
  useLayoutEffect(() => { latest.current = { metadata, origin, onChange }; });
  const active = useRef<Pending | null>(null);
  const scheduled = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<Status>({ busy: false, automatic: false, error: null, origin: null });
  const [automaticSuppressed, setAutomaticSuppressed] = useState(false);
  const eligible = !automaticSuppressed && canFetchAutomaticIcon(metadata);
  const queued = !!(eligible && origin && status.origin !== origin);
  const busy = queued || status.busy && (!status.automatic || eligible && status.origin === origin);
  const cancel = useCallback(() => {
    if (scheduled.current) { clearTimeout(scheduled.current); scheduled.current = null; }
    const pending = active.current; active.current = null; pending?.controller.abort();
    setAutomaticSuppressed(true);
    setStatus({ busy: false, automatic: false, error: null, origin: latest.current.origin });
  }, []);
  useEffect(() => () => {
    if (scheduled.current) clearTimeout(scheduled.current);
    const pending = active.current; active.current = null; pending?.controller.abort();
  }, []);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  const begin = useCallback((url: string, source: 'url' | 'website', automatic = false) => {
    if (!automatic) setAutomaticSuppressed(true);
    if (scheduled.current) { clearTimeout(scheduled.current); scheduled.current = null; }
    const previous = active.current; active.current = null; previous?.controller.abort();
    const pending: Pending = { controller: new AbortController(), automatic, origin: latest.current.origin };
    active.current = pending;
    const before = latest.current;
    setStatus({ busy: true, automatic, error: null, origin: before.origin });
    const { signal } = pending.controller;
    const timeout = setTimeout(() => pending.controller.abort(), 15_000);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const sourceUrl = source === 'website' ? iconWebsiteOrigin(url) : normalizeIconUrl(url).href;
          if (!sourceUrl) throw new IconError('url');
          const data = await fetchItemIcon({ url: sourceUrl, kind: source === 'website' ? 'website' : 'image' }, signal);
          if (signal.aborted || active.current !== pending || !sameItemIconChoice(before.metadata, latest.current.metadata)
            || automatic && (!canFetchAutomaticIcon(latest.current.metadata) || latest.current.origin !== sourceUrl)) return;
          latest.current.onChange(withItemIconImage(latest.current.metadata, { ...data, version: 1, source, sourceUrl }));
        } catch (error) {
          if (active.current === pending && !signal.aborted) setStatus({ busy: false, automatic, error: error instanceof IconError ? error.code : 'network', origin: before.origin });
        } finally {
          clearTimeout(timeout);
          if (active.current === pending) { active.current = null; setStatus((current) => ({ ...current, busy: false })); }
        }
      })();
    }, 0);
    signal.addEventListener('abort', () => {
      clearTimeout(timer); clearTimeout(timeout);
      if (active.current === pending) { active.current = null; setStatus({ busy: false, automatic, error: 'network', origin: before.origin }); }
    }, { once: true });
    return pending;
  }, []);

  useEffect(() => {
    if (!eligible || !origin) return;
    const timer = setTimeout(() => { scheduled.current = null; begin(origin, 'website', true); }, 800);
    scheduled.current = timer;
    return () => {
      clearTimeout(timer);
      if (scheduled.current === timer) scheduled.current = null;
      const pending = active.current;
      if (pending?.automatic && pending.origin === origin) { active.current = null; pending.controller.abort(); }
    };
  }, [begin, eligible, origin]);

  const chooseBrand = (brand: BrandIcon) => {
    cancel();
    const image: ItemIconImage = { ...validateCachedIcon(brand.dataUri), version: 1, source: 'brand', sourceUrl: brand.source, brand: brand.id, background: brand.background };
    onChange(withItemIconImage(metadata, image));
  };
  return { ...status, busy, automatic: queued || status.automatic, origin, image: getItemIconImage(metadata), cancel, chooseBrand,
    loadUrl: (url: string) => { begin(url, 'url'); },
    loadWebsite: () => { if (origin) begin(origin, 'website'); },
  };
}
