'use client';

import NextLink from 'next/link';
import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';

type NavigationScope = { allow: (pathname: string) => boolean; reason: string; disabledLabel?: string };
const NavigationScopeContext = createContext<NavigationScope | null>(null);

/** Embedded documents must obey the same boundary as links; React context does not cross an iframe. */
export function useNavigationScope() {
  return useContext(NavigationScopeContext);
}

export function NavigationScopeProvider({ scope, children }: { scope: NavigationScope; children: ReactNode }) {
  return <NavigationScopeContext.Provider value={scope}>{children}</NavigationScopeContext.Provider>;
}

/** Block at render time, so Next cannot prefetch a real page with a sample entity ID. */
export function ScopedLink(props: ComponentProps<typeof NextLink>) {
  const scope = useNavigationScope();
  const href = typeof props.href === 'string' ? props.href : props.href.pathname ?? '';
  if (scope && !scope.allow(href)) {
    return <span role="link" aria-disabled="true" className={props.className} title={scope.reason}
      style={{ ...props.style, color: 'var(--text-muted)' }}
      aria-label={props['aria-label'] ? `${props['aria-label']} · ${scope.reason}` : undefined}>
      {props.children}{scope.disabledLabel && <span aria-hidden="true" className="tm-text-caption text-[var(--text-muted)]"> · {scope.disabledLabel}</span>}<span className="sr-only"> · {scope.reason}</span>
    </span>;
  }
  return <NextLink {...props} />;
}
