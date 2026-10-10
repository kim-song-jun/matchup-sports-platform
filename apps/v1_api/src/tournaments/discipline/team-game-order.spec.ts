import type { Prisma } from '@prisma/client';
import { readSuspensionVerdicts } from './suspension-verdicts';
import { loadTeamCompetitionGameOrder, narrowToTeamGames, type CompetitionMatchOrderRow } from './team-game-order';

// 네 팀 · 다섯 경기(대회 전체 순서). 같은 날 다른 팀 경기가 사이에 낀다.
//   m1 A-B · m2 C-D · m3 A-C · m4 B-D · m5 A-D
// pa(A팀)는 m1 에서, pc(C팀)는 m2 에서 레드카드 1장. 규정: 레드 1장 = 1경기 정지.
const MATCHES: CompetitionMatchOrderRow[] = [
  { id: 'm1', hostTeamId: 'A', approvedApplicantTeamId: 'B', game: { id: 'g1' } },
  { id: 'm2', hostTeamId: 'C', approvedApplicantTeamId: 'D', game: { id: 'g2' } },
  { id: 'm3', hostTeamId: 'A', approvedApplicantTeamId: 'C', game: { id: 'g3' } },
  { id: 'm4', hostTeamId: 'B', approvedApplicantTeamId: 'D', game: { id: 'g4' } },
  { id: 'm5', hostTeamId: 'D', approvedApplicantTeamId: 'A', game: { id: 'g5' } },
];

const RESULTS: Record<string, Array<{ participantId: string; userId: string; red: number }>> = {
  g1: [{ participantId: 'p-g1-pa', userId: 'pa', red: 1 }, { participantId: 'p-g1-pb', userId: 'pb', red: 0 }],
  g2: [{ participantId: 'p-g2-pc', userId: 'pc', red: 1 }],
};

function fakeTx(rules: { yellowAccumulationLimit: number | null; redCardSuspensionMatches: number | null }) {
  const participants = Object.values(RESULTS).flat();
  return {
    v1TeamMatch: { findMany: jest.fn(async () => MATCHES) },
    v1Tournament: { findFirst: jest.fn(async () => rules) },
    v1Game: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({
          id,
          currentOfficialRevisionId: null,
          resultRevisions: RESULTS[id] === undefined ? [] : [{ id: `rev-${id}` }],
        })),
      ),
    },
    v1GameResultParticipant: {
      findMany: jest.fn(async ({ where }: { where: { resultRevisionId: { in: string[] } } }) =>
        where.resultRevisionId.in.flatMap((revisionId) =>
          (RESULTS[revisionId.replace('rev-', '')] ?? []).map((row) => ({
            resultRevisionId: revisionId,
            participantId: row.participantId,
            cards: { yellow: 0, red: row.red },
          })),
        ),
      ),
    },
    v1GameParticipant: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        participants
          .filter((row) => where.id.in.includes(row.participantId))
          .map((row) => ({ id: row.participantId, userId: row.userId })),
      ),
    },
  } as unknown as Prisma.TransactionClient;
}

const RED_ONE = { yellowAccumulationLimit: null, redCardSuspensionMatches: 1 };

async function verdictsFor(teamId: string, upcomingKey: string) {
  const tx = fakeTx(RED_ONE);
  const orderedGames = await loadTeamCompetitionGameOrder(tx, { competitionId: 'cup', isLeague: false, teamId });
  return readSuspensionVerdicts(tx, { competitionId: 'cup', orderedGames, upcomingKey });
}

describe('narrowToTeamGames — S1 팀 경기 순서', () => {
  it('그 팀이 홈이든 원정이든 뛰는 경기만 원래 순서대로 남긴다', () => {
    expect(narrowToTeamGames(MATCHES, 'A').map((game) => game.key)).toEqual(['m1', 'm3', 'm5']);
    expect(narrowToTeamGames(MATCHES, 'D').map((game) => game.key)).toEqual(['m2', 'm4', 'm5']);
  });

  it('팀이 없는 사이드(대진 미정)는 셀 경기가 없다', () => {
    expect(narrowToTeamGames(MATCHES, null)).toEqual([]);
  });

  it('게임 행이 아직 없는 경기도 순번에는 들어간다(gameId null)', () => {
    const rows = [...MATCHES, { id: 'm6', hostTeamId: 'A', approvedApplicantTeamId: 'B', game: null }];
    expect(narrowToTeamGames(rows, 'A').at(-1)).toEqual({ key: 'm6', gameId: null });
  });
});

describe('출전정지는 그 팀의 다음 경기에서 소진된다 (S1)', () => {
  it('전제: 대회 전체 순서로 세면 A팀 pa 의 정지가 다른 팀 경기(m2)에서 소진돼 m3 에서 안 걸린다', async () => {
    const tx = fakeTx(RED_ONE);
    const fullOrder = MATCHES.map((row) => ({ key: row.id, gameId: row.game?.id ?? null }));
    const verdicts = await readSuspensionVerdicts(tx, { competitionId: 'cup', orderedGames: fullOrder, upcomingKey: 'm3' });
    expect(verdicts.get('pa')?.suspended).toBe(false);
  });

  it('A팀의 다음 경기(m3)에서 pa 가 정지된다', async () => {
    const verdicts = await verdictsFor('A', 'm3');
    expect(verdicts.get('pa')?.suspended).toBe(true);
  });

  it('정지를 한 경기 치른 뒤(A팀의 m5)에는 pa 가 복귀한다', async () => {
    const verdicts = await verdictsFor('A', 'm5');
    expect(verdicts.get('pa')?.suspended).toBe(false);
  });

  it('C팀의 다음 경기(m3)에서는 pc 가 정지되고, A팀 경기에서 받은 pa 의 카드는 세지 않는다', async () => {
    const verdicts = await verdictsFor('C', 'm3');
    expect(verdicts.get('pc')?.suspended).toBe(true);
    expect(verdicts.has('pa')).toBe(false);
  });

  it('A팀 경기 판정은 C팀 경기(m2)의 카드를 읽지 않는다', async () => {
    const verdicts = await verdictsFor('A', 'm3');
    expect(verdicts.has('pc')).toBe(false);
  });

  it('upcomingKey 가 그 팀 경기가 아니면 아무도 정지되지 않는다', async () => {
    const verdicts = await verdictsFor('B', 'm3');
    expect(verdicts.size).toBe(0);
  });
});

