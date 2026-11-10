import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-v1-api', () => ({
  useV1PublicKakaoMapsKey: () => ({ data: { kakaoMapsJsKey: null }, isLoading: false }),
}));

import { MatchDetailContent } from './match-detail-content';
import type { PublicMatchDetail, PublicMatchEvent } from './types';

/**
 * MD-QA #187 -- 공개 경기 기록: 기록 시각이 정정된 사건 옆의 "정정" 표시와
 * 결과 변경 이력의 "기록 시각 정정 · 11′ → 9′" 한 줄.
 */
function makeDetail(overrides: Partial<PublicMatchDetail> = {}): PublicMatchDetail {
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
    status: 'ended',
    resultState: 'official',
    scoreStatus: 'official',
    score: { home: 0, away: 0, penalties: null },
    clock: null,
    periodBreak: null,
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

const yellow: PublicMatchEvent = {
  assist: null,
  type: 'CARD',
  cardColor: 'YELLOW',
  sideId: 'side-away',
  side: 'away',
  participantId: 'p-2',
  participantName: '한달',
  jerseyNumber: 2,
  profileHref: null,
  period: 1,
  clockMs: 9 * 60_000,
  timeCorrection: { originalClockMs: 11 * 60_000, correctedAt: '2026-11-10T03:41:00.000Z' },
};

describe('MatchDetailContent -- 기록 시각 정정 표시', () => {
  it('정정된 사건 옆에 "정정" 글자 표식을 붙이고 정정된 시각을 보여준다', () => {
    render(<MatchDetailContent data={makeDetail({ events: [yellow] })} />);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('9′')).toBeInTheDocument();
    expect(within(rows[0]).getByText(/^정정/)).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent('처음 기록은 11′');
  });

  it('정정되지 않은 사건에는 표식이 없다', () => {
    const { timeCorrection: _omitted, ...plain } = yellow;
    void _omitted;
    render(<MatchDetailContent data={makeDetail({ events: [plain, { ...plain, timeCorrection: null }] })} />);

    expect(screen.queryByText(/^정정/)).not.toBeInTheDocument();
    expect(screen.queryByText('결과 변경 이력')).not.toBeInTheDocument();
  });

  it('결과 변경 이력에 "기록 시각 정정 · 옐로카드 한달 11′ → 9′" 줄을 올린다', () => {
    render(<MatchDetailContent data={makeDetail({ events: [yellow] })} />);

    const heading = screen.getByText('결과 변경 이력');
    const section = heading.closest('section') as HTMLElement;
    expect(section).toHaveTextContent('기록 시각 정정');
    expect(section).toHaveTextContent('옐로카드 한달 11′ → 9′');
  });

  it('확정 이력과 함께 있어도 둘 다 보인다', () => {
    render(
      <MatchDetailContent
        data={makeDetail({
          events: [yellow],
          history: [{ revision: 1, state: 'OFFICIAL', officialAt: '2026-11-10T03:00:00.000Z', reason: null, isCorrection: false }],
        })}
      />,
    );

    const section = screen.getByText('결과 변경 이력').closest('section') as HTMLElement;
    expect(section).toHaveTextContent('기록 시각 정정');
    expect(section).toHaveTextContent('확정 · 1차');
  });

  it('status-only 공개에서는 이력 줄을 만들지 않는다', () => {
    render(<MatchDetailContent data={makeDetail({ visibilityMode: 'status_only', events: [yellow] })} />);

    expect(screen.queryByText('기록 시각 정정')).not.toBeInTheDocument();
  });
});
