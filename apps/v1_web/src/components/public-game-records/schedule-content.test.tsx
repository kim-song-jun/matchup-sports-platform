import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScheduleContent } from './schedule-content';
import type { PublicTournamentScheduleResponse } from './types';

/**
 * 대회 일정 화면의 조별 순위표에서 팀명을 누르면 그 팀의 공개 전적
 * (/teams/:id/records)으로 이동해야 한다 — 오너 요청의 핵심 리그레션 지점.
 * 이전엔 <span> plain text였다.
 */
function makeData(overrides: Partial<PublicTournamentScheduleResponse> = {}): PublicTournamentScheduleResponse {
  return {
    tournamentId: 'tour-1',
    tournamentTitle: '테스트 대회',
    bracketPublished: true,
    items: [],
    unscheduled: [],
    standings: [],
    nextCursor: null,
    ...overrides,
  };
}

describe('ScheduleContent — 순위표 팀 링크', () => {
  it('순위표의 팀명을 누르면 /teams/:teamId/records 로 이동한다', () => {
    const data = makeData({
      standings: [
        {
          groupId: 'group-a',
          groupName: 'A조',
          registrationId: 'reg-77',
          teamId: 'team-77',
          teamName: '망원 FC',
          teamLogoUrl: '/uploads/team-77-logo.png',
          position: 1,
          points: 6,
          wins: 2,
          draws: 0,
          losses: 0,
          goalsFor: 5,
          goalsAgainst: 1,
        },
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const link = screen.getByRole('link', { name: /망원 FC/ });
    expect(link).toHaveAttribute('href', '/teams/team-77/records');
  });

  /**
   * 회귀 방지: toStandingsRows 어댑터가 teamLogoUrl을 누락하면 실제 로고가
   * 있는 팀도 항상 identicon(<img> 없음)으로만 렌더된다 — 순위·대진표 탭
   * (bracket-page-client.tsx)과 시각적으로 어긋나는 버그였다.
   */
  it('팀에 등록된 로고가 있으면 순위표 아바타가 identicon 대신 실제 로고 이미지를 렌더한다', () => {
    const data = makeData({
      standings: [
        {
          groupId: 'group-a',
          groupName: 'A조',
          registrationId: 'reg-77',
          teamId: 'team-77',
          teamName: '망원 FC',
          teamLogoUrl: '/uploads/team-77-logo.png',
          position: 1,
          points: 6,
          wins: 2,
          draws: 0,
          losses: 0,
          goalsFor: 5,
          goalsAgainst: 1,
        },
      ],
    });

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const logoImg = screen.getByRole('link', { name: /망원 FC/ }).closest('tr')?.querySelector('img');
    expect(logoImg).not.toBeNull();
    expect(logoImg).toHaveAttribute('src', expect.stringContaining('team-77-logo.png'));
  });

  it('경기 일정이 없으면 안내 문구가 뜨고 오류처럼 보이지 않는다', () => {
    render(<ScheduleContent tournamentId="tour-1" data={makeData()} />);

    expect(screen.getByText('아직 확정된 일정이 없어요')).toBeInTheDocument();
  });
});

/**
 * alpha "452′" 실측 사고(2026-08) 회귀 방지. DB 실측값 그대로 재현한다:
 * `v1_game_events.clock_ms` GOAL 27,166,083ms(≈452분, 20분 피리어드 경기)
 * -- 공개 일정 화면(이 컴포넌트)에 `452′`가 경고 표식 없이 그대로 나갔던
 * 화면이다. 숫자 자체는 조작·은폐하지 않고(그대로 `452′`가 보여야 한다)
 * 경고 표식만 추가로 붙어야 한다.
 */
function fixtureEntry(overrides: Partial<import('./types').PublicScheduleEntry> = {}): import('./types').PublicScheduleEntry {
  return {
    fixtureId: 'fixture-1',
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
    score: { home: 1, away: 0, penalties: null },
    clock: null,
    scorers: [],
    hasVideo: false,
    ...overrides,
  };
}

describe('ScheduleContent — 이상 클럭 경고 표식(alpha 452′ 사고)', () => {
  it('득점자의 clockMs가 이상값이면 분 표시는 그대로 두고 경고 표식을 붙인다', () => {
    const data = { ...makeData(), items: [fixtureEntry({
      scorers: [{ side: 'home', participantName: '김선수', jerseyNumber: 9, clockMs: 27_166_083 }],
    })] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    // 숫자 자체(452′)는 조작·은폐되지 않고 그대로 보인다.
    expect(screen.getByText(/452′/)).toBeInTheDocument();
    // 그 옆에 경고 표식이 붙는다.
    expect(screen.getByLabelText('비정상적으로 긴 경기 시각이에요. 확인이 필요해요.')).toBeInTheDocument();
  });

  it('정상 clockMs 득점자에는 경고 표식이 붙지 않는다', () => {
    const data = { ...makeData(), items: [fixtureEntry({
      scorers: [{ side: 'home', participantName: '김선수', jerseyNumber: 9, clockMs: 649_891 }],
    })] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByText(/10′/)).toBeInTheDocument();
    expect(screen.queryByLabelText('비정상적으로 긴 경기 시각이에요. 확인이 필요해요.')).not.toBeInTheDocument();
  });
});

describe('ScheduleContent — 스코어 아래 승부차기 보조 표기', () => {
  it('승부차기가 있으면 정규시간 스코어는 그대로 두고 아래에 "승부차기 4-3"을 붙인다', () => {
    const data = {
      ...makeData(),
      items: [fixtureEntry({ score: { home: 1, away: 1, penalties: { home: 4, away: 3 } } })],
    };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    // 큰 스코어가 승부차기 숫자로 덮이지 않는다 -- 승부차기는 보조 표기로만 나온다.
    expect(screen.getByText('1 : 1')).toBeInTheDocument();
    expect(screen.getByText('승부차기 4-3')).toBeInTheDocument();
    expect(screen.queryByText('4 : 3')).not.toBeInTheDocument();
  });

  it('승부차기가 없는 경기에는 보조 표기를 아예 렌더하지 않는다', () => {
    const data = { ...makeData(), items: [fixtureEntry({})] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByText('1 : 0')).toBeInTheDocument();
    expect(screen.queryByText(/승부차기/)).not.toBeInTheDocument();
  });
});
