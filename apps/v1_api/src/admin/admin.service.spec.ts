/**
 * admin.service.spec.ts
 *
 * Contract test for the realtime side-effect of AdminService.changeUserStatus():
 * transitioning a user to a disable-class accountStatus (suspended/blocked/deleted)
 * must force-disconnect any realtime socket that user already holds, so an
 * already-connected client can't keep receiving notifications/chat past the
 * status change. Reverting to `active` must not touch realtime at all.
 *
 * Each test validates observable behaviour (RealtimeGateway call args, or the
 * resolved changeUserStatus result). No mock is asserted for its own sake.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AdminService } from './admin.service';

const actorAuthUser = {
  id: 'ops-user-id',
  email: 'ops@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const actorAdminRecord = {
  id: 'ops-admin-record-id',
  userId: 'ops-user-id',
  adminRole: 'ops' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};

const targetUserId = 'target-user-id';

describe('AdminService.changeUserStatus — realtime disconnect side effect', () => {
  let service: AdminService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1User: { findUnique: jest.Mock; update: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    v1AuthIdentity: { findMany: jest.Mock; update: jest.Mock };
    v1UserProfile: { updateMany: jest.Mock };
    // 계정 비활성화 시 팀 권한 검사·명단 정리가 이 모델들을 쓴다.
    v1TeamMembership: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    v1TournamentPlayer: { findMany: jest.Mock; updateMany: jest.Mock };
    v1Team: { update: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let realtimeGateway: { forceDisconnectUser: jest.Mock };
  let logger: { warn: jest.Mock };

  // deletedAt 은 deleteUser() 만 기록한다. changeUserStatus(status:'deleted') 로 만들어진
  // 행은 accountStatus 만 'deleted' 이고 deletedAt 은 null 이다 — 두 경우를 구분해야 해서
  // 헬퍼가 deletedAt 을 받는다.
  function targetUser(accountStatus: string, deletedAt: Date | null = null) {
    return { id: targetUserId, accountStatus, deletedAt };
  }

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1User: { findUnique: jest.fn(), update: jest.fn() },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      v1AuthIdentity: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      v1UserProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      v1TeamMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      v1TournamentPlayer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1Team: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const p = prisma;
    prisma.$transaction.mockImplementation(
      (
        cb: (
          tx: Pick<
            typeof p,
            'v1AdminUser' | 'v1User' | 'v1AdminActionLog' | 'v1StatusChangeLog' | 'v1AuthIdentity' | 'v1UserProfile' | 'v1TeamMembership' | 'v1Team' | 'v1TournamentPlayer' | '$queryRaw'
          >,
        ) => Promise<unknown>,
      ) =>
        cb({
          v1AdminUser: p.v1AdminUser,
          v1User: p.v1User,
          v1AdminActionLog: p.v1AdminActionLog,
          v1StatusChangeLog: p.v1StatusChangeLog,
          v1AuthIdentity: p.v1AuthIdentity,
          v1UserProfile: p.v1UserProfile,
          v1TeamMembership: p.v1TeamMembership,
          v1Team: p.v1Team,
          v1TournamentPlayer: p.v1TournamentPlayer,
          $queryRaw: p.$queryRaw,
        }),
    );

    realtimeGateway = { forceDisconnectUser: jest.fn() };
    logger = { warn: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: getLoggerToken(AdminService.name), useValue: logger },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  it('suspending a user force-disconnects that user’s realtime socket after the transaction commits', async () => {
    prisma.v1AdminUser.findUnique
      .mockResolvedValueOnce(actorAdminRecord) // getTransactionMutationAdmin
      .mockResolvedValueOnce(null); // targetAdminRecord — not an admin
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('suspended'));

    const result = await service.changeUserStatus(actorAuthUser, targetUserId, {
      status: 'suspended',
      reason: '규정 위반',
    });

    expect(result).toMatchObject({ userId: targetUserId, status: 'suspended' });
    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledTimes(1);
    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledWith(targetUserId);
  });

  it('탈퇴 처리된 계정(deletedAt 기록됨)은 다시 살릴 수 없다', async () => {
    // deleteUser() 의 탈퇴 처리는 이메일·전화번호를 tombstone 값으로 덮고 인증 시각을 지우며
    // deletedAt 을 남긴다. 그 계정을 active 로 올리면 연락처가 없고 인증도 안 된 채 살아 있는
    // 계정이 된다 — 로그인도, 인증번호 재발송도, 연락도 안 되는데 목록에는 정상 회원으로 보인다.
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('deleted', new Date('2026-08-01T00:00:00.000Z')));

    await expect(
      service.changeUserStatus(actorAuthUser, targetUserId, { status: 'active', reason: '실수로 삭제' }),
    ).rejects.toMatchObject({ response: { code: 'USER_DELETED_IRREVERSIBLE' } });

    // 막혔다는 것은 곧 계정이 그대로라는 뜻이다.
    expect(prisma.v1User.update).not.toHaveBeenCalled();
  });

  it('상태만 deleted 인 계정(deletedAt 없음)은 active 로 되돌릴 수 있다', async () => {
    // changeUserStatus(status:'deleted') 는 accountStatus 한 줄만 바꾼다 — tombstone 도,
    // 프로필 마스킹도, deletedAt 도 없다. 개인정보가 그대로 남아 있으므로 되살려도
    // "연락 안 되는 유령 계정" 이 되지 않는다. 어드민 모달의 '삭제' 오클릭이 어떤 경로로도
    // 복구 불가가 되면 안 되고, 409 문구("개인정보가 지워져 되살릴 수 없어요")도 이 행에는
    // 거짓이다. 가드가 accountStatus 만 보면 이 테스트는 반드시 실패한다.
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('deleted'));
    prisma.v1User.update.mockResolvedValue(targetUser('active'));

    const result = await service.changeUserStatus(actorAuthUser, targetUserId, {
      status: 'active',
      reason: '오클릭 복구',
    });

    expect(result).toMatchObject({ userId: targetUserId, status: 'active' });
    expect(prisma.v1User.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: targetUserId }, data: { accountStatus: 'active' } }),
    );
  });

  it('이미 삭제된 계정을 다시 삭제로 두는 것은 막지 않는다', async () => {
    // 같은 상태로 두는 요청까지 409 로 만들면 재시도가 실패로 보인다.
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('deleted', new Date('2026-08-01T00:00:00.000Z')));
    prisma.v1User.update.mockResolvedValue(targetUser('deleted', new Date('2026-08-01T00:00:00.000Z')));

    await expect(
      service.changeUserStatus(actorAuthUser, targetUserId, { status: 'deleted', reason: '재확인' }),
    ).resolves.toMatchObject({ status: 'deleted' });
  });

  it('blocking a user also force-disconnects the realtime socket', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('blocked'));

    await service.changeUserStatus(actorAuthUser, targetUserId, { status: 'blocked', reason: '신고 누적' });

    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledWith(targetUserId);
  });

  it('deleting a user (via status change) also force-disconnects the realtime socket', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('deleted'));

    await service.changeUserStatus(actorAuthUser, targetUserId, { status: 'deleted', reason: '탈퇴 처리' });

    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledWith(targetUserId);
  });

  it('restoring a user to active does NOT force-disconnect any realtime socket', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('suspended'));
    prisma.v1User.update.mockResolvedValue(targetUser('active'));

    const result = await service.changeUserStatus(actorAuthUser, targetUserId, {
      status: 'active',
      reason: '이의 제기 수용',
    });

    expect(result).toMatchObject({ userId: targetUserId, status: 'active' });
    expect(realtimeGateway.forceDisconnectUser).not.toHaveBeenCalled();
  });

  it('a realtime gateway failure is swallowed with a structured warn log and does not fail the status change', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('suspended'));
    const gatewayError = new Error('socket.io server unavailable');
    realtimeGateway.forceDisconnectUser.mockImplementation(() => {
      throw gatewayError;
    });

    await expect(
      service.changeUserStatus(actorAuthUser, targetUserId, { status: 'suspended', reason: '규정 위반' }),
    ).resolves.toMatchObject({ userId: targetUserId, status: 'suspended' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: targetUserId, status: 'suspended', err: gatewayError }),
      expect.any(String),
    );
  });
});

describe('AdminService.deleteUser — realtime disconnect side effect', () => {
  // deleteUser() is a separate mutation path from changeUserStatus() (a distinct
  // controller endpoint) that also lands on the disable-class accountStatus
  // ('deleted') — a Copilot review on PR #98 caught that the force-disconnect
  // fix above was applied to changeUserStatus() but not here, so a deleted
  // account kept receiving realtime notifications/chat until it reconnected.
  let service: AdminService;
  let prisma: {
    v1AdminUser: { findUnique: jest.Mock };
    v1User: { findUnique: jest.Mock; update: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    v1AuthIdentity: { findMany: jest.Mock; update: jest.Mock };
    v1UserProfile: { updateMany: jest.Mock };
    // finding #39: 탈퇴 시 사용자 단위 공개 기록 동의도 REVOKED로 함께 전환해야
    // 공개 기록 게이트(isParticipantPubliclyEligible)가 자연히 막아준다.
    v1UserRecordConsent: { updateMany: jest.Mock };
    // 계정 비활성화 시 팀 권한 검사·명단 정리가 이 모델들을 쓴다.
    v1TeamMembership: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    v1TournamentPlayer: { findMany: jest.Mock; updateMany: jest.Mock };
    v1Team: { update: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let realtimeGateway: { forceDisconnectUser: jest.Mock };
  let logger: { warn: jest.Mock };

  function targetUser(accountStatus: string) {
    return { id: targetUserId, accountStatus, email: 'target@teameet.v1', phone: null, deletedAt: null };
  }

  beforeEach(async () => {
    prisma = {
      v1AdminUser: { findUnique: jest.fn() },
      v1User: { findUnique: jest.fn(), update: jest.fn() },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      v1AuthIdentity: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      v1UserProfile: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      v1UserRecordConsent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      v1TeamMembership: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      v1TournamentPlayer: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      v1Team: { update: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    const p = prisma;
    prisma.$transaction.mockImplementation(
      (
        cb: (
          tx: Pick<
            typeof p,
            'v1AdminUser' | 'v1User' | 'v1AdminActionLog' | 'v1StatusChangeLog' | 'v1AuthIdentity' | 'v1UserProfile' | 'v1UserRecordConsent' | 'v1TeamMembership' | 'v1Team' | 'v1TournamentPlayer' | '$queryRaw'
          >,
        ) => Promise<unknown>,
      ) =>
        cb({
          v1AdminUser: p.v1AdminUser,
          v1User: p.v1User,
          v1AdminActionLog: p.v1AdminActionLog,
          v1StatusChangeLog: p.v1StatusChangeLog,
          v1AuthIdentity: p.v1AuthIdentity,
          v1UserProfile: p.v1UserProfile,
          v1UserRecordConsent: p.v1UserRecordConsent,
          v1TeamMembership: p.v1TeamMembership,
          v1Team: p.v1Team,
          v1TournamentPlayer: p.v1TournamentPlayer,
          $queryRaw: p.$queryRaw,
        }),
    );

    realtimeGateway = { forceDisconnectUser: jest.fn() };
    logger = { warn: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: realtimeGateway },
        { provide: getLoggerToken(AdminService.name), useValue: logger },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  afterEach(() => jest.clearAllMocks());

  it('deleting a user via deleteUser() force-disconnects that user’s realtime socket after the transaction commits', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('deleted'));

    const result = await service.deleteUser(actorAuthUser, targetUserId, { reason: '이용약관 위반' });

    expect(result).toMatchObject({ userId: targetUserId, status: 'deleted' });
    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledTimes(1);
    expect(realtimeGateway.forceDisconnectUser).toHaveBeenCalledWith(targetUserId);
  });

  it('deleteUser()가 탈퇴 계정의 공개 기록 동의를 REVOKED로 함께 전환한다 (finding #39)', async () => {
    // 동의 상태가 GRANTED로 남아 있으면 공개 기록 게이트(isParticipantPubliclyEligible,
    // public-consent.ts)가 탈퇴 후에도 그 사용자의 경기 기록을 계속 공개 후보로 취급한다.
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('deleted'));

    await service.deleteUser(actorAuthUser, targetUserId, { reason: '이용약관 위반' });

    expect(prisma.v1UserRecordConsent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: targetUserId, state: 'GRANTED' },
        data: expect.objectContaining({ state: 'REVOKED' }),
      }),
    );
  });

  it('a realtime gateway failure during deleteUser() is swallowed with a structured warn log and does not fail the deletion', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValueOnce(actorAdminRecord).mockResolvedValueOnce(null);
    prisma.v1User.findUnique.mockResolvedValue(targetUser('active'));
    prisma.v1User.update.mockResolvedValue(targetUser('deleted'));
    const gatewayError = new Error('socket.io server unavailable');
    realtimeGateway.forceDisconnectUser.mockImplementation(() => {
      throw gatewayError;
    });

    await expect(
      service.deleteUser(actorAuthUser, targetUserId, { reason: '이용약관 위반' }),
    ).resolves.toMatchObject({ userId: targetUserId, status: 'deleted' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: targetUserId, err: gatewayError }),
      expect.any(String),
    );
  });
});

// 매치·팀·팀매치 상태 변경은 로그의 "이전 상태"를 트랜잭션 **밖에서** 읽고 있었다 —
// 그 사이에 다른 조작이 커밋되면 실제와 다른 값이 감사 로그에 남는다. changeUserStatus 는
// 이미 트랜잭션 안에서 행을 잠그고 읽는데 이 셋만 빠져 있었다.
describe('AdminService.changeMatchStatus — 이전 상태를 트랜잭션 안에서 읽는다', () => {
  it('잠금 → 읽기 → 쓰기 순서로 진행하고, 읽은 값이 그대로 로그에 실린다', async () => {
    const prisma = {
      v1AdminUser: { findUnique: jest.fn().mockResolvedValue(actorAdminRecord) },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      v1Match: {
        findUnique: jest.fn().mockResolvedValue({ id: 'match-1', status: 'recruiting' }),
        update: jest.fn().mockResolvedValue({ id: 'match-1', status: 'closed' }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $transaction: jest.fn(),
    };
    const p = prisma;
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        v1AdminActionLog: p.v1AdminActionLog,
        v1StatusChangeLog: p.v1StatusChangeLog,
        v1Match: p.v1Match,
        $queryRaw: p.$queryRaw,
      }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: RealtimeGateway, useValue: { forceDisconnectUser: jest.fn() } },
        { provide: getLoggerToken(AdminService.name), useValue: { warn: jest.fn() } },
      ],
    }).compile();
    const service = module.get(AdminService);

    await service.changeMatchStatus(actorAuthUser, 'match-1', { status: 'closed', reason: '모집 마감' });

    const lock = prisma.$queryRaw.mock.invocationCallOrder[0];
    const read = prisma.v1Match.findUnique.mock.invocationCallOrder[0];
    const write = prisma.v1Match.update.mock.invocationCallOrder[0];
    expect(lock).toBeLessThan(read);
    expect(read).toBeLessThan(write);
    expect(prisma.v1StatusChangeLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ fromStatus: 'recruiting', toStatus: 'closed' }),
      }),
    );
  });
});

