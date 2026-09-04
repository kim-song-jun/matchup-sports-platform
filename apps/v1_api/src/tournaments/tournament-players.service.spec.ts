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
import { kindAwareFindFirst } from '../../test/helpers/kind-aware-find-first';

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
  user: { accountStatus: 'active' as const },
};
const supportAdminRecord = {
  id: 'support-admin-id',
  userId: 'support-user-id',
  adminRole: 'support' as const,
  status: 'active' as const,
  user: { accountStatus: 'active' as const },
};

function registrationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'reg-1',
    tournamentId: 'tournament-1',
    teamId: 'team-1',
    appliedByUserId: 'manager-user-id',
    status: 'draft',
    rosterLockedAt: null,
    rosterDeadlineOverrideAt: null,
    ...overrides,
  };
}

function tournamentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tournament-1',
    minPlayers: 6,
    maxPlayers: 10,
    deletedAt: null,
    rosterDeadlineAt: null,
    genderCategory: null,
    status: 'open',
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
    genderSnapshot: 'male',
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
      // 기본값은 "인증을 마친 팀원" — 명단 등록의 정상 경로다.
      // 미인증 케이스는 이 필드를 null 로 덮어써서 개별 테스트에서 다룬다.
      phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      profile: {
        realName: '홍길동',
        birthDate: '1995-03-15',
        gender: 'male',
      },
    },
    ...overrides,
  };
}

// ─── 테스트 스위트 ───────────────────────────────────────────────────────────────

