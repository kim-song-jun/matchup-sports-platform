import { cleanup, fireEvent, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatListPageView } from './community-page';
import type { ChatListViewModel } from './community.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/chat',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderRow(width = 390, pinned = false) {
  // Width selects the existing media-query branch; jsdom does not measure responsive layout.
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
    matches: query === '(min-width: 1024px)' && width >= 1024,
    media: query, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }));
  const onTogglePin = vi.fn();
  const model: ChatListViewModel = {
    categories: [{ label: '전체', active: true }], pinnedRooms: [], status: 'ready',
    rooms: [{ id: 'pointer-room', href: '/chat/pointer-room', title: '포인터 방', type: '팀',
      last: '마지막 대화', time: '오후 3:00', unread: 0, initials: '포', pinned, onTogglePin }],
  };
  const { container } = render(<ChatListPageView model={model} />);
  const pane = container.querySelector('.tm-chat-mobile-pane');
  if (!(pane instanceof HTMLElement)) throw new Error('Chat list pane is missing');
  const link = within(pane).getByRole('link', { name: /포인터 방/ });
  const swipe = link.closest('.tm-chat-row-swipe');
  if (!(swipe instanceof HTMLDivElement)) throw new Error('Chat swipe row is missing');
  // jsdom lacks pointer capture: emulate only this row's browser API, not the gesture handlers.
  const captured = new Set<number>();
  const capture = vi.fn((id: number) => { captured.add(id); });
  const release = vi.fn((id: number) => { captured.delete(id); });
  Object.assign(swipe, { setPointerCapture: capture, releasePointerCapture: release,
    hasPointerCapture: (id: number) => captured.has(id) });
  return { link, swipe, capture, release, onTogglePin,
    pin: within(pane).getByRole('button', { name: pinned ? '포인터 방 고정 해제' : '포인터 방 고정' }) };
}

function pointer(target: Element, type: string, x: number, y = 100, id = 1) {
  return pointerInput(target, type, { clientX: x, clientY: y, pointerId: id, pointerType: 'touch' });
}

function pointerInput(target: Element, type: string, input: PointerEventInit) {
  // MouseEvent keeps real coordinates; plain jsdom pointer events silently discard them.
  const pressed = type === 'pointerdown' || type === 'pointermove';
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0,
    buttons: pressed ? 1 : 0, clientY: 100, ...input });
  Object.defineProperties(event, { pointerId: { value: input.pointerId ?? 1 },
    isPrimary: { value: input.isPrimary ?? true }, pointerType: { value: input.pointerType ?? 'mouse' } });
  return fireEvent(target, event);
}

function allowsClick(target: Element, detail = 1) {
  let allowed = false;
  const observe = (event: Event) => {
    allowed = !event.defaultPrevented;
    // Observe the real component's default-action decision, then avoid jsdom's missing navigation.
    event.preventDefault();
  };
  document.addEventListener('click', observe, { once: true });
  fireEvent(target, new MouseEvent('click', { bubbles: true, cancelable: true, detail }));
  document.removeEventListener('click', observe);
  return allowed;
}

function openRow(row: ReturnType<typeof renderRow>) {
  pointer(row.link, 'pointerdown', 200);
  pointer(row.link, 'pointermove', 140);
  pointer(row.swipe, 'pointerup', 140);
  // Browsers may retarget a captured gesture's click to its capture owner.
  allowsClick(row.swipe);
}

