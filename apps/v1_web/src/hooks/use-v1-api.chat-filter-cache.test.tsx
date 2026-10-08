import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, renderHook, waitFor, within } from '@testing-library/react';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatListPageClient } from '@/components/community/community-api-clients';
import { createV1QueryClient } from '@/lib/query-client';
import { v1Keys } from '@/lib/query-keys';
import { useV1UpdateChatRoomMe } from './use-v1-api';
import { api, archived, contact, pinHandlers, pinServer, room } from './use-v1-api.chat-filter-cache.fixtures';

const navigation = { search: '' };
vi.mock('next/navigation', () => ({
  usePathname: () => '/chat', useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
// Only the external socket and Next navigation are replaced; query, HTTP, consumer and view are real.
vi.mock('@/lib/v1-socket', () => ({ getV1Socket: () => ({ on: vi.fn(), off: vi.fn() }) }));

const server = setupServer(...pinHandlers);
const clients: ReturnType<typeof createV1QueryClient>[] = [];
let visibility: DocumentVisibilityState = 'visible';
const filteredKey = [...v1Keys.chatRooms(), 'list', { roomType: 'team', limit: 50 }] as const;
const archivedKey = [...v1Keys.chatRooms(), 'list', { roomType: 'team_contact', status: 'archived', limit: 50 }] as const;

function newTab() {
  // Use production provider defaults and retry policy; the page owns query-specific overrides.
  const client = createV1QueryClient();
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

async function returnToTab(event: 'focus' | 'visibilitychange') {
  visibility = 'visible';
  await act(async () => { window.dispatchEvent(new Event(event)); });
}

function expectPin(pane: ReturnType<typeof within>, pinned: boolean) {
  expect(pane.getByText(room.title)).toBeVisible();
  if (pinned) expect(pane.getByText('고정 1')).toBeVisible();
  else {
    expect(pane.queryByText('고정 1')).not.toBeInTheDocument();
    expect(pane.getByText('채팅방 1')).toBeVisible();
  }
}

function mountTabs() {
  const actor = newTab();
  const mutation = renderHook(() => useV1UpdateChatRoomMe(), { wrapper: actor.wrapper });
  const observer = newTab();
  const { container, rerender } = render(<ChatListPageClient />, { wrapper: observer.wrapper });
  const element = container.querySelector('.tm-chat-mobile-pane');
  if (!(element instanceof HTMLElement)) throw new TypeError('The real mobile chat pane is missing');
  const pane = within(element);
  return { actor, mutation, observer, pane, rerender };
}

async function warmAndDisableCategory(initialPin: boolean) {
  pinServer.pinned = initialPin;
  const { actor, mutation, observer, pane } = mountTabs();
  await waitFor(() => expectPin(pane, initialPin));
  fireEvent.click(pane.getByRole('button', { name: /^팀(?: \d+)?$/ }));
  await waitFor(() => expect(pinServer.filteredReads).toBe(1));
  await waitFor(() => expect(observer.client.isFetching()).toBe(0));
  expectPin(pane, initialPin);
  fireEvent.click(pane.getByRole('button', { name: /^전체 \d+$/ }));
  const cachedCategory = observer.client.getQueryCache().find({ queryKey: filteredKey, exact: true });
  expect(cachedCategory?.isActive()).toBe(false);
  expect(cachedCategory?.isStaleByTime(60_000)).toBe(false);
  visibility = 'hidden';
  await act(async () => { window.dispatchEvent(new Event('visibilitychange')); });
  return { actor, observer, mutation, pane };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  pinServer.pinned = pinServer.archivedPinned = pinServer.contactPinned = pinServer.hasContact = pinServer.failFiltered = pinServer.failArchived = false;
  pinServer.baseReads = pinServer.filteredReads = pinServer.archivedReads = pinServer.contactReads = 0;
  pinServer.patches.length = 0;
  navigation.search = '';
  visibility = 'visible';
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  focusManager.setFocused(undefined);
});

function expectArchivedPin(pane: ReturnType<typeof within>, pinned: boolean) {
  expect(pane.getByRole('button', { name: `${archived.title} ${pinned ? '고정 해제' : '고정'}` })).toBeVisible();
}

type ArchiveExit = 'category' | 'collapse' | 'url';

async function warmAndDisableArchive(initialPin: boolean, exit: ArchiveExit) {
  pinServer.archivedPinned = initialPin;
  const { observer, mutation, pane, rerender } = mountTabs();
  await waitFor(() => expect(pane.getByText(room.title)).toBeVisible());
  fireEvent.click(pane.getByRole('button', { name: /^팀컨택(?: \d+)?$/ }));
  fireEvent.click(pane.getByRole('button', { name: '종료된 컨택 보기' }));
  await waitFor(() => expectArchivedPin(pane, initialPin));
  await waitFor(() => expect(observer.client.isFetching()).toBe(0));
  expect(pinServer.archivedReads).toBe(1);
  fireEvent.click(pane.getByRole('button', { name: exit === 'collapse' ? '종료된 컨택 숨기기' : /^전체 \d+$/ }));
  const cachedArchive = observer.client.getQueryCache().find({ queryKey: archivedKey, exact: true });
  expect(cachedArchive?.isActive()).toBe(false);
  expect(cachedArchive?.isStaleByTime(60_000)).toBe(false);
  visibility = 'hidden';
  await act(async () => { window.dispatchEvent(new Event('visibilitychange')); });
  const reopen = () => {
    if (exit === 'url') { navigation.search = 'category=team_contact'; rerender(<ChatListPageClient />); }
    else fireEvent.click(pane.getByRole('button', { name: exit === 'category' ? /^팀컨택(?: \d+)?$/ : '종료된 컨택 보기' }));
  };
  return { observer, mutation, pane, reopen };
}

describe('fresh inactive archived contacts after another tab changes pin', () => {
  it.each([true, false].flatMap((pinned) => (['category', 'collapse', 'url'] as const).map((exit) => ({ pinned, exit }))))(
    'refreshes archived pinned=$pinned on $exit re-entry', async ({ pinned, exit }) => {
    const { observer, mutation, pane, reopen } = await warmAndDisableArchive(!pinned, exit);
    const started = Date.now();
    await act(async () => { await mutation.result.current.mutateAsync({ roomId: archived.roomId, pinned }); });
    expect(pinServer.patches).toEqual([pinned]);
    const baseReads = pinServer.baseReads;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(pinServer.baseReads).toBe(baseReads);
    await returnToTab('focus');
    await waitFor(() => expect(observer.client.isFetching()).toBe(0));
    expect(pinServer.baseReads).toBeGreaterThan(baseReads);
    expect(pinServer.archivedReads).toBe(1);
    reopen();
    await waitFor(() => expectArchivedPin(pane, pinned));
    expect(pinServer.archivedReads).toBe(2);
    expect(Date.now() - started).toBeLessThan(60_000);
  });

  it('shows the real archived re-entry failure beside cached pins and retries only the archive', async () => {
    const { observer, mutation, pane, reopen } = await warmAndDisableArchive(true, 'category');
    await act(async () => { await mutation.result.current.mutateAsync({ roomId: archived.roomId, pinned: false }); });
    await returnToTab('focus');
    await waitFor(() => expect(observer.client.isFetching()).toBe(0));
    pinServer.failArchived = true;
    reopen();
    await waitFor(() => expect(pane.getByRole('alert')).toHaveTextContent('종료된 컨택 정보를 불러오지 못했어요.'), { timeout: 3_500 });
    expectArchivedPin(pane, true);
    expect(pinServer.archivedReads).toBe(3); // Production retry1 makes two actual failed reads.
    const baseReads = pinServer.baseReads;
    pinServer.failArchived = false;
    fireEvent.click(pane.getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => {
      expect(pane.queryByRole('alert')).not.toBeInTheDocument();
      expectArchivedPin(pane, false);
    });
    expect(pinServer.archivedReads).toBe(4);
    expect(pinServer.baseReads).toBe(baseReads);
  });
});

describe('warm active contact category entered through URL parameters', () => {
  it.each([true, false])('refreshes active contact pinned=%s after the mounted URL changes', async (pinned) => {
    pinServer.hasContact = true;
    pinServer.contactPinned = !pinned;
    const { observer, mutation, pane, rerender } = mountTabs();
    await waitFor(() => expect(pane.getByText(room.title)).toBeVisible());
    fireEvent.click(pane.getByRole('button', { name: /^팀컨택(?: \d+)?$/ }));
    await waitFor(() => expect(pane.getByRole('button', { name: `${contact.title} ${!pinned ? '고정 해제' : '고정'}` })).toBeVisible());
    await waitFor(() => expect(observer.client.isFetching()).toBe(0));
    fireEvent.click(pane.getByRole('button', { name: /^전체 \d+$/ }));
    const cached = observer.client.getQueryCache().find({ queryKey: [...v1Keys.chatRooms(), 'list', { roomType: 'team_contact', limit: 50 }], exact: true });
    expect(cached?.isActive()).toBe(false);
    expect(cached?.isStaleByTime(60_000)).toBe(false);
    visibility = 'hidden';
    await act(async () => { window.dispatchEvent(new Event('visibilitychange')); });
    const started = Date.now();
    await act(async () => { await mutation.result.current.mutateAsync({ roomId: contact.roomId, pinned }); });
    expect(pinServer.patches).toEqual([pinned]);
    const baseReads = pinServer.baseReads;
    await returnToTab('focus');
    await waitFor(() => expect(observer.client.isFetching()).toBe(0));
    expect(pinServer.baseReads).toBeGreaterThan(baseReads);
    expect(pinServer.contactReads).toBe(1);
    navigation.search = 'category=team_contact';
    rerender(<ChatListPageClient />);
    await waitFor(() => expect(pane.getByRole('button', { name: `${contact.title} ${pinned ? '고정 해제' : '고정'}` })).toBeVisible());
    expect(pinServer.contactReads).toBe(2);
    expect(Date.now() - started).toBeLessThan(60_000);
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  server.resetHandlers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  focusManager.setFocused(undefined);
});
afterAll(() => server.close());

describe('fresh inactive chat category after another tab changes pin', () => {
  it.each([true, false].flatMap((pinned) => ['focus', 'visibilitychange'].map((event) => ({ pinned, event }))))(
    'renders committed pinned=$pinned when a warm category is reselected after $event', async ({ pinned, event }) => {
    // Given: B warmed a category, then disabled it by selecting all; A commits a real PATCH.
    const { observer, mutation, pane } = await warmAndDisableCategory(!pinned);
    const started = Date.now();
    await act(async () => { await mutation.result.current.mutateAsync({ roomId: room.roomId, pinned }); });
    expect(pinServer.patches).toEqual([pinned]);
    const baseReads = pinServer.baseReads;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(pinServer.baseReads).toBe(baseReads);
    expect(pinServer.filteredReads).toBe(1);
    // When: B returns to all; disabled category must remain idle while base becomes current.
    await returnToTab(event === 'focus' ? 'focus' : 'visibilitychange');
    await waitFor(() => expect(observer.client.isFetching()).toBe(0));
    expect(pinServer.baseReads).toBeGreaterThan(baseReads);
    expect(pinServer.filteredReads).toBe(1);
    expectPin(pane, pinned);
    fireEvent.click(pane.getByRole('button', { name: /^팀(?: \d+)?$/ }));
    // Then: re-entry before60s must not restore an obsolete successful filtered response.
    await waitFor(() => expectPin(pane, pinned));
    expect(pinServer.filteredReads).toBe(2);
    expect(Date.now() - started).toBeLessThan(60_000);
  });

  it('shows the real re-entry failure beside cached pins and retries the category', async () => {
    const { observer, mutation, pane } = await warmAndDisableCategory(true);
    await act(async () => { await mutation.result.current.mutateAsync({ roomId: room.roomId, pinned: false }); });
    await returnToTab('focus');
    await waitFor(() => expect(observer.client.isFetching()).toBe(0));
    expectPin(pane, false);
    pinServer.failFiltered = true;
    fireEvent.click(pane.getByRole('button', { name: /^팀(?: \d+)?$/ }));
    await waitFor(() => expect(pane.getByRole('alert')).toHaveTextContent('팀 채팅을 불러오지 못했어요.'), { timeout: 3_500 });
    expectPin(pane, true);
    pinServer.failFiltered = false;
    fireEvent.click(pane.getByRole('button', { name: '다시 불러오기' }));
    await waitFor(() => {
      expect(pane.queryByRole('alert')).not.toBeInTheDocument();
      expectPin(pane, false);
    });
  });
});
