/**
 * /terms 의 첫 HTML 계약 — 비-JS 수집기가 받는 서버 HTML 에 약관 본문이 있어야 하고, 가입 동의 단계에는
 * 문서 본문이 끼어들면 안 된다. API 경계(fetch)만 바꾸고 page → TermsClient → React Query 는 실제
 * 코드로 렌더한다(app/tournaments/[id]/detail-first-html.test.tsx 와 같은 방식).
 */
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TermsClient } from '@/components/auth/terms-client';
import { createV1QueryClient } from '@/lib/query-client';
import { stripScriptTags } from '@/test/html-sanitize';
import type { V1CurrentTerms, V1CurrentTermsItem } from '@/types/api';

let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsValue,
  usePathname: () => '/terms',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import TermsPage, { generateMetadata } from './page';

const DOCUMENTS = [
  { key: 'terms', code: 'footer_service_terms', name: '서비스 이용약관', body: '서비스 이용약관 본문 첫 문장이에요.' },
  { key: 'privacy', code: 'privacy_policy', name: '개인정보처리방침', body: '개인정보처리방침 본문 첫 문장이에요.' },
  { key: 'location', code: 'location_terms', name: '위치기반서비스 이용약관', body: '위치기반서비스 본문 첫 문장이에요.' },
  { key: 'tournament-policy', code: 'tournament_policy', name: '대회 운영정책', body: '대회 운영정책 본문 첫 문장이에요.' },
  { key: 'support', code: 'support', name: '고객센터', body: '고객센터 본문 첫 문장이에요.' },
] as const;

function termsItem(code: string, title: string, content: string): V1CurrentTermsItem {
  return {
    policyId: `policy-${code}`, code, documentId: `doc-${code}`, version: 'v1.7', title, subtitle: `${title} 부제`,
    content, changeSummary: null, requirement: 'required', displayOrder: 1, requiresReconsent: false,
    enforcementAt: null, effectiveAt: null, accepted: false, requiresAction: false,
  };
}

function footerTerms(contentSuffix = ''): V1CurrentTerms {
  return {
    context: 'footer', ready: true, compliance: null,
    items: DOCUMENTS.map((doc) => termsItem(doc.code, doc.name, `${doc.body}${contentSuffix}`)),
  };
}

let currentFooter: V1CurrentTerms;
let fetchMock: ReturnType<typeof vi.fn>;

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
}

