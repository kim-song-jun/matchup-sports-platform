import type { PrismaService } from '../../prisma/prisma.service';
import type { AdminContextService } from '../../common/admin-context.service';
import type { GamesService } from '../../games/games.service';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { BracketTemplateService } from './bracket-template.service';
import { createHash } from 'node:crypto';
import { toBracketTemplateInput, type ApplyBracketTemplateDto } from './dto/bracket-template.dto';

describe('BracketTemplateService format concurrency', () => {
  it('rejects a template when the format changed before the bracket lock was acquired', async () => {
    const findFirst = jest.fn()
      .mockResolvedValueOnce({ id: 't-1', kind: 'regular_tournament', format: 'knockout' })
      .mockResolvedValueOnce({ id: 't-1', kind: 'regular_tournament', format: 'league', competitionConfigVersionId: 'config-1' });
    const groups = { findMany: jest.fn(), create: jest.fn() };
    const tx = { v1Tournament: { findFirst }, v1TournamentGroup: groups, $executeRaw: jest.fn().mockResolvedValue(1) };
    const prisma = { ...tx, $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    const admin = { getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-1' }) };
    const service = new BracketTemplateService(prisma as unknown as PrismaService, admin as unknown as AdminContextService, {} as GamesService);

    await expect(service.apply({ id: 'user-1' } as V1AuthUser, 't-1', { kind: 'knockout', size: 4 }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_TEMPLATE_FORMAT_MISMATCH' } });
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(groups.findMany).not.toHaveBeenCalled();
    expect(groups.create).not.toHaveBeenCalled();
  });
});

describe('유연한 대진 미리보기와 요청 보호', () => {
  const previousFlag = process.env.V1_FLEXIBLE_BRACKETS_ENABLED;
  beforeEach(() => { process.env.V1_FLEXIBLE_BRACKETS_ENABLED = 'true'; });
  afterAll(() => { if (previousFlag === undefined) delete process.env.V1_FLEXIBLE_BRACKETS_ENABLED; else process.env.V1_FLEXIBLE_BRACKETS_ENABLED = previousFlag; });
  const user = { id: 'user' } as V1AuthUser;
  const dto: ApplyBracketTemplateDto = { schemaVersion: 2, kind: 'knockout', size: 6, participantCount: 6, drawSeed: 12 };
  function setup() {
    const tournament = { id: 't', kind: 'regular_tournament', format: 'knockout', competitionConfigVersionId: 'config' };
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      v1Tournament: { findFirst: jest.fn().mockResolvedValue(tournament), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      v1TournamentGroup: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
      v1TournamentSlot: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentMatchDetails: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue([]) },
      v1TournamentMatchAdvancementEdge: { findMany: jest.fn().mockResolvedValue([]) },
      v1AdminActionLog: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const prisma = { ...tx, $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)) };
    const admin = { getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin' }) };
    const service = new BracketTemplateService(prisma as unknown as PrismaService, admin as unknown as AdminContextService, {} as GamesService);
    return { service, tx, admin };
  }
  it('6팀 계획은 실제 5경기와 부전승 2개를 반환하며 읽기만 한다', async () => {
    const { service, tx } = setup();
    const result = await service.preview(user, 't', dto);
    expect(result.fixtures).toHaveLength(5);
    expect(result.byeSlots).toHaveLength(2);
    expect(result.previewHash).toMatch(/^[a-f0-9]{64}$/);
    expect((await service.preview(user, 't', dto)).previewHash).toBe(result.previewHash);
    expect(tx.v1TournamentGroup.create).not.toHaveBeenCalled();
  });
  it('미리보기 후 참가 상태가 바뀌면 생성 전에 충돌을 반환한다', async () => {
    const { service, tx } = setup();
    const { previewHash } = await service.preview(user, 't', dto);
    tx.v1TournamentRegistration.findMany.mockResolvedValue([{ id: 'r1', status: 'confirmed' }]);
    await expect(service.apply(user, 't', { ...dto, previewHash, requestId: 'request' }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_PREVIEW_STALE' } });
    expect(tx.v1TournamentGroup.create).not.toHaveBeenCalled();
  });
  it('성공 응답 유실 후 같은 요청을 보내면 이미 저장된 결과만 반환한다', async () => {
    const { service, tx } = setup();
    const requestHash = createHash('sha256').update(JSON.stringify({ input: toBracketTemplateInput(dto), replaceExisting: false })).digest('hex');
    tx.v1AdminActionLog.findFirst.mockResolvedValue({ afterJson: { requestHash, groups: 3, slots: 6, fixtures: 5, edges: 4 } });
    await expect(service.apply(user, 't', { ...dto, previewHash: 'old-hash', requestId: 'request' }))
      .resolves.toEqual({ groups: 3, slots: 6, fixtures: 5, edges: 4 });
    expect(tx.v1TournamentGroup.findMany).not.toHaveBeenCalled();
    await expect(service.apply(user, 't', { ...dto, size: 8, participantCount: 8, previewHash: 'old-hash', requestId: 'request' }))
      .rejects.toMatchObject({ response: { code: 'BRACKET_REQUEST_CONFLICT' } });
  });
  it('미리보기 없는 생성과 오래된 초안 저장은 거절한다', async () => {
    const { service, tx } = setup();
    await expect(service.apply(user, 't', dto)).rejects.toMatchObject({ response: { code: 'BRACKET_PREVIEW_REQUIRED' } });
    tx.v1Tournament.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.saveDraft(user, 't', { ...dto, expectedRevision: 2 })).rejects.toMatchObject({ response: { code: 'BRACKET_DRAFT_STALE' } });
  });
  it('권한 거절 시 대회 정보도 조회하지 않는다', async () => {
    const { service, tx, admin } = setup();
    admin.getMutationAdmin.mockRejectedValue(new Error('forbidden'));
    await expect(service.preview(user, 't', dto)).rejects.toThrow('forbidden');
    expect(tx.v1Tournament.findFirst).not.toHaveBeenCalled();
  });
  it('출시 플래그를 끄면 새 대진 생성을 막는다', async () => {
    process.env.V1_FLEXIBLE_BRACKETS_ENABLED = 'false';
    const { service, tx } = setup();
    await expect(service.preview(user, 't', dto)).rejects.toMatchObject({ response: { code: 'BRACKET_V2_DISABLED' } });
    expect(tx.v1Tournament.findFirst).not.toHaveBeenCalled();
  });
});
