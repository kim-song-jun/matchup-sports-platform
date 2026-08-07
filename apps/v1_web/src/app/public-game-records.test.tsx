import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { fetchPublicV1 } from '@/lib/seo';
import {
  formatScoreline,
  presentParticipantName,
  resultStateLabel,
  teamRecordResultLabel,
  userRecordResultLabel,
  WITHHELD_IDENTITY_LABEL,
} from '@/components/public-game-records/format';
import { MatchDetailContent } from '@/components/public-game-records/match-detail-content';
import { ScheduleContent } from '@/components/public-game-records/schedule-content';
import { TeamRecordsContent } from '@/components/public-game-records/team-records-content';
import { UserRecordsContent } from '@/components/public-game-records/user-records-content';
import type {
  PublicMatchDetail,
  PublicTeamRecordsResponse,
  PublicTournamentScheduleResponse,
  PublicUserRecordsResponse,
} from '@/components/public-game-records/types';
import TournamentSchedulePage from './tournaments/[id]/schedule/page';
import TournamentMatchPage from './tournaments/[id]/matches/[fixtureId]/page';
import TeamRecordsPage from './teams/[id]/records/page';
import UserRecordsPage from './users/[id]/records/page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('@/lib/seo', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/seo')>();
  return {
    ...original,
    fetchPublicV1: vi.fn(),
  };
});

vi.mock('./tournaments/[id]/schedule/schedule-page-client', () => ({
  SchedulePageClient: () => null,
}));
vi.mock('./tournaments/[id]/matches/[fixtureId]/match-page-client', () => ({
  MatchPageClient: () => null,
}));
vi.mock('./teams/[id]/records/team-records-page-client', () => ({
  TeamRecordsPageClient: () => null,
}));
vi.mock('./users/[id]/records/user-records-page-client', () => ({
  UserRecordsPageClient: () => null,
}));

const MISSING_ID = '00000000-0000-4000-8000-ffffffffffff';

/* ── 순수 함수: format.ts ── */

describe('presentParticipantName', () => {
  it('동의 철회/미동의로 서버가 null을 내려주면 고정된 익명 라벨을 보여준다 (실명을 암시하지 않음)', () => {
    expect(presentParticipantName(null)).toBe(WITHHELD_IDENTITY_LABEL);
  });

  it('닉네임 스냅샷이 있으면 그대로 보여준다', () => {
    expect(presentParticipantName('홍길동')).toBe('홍길동');
  });
});

describe('resultStateLabel / formatScoreline', () => {
  it('void/corrected 상태는 서로 다른 라벨을 갖는다 (같은 라벨로 뭉개지지 않음)', () => {
    expect(resultStateLabel('void')).not.toBe(resultStateLabel('corrected'));
    expect(resultStateLabel('official')).not.toBe(resultStateLabel('pending'));
  });

  it('scoreStatus가 unavailable이면 score가 있어도 숫자를 절대 보여주지 않는다', () => {
    expect(formatScoreline({ home: 3, away: 1 }, 'unavailable')).toBe('- : -');
  });

  it('official 스코어는 그대로 숫자로 렌더한다', () => {
    expect(formatScoreline({ home: 2, away: 0 }, 'official')).toBe('2 : 0');
  });
});

describe('teamRecordResultLabel / userRecordResultLabel', () => {
  it('팀 전적 결과 코드를 한국어로 매핑한다', () => {
    expect(teamRecordResultLabel('WON')).toBe('승');
    expect(teamRecordResultLabel('LOST')).toBe('패');
    expect(teamRecordResultLabel('DRAWN')).toBe('무');
  });

  it('개인 기록 result가 null이면(스코어 미해결) 대시로 떨어진다', () => {
    expect(userRecordResultLabel(null)).toBe('-');
    expect(userRecordResultLabel('WON')).toBe('승');
  });
});

/* ── 컴포넌트: consent-withheld identity 렌더링 ── */