beforeEach(() => {
  currentFooter = footerTerms();
  searchParamsValue = new URLSearchParams();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock = vi.fn(async (input: string | URL) => {
    const path = String(input).replace(/^.*\/api\/v1/, '');
    if (path === '/terms/current?context=footer') return envelope(currentFooter);
    return new Response('unexpected', { status: 500 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
const containers: HTMLElement[] = [];

// 서버 HTML 을 DOM 에 올린다. 시험이 중간에 실패해도 afterEach 가 치워 다음 시험의 화면과 섞이지 않는다.
function mountServerHtml(html: string): HTMLElement {
  const container = document.createElement('div');
  document.body.append(container);
  container.innerHTML = html;
  containers.push(container);
  return container;
}

afterEach(() => {
  cleanup();
  for (const container of containers.splice(0)) container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function footerFetches() {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes('/terms/current'));
}

async function pageNode(query: string): Promise<ReactNode> {
  searchParamsValue = new URLSearchParams(query);
  return TermsPage({ searchParams: Promise.resolve(Object.fromEntries(searchParamsValue)) });
}

// 실제 앱은 PersistQueryClientProvider 라 서버·첫 렌더에서 isRestoring=true 다(fetch 없음).
function withProviders(node: ReactNode, client: QueryClient) {
  return <QueryClientProvider client={client}><IsRestoringProvider value>{node}</IsRestoringProvider></QueryClientProvider>;
}

async function serverHtml(query: string): Promise<string> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return stripScriptTags(renderToString(withProviders(await pageNode(query), client)));
}

describe('약관 문서 첫 HTML', () => {
  it.each(DOCUMENTS)('$name 본문이 서버 HTML 에 있고 로딩 문구는 없다', async ({ key, name, body }) => {
    const html = await serverHtml(`document=${key}`);

    expect(html).toContain(body);
    expect(html).toContain(`<h1 class="tm-text-heading tm-auth-heading">${name}</h1>`);
    expect(html).not.toContain('약관을 불러오고 있어요');
    // 고른 문서의 본문만 — 다른 문서 본문이 섞이면 문서 선택이 깨진 것이다.
    for (const other of DOCUMENTS.filter((doc) => doc.key !== key)) {
      expect(html).not.toContain(other.body);
    }
  });

  it('법적 문서라 새 판 게시 뒤 옛 판이 나가지 않게 캐시 없이 공개 조회로 받는다', async () => {
    await serverHtml('document=privacy');

    expect(footerFetches()).toHaveLength(1);
    const [input, init] = footerFetches()[0] as [string, RequestInit & { next?: unknown }];
    expect(String(input)).toMatch(/\/api\/v1\/terms\/current\?context=footer$/);
    expect(init.cache).toBe('no-store');
    expect(init.next).toBeUndefined();
    // 로그인 없이 열리는 조회 — 쿠키·인증 헤더를 실어 보내지 않는다.
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(['accept']);
  });

  it('쿼리가 없는 /terms 는 서비스 이용약관 본문을 그린다', async () => {
    const html = await serverHtml('');

    expect(html).toContain(DOCUMENTS[0].body);
    expect(html).not.toContain('약관을 불러오고 있어요');
    expect(footerFetches()).toHaveLength(1);
  });

  it('서버 조회가 실패해도 페이지는 오류 없이 나가고 브라우저가 다시 받도록 로딩 줄을 그린다', async () => {
    fetchMock.mockImplementation(async () => new Response('boom', { status: 500 }));

    const html = await serverHtml('document=privacy');

    expect(html).toContain('약관을 불러오고 있어요.');
    expect(html).not.toContain(DOCUMENTS[1].body);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[terms]'), expect.anything());
  });

  it('조회가 404 여도 오류 없이 나가고 로그를 남긴다', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 404 }));

    const html = await serverHtml('document=privacy');

    expect(html).toContain('약관을 불러오고 있어요.');
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('[terms]'));
  });

  it('문서 이름이 아닌 값에는 공개 조회를 부르지 않는다', async () => {
    await serverHtml('document=nope');

    expect(footerFetches()).toHaveLength(0);
  });
});

describe('가입 동의 단계 첫 HTML', () => {
  it.each(['mode=signup', 'mode=social', 'mode=renewal'])('%s 는 서버에서 약관을 받지 않고 동의 화면 구조를 그대로 그린다', async (query) => {
    const html = await serverHtml(query);

    expect(footerFetches()).toHaveLength(0);
    expect(html).toContain('전체 동의');
    for (const doc of DOCUMENTS) expect(html).not.toContain(doc.body);
  });
});

describe('약관 화면 제목', () => {
  async function titleFor(query: string) {
    const metadata = await generateMetadata({ searchParams: Promise.resolve(Object.fromEntries(new URLSearchParams(query))) });
    return metadata;
  }

  it.each(DOCUMENTS)('document=$key 는 "$name" 을 제목으로 준다', async ({ key, name }) => {
    const metadata = await titleFor(`document=${key}`);

    expect(metadata.title).toBe(name);
    // 검색 제외 화면(next.config 헤더)에는 대표 주소도, 색인 허용 메타도 붙이지 않는다.
    expect(metadata.alternates?.canonical).toBeUndefined();
    expect(metadata.robots).toBeUndefined();
  });

  it('쿼리가 없는 /terms 는 서비스 이용약관 제목을 준다', async () => {
    expect((await titleFor('')).title).toBe('서비스 이용약관');
  });

  it.each(['mode=signup', 'mode=social', 'mode=renewal', 'document=nope'])('%s 는 문서 제목을 붙이지 않는다', async (query) => {
    expect((await titleFor(query)).title).toBeUndefined();
  });
});

describe('브라우저가 이어받는 첫 값', () => {
  it.each([
    ['document=privacy', DOCUMENTS[1].body],
    ['mode=signup', '전체 동의'],
  ])('서버 HTML 을 그대로 하이드레이션한다(%s) — 복원 중 첫 렌더가 서버 값과 같다', async (query, visibleText) => {
    const serverClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = renderToString(withProviders(await pageNode(query), serverClient));
    const container = mountServerHtml(html);
    const serverText = container.textContent;
    const recoverable: unknown[] = [];

    const browserClient = createV1QueryClient();
    await act(async () => {
      hydrateRoot(container, withProviders(await pageNode(query), browserClient), {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });

    expect(recoverable).toEqual([]);
    expect(serverText).toContain(visibleText);
    expect(container.textContent).toBe(serverText);
  });

  it('서버가 방금 받은 값이면 복원이 끝나도 같은 약관을 다시 받지 않는다', async () => {
    // 서버가 만든 노드(props 에 첫 값과 받은 시각이 담김)를 서버 렌더와 브라우저 하이드레이션이 함께 쓴다.
    const node = await pageNode('document=privacy');
    const container = mountServerHtml(renderToString(withProviders(node, new QueryClient())));
    fetchMock.mockClear();

    const browserClient = createV1QueryClient();
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, <QueryClientProvider client={browserClient}><IsRestoringProvider value>{node}</IsRestoringProvider></QueryClientProvider>);
    });
    await act(async () => {
      root.render(<QueryClientProvider client={browserClient}><IsRestoringProvider value={false}>{node}</IsRestoringProvider></QueryClientProvider>);
    });

    expect(footerFetches()).toHaveLength(0);
    expect(container.textContent).toContain(DOCUMENTS[1].body);
  });
});

