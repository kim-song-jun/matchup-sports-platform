import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const nextRouterSourcePath = createRequire(import.meta.url).resolve('next/dist/client/components/app-router.js');
const source = readFileSync(nextRouterSourcePath, 'utf8');

function exactBlock(start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Installed Next history block missing: ${start}`);
  return source.slice(from, to);
}

// Execute the installed Next functions unchanged. Only React's scheduling and
// router dispatch boundary are injected; their history decision logic is real.
const copyState = exactBlock('function copyNextJsInternalHistoryState(data) {', '\nfunction Head(');
const applyUrl = exactBlock('const applyUrlFromHistoryPushReplace = (url)=>{', '\n        };') + '\n};';
const replaceState = exactBlock('function replaceState(data, _unused, url) {', '\n        };') + '\n}';

export type NextRestoreAction = { type: string; url: URL; historyState: unknown };

export function installActualNextReplaceBoundary(dispatch: (action: NextRestoreAction) => void) {
  const previous = Object.getOwnPropertyDescriptor(window.history, 'replaceState');
  const originalReplaceState = window.history.replaceState.bind(window.history);
  const build = new Function('window', 'originalReplaceState', '_react', '_useactionqueue', '_routerreducertypes',
    `${copyState}\n${applyUrl}\nreturn ${replaceState};`);
  window.history.replaceState = build(window, originalReplaceState,
    { startTransition: (run: () => void) => run() },
    { dispatchAppRouterAction: dispatch },
    { ACTION_RESTORE: 'restore' });
  return () => {
    if (previous) Object.defineProperty(window.history, 'replaceState', previous);
    else delete (window.history as unknown as { replaceState?: History['replaceState'] }).replaceState;
  };
}
