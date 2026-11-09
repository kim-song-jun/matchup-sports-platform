import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackAdClick, trackAdImpression } from '@/lib/ad-events';
import { resolveAdLink, type AdLink } from '@/lib/ad-link';
import { optimizedImageSrc } from '@/lib/assets';
import { bindSoftNavigator } from '@/lib/navigation-history';
import { overlayMarkerOf, waitForOverlayHistory } from '@/lib/overlay-history';
import { createV1PublicPopupAdFixture } from '@/test/msw/ads-fixtures';
import type { V1PublicPopupAd } from '@/types/ads';
import { HomeAdPopupDialog } from './home-ad-popup-dialog';

vi.mock('@/lib/ad-events', () => ({ trackAdClick: vi.fn(), trackAdImpression: vi.fn() }));

const clickMock = vi.mocked(trackAdClick);
const impressionMock = vi.mocked(trackAdImpression);

const campaign: V1PublicPopupAd = createV1PublicPopupAdFixture({
  advertiserName: '에버데이',
  headline: '이번 주말, 새 축구화 20% 할인',
  description: '팀밋 회원에게만 드리는 할인이에요.',
  altText: '에버데이 새 축구화',
  linkUrl: 'https://everyday.example.com/event',
});

function linkOf(url: string): AdLink {
  const link = resolveAdLink(url);
  if (!link) throw new Error(`unsafe test link: ${url}`);
  return link;
}

function renderDialog(overrides: { campaign?: Partial<V1PublicPopupAd>; currentPath?: string } = {}) {
  const ad = { ...campaign, ...overrides.campaign };
  const onClose = vi.fn();
  const onImageError = vi.fn();
  const view = render(
    <HomeAdPopupDialog
      campaign={ad}
      link={linkOf(ad.linkUrl)}
      currentPath={overrides.currentPath ?? '/home'}
      onClose={onClose}
      onImageError={onImageError}
    />,
  );
  return { ...view, ad, onClose, onImageError };
}

function creative() {
  return within(screen.getByRole('dialog')).getByRole('img', { name: campaign.altText });
}

/** jsdom never loads images, so a test says when the creative arrived. */
function loadCreative() {
  fireEvent.load(creative());
}

