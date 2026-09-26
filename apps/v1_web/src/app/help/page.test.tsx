/**
 * 도움말 허브. 답의 원출처는 /faq 한 곳이라 허브는 FAQPage 를 다시 싣지 않고 질문 링크만 건다.
 * 검색은 받은 색인 위의 클라이언트 필터이고, 결과 개수 한 줄만 role=status 로 알린다.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { FAQ_CATEGORIES, faqById } from '@/lib/public-content/faq';
import { GUIDES } from '@/lib/public-content/guides';
import { HELP_POPULAR_FAQ_IDS, buildHelpSearchIndex } from '@/lib/public-site/help-index';
import { searchHelpIndex } from '@/lib/public-site/help-search';
import FaqPage from '../faq/page';
import HelpPage, { metadata } from './page';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const hooks = vi.hoisted(() => ({ useV1Settings: vi.fn(), useV1UpdateSettings: vi.fn() }));
vi.mock('@/hooks/use-v1-api', () => hooks);
vi.mock('@/lib/session-storage', () => ({ hasStoredV1Session: () => false }));
vi.mock('@/lib/public-site/site-info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/public-site/site-info')>();
  return { ...actual, fetchPublicSiteInfo: vi.fn(async () => actual.normalizeSiteInfo(null)) };
});

beforeEach(() => {
  hooks.useV1Settings.mockReturnValue({ data: undefined });
  hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

async function renderPage(page: () => Promise<React.ReactElement>) {
  const ui = await page();
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function ldTypes(container: HTMLElement): unknown[] {
  return [...container.querySelectorAll('script[type="application/ld+json"]')]
    .map((node) => (JSON.parse(node.textContent ?? '{}') as Record<string, unknown>)['@type']);
}

describe('/help 메타데이터', () => {
  it('제목·설명·canonical 이 /help 를 가리킨다', () => {
    expect(metadata.title).toBe('도움말');
    expect(metadata.description).toContain('이용 가이드 4편');
    expect(metadata.alternates?.canonical).toBe('/help');
  });
});

describe('/help 허브 구성', () => {
  it('FAQPage 를 싣지 않고, 인기 질문은 답 없이 /faq#id 링크로만 보인다', async () => {
    const { container } = await renderPage(HelpPage);
    expect(ldTypes(container)).toEqual(['BreadcrumbList']);

    const list = screen.getByRole('list', { name: '자주 찾는 질문' });
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(HELP_POPULAR_FAQ_IDS.map((id) => `/faq#${id}`));
    expect([...list.querySelectorAll('li')].map((li) => li.textContent)).toEqual(
      HELP_POPULAR_FAQ_IDS.map((id) => faqById(id)!.question),
    );
  });

  it('가이드 카드 4편이 각 가이드 주소로 이어진다', async () => {
    await renderPage(HelpPage);
    for (const guide of GUIDES) {
      expect(screen.getByRole('link', { name: guide.title })).toHaveAttribute('href', `/help/guides/${guide.slug}`);
    }
  });

  it('주제 칩이 가리키는 #앵커가 /faq 에 실제로 있다', async () => {
    const hub = await renderPage(HelpPage);
    const nav = screen.getByRole('navigation', { name: '주제별 질문' });
    const hashes = within(nav).getAllByRole('link').map((a) => new URL(a.getAttribute('href')!, 'https://x').hash);
    expect(hashes).toHaveLength(FAQ_CATEGORIES.length);
    hub.unmount();

    const { container } = await renderPage(FaqPage);
    for (const hash of hashes) expect(container.querySelector(hash)).not.toBeNull();
  });
});

describe('/help 검색', () => {
  it('검색어를 넣으면 결과 개수를 status 로 알리고 해당 질문으로 가는 링크를 보인다', async () => {
    const user = userEvent.setup();
    await renderPage(HelpPage);
    const input = screen.getByLabelText('질문·가이드·용어 검색');
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');

    await user.type(input, '환불');
    const expected = searchHelpIndex(buildHelpSearchIndex(), '환불');
    expect(expected.length).toBeGreaterThan(0);
    expect(status).toHaveTextContent(`검색 결과 ${expected.length}개`);
    const results = screen.getByRole('list', { name: '검색 결과' });
    expect(within(results).getAllByRole('link').map((a) => a.getAttribute('href'))).toContain('/faq#entry-fee-refund');
  });

  it('결과가 없으면 없다고 알리고 문의 창구로 안내하며, 지우기는 입력으로 포커스를 돌려준다', async () => {
    const user = userEvent.setup();
    await renderPage(HelpPage);
    const input = screen.getByLabelText('질문·가이드·용어 검색');
    await user.type(input, '없는낱말조합');
    expect(screen.getByRole('status')).toHaveTextContent('찾는 결과가 없어요');
    expect(screen.queryByRole('list', { name: '검색 결과' })).toBeNull();
    expect(screen.getByRole('link', { name: '문의 창구' })).toHaveAttribute('href', '/contact');

    await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('추천 검색어 버튼은 적힌 글자 그대로 검색한다', async () => {
    const user = userEvent.setup();
    await renderPage(HelpPage);
    await user.click(screen.getByRole('button', { name: '명단' }));
    expect(screen.getByLabelText('질문·가이드·용어 검색')).toHaveValue('명단');
  });

  it('띄어 쓴 낱말은 모두 들어 있는 항목만 남긴다', () => {
    const index = buildHelpSearchIndex();
    const both = searchHelpIndex(index, '참가비 환불');
    expect(both.length).toBeGreaterThan(0);
    expect(both.length).toBeLessThanOrEqual(searchHelpIndex(index, '환불').length);
    expect(searchHelpIndex(index, '환불 없는낱말조합')).toEqual([]);
    expect(searchHelpIndex(index, '   ')).toEqual([]);
  });
});
