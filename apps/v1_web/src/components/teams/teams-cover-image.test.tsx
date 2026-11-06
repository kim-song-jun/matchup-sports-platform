/**
 * 팀 상단 이미지는 CSS 배경이라 next/image 를 거치지 않는다. 원본 업로드(수 MB)가 아니라
 * 히어로 폭에 맞춘 `/_next/image` 주소로 받는지 — 원본을 직접 넣으면 아래 단언이 깨진다.
 */
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TeamDetailPageView, TeamFormPageView } from './teams-page';
import { getTeamDetailViewModel, getTeamFormViewModel } from './teams.view-model';

vi.mock('next/navigation', () => ({
  usePathname: () => '/teams/team-1/edit',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const COVER = '/uploads/2026/11/team-cover.png';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** `url("…")` 를 포함하는 CSS 값에서 첫 최적화 요청의 경로·원본·폭을 읽는다. */
function firstImageRequest(cssValue: string) {
  const quoted = /url\("([^"]+)"\)/.exec(cssValue);
  if (!quoted) throw new Error(`url("…") 가 없어요: ${cssValue}`);
  const url = new URL(quoted[1], 'http://localhost');
  return { pathname: url.pathname, url: url.searchParams.get('url'), w: url.searchParams.get('w') };
}

/**
 * jsdom 은 `background: url(…) center/cover` 단축 속성을 파싱하지 못해 버린다. 서버 렌더 마크업의
 * `style` 속성에는 컴포넌트가 낸 값이 그대로 남으므로 그쪽에서 읽는다.
 */
function renderedStyle(ui: ReactElement, selector: string) {
  const queryClient = new QueryClient();
  const html = renderToStaticMarkup(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.querySelector(selector)?.getAttribute('style') ?? null;
}

describe('팀 상단 이미지', () => {
  it('상세 히어로(모바일·데스크톱 두 카드)가 어두운 그라디언트 아래에서 1200 폭으로 받는다', () => {
    const base = getTeamDetailViewModel('default');
    const { container } = render(<TeamDetailPageView model={{ ...base, team: { ...base.team, coverImageUrl: COVER } }} />);

    const heroes = container.querySelectorAll<HTMLElement>('.tm-team-detail-hero-card');
    expect(heroes).toHaveLength(2);
    for (const hero of heroes) {
      expect(hero.style.backgroundImage).toContain('linear-gradient');
      expect(firstImageRequest(hero.style.backgroundImage)).toEqual({ pathname: '/_next/image', url: COVER, w: '1200' });
    }
  });

  it('사진이 없으면 배경 이미지를 깔지 않는다', () => {
    const { container } = render(<TeamDetailPageView model={getTeamDetailViewModel('default')} />);

    for (const hero of container.querySelectorAll<HTMLElement>('.tm-team-detail-hero-card')) {
      expect(hero.style.backgroundImage).toBe('');
    }
  });

  it('수정 폼의 미리보기도 같은 폭으로 받는다', () => {
    const base = getTeamFormViewModel('edit');
    const style = renderedStyle(<TeamFormPageView model={{ ...base, team: { ...base.team, coverImageUrl: COVER } }} />, '.tm-on-tint[aria-hidden="true"]');

    expect(style).toContain('center/cover');
    expect(firstImageRequest(style!)).toEqual({ pathname: '/_next/image', url: COVER, w: '1200' });
  });
});
