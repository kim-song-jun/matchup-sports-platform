/**
 * 도움말 허브. 인기 질문은 제자리에서 펼쳐 보이지만 FAQPage 는 /faq 에만 싣는다.
 * 히어로 검색어는 아래 가이드·질문·용어를 제자리에서 걸러 내고(서버 요청 없음), 결과 개수 한 줄만 role=status 로 알린다.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { FAQ_CATEGORIES, FAQ_ITEMS, faqById } from '@/lib/public-content/faq';
import { GLOSSARY_TERMS } from '@/lib/public-content/glossary';
import { GUIDES } from '@/lib/public-content/guides';
import { HELP_POPULAR_FAQ_IDS, faqSearchEntries, guideSearchEntries, termSearchEntries } from '@/lib/public-site/help-index';
import { matchHelpEntries } from '@/lib/public-site/help-search';
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


const ALL_ENTRIES = [...faqSearchEntries(FAQ_ITEMS), ...guideSearchEntries(GUIDES), ...termSearchEntries(GLOSSARY_TERMS)];
const isShown = (node: Element) => node.closest('[hidden]') === null;
const shownFaqIds = (container: HTMLElement) =>
  [...container.querySelectorAll('#popular details')].filter(isShown).map((node) => node.id);

describe('/help 메타데이터', () => {
  it('제목·설명·canonical 이 /help 를 가리킨다', () => {
    expect(metadata.title).toBe('도움말');
    expect(metadata.description).toContain('이용 가이드 4편');
    expect(metadata.alternates?.canonical).toBe('/help');
  });
});

describe('/help 허브 구성', () => {
  it('h1 은 한 문장으로 읽히고, FAQPage 는 싣지 않는다', async () => {
    const { container } = await renderPage(HelpPage);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^무엇을 도와드릴까요\?$/);
    expect(ldTypes(container)).toEqual(['BreadcrumbList']);
  });

  it('인기 질문은 제자리 펼침으로 답까지 서버 HTML 에 있고, 인기 밖 질문의 답은 싣지 않는다', async () => {
    const { container } = await renderPage(HelpPage);
    expect(shownFaqIds(container)).toEqual([...HELP_POPULAR_FAQ_IDS]);
    for (const id of HELP_POPULAR_FAQ_IDS) {
      const answer = container.querySelector(`#${id} .tm-ps-faq-answer`)?.textContent ?? '';
      expect(answer).toContain(faqById(id)!.answer[0]);
    }
    expect(container.querySelector('#install-app')).toBeNull();
  });

  it('가이드 카드 4편이 각 가이드 주소로 이어진다', async () => {
    await renderPage(HelpPage);
    for (const guide of GUIDES) {
      expect(screen.getByRole('link', { name: guide.title })).toHaveAttribute('href', `/help/guides/${guide.slug}`);
    }
  });

  it('주제 카드가 가리키는 #앵커가 /faq 에 실제로 있다', async () => {
    const hub = await renderPage(HelpPage);
    const nav = screen.getByRole('navigation', { name: '주제별 질문' });
    const hashes = within(nav).getAllByRole('link').map((a) => new URL(a.getAttribute('href')!, 'https://x').hash);
    expect(hashes).toHaveLength(FAQ_CATEGORIES.length);
    hub.unmount();

    const { container } = await renderPage(FaqPage);
    for (const hash of hashes) expect(container.querySelector(hash)).not.toBeNull();
  });

  it('강조 밴드의 문의 창구는 1:1 문의·사업자 정보 이메일·대회 개설 문의 폼으로 이어진다', async () => {
    await renderPage(HelpPage);
    const channels = screen.getByRole('list', { name: '문의 창구 바로가기' });
    expect(within(channels).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/my/inquiries/new',
      'mailto:teameetsports@naver.com',
      '/contact#hosting',
    ]);
    expect(screen.getByRole('link', { name: /문의 창구 보기/ })).toHaveAttribute('href', '/contact');
  });
});

describe('/help 검색 즉시 필터', () => {
  it('검색어를 넣으면 개수를 알리고 가이드·질문·용어를 제자리에서 걸러 낸다', async () => {
    const user = userEvent.setup();
    const { container } = await renderPage(HelpPage);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('');

    // '결과' 는 세 종류 모두에서 일부만 맞는다 — 전부 보이거나 전부 가려지는 쪽으로는 통과하지 못한다
    await user.type(screen.getByLabelText('질문·가이드·용어 검색'), '결과');
    const matched = matchHelpEntries(ALL_ENTRIES, '결과')!;
    expect(status).toHaveTextContent(`검색 결과 ${matched.size}개`);

    // 질문: 인기 목록이 아니라 전체 질문 가운데 맞는 것 — 인기 질문이어도 맞지 않으면 빠진다
    const faqIds = FAQ_ITEMS.filter((item) => matched.has(`faq:${item.id}`)).map((item) => item.id);
    expect(faqIds).toContain('result-correction');
    expect(shownFaqIds(container)).toEqual(faqIds);
    expect(shownFaqIds(container)).not.toContain('how-to-sign-up');

    // 가이드: 맞는 카드만 남는다(가려진 카드는 접근성 트리에서도 빠진다)
    const guideHits = GUIDES.filter((guide) => matched.has(`guide:${guide.slug}`));
    expect(guideHits.length).toBeGreaterThan(0);
    expect(guideHits.length).toBeLessThan(GUIDES.length);
    for (const guide of GUIDES) {
      const link = screen.queryByRole('link', { name: guide.title });
      if (matched.has(`guide:${guide.slug}`)) expect(link).not.toBeNull();
      else expect(link).toBeNull();
    }

    // 용어: 맞는 칩만 남는다
    const termNames = GLOSSARY_TERMS.filter((term) => matched.has(`term:${term.id}`)).map((term) => term.term);
    expect(termNames.length).toBeGreaterThan(0);
    expect(termNames.length).toBeLessThan(GLOSSARY_TERMS.length);
    const chips = screen.getByRole('list', { name: '용어집 바로가기' });
    expect(within(chips).getAllByRole('link').map((a) => a.textContent)).toEqual(termNames);
  });

  it('결과가 없으면 없다고 알리고 목록을 가린 채 문의 창구로 안내하며, 지우면 원래대로 돌아온다', async () => {
    const user = userEvent.setup();
    const { container } = await renderPage(HelpPage);
    const input = screen.getByLabelText('질문·가이드·용어 검색');
    await user.type(input, '없는낱말조합');
    expect(screen.getByRole('status')).toHaveTextContent('찾는 결과가 없어요');
    expect(isShown(container.querySelector('#guides')!)).toBe(false);
    expect(isShown(container.querySelector('#popular')!)).toBe(false);
    expect(screen.getByRole('link', { name: '문의 창구' })).toHaveAttribute('href', '/contact');

    await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('');
    expect(isShown(container.querySelector('#guides')!)).toBe(true);
    expect(shownFaqIds(container)).toEqual([...HELP_POPULAR_FAQ_IDS]);
  });

  it('추천 검색어 버튼은 적힌 글자 그대로 검색한다', async () => {
    const user = userEvent.setup();
    await renderPage(HelpPage);
    await user.click(screen.getByRole('button', { name: '명단' }));
    expect(screen.getByLabelText('질문·가이드·용어 검색')).toHaveValue('명단');
    expect(screen.getByRole('status')).toHaveTextContent(`검색 결과 ${matchHelpEntries(ALL_ENTRIES, '명단')!.size}개`);
  });

  it('띄어 쓴 낱말은 모두 들어 있는 항목만 남기고, 빈 검색어는 거르지 않는다(null)', () => {
    const both = matchHelpEntries(ALL_ENTRIES, '참가비 환불')!;
    const one = matchHelpEntries(ALL_ENTRIES, '환불')!;
    expect(both.size).toBeGreaterThan(0);
    for (const key of both) expect(one.has(key)).toBe(true);
    expect(matchHelpEntries(ALL_ENTRIES, '환불 없는낱말조합')!.size).toBe(0);
    expect(matchHelpEntries(ALL_ENTRIES, '   ')).toBeNull();
  });
});