describe('TermsClient 첫 표시값', () => {
  const STALE_MS = 10 * 60_000;

  function renderClient(fetchedAt: number | null, data = footerTerms('(옛 판)')) {
    searchParamsValue = new URLSearchParams('document=privacy');
    const client = createV1QueryClient();
    render(
      <QueryClientProvider client={client}>
        <TermsClient initialFooterTerms={fetchedAt === null ? undefined : { data, fetchedAt }} />
      </QueryClientProvider>,
    );
  }

  it('첫 표시값이 있으면 로딩 문구 없이 본문이 바로 보인다', () => {
    renderClient(Date.now());

    expect(screen.getByText(`${DOCUMENTS[1].body}(옛 판)`)).toBeTruthy();
    expect(screen.queryByText('약관을 불러오고 있어요.')).toBeNull();
    expect(footerFetches()).toHaveLength(0);
  });

  it('첫 표시값이 없으면 기존처럼 로딩 줄 → 본문 순서로 그린다', async () => {
    renderClient(null);

    expect(screen.getByText('약관을 불러오고 있어요.')).toBeTruthy();
    expect(await screen.findByText(DOCUMENTS[1].body)).toBeTruthy();
    expect(screen.queryByText('약관을 불러오고 있어요.')).toBeNull();
  });

  it('서버가 받은 지 오래된 값이면 브라우저가 다시 받아 새 판으로 바꾼다', async () => {
    renderClient(Date.now() - STALE_MS);

    // 옛 판이 먼저 보이고(첫 표시값) …
    expect(screen.getByText(`${DOCUMENTS[1].body}(옛 판)`)).toBeTruthy();
    // … 새 판 조회가 끝나면 새 판만 남는다.
    await waitFor(() => expect(screen.getByText(DOCUMENTS[1].body)).toBeTruthy());
    expect(screen.queryByText(`${DOCUMENTS[1].body}(옛 판)`)).toBeNull();
    expect(footerFetches()).toHaveLength(1);
  });
});
