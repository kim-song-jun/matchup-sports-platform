import { randomUUID } from 'node:crypto';
import { Prisma, V1GameState } from '@prisma/client';
import { AdminContextService } from '../../src/common/admin-context.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentsAdminService } from '../../src/tournaments/tournaments-admin.service';
import { FUTSAL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config.presets';
import { competitionConfigContentHash } from '../../src/tournaments/competition-config/competition-config';

// CI의 isolated-integration-environment가 테스트별로 만든 DB에서 실제 relation predicate와 감사 저장을 검증한다.
describe('첫 경기 시작 전 대회 시작 되돌리기 — real DB', () => {
  const db = new PrismaService();
  const user = { id: randomUUID(), email: `${randomUUID()}@integration.test`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
  let service: TournamentsAdminService;
  let sportId: string;
  let configId: string;
  beforeAll(async () => {
    await db.$connect();
    await db.v1User.create({ data: user });
    await db.v1AdminUser.create({ data: { userId: user.id, adminRole: 'ops', status: 'active' } });
    const sport = await db.v1Sport.findUnique({ where: { code: 'futsal' } })
      ?? await db.v1Sport.create({ data: { code: 'futsal', name: '풋살' } });
    sportId = sport.id;
    const contentHash = competitionConfigContentHash(FUTSAL_V1_CONFIG);
    const existing = await db.v1CompetitionConfigVersion.findUnique({ where: { contentHash } });
    configId = existing?.id ?? (await db.v1CompetitionConfigVersion.create({ data: {
      sportCode: 'futsal', name: `start-revert-${user.id}`, version: 1, contentHash,
      periods: FUTSAL_V1_CONFIG.periods as unknown as Prisma.InputJsonValue,
      events: FUTSAL_V1_CONFIG.events as unknown as Prisma.InputJsonValue,
      lineup: FUTSAL_V1_CONFIG.lineup as unknown as Prisma.InputJsonValue,
      result: FUTSAL_V1_CONFIG.result as unknown as Prisma.InputJsonValue,
      tieBreak: FUTSAL_V1_CONFIG.tieBreak as unknown as Prisma.InputJsonValue,
      visibility: FUTSAL_V1_CONFIG.visibility as unknown as Prisma.InputJsonValue,
    } })).id;
    service = new TournamentsAdminService(db, new AdminContextService(db), {
      emitNotificationToMany: jest.fn(),
    } as unknown as NotificationsService);
  });
  afterAll(async () => db.$disconnect());
  async function tournament(kind: 'regular_tournament' | 'regular_league' = 'regular_tournament') {
    return db.v1Tournament.create({ data: { sportId, title: '시작 복귀 검증', kind, status: 'in_progress',
      teamCount: 8, competitionConfigVersionId: configId } });
  }
  async function fixture(tournamentId: string, state: V1GameState = 'SCHEDULED') {
    const match = await db.v1TeamMatch.create({ data: { sportId, tournamentId, title: '시작 복귀 경기',
      status: 'matched', competitionConfigVersionId: configId,
      tournamentDetails: { create: { round: 'final', fixtureNumber: 1 } },
    } });
    return db.v1Game.create({ data: { sourceType: 'TEAM_MATCH', teamMatchId: match.id,
      competitionConfigVersionId: configId, state } });
  }
  const revert = (id: string) => service.changeStatus(user, id, { status: 'closed', reason: '시작을 잘못 눌렀어요' });
  async function expectBlocked(id: string) {
    await expect(revert(id)).rejects.toMatchObject({ response: { code: 'TOURNAMENT_ALREADY_STARTED' } });
    expect((await db.v1Tournament.findUniqueOrThrow({ where: { id } })).status).toBe('in_progress');
    expect(await db.v1StatusChangeLog.count({ where: { targetType: 'tournament', targetId: id, toStatus: 'closed' } })).toBe(0);
  }
  it('대진이 없어도 복귀하고 감사 기록에 사유가 저장된다', async () => {
    const t = await tournament();
    expect((await service.get(user, t.id)).canRevertStart).toBe(true);
    expect(await revert(t.id)).toMatchObject({ previousStatus: 'in_progress', status: 'closed' });
    expect((await db.v1Tournament.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('closed');
    expect(await db.v1StatusChangeLog.findFirst({ where: { targetId: t.id, toStatus: 'closed' } }))
      .toMatchObject({ fromStatus: 'in_progress', reason: '시작을 잘못 눌렀어요' });
  });
  it('예약 경기와 자동 제출 명단은 유지하면서 복귀한다', async () => {
    const t = await tournament(); const g = await fixture(t.id);
    const side = await db.v1GameSide.create({ data: { gameId: g.id, sideKey: 'HOME', displayNameSnapshot: '홈 팀' } });
    await db.v1GameLineup.create({ data: { gameId: g.id, sideId: side.id, revision: 1, state: 'SUBMITTED', submittedAt: new Date() } });
    await revert(t.id);
    expect(await db.v1Game.findUniqueOrThrow({ where: { id: g.id } })).toMatchObject({ state: 'SCHEDULED' });
    expect(await db.v1GameLineup.count({ where: { gameId: g.id } })).toBe(1);
    expect(await db.v1TournamentMatchDetails.count({ where: { tournamentId: t.id } })).toBe(1);
  });
  it.each(['LIVE', 'PAUSED', 'ENDED'] as const)('%s 경기가 하나라도 있으면 복귀하지 않는다', async state => {
    const t = await tournament(); await fixture(t.id, state);
    expect((await service.get(user, t.id)).canRevertStart).toBe(false);
    await expectBlocked(t.id);
  });
  it('취소 경기라도 과거 시작 시각이 있으면 차단한다', async () => {
    const t = await tournament(); const g = await fixture(t.id, 'CANCELLED');
    await db.v1GamePeriod.create({ data: { gameId: g.id, number: 1, state: 'SCHEDULED', startedAt: new Date() } });
    await expectBlocked(t.id);
  });
  it('한 번도 시작하지 않은 취소 경기는 차단 근거가 아니다', async () => {
    const t = await tournament(); await fixture(t.id, 'CANCELLED');
    expect(await revert(t.id)).toMatchObject({ status: 'closed' });
  });
  it('예약 상태라도 결과 revision이 있으면 차단한다', async () => {
    const t = await tournament(); const g = await fixture(t.id);
    await db.v1GameResultRevision.create({ data: { gameId: g.id, revision: 1, score: { home: 0, away: 0 },
      eventsHash: 'integration-start-revert', createdByActorType: 'USER', createdByUserId: user.id } });
    await expectBlocked(t.id);
  });
  it('대회 상태 API가 리그 시즌을 바꾸지 않는다', async () => {
    const t = await tournament('regular_league');
    await expect(revert(t.id)).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });
    expect((await db.v1Tournament.findUniqueOrThrow({ where: { id: t.id } })).status).toBe('in_progress');
  });
});