describe('ChatRoomRow pointer entry — real component gesture contract', () => {
  // These cases prove capture/default-action boundaries, not Chromium click retargeting or alpha PASS.
  it.each([390, 768, 1440])('keeps normal Link activation without parent capture at %ipx', (width) => {
    const row = renderRow(width);
    pointer(row.link, 'pointerdown', 200);
    pointer(row.link, 'pointerup', 200);
    expect(row.capture).not.toHaveBeenCalled();
    expect(row.link).toHaveAttribute('href', '/chat/pointer-room');
    expect(allowsClick(row.link)).toBe(true);
  });

  it('keeps small tap jitter from capturing or cancelling the Link click', () => {
    const row = renderRow();
    pointer(row.link, 'pointerdown', 200);
    pointer(row.link, 'pointermove', 194, 103);
    pointer(row.link, 'pointerup', 194, 103);
    expect(row.capture).not.toHaveBeenCalled();
    expect(row.swipe).toHaveStyle({ transform: 'translateX(0px)' });
    expect(allowsClick(row.link)).toBe(true);
  });

  it('captures only the horizontal drag and suppresses its retargeted click', () => {
    const row = renderRow();
    pointer(row.link, 'pointerdown', 200);
    expect(row.capture).not.toHaveBeenCalled();
    pointer(row.link, 'pointermove', 140);
    expect(row.capture).toHaveBeenCalledExactlyOnceWith(1);
    pointer(row.swipe, 'pointerup', 140);
    expect(row.release).toHaveBeenCalledExactlyOnceWith(1);
    expect(row.swipe).toHaveStyle({ transform: 'translateX(-72px)' });
    expect(allowsClick(row.swipe)).toBe(false);
  });

  it('suppresses a drag click when its target remains the Link', () => {
    const row = renderRow();
    pointer(row.link, 'pointerdown', 200);
    pointer(row.link, 'pointermove', 140);
    pointer(row.swipe, 'pointerup', 140);
    expect(allowsClick(row.link)).toBe(false);
  });

  it('closes an open row with a right swipe and allows the next tap', () => {
    const row = renderRow();
    openRow(row);
    pointer(row.link, 'pointerdown', 140);
    pointer(row.link, 'pointermove', 200);
    pointer(row.swipe, 'pointerup', 200);
    expect(row.swipe).toHaveStyle({ transform: 'translateX(0px)' });
    expect(allowsClick(row.swipe)).toBe(false);
    pointer(row.link, 'pointerdown', 200);
    pointer(row.link, 'pointerup', 200);
    expect(allowsClick(row.link)).toBe(true);
  });

  it('lets a vertical gesture scroll and does not later turn it into a horizontal drag', () => {
    const row = renderRow();
    pointer(row.link, 'pointerdown', 200);
    expect(pointer(row.link, 'pointermove', 190, 130)).toBe(true);
    pointer(row.link, 'pointermove', 140, 140);
    pointer(row.link, 'pointerup', 140, 140);
    expect(row.capture).not.toHaveBeenCalled();
    expect(row.swipe).toHaveStyle({ transform: 'translateX(0px)' });
    pointer(row.link, 'pointerdown', 200);
    pointer(row.link, 'pointerup', 200);
    expect(allowsClick(row.link)).toBe(true);
  });

  it('cancels a horizontal gesture without opening the row or blocking the next tap', () => {
    const row = renderRow();
    pointer(row.link, 'pointerdown', 200);
    pointer(row.link, 'pointermove', 140);
    pointer(row.swipe, 'pointercancel', 140);
    expect(row.release).toHaveBeenCalledExactlyOnceWith(1);
    expect(row.swipe).toHaveStyle({ transform: 'translateX(0px)' });
    pointer(row.link, 'pointerdown', 200);
    pointer(row.link, 'pointerup', 200);
    expect(allowsClick(row.link)).toBe(true);
  });

  it.each([false, true])('keeps the pin action independent of pointer capture (pinned=%s)', (pinned) => {
    const row = renderRow(390, pinned);
    openRow(row);
    row.capture.mockClear();
    pointer(row.pin, 'pointerdown', 250);
    pointer(row.pin, 'pointerup', 250);
    allowsClick(row.pin);
    expect(row.capture).not.toHaveBeenCalled();
    expect(row.onTogglePin).toHaveBeenCalledTimes(1);
    expect(row.swipe).toHaveStyle({ transform: 'translateX(0px)' });
  });

  it('keeps Enter activation after a cancelled gesture', async () => {
    const row = renderRow();
    pointer(row.link, 'pointerdown', 200);
    pointer(row.link, 'pointermove', 140);
    pointer(row.swipe, 'pointercancel', 140);
    let allowed = false;
    const activate = vi.fn((event: Event) => {
      allowed = !event.defaultPrevented;
      event.preventDefault();
    });
    document.addEventListener('click', activate, { once: true });
    row.link.focus();
    await userEvent.setup().keyboard('[Enter]');
    document.removeEventListener('click', activate);
    expect(activate).toHaveBeenCalledTimes(1);
    expect(allowed).toBe(true);
  });

  it('starts the pin button cleanly after a mouse release outside an open row', () => {
    const row = renderRow();
    openRow(row);
    row.capture.mockClear();
    pointerInput(row.link, 'pointerdown', { clientX: 170 });
    pointerInput(document.body, 'pointerup', { clientX: 250 });
    pointerInput(row.pin, 'pointerdown', { clientX: 250 });
    pointerInput(row.pin, 'pointermove', { clientX: 253 });
    pointerInput(row.pin, 'pointerup', { clientX: 253 });
    allowsClick(row.pin);
    expect(row.capture).not.toHaveBeenCalled();
    expect(row.onTogglePin).toHaveBeenCalledTimes(1);
  });

  it.each(['mouse', 'pen'])('does not resume a missed release on %s hover', (pointerType) => {
    const row = renderRow();
    openRow(row);
    row.capture.mockClear();
    pointerInput(row.link, 'pointerdown', { clientX: 170, pointerType });
    pointerInput(document.body, 'pointerup', { clientX: 250, pointerType });
    pointerInput(row.link, 'pointermove', { clientX: 250, pointerType, buttons: 0 });
    expect(row.capture).not.toHaveBeenCalled();
    expect(row.swipe).toHaveStyle({ transform: 'translateX(-72px)' });
  });

  it('clears missed mobile pointer state before accepting desktop Link input', () => {
    const row = renderRow();
    pointerInput(row.link, 'pointerdown', { clientX: 170 });
    pointerInput(document.body, 'pointerup', { clientX: 250 });
    const mobileMedia = window.matchMedia;
    vi.stubGlobal('matchMedia', (query: string) => ({ ...mobileMedia(query), matches: query === '(min-width: 1024px)' }));
    pointerInput(row.link, 'pointerdown', { clientX: 250 });
    pointerInput(row.link, 'pointermove', { clientX: 253 });
    pointerInput(row.link, 'pointerup', { clientX: 253 });
    expect(row.capture).not.toHaveBeenCalled();
    expect(allowsClick(row.link)).toBe(true);
  });

  it('keeps an active primary gesture when a secondary pointer touches the row', () => {
    const row = renderRow();
    pointer(row.link, 'pointerdown', 200);
    pointer(row.link, 'pointermove', 170);
    pointerInput(row.swipe, 'pointerdown', { clientX: 250, pointerId: 2, isPrimary: false, pointerType: 'touch' });
    pointer(row.swipe, 'pointermove', 300, 100, 2);
    pointer(row.swipe, 'pointerup', 300, 100, 2);
    pointer(row.swipe, 'pointermove', 140);
    pointer(row.swipe, 'pointerup', 140);
    expect(row.capture).toHaveBeenCalledExactlyOnceWith(1);
    expect(row.release).toHaveBeenCalledExactlyOnceWith(1);
    expect(row.swipe).toHaveStyle({ transform: 'translateX(-72px)' });
    expect(allowsClick(row.swipe)).toBe(false);
  });
});
