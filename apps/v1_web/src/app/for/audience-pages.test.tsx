/**
 * 대상별 안내(/for/*) 계약. 이 세 페이지는 주최자·팀장이 "팀밋에서 무엇을 약속받는가"를 판단하는 곳이라
 * 틀린 약속(운영 계정·카드 결제·러닝 대회 등)이나 가드와 어긋난 권한 표가 그대로 도입 문의로 이어진다.
 */
import { render, within } from '@testing-library/react';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AUDIENCE_PAGES, type AudienceSlug } from '@/lib/public-content/audiences';
import { faqById } from '@/lib/public-content/faq';
import ForOrganizersPage, { metadata as organizersMetadata } from './organizers/page';
import ForPlayersPage, { metadata as playersMetadata } from './players/page';
import ForTeamsPage, { metadata as teamsMetadata } from './teams/page';

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

const PAGES: Record<AudienceSlug, { Page: () => Promise<ReactElement>; metadata: Metadata }> = {
  players: { Page: ForPlayersPage, metadata: playersMetadata },
  teams: { Page: ForTeamsPage, metadata: teamsMetadata },
  organizers: { Page: ForOrganizersPage, metadata: organizersMetadata },
};

/** alpha 에 없는 약속. 주최자에게는 "대회 스태프 지정"까지만, 가격은 "현재 무료" 한정어로만. */
const FORBIDDEN = ['운영 계정', '어드민 권한', '관리자 권한', '실시간', 'AI 매칭', '무료로 팀', '영업일'];

beforeEach(() => {
  hooks.useV1Settings.mockReturnValue({ data: undefined });
  hooks.useV1UpdateSettings.mockReturnValue({ mutate: vi.fn(), isPending: false });
});

async function renderPage(slug: AudienceSlug) {
  const element = await PAGES[slug].Page();
  return render(<ThemeProvider>{element}</ThemeProvider>);
}

function ldNodes(container: HTMLElement): Record<string, unknown>[] {
  return [...container.querySelectorAll('script[type="application/ld+json"]')].map(
    (node) => JSON.parse(node.textContent ?? '') as Record<string, unknown>,
  );
}

function mainText(container: HTMLElement): string {
  return container.querySelector('main')!.textContent ?? '';
}

