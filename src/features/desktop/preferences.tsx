import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ItemFilter } from '@/domain/services/search';
import { useSession } from '@/shared/hooks/use-session';

export type DesktopLayout = 'A' | 'B' | 'C';
type Preferences = {
  layout: DesktopLayout;
  comfortable: boolean;
  sideWidth: number; setSideWidth: (value: number) => void;
  listWidth: number; setListWidth: (value: number) => void;
  filter: ItemFilter; setFilter: (value: ItemFilter) => void;
};
const Context = createContext<Preferences | null>(null);
export function DesktopPreferencesProvider({ children }: { children: ReactNode }) {
  const { settings } = useSession();
  const layout = settings.desktopLayout;
  const comfortable = !settings.compactRows;
  const [sideWidth, setSideWidth] = useState(236);
  const [listWidth, setListWidth] = useState(330);
  const [filter, setFilter] = useState<ItemFilter>('all');
  return <Context.Provider value={{ layout, comfortable, sideWidth, setSideWidth, listWidth, setListWidth, filter, setFilter }}>{children}</Context.Provider>;
}
export function useDesktopPreferences() {
  const context = useContext(Context);
  if (!context) throw new Error('Desktop preferences are unavailable.');
  return context;
}
