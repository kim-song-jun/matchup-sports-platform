import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useV1LeagueMatch, useV1LeagueMatchStandings, useV1ResolveChatRoom, useV1TeamMatch } from '@/hooks/use-v1-api';
import { usePublicLeagueFixtureRecord } from '@/components/public-game-records/use-public-game-records';
import LeagueFixtureDetailClient from './league-fixture-detail-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1LeagueMatch: vi.fn(),
  useV1LeagueMatchStandings: vi.fn(),
  useV1TeamMatch: vi.fn(),
  useV1ResolveChatRoom: vi.fn(),
}));

vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicLeagueFixtureRecord: vi.fn(),
}));

const useV1LeagueMatchMock = vi.mocked(useV1LeagueMatch, { partial: true });
const useV1LeagueMatchStandingsMock = vi.mocked(useV1LeagueMatchStandings, { partial: true });
const useV1TeamMatchMock = vi.mocked(useV1TeamMatch, { partial: true });
const useV1ResolveChatRoomMock = vi.mocked(useV1ResolveChatRoom, { partial: true });
const usePublicLeagueFixtureRecordMock = vi.mocked(usePublicLeagueFixtureRecord, { partial: true });

/** 게임 프로젝션(대회와 동일한 본문) 픽스처 — MatchDetailContent 가 소비하는 필드 전부. */
function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    tournamentId: 'lg-1',
    tournamentTitle: '가을 리그',
    fixtureId: 'fx-1',
    gameId: 'game-1',
    round: 2,
    fixtureNumber: 1,
    legNumber: 1,
    groupId: null,
    groupName: '2주차',
    scheduledAt: '2026-09-12T10:00:00.000Z',
    venue: '검증장',
    fieldName: null,
    home: { registrationId: 't1', teamId: 't1', teamName: '성수 FC' },
    away: { registrationId: 't2', teamId: 't2', teamName: '왕십리 유나이티드' },
    visibilityMode: 'live',
    status: 'ended',
    resultState: 'official',
    scoreStatus: 'official',
    score: { home: 2, away: 1, penalties: null },
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

function mockRecord(state: 'absent' | 'present', overrides: Record<string, unknown> = {}) {
  usePublicLeagueFixtureRecordMock.mockReturnValue(
    state === 'present'
      ? ({ data: makeRecord(overrides), isPending: false, isError: false } as never)
      : ({ data: undefined, isPending: false, isError: true } as never),
  );
}

// 1주차(완료 2:1) → 2주차(이 화면의 대상, 예정) 두 대진을 가진 리그.
// t1 vs t3 대진은 맞대결 필터가 "같은 두 팀"만 세는지 검증하기 위한 미끼다.
const FIXTURES = [
  { teamMatchId: 'fx-0', title: '1주차', homeTeamId: 't2', awayTeamId: 't1', startAt: '2026-09-01T10:00:00.000Z', placeName: '검증장', status: 'completed', homeScore: 2, awayScore: 1 },
  { teamMatchId: 'fx-x', title: '1주차', homeTeamId: 't1', awayTeamId: 't3', startAt: '2026-09-01T12:00:00.000Z', placeName: '검증장', status: 'completed', homeScore: 1, awayScore: 0 },
  { teamMatchId: 'fx-1', title: '2주차', homeTeamId: 't1', awayTeamId: 't2', startAt: '2026-09-08T10:00:00.000Z', placeName: '검증장', status: 'matched', homeScore: null, awayScore: null },
];

