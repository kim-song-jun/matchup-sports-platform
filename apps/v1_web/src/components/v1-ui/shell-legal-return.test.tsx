import { useSyncExternalStore, type AnchorHTMLAttributes } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MyLegalSettingsPage from '@/app/my/settings/legal/page';
import NotFound from '@/app/not-found';
import { TermsClient } from '@/components/auth/terms-client';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { clearStoredV1Session, saveStoredV1Session } from '@/lib/session-storage';
import { createHistoryRouter, nextPopState } from '@/test/history-router';
import type { V1CurrentTerms } from '@/types/api';
import { AppShellFrame } from './app-shell-frame';
import { AppChrome } from './shell';

const navigation = vi.hoisted(() => ({ suspendSearch: false, missingPathname: false }));
const nativeRouter = createHistoryRouter();
const currentHref = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
const notifyNavigation = () => window.dispatchEvent(new Event('legal-return-navigation'));
const router = {
  ...nativeRouter,
  push: vi.fn((href: string) => { nativeRouter.push(href); notifyNavigation(); }),
  replace: vi.fn((href: string) => { nativeRouter.replace(href); notifyNavigation(); }),
};
function useHistoryHref() {
  return useSyncExternalStore((notify) => {
    window.addEventListener('popstate', notify);
    window.addEventListener('legal-return-navigation', notify);
    return () => {
      window.removeEventListener('popstate', notify);
      window.removeEventListener('legal-return-navigation', notify);
    };
  }, currentHref, currentHref);
}

// Next 경계만 연결한다. 문서 HTTP/hooks/View·상단 Back·실제 앱 history는 바꾸지 않는다.
vi.mock('next/navigation', () => ({
  usePathname: () => { useHistoryHref(); return navigation.missingPathname ? null : window.location.pathname; },
  useSearchParams: () => {
    useHistoryHref();
    if (navigation.suspendSearch) throw new Promise<never>(() => undefined);
    return new URLSearchParams(window.location.search);
  },
  useRouter: () => router,
}));
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => (
    <a {...props} href={href} data-prefetch={String(prefetch)} onClick={(event) => {
      onClick?.(event);
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      router.push(String(href));
    }}>{children}</a>
  ),
}));

const documents = [
  { key: 'terms', code: 'footer_service_terms', title: '서비스 이용약관' },
  { key: 'privacy', code: 'privacy_policy', title: '개인정보처리방침' },
  { key: 'location', code: 'location_terms', title: '위치기반서비스 이용약관' },
  { key: 'tournament-policy', code: 'tournament_policy', title: '대회 운영정책' },
  { key: 'support', code: 'support', title: '고객센터' },
] as const;
const footerTerms: V1CurrentTerms = {
  context: 'footer', ready: true, compliance: null,
  items: documents.map((document, index) => ({
    policyId: `qa65-policy-${index}`, documentId: `qa65-document-${index}`, code: document.code,
    version: 'qa65.1', title: document.title, subtitle: '합성 관리 문서 안내',
    content: `합성 ${document.key} HTTP 문서 본문`, changeSummary: null, requirement: 'display_only',
    displayOrder: index, requiresReconsent: false, enforcementAt: null, effectiveAt: null,
    accepted: false, requiresAction: false,
  })),
};
const settingsPath = '/my/settings/legal';
const upstream = '/my/settings?from=%2Fmy#account';
const richSource = `${settingsPath}?view=all&filter=keep&from=${encodeURIComponent(upstream)}#legal-list`;
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: '2026-10-09T00:00:00.000Z' });
const clients: QueryClient[] = [];
let server: ReturnType<typeof setupServer>;
let failTerms = false;
let termsRequests: URL[] = [];
let writes: string[] = [];

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  vi.clearAllMocks();
  navigation.suspendSearch = false; navigation.missingPathname = false;
  clearStoredV1Session();
  saveStoredV1Session({ userId: 'qa65-synthetic-user' });
  __resetNavigationHistoryForTests();
  window.history.replaceState(null, '', '/home');
  installNavigationHistory();
  failTerms = false; termsRequests = []; writes = [];
  server = setupServer(
    http.get('*/api/v1/terms/current', ({ request }) => {
      const url = new URL(request.url);
      termsRequests.push(url);
      if (failTerms) return HttpResponse.json({ status: 'error', statusCode: 503, code: 'INTERNAL_ERROR', message: '합성 약관 조회 실패', timestamp: '' }, { status: 503 });
      return ok(footerTerms);
    }),
    http.get('*/api/v1/notifications', () => ok({ items: [], unreadCount: 0, pageInfo: { hasNext: false, nextCursor: null } })),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
    http.post('*/api/v1/terms/consents', ({ request }) => { writes.push(request.url); return new HttpResponse(null, { status: 500 }); }),
    http.post('*/api/v1/auth/social-terms', ({ request }) => { writes.push(request.url); return new HttpResponse(null, { status: 500 }); }),
  );
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  server.close();
  __resetNavigationHistoryForTests();
  clearStoredV1Session();
  navigation.suspendSearch = false; navigation.missingPathname = false;
  vi.unstubAllEnvs();
});

