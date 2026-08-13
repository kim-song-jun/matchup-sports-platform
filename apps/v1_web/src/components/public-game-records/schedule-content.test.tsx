import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ScheduleContent } from './schedule-content';
import type { PublicTournamentScheduleResponse } from './types';

/**
 * `ScheduleContent`는 라인업 CTA 판정을 위해 `useV1MyTeams()`를 직접 호출한다
 * (참가팀 매니저에게만 보이는 힌트 — 실제 인가는 라인업 화면이 다시 검증한다).
 * mock하지 않으면 QueryClientProvider가 없어 모든 테스트가
 * "No QueryClient set"으로 죽는다. 기본값은 `undefined`(비로그인과 동일한
 * 모양) — 이 mock을 건드리지 않는 기존 테스트들은 전부 "라인업 CTA 없음"
 * 시나리오를 그대로 검증하게 된다.
 */
const myTeamsMock = vi.fn();
vi.mock('@/hooks/use-v1-api', () => ({
  useV1MyTeams: () => myTeamsMock(),
}));

beforeEach(() => {
  myTeamsMock.mockReset();
  myTeamsMock.mockReturnValue({ data: undefined });
});

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

/**
 * alpha 실측 정렬 사고(2026-08-13) 회귀 방지. 스코어 행은 `flex 1 / 64px / 1`,
 * 득점자 행은 `grid 1fr 20px 1fr`로 **축을 각자 따로** 들고 있어서, 390px에서
 * 홈 팀명 우단은 153px인데 홈 득점자 우단은 179px이었다(원정도 대칭으로 26px
 * 어긋남) -- 득점자 텍스트가 팀명 축을 벗어나 가운데 스코어 칸 밑으로 파고들었다.
 *
 * 그래서 이 테스트는 특정 열 폭 값을 단언하지 않는다(그건 구현 되읊기다). 두 행이
 * **같은 축을 쓴다는 불변식**만 본다 -- 누가 한쪽 행의 열 정의만 다시 손대면
 * 그 순간 이 테스트가 깨지고, 그게 정확히 사용자가 본 그 버그다.
 */
describe('ScheduleContent — 스코어 행과 득점자 행의 3열 축 일치', () => {
  it('득점자 행이 스코어 행과 완전히 같은 열 정의(축)를 공유한다', () => {
    const data = {
      ...makeData(),
      items: [fixtureEntry({
        scorers: [
          { side: 'home', participantName: '홈선수', jerseyNumber: 7, clockMs: 645_886 },
          { side: 'away', participantName: '원정선수', jerseyNumber: 11, clockMs: 48_263 },
        ],
      })],
    };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const scoreRow = screen.getByText('1 : 0').parentElement;
    const scorerRow = screen.getByRole('list', { name: '득점자' });

    // 축이 실제로 정의돼 있어야 한다 -- 양쪽 모두 빈 문자열이면 위 단언은 공허하게 통과한다.
    expect(scoreRow?.style.gridTemplateColumns).not.toBe('');
    expect(scorerRow.style.gridTemplateColumns).toBe(scoreRow?.style.gridTemplateColumns);
    expect(scorerRow.style.columnGap).toBe(scoreRow?.style.columnGap);
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

/**
 * 트랙 C — 대회 일정 화면에서 우리 팀 경기의 라인업으로 바로 진입.
 *
 * 백엔드는 참가팀의 owner·manager 모두에게 라인업 접근을 허용하지만, 이전엔
 * 진입 CTA가 경기 공개(공개 기록 상세 페이지) 이후에만 렌더돼 URL을 직접
 * 아는 사람만 사전 준비를 할 수 있었다(match-page-client.tsx LineupManagementCta
 * 주석 참고). 이 CTA는 `useV1MyTeams()`가 주는 role만으로 판단하는 **힌트**이고,
 * 실제 인가는 라인업 화면이 `useV1FixtureLineupAccess`로 다시 검증한다.
 */
describe('ScheduleContent — 일정 카드 라인업 CTA', () => {
  it('내가 manager로 속한 팀의 경기에는 라인업 CTA가 보이고 라인업 화면으로 바로 연결된다', () => {
    myTeamsMock.mockReturnValue({
      data: { items: [{ teamId: 'team-home', role: 'manager' }] },
    });
    const data = { ...makeData(), items: [fixtureEntry()] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    const link = screen.getByRole('link', { name: '라인업' });
    expect(link).toHaveAttribute('href', '/tournaments/tour-1/matches/fixture-1/lineup');
  });

  it('내가 owner로 속한 원정팀의 경기에도 라인업 CTA가 보인다', () => {
    myTeamsMock.mockReturnValue({
      data: { items: [{ teamId: 'team-away', role: 'owner' }] },
    });
    const data = { ...makeData(), items: [fixtureEntry()] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.getByRole('link', { name: '라인업' })).toBeInTheDocument();
  });

  it('내가 member(운영진 아님)로만 속한 팀의 경기에는 라인업 CTA가 보이지 않는다', () => {
    myTeamsMock.mockReturnValue({
      data: { items: [{ teamId: 'team-home', role: 'member' }] },
    });
    const data = { ...makeData(), items: [fixtureEntry()] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.queryByRole('link', { name: '라인업' })).not.toBeInTheDocument();
  });

  it('무관한 팀 소속이면 라인업 CTA가 보이지 않는다', () => {
    myTeamsMock.mockReturnValue({
      data: { items: [{ teamId: 'team-unrelated', role: 'owner' }] },
    });
    const data = { ...makeData(), items: [fixtureEntry()] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.queryByRole('link', { name: '라인업' })).not.toBeInTheDocument();
  });

  it('비로그인(내 팀 조회 실패)이면 라인업 CTA가 보이지 않는다', () => {
    myTeamsMock.mockReturnValue({ data: undefined });
    const data = { ...makeData(), items: [fixtureEntry()] };

    render(<ScheduleContent tournamentId="tour-1" data={data} />);

    expect(screen.queryByRole('link', { name: '라인업' })).not.toBeInTheDocument();
  });
});
