import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { LineupTodoService } from './lineup-todo.service';

/**
 * 팀장이 라인업을 짜러 들어오는 유일한 입구(`GET /me/lineup-todos`)가 **어느 경기의
 * 라인업인지**를 말해주는지 못박는다.
 *
 * 배경: 리그 대진은 제목이 '팀 매치'로 고정돼 있어서, 여러 리그를 동시에 뛰는 팀장은
 * 목록만 보고는 어느 리그 몇 주차 경기인지 구분할 수 없었다. 친선 팀매치는 리그 맥락이
 * 없으므로 예전 그대로여야 한다(회귀 금지).
 *
 * 주차는 대진 제목에 박제된 값이 아니라 `startAt`에서 파생한다 — 운영자가 대진을
 * 재일정하면 박제된 제목은 그대로 남기 때문에, 그 값을 그대로 쓰면 같은 경기를 공개
 * 경기기록(`resolveLeagueWeekNumber`)·어드민 영상 화면과 다른 주차로 부르게 된다.
 */

const userId = 'user-1';
const teamId = 'team-home';
const opponentTeamId = 'team-away';
const leagueId = 'league-1';

/** KST 기준 경기일이 서로 다른 세 날짜(UTC 10:00 = KST 19:00이라 날짜가 밀리지 않는다). */
const WEEK1_KICKOFF = new Date('2026-09-05T10:00:00.000Z');
const RESCHEDULED_KICKOFF = new Date('2026-09-08T10:00:00.000Z');
const WEEK3_KICKOFF = new Date('2026-09-12T10:00:00.000Z');

/**
 * 재일정된 리그 대진 하나 + 친선 팀매치 하나를 할 일로 돌려주는 가짜 DB.
 *
 * 리그에는 KST 9/5·9/8·9/12 세 경기일이 있고, 할 일에 오른 대진은 원래 3주차(9/19)였다가
 * 9/8로 당겨진 경기다 — 제목에는 '3주차'가 박제돼 있지만 실제 순번은 2주차다.
 */
function buildPrismaMock(lineupRows: Array<{ sideId: string; state: string }> = []) {
  const teamMatchRows = [
    {
      id: 'match-league',
      // 대진 생성기(league-match-admin.service.ts)가 박아 넣은 뒤 재일정에서 갱신되지 않는 제목.
      title: '가을 정규 리그 3주차',
      startAt: RESCHEDULED_KICKOFF,
      hostTeamId: teamId,
      hostTeam: { name: '성수 FC' },
      approvedApplicantTeamId: opponentTeamId,
      approvedApplicantTeam: { name: '망원 FC' },
      leagueId,
      league: { title: '가을 정규 리그' },
      game: { id: 'game-league' },
    },
    {
      id: 'match-friendly',
      title: '주말에 한 판 하실 팀 구해요',
      startAt: new Date('2026-09-06T10:00:00.000Z'),
      hostTeamId: teamId,
      hostTeam: { name: '성수 FC' },
      approvedApplicantTeamId: opponentTeamId,
      approvedApplicantTeam: { name: '연남 FC' },
      leagueId: null,
      league: null,
      game: { id: 'game-friendly' },
    },
  ];
  // 주차 파생용 형제 대진 — 이 리그의 전 대진(취소·종료 포함)이 대상이다.
  const leagueSiblingRows = [
    { leagueId, startAt: WEEK1_KICKOFF },
    { leagueId, startAt: RESCHEDULED_KICKOFF },
    { leagueId, startAt: WEEK3_KICKOFF },
  ];

  return {
    v1TeamMembership: { findMany: jest.fn().mockResolvedValue([{ teamId }]) },
    v1TournamentFixture: { findMany: jest.fn().mockResolvedValue([]) },
    v1TeamMatch: {
      // 할 일 조회와 주차 파생 조회를 인자로 갈라 준다 — 호출 순서에 기대지 않는다.
      findMany: jest.fn().mockImplementation((args: { where?: { status?: string } }) =>
        Promise.resolve(args?.where?.status === 'matched' ? teamMatchRows : leagueSiblingRows),
      ),
    },
    v1GameSide: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'side-league-home', gameId: 'game-league', teamId },
        { id: 'side-friendly-home', gameId: 'game-friendly', teamId },
      ]),
    },
    // 기본값은 라인업 행 없음 = 두 경기 모두 MISSING — 할 일 목록에 그대로 오른다.
    // 인자로 주면 그 상태를 그대로 쓴다(제출 완료 경기를 재현할 때).
    v1GameLineup: { findMany: jest.fn().mockResolvedValue(lineupRows) },
    // 리그 제목을 대진마다 따로 조회하면(N+1) 이 mock 이 호출되므로 잡힌다.
  };
}

