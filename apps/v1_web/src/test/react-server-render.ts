import { createRequire } from 'node:module';

type RenderDispatcher = { getCacheForType: <T>(create: () => T) => T };
type ReactServerBuild = typeof import('react') & {
  __SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { A: RenderDispatcher | null };
};

// Next evaluates server components against React's `react-server` build, where `cache()` memoizes for
// the duration of one render. The default build (what jsdom resolves) makes `cache()` a passthrough.
export function loadReactServerBuild(): ReactServerBuild {
  const require = createRequire(import.meta.url);
  return require(require.resolve('react/package.json').replace('package.json', 'react.react-server.js'));
}

// Runs `work` as one server render: every `cache()`d function shares a single per-render store.
export async function inServerRender<T>(react: ReactServerBuild, work: () => Promise<T>): Promise<T> {
  const internals = react.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  const stores = new Map<() => unknown, unknown>();
  internals.A = {
    getCacheForType: <S>(create: () => S): S => {
      if (!stores.has(create)) stores.set(create, create());
      return stores.get(create) as S;
    },
  };
  try {
    return await work();
  } finally {
    internals.A = null;
  }
}