function HistoryConsumer() {
  useHistoryHref();
  if (window.location.pathname === '/terms') return <TermsClient />;
  if (window.location.pathname === '/login') return <p>직접 문서의 로그인 복귀 경로</p>;
  if (window.location.pathname === '/home') return <p>원래 상위 항목</p>;
  return <AppShellFrame><MyLegalSettingsPage /></AppShellFrame>;
}
function renderAt(href: string) {
  nativeRouter.push(href);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return { client, ...render(<QueryClientProvider client={client}><HistoryConsumer /></QueryClientProvider>) };
}
function footerLink(title: string) {
  return within(screen.getByRole('navigation', { name: '푸터 링크' })).getByRole<HTMLAnchorElement>('link', { name: title });
}
async function readDocument(key: string) {
  await screen.findByText(`합성 ${key} HTTP 문서 본문`);
  expect(termsRequests).toHaveLength(1);
  expect(termsRequests[0].pathname).toBe('/api/v1/terms/current');
  expect(termsRequests[0].searchParams.get('context')).toBe('footer');
  expect(writes).toEqual([]);
}
async function topBackTo(source: string) {
  fireEvent.click(screen.getAllByRole('link', { name: '뒤로가기' })[0]);
  await waitFor(() => expect(currentHref()).toBe(source));
  expect(screen.getByRole('heading', { name: '약관 및 정책' })).toBeInTheDocument();
  expect(router.back).toHaveBeenCalledTimes(1);
  expect(router.replace).not.toHaveBeenCalled();
}