describe('대회 경기 순서는 단계가 먼저다 (MD-QA #76)', () => {
  // DB 정렬(시각순)을 흉내 낸 결과: 결승을 조별 3경기보다 이른 시각으로 잘못 저장한 대회.
  //   결승 23:15 (송파-한강) · 조별 3경기 23:20 (마포-송파) · 8강 23:30 (송파-마포)
  const row = (id: string, host: string, away: string, phase: string | null, round: string) => ({
    id,
    hostTeamId: host,
    approvedApplicantTeamId: away,
    game: { id: `g-${id}` },
    tournamentDetails: { round, group: phase === null ? null : { phase } },
  });
  const BY_TIME = [
    row('final', 'SP', 'HG', 'final', '결승'),
    row('g3', 'MP', 'SP', 'group', 'league_r3'),
    row('qf', 'SP', 'MP', 'quarter', '8강'),
  ];

  function tx(rows: unknown[]) {
    return { v1TeamMatch: { findMany: jest.fn(async () => rows) } } as unknown as Prisma.TransactionClient;
  }

  it('시각이 더 이른 결승보다 조별 경기가 앞선다', async () => {
    const order = await loadTeamCompetitionGameOrder(tx(BY_TIME), { competitionId: 'cup', isLeague: false, teamId: 'SP' });
    expect(order.map((game) => game.key)).toEqual(['g3', 'qf', 'final']);
  });

  it('조 없는 토너먼트 경기는 라운드 이름으로 단계를 읽는다', async () => {
    const rows = [row('final', 'SP', 'HG', null, '결승'), row('qf', 'SP', 'MP', null, '8강'), row('g3', 'MP', 'SP', 'group', 'league_r3')];
    const order = await loadTeamCompetitionGameOrder(tx(rows), { competitionId: 'cup', isLeague: false, teamId: 'SP' });
    expect(order.map((game) => game.key)).toEqual(['g3', 'qf', 'final']);
  });

  it('같은 단계 안에서는 DB 가 준 시각 순서를 그대로 둔다', async () => {
    const rows = [row('g2', 'SP', 'HG', 'group', 'league_r2'), row('g1', 'SP', 'MP', 'group', 'league_r1')];
    const order = await loadTeamCompetitionGameOrder(tx(rows), { competitionId: 'cup', isLeague: false, teamId: 'SP' });
    expect(order.map((game) => game.key)).toEqual(['g2', 'g1']);
  });

  it('조별 경기 정지가 결승에서 다시 걸리지 않는다', async () => {
    // 송파 9번이 g2 에서 경고 2장 → 1경기 정지. 결승이 g2 와 g3 사이 시각이어도 정지는 다음 조별 경기(g3)에서 소진되고 결승에선 풀린다.
    const results: Record<string, number> = { 'g-g2': 2 };
    const rowsByTime = [
      row('g2', 'SP', 'HG', 'group', 'league_r2'),
      row('final', 'SP', 'HG', 'final', '결승'),
      row('g3', 'MP', 'SP', 'group', 'league_r3'),
    ];
    const db = {
      v1TeamMatch: { findMany: jest.fn(async () => rowsByTime) },
      v1Tournament: { findFirst: jest.fn(async () => ({ yellowAccumulationLimit: 2, redCardSuspensionMatches: null })) },
      v1Game: {
        findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.map((id) => ({ id, currentOfficialRevisionId: null, resultRevisions: results[id] === undefined ? [] : [{ id: `rev-${id}` }] })),
        ),
      },
      v1GameResultParticipant: {
        findMany: jest.fn(async ({ where }: { where: { resultRevisionId: { in: string[] } } }) =>
          where.resultRevisionId.in.map((revisionId) => ({
            resultRevisionId: revisionId,
            participantId: 'p9',
            cards: { yellow: results[revisionId.replace('rev-', '')], red: 0 },
          })),
        ),
      },
      v1GameParticipant: { findMany: jest.fn(async () => [{ id: 'p9', userId: 'kim' }]) },
    } as unknown as Prisma.TransactionClient;
    const orderedGames = await loadTeamCompetitionGameOrder(db, { competitionId: 'cup', isLeague: false, teamId: 'SP' });
    const atG3 = await readSuspensionVerdicts(db, { competitionId: 'cup', orderedGames, upcomingKey: 'g3' });
    const atFinal = await readSuspensionVerdicts(db, { competitionId: 'cup', orderedGames, upcomingKey: 'final' });
    expect(atG3.get('kim')?.suspended).toBe(true);
    expect(atFinal.get('kim')?.suspended).toBe(false);
  });
});