function mockLeague(overrides?: { fixtures?: unknown[] }) {
  useV1LeagueMatchMock.mockReturnValue({
    data: {
      leagueId: 'lg-1',
      title: '가을 리그',
      state: 'active',
      startsOn: '2026-09-01T00:00:00.000Z',
      endsOn: '2026-10-20T00:00:00.000Z',
      teamIds: ['t1', 't2', 't3'],
      seriesSiblings: [],
      fixtures: overrides?.fixtures ?? FIXTURES,
    },
    isError: false,
  } as never);
  useV1LeagueMatchStandingsMock.mockReturnValue({
    data: {
      leagueId: 'lg-1',
      tieBreakOrder: ['points'],
      standings: [
        { teamId: 't1', teamName: '성수 FC', teamLogoUrl: null, position: 1, played: 2, wins: 1, draws: 1, losses: 0, goalsFor: 2, goalsAgainst: 1, points: 4 },
        { teamId: 't2', teamName: '왕십리 유나이티드', teamLogoUrl: null, position: 2, played: 1, wins: 1, draws: 0, losses: 0, goalsFor: 2, goalsAgainst: 1, points: 3 },
        { teamId: 't3', teamName: '옥수 FS', teamLogoUrl: null, position: 3, played: 1, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 1, points: 0 },
      ],
      pendingFixtures: [],
    },
  } as never);
}

function mockViewer(state: 'none' | 'approved' | 'host_team', extra: Record<string, boolean> = {}) {
  useV1TeamMatchMock.mockReturnValue({ data: { id: 'fx-1', viewer: { state, ...extra } } } as never);
  useV1ResolveChatRoomMock.mockReturnValue({ mutate: vi.fn(), isPending: false } as never);
  // 기본은 기록 없음(404 폴백) — 기록 임베드 케이스는 각 테스트가 mockRecord('present')로 덮는다.
  mockRecord('absent');
}

