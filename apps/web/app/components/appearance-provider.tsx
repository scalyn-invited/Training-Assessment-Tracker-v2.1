'use client';
import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { InitialAppearance } from './appearance-state';
const AppearanceContext = createContext<InitialAppearance | null>(null);
export function AppearanceProvider({
  initial,
  children,
}: {
  initial: InitialAppearance;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [valid, setValid] = useState(true);
  useLayoutEffect(() => {
    if (pathname !== initial.pathname) setValid(false);
    const invalidate = () => setValid(false);
    window.addEventListener('brandingchanged', invalidate);
    return () => window.removeEventListener('brandingchanged', invalidate);
  }, [pathname, initial.pathname]);
  // This snapshot bootstraps one document, not a navigation or preference cache.
  return (
    <AppearanceContext.Provider value={valid && pathname === initial.pathname ? initial : null}>
      {children}
    </AppearanceContext.Provider>
  );
}
export const useInitialAppearance = () => useContext(AppearanceContext);