describe('TournamentPlayersService', () => {
  let service: TournamentPlayersService;
  let prisma: {
    v1TeamMembership: { findFirst: jest.Mock; findMany: jest.Mock };
    v1Tournament: { findFirst: jest.Mock };
    v1TournamentRegistration: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    v1TournamentPlayer: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    v1AdminUser: { findUnique: jest.Mock };
    v1AdminActionLog: { create: jest.Mock; findFirst: jest.Mock };
    v1StatusChangeLog: { create: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      v1TeamMembership: { findFirst: jest.fn(), findMany: jest.fn() },
      v1Tournament: { findFirst: jest.fn() },
      v1TournamentRegistration: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      v1TournamentPlayer: {
        findMany: jest.fn(),
        // Prisma 는 못 찾으면 null 을 준다. 기본값을 undefined 로 두면 "찾았다" 로 읽히는
        // 코드가 mock 에서만 다르게 동작한다.
        findFirst: jest.fn().mockResolvedValue(null),
        // 재추가 시 기존 row(제외된 것 포함)를 확인하는 경로. 기본은 "처음 넣는 선수".
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      v1AdminUser: { findUnique: jest.fn() },
      v1AdminActionLog: {
        create: jest.fn().mockResolvedValue({ id: 'action-log-1' }),
        // 기본은 "어드민이 아직 선출 여부를 확정하지 않음".
        findFirst: jest.fn().mockResolvedValue(null),
      },
      v1StatusChangeLog: { create: jest.fn().mockResolvedValue({ id: 'status-log-1' }) },
      $transaction: jest.fn(),
      // Prisma 의 `$queryRaw` 는 **행 배열**을 준다. `undefined` 로 두면 결과를 순회하는
      // 코드가 mock 에서만 터진다 — 등번호 조회(raw)가 실제로 그랬다.
      // `FOR UPDATE` 잠금처럼 결과를 안 쓰는 호출도 빈 배열이면 그대로 통과한다.
      $queryRaw: jest.fn().mockResolvedValue([]),
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

  // 2026-08-31 커밋 `817e17eea` 는 이 자리에 **"리그 id 로는 선수를 추가할 수 없다"** 를 박았다
  // (대회 표면 봉쇄 — 리그 id 로 대회 API 를 때리지 못하게). 그 판단은 그때 맞았다.
  //
  // **2026-09-02 정본 §3 이 "리그 명단은 대회와 같음" 으로 확정하면서 전제가 바뀌었다.**
  // 명단 컨트롤러는 하나뿐이고 프론트는 리그 참가 등록에도 같은 링크를 그리는데, 봉쇄가
  // 남아 있는 동안 **리그는 어느 경로로도 명단을 만들 수 없었다** — 수동은 404, 자동 확정
  // 잡(`isLeagueRosterAutoConfirmEnabled`)은 기본이 꺼짐이다. 2026-09-04 alpha 실측에서
  // 팀장 명단 화면이 통째로 `TOURNAMENT_NOT_FOUND` 로 떴다.
  //
  // 그래서 봉쇄를 **명단 표면에서만** 걷는다. bracket·admin-registrations 의 표면 봉쇄는
  // 그대로 두므로, 이 파일의 변경이 그쪽까지 여는 것으로 읽히면 안 된다.
  //
  // 아래 세 테스트는 전부 **"404 가 아니다"가 아니라 "리그 행의 값을 실제로 썼다"** 를 단언한다.
  // 단순히 통과 여부만 보면 게이트를 되돌려도 다른 이유로 던져 초록일 수 있다.
  it('addPlayer: 리그도 대회와 같은 명단 규칙을 탄다 — 봉쇄가 아니라 리그의 정원에서 막힌다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow());
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst(tournamentRow({ id: 'league-1', kind: 'regular_league', maxPlayers: 3 })),
    );
    prisma.v1TournamentPlayer.count.mockResolvedValue(3); // 리그의 maxPlayers 에 도달

    // `ROSTER_FULL` 이어야 한다 — 그 코드가 나왔다는 것은 조회가 리그 행을 찾았고(게이트 통과)
    // **그 행의 maxPlayers 를 읽었다**는 뜻이다. 게이트를 되돌리면 `TOURNAMENT_NOT_FOUND` 다.
    await expect(
      service.addPlayer(manager, 'league-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_FULL' } });
  });

  it('listPlayers: 리그 명단을 조회할 수 있다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ role: 'manager', status: 'active' });
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst(tournamentRow({ id: 'league-1', kind: 'regular_league', minPlayers: 6 })),
    );
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([playerRow()]);

    const result = await service.listPlayers(manager, 'league-1', 'reg-1');
    expect(result.players).toHaveLength(1);
    // 리그 행의 minPlayers 로 최소 인원 판정이 돈다 — 1명이라 아직 미달이다.
    expect(result.belowMinimum).toBe(true);
  });

  it.each([
    ['removePlayer', (s: TournamentPlayersService) => s.removePlayer(manager, 'league-1', 'reg-1', 'player-1')],
    [
      'updatePlayer',
      (s: TournamentPlayersService) =>
        s.updatePlayer(manager, 'league-1', 'reg-1', 'player-1', { eligibilityStatus: 'non_pro' }),
    ],
  ])('%s: 리그의 명단 마감 시각을 실제로 읽는다', async (_name, call) => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst(
        tournamentRow({
          id: 'league-1',
          kind: 'regular_league',
          rosterDeadlineAt: new Date('2020-01-01T00:00:00.000Z'), // 이미 지난 마감
        }),
      ),
    );

    // 마감 초과로 막히는 것이 곧 "리그 행을 찾아 그 rosterDeadlineAt 을 읽었다" 는 증거다.
    await expect(call(service)).rejects.toMatchObject({
      response: { code: 'ROSTER_DEADLINE_PASSED' },
    });
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
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

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
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    await expect(
      service.removePlayer(manager, 'tournament-1', 'reg-1', 'player-1'),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_LOCKED' } });
    expect(prisma.v1TournamentPlayer.update).not.toHaveBeenCalled();
  });

  // ─── 3-1. 명단 제출 마감 하드 차단 + 개별 예외 ─────────────────────────────

  const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

  it('addPlayer: rosterDeadlineAt 과거 + override 없음 → 409 ROSTER_DEADLINE_PASSED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ rosterDeadlineAt: pastDeadline }));

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_DEADLINE_PASSED' } });
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  it('addPlayer: rosterDeadlineAt 미래 → 정상 동작', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ rosterDeadlineAt: futureDeadline }));
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(null);
    prisma.v1TournamentPlayer.upsert.mockResolvedValue(playerRow());

    const result = await service.addPlayer(manager, 'tournament-1', 'reg-1', {
      userId: 'player-user-id',
      realName: '홍길동',
    });

    expect(result).toMatchObject({ id: 'player-1' });
  });

  it('addPlayer: rosterDeadlineOverrideAt 있으면 마감이 지나도 허용', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ rosterDeadlineOverrideAt: new Date() }),
    );
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ rosterDeadlineAt: pastDeadline }));
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(null);
    prisma.v1TournamentPlayer.upsert.mockResolvedValue(playerRow());

    const result = await service.addPlayer(manager, 'tournament-1', 'reg-1', {
      userId: 'player-user-id',
      realName: '홍길동',
    });

    expect(result).toMatchObject({ id: 'player-1' });
  });

  it('addPlayer: rosterDeadlineAt 미설정(null) → 기존처럼 무제한 허용 (회귀 없음)', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ rosterDeadlineAt: null }));
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(null);
    prisma.v1TournamentPlayer.upsert.mockResolvedValue(playerRow());

    const result = await service.addPlayer(manager, 'tournament-1', 'reg-1', {
      userId: 'player-user-id',
      realName: '홍길동',
    });

    expect(result).toMatchObject({ id: 'player-1' });
  });

  it('removePlayer: rosterDeadlineAt 과거 + override 없음 → 409 ROSTER_DEADLINE_PASSED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ rosterDeadlineAt: pastDeadline }));

    await expect(
      service.removePlayer(manager, 'tournament-1', 'reg-1', 'player-1'),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_DEADLINE_PASSED' } });
    expect(prisma.v1TournamentPlayer.update).not.toHaveBeenCalled();
  });

  it('removePlayer: rosterDeadlineOverrideAt 있으면 마감이 지나도 허용', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ rosterDeadlineOverrideAt: new Date() }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ rosterDeadlineAt: pastDeadline }));
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(playerRow());
    prisma.v1TournamentPlayer.update.mockResolvedValue(playerRow({ removedAt: new Date() }));

    const result = await service.removePlayer(manager, 'tournament-1', 'reg-1', 'player-1');
    expect(result.id).toBe('player-1');
  });

  it('addPlayer: 사전 검사 뒤 어드민이 명단을 잠그면 추가를 커밋하지 않는다', async () => {
    prisma.v1TournamentRegistration.findFirst
      .mockResolvedValueOnce(registrationRow())
      .mockResolvedValueOnce(registrationRow({ rosterLockedAt: new Date() }));
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_LOCKED' } });
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  it('addPlayer: 사전 검사 뒤 마감 예외가 회수되면 추가를 커밋하지 않는다', async () => {
    prisma.v1TournamentRegistration.findFirst
      .mockResolvedValueOnce(registrationRow({ rosterDeadlineOverrideAt: new Date() }))
      .mockResolvedValueOnce(registrationRow({ rosterDeadlineOverrideAt: null }));
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ rosterDeadlineAt: pastDeadline }));

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_DEADLINE_PASSED' } });
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  it('updatePlayer: rosterDeadlineAt 과거 + override 없음 → 409 ROSTER_DEADLINE_PASSED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ rosterDeadlineAt: pastDeadline }));

    await expect(
      service.updatePlayer(manager, 'tournament-1', 'reg-1', 'player-1', {
        eligibilityStatus: 'pro',
      }),
    ).rejects.toMatchObject({ response: { code: 'ROSTER_DEADLINE_PASSED' } });
    expect(prisma.v1TournamentPlayer.update).not.toHaveBeenCalled();
  });

  it('updatePlayer: rosterDeadlineOverrideAt 있으면 마감이 지나도 허용', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ rosterDeadlineOverrideAt: new Date() }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ rosterDeadlineAt: pastDeadline }));
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(playerRow());
    prisma.v1TournamentPlayer.update.mockResolvedValue(playerRow({ eligibilityStatus: 'pro' }));

    const result = await service.updatePlayer(manager, 'tournament-1', 'reg-1', 'player-1', {
      eligibilityStatus: 'pro',
    });
    expect(result).toMatchObject({ id: 'player-1', eligibilityStatus: 'pro' });
  });

  it('listPlayers: 명단 제출 마감이 지나고 override가 없어도 조회는 항상 성공', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'member' });
    prisma.v1Tournament.findFirst.mockResolvedValue(
      tournamentRow({ minPlayers: 6, rosterDeadlineAt: pastDeadline }),
    );
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([playerRow()]);

    const result = await service.listPlayers(manager, 'tournament-1', 'reg-1');
    expect(result.players).toHaveLength(1);
  });

  // ─── 4. maxPlayers 초과 ────────────────────────────────────────────────────

  it('addPlayer: at maxPlayers cap → 409 ROSTER_FULL', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow());
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

  // 감사 finding #50: 중복 판정이 registrationId 단위뿐이라, 같은 대회의 다른 팀 명단에 이미
  // active 등록돼 있어도 자기 registration만 보면 "중복 없음"으로 통과해 두 팀에 동시 등재됐다.
  it('addPlayer: userId already active on a DIFFERENT team roster in the same tournament → 409 PLAYER_ALREADY_ON_ANOTHER_TEAM', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' }) // manager 체크
      .mockResolvedValueOnce(teamPlayerMembershipRow()); // 팀 멤버 체크
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);
    // 첫 호출(existingActive, 자기 registration) → 없음. 두 번째 호출(existingOnOtherTeam,
    // 대회 내 다른 registration) → 있음.
    prisma.v1TournamentPlayer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(playerRow({ id: 'player-2', registrationId: 'reg-2' }));

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'PLAYER_ALREADY_ON_ANOTHER_TEAM' } });
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
          genderSnapshot: 'male',
          eligibilityStatus: 'needs_review',
        }),
      }),
    );
  });

  it('addPlayer: team member missing required profile → 400 PLAYER_REQUIRED_PROFILE_MISSING', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow({ user: { phone: null, profile: { realName: '홍길동', birthDate: '1995-03-15' } } }));
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

  it('addPlayer: 번호는 있지만 본인인증을 안 한 팀원은 400 PLAYER_PHONE_NOT_VERIFIED 로 막는다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(
        teamPlayerMembershipRow({
          user: {
            phone: '01012345678',
            phoneVerifiedAt: null, // 값만 적혀 있고 소유 확인은 안 된 상태
            profile: { realName: '홍길동', birthDate: '1995-03-15', gender: 'male' },
          },
        }),
      );
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(null);

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'PLAYER_PHONE_NOT_VERIFIED' } });
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  it('addPlayer: missing optional gender does not block roster registration', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow({
        user: {
          phone: '01012345678',
          phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
          profile: { realName: '홍길동', birthDate: '1995-03-15', gender: null },
        },
      }));
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(null);
    prisma.v1TournamentPlayer.upsert.mockResolvedValue(playerRow({ genderSnapshot: null }));

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).resolves.toMatchObject({ genderSnapshot: null });
    expect(prisma.v1TournamentPlayer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ genderSnapshot: null }),
      }),
    );
  });

  it('addPlayer: mixed tournament requires a gender snapshot source', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(
        teamPlayerMembershipRow({
          user: {
            phone: '01012345678',
            profile: { displayName: '홍길동', birthDate: '1995-03-15', gender: null },
          },
        }),
      );
    prisma.v1Tournament.findFirst.mockResolvedValue(
      tournamentRow({ genderCategory: 'mixed' }),
    );
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PLAYER_REQUIRED_PROFILE_MISSING',
        message: expect.stringContaining('성별'),
      },
    });
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  // ─── 8. 명단 조회 + belowMinimum ────────────────────────────────────────

  it('listPlayers: returns players list and belowMinimum flag', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'member' });
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
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
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
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
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
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(playerRow());
    prisma.v1TournamentPlayer.update.mockResolvedValue(playerRow({ eligibilityStatus: 'pro' }));

    const result = await service.updatePlayer(manager, 'tournament-1', 'reg-1', 'player-1', {
      eligibilityStatus: 'pro',
    });

    expect(result).toMatchObject({ id: 'player-1', eligibilityStatus: 'pro' });
    expect(prisma.v1TournamentPlayer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'player-1' },
        // 메모는 건드리지 않는다. 예전엔 eligibilityNote 를 null 로 덮어써서, 팀이 라디오를
        // 한 번 누르면 어드민 심사 메모가 흔적 없이 사라졌다.
        data: { eligibilityStatus: 'pro' },
      }),
    );
  });

  it('updatePlayer: latest team member profile is not revalidated for eligibility-only edit', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
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
        // 메모는 건드리지 않는다. 예전엔 eligibilityNote 를 null 로 덮어써서, 팀이 라디오를
        // 한 번 누르면 어드민 심사 메모가 흔적 없이 사라졌다.
        data: { eligibilityStatus: 'pro' },
      }),
    );
  });

  it('updatePlayer: rosterLockedAt set → 409 ROSTER_LOCKED', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(
      registrationRow({ rosterLockedAt: new Date('2026-06-10T00:00:00Z') }),
    );
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());

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
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
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

  it('listPlayersForAdmin: ops admin can read a roster without team membership', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      id: 'reg-1',
      teamId: 'team-1',
      rosterLockedAt: null,
      team: { name: '번개팀' },
      tournament: { minPlayers: 2 },
    });
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      { ...playerRow(), user: { phone: '01012345678' } },
    ]);

    await expect(service.listPlayersForAdmin(adminUser, 'reg-1')).resolves.toEqual({
      registrationId: 'reg-1',
      teamId: 'team-1',
      teamName: '번개팀',
      rosterLockedAt: null,
      players: [
        expect.objectContaining({
          realName: '홍길동',
          genderSnapshot: 'male',
          phone: '01012345678',
        }),
      ],
      belowMinimum: true,
    });
    expect(prisma.v1TournamentPlayer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { user: { select: { phone: true } } } }),
    );
    expect(prisma.v1TeamMembership.findFirst).not.toHaveBeenCalled();
  });

  it('listPlayersForAdmin: marks the team owner and sorts them before other players', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      id: 'reg-1',
      teamId: 'team-1',
      rosterLockedAt: null,
      team: { name: '번개팀', ownerUserId: 'owner-user-id' },
      tournament: { minPlayers: 2 },
    });
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      {
        ...playerRow({ id: 'member-player', userId: 'member-user-id' }),
        user: { phone: '01011112222' },
      },
      {
        ...playerRow({ id: 'owner-player', userId: 'owner-user-id' }),
        user: { phone: '01033334444' },
      },
    ]);

    const result = await service.listPlayersForAdmin(adminUser, 'reg-1');

    expect(result.players.map((player) => ({
      id: player.id,
      isTeamCaptain: player.isTeamCaptain,
    }))).toEqual([
      { id: 'owner-player', isTeamCaptain: true },
      { id: 'member-player', isTeamCaptain: false },
    ]);
  });
  it('listPlayersForAdmin: support admin has read-only roster access', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      id: 'reg-1',
      teamId: 'team-1',
      rosterLockedAt: new Date('2026-07-14T00:00:00Z'),
      team: { name: '번개팀' },
      tournament: { minPlayers: 1 },
    });
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      { ...playerRow(), user: { phone: null } },
    ]);

    await expect(
      service.listPlayersForAdmin({ ...adminUser, id: 'support-user-id' }, 'reg-1'),
    ).resolves.toMatchObject({
      belowMinimum: false,
      rosterLockedAt: '2026-07-14T00:00:00.000Z',
      players: [expect.objectContaining({ phone: null })],
    });
  });

  it('listPlayersForAdmin: non-admin receives 403 and no roster PII', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(service.listPlayersForAdmin(nonManager, 'reg-1')).rejects.toThrow(ForbiddenException);
    expect(prisma.v1TournamentPlayer.findMany).not.toHaveBeenCalled();
  });

  it('listPlayersForAdmin: unknown registration returns 404', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);

    await expect(service.listPlayersForAdmin(adminUser, 'ghost-reg')).rejects.toMatchObject({
      response: { code: 'REGISTRATION_NOT_FOUND' },
    });
  });

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
    expect(result.csv).toContain('realName,birthDate,gender,eligibility,nickname');
    expect(result.csv).toContain('홍길동');
    expect(result.csv).toContain('male');
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

  // ─── listEligiblePlayersForAdmin ────────────────────────────────────────────
  //
  // 이 목록의 존재 이유는 "고를 수 있는데 서버가 거부하는" 폼을 없애는 것이다. 따라서
  // insertPlayerIntoRoster 가 실제로 던지는 거절 사유와 목록의 ineligibleReason 이 1:1 로
  // 맞아야 한다 — 어긋나면 화면이 거짓말을 한다. 아래는 그 대조를 사유별로 못박는다.

  function eligibleMembershipRow(overrides: Record<string, unknown> = {}) {
    const { user, ...rest } = overrides as { user?: Record<string, unknown> };
    return {
      role: 'member',
      user: {
        id: 'member-1',
        phone: '01012345678',
        phoneVerifiedAt: new Date('2026-07-01T00:00:00.000Z'),
        profile: {
          nickname: '길동',
          realName: '홍길동',
          birthDate: '1995-03-15',
          gender: 'male',
        },
        ...(user ?? {}),
      },
      ...rest,
    };
  }

  /** 정원 10, 현재 명단 N명, 멤버 목록을 세팅한다. */
  function setupEligible(options: {
    members: ReturnType<typeof eligibleMembershipRow>[];
    rosterUserIds?: string[];
    registration?: Record<string, unknown>;
    tournament?: Record<string, unknown>;
  }) {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      teamId: 'team-1',
      status: 'submitted',
      tournament: {
        genderCategory: null,
        maxPlayers: 10,
        deletedAt: null,
        status: 'open',
        ...(options.tournament ?? {}),
      },
      ...(options.registration ?? {}),
    });
    prisma.v1TeamMembership.findMany.mockResolvedValue(options.members);
    prisma.v1TournamentPlayer.findMany.mockResolvedValue(
      (options.rosterUserIds ?? []).map((userId) => ({ userId })),
    );
  }

  it('listEligiblePlayersForAdmin: 조건을 갖춘 팀원은 선택 가능으로 내려온다', async () => {
    setupEligible({ members: [eligibleMembershipRow()] });

    const result = await service.listEligiblePlayersForAdmin(adminUser, 'reg-1');

    expect(result.members).toEqual([
      expect.objectContaining({
        userId: 'member-1',
        eligible: true,
        ineligibleReason: null,
        alreadyOnRoster: false,
      }),
    ]);
  });

  it('listEligiblePlayersForAdmin: 이미 명단에 있는 팀원은 그 사유로 잠긴다', async () => {
    setupEligible({ members: [eligibleMembershipRow()], rosterUserIds: ['member-1'] });

    const [member] = (await service.listEligiblePlayersForAdmin(adminUser, 'reg-1')).members;

    expect(member).toMatchObject({
      eligible: false,
      alreadyOnRoster: true,
      ineligibleReason: '이미 명단에 있어요',
    });
  });

  // insertPlayerIntoRoster 는 activeCount >= maxPlayers 일 때 409 ROSTER_FULL 을 던진다.
  // 목록이 이걸 반영하지 않으면 정원이 찬 팀에서도 전원이 "선택 가능" 으로 보인다 —
  // 유령 명단 한 자리로 선수를 못 넣던 2026-08-03 사고가 화면상 그렇게 보였다.
  it('listEligiblePlayersForAdmin: 정원이 차면 남은 팀원도 추가 불가로 내려온다', async () => {
    setupEligible({
      members: [eligibleMembershipRow()],
      rosterUserIds: ['other-1', 'other-2'],
      tournament: { maxPlayers: 2 },
    });

    const [member] = (await service.listEligiblePlayersForAdmin(adminUser, 'reg-1')).members;

    expect(member).toMatchObject({
      eligible: false,
      alreadyOnRoster: false,
      ineligibleReason: '정원이 찼어요 (2/2명)',
    });
  });

  // assertRosterMutable 은 취소·취소요청 신청을 어드민에게도 막는다(잠금·마감과 달리 우회 불가).
  it.each(['cancelled', 'cancel_requested'])(
    'listEligiblePlayersForAdmin: %s 신청은 전원 추가 불가로 내려온다',
    async (status) => {
      setupEligible({ members: [eligibleMembershipRow()], registration: { status } });

      const [member] = (await service.listEligiblePlayersForAdmin(adminUser, 'reg-1')).members;

      expect(member).toMatchObject({
        eligible: false,
        ineligibleReason: '취소된 신청이라 명단을 수정할 수 없어요',
      });
    },
  );

  it('listEligiblePlayersForAdmin: 필수 프로필이 빠진 팀원은 그 사유로 잠긴다', async () => {
    setupEligible({
      members: [eligibleMembershipRow({ user: { profile: { nickname: '무프로필' } } })],
    });

    const [member] = (await service.listEligiblePlayersForAdmin(adminUser, 'reg-1')).members;

    expect(member).toMatchObject({
      eligible: false,
      ineligibleReason: '실명·생년월일·휴대폰이 모두 필요해요',
    });
  });

  it('listEligiblePlayersForAdmin: 혼성 대회는 성별까지 요구한다', async () => {
    setupEligible({
      members: [
        eligibleMembershipRow({
          user: { profile: { nickname: '길동', realName: '홍길동', birthDate: '1995-03-15' } },
        }),
      ],
      tournament: { genderCategory: 'mixed' },
    });

    const [member] = (await service.listEligiblePlayersForAdmin(adminUser, 'reg-1')).members;

    expect(member).toMatchObject({
      eligible: false,
      ineligibleReason: '실명·생년월일·휴대폰·성별이 모두 필요해요',
    });
  });

  it('listEligiblePlayersForAdmin: 어드민이 아니면 거부한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.listEligiblePlayersForAdmin(nonManager, 'reg-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  // 이 목록은 "추가" 폼 전용인데 명단 밖 팀원의 실명까지 담는다. 추가 권한이 없는 support 가
  // 읽을 이유가 없으므로 조회 게이트를 쓰기 게이트와 같은 높이(getMutationAdmin)로 둔다.
  it('listEligiblePlayersForAdmin: support 어드민은 추가 권한이 없으므로 후보도 못 본다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(supportAdminRecord);

    await expect(
      service.listEligiblePlayersForAdmin({ ...adminUser, id: 'support-user-id' }, 'reg-1'),
    ).rejects.toThrow(ForbiddenException);
    // 게이트에서 끊겨야 한다 — 신청 조회까지 갔다면 PII 쿼리가 이미 나간 것이다.
    expect(prisma.v1TournamentRegistration.findUnique).not.toHaveBeenCalled();
  });

  // 삭제된 대회는 add 가 404 를 낸다. 후보만 열려 있으면 지난 대회의 registration ID 로
  // 그 팀 명단 밖 사람의 실명을 읽는 경로가 남는다.
  it('listEligiblePlayersForAdmin: 삭제된 대회의 신청은 404 로 막는다', async () => {
    setupEligible({
      members: [eligibleMembershipRow()],
      tournament: { deletedAt: new Date('2026-07-01T00:00:00.000Z') },
    });

    await expect(
      service.listEligiblePlayersForAdmin(adminUser, 'reg-1'),
    ).rejects.toMatchObject({ response: { code: 'REGISTRATION_NOT_FOUND' } });
  });

  it('listEligiblePlayersForAdmin: 화면이 안 쓰는 생년월일·성별은 응답에 담지 않는다', async () => {
    setupEligible({ members: [eligibleMembershipRow()] });

    const [member] = (await service.listEligiblePlayersForAdmin(adminUser, 'reg-1')).members;

    expect(member).not.toHaveProperty('birthDate');
    expect(member).not.toHaveProperty('gender');
    // 판정 자체는 계속 프로필을 읽어야 한다 — 값이 있으니 선택 가능이어야 맞다.
    expect(member.eligible).toBe(true);
  });

  // ─── 대회 상태 가드 (완료·취소 대회의 명단 동결) ──────────────────────────────
  //
  // 수상 내역·리뷰·기록이 명단을 참조하므로 지난 대회의 선수를 넣고 빼면 과거 기록이 가리키는
  // 대상이 달라진다. 탈퇴 정리는 이미 완료 대회를 건너뛰는데(roster-cleanup.ts) 정작 추가·제거는
  // 열려 있었다.

  it.each(['completed', 'cancelled'])(
    'addPlayer: %s 대회는 명단을 수정할 수 없다',
    async (status) => {
      prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
      prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
      prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status }));

      await expect(
        service.addPlayer(manager, 'tournament-1', 'reg-1', {
          userId: 'player-user-id',
          realName: '홍길동',
        }),
      ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_ROSTER_NOT_MUTABLE' } });
      expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
    },
  );

  it('removePlayer: 완료된 대회는 명단에서 선수를 뺄 수 없다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'completed' }));

    await expect(
      service.removePlayer(manager, 'tournament-1', 'reg-1', 'player-1'),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_ROSTER_NOT_MUTABLE' } });
    expect(prisma.v1TournamentPlayer.update).not.toHaveBeenCalled();
  });

  it('addPlayer: 어드민 경로도 완료된 대회는 넘기지 못한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      tournamentId: 'tournament-1',
    });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ status: 'completed' }));

    await expect(
      service.addPlayerForAdmin(adminUser, 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_ROSTER_NOT_MUTABLE' } });
  });

  it('listEligiblePlayersForAdmin: 완료된 대회는 후보도 추가 불가로 내려온다', async () => {
    setupEligible({
      members: [eligibleMembershipRow()],
      tournament: { status: 'completed' },
    });

    const [member] = (await service.listEligiblePlayersForAdmin(adminUser, 'reg-1')).members;

    expect(member).toMatchObject({
      eligible: false,
      ineligibleReason: '종료되었거나 취소된 대회예요',
    });
  });

  // ─── 어드민 선출 심사 보호 ───────────────────────────────────────────────────
  //
  // 팀이 선출 여부를 신고하는 것 자체는 정상 흐름이다. 어드민이 확정한 **뒤에** 팀이 그걸
  // 되돌리고 심사 메모까지 지우는 것이 문제다 — 감사 로그에도 남지 않는다.

  it('updatePlayer: 어드민이 확정한 선출 여부는 팀이 되돌릴 수 없다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst.mockResolvedValue({ id: 'mem-1', role: 'manager' });
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(
      playerRow({ eligibilityStatus: 'pro', eligibilityNote: '2020 K3 출전 이력 확인' }),
    );
    prisma.v1AdminActionLog.findFirst.mockResolvedValue({ id: 'log-1' });

    await expect(
      service.updatePlayer(manager, 'tournament-1', 'reg-1', 'player-1', {
        eligibilityStatus: 'non_pro',
      }),
    ).rejects.toMatchObject({ response: { code: 'ELIGIBILITY_ADMIN_REVIEWED' } });
    expect(prisma.v1TournamentPlayer.update).not.toHaveBeenCalled();
  });

  it('addPlayer: 제외했다 다시 넣어도 어드민 확정 결과가 초기화되지 않는다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue(null);
    // 제외돼 있던 기존 row + 어드민 확정 이력
    prisma.v1TournamentPlayer.findUnique.mockResolvedValue({
      id: 'player-1',
      eligibilityStatus: 'pro',
      eligibilityNote: '2020 K3 출전 이력 확인',
    });
    prisma.v1AdminActionLog.findFirst.mockResolvedValue({ id: 'log-1' });
    prisma.v1TournamentPlayer.upsert.mockResolvedValue(playerRow({ eligibilityStatus: 'pro' }));

    await service.addPlayer(manager, 'tournament-1', 'reg-1', {
      userId: 'player-user-id',
      realName: '홍길동',
      eligibilityStatus: 'non_pro',
    });

    // "제외 → 재추가" 두 번으로 심사를 무효화하는 문을 막는다.
    expect(prisma.v1TournamentPlayer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          eligibilityStatus: 'pro',
          eligibilityNote: '2020 K3 출전 이력 확인',
        }),
      }),
    );
  });

  // ─── 남성부·여성부 성별 일치 ────────────────────────────────────────────────

  it('addPlayer: 여성부 대회에 남성 팀원은 등록할 수 없다', async () => {
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1TeamMembership.findFirst
      .mockResolvedValueOnce({ id: 'mem-1', role: 'manager' })
      .mockResolvedValueOnce(teamPlayerMembershipRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow({ genderCategory: 'female' }));

    await expect(
      service.addPlayer(manager, 'tournament-1', 'reg-1', {
        userId: 'player-user-id',
        realName: '홍길동',
      }),
    ).rejects.toMatchObject({ response: { code: 'PLAYER_GENDER_MISMATCH' } });
    expect(prisma.v1TournamentPlayer.upsert).not.toHaveBeenCalled();
  });

  it('listEligiblePlayersForAdmin: 남성부 대회에서 여성 팀원은 사유와 함께 잠긴다', async () => {
    setupEligible({
      members: [
        eligibleMembershipRow({
          user: {
            profile: {
              nickname: '길순',
              realName: '홍길순',
              birthDate: '1995-03-15',
              gender: 'female',
            },
          },
        }),
      ],
      tournament: { genderCategory: 'male' },
    });

    const [member] = (await service.listEligiblePlayersForAdmin(adminUser, 'reg-1')).members;

    expect(member).toMatchObject({ eligible: false, ineligibleReason: '남성부 대회예요' });
  });

  // ─── 어드민 remove 멱등 ─────────────────────────────────────────────────────

  it('removePlayerForAdmin: 이미 제외된 선수를 또 제외하면 404 — 감사 로그가 두 번 남지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue({
      id: 'player-1',
      registrationId: 'reg-1',
      userId: 'player-user-id',
      realName: '홍길동',
      registration: { tournamentId: 'tournament-1' },
    });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(tournamentRow());
    // lock 을 잡는 사이 다른 요청이 먼저 제외를 끝냈다.
    prisma.v1TournamentPlayer.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.removePlayerForAdmin(adminUser, 'player-1')).rejects.toMatchObject({
      response: { code: 'PLAYER_NOT_FOUND' },
    });
    expect(prisma.v1AdminActionLog.create).not.toHaveBeenCalled();
  });

  // ─── 어드민 추가·제거 후 성별 쿼터 재검증 (finding #53) ─────────────────────────
  // 잠금(rosterLockedAt)은 "이 시점 기준 성별 인원 조건을 충족했다"는 확정 표시인데, 어드민
  // 추가·제거는 잠금·마감을 넘기면서도 쿼터를 재검증하지 않아 위반 상태인데도 '확정'으로 남았다.

  it('addPlayerForAdmin: 잠긴 명단에 추가해 성별 쿼터(남 최대 1명)를 벗어나면 잠금을 자동 해제한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique
      .mockResolvedValueOnce({ tournamentId: 'tournament-1' }) // addPlayerForAdmin 진입부: tournamentId 조회
      .mockResolvedValueOnce({ rosterLockedAt: new Date('2026-08-01T00:00:00Z') }); // reconcile: 잠금 여부 재조회
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(
      tournamentRow({
        genderCategory: 'mixed',
        genderMinMale: 1,
        genderMaxMale: 1,
        genderMinFemale: 1,
        genderMaxFemale: 1,
      }),
    );
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);
    prisma.v1TeamMembership.findFirst.mockResolvedValue(teamPlayerMembershipRow()); // gender: male
    prisma.v1TournamentPlayer.upsert.mockResolvedValue(playerRow({ genderSnapshot: 'male' }));
    // 추가 후 현재 활성 명단 = 남2 · 여1 → genderMaxMale=1 위반
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      { genderSnapshot: 'male' },
      { genderSnapshot: 'male' },
      { genderSnapshot: 'female' },
    ]);

    const result = await service.addPlayerForAdmin(adminUser, 'reg-1', {
      userId: 'player-user-id',
      realName: '홍길동',
    });

    expect(result.id).toBe('player-1');
    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: { rosterLockedAt: null },
    });
  });

  it('addPlayerForAdmin: 추가해도 성별 쿼터를 여전히 충족하면 잠금을 건드리지 않는다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique
      .mockResolvedValueOnce({ tournamentId: 'tournament-1' })
      .mockResolvedValueOnce({ rosterLockedAt: new Date('2026-08-01T00:00:00Z') });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(
      tournamentRow({
        genderCategory: 'mixed',
        genderMinMale: 1,
        genderMaxMale: 3,
        genderMinFemale: 1,
        genderMaxFemale: 3,
      }),
    );
    prisma.v1TournamentPlayer.count.mockResolvedValue(2);
    prisma.v1TeamMembership.findFirst.mockResolvedValue(teamPlayerMembershipRow());
    prisma.v1TournamentPlayer.upsert.mockResolvedValue(playerRow({ genderSnapshot: 'male' }));
    // 남2 · 여1 — max 3 이내라 조건을 여전히 충족.
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([
      { genderSnapshot: 'male' },
      { genderSnapshot: 'male' },
      { genderSnapshot: 'female' },
    ]);

    await service.addPlayerForAdmin(adminUser, 'reg-1', {
      userId: 'player-user-id',
      realName: '홍길동',
    });

    expect(prisma.v1TournamentRegistration.update).not.toHaveBeenCalled();
  });

  it('removePlayerForAdmin: 제거로 성별 최소 인원(여 최소 1명) 미달이 되면 잠금을 자동 해제한다', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentPlayer.findFirst.mockResolvedValue({
      id: 'player-1',
      registrationId: 'reg-1',
      userId: 'player-user-id',
      realName: '홍길동',
      registration: { tournamentId: 'tournament-1' },
    });
    prisma.v1TournamentRegistration.findFirst.mockResolvedValue(registrationRow());
    prisma.v1Tournament.findFirst.mockResolvedValue(
      tournamentRow({
        genderCategory: 'mixed',
        genderMinMale: 1,
        genderMaxMale: 5,
        genderMinFemale: 1,
        genderMaxFemale: 5,
      }),
    );
    prisma.v1TournamentPlayer.updateMany.mockResolvedValue({ count: 1 });
    prisma.v1TournamentPlayer.findUniqueOrThrow.mockResolvedValue(
      playerRow({ removedAt: new Date('2026-08-10T00:00:00Z') }),
    );
    // reconcile: 잠긴 상태 + 제거 후 남은 명단 = 남1 · 여0 → genderMinFemale=1 위반
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue({
      rosterLockedAt: new Date('2026-08-01T00:00:00Z'),
    });
    prisma.v1TournamentPlayer.findMany.mockResolvedValue([{ genderSnapshot: 'male' }]);

    await service.removePlayerForAdmin(adminUser, 'player-1');

    expect(prisma.v1TournamentRegistration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: { rosterLockedAt: null },
    });
  });

  it('listEligiblePlayersForAdmin: 없는 신청이면 404', async () => {
    prisma.v1AdminUser.findUnique.mockResolvedValue(opsAdminRecord);
    prisma.v1TournamentRegistration.findUnique.mockResolvedValue(null);

    await expect(
      service.listEligiblePlayersForAdmin(adminUser, 'ghost-reg'),
    ).rejects.toMatchObject({ response: { code: 'REGISTRATION_NOT_FOUND' } });
  });

  it('listEligiblePlayersForAdmin: whitespace-only names become null instead of empty options', async () => {
    setupEligible({
      members: [
        eligibleMembershipRow({
          user: {
            profile: {
              nickname: 'blank-name',
              realName: '   ',
              birthDate: '1995-03-15',
              gender: 'male',
            },
          },
        }),
      ],
    });

    const [member] = (await service.listEligiblePlayersForAdmin(adminUser, 'reg-1')).members;

    expect(member).toMatchObject({
      realName: null,
      eligible: false,
    });
  });
});
