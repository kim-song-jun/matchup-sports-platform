import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

import { MatchDetailContent } from './match-detail-content';
import { PublicTeamFoulsRow } from './public-team-fouls';
import type { PublicMatchDetail, PublicTeamFouls } from './types';

const fouls = (overrides: Partial<PublicTeamFouls> = {}): PublicTeamFouls => ({ periodNumber: 1, threshold: 5, home: 2, away: 5, ...overrides });

function renderRow(teamFouls: PublicTeamFouls, periodCount: number | null = 2) {
  return render(<PublicTeamFoulsRow teamFouls={teamFouls} periodCount={periodCount} homeName="홈팀" awayName="원정팀" />);
}

describe('PublicTeamFoulsRow — 진행 중 경기의 팀 파울 바', () => {
  it('기준 미만이면 "파울 N"을 보여 주고 바 칸은 기준 개수만큼이다', () => {
    renderRow(fouls({ home: 2, away: 0 }));

    expect(screen.getByRole('group', { name: '전반 팀 파울' })).toBeInTheDocument();
    expect(screen.getByText('파울 2')).toBeInTheDocument();
    expect(screen.getByText('파울 0')).toBeInTheDocument();
    const bar = screen.getByRole('img', { name: '홈팀 팀 파울 2개, 기준 5개' });
    expect(bar.children).toHaveLength(5);
    // 채운 칸은 2개, 나머지는 빈 칸이다.
    expect([...bar.children].filter((segment) => segment.className.includes('bg-orange-500'))).toHaveLength(2);
    expect(screen.queryByText('10m 프리킥')).toBeNull();
  });

  it('기준 개수에 이르면 바 전체가 빨강이고 개수 대신 "10m 프리킥" 문구가 나온다', () => {
    renderRow(fouls({ home: 2, away: 5 }));

    const bar = screen.getByRole('img', { name: '원정팀 팀 파울 기준 5개에 이르렀어요. 10m 프리킥' });
    expect([...bar.children].every((segment) => segment.className.includes('bg-red-500'))).toBe(true);
    expect(screen.getByText('10m 프리킥')).toBeInTheDocument();
    expect(screen.queryByText('파울 5')).toBeNull();
  });

  it('기준을 넘어도 색과 문구는 그대로다 — 개수 문구도 나오지 않는다', () => {
    renderRow(fouls({ home: 0, away: 8 }));

    const bar = screen.getByRole('img', { name: /원정팀 팀 파울 기준 5개에 이르렀어요/ });
    expect([...bar.children].every((segment) => segment.className.includes('bg-red-500'))).toBe(true);
    expect(screen.getByText('10m 프리킥')).toBeInTheDocument();
    expect(screen.queryByText('파울 8')).toBeNull();
  });

  it('칸 수는 대회·리그 기준을 따른다', () => {
    renderRow(fouls({ threshold: 3, home: 1, away: 0 }));
    expect(screen.getByRole('img', { name: '홈팀 팀 파울 1개, 기준 3개' }).children).toHaveLength(3);
  });

  it('기준이 11개 이상이면 칸 대신 이어진 바 하나를 채운다', () => {
    renderRow(fouls({ threshold: 15, home: 6, away: 0 }));

    const bar = screen.getByRole('img', { name: '홈팀 팀 파울 6개, 기준 15개' });
    expect(bar.children).toHaveLength(1);
    const fill = within(bar).getAllByText('', { selector: 'span' }).find((element) => element.style.width !== '');
    expect(fill?.style.width).toBe('40%');
  });

  it('피리어드 이름을 붙이고 단판이면 "경기 팀 파울"이라 부른다', () => {
    const { unmount } = renderRow(fouls({ periodNumber: 2 }));
    expect(screen.getByRole('group', { name: '후반 팀 파울' })).toHaveTextContent('후반 팀 파울');
    unmount();

    renderRow(fouls({ periodNumber: 1 }), 1);
    expect(screen.getByRole('group', { name: '경기 팀 파울' })).toBeInTheDocument();
  });
});

function makeLiveDetail(overrides: Partial<PublicMatchDetail> = {}): PublicMatchDetail {
  return {
    tournamentId: 'tour-1',
    tournamentTitle: '테스트 대회',
    fixtureId: 'fixture-1',
    gameId: 'game-1',
    round: '조별리그',
    fixtureNumber: 1,
    legNumber: 1,
    groupId: null,
    groupName: null,
    scheduledAt: '2026-08-01T10:00:00.000Z',
    venue: null,
    fieldName: null,
    home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '홈팀' },
    away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '원정팀' },
    visibilityMode: 'live',
    status: 'live',
    resultState: 'pending',
    scoreStatus: 'live',
    score: { home: 0, away: 0, penalties: null },
    clock: { periodNumber: 1, elapsedMs: 330_000, isPaused: false },
    periodBreak: null,
    periodCount: 2,
    periodMinutes: [20, 20],
    substitutionMode: 'rolling',
    teamFouls: fouls(),
    lineup: null,
    events: [],
    mvp: null,
    outcome: null,
    pendingProjection: false,
    history: [],
    videos: [],
    nextMatch: null,
    ...overrides,
  };
}

describe('MatchDetailContent — 팀 파울 바', () => {
  it('진행 중인 경기에서 서버가 팀 파울을 주면 스코어 카드에 보여 준다', () => {
    render(<MatchDetailContent data={makeLiveDetail()} />);
    expect(screen.getByRole('group', { name: '전반 팀 파울' })).toBeInTheDocument();
  });

  it('끝난 경기·값이 없는 경기·옛 응답에서는 보이지 않는다 — 기록으로 남기지 않는다', () => {
    const cases: Partial<PublicMatchDetail>[] = [
      { status: 'completed', teamFouls: fouls() }, // 응답에 값이 남아 있어도 끝난 경기는 그리지 않는다
      { teamFouls: null },
      { teamFouls: undefined },
    ];
    for (const overrides of cases) {
      const { unmount } = render(<MatchDetailContent data={makeLiveDetail(overrides)} />);
      expect(screen.queryByRole('group', { name: /팀 파울/ })).toBeNull();
      unmount();
    }
  });
});
