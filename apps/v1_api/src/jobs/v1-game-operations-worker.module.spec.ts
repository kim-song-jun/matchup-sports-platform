/**
 * v1-game-operations-worker.module.spec.ts
 *
 * Regression guard for the Task 12 B1/B2 defects:
 *
 *   B1 — deploy-breaking crash: realtime.gateway.ts runs
 *   `requireProductionFrontendOrigin(process.env.FRONTEND_URL)` at MODULE-LOAD time (top-level
 *   code, not inside a class) when NODE_ENV=production. The worker's alpha container
 *   (deploy/docker-compose.alpha.yml) sets NODE_ENV=production but never sets FRONTEND_URL — so
 *   merely `import`ing that file (transitively, via any module in the worker's graph) crash-loops
 *   the container, even though nothing ever asks Nest to instantiate RealtimeGateway. No other
 *   test boots this module with NODE_ENV=production, so this gap was previously silent.
 *
 *   B2 — scope creep: RealtimeModule imports GamesModule, so if either were reachable from
 *   V1GameOperationsWorkerModule, Nest would register their controllers/gateway on the worker's
 *   internal port — unreviewed HTTP routes and a duplicated, independently-scaled Games
 *   Socket.IO gateway.
 *
 * Both tests below exercise the real `@Module()` metadata / real module file, not mocks — a
 * regression that reintroduces either defect (e.g. some future module re-adding an import that
 * transitively reaches realtime/games) fails one of these.
 */
import 'reflect-metadata';
import { GamesModule } from '../games/games.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { V1GameOperationsWorkerModule } from './v1-game-operations-worker.module';

type ModuleClass = { new (...args: unknown[]): unknown; name: string };

/** Recursively walks `@Module({ imports: [...] })` metadata, resolving DynamicModule entries. */
function collectReachableModules(root: ModuleClass, seen: Set<ModuleClass> = new Set()): Set<ModuleClass> {
  if (seen.has(root)) return seen;
  seen.add(root);
  const imports = (Reflect.getMetadata('imports', root) as unknown[] | undefined) ?? [];
  for (const imported of imports) {
    const moduleClass: unknown =
      typeof imported === 'function' ? imported : (imported as { module?: unknown } | undefined)?.module;
    if (typeof moduleClass === 'function') {
      collectReachableModules(moduleClass as ModuleClass, seen);
    }
  }
  return seen;
}

describe('V1GameOperationsWorkerModule (Task 12 B1/B2 regression guard)', () => {
  it(
    'imports cleanly under NODE_ENV=production with no FRONTEND_URL set — the worker\'s real ' +
      'alpha environment (deploy/docker-compose.alpha.yml sets NODE_ENV=production but never ' +
      'FRONTEND_URL, since the worker has no REST/WS CORS boundary to protect)',
    () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const hadFrontendUrl = Object.prototype.hasOwnProperty.call(process.env, 'FRONTEND_URL');
      const originalFrontendUrl = process.env.FRONTEND_URL;

      process.env.NODE_ENV = 'production';
      delete process.env.FRONTEND_URL;

      try {
        jest.resetModules();
        expect(() => require('./v1-game-operations-worker.module')).not.toThrow();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (hadFrontendUrl) {
          process.env.FRONTEND_URL = originalFrontendUrl;
        } else {
          delete process.env.FRONTEND_URL;
        }
        jest.resetModules();
      }
    },
  );

  it('never reaches RealtimeModule or GamesModule from any transitive import', () => {
    const reachable = collectReachableModules(V1GameOperationsWorkerModule as unknown as ModuleClass);
    expect(reachable.has(RealtimeModule as unknown as ModuleClass)).toBe(false);
    expect(reachable.has(GamesModule as unknown as ModuleClass)).toBe(false);
  });
});
