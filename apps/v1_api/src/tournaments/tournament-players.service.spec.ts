/**
 * tournament-players.service.spec.ts
 *
 * Contract tests for tournament player roster management:
 * - manager+ gate (non-manager → 403, non-admin → 403)
 * - roster lock guard (rosterLockedAt present → 409 ROSTER_LOCKED)
 * - maxPlayers cap (at limit → 409 ROSTER_FULL)
 * - team membership check (userId not in team → 400 USER_NOT_TEAM_MEMBER)
 * - duplicate player guard (already registered → 409 PLAYER_ALREADY_REGISTERED)
 * - happy-path add, list, remove
 * - admin eligibility update with audit log
 * - admin CSV export (PII gate)
 *
 * Each it() asserts observable behaviour (returned shape or thrown error), never a mock
 * for its own sake. No fake tests.
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContextService } from '../common/admin-context.service';
import { TournamentPlayersService } from './tournament-players.service';

// ─── 테스트 픽스처 ───────────────────────────────────────────────────────────────

const manager = {
  id: 'manager-user-id',
  email: 'm@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const nonManager = {
  id: 'plain-user-id',
  email: 'user@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const adminUser = {
  id: 'admin-user-id',
  email: 'admin@teameet.v1',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};
const opsAdminRecord = {
  id: 'ops-admin-id',
  userId: 'admin-user-id',
  adminRole: 'ops' as const,
  status: 'active' as const,
};
const supportAdminRecord = {
  id: 'support-admin-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
};

function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1',
    tournamentId: 'tournament-1',
    teamId: 'team-1',
    appliedByUserId: 'manager-user-id',
    status: 'draft',
    rosterLockedAt: null,
    ...overrides,
  };
}

function tournamentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tournament-1',
    minPlayers: 6,
    maxPlayers: 10,
    deletedAt: null,
    ...overrides,
  };
}

function playerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'player-1',
    registrationId: 'reg-1',
    userId: 'player-user-id',
    realName: '홍길동',
    birthDateSnapshot: '1995-03-15',
    eligibilityStatus: 'needs_review',
    eligibilityNote: null,
    addedAt: new Date('2026-06-14T00:00:00Z'),
    removedAt: null,
    createdAt: new Date('2026-06-14T00:00:00Z'),
    updatedAt: new Date('2026-06-14T00:00:00Z'),
    ...overrides,
  };
}

function teamPlayerMembershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mem-2',
    role: 'member',
    user: {
      phone: '01012345678',
      profile: {
        displayName: '홍길동',
        birthDate: '1995-03-15',
      },
    },
    ...overrides,
  };
}

// ─── 테스트 스위트 ───────────────────────────────────────────────────────────────

describe('TournamentPlayersService', () => {
  let service: TournamentPlayersService;
  let prisma: {
    v1TeamMembership: { findFirst: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentRegistration: { findFirst: jest.Mock; findUnique: jest.Mock };
    v1TournamentPlayer: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
    };
    v1AdminUser: { findUnique: jest.Mock };
    v1AdminActionLog: { create: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1TeamMembership: { findFirst: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentRegistration: { findFirst: jest.fn(), findUnique: jest.fn() },
      v1TournamentPlayer: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      v1AdminUser: { findUnique: jest.fn() },
      v1AdminActionLog: { create: jest.fn().mockResolvedValue({ id: 'action-log-1' }) },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      $transaction: jest.fn(),
    };

    const p = prisma;
    (prisma.$transaction as jest.Mock).mockImplementation(
      (cb: (tx: typeof p) => Promise<unknown>) => cb(p),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TournamentPlayersService,
        AdminContextService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TournamentPlayersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 1. manager+ 게이트 ─────────────────────────────────────────────────────

  it('addPlayer: non-manager → 403 PERMISSION_DENIED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null); // 권한 없음

    await expect(
      service.addPlayer(nonManager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  it('listPlayers: non-manager → 403 PERMISSION_DENIED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue(null);

    await expect(service.listPlayers(nonManager, 'tournament-1', 'reg-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  // ─── 2. 등록 미발견 ─────────────────────────────────────────────────────────

  it('addPlayer: unknown registrationId → 404 REGISTRATION_NOT_FOUND', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(null);

    await expect(
      service.addPlayer(manager, 'tournament-1', 'ghost-reg', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'REGISTRATION_NOT_FOUND' } });
    await expect(
      service.addPlayer(manager, 'tournament-1', 'ghost-reg', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── 3. 잠금 가드 ──────────────────────────────────────────────────────────

  it('addPlayer: rosterLockedAt set → 409 ROSTER_LOCKED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ rosterLockedAt: new Date('2026-06-10T00:00:00Z') }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_LOCKED' } });
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  it('removePlayer: rosterLockedAt set → 409 ROSTER_LOCKED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ rosterLockedAt: new Date('2026-06-10T00:00:00Z') }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });

    await expect(
      service.removePlayer(manager, 'tournament-1', 'reg-1', 'player-1'),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_LOCKED' } });
    expect(prisma.v1TournamentPlayer.update).not.toHaveBeenCalled();
  });

  // ─── 4. maxPlayers 초과 ────────────────────────────────────────────────────

  it('addPlayer: at maxPlayers cap → 409 ROSTER_FULL', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ maxPlayers: 3 }));
    prisma.v1TournamentPlayer.count.mockResolvedValue(3); // 이미 maxPlayers 도달

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_FULL' } });
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  // ─── 5. 팀 멤버 아님 ──────────────────────────────────────────────────────

  it('addPlayer: userId not in team → 400 USER_NOT_TEAM_MEMBER', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    // 각 addPlayer 호출은 findFirst를 2회 사용(매니저 권한 체크 → 통과, 팀 멤버 체크 → null).
    // 아래에서 addPlayer를 2회 호출하므로 호출당 2값 × 2회 = 4값을 큐잉한다.
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(null);
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'outsider-user-id',
        realName: '이방인',
      }),
    ).rejects.toMatchObject({ response: { code: 'USER_NOT_TEAM_MEMBER' } });
    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'outsider-user-id',
        realName: '이방인',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ─── 6. 중복 등록 ─────────────────────────────────────────────────────────

  it('addPlayer: same userId already active → 409 PLAYER_ALREADY_REGISTERED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' }) // manager 체크
      .mockResolvedValueOnce(teamPlayerMembershipRow()); // 팀 멤버 체크
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(playerRow()); // 이미 존재

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'PLAYER_ALREADY_REGISTERED' } });
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  // ─── 7. 선수 추가 happy path ──────────────────────────────────────────────

  it('addPlayer: manager + valid input → player created with needs_review default', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(null); // 중복 없음
    prisma.v1TournamentPlayer.upsert.mockResolvedValue(playerRow());

    const result = await service.addPlayer(manager, 'tournament-1', 'reg-1', {
      userId: 'player-user-id',
      realName: '홍길동',
      birthDate: '1995-03-15',
    });

    expect(result).toMatchObject({
      id: 'player-1',
      userId: 'player-user-id',
      realName: '홍길동',
      eligibilityStatus: 'needs_review',
    });
    expect(prisma.v1TournamentPlayer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          registrationId: 'reg-1',
          userId: 'player-user-id',
          realName: '홍길동',
          birthDateSnapshot: '1995-03-15',
          eligibilityStatus: 'needs_review',
        }),
      }),
    );
  });

  it('addPlayer: team member missing required profile → 400 PLAYER_REQUIRED_PROFILE_MISSING', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow({ user: { phone: null, profile: { displayName: '홍길동', birthDate: '1995-03-15' } } }));
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'PLAYER_REQUIRED_PROFILE_MISSING' } });
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  // ─── 8. 명단 조회 + belowMinimum ────────────────────────────────────────

  it('listPlayers: returns players list and belowMinimum flag', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'owner' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ minPlayers: 6 }));
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([playerRow(), playerRow({ id: 'p2', userId: 'u2' })]);

    const result = await service.listPlayers(manager, 'tournament-1', 'reg-1');

    expect(result.players).toHaveLength(2);
    expect(result.belowMinimum).toBe(true); // 2 < minPlayers(6)
  });

  it('listPlayers: belowMinimum=false when at or above minPlayers', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'owner' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ minPlayers: 2 }));
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      playerRow(),
      playerRow({ id: 'p2', userId: 'u2' }),
    ]);

    const result = await service.listPlayers(manager, 'tournament-1', 'reg-1');
    expect(result.belowMinimum).toBe(false);
  });

  // ─── 9. 선수 삭제 happy path ──────────────────────────────────────────────

  it('removePlayer: manager + unlocked → soft removes player', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(playerRow());
    const removedAt = new Date('2026-06-14T10:00:00Z');
    prisma.v1TournamentPlayer.update.mockResolvedValue(playerRow({ removedAt }));

    const result = await service.removePlayer(manager, 'tournament-1', 'reg-1', 'player-1');

    expect(result.removedAt).toBe(removedAt.toISOString());
    expect(prisma.v1TournamentPlayer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'player-1' },
        data: expect.objectContaining({ removedAt: expect.any(Date) }),
      }),
    );
  });

  it('removePlayer: player not found → 404 PLAYER_NOT_FOUND', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(null);

    await expect(
      service.removePlayer(manager, 'tournament-1', 'reg-1', 'ghost-player'),
    ).rejects.toMatchObject({ response: { code: 'PLAYER_NOT_FOUND' } });
    await expect(
      service.removePlayer(manager, 'tournament-1', 'reg-1', 'ghost-player'),
    ).rejects.toThrow(NotFoundException);
  });

  it('updatePlayer: manager + unlocked → updates eligibility status', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(playerRow());
    prisma.v1TournamentPlayer.update.mockResolvedValue(playerRow({ eligibilityStatus: 'pro' }));

    const result = await service.updatePlayer(manager, 'tournament-1', 'reg-1', 'player-1', {
      eligibilityStatus: 'pro',
    });

    expect(result).toMatchObject({ id: 'player-1', eligibilityStatus: 'pro' });
    expect(prisma.v1TournamentPlayer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'player-1' },
        data: {
          eligibilityStatus: 'pro',
          eligibilityNote: null,
        },
      }),
    );
  });

  it('updatePlayer: latest team member profile is not revalidated for eligibility-only edit', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(playerRow());
    prisma.v1TournamentPlayer.update.mockResolvedValue(playerRow({ eligibilityStatus: 'pro' }));

    const result = await service.updatePlayer(manager, 'tournament-1', 'reg-1', 'player-1', {
      eligibilityStatus: 'pro',
    });

    expect(result).toMatchObject({ id: 'player-1', eligibilityStatus: 'pro' });
    expect(prisma.v1TeamMembership.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.v1TournamentPlayer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'player-1' },
        data: {
          eligibilityStatus: 'pro',
          eligibilityNote: null,
        },
      }),
    );
  });

  it('updatePlayer: rosterLockedAt set → 409 ROSTER_LOCKED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ rosterLockedAt: new Date('2026-06-10T00:00:00Z') }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });

    await expect(
      service.updatePlayer(manager, 'tournament-1', 'reg-1', 'player-1', {
        eligibilityStatus: 'non_pro',
      }),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_LOCKED' } });
    expect(prisma.v1TournamentPlayer.update).not.toHaveBeenCalled();
  });

  it('updatePlayer: player not found → 404 PLAYER_NOT_FOUND', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(null);

    await expect(
      service.updatePlayer(manager, 'tournament-1', 'reg-1', 'ghost-player', {
        eligibilityStatus: 'non_pro',
      }),
    ).rejects.toMatchObject({ response: { code: 'PLAYER_NOT_FOUND' } });
  });

  // ─── 10. 어드민 선출여부 확정 ─────────────────────────────────────────────

  it('updateEligibility: support admin cannot mutate → 403', async () => {
    const supportUser = {
      id: 'support-user-id',
      email: 's@teameet.v1',
      accountStatus: 'active' as const,
      onboardingStatus: 'completed' as const,
    };
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);

    await expect(
      service.updateEligibility(supportUser, 'player-1', { eligibilityStatus: 'non_pro' }),
    ).rejects.toMatchObject({ response: { code: 'PERMISSION_DENIED' } });
    expect(prisma.v1TournamentPlayer.update).not.toHaveBeenCalled();
  });

  it('updateEligibility: ops admin + valid input → updates status + writes audit log', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(playerRow());
    prisma.v1TournamentPlayer.update.mockResolvedValue(
      playerRow({ eligibilityStatus: 'non_pro', eligibilityNote: '확인완료' }),
    );

    const result = await service.updateEligibility(adminUser, 'player-1', {
      eligibilityStatus: 'non_pro',
      note: '확인완료',
    });

    expect(result).toMatchObject({ eligibilityStatus: 'non_pro', eligibilityNote: '확인완료' });
    expect(prisma.v1AdminActionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'player.eligibility',
          targetType: 'tournament_player',
          targetId: 'player-1',
        }),
      }),
    );
  });

  it('updateEligibility: unknown player → 404 PLAYER_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(null);

    await expect(
      service.updateEligibility(adminUser, 'ghost-player', { eligibilityStatus: 'pro' }),
    ).rejects.toMatchObject({ response: { code: 'PLAYER_NOT_FOUND' } });
  });

  // ─── 11. CSV export 어드민 게이트 ─────────────────────────────────────────

  it('exportCsv: non-admin → 403', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(service.exportCsv(nonManager, 'reg-1')).rejects.toThrow(ForbiddenException);
  });

  it('exportCsv: admin + valid registrationId → returns {filename, csv} with PII', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      id: 'reg-1',
      team: { name: '번개팀' },
    });
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      {
        ...playerRow(),
        user: { profile: { nickname: '번개맨' } },
      },
    ]);

    const result = await service.exportCsv(adminUser, 'reg-1');

    expect(result.filename).toMatch(/\.csv$/);
    expect(result.csv).toContain('realName,birthDate,eligibility,nickname');
    expect(result.csv).toContain('홍길동');
    expect(result.csv).toContain('번개맨');
  });

  it('exportCsv: unknown registrationId → 404 REGISTRATION_NOT_FOUND', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);

    await expect(service.exportCsv(adminUser, 'ghost-reg')).rejects.toMatchObject({
      response: { code: 'REGISTRATION_NOT_FOUND' },
    });
    await expect(service.exportCsv(adminUser, 'ghost-reg')).rejects.toThrow(NotFoundException);
  });

  // ─── 12. CSV 수식 인젝션 차단 (ROSTER-002) ────────────────────────────────
  it('exportCsv: realName starting with = → prefixed with single-quote to neutralise injection', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      id: 'reg-1',
      team: { name: '테스트팀' },
    });
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      {
        ...playerRow({ realName: '=CMD|"/C calc"!A0' }),
        user: { profile: { nickname: '+악성닉네임' } },
      },
    ]);

    const result = await service.exportCsv(adminUser, 'reg-1');

    // = 로 시작하는 realName → 작은따옴표 prefix 처리되어야 함
    expect(result.csv).toContain("'=CMD|");
    // + 로 시작하는 nickname → 작은따옴표 prefix 처리되어야 함
    expect(result.csv).toContain("'+악성닉네임");
    // 원본 수식 문자가 따옴표 없이 그대로 노출되면 안 됨
    expect(result.csv).not.toMatch(/^=CMD/m);
  });

  it('exportCsv: realName starting with - or @ → prefixed with single-quote', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      id: 'reg-1',
      team: { name: '테스트팀' },
    });
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      {
        ...playerRow({ realName: '-1+2' }),
        user: { profile: { nickname: '@악성닉' } },
      },
    ]);

    const result = await service.exportCsv(adminUser, 'reg-1');

    expect(result.csv).toContain("'-1+2");
    expect(result.csv).toContain("'@악성닉");
  });
});
