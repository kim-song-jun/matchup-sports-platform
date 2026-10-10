import type { Prisma } from '@prisma/client';
import { assertFixtureScheduleKeepsStageOrder } from './tournament-schedule-order';

const at = (hhmm: string) => new Date(`2026-10-10T${hhmm}:00.000Z`);

type Match = { id: string; startAt: Date | null; phase: string | null; round: string };

// 조별 1·2경기 23:00·23:10, 조별 3경기 23:20, 8강 23:30, 결승 23:40.
const MATCHES: Match[] = [
  { id: 'g1', startAt: at('23:00'), phase: 'group', round: 'league_r1' },
  { id: 'g2', startAt: at('23:10'), phase: 'group', round: 'league_r2' },
  { id: 'g3', startAt: at('23:20'), phase: 'group', round: 'league_r3' },
  { id: 'qf', startAt: at('23:30'), phase: 'quarter', round: '8강' },
  { id: 'final', startAt: at('23:40'), phase: 'final', round: '결승' },
  { id: 'free', startAt: at('23:50'), phase: null, round: '친선 한마당' },
];

function fakeTx(matches: Match[]) {
  const shape = (match: Match) => ({
    startAt: match.startAt,
    tournamentDetails: { round: match.round, group: match.phase === null ? null : { phase: match.phase } },
  });
  return {
    v1TeamMatch: {
      findFirst: jest.fn(async ({ where }: { where: { id: string } }) => {
        const match = matches.find((candidate) => candidate.id === where.id);
        return match === undefined ? null : shape(match);
      }),
      findMany: jest.fn(async ({ where }: { where: { id: { not: string } } }) =>
        matches.filter((candidate) => candidate.id !== where.id.not && candidate.startAt !== null).map(shape),
      ),
    },
  } as unknown as Prisma.TransactionClient;
}

const check = (teamMatchId: string, startAt: Date | null) =>
  assertFixtureScheduleKeepsStageOrder(fakeTx(MATCHES), { tournamentId: 't', teamMatchId, startAt });

describe('assertFixtureScheduleKeepsStageOrder', () => {
  it('결승을 조별 마지막 경기보다 이른 시각으로 옮기면 막는다', async () => {
    await expect(check('final', at('23:15'))).rejects.toMatchObject({
      response: { code: 'FIXTURE_SCHEDULE_STAGE_ORDER', message: '결승 경기는 조별리그 경기보다 늦게 시작해야 해요. 단계 순서에 맞게 시각을 정해 주세요.' },
    });
  });

  it('조별 경기를 결선 경기보다 늦은 시각으로 옮기면 막는다', async () => {
    await expect(check('g1', at('23:35'))).rejects.toMatchObject({
      response: { code: 'FIXTURE_SCHEDULE_STAGE_ORDER', message: '조별리그 경기는 8강 경기보다 먼저 시작해야 해요. 단계 순서에 맞게 시각을 정해 주세요.' },
    });
  });

  it('단계 순서를 지키는 시각은 통과시킨다', async () => {
    await expect(check('final', at('23:45'))).resolves.toBeUndefined();
    await expect(check('g2', at('23:05'))).resolves.toBeUndefined();
  });

  it('같은 단계끼리는 시각 순서를 따지지 않는다', async () => {
    await expect(check('g3', at('22:00'))).resolves.toBeUndefined();
    await expect(check('g1', at('23:25'))).resolves.toBeUndefined();
  });

  it('이미 단계와 어긋나 저장된 시각을 그대로 보내면 막지 않는다', async () => {
    const skewed = MATCHES.map((match) => (match.id === 'final' ? { ...match, startAt: at('23:05') } : match));
    await expect(
      assertFixtureScheduleKeepsStageOrder(fakeTx(skewed), { tournamentId: 't', teamMatchId: 'final', startAt: at('23:05') }),
    ).resolves.toBeUndefined();
  });

  it('시각을 비우는 요청과 단계를 알 수 없는 라운드는 비교하지 않는다', async () => {
    await expect(check('final', null)).resolves.toBeUndefined();
    await expect(check('free', at('22:00'))).resolves.toBeUndefined();
    await expect(check('g1', at('23:45'))).rejects.toMatchObject({ response: { code: 'FIXTURE_SCHEDULE_STAGE_ORDER' } });
  });
});
