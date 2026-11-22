import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/hooks/use-v1-api', () => ({
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

import { MatchDetailContent } from './match-detail-content';
import type { PublicMatchDetail } from './types';

const MIN = 60_000;

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
    clock: { periodNumber: 1, elapsedMs: 5 * MIN + 30_000, isPaused: false },
    periodBreak: null,
    periodCount: 2,
    periodMinutes: [20, 20],
    substitutionMode: 'rolling',
    lineup: null,
    events: [
      {
        type: 'CARD',
        cardColor: 'RED',
        sideId: 'side-home',
        side: 'home',
        participantId: 'p-1',
        participantName: '김선수',
        jerseyNumber: 7,
        profileHref: null,
        assist: null,
        period: 1,
        clockMs: 5 * MIN,
      },
    ],
    mvp: null,
    outcome: null,
    pendingProjection: false,
    history: [],
    videos: [],
    nextMatch: null,
    ...overrides,
  };
}

describe('MatchDetailContent — 퇴장 패널티 줄(진행 중인 롤링 교체 경기)', () => {
  it('풋살처럼 교체를 기록하지 않는 진행 중 경기에서 퇴장이 있으면 LIVE 배지 아래에 패널티를 보여 준다', () => {
    render(<MatchDetailContent data={makeLiveDetail()} />);

    expect(screen.getByRole('timer')).toHaveTextContent(/^패널티 1:\d\d$/);
    expect(screen.getByRole('list', { name: '퇴장 패널티' })).toHaveTextContent('홈팀 · 김선수 퇴장');
  });

  it('축구처럼 교체를 기록하는 경기·종목을 모르는 경기·옛 응답에서는 보이지 않는다', () => {
    for (const substitutionMode of ['limited', null, undefined] as const) {
      const { unmount } = render(<MatchDetailContent data={makeLiveDetail({ substitutionMode })} />);
      expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
      unmount();
    }
  });

  it('경기가 끝났거나 아직 시작 전이면 보이지 않는다', () => {
    for (const status of ['ended', 'scheduled'] as const) {
      const { unmount } = render(<MatchDetailContent data={makeLiveDetail({ status, clock: null })} />);
      expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
      unmount();
    }
  });
});
