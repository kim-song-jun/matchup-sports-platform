import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let stop: (() => void) | undefined;
const spyOnDocumentListeners = () => vi.spyOn(document, 'addEventListener');
let documentListeners: ReturnType<typeof spyOnDocumentListeners>;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
  vi.resetModules();
  delete window.gtag;
  delete window.dataLayer;
  window.history.replaceState(null, '', '/home');
  documentListeners = spyOnDocumentListeners();
});

afterEach(() => {
  stop?.();
  stop = undefined;
  // analytics also registers a lifetime internal-traffic listener. A module reset must
  // not leave that old instance attached to this test document after deleting gtag.
  for (const [name, listener, options] of documentListeners.mock.calls) {
    if (name === 'click') document.removeEventListener(name, listener, options);
  }
  documentListeners.mockRestore();
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
  vi.unstubAllEnvs();
});

function clickLink(href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.innerHTML = '<span>사용자 이름과 개인 내용</span>';
  a.addEventListener('click', (event) => event.preventDefault());
  document.body.append(a);
  (a.firstElementChild as HTMLElement).click();
}

const events = () => (window.dataLayer ?? [])
  .map((entry) => Array.from(entry as ArrayLike<unknown>))
  .filter((command) => command[0] === 'event' && command[1] === 'home_navigation_click');

describe('home navigation analytics', () => {
  it('queues one event for a nested link click without identity, query or fragment', async () => {
    stop = (await import('./home-analytics')).observeHomeNavigation();
    clickLink('/teams/private-team-id?email=private@example.com#private-name');
    expect(events()).toEqual([['event', 'home_navigation_click', {
      destination: 'teams', destination_type: 'detail',
    }]]);
  });

  it('distinguishes browsing from starting creation without claiming success', async () => {
    stop = (await import('./home-analytics')).observeHomeNavigation();
    clickLink('/team-matches');
    clickLink('/team-matches/new');
    expect(events().map((event) => event[2])).toEqual([
      { destination: 'team-matches', destination_type: 'list' },
      { destination: 'team-matches', destination_type: 'create' },
    ]);
  });

  it('ignores external, private console, unknown and non-home navigation', async () => {
    stop = (await import('./home-analytics')).observeHomeNavigation();
    for (const href of ['https://example.com/teams', '/admin/users', '/users/private-name', 'mailto:private@example.com']) {
      clickLink(href);
    }
    window.history.replaceState(null, '', '/teams');
    clickLink('/matches');
    expect(events()).toEqual([]);
  });

  it('removes its listener on unmount and does not duplicate after remount', async () => {
    const { observeHomeNavigation } = await import('./home-analytics');
    stop = observeHomeNavigation();
    stop();
    clickLink('/teams');
    expect(events()).toEqual([]);
    stop = observeHomeNavigation();
    clickLink('/teams');
    expect(events()).toHaveLength(1);
  });

  it('records intent before the link handler changes the current route', async () => {
    stop = (await import('./home-analytics')).observeHomeNavigation();
    const link = document.createElement('a');
    link.href = '/chat';
    link.addEventListener('click', (event) => {
      event.preventDefault();
      window.history.pushState(null, '', '/chat');
      stop?.();
    });
    document.body.append(link);
    link.click();
    expect(events()).toEqual([['event', 'home_navigation_click', {
      destination: 'chat', destination_type: 'page',
    }]]);
  });
});
