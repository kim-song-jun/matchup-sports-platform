import { PrismaService } from '../../src/prisma/prisma.service';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { createGroupInTx } from '../../src/tournaments/tournament-bracket-tx';
import { competitionConfigFixture as ids, seedCompetitionConfigFixture } from '../fixtures/competition-config.fixture';

const prisma = new PrismaService();
const user = { id: ids.adminUserId, email: 'bracket-tx@example.test', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const adminContext = new AdminContextService(prisma);
const bracket = new TournamentBracketService(prisma, adminContext, games);
let admin: Awaited<ReturnType<AdminContextService['getMutationAdmin']>>;

const groupAuditCount = (name: string) =>
  prisma.v1AdminActionLog.count({ where: { action: 'tournament.bracket.group.create', afterJson: { path: ['name'], equals: name } } });

describe('대진 …InTx 함수 (PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.$connect();
    await seedCompetitionConfigFixture(prisma, user);
    admin = await adminContext.getMutationAdmin(user.id);
  });
  afterAll(async () => { await prisma.$disconnect(); });

  describe('createGroupInTx', () => {
    it('바깥 트랜잭션이 롤백되면 그룹과 감사 로그가 함께 사라진다 (여러 변경을 한 트랜잭션에 묶을 수 있다)', async () => {
      await expect(prisma.$transaction(async (tx) => {
        await createGroupInTx(tx, admin, ids.tournamentId, { name: 'tx-rollback', phase: 'group', sortOrder: 9, advanceCount: null });
        throw new Error('rollback');
      })).rejects.toThrow('rollback');

      expect(await prisma.v1TournamentGroup.count({ where: { tournamentId: ids.tournamentId, name: 'tx-rollback' } })).toBe(0);
      expect(await groupAuditCount('tx-rollback')).toBe(0);
    });

    it('커밋되면 둘 다 남는다 (대조군) — 서비스 createGroup 도 같은 함수를 탄다', async () => {
      const viaService = await bracket.createGroup(user, ids.tournamentId, { name: 'tx-commit', phase: 'group' });

      expect(await prisma.v1TournamentGroup.count({ where: { id: viaService.id } })).toBe(1);
      expect(await groupAuditCount('tx-commit')).toBe(1);
    });
  });

  // ─── 통합 스펙 끝 (새 describe 는 이 줄 위에 추가한다) ───
});