/** The click's default action (opening the link) is not implemented in jsdom; the handlers still run. */
function activate(link: HTMLElement) {
  link.addEventListener('click', (event) => event.preventDefault());
  act(() => {
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
}

beforeEach(() => {
  document.body.style.overflow = '';
});

afterEach(async () => {
  cleanup();
  // Unmounting an open overlay can schedule a real history.back(); let it settle before the next test opens one.
  await waitForOverlayHistory();
  vi.clearAllMocks();
});

describe('HomeAdPopupDialog layout and semantics', () => {
  it('names the dialog by its headline and describes it with the description', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: campaign.headline ?? '' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription(campaign.description ?? '');
  });

  it('has no description reference when the campaign has no description', () => {
    renderDialog({ campaign: { description: null } });

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('aria-describedby');
    expect(dialog).toHaveTextContent('이번 주말, 새 축구화 20% 할인');
    expect(dialog).toHaveTextContent('에버데이');
    expect(dialog).not.toHaveTextContent('팀밋 회원에게만');
  });

  it('shows the advertiser, a 광고 chip and the creative, and only the detail button is a link', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('광고')).toBeInTheDocument();
    expect(within(dialog).getByText('에버데이')).toBeInTheDocument();
    // Shown at the 420px column width, through the same optimizer the banner uses.
    expect(creative()).toHaveAttribute('src', optimizedImageSrc(campaign.imageUrl, 420));
    expect(creative().getAttribute('src')).toContain('/_next/image');
    // The creative is not a control: neither a link nor a button wraps it.
    expect(creative().closest('a, button')).toBeNull();
    const links = within(dialog).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('자세히 보기');
  });

  it('does not treat a press on the creative as an ad click or as a close', async () => {
    const { onClose } = renderDialog();

    await userEvent.setup().click(creative());

    expect(clickMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('scrolls inside the window on a short screen so no button ends up out of reach', () => {
    renderDialog();

    expect(screen.getByRole('dialog')).toHaveStyle({ overflowY: 'auto' });
  });
});

describe('HomeAdPopupDialog closing', () => {
  it('closes from the close button without counting a click', async () => {
    const { onClose } = renderDialog();

    await userEvent.setup().click(screen.getByRole('button', { name: '닫기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(clickMock).not.toHaveBeenCalled();
  });

  it('closes from "오늘 하루 안 보기" without counting a click', async () => {
    const { onClose } = renderDialog();

    await userEvent.setup().click(screen.getByRole('button', { name: '오늘 하루 안 보기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(clickMock).not.toHaveBeenCalled();
  });

  it('closes on Escape without counting a click', async () => {
    const { onClose } = renderDialog();

    await userEvent.setup().keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(clickMock).not.toHaveBeenCalled();
  });

  it('closes when the dimmed area outside the window is pressed, and does not count it as an ad click', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    const scrim = screen.getByRole('dialog').parentElement;
    if (!scrim) throw new Error('dialog has no backdrop');

    // Control: pressing inside the window leaves it open.
    await user.click(screen.getByText(campaign.headline ?? ''));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(clickMock).not.toHaveBeenCalled();
  });
});

describe('HomeAdPopupDialog detail link', () => {
  it('opens an external link in a new tab without leaking the opener, counts one click and closes', () => {
    const { onClose } = renderDialog();
    const link = screen.getByRole('link', { name: '자세히 보기' });

    expect(link).toHaveAttribute('href', 'https://everyday.example.com/event');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')?.split(' ')).toEqual(expect.arrayContaining(['noopener', 'noreferrer']));

    activate(link);

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledWith(campaign.campaignId, 'popup');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('follows an internal link by replacing its own history entry, counts one click and leaves closing to the route change', async () => {
    const historyBack = vi.spyOn(window.history, 'back');
    const routerReplace = vi.fn();
    const unbind = bindSoftNavigator(routerReplace);
    const { onClose } = renderDialog({ campaign: { linkUrl: '/tournaments/tournament-1' } });
    const link = screen.getByRole('link', { name: '자세히 보기' });
    expect(link).toHaveAttribute('href', '/tournaments/tournament-1');
    expect(link).not.toHaveAttribute('target');
    await waitFor(() => expect(overlayMarkerOf(window.history.state)).not.toBeNull());

    const notPrevented = link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(notPrevented).toBe(false);
    expect(routerReplace).toHaveBeenCalledWith('/tournaments/tournament-1');
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(clickMock).toHaveBeenCalledWith(campaign.campaignId, 'popup');
    expect(historyBack).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    historyBack.mockRestore();
    unbind();
  });

  it.each([
    ['an external link', 'https://everyday.example.com/event'],
    ['an internal link', '/tournaments/tournament-1'],
  ])('counts a middle-click on %s that opens it in a new tab, and only the middle button', (_name, linkUrl) => {
    const { onClose } = renderDialog({ campaign: { linkUrl } });
    const link = screen.getByRole('link', { name: '자세히 보기' });

    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 2 }));

    expect(clickMock).toHaveBeenCalledExactlyOnceWith(campaign.campaignId, 'popup');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('only closes when the internal link points at the page that is already open', () => {
    const routerReplace = vi.fn();
    const unbind = bindSoftNavigator(routerReplace);
    const { onClose } = renderDialog({ campaign: { linkUrl: '/home' }, currentPath: '/home' });

    activate(screen.getByRole('link', { name: '자세히 보기' }));

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(routerReplace).not.toHaveBeenCalled();
    unbind();
  });

  it.each([
    ['a query', '/home?tab=team'],
    ['a fragment', '/home#recommend'],
  ])('moves to the same page with %s and closes, because the page does not change under it', async (_name, linkUrl) => {
    const historyBack = vi.spyOn(window.history, 'back');
    const routerReplace = vi.fn();
    const unbind = bindSoftNavigator(routerReplace);
    const { onClose } = renderDialog({ campaign: { linkUrl }, currentPath: '/home' });
    await waitFor(() => expect(overlayMarkerOf(window.history.state)).not.toBeNull());

    act(() => {
      screen.getByRole('link', { name: '자세히 보기' }).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(routerReplace).toHaveBeenCalledWith(linkUrl);
    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(historyBack).not.toHaveBeenCalled();
    historyBack.mockRestore();
    unbind();
  });

  it('keeps the window open when a same-page link is opened in a new tab with a modifier key', () => {
    const { onClose } = renderDialog({ campaign: { linkUrl: '/home?tab=team' }, currentPath: '/home' });
    const link = screen.getByRole('link', { name: '자세히 보기' });
    link.addEventListener('click', (event) => event.preventDefault());

    act(() => {
      link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    });

    expect(clickMock).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('HomeAdPopupDialog impression measurement', () => {
  /** jsdom has no layout, so the test reports the creative as fully on screen the moment it is observed. */
  class VisibleObserver {
    readonly observed: Element[] = [];

    constructor(private readonly callback: IntersectionObserverCallback) {}

    observe(element: Element) {
      this.observed.push(element);
      this.callback(
        [{ target: element, intersectionRatio: 1, isIntersecting: true } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }

    unobserve() {}

    disconnect() {}

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IntersectionObserver', VisibleObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not count the popup while its creative has not loaded', () => {
    renderDialog();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(impressionMock).not.toHaveBeenCalled();
  });

  it('counts one impression for the popup channel once the creative has loaded and stayed visible for a second', () => {
    renderDialog();
    loadCreative();

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(impressionMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(impressionMock).toHaveBeenCalledTimes(1);
    expect(impressionMock).toHaveBeenCalledWith(campaign.campaignId, 'popup');
  });
});

describe('HomeAdPopupDialog creative failure', () => {
  it('reports a creative that fails to load and does not close or count anything itself', () => {
    const { onImageError, onClose } = renderDialog();

    fireEvent.error(creative());

    expect(onImageError).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(impressionMock).not.toHaveBeenCalled();
  });
});

describe('HomeAdPopupDialog modal behaviour', () => {
  it('puts focus on the window, keeps Tab inside it and gives focus back on unmount', async () => {
    const user = userEvent.setup();
    const outside = document.createElement('button');
    outside.textContent = '밖의 버튼';
    document.body.append(outside);
    outside.focus();

    const view = renderDialog();
    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog).toHaveFocus());

    const detail = screen.getByRole('link', { name: '자세히 보기' });
    const close = screen.getByRole('button', { name: '닫기' });
    await user.tab();
    expect(detail).toHaveFocus();
    close.focus();
    await user.tab();
    expect(detail).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();

    view.unmount();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it('locks the page scroll only while it is open', () => {
    const view = renderDialog();
    expect(document.body.style.overflow).toBe('hidden');

    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