describe('LeagueFixtureDetailClient', () => {
  it('예정 경기: 양팀 실명·순위·전적과 "예정"을 보여주고, 리그명은 리그 상세로 링크한다', () => {
    mockLeague();
    mockViewer('none');
    render(<LeagueFixtureDetailClient leagueId="lg-1" fixtureId="fx-1" />);

    expect(screen.getByRole('link', { name: /성수 FC 팀 상세로 이동/ })).toHaveAttribute('href', '/teams/t1');
    expect(screen.getByRole('link', { name: /왕십리 유나이티드 팀 상세로 이동/ })).toHaveAttribute('href', '/teams/t2');
    expect(screen.getByText('1위 · 1승 1무 0패')).toBeInTheDocument();
    expect(screen.getByText('예정')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '가을 리그' })).toHaveAttribute('href', '/league-matches/lg-1');
    // 대진 날짜가 9/1(1주차)·9/8(2주차) 두 날이고 이 경기는 9/8 — 2주차.
    expect(screen.getByText('2주차')).toBeInTheDocument();
    // 관전자에게는 참가팀 통로가 뜨지 않는다.
    expect(screen.queryByText('상대팀과 채팅')).not.toBeInTheDocument();
  });

  it('완료 경기: 스코어를 보여주고 몰수 결과에는 몰수 뱃지를 함께 싣는다', () => {
    mockLeague({
      fixtures: [
        { ...FIXTURES[0], teamMatchId: 'fx-forfeit', homeScore: 1, awayScore: 0, isForfeit: true },
      ],
    });
    mockViewer('none');
    render(<LeagueFixtureDetailClient leagueId="lg-1" fixtureId="fx-forfeit" />);

    expect(screen.getByText('1 : 0')).toBeInTheDocument();
    expect(screen.getByText('몰수')).toBeInTheDocument();
  });

  it('같은 두 팀의 다른 대진만 맞대결 기록으로 싣는다(다른 상대 경기는 제외)', () => {
    mockLeague();
    mockViewer('none');
    render(<LeagueFixtureDetailClient leagueId="lg-1" fixtureId="fx-1" />);

    expect(screen.getByText('이 리그 맞대결')).toBeInTheDocument();
    const h2h = screen.getByRole('link', { name: /2 : 1/ });
    expect(h2h).toHaveAttribute('href', '/league-matches/lg-1/fixtures/fx-0');
    // t1 vs t3 경기(fx-x)는 이 페어의 맞대결이 아니다.
    expect(screen.queryByRole('link', { name: /1 : 0/ })).not.toBeInTheDocument();
  });

  it('참가팀(approved)에게는 채팅·라인업 통로가 뜬다', () => {
    mockLeague();
    mockViewer('approved');
    render(<LeagueFixtureDetailClient leagueId="lg-1" fixtureId="fx-1" />);

    expect(screen.getByRole('button', { name: '상대팀과 채팅' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '라인업 관리' })).toHaveAttribute('href', '/team-matches/fx-1/lineup');
    // 아직 스코어 없는 예정 경기라 결과 링크는 뜨지 않는다.
    expect(screen.queryByText('결과 상세·이의 제기')).not.toBeInTheDocument();
  });

  // alpha 실측(2026-08-25) — 리그 대진 신청서는 운영자가 만들어서 away 팀 팀장의
  // viewerState 는 'approved' 가 아니라 'none' 이다. 결과 승인 게이트 필드로 판정해야
  // 카드가 뜬다. 채팅 개설 권한은 없으므로 채팅 버튼은 숨는다.
  it('away 팀 팀장(manageableOpponentTeam)은 채팅 없이 라인업 통로가 뜬다', () => {
    mockLeague();
    mockViewer('none', { manageableOpponentTeam: true });
    render(<LeagueFixtureDetailClient leagueId="lg-1" fixtureId="fx-1" />);

    expect(screen.getByText('우리 팀 경기')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '라인업 관리' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '상대팀과 채팅' })).not.toBeInTheDocument();
  });

  // 2026-08-25 사용자 지시 — 대회 경기 상세의 UI/UX(득점 기록·영상·라인업 등)가 리그
  // 경기에도 모두 있어야 한다. 기록 API 가 응답하면 대회와 같은 본문을 임베드한다.
  it('기록이 있으면 대회 경기 상세와 같은 본문(주차 헤더·경기 기록 섹션)과 리그 순위·전적 카드가 뜬다', () => {
    mockLeague();
    mockViewer('none');
    mockRecord('present');
    render(<LeagueFixtureDetailClient leagueId="lg-1" fixtureId="fx-1" />);

    // MatchDetailContent 헤더의 주차(칩의 주차 표기는 이때 숨는다 — 중복 방지).
    expect(screen.getAllByText('2주차')).toHaveLength(1);
    expect(screen.getByText('경기 기록')).toBeInTheDocument();
    expect(screen.getByText('기록된 이벤트가 없어요')).toBeInTheDocument();
    // 리그 고유 문맥 — 순위·전적 카드는 기록 본문과 함께 유지된다.
    expect(screen.getByText('리그 순위·전적')).toBeInTheDocument();
    // 폴백 요약 카드는 렌더되지 않는다(같은 정보 중복 방지) — 폴백에만 있는 상태 배지로 판정.
    expect(screen.queryByText('매칭됨')).not.toBeInTheDocument();
  });

  it('기록에 경기 영상이 있으면 대회와 동일한 경기 영상 섹션이 뜬다', () => {
    mockLeague();
    mockViewer('none');
    mockRecord('present', { videos: [{ id: 'v1', title: '전반 하이라이트', url: 'https://www.youtube.com/watch?v=x' }] });
    render(<LeagueFixtureDetailClient leagueId="lg-1" fixtureId="fx-1" />);

    expect(screen.getByText('경기 영상')).toBeInTheDocument();
    expect(screen.getByText('전반 하이라이트')).toBeInTheDocument();
  });

  it('기록 API 가 404 면 자체 요약 카드로 폴백한다(게임 미공개 대진)', () => {
    mockLeague();
    mockViewer('none');
    render(<LeagueFixtureDetailClient leagueId="lg-1" fixtureId="fx-1" />);

    // 폴백 카드의 상태 배지 + 일시·장소가 그대로 살아 있다.
    expect(screen.getByText('매칭됨')).toBeInTheDocument();
    expect(screen.getByText('예정')).toBeInTheDocument();
  });

  it('리그에 없는 경기 id 는 오류 안내와 리그로 돌아가는 링크를 보여준다', () => {
    mockLeague();
    mockViewer('none');
    render(<LeagueFixtureDetailClient leagueId="lg-1" fixtureId="no-such" />);

    expect(screen.getByText(/해당 경기를 찾을 수 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '리그 순위표·일정으로 이동' })).toHaveAttribute('href', '/league-matches/lg-1');
  });
});