function makeMatch(overrides: Partial<PublicMatchDetail> = {}): PublicMatchDetail {
  return {
    tournamentId: 'tournament-1',
    tournamentTitle: '테스트 대회',
    fixtureId: 'fixture-1',
    gameId: 'game-1',
    round: '결승',
    fixtureNumber: 1,
    legNumber: 1,
    groupId: null,
    groupName: null,
    scheduledAt: '2026-08-10T09:00:00.000Z',
    venue: null,
    fieldName: null,
    home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '서울 유나이티드' },
    away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '부산 FC' },
    visibilityMode: 'official_only',
    status: 'ended',
    resultState: 'official',
    scoreStatus: 'official',
    score: { home: 2, away: 1 },
    lineup: {
      home: [{ participantId: 'p-1', displayName: null, jerseyNumber: 7, position: 'FW' }],
      away: [{ participantId: 'p-2', displayName: '이몽룡', jerseyNumber: 10, position: 'MF' }],
    },
    events: [],
    mvp: null,
    pendingProjection: false,
    history: [],
    videos: [],
    nextMatch: null,
    ...overrides,
  };
}

describe('MatchDetailContent — 동의 게이트된 신원 표시', () => {
  it('displayName이 null인 라인업 슬롯은 실명을 암시하지 않는 고정 익명 라벨로 렌더한다', () => {
    render(<MatchDetailContent data={makeMatch()} />);
    expect(screen.getByText(WITHHELD_IDENTITY_LABEL)).toBeInTheDocument();
  });

  it('동의가 있는 참가자는 실제 닉네임 스냅샷을 그대로 보여준다', () => {
    render(<MatchDetailContent data={makeMatch()} />);
    expect(screen.getByText('이몽룡')).toBeInTheDocument();
  });

  it('MVP도 동일한 규칙을 따른다 -- displayName null이면 익명 라벨', () => {
    render(
      <MatchDetailContent
        data={makeMatch({ mvp: { participantId: 'p-1', displayName: null } })}
      />,
    );
    // 라인업(p-1)과 MVP 카드 두 곳 모두 익명 라벨이 노출된다
    expect(screen.getAllByText(WITHHELD_IDENTITY_LABEL).length).toBeGreaterThanOrEqual(2);
  });
});

