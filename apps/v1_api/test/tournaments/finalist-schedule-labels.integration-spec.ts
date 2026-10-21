import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { PublicTournamentRecordsService } from '../../src/games/public-records/public-tournament-records.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { BracketTemplateService } from '../../src/tournaments/templates/bracket-template.service';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';
import { seedBracketTournament } from '../helpers/bracket-canvas-fixture';

jest.setTimeout(120_000);
const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'schedule-labels@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const templates = new BracketTemplateService(prisma, new AdminContextService(prisma), games);
const records = new PublicTournamentRecordsService(prisma, new TournamentStaffAccessService(prisma));

describe('결선 공개 일정의 저장된 진출 연결 문구 (PostgreSQL)', () => {
  beforeAll(async () => { await prisma.$connect(); await seedCompetitionConfigFixture(prisma, user); });
  afterAll(async () => { await prisma.$disconnect(); });

  it('필터·페이지 밖 원천의 현재 경기 번호와 승자/패자를 표시하고 삭제된 원천은 제외한다', async () => {
    const { tournamentId } = await seedBracketTournament(prisma, { label: 'schedule-source-labels', format: 'knockout', teamCount: 4 });
    await templates.apply(user, tournamentId, { kind: 'knockout', size: 4, thirdPlace: true });
    await prisma.v1Tournament.update({ where: { id: tournamentId }, data: { status: 'closed', bracketPublishedAt: new Date() } });
    const rows = await prisma.v1TournamentMatchDetails.findMany({ where: { tournamentId }, include: { group: true, advancementTargets: { include: { source: true } } } });
    const final = rows.find(row => row.group?.phase === 'final')!;
    const third = rows.find(row => row.group?.phase === 'third_place')!;
    const homeSource = final.advancementTargets.find(edge => edge.targetSide === 'HOME')!.source;
    const awaySource = final.advancementTargets.find(edge => edge.targetSide === 'AWAY')!.source;
    await prisma.v1TournamentMatchDetails.update({ where: { teamMatchId: homeSource.teamMatchId }, data: { fixtureNumber: 17 } });
    await prisma.v1TeamMatch.update({ where: { id: third.teamMatchId }, data: { startAt: new Date('2026-10-25T03:00:00Z') } });
    await prisma.v1GameVisibilityPolicy.updateMany({ where: { game: { teamMatch: { tournamentId } } }, data: { mode: 'STATUS_ONLY' } });

    const finalSchedule = await records.getSchedule(tournamentId, { round: final.round, limit: 1 });
    expect(finalSchedule.unscheduled).toHaveLength(1);
    expect(finalSchedule.unscheduled[0]).toMatchObject({ fixtureId: final.teamMatchId, home: null, away: null,
      homeSlotLabel: '4강 17경기 승자', awaySlotLabel: `4강 ${awaySource.fixtureNumber}경기 승자` });
    const thirdSchedule = await records.getSchedule(tournamentId, { round: third.round, limit: 1 });
    expect(thirdSchedule.items).toHaveLength(1);
    expect(thirdSchedule.items[0]).toMatchObject({ fixtureId: third.teamMatchId,
      homeSlotLabel: '4강 17경기 패자', awaySlotLabel: `4강 ${awaySource.fixtureNumber}경기 패자` });

    await prisma.v1TeamMatch.update({ where: { id: homeSource.teamMatchId }, data: { deletedAt: new Date() } });
    const afterDelete = await records.getSchedule(tournamentId, { round: final.round });
    expect(afterDelete.unscheduled[0]).toMatchObject({ homeSlotLabel: null, awaySlotLabel: `4강 ${awaySource.fixtureNumber}경기 승자` });
  });
});