async function buildService(prisma: ReturnType<typeof buildPrismaMock>) {
  const moduleRef = await Test.createTestingModule({
    providers: [LineupTodoService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return { service: moduleRef.get(LineupTodoService), moduleRef };
}

describe('LineupTodoService — 리그 대진의 맥락', () => {
  it('리그 대진에는 리그 id·제목과 startAt에서 파생한 "N주차" 라벨이 실린다', async () => {
    const prisma = buildPrismaMock();
    const { service, moduleRef } = await buildService(prisma);

    try {
      const { items } = await service.listForUser({ id: userId } as never);
      const leagueTodo = items.find((item) => item.gameId === 'game-league');

      expect(leagueTodo).toMatchObject({
        source: 'TEAM_MATCH',
        tournamentId: leagueId,
        tournamentTitle: '가을 정규 리그',
        // 9/8은 이 리그의 두 번째 경기일이다 — 제목에 박제된 '3주차'가 아니라 '2주차'.
        title: '가을 정규 리그 2주차',
        opponentName: '망원 FC',
        state: 'MISSING',
      });
      expect(leagueTodo?.title).not.toContain('3주차');
    } finally {
      await moduleRef.close();
    }
  });

  it('친선 팀매치는 리그 맥락 없이 예전 그대로다', async () => {
    const prisma = buildPrismaMock();
    const { service, moduleRef } = await buildService(prisma);

    try {
      const { items } = await service.listForUser({ id: userId } as never);
      const friendlyTodo = items.find((item) => item.gameId === 'game-friendly');

      expect(friendlyTodo).toMatchObject({
        source: 'TEAM_MATCH',
        tournamentId: null,
        tournamentTitle: null,
        // 모집 문구가 아니라 예전과 같은 고정 라벨이어야 한다.
        title: '팀 매치',
        opponentName: '연남 FC',
      });
    } finally {
      await moduleRef.close();
    }
  });

  it('리그·주차 조회를 대진마다 반복하지 않는다', async () => {
    const prisma = buildPrismaMock();
    const { service, moduleRef } = await buildService(prisma);

    try {
      await service.listForUser({ id: userId } as never);

      // 할 일 조회 1회 + 리그 형제 대진 일괄 조회 1회. 대진마다 주차를 물어보면 늘어난다.
      expect(prisma.v1TeamMatch.findMany).toHaveBeenCalledTimes(2);
      // BE-5 drop: 리그 축이 사라졌다. 재려던 것("주차를 물으려고 리그를 따로 조회하지
      // 않는다")은 이제 **fake 에 대회 조회가 아예 없다는 사실**이 증명한다 — 서비스가
      // 조회하면 `undefined` 를 부르다 즉시 터진다(위 `listForUser` 가 성공했다는 것이
      // 곧 그 왕복이 없었다는 뜻이다).
      expect('v1Tournament' in prisma).toBe(false);
    } finally {
      await moduleRef.close();
    }
  });

  it('하루에 여러 경기를 치르는 리그(timing 지정)에서도 같은 날 경기는 같은 주차다', async () => {
    // 주차는 "몇 번째 경기"가 아니라 "몇 번째 경기일"이다 — timing 리그는 한 팀이 하루에
    // 여러 경기를 뛰므로, 경기 수로 세면 같은 날 경기가 1주차·2주차로 갈린다.
    const sameDayEvening = new Date('2026-09-05T13:00:00.000Z');
    const prisma = buildPrismaMock();
    const teamMatchRows = [
      {
        id: 'match-day1-slot1',
        title: '가을 정규 리그 1주차 1경기',
        startAt: WEEK1_KICKOFF,
        hostTeamId: teamId,
        hostTeam: { name: '성수 FC' },
        approvedApplicantTeamId: opponentTeamId,
        approvedApplicantTeam: { name: '망원 FC' },
        leagueId,
        league: { title: '가을 정규 리그' },
        game: { id: 'game-day1-slot1' },
      },
      {
        id: 'match-day1-slot2',
        title: '가을 정규 리그 1주차 3경기',
        startAt: sameDayEvening,
        hostTeamId: teamId,
        hostTeam: { name: '성수 FC' },
        approvedApplicantTeamId: 'team-third',
        approvedApplicantTeam: { name: '연남 FC' },
        leagueId,
        league: { title: '가을 정규 리그' },
        game: { id: 'game-day1-slot2' },
      },
      {
        id: 'match-day2',
        title: '가을 정규 리그 2주차 1경기',
        startAt: WEEK3_KICKOFF,
        hostTeamId: teamId,
        hostTeam: { name: '성수 FC' },
        approvedApplicantTeamId: opponentTeamId,
        approvedApplicantTeam: { name: '망원 FC' },
        leagueId,
        league: { title: '가을 정규 리그' },
        game: { id: 'game-day2' },
      },
    ];
    prisma.v1TeamMatch.findMany.mockImplementation((args: { where?: { status?: string } }) =>
      Promise.resolve(
        args?.where?.status === 'matched'
          ? teamMatchRows
          : teamMatchRows.map((row) => ({ leagueId: row.leagueId, startAt: row.startAt })),
      ),
    );
    prisma.v1GameSide.findMany.mockResolvedValue([
      { id: 'side-1', gameId: 'game-day1-slot1', teamId },
      { id: 'side-2', gameId: 'game-day1-slot2', teamId },
      { id: 'side-3', gameId: 'game-day2', teamId },
    ]);
    const { service, moduleRef } = await buildService(prisma);

    try {
      const { items } = await service.listForUser({ id: userId } as never);
      const titleByGameId = new Map(items.map((item) => [item.gameId, item.title]));

      expect(titleByGameId.get('game-day1-slot1')).toBe('가을 정규 리그 1주차');
      expect(titleByGameId.get('game-day1-slot2')).toBe('가을 정규 리그 1주차');
      expect(titleByGameId.get('game-day2')).toBe('가을 정규 리그 2주차');
    } finally {
      await moduleRef.close();
    }
  });

  it('리그 대진이 하나도 없으면 주차 조회 자체를 하지 않는다', async () => {
    const prisma = buildPrismaMock();
    prisma.v1TeamMatch.findMany.mockImplementation((args: { where?: { status?: string } }) =>
      Promise.resolve(
        args?.where?.status === 'matched'
          ? [
              {
                id: 'match-friendly',
                title: '주말에 한 판 하실 팀 구해요',
                startAt: new Date('2026-09-06T10:00:00.000Z'),
                hostTeamId: teamId,
                hostTeam: { name: '성수 FC' },
                approvedApplicantTeamId: opponentTeamId,
                approvedApplicantTeam: { name: '연남 FC' },
                leagueId: null,
                league: null,
                game: { id: 'game-friendly' },
              },
            ]
          : [],
      ),
    );
    const { service, moduleRef } = await buildService(prisma);

    try {
      const { items } = await service.listForUser({ id: userId } as never);

      expect(items).toHaveLength(1);
      expect(prisma.v1TeamMatch.findMany).toHaveBeenCalledTimes(1);
    } finally {
      await moduleRef.close();
    }
  });
});

/**
 * 할 일 목록과 팀 경기 목록은 **같은 수집 경로**를 쓰지만 완료(SUBMITTED/LOCKED) 처리가
 * 반대다. 한쪽만 보고 필터를 고치면 다른 쪽에 구멍이 난다 — 그래서 양방향으로 못박는다.
 *
 * 왜 갈려야 하나: 할 일 목록은 "아직 안 낸 것"을 재촉하는 화면이라 제출한 경기가 빠지는
 * 게 맞다. 팀 경기 목록은 전술보드 진입점이라, 라인업을 제출했다고 그 경기의 전술보드에
 * 못 들어가게 되면 안 된다(전술은 제출 후에도 계속 고친다).
 */
describe('LineupTodoService — 완료된 라인업 처리는 소비자마다 반대다', () => {
  const submittedLeagueLineup = [{ sideId: 'side-league-home', state: 'SUBMITTED' }];

  it('할 일 목록(홈 카드)은 제출 완료 경기를 뺀다', async () => {
    const prisma = buildPrismaMock(submittedLeagueLineup);
    const { service, moduleRef } = await buildService(prisma);
    try {
      const { items } = await service.listForUser({ id: userId } as never);
      expect(items.map((item) => item.gameId)).toEqual(['game-friendly']);
      expect(items.some((item) => item.gameId === 'game-league')).toBe(false);
    } finally {
      await moduleRef.close();
    }
  });

  it('팀 경기 목록(전술보드 진입점)은 제출 완료 경기도 돌려준다', async () => {
    const prisma = buildPrismaMock(submittedLeagueLineup);
    const { service, moduleRef } = await buildService(prisma);
    try {
      const items = await service.listUpcomingForTeam(teamId, new Date('2026-09-01T00:00:00.000Z'));
      const league = items.find((item) => item.gameId === 'game-league');
      expect(league).toBeDefined();
      expect(league?.lineupState).toBe('DONE');
      // 제출 안 한 경기도 함께 온다 — 목록이 완료 여부로 갈리지 않는다.
      expect(items.map((item) => item.gameId).sort()).toEqual(['game-friendly', 'game-league']);
    } finally {
      await moduleRef.close();
    }
  });
});
