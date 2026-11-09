import type { ExecutionContext } from '@nestjs/common';
import { StageLegacyMutationGuard } from './stage-legacy-mutation.guard';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AdminContextService } from '../../common/admin-context.service';
function setup(staged: boolean) {
  const prisma = { v1Tournament: { findFirst: jest.fn(async () => ({ stagePlan: staged ? {} : null })) } };
  const admins = { getTournamentMutationAdmin: jest.fn(async () => ({})) };
  const guard = new StageLegacyMutationGuard(prisma as unknown as PrismaService, admins as unknown as AdminContextService);
  const context = (method: string, path: string, body: object = {}) => ({ switchToHttp: () => ({ getRequest: () => ({ method, route: { path }, params: { tournamentId: 't' }, v1User: { id: 'admin' }, body }) }) }) as unknown as ExecutionContext;
  return { prisma, admins, guard, context };
}
describe('기존 구조 편집 API의 단계형 보호', () => {
  it('기존 대회의 생성·편집은 유지한다', async () => { const h = setup(false); await expect(h.guard.canActivate(h.context('POST', '/admin/tournaments/:tournamentId/groups'))).resolves.toBe(true); });
  it('새 대회는 실제 mutation 권한을 확인한 뒤 잘못된 구조 편집 경로를 차단한다', async () => {
    const h = setup(true); await expect(h.guard.canActivate(h.context('POST', '/admin/tournaments/:tournamentId/groups'))).rejects.toMatchObject({ response: { code: 'STAGE_MANAGEMENT_REQUIRED' } });
    expect(h.admins.getTournamentMutationAdmin).toHaveBeenCalledWith('admin', { tournamentId: 't' });
  });
  it('조회·순위 재계산·경기 결과·일정 편집은 기존 운영 경로를 사용한다', async () => {
    const h = setup(true);
    await expect(h.guard.canActivate(h.context('GET', '/admin/tournaments/:tournamentId/bracket'))).resolves.toBe(true);
    await expect(h.guard.canActivate(h.context('POST', '/admin/tournaments/:tournamentId/standings/recalculate'))).resolves.toBe(true);
    await expect(h.guard.canActivate(h.context('PATCH', '/admin/fixtures/:fixtureId', { scheduledAt: null }))).resolves.toBe(true);
  });
});