describe('QA65 앱 푸터의 실제 문서 읽기와 상단 복귀', () => {
  it('개인정보 푸터에서 실제 문서를 읽고 상단 Back하면 설정 목록을 복원한다', async () => {
    renderAt(settingsPath);
    fireEvent.click(footerLink('개인정보처리방침'));
    await readDocument('privacy');
    await topBackTo(settingsPath);
    await act(async () => { const pop = nextPopState(); window.history.back(); await pop; });
    expect(currentHref()).toBe('/home');
  });

  it('기존 본문 카드 경로는 실제 문서와 상단 Back 복귀를 유지한다', async () => {
    renderAt(settingsPath);
    fireEvent.click(screen.getByRole('link', { name: /개인정보 처리방침 개인정보를/ }));
    await readDocument('privacy');
    await topBackTo(settingsPath);
  });

  it.each(documents)('$key 문서의 query/hash/중첩 출처와 실제 상단 복귀를 유지한다', async (document) => {
    renderAt(richSource);
    const entry = footerLink(document.title);
    expect(entry).toHaveAttribute('data-prefetch', 'false');
    fireEvent.click(entry);
    await readDocument(document.key);
    expect(screen.getByRole('heading', { name: document.title })).toBeInTheDocument();
    await topBackTo(richSource);
    expect(new URLSearchParams(window.location.search).get('from')).toBe(upstream);
    expect(window.location.hash).toBe('#legal-list');
  });

  it.each(['ctrlKey', 'metaKey'] as const)('%s 수정 클릭에도 새 탭이 사용할 출처 포함 href를 유지한다', (modifier) => {
    renderAt(richSource);
    const entry = footerLink('개인정보처리방침');
    expect(new URL(entry.href).searchParams.get('from')).toBe(richSource);
    // 실제 브라우저 새 탭의 기본 동작만 jsdom 밖이다. React handler 뒤에서 기본 탐색을 막는다.
    document.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(entry, { [modifier]: true });
    expect(router.push).not.toHaveBeenCalled();
    expect(currentHref()).toBe(richSource);
    expect(termsRequests).toHaveLength(0);
  });

  it('같은 셸에서 바뀐 query와 hash도 다음 문서의 출처로 전달한다', async () => {
    renderAt(settingsPath);
    act(() => {
      window.history.replaceState(null, '', richSource);
      notifyNavigation();
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(new URL(footerLink('개인정보처리방침').href).searchParams.get('from')).toBe(richSource));
    fireEvent.click(footerLink('개인정보처리방침'));
    await readDocument('privacy');
    await topBackTo(richSource);
  });

  it.each(['https://outside.invalid', '/login?redirect=%2Fmy'] as const)('잘못된 중첩 출처 %s를 문서 복귀에 전달하지 않는다', async (unsafeFrom) => {
    renderAt(`${settingsPath}?filter=keep&from=${encodeURIComponent(unsafeFrom)}#legal-list`);
    fireEvent.click(footerLink('개인정보처리방침'));
    await readDocument('privacy');
    const destination = `${settingsPath}?filter=keep#legal-list`;
    expect(screen.getAllByRole('link', { name: '뒤로가기' })[0]).toHaveAttribute('href', destination);
    fireEvent.click(screen.getAllByRole('link', { name: '뒤로가기' })[0]);
    await waitFor(() => expect(currentHref()).toBe(destination));
  });

  it('직접 공개 문서는 실제 HTTP 본문과 기존 로그인 fallback을 유지한다', async () => {
    renderAt('/terms?document=privacy');
    await readDocument('privacy');
    for (const back of screen.getAllByRole('link', { name: '뒤로가기' })) {
      expect(back).toHaveAttribute('href', '/login');
      expect(back).not.toHaveAttribute('data-nav-back');
    }
  });

  it('문서503을 숨기지 않고 복귀 후 다시 열면 실제 GET으로 회복한다', async () => {
    failTerms = true;
    renderAt(settingsPath);
    fireEvent.click(footerLink('개인정보처리방침'));
    await screen.findByText('현재 약관을 불러오지 못했어요');
    expect(screen.queryByText('합성 privacy HTTP 문서 본문')).not.toBeInTheDocument();
    expect(termsRequests).toHaveLength(1);
    await topBackTo(settingsPath);
    failTerms = false;
    fireEvent.click(footerLink('개인정보처리방침'));
    await screen.findByText('합성 privacy HTTP 문서 본문');
    expect(termsRequests).toHaveLength(2);
    expect(termsRequests.every((request) => request.searchParams.get('context') === 'footer')).toBe(true);
    expect(writes).toEqual([]);
  });

  it('SSR 첫 footer는 query만 담고 클라이언트 마운트 뒤 hash를 전달한다', () => {
    const { client } = renderAt(richSource);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><AppChrome title="정적 본문" showNotifications={false}><p>정적 본문</p></AppChrome></QueryClientProvider>);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const serverLink = parsed.querySelector<HTMLAnchorElement>('footer a[href*="document=privacy"]');
    const source = new URL(serverLink?.getAttribute('href') ?? '/', window.location.origin).searchParams.get('from');
    expect(source).toBe(richSource.replace('#legal-list', ''));
    expect(new URL(footerLink('개인정보처리방침').href).searchParams.get('from')).toBe(richSource);
  });

  it('실제 searchParams suspension이 정적404 본문과 나머지 셸을 지우지 않는다', () => {
    const { client } = renderAt('/missing');
    navigation.suspendSearch = true;
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><NotFound /></QueryClientProvider>);
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    expect(parsed.querySelector('h1')?.textContent).toBe('페이지를 찾을 수 없어요');
    expect(parsed.querySelector('main a[href="/search"]')?.textContent).toBe('검색으로 찾아보기');
    for (const document of documents) {
      const entry = parsed.querySelector(`footer a[href="/terms?document=${document.key}"]`);
      expect(entry?.textContent).toBe(document.title);
      expect(entry?.getAttribute('data-prefetch')).toBe('false');
    }
    expect(parsed.querySelector('footer a[href="/notices"]')?.textContent).toBe('공지사항');
  });

  it('라우터 경로를 모르면 정적 footer 기본 href를 유지한다', () => {
    navigation.missingPathname = true;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    // AppShellFrame은 경로가 없으면 children만 통과시킨다. 경로 없는 Chrome 자체의 계약을 본다.
    render(<QueryClientProvider client={client}><AppChrome title="정적 본문" showNotifications={false}><p>정적 본문</p></AppChrome></QueryClientProvider>);
    for (const document of documents) expect(footerLink(document.title)).toHaveAttribute('href', `/terms?document=${document.key}`);
    expect(footerLink('공지사항')).toHaveAttribute('href', '/notices');
  });
});
