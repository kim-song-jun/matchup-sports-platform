import { ConflictException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { GroupRankPreview, GroupRankPreviewRow } from './load-group-rank-preview';
import type { Prisma } from '@prisma/client';
import { AdminContextService } from '../../common/admin-context.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { kindAwareFindFirst } from '../../../test/helpers/kind-aware-find-first';
import { loadGroupRankPreview } from './load-group-rank-preview';
import { fillSlotsFromStandings, planFillFromStandings, previewGroupRankStandings } from './group-rank-fill';

jest.mock('./load-group-rank-preview', () => ({ loadGroupRankPreview: jest.fn() }));
const loadMock = loadGroupRankPreview as jest.MockedFunction<typeof loadGroupRankPreview>;

const row = (slotId: string, state: GroupRankPreviewRow['state'], extra: Partial<GroupRankPreviewRow> = {}): GroupRankPreviewRow => ({
  slotId,
  label: `라벨-${slotId}`,
  state,
  candidateRegistrationId: null,
  candidateTeamName: null,
  tiedRegistrationIds: [],
  currentRegistrationId: null,
  ...extra,
});
const previewOf = (rows: GroupRankPreviewRow[], members: Record<string, string[]> = {}): GroupRankPreview => ({
  rows,
  groupMembers: new Map(rows.map((r) => [r.slotId, new Set(members[r.slotId] ?? ['X', 'Y', 'Z'])])),
});

function failure(operation: () => unknown): { type: string; code: string | undefined } {
  try {
    operation();
  } catch (error) {
    const type = (error as Error).constructor.name;
    const code = (error as { getResponse?: () => { code?: string } }).getResponse?.().code;
    return { type, code };
  }
  throw new Error('예외가 나지 않았다');
}

describe('planFillFromStandings', () => {
  it('ready 자리는 후보로 자동 배정하고 현재 값과 다른 것만 writes 에 담는다', () => {
    const plan = planFillFromStandings(
      previewOf([
        row('s1', 'ready', { candidateRegistrationId: 'X' }),
        row('s2', 'ready', { candidateRegistrationId: 'Y', currentRegistrationId: 'Z' }),
        row('s3', 'ready', { candidateRegistrationId: 'Z', currentRegistrationId: 'Z' }),
      ]),
      [],
    );
    expect(plan.assignments).toEqual([
      { slotId: 's1', registrationId: 'X' },
      { slotId: 's2', registrationId: 'Y' },
      { slotId: 's3', registrationId: 'Z' },
    ]);
    // s3 은 이미 맞게 들어 있다 — 쓰지 않는다(시작된 결선 경기에 걸린 자리를 괜히 건드리면 SLOT_LOCKED).
    expect(plan.writes).toEqual([
      { slotId: 's1', from: null, to: 'X' },
      { slotId: 's2', from: 'Z', to: 'Y' },
    ]);
    expect(plan.skipped).toEqual([]);
  });

  it('override 없는 tied 자리와 group_incomplete 자리는 건너뛰고 이유를 남긴다 — ready 자리는 그대로 채운다', () => {
    const plan = planFillFromStandings(
      previewOf([
        row('s1', 'ready', { candidateRegistrationId: 'X' }),
        row('s2', 'tied', { tiedRegistrationIds: ['Y', 'Z'] }),
        row('s3', 'group_incomplete'),
      ]),
      [],
    );
    expect(plan.assignments).toEqual([{ slotId: 's1', registrationId: 'X' }]);
    expect(plan.skipped).toEqual([
      { slotId: 's2', reason: 'tied' },
      { slotId: 's3', reason: 'group_incomplete' },
    ]);
  });

  it('tied 자리는 override 로 고른 팀이 들어간다', () => {
    const plan = planFillFromStandings(
      previewOf([row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })]),
      [{ slotId: 's1', registrationId: 'Y' }],
    );
    expect(plan.writes).toEqual([{ slotId: 's1', from: null, to: 'Y' }]);
    expect(plan.skipped).toEqual([]);
  });

  it('1·2위 동률 맞바꾸기(A1 <-> A2): 두 자리 모두 writes 에 from/to 가 교차로 담긴다', () => {
    const plan = planFillFromStandings(
      previewOf([
        row('a1', 'tied', { tiedRegistrationIds: ['X', 'Y'], currentRegistrationId: 'X' }),
        row('a2', 'tied', { tiedRegistrationIds: ['X', 'Y'], currentRegistrationId: 'Y' }),
      ]),
      [{ slotId: 'a1', registrationId: 'Y' }, { slotId: 'a2', registrationId: 'X' }],
    );
    expect(plan.writes).toEqual([
      { slotId: 'a1', from: 'X', to: 'Y' },
      { slotId: 'a2', from: 'Y', to: 'X' },
    ]);
  });

  it('3팀 동률에서 1·2위 자리에 서로 다른 두 팀을 골라 넣을 수 있다 (세 번째 팀은 탈락)', () => {
    const tied = { tiedRegistrationIds: ['X', 'Y', 'Z'] };
    const plan = planFillFromStandings(
      previewOf([row('a1', 'tied', tied), row('a2', 'tied', tied)]),
      [{ slotId: 'a1', registrationId: 'Z' }, { slotId: 'a2', registrationId: 'X' }],
    );
    expect(plan.assignments).toEqual([
      { slotId: 'a1', registrationId: 'Z' },
      { slotId: 'a2', registrationId: 'X' },
    ]);
  });

  it('ready 자리에도 그 조 소속 팀이면 override 로 바꿀 수 있다', () => {
    const plan = planFillFromStandings(
      previewOf([row('s1', 'ready', { candidateRegistrationId: 'X' })], { s1: ['X', 'Y'] }),
      [{ slotId: 's1', registrationId: 'Y' }],
    );
    expect(plan.assignments).toEqual([{ slotId: 's1', registrationId: 'Y' }]);
  });

  // 허용 범위는 스펙 S4 그대로다 — tied 자리 = 그 동률 팀만, ready 자리 = 그 자리의 원천 조 팀만, 그 밖은 전부 422.
  // 조 소속(X·Y·Z)과 동률 팀(X·Y)을 일부러 다르게 둬서 "조 소속이면 통과" 같은 느슨한 구현이 red 가 되게 한다.
  const GROUP = ['X', 'Y', 'Z'];
  it.each([
    ['tied 자리에 같은 조지만 동률 밖인 팀', [row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })], 'Z'],
    ['tied 자리에 다른 조 팀', [row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })], 'OUTSIDER'],
    ['ready 자리에 다른 조 팀', [row('s1', 'ready', { candidateRegistrationId: 'X' })], 'OUTSIDER'],
    ['group_incomplete 자리에 그 조 팀', [row('s1', 'group_incomplete')], 'X'],
  ])('잘못된 override(%s)는 422 SLOT_REGISTRATION_INVALID', (_name, rows, registrationId) => {
    expect(failure(() => planFillFromStandings(previewOf(rows, { s1: GROUP }), [{ slotId: 's1', registrationId }]))).toEqual({
      type: UnprocessableEntityException.name,
      code: 'SLOT_REGISTRATION_INVALID',
    });
  });

  it('같은 자리를 두 번 지정하면 422, 이 대회 순위 자리가 아닌 slotId 는 404 SLOT_NOT_FOUND', () => {
    const preview = previewOf([row('s1', 'tied', { tiedRegistrationIds: ['X', 'Y'] })]);
    expect(
      failure(() => planFillFromStandings(preview, [{ slotId: 's1', registrationId: 'X' }, { slotId: 's1', registrationId: 'Y' }])),
    ).toEqual({ type: UnprocessableEntityException.name, code: 'SLOT_REGISTRATION_INVALID' });
    expect(failure(() => planFillFromStandings(preview, [{ slotId: 'ghost', registrationId: 'X' }]))).toEqual({
      type: NotFoundException.name,
      code: 'SLOT_NOT_FOUND',
    });
  });

  it('같은 팀이 두 자리에 배정되면 409 SLOT_TEAM_ALREADY_PLACED (ready 후보 X 와 override X)', () => {
    const preview = previewOf([
      row('s1', 'ready', { candidateRegistrationId: 'X' }),
      row('s2', 'tied', { tiedRegistrationIds: ['X', 'Y'] }),
    ]);
    expect(failure(() => planFillFromStandings(preview, [{ slotId: 's2', registrationId: 'X' }]))).toEqual({
      type: ConflictException.name,
      code: 'SLOT_TEAM_ALREADY_PLACED',
    });
  });
});

