/**
 * `matches-ssr-list.test.tsx` 와 같은 계약 — 크롤러가 받는 HTML 에 실제 팀이 들어 있어야 한다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { TeamListSsrView } from './teams-ssr-list';
import type { V1Sport, V1Team } from '@/types/api';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const FUTSAL = {
  id: 'sport-futsal-uuid',
  code: 'futsal',
  name: '풋살',
  levels: [],
} as unknown as V1Sport;

function team(overrides: Partial<V1Team> = {}): V1Team {
  return {
    id: 'team-1',
    teamId: 'team-1',
    name: '강남 유나이티드',
    sportName: '풋살',
    regionName: '서울 강남구',
    memberCount: 12,
    trustState: 'none',
    joinPolicy: 'approval_required',
    ...overrides,
  } as unknown as V1Team;
}

/** 팀 상세 링크만 — `/teams/new` 같은 생성 CTA 는 상세가 아니다. */
function detailHrefs(): string[] {
  return screen
    .queryAllByRole('link')
    .map((link) => link.getAttribute('href') ?? '')
    .filter((href) => href.startsWith('/teams/') && !href.startsWith('/teams/new'));
}

describe('TeamListSsrView', () => {
  it('팀 이름·종목·지역을 서버 렌더 마크업에 담고 상세로 링크한다', () => {
    render(<TeamListSsrView teams={[team()]} />);

    expect(screen.getByText('강남 유나이티드')).toBeInTheDocument();
    expect(screen.getAllByText(/풋살/).length).toBeGreaterThan(0);
    expect(detailHrefs()).toContain('/teams/team-1');
  });

  it('마스터 종목을 받으면 진짜 종목 ID 로 필터 링크를 만든다', () => {
    render(<TeamListSsrView teams={[team()]} sports={[FUTSAL]} />);

    const hrefs = screen.queryAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    expect(hrefs).toContain('/teams?sportId=sport-futsal-uuid');
  });

  it('마스터 종목 목록이 없는 서버 렌더에서 라벨을 sportId 로 쓰지 않는다', () => {
    // fallback 칩의 id 는 '풋살' 같은 라벨이다. 그대로 쿼리에 넣으면 `?sportId=풋살` 이라는
    // 아무 것도 걸리지 않는 URL 이 HTML 에 나가고 크롤러가 그것을 수집한다.
    render(<TeamListSsrView teams={[team()]} />);

    const hrefs = screen.queryAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => href.includes('sportId='))).toEqual([]);
  });

  it('목록이 비어도 목업 팀을 대신 보여주지 않는다', () => {
    render(<TeamListSsrView teams={[]} />);

    expect(screen.queryByText('강남 유나이티드')).not.toBeInTheDocument();
    expect(detailHrefs()).toEqual([]);
  });
});