describe.each(AUDIENCE_PAGES.map((page) => [page.slug, page] as const))('/for/%s', (slug, page) => {
  it('정적 metadata 의 title·description·canonical 이 이 페이지 것이다', () => {
    const { metadata } = PAGES[slug];
    expect(metadata.title).toBe(page.metaTitle);
    expect(metadata.description).toBe(page.metaDescription);
    expect(metadata.alternates?.canonical).toBe(page.path);
  });

  it('WebPage JSON-LD 는 화면의 H1·리드와 같은 문장이고, FAQPage 는 싣지 않는다', async () => {
    const { container } = await renderPage(slug);
    const h1s = container.querySelectorAll('h1');
    expect(h1s).toHaveLength(1);

    const nodes = ldNodes(container);
    expect(nodes.map((node) => node['@type']).sort()).toEqual(['BreadcrumbList', 'WebPage']);
    const webPage = nodes.find((node) => node['@type'] === 'WebPage')!;
    expect(webPage.name).toBe(h1s[0].textContent);
    const lead = h1s[0].closest('header')!.querySelector('.tm-ps-lead')!;
    expect(webPage.description).toBe(lead.textContent);
    expect(String(webPage.url)).toMatch(new RegExp(`${page.path}$`));
  });

  it('FAQ 는 /faq#id 로만 연결하고, 이 페이지에 같은 id 앵커를 만들지 않는다', async () => {
    const { container } = await renderPage(slug);
    const section = container.querySelector('#faq')!;
    const links = [...section.querySelectorAll<HTMLAnchorElement>('a[href^="/faq#"]')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(page.relatedFaqIds.map((id) => `/faq#${id}`));
    for (const id of page.relatedFaqIds) {
      expect(faqById(id), id).toBeDefined();
      expect(container.querySelector(`[id="${id}"]`), id).toBeNull();
    }
  });

  it('지키지 못할 약속 문구가 화면에 없다', async () => {
    const { container } = await renderPage(slug);
    const text = mainText(container);
    for (const phrase of FORBIDDEN) expect(text, phrase).not.toContain(phrase);
  });

  it('히어로 사실 줄에 근거 없는 숫자가 없다', async () => {
    const { container } = await renderPage(slug);
    const facts = container.querySelector('.tm-ps-aud-facts')!;
    expect(facts.textContent).not.toMatch(/\d/);
  });
});

describe('/for/organizers', () => {
  it('주 CTA 는 문의 페이지의 대회 개설 섹션으로 가고, 대회를 직접 만드는 링크는 없다', async () => {
    const { container } = await renderPage('organizers');
    const intro = container.querySelector('#intro')!;
    const primary = intro.querySelector<HTMLAnchorElement>('.tm-btn-primary')!;
    expect(primary.getAttribute('href')).toBe('/contact#hosting');
    expect(primary.textContent).toBe('도입 문의하기');
    const hrefs = [...container.querySelectorAll('main a')].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => href.startsWith('/admin') || href.startsWith('/tournament-ops'))).toEqual([]);
  });

  it('"아직 지원하지 않는 것" 에 직접 개설·카드 결제·이의 신청이 있다', async () => {
    const { container } = await renderPage('organizers');
    const note = within(container).getByRole('complementary', { name: '아직 지원하지 않는 것' });
    for (const item of ['직접 대회 개설', '카드 결제', '결과 이의 신청']) expect(note.textContent).toContain(item);
  });

  it('대회 종목을 축구·풋살 밖으로 약속하지 않는다', async () => {
    const { container } = await renderPage('organizers');
    expect(mainText(container)).not.toMatch(/러닝|수영/);
    expect(container.querySelector('.tm-ps-aud-facts')!.textContent).toContain('축구·풋살');
  });

  it('주최 측에 약속하는 권한은 대회 스태프 지정까지다', async () => {
    const { container } = await renderPage('organizers');
    const steps = container.querySelector('.tm-ps-aud-steps')!;
    expect(steps.textContent).toContain('대회 스태프로 지정해 드려요');
  });
});

describe('/for/teams', () => {
  function roleRows(container: HTMLElement): Record<string, string[]> {
    const table = container.querySelector('#roles table')!;
    return Object.fromEntries(
      [...table.querySelectorAll('tbody tr')].map((row) => [
        row.querySelector('th')!.textContent!,
        [...row.querySelectorAll('td')].map((td) => td.textContent!),
      ]),
    );
  }

  // 기대값은 teams.service changeMembershipRole/removeMembership(매니저는 member 대상만),
  // assertManagerOrOwner(가입 신청·초대), team-matches assertCanManageTeam, tournament-registrations assertTeamManager 에서 옮겼다.
  it('권한 표가 서버 가드와 같다', async () => {
    const { container } = await renderPage('teams');
    const rows = roleRows(container);
    expect(rows['역할 바꾸기·내보내기']).toEqual(['가능', '멤버만', '불가']);
    expect(rows['팀장 넘기기']).toEqual(['매니저에게만', '불가', '불가']);
    for (const action of ['가입 신청 수락·거절, 초대', '팀 매치 만들기', '대회 참가 신청', '팀 일정 올리기·고치기']) {
      expect(rows[action], action).toEqual(['가능', '가능', '불가']);
    }
    expect(within(container.querySelector('#roles')!).getByText(/최대 5명/)).toBeTruthy();
  });

  it('"무료" 는 항상 "현재 무료" 한정어로만 쓴다', async () => {
    const { container } = await renderPage('teams');
    const text = mainText(container);
    const all = text.match(/무료/g) ?? [];
    const qualified = text.match(/현재 무료/g) ?? [];
    expect(all.length).toBeGreaterThan(0);
    expect(qualified.length).toBe(all.length);
  });

  it('팀 만들기 전제(프로필 필수 항목)를 CTA 옆에 알린다', async () => {
    const { container } = await renderPage('teams');
    const intro = container.querySelector('#intro')!;
    expect(intro.querySelector('.tm-btn-primary')!.getAttribute('href')).toBe('/teams/new');
    expect(intro.textContent).toContain('실명·휴대폰 번호·성별');
  });
});