describe('서비스 본문 — 권한·대상·잠금 순서', () => {
  const user = { id: 'user-1', email: 'a@test.v1', accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
  const adminRow = (adminRole: 'owner' | 'ops' | 'support') => ({
    id: 'admin-1', userId: 'user-1', adminRole, status: 'active', user: { accountStatus: 'active' },
  });
  const swapPreview: GroupRankPreview = {
    rows: [
      row('a1', 'tied', { label: 'A조 1위', tiedRegistrationIds: ['X', 'Y'], currentRegistrationId: 'X' }),
      row('a2', 'tied', { label: 'A조 2위', tiedRegistrationIds: ['X', 'Y'], currentRegistrationId: 'Y' }),
    ],
    groupMembers: new Map([['a1', new Set(['X', 'Y', 'Z'])], ['a2', new Set(['X', 'Y', 'Z'])]]),
  };

  function setup(options: { role?: 'owner' | 'ops' | 'support' | null; kind?: string; preview?: GroupRankPreview } = {}) {
    const events: string[] = [];
    const prisma = {
      v1AdminUser: { findUnique: jest.fn().mockResolvedValue(options.role === null ? null : adminRow(options.role ?? 'ops')) },
      v1Tournament: { findFirst: kindAwareFindFirst({ id: 'tournament-1', kind: options.kind ?? 'regular_tournament' }) },
      v1AdminActionLog: { create: jest.fn(async () => { events.push('audit'); return { id: 'log-1' }; }) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>): Promise<unknown> => { events.push('tx'); return fn(prisma); }),
    };
    loadMock.mockReset();
    loadMock.mockImplementation(async () => { events.push('load'); return options.preview ?? swapPreview; });
    const deps = {
      prisma: prisma as unknown as PrismaService,
      adminContext: new AdminContextService(prisma as unknown as PrismaService),
      lock: jest.fn(async () => { events.push('lock'); }),
      assignBatch: jest.fn(async (_tx: Prisma.TransactionClient, _admin: unknown, changes: readonly { slotId: string; registrationId: string | null }[]) => {
        events.push(`batch:${changes.map((change) => `${change.slotId}=${change.registrationId}`).join(',')}`);
      }),
      transactionOptions: { timeout: 45_000, maxWait: 5_000 },
    };
    return { prisma, deps, events };
  }

  it('맞바꾸기: 트랜잭션 → 잠금 → 읽기 → 배치(바뀔 자리 전부 한 번에) → 감사 로그 순이고 트랜잭션 옵션을 그대로 쓴다', async () => {
    const { prisma, deps, events } = setup();
    const result = await fillSlotsFromStandings(deps, user, 'tournament-1', [
      { slotId: 'a1', registrationId: 'Y' },
      { slotId: 'a2', registrationId: 'X' },
    ]);
    expect(events).toEqual(['tx', 'lock', 'load', 'batch:a1=Y,a2=X', 'audit']);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), deps.transactionOptions);
    expect(deps.lock).toHaveBeenCalledWith(prisma, { id: 'tournament-1', kind: 'regular_tournament' });
    expect(result).toEqual({
      assignments: [{ slotId: 'a1', registrationId: 'Y' }, { slotId: 'a2', registrationId: 'X' }],
      skipped: [],
    });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminUserId: 'admin-1',
        action: 'tournament.slots.fill_from_standings',
        targetType: 'tournament',
        targetId: 'tournament-1',
        afterJson: expect.objectContaining({ assignments: result.assignments, overridden: ['a1', 'a2'] }),
      }),
    });
  });

  it('바꿀 자리가 없으면(이미 맞게 들어 있거나 전부 건너뜀) 배치를 부르지 않는다 — 시작된 결선 경기 자리를 건드리지 않게', async () => {
    const preview: GroupRankPreview = {
      rows: [row('a1', 'ready', { candidateRegistrationId: 'X', currentRegistrationId: 'X' }), row('b1', 'group_incomplete')],
      groupMembers: new Map([['a1', new Set(['X'])], ['b1', new Set(['Z'])]]),
    };
    const { deps, events } = setup({ preview });
    await expect(fillSlotsFromStandings(deps, user, 'tournament-1', [])).resolves.toEqual({
      assignments: [{ slotId: 'a1', registrationId: 'X' }],
      skipped: [{ slotId: 'b1', reason: 'group_incomplete' }],
    });
    expect(deps.assignBatch).not.toHaveBeenCalled();
    expect(events).toEqual(['tx', 'lock', 'load', 'audit']);
  });

  it('support 어드민은 403 — 트랜잭션도 읽기도 시작하지 않는다 (대조: ops 는 통과)', async () => {
    const denied = setup({ role: 'support' });
    await expect(fillSlotsFromStandings(denied.deps, user, 'tournament-1', [])).rejects.toBeInstanceOf(ForbiddenException);
    expect(denied.prisma.$transaction).not.toHaveBeenCalled();
    expect(loadMock).not.toHaveBeenCalled();
    const allowed = setup({ role: 'ops', preview: { rows: [], groupMembers: new Map() } });
    await expect(fillSlotsFromStandings(allowed.deps, user, 'tournament-1', [])).resolves.toEqual({ assignments: [], skipped: [] });
  });

  it('어드민이 아니면 403, 정규 리그 id 는 404 TOURNAMENT_NOT_FOUND (종류 조건이 실제로 걸린다)', async () => {
    const stranger = setup({ role: null });
    await expect(fillSlotsFromStandings(stranger.deps, user, 'tournament-1', [])).rejects.toBeInstanceOf(ForbiddenException);
    const league = setup({ kind: 'regular_league' });
    await expect(fillSlotsFromStandings(league.deps, user, 'tournament-1', [])).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_FOUND' },
    });
    expect(league.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('잘못된 override 는 잠금·읽기 뒤 배치·감사 로그 전에 거절한다 — 부분 적용 없음', async () => {
    const { deps, events } = setup();
    await expect(
      fillSlotsFromStandings(deps, user, 'tournament-1', [{ slotId: 'a1', registrationId: 'OUTSIDER' }]),
    ).rejects.toMatchObject({ response: { code: 'SLOT_REGISTRATION_INVALID' } });
    expect(events).toEqual(['tx', 'lock', 'load']);
  });

  it('미리보기는 support 도 볼 수 있고(getActiveAdmin) 행을 slots 로 감싸 돌려준다, 정규 리그 id 는 404', async () => {
    const support = setup({ role: 'support' });
    await expect(previewGroupRankStandings(support.deps, user, 'tournament-1')).resolves.toEqual({ slots: swapPreview.rows });
    const stranger = setup({ role: null });
    await expect(previewGroupRankStandings(stranger.deps, user, 'tournament-1')).rejects.toBeInstanceOf(ForbiddenException);
    const league = setup({ kind: 'regular_league' });
    await expect(previewGroupRankStandings(league.deps, user, 'tournament-1')).rejects.toMatchObject({
      response: { code: 'TOURNAMENT_NOT_FOUND' },
    });
  });
});
