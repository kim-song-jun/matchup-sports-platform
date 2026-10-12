import { trackEvent } from './analytics';

const DESTINATIONS = new Set([
  'matches', 'team-matches', 'teams', 'tournaments', 'league-matches',
  'chat', 'my', 'notices', 'notifications', 'search', 'login', 'signup', 'help',
]);
const DISCOVERY = new Set(['matches', 'team-matches', 'teams', 'tournaments', 'league-matches', 'notices']);

/** Count navigation intent, never application/signup success. No names, IDs or queries. */
export function observeHomeNavigation(): () => void {
  const onClick = (event: MouseEvent) => {
    if (window.location.pathname !== '/home' || event.button !== 0) return;
    const anchor = (event.target as Element | null)?.closest?.('a[href]');
    if (!(anchor instanceof HTMLAnchorElement) || anchor.origin !== window.location.origin) return;
    const [destination, detail] = anchor.pathname.split('/').filter(Boolean);
    if (!DESTINATIONS.has(destination)) return;
    trackEvent('home_navigation_click', {
      destination,
      destination_type: !detail ? (DISCOVERY.has(destination) ? 'list' : 'page') : detail === 'new' ? 'create' : 'detail',
    });
  };
  // Capture before Next's link handler changes the route or unmounts the home page.
  document.addEventListener('click', onClick, { capture: true });
  return () => document.removeEventListener('click', onClick, { capture: true });
}