describe('MatchDetailContent — 정정/무효 상태 표시', () => {
  it('void 상태는 무효 처리 배지를 보여준다', () => {
    render(<MatchDetailContent data={makeMatch({ resultState: 'void' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('무효 처리');
  });

  it('corrected 상태는 정정된 결과 배지를 보여준다', () => {
    render(<MatchDetailContent data={makeMatch({ resultState: 'corrected' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('정정된 결과');
  });

  it('official/pending 상태는 배지를 렌더하지 않는다', () => {
    render(<MatchDetailContent data={makeMatch({ resultState: 'official' })} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('정정 이력(history)의 정정 여부(isCorrection)에 따라 라벨이 갈린다', () => {
    render(
      <MatchDetailContent
        data={makeMatch({
          history: [
            { revision: 1, state: 'OFFICIAL', officialAt: '2026-08-10T11:00:00.000Z', reason: null, isCorrection: false },
            { revision: 2, state: 'OFFICIAL', officialAt: '2026-08-11T11:00:00.000Z', reason: '오심 정정', isCorrection: true },
          ],
        })}
      />,
    );
    expect(screen.getByText('확정 · 1차')).toBeInTheDocument();
    expect(screen.getByText('정정 · 2차')).toBeInTheDocument();
    expect(screen.getByText('오심 정정')).toBeInTheDocument();
  });
});

/* ── 컴포넌트: 팀/개인 기록의 정정 표시 ── */

function makeTeamRecords(overrides: Partial<PublicTeamRecordsResponse> = {}): PublicTeamRecordsResponse {
  return {
    teamId: 'team-1',
    teamName: '서울 유나이티드',
    summary: { played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1 },
    items: [
      {
        gameId: 'game-1',
        teamMatchId: null,
        tournamentId: 'tournament-1',
        tournamentTitle: '테스트 대회',
        opponentTeamId: 'team-away',
        opponentTeamName: '부산 FC',
        result: 'WON',
        goalsFor: 2,
        goalsAgainst: 1,
        officialAt: '2026-08-10T11:00:00.000Z',
        isCorrected: true,
      },
    ],
    nextCursor: null,
    ...overrides,
  };
}

describe('TeamRecordsContent — 정정 배지', () => {
  it('isCorrected=true인 행은 정정됨 배지를 보여준다', () => {
    render(<TeamRecordsContent data={makeTeamRecords()} />);
    expect(screen.getByText('정정됨')).toBeInTheDocument();
  });

  it('isCorrected=false인 행은 정정됨 배지를 보여주지 않는다', () => {
    const data = makeTeamRecords();
    render(
      <TeamRecordsContent
        data={{ ...data, items: [{ ...data.items[0], isCorrected: false }] }}
      />,
    );
    expect(screen.queryByText('정정됨')).not.toBeInTheDocument();
  });
});

function makeUserRecords(overrides: Partial<PublicUserRecordsResponse> = {}): PublicUserRecordsResponse {
  return {
    userId: 'user-1',
    nickname: '홍길동',
    summary: { appearances: 1, goals: 1, yellowCards: 0, redCards: 0, mvpCount: 1 },
    items: [
      {
        id: 'result-1',
        gameId: 'game-1',
        matchType: 'tournament',
        tournamentId: 'tournament-1',
        tournamentTitle: '테스트 대회',
        round: '결승',
        teamId: 'team-1',
        teamName: '서울 유나이티드',
        opponentTeamId: 'team-away',
        opponentTeamName: '부산 FC',
        result: 'WON',
        goals: 1,
        cards: { yellow: 0, red: 0 },
        minutesPlayed: 90,
        started: true,
        goalkeeper: false,
        mvp: true,
        isCorrected: false,
        officialAt: '2026-08-10T11:00:00.000Z',
      },
    ],
    nextCursor: null,
    ...overrides,
  };
}

describe('UserRecordsContent — 정정 배지', () => {
  it('isCorrected=true인 행은 정정됨 배지를 보여준다', () => {
    const data = makeUserRecords();
    render(
      <UserRecordsContent
        data={{ ...data, items: [{ ...data.items[0], isCorrected: true }] }}
      />,
    );
    expect(screen.getByText('정정됨')).toBeInTheDocument();
  });
});

/* ── 컴포넌트: 대회 일정의 hidden/void/corrected 배지 ── */

function makeSchedule(overrides: Partial<PublicTournamentScheduleResponse> = {}): PublicTournamentScheduleResponse {
  return {
    tournamentId: 'tournament-1',
    tournamentTitle: '테스트 대회',
    bracketPublished: true,
    items: [
      {
        fixtureId: 'fixture-1',
        round: '결승',
        fixtureNumber: 1,
        legNumber: 1,
        groupId: null,
        groupName: null,
        scheduledAt: '2026-08-10T09:00:00.000Z',
        venue: null,
        fieldName: null,
        home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '서울 유나이티드' },
        away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '부산 FC' },
        visibilityMode: 'official_only',
        status: 'ended',
        resultState: 'void',
        scoreStatus: 'unavailable',
        score: null,
        hasVideo: false,
      },
    ],
    unscheduled: [],
    standings: [],
    nextCursor: null,
    ...overrides,
  };
}

describe('ScheduleContent — hidden 픽스처는 목록 자체에 나타나지 않는다', () => {
  it('서버가 애초에 hidden 픽스처를 items에서 제외하므로, 여기 있는 항목은 전부 결과 상태 배지를 안전하게 보여줄 수 있다', () => {
    render(<ScheduleContent tournamentId="tournament-1" data={makeSchedule()} />);
    // void 상태 픽스처는 무효 처리 배지 + 스코어 비공개("- : -")를 함께 보여준다
    expect(screen.getByText('무효 처리')).toBeInTheDocument();
    expect(screen.getByText('- : -')).toBeInTheDocument();
  });

  it('대진표가 아직 공개되지 않았으면 목록 대신 안내 문구를 보여준다', () => {
    render(<ScheduleContent tournamentId="tournament-1" data={makeSchedule({ bracketPublished: false, items: [] })} />);
    expect(screen.getByText('대진표가 아직 공개되지 않았어요')).toBeInTheDocument();
    expect(screen.queryByText('무효 처리')).not.toBeInTheDocument();
  });
});

describe('ScheduleContent — 경기 일정에 시각과 구장을 함께 보여준다 (D-12)', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Seoul';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it('scheduledAt은 M/D (요일) HH:MM 형식으로, venue·fieldName은 별도 줄로 보여준다', () => {
    const data = makeSchedule({
      items: [
        {
          fixtureId: 'fixture-2',
          round: '조별 A',
          fixtureNumber: 1,
          legNumber: 1,
          groupId: 'group-a',
          groupName: '조별 A',
          scheduledAt: '2026-08-07T11:00:00.000Z',
          venue: '잠실종합운동장',
          fieldName: 'A구장',
          home: { registrationId: 'reg-home', teamId: 'team-home', teamName: '서울 유나이티드' },
          away: { registrationId: 'reg-away', teamId: 'team-away', teamName: '부산 FC' },
          visibilityMode: 'official_only',
          status: 'scheduled',
          resultState: 'pending',
          scoreStatus: 'unavailable',
          score: null,
          hasVideo: false,
        },
      ],
    });
    render(<ScheduleContent tournamentId="tournament-1" data={data} />);
    expect(screen.getByText('8/7 (금) 20:00')).toBeInTheDocument();
    expect(screen.getByText('잠실종합운동장 (A구장)')).toBeInTheDocument();
  });

  it('venue·fieldName이 모두 없으면 null/undefined 문자열을 노출하지 않는다', () => {
    // 기본 factory 항목(makeSchedule())은 venue: null, fieldName: null 이다.
    render(<ScheduleContent tournamentId="tournament-1" data={makeSchedule()} />);
    expect(screen.queryByText(/null|undefined/i)).not.toBeInTheDocument();
  });
});

/* ── page.tsx: hidden/존재하지 않는 픽스처는 실제 존재하지 않는 것과 동일한 404 ──
 * 백엔드는 hidden 픽스처·미발행 대진표·존재하지 않는 tournament/fixture를 전부
 * 같은 404(`TOURNAMENT_MATCH_NOT_FOUND`)로 응답한다(`fetchPublicV1` -> null).
 * 프론트는 그 null을 `notFound()` 호출로 이어가야 하며, 이 게이트가 사라지면
 * 아래 각 테스트는 실패한다.
 */

describe('공개 서브라우트의 404 게이트', () => {
  it('대회 일정: tournament를 찾을 수 없으면 진짜 404', async () => {
    vi.mocked(fetchPublicV1).mockResolvedValue(null);
    await expect(
      TournamentSchedulePage({ params: Promise.resolve({ id: MISSING_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('경기 상세: hidden 픽스처와 존재하지 않는 픽스처가 동일한 404로 처리된다', async () => {
    vi.mocked(fetchPublicV1).mockResolvedValue(null);
    await expect(
      TournamentMatchPage({ params: Promise.resolve({ id: MISSING_ID, fixtureId: 'fixture-x' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('팀 전적: team을 찾을 수 없으면 진짜 404', async () => {
    vi.mocked(fetchPublicV1).mockResolvedValue(null);
    await expect(
      TeamRecordsPage({ params: Promise.resolve({ id: MISSING_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('개인 활동 기록: user를 찾을 수 없으면 진짜 404', async () => {
    vi.mocked(fetchPublicV1).mockResolvedValue(null);
    await expect(
      UserRecordsPage({ params: Promise.resolve({ id: MISSING_ID }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
