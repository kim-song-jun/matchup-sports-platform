/**
 * team-match-lineup.service.spec.ts
 *
 * 팀매치 라인업 저장이 **신원 연결(V1ParticipantIdentityLinkCurrent)** 까지 만드는지 검증한다.
 *
 * 배경: 이 경로는 `GamesService.saveLineup`(연결을 만드는 범용 경로)을 지나지 않고
 * 자기 참가자 행을 직접 쓴다. `V1GameParticipant.userId` 컬럼 주석이 "이 값이 실려
 * 저장되면 같은 트랜잭션에서 신원 연결(ROSTER_ASSERTED)도 자동 생성된다"고 약속하는데
 * 이 경로만 그 약속을 지키지 않아, 팀장이 라인업을 저장해도 연결이 0건이었다
 * (alpha 실측: 라인업 저장 후 claimable-participants 가 오히려 32/32명으로 늘었다).
 * 연결이 없으면 개인 기록 공개 판정이 무조건 실패해 득점왕·도움왕이 영영 비어 있다.
 *
 * 가짜 tx 는 실제 DB 제약을 **흉내만 내는 게 아니라 강제**한다 — 링크 테이블의 PK
 * (participantId)와 이벤트 테이블의 두 유니크((participantId, eventVersion),
 * (linkId, action))를 위반하면 던진다. 그래야 "여러 번 저장해도 안 터진다"는 멱등
 * 주장이 실제로 검증된다(제약을 안 거는 가짜는 아무것도 증명하지 못한다).
 */
import { Prisma, V1ConsentState, V1GameLineupState } from '@prisma/client';
import type { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import {
  isParticipantPubliclyEligible,
  loadParticipantConsentEligibility,
} from '../games/public-records/public-consent';
import type { PrismaService } from '../prisma/prisma.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { TeamMatchLineupService } from './team-match-lineup.service';

const manager: V1AuthUser = {
  id: 'manager-user-id',
  email: 'manager@test.v1',
  accountStatus: 'active',
  onboardingStatus: 'completed',
};

/** 라인업에 등록할 수 있는 활성 멤버 — resolveEntry 의 멤버십 검증이 통과할 사용자 집합.
 *  (가짜는 팀을 구분하지 않는다 — 홈/원정 구분은 아래 managerMembership 으로 표현한다.) */
const ROSTER_USER_IDS = new Set(['user-1', 'user-2', 'user-3', 'away-user-1', 'away-user-3']);

interface FakeState {
  participants: Array<{ id: string; lineupId: string; sideId: string | null; userId: string | null; displayNameSnapshot: string; position: string | null }>;
  linkEvents: Array<{ participantId: string; linkId: string; eventVersion: number; action: string; userId: string; actorType: string; actorUserId: string | null; systemActor?: string | null; effectiveAt: Date }>;
  links: Array<{ participantId: string; linkId: string; userId: string }>;
  lineups: Array<{ id: string; gameId: string; sideId: string; revision: number; state: V1GameLineupState; version: number; formation: string | null; supersedesId: string | null }>;
  idempotency: Array<{ key: string; payloadHash: string; responseBody: unknown }>;
  /** 참가자 단위 공개 제외/허용 override (V1ParticipantConsentSnapshot). */
  consentSnapshots: Array<{ participantId: string; linkId: string; consentVersion: number; state: V1ConsentState; policyHash: string; actorUserId: string }>;
  /** 사용자 단위 기록 공개 동의 (V1UserRecordConsent). */
  userConsents: Array<{ userId: string; state: V1ConsentState }>;
}

function createFake(options: { managerTeamId?: string } = {}) {
  /** 이 팀장이 어느 팀 소속인가. 홈이면 own=HOME, 원정이면 own=AWAY 로 갈린다.
   *  테스트 도중 바꿀 수 있게 객체로 들고 있는다 — "홈팀이 정정을 요청하고 원정팀이
   *  다시 저장한다"는 실제 흐름은 서로 다른 팀의 권한을 차례로 태워야 재현된다. */
  const managerMembership = { teamId: options.managerTeamId ?? 'team-home' };
  const state: FakeState = {
    participants: [],
    linkEvents: [],
    links: [],
    lineups: [],
    idempotency: [],
    consentSnapshots: [],
    userConsents: [],
  };
  let participantSeq = 0;
  let lineupSeq = 0;

  const tx = {
    v1TeamMatch: {
      findUnique: async () => ({
        id: 'team-match-1',
        hostTeamId: 'team-home',
        approvedApplicantTeamId: 'team-away',
        // 마감(startAt) 이전이어야 저장이 허용된다.
        startAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    },
    v1Game: {
      findUnique: async () => ({ id: 'game-1', competitionConfigVersionId: 'config-1' }),
    },
    v1GameSide: {
      findMany: async () => [
        { id: 'side-home', sideKey: 'HOME', teamId: 'team-home' },
        { id: 'side-away', sideKey: 'AWAY', teamId: 'team-away' },
      ],
    },
    v1TeamMembership: {
      findFirst: async (args: { where: Record<string, unknown> }) => {
        // loadContext 의 권한 조회(role 필터가 있는 쪽)와 resolveEntry 의 자격 조회를 구분한다.
        if (args.where.role !== undefined) {
          return { id: 'membership-manager', teamId: managerMembership.teamId, userId: manager.id, role: 'owner', status: 'active' };
        }
        const userId = args.where.userId as string;
        if (!ROSTER_USER_IDS.has(userId)) return null;
        return { userId, user: { profile: { nickname: `${userId} 님`, displayName: null } } };
      },
    },
    v1TeamSchedule: { findFirst: async () => null },
    v1CompetitionConfigVersion: {
      findUnique: async () => ({
        lineup: { minPlayers: 3, maxPlayers: 5, substitutions: 'rolling', maxSubstitutions: null },
      }),
    },
    v1IdempotencyRecord: {
      findUnique: async (args: { where: { actorUserId_action_resourceType_resourceId_idempotencyKey: { idempotencyKey: string } } }) => {
        const key = args.where.actorUserId_action_resourceType_resourceId_idempotencyKey.idempotencyKey;
        return state.idempotency.find((row) => row.key === key) ?? null;
      },
      create: async (args: { data: { idempotencyKey: string; payloadHash: string; responseBody: unknown } }) => {
        state.idempotency.push({
          key: args.data.idempotencyKey,
          payloadHash: args.data.payloadHash,
          responseBody: args.data.responseBody,
        });
        return args.data;
      },
    },
    v1GameLineup: {
      findFirst: async (args: { where: { gameId: string; sideId: string } }) => {
        const matches = state.lineups
          .filter((row) => row.gameId === args.where.gameId && row.sideId === args.where.sideId)
          .sort((a, b) => b.revision - a.revision);
        return matches[0] ?? null;
      },
      create: async (args: { data: { gameId: string; sideId: string; revision: number; supersedesId?: string; formation?: string } }) => {
        lineupSeq += 1;
        const row = {
          id: `lineup-${lineupSeq}`,
          gameId: args.data.gameId,
          sideId: args.data.sideId,
          revision: args.data.revision,
          state: V1GameLineupState.DRAFT,
          version: 0,
          formation: args.data.formation ?? null,
          supersedesId: args.data.supersedesId ?? null,
        };
        state.lineups.push(row);
        return row;
      },
    },
    v1GameParticipant: {
      findMany: async (args: { where: { lineupId: string } }) =>
        state.participants.filter((row) => row.lineupId === args.where.lineupId),
      create: async (args: { data: { lineupId: string; sideId?: string; userId: string | null; displayNameSnapshot: string; position: string | null } }) => {
        participantSeq += 1;
        const row = {
          id: `participant-${participantSeq}`,
          lineupId: args.data.lineupId,
          sideId: args.data.sideId ?? null,
          userId: args.data.userId,
          displayNameSnapshot: args.data.displayNameSnapshot,
          position: args.data.position,
        };
        state.participants.push(row);
        return row;
      },
      // 이 스펙 어디도 createMany 를 기대하지 않는다. createMany 는 생성된 id 를
      // 돌려주지 않아 연결을 정확한 participant 에 걸 수 없다 — 되돌아가면 즉시 red.
      createMany: async () => {
        throw new Error('createMany 로는 participantId 를 알 수 없어 신원 연결을 걸 수 없어요.');
      },
    },
    v1ParticipantConsentSnapshot: {
      findMany: async (args: { where: { linkId: { in: string[] } } }) =>
        state.consentSnapshots
          .filter((row) => args.where.linkId.in.includes(row.linkId))
          // 서비스가 `orderBy: { consentVersion: 'desc' }` 로 읽고 linkId 당 첫 행을
          // 최신으로 삼는다 — 정렬을 흉내내지 않으면 그 선정이 검증되지 않는다.
          .sort((a, b) => b.consentVersion - a.consentVersion),
      create: async (args: { data: { participantId: string; linkId: string; consentVersion: number; state: V1ConsentState; policyHash: string; actorUserId: string } }) => {
        const { data } = args;
        // 실제 유니크 제약 `@@unique([participantId, consentVersion])`.
        if (state.consentSnapshots.some((row) => row.participantId === data.participantId && row.consentVersion === data.consentVersion)) {
          throw new Error('unique constraint: v1_consent_participant_version_key');
        }
        state.consentSnapshots.push(data);
        return data;
      },
    },
    v1ParticipantIdentityLinkCurrent: {
      findUnique: async (args: { where: { participantId: string } }) =>
        state.links.find((row) => row.participantId === args.where.participantId) ?? null,
      findUniqueOrThrow: async (args: { where: { participantId: string } }) => {
        const row = state.links.find((link) => link.participantId === args.where.participantId);
        if (row === undefined) throw new Error('record not found: v1_participant_identity_link_current');
        return row;
      },
      findMany: async (args: { where: { participantId: { in: string[] } } }) =>
        state.links.filter((row) => args.where.participantId.in.includes(row.participantId)),
      create: async (args: { data: { participantId: string; linkId: string; userId: string } }) => {
        // 실제 PK 제약(participant_id). 중복 시도가 있으면 여기서 터진다.
        if (state.links.some((row) => row.participantId === args.data.participantId)) {
          throw new Error('unique constraint: v1_participant_identity_link_current_pkey');
        }
        state.links.push({ participantId: args.data.participantId, linkId: args.data.linkId, userId: args.data.userId });
        return args.data;
      },
    },
    v1ParticipantIdentityLinkEvent: {
      findFirst: async (args: { where: { participantId: string } }) => {
        const rows = state.linkEvents
          .filter((row) => row.participantId === args.where.participantId)
          .sort((a, b) => b.eventVersion - a.eventVersion);
        return rows[0] ?? null;
      },
      create: async (args: { data: { participantId: string; linkId: string; eventVersion: number; action: string; userId: string; actorType: string; actorUserId: string | null; systemActor?: string | null } }) => {
        const { data } = args;
        if (state.linkEvents.some((row) => row.participantId === data.participantId && row.eventVersion === data.eventVersion)) {
          throw new Error('unique constraint: v1_identity_events_participant_version_key');
        }
        if (state.linkEvents.some((row) => row.linkId === data.linkId && row.action === data.action)) {
          throw new Error('unique constraint: v1_identity_events_link_action_key');
        }
        const row = { ...data, effectiveAt: new Date() };
        state.linkEvents.push(row);
        return row;
      },
    },
  };

  const prisma = {
    $transaction: async <T>(fn: (client: typeof tx) => Promise<T>) => fn(tx),
  } as unknown as PrismaService;

  return { state, prisma, tx, managerMembership };
}

const audit = { create: async () => undefined } as unknown as OperationAuditWriterService;

/**
 * 같은 가짜 상태를 **공개 자격 판정이 실제로 읽는 모양**으로 다시 노출한다.
 *
 * 판정을 스펙 안에서 흉내내지 않고 `loadParticipantConsentEligibility`(정본)를 그대로
 * 태우기 위한 것이다 — 그래야 "숨김이 유지된다"가 내 구현을 되읊는 게 아니라 실제
 * 노출 경로에서 성립하는 사실이 된다.
 */
function createConsentReader(state: FakeState) {
  return {
    v1ParticipantIdentityLinkCurrent: {
      findMany: async (args: { where: { participantId: { in: string[] } } }) =>
        state.links.filter((row) => args.where.participantId.in.includes(row.participantId)),
    },
    v1UserRecordConsent: {
      findMany: async (args: { where: { userId: { in: string[] } } }) =>
        state.userConsents.filter((row) => args.where.userId.in.includes(row.userId)),
    },
    v1ParticipantConsentSnapshot: {
      findMany: async (args: { where: { linkId: { in: string[] } } }) =>
        state.consentSnapshots
          .filter((row) => args.where.linkId.in.includes(row.linkId))
          .sort((a, b) => b.consentVersion - a.consentVersion),
    },
  } as unknown as PrismaService;
}

/** 정본 판정을 태워 "이 참가자가 공개 기록에 나타나는가"를 답한다. */
async function isPubliclyVisible(state: FakeState, participantId: string): Promise<boolean> {
  const eligibility = await loadParticipantConsentEligibility(createConsentReader(state), [participantId]);
  const row = eligibility.get(participantId);
  return row !== undefined && isParticipantPubliclyEligible(row);
}

/** 선발 3명(GK 1 + 연동 1 + 게스트 1) + 후보 1명(연동). */
function lineupDto(expectedVersion: number) {
  return {
    expectedVersion,
    starters: [
      { userId: 'user-1', goalkeeper: true },
      { userId: 'user-2' },
      { displayName: '게스트 김' },
    ],
    bench: [{ userId: 'user-3' }],
  };
}

describe('TeamMatchLineupService.saveLineup — 신원 연결', () => {
  it('userId 가 실린 참가자마다 연결을 만들고, 게스트에는 만들지 않는다', async () => {
    const { state, prisma } = createFake();
    const service = new TeamMatchLineupService(prisma, audit);

    await service.saveLineup(manager, 'team-match-1', 'key-1', lineupDto(0));

    expect(state.participants).toHaveLength(4);
    // 연동 3명만 연결된다 — 게스트 1명은 플랫폼 계정이 없어 연결 대상이 아니다.
    expect(state.links.map((link) => link.userId).sort()).toEqual(['user-1', 'user-2', 'user-3']);

    // 연결이 **정확한 participant 행**에 걸려야 한다. 이름으로 되짚어 짝지으면
    // 동명이인에서 엉뚱한 사람에게 기록이 붙는다.
    for (const link of state.links) {
      const participant = state.participants.find((row) => row.id === link.participantId);
      expect(participant).toBeDefined();
      expect(participant!.userId).toBe(link.userId);
    }
    const guest = state.participants.find((row) => row.userId === null);
    expect(guest).toBeDefined();
    expect(state.links.some((link) => link.participantId === guest!.id)).toBe(false);

    // 연결의 주체는 저장한 팀장이고, 액션은 로스터 주장이다.
    expect(state.linkEvents).toHaveLength(3);
    for (const event of state.linkEvents) {
      expect(event.action).toBe('ROSTER_ASSERTED');
      expect(event.actorType).toBe('USER');
      expect(event.actorUserId).toBe(manager.id);
      expect(event.eventVersion).toBe(1);
    }
  });

  it('같은 라인업을 다시 저장해도 유니크 제약으로 터지지 않는다 (새 리비전 = 새 연결)', async () => {
    const { state, prisma } = createFake();
    const service = new TeamMatchLineupService(prisma, audit);

    await service.saveLineup(manager, 'team-match-1', 'key-1', lineupDto(0));
    // 두 번째 저장은 새 Idempotency-Key + 올라간 expectedVersion(=직전 revision)으로 들어온다.
    await expect(service.saveLineup(manager, 'team-match-1', 'key-2', lineupDto(1))).resolves.toMatchObject({
      revision: 2,
    });

    // 라인업 리비전마다 참가자 행이 새로 생기므로 연결도 행마다 하나씩 생긴다 —
    // 링크 테이블의 유일성은 participant 기준이지 사용자 기준이 아니다.
    expect(state.participants).toHaveLength(8);
    expect(state.links).toHaveLength(6);
    expect(new Set(state.links.map((link) => link.participantId)).size).toBe(6);
    // 같은 사용자가 같은 경기의 여러 참가자 행에 연결돼 있는 상태가 정상이다.
    expect(state.links.filter((link) => link.userId === 'user-1')).toHaveLength(2);
  });

  it('같은 Idempotency-Key 재시도는 저장을 되풀이하지 않는다', async () => {
    const { state, prisma } = createFake();
    const service = new TeamMatchLineupService(prisma, audit);

    const first = await service.saveLineup(manager, 'team-match-1', 'key-1', lineupDto(0));
    const replay = await service.saveLineup(manager, 'team-match-1', 'key-1', lineupDto(0));

    expect(replay).toMatchObject({ lineupId: first.lineupId, replayed: true });
    // 재시도가 참가자·연결을 한 벌 더 만들면 같은 사람이 한 경기에 두 번 서게 된다.
    expect(state.participants).toHaveLength(4);
    expect(state.links).toHaveLength(3);
  });
});

/**
 * 정정 요청(requestChange)이 만드는 **복사 리비전**의 신원 연결.
 *
 * 이 복사본은 그 사이드의 최신 리비전이 되고, 결과 입력은 최신 리비전의 참가자만
 * 모집단으로 삼는다(latest-lineup-participants.ts + league-result-participants.ts 의
 * teamAuthored). 연결을 옮기지 않으면 그 팀 전원의 개인 기록이 그 경기에서 공개 불가가
 * 되는데, 경기 시작(startAt) 이후에는 saveLineup 이 LINEUP_DEADLINE_PASSED 로 막히므로
 * "다시 저장하면 붙는다"는 자가 치유가 성립하지 않는다 — 킥오프 직전 정정에서 영구화된다.
 */
describe('TeamMatchLineupService.requestChange — 복사 리비전의 신원 연결', () => {
  /** 원정팀이 이미 저장·제출해 둔 라인업(연동 1명 + 게스트 1명, 연동 쪽만 연결 보유). */
  function seedSubmittedAwayLineup(state: FakeState) {
    state.lineups.push({
      id: 'away-lineup-1',
      gameId: 'game-1',
      sideId: 'side-away',
      revision: 1,
      state: V1GameLineupState.SUBMITTED,
      version: 0,
      formation: null,
      supersedesId: null,
    });
    state.participants.push(
      { id: 'away-participant-1', lineupId: 'away-lineup-1', sideId: 'side-away', userId: 'away-user-1', displayNameSnapshot: '원정 선수', position: 'GK' },
      { id: 'away-participant-2', lineupId: 'away-lineup-1', sideId: 'side-away', userId: null, displayNameSnapshot: '원정 게스트', position: null },
    );
    state.linkEvents.push({
      participantId: 'away-participant-1',
      linkId: 'away-link-1',
      eventVersion: 1,
      action: 'ROSTER_ASSERTED',
      userId: 'away-user-1',
      actorType: 'USER',
      actorUserId: 'away-manager-user-id',
      systemActor: null,
      effectiveAt: new Date(),
    });
    state.links.push({ participantId: 'away-participant-1', linkId: 'away-link-1', userId: 'away-user-1' });
  }

  const changeDto = { expectedVersion: 1, reason: '등번호가 잘못 적혔어요.' };

  it('원본에 연결이 있던 참가자는 복사본에도 연결이 따라간다', async () => {
    const { state, prisma } = createFake();
    seedSubmittedAwayLineup(state);
    const service = new TeamMatchLineupService(prisma, audit);

    await service.requestChange(manager, 'team-match-1', 'key-change-1', changeDto);

    const copied = state.participants.filter((row) => row.lineupId !== 'away-lineup-1');
    expect(copied).toHaveLength(2);
    const copiedLinked = copied.find((row) => row.displayNameSnapshot === '원정 선수')!;
    const copiedGuest = copied.find((row) => row.displayNameSnapshot === '원정 게스트')!;

    // 복사본에도 연결이 생겨야 한다 — 이게 없으면 그 팀 전원의 개인 기록이 이 경기에서 사라진다.
    expect(state.links.find((link) => link.participantId === copiedLinked.id)?.userId).toBe('away-user-1');
    // 원본 행의 연결은 그대로 남는다(옛 리비전을 가리키는 결과가 있을 수 있다).
    expect(state.links.find((link) => link.participantId === 'away-participant-1')?.userId).toBe('away-user-1');
    // 원본에 연결이 없던 게스트는 복사본에도 없다 — 없던 사실을 만들어내지 않는다.
    expect(state.links.some((link) => link.participantId === copiedGuest.id)).toBe(false);
    expect(state.links).toHaveLength(2);
  });

  it('복사 연결의 주체는 정정을 요청한 상대팀 팀장이 아니라 시스템이다', async () => {
    const { state, prisma } = createFake();
    seedSubmittedAwayLineup(state);
    const service = new TeamMatchLineupService(prisma, audit);

    await service.requestChange(manager, 'team-match-1', 'key-change-1', changeDto);

    const copiedLinked = state.participants.find(
      (row) => row.lineupId !== 'away-lineup-1' && row.displayNameSnapshot === '원정 선수',
    )!;
    const event = state.linkEvents.find((row) => row.participantId === copiedLinked.id)!;
    // manager 는 홈팀 팀장이다. 그의 이름으로 원정팀 선수의 정체성을 주장하면
    // 감사 기록이 실제 권위와 어긋난다.
    expect(event.actorType).toBe('SYSTEM');
    expect(event.actorUserId).toBeNull();
    expect(event.systemActor).toBe('LINEUP_REVISION_COPY');
    expect(event.action).toBe('ROSTER_ASSERTED');
    expect(event.userId).toBe('away-user-1');
  });

  it('연결이 하나도 없던 라인업의 복사는 연결을 만들지 않는다', async () => {
    const { state, prisma } = createFake();
    seedSubmittedAwayLineup(state);
    // 원본 연결을 지운다 — 자동 로스터뿐인(아무도 작성하지 않은) 사이드의 모양.
    state.links.length = 0;
    state.linkEvents.length = 0;
    const service = new TeamMatchLineupService(prisma, audit);

    await service.requestChange(manager, 'team-match-1', 'key-change-1', changeDto);

    expect(state.participants.filter((row) => row.lineupId !== 'away-lineup-1')).toHaveLength(2);
    expect(state.links).toHaveLength(0);
  });
});

/**
 * 정정 요청 복사본의 **참가자 단위 공개 제외(REVOKED) 승계**.
 *
 * 공개 자격 판정(public-consent.ts)은 참가자 단위 숨김 override 를 **현재 연결의
 * linkId 로만** 읽는다. 복사본은 새 linkId 를 받으므로, 숨김을 함께 옮기지 않으면
 * 본인이 "이 경기만 숨기겠다"고 껐던 기록이 **상대팀 팀장의 정정 요청 한 번으로**
 * 다시 공개된다. 프라이버시가 줄어드는 방향이고, 되돌리려면 새 participantId 를
 * 알아내 revoke 를 다시 불러야 하는데 그 UI 는 없다.
 *
 * 아래 스펙은 숨김 여부를 직접 단언하지 않고 **정본 판정 함수**
 * (`loadParticipantConsentEligibility` + `isParticipantPubliclyEligible`)를 그대로
 * 태워서 답을 얻는다.
 */
const HIDDEN_POLICY_HASH = 'policy-hash-at-hide-time';

/**
 * 원정팀이 제출해 둔 라인업. 연동 선수 2명 모두 사용자 단위 동의(GRANTED)를 켜 뒀고,
 * 그중 `away-user-1` 만 이 경기 하나를 개별로 숨겨 뒀다(REVOKED).
 * 숨기지 않은 `away-user-3` 는 대조군이다 — 이 사람이 정정 뒤에도 공개로 남아야
 * "안 보인다"는 단언이 하네스가 아무것도 못 보는 탓이 아님이 증명된다.
 */
function seedSubmittedAwayLineupWithHiddenPlayer(state: FakeState) {
  state.lineups.push({
    id: 'away-lineup-1',
    gameId: 'game-1',
    sideId: 'side-away',
    revision: 1,
    state: V1GameLineupState.SUBMITTED,
    version: 0,
    formation: null,
    supersedesId: null,
  });
  state.participants.push(
    { id: 'away-participant-1', lineupId: 'away-lineup-1', sideId: 'side-away', userId: 'away-user-1', displayNameSnapshot: '숨긴 선수', position: 'GK' },
    { id: 'away-participant-3', lineupId: 'away-lineup-1', sideId: 'side-away', userId: 'away-user-3', displayNameSnapshot: '공개 선수', position: null },
  );
  state.links.push(
    { participantId: 'away-participant-1', linkId: 'away-link-1', userId: 'away-user-1' },
    { participantId: 'away-participant-3', linkId: 'away-link-3', userId: 'away-user-3' },
  );
  state.userConsents.push(
    { userId: 'away-user-1', state: V1ConsentState.GRANTED },
    { userId: 'away-user-3', state: V1ConsentState.GRANTED },
  );
  // 본인이 이 경기 하나만 숨긴 기록 (POST /games/:id/participants/:pid/consents/revoke).
  state.consentSnapshots.push({
    participantId: 'away-participant-1',
    linkId: 'away-link-1',
    consentVersion: 1,
    state: V1ConsentState.REVOKED,
    policyHash: HIDDEN_POLICY_HASH,
    actorUserId: 'away-user-1',
  });
}

const copyOf = (state: FakeState, lineupId: string, displayName: string) =>
  state.participants.find((row) => row.lineupId === lineupId && row.displayNameSnapshot === displayName)!;

describe('TeamMatchLineupService.requestChange — 공개 제외 승계', () => {
  const changeDto = { expectedVersion: 1, reason: '등번호가 잘못 적혔어요.' };

  it('본인이 숨긴 경기는 상대팀의 정정 요청 뒤에도 공개되지 않는다', async () => {
    const { state, prisma } = createFake();
    seedSubmittedAwayLineupWithHiddenPlayer(state);
    // 전제 확인: 정정 전에는 숨긴 사람만 비공개, 대조군은 공개다.
    expect(await isPubliclyVisible(state, 'away-participant-1')).toBe(false);
    expect(await isPubliclyVisible(state, 'away-participant-3')).toBe(true);

    const changed = await new TeamMatchLineupService(prisma, audit).requestChange(
      manager,
      'team-match-1',
      'key-change-1',
      changeDto,
    );

    const hiddenCopy = copyOf(state, changed.lineupId, '숨긴 선수');
    const openCopy = copyOf(state, changed.lineupId, '공개 선수');
    // 결과는 최신 리비전의 참가자에 붙으므로, 이 복사본이 곧 공개 대상이 된다.
    expect(await isPubliclyVisible(state, hiddenCopy.id)).toBe(false);
    // 대조군: 숨기지 않은 사람은 그대로 공개된다(= 하네스가 공개를 표현할 수 있다).
    expect(await isPubliclyVisible(state, openCopy.id)).toBe(true);
    // 원본 행의 상태도 건드리지 않는다.
    expect(await isPubliclyVisible(state, 'away-participant-1')).toBe(false);
  });

  it('숨김을 옮긴 기록은 정정을 요청한 상대팀 팀장이 아니라 본인의 결정으로 남는다', async () => {
    const { state, prisma } = createFake();
    seedSubmittedAwayLineupWithHiddenPlayer(state);

    const changed = await new TeamMatchLineupService(prisma, audit).requestChange(
      manager,
      'team-match-1',
      'key-change-1',
      changeDto,
    );

    const hiddenCopy = copyOf(state, changed.lineupId, '숨긴 선수');
    const carried = state.consentSnapshots.find((row) => row.participantId === hiddenCopy.id)!;
    expect(carried).toBeDefined();
    // manager 는 홈팀 팀장이다. 그의 id 가 찍히면 "이 사람이 원정팀 선수의 기록을
    // 숨겼다"는 거짓 이력이 된다.
    expect(carried.actorUserId).toBe('away-user-1');
    expect(carried.actorUserId).not.toBe(manager.id);
    expect(carried.policyHash).toBe(HIDDEN_POLICY_HASH);
    // 복사본의 숨김은 **복사본의 현재 연결** 아래에 있어야 판정이 읽는다.
    expect(carried.linkId).toBe(state.links.find((link) => link.participantId === hiddenCopy.id)!.linkId);
  });

  it('숨긴 적 없는 참가자에게는 공개 동의를 만들어내지 않는다', async () => {
    const { state, prisma } = createFake();
    seedSubmittedAwayLineupWithHiddenPlayer(state);

    const changed = await new TeamMatchLineupService(prisma, audit).requestChange(
      manager,
      'team-match-1',
      'key-change-1',
      changeDto,
    );

    const openCopy = copyOf(state, changed.lineupId, '공개 선수');
    // 본인이 만든 적 없는 동의를 새 연결 아래에 날조하지 않는다 — 승계 대상은
    // 노출을 **줄이는** REVOKED 뿐이다.
    expect(state.consentSnapshots.some((row) => row.participantId === openCopy.id)).toBe(false);
  });

  it('정정이 두 번 반복돼도 숨김이 계속 따라간다', async () => {
    const { state, prisma } = createFake();
    seedSubmittedAwayLineupWithHiddenPlayer(state);
    const service = new TeamMatchLineupService(prisma, audit);

    const first = await service.requestChange(manager, 'team-match-1', 'key-change-1', changeDto);
    // 원정팀이 정정해 다시 제출한 상태 — 그래야 두 번째 정정 요청이 가능하다.
    state.lineups.find((row) => row.id === first.lineupId)!.state = V1GameLineupState.SUBMITTED;

    const second = await service.requestChange(manager, 'team-match-1', 'key-change-2', {
      expectedVersion: first.revision,
      reason: '한 번 더 확인해 주세요.',
    });

    const hiddenCopy = copyOf(state, second.lineupId, '숨긴 선수');
    // 한 다리 건너 복사돼도 숨김이 살아 있어야 한다 — 사슬 어디서든 끊기면
    // 그 시점부터 공개된다.
    expect(await isPubliclyVisible(state, hiddenCopy.id)).toBe(false);
    expect(await isPubliclyVisible(state, copyOf(state, second.lineupId, '공개 선수').id)).toBe(true);
  });
});

/**
 * 라인업 **재저장**(saveLineup)의 공개 제외 승계 — 위 정정 요청 승계의 바로 다음 칸.
 *
 * 정정 요청 복사본이 숨김을 물려받아도, 그 복사본을 받은 팀이 자기 라인업을 다시
 * 저장하는 순간 새 participant·새 linkId 가 만들어진다. 판정은 스냅샷을 **현재 연결의
 * linkId 로만** 읽으므로(public-consent.ts), 재저장 경로가 같은 승계를 하지 않으면
 * 본인이 명시적으로 비공개로 돌려놓은 기록이 **팀장의 저장 버튼 한 번으로** 다시
 * 공개된다. 되돌릴 UI 가 없어 본인이 자기 의사를 회복할 방법이 없다.
 *
 * 아래 스펙도 숨김 여부를 직접 단언하지 않고 정본 판정
 * (`loadParticipantConsentEligibility` + `isParticipantPubliclyEligible`)을 태워서 답을 얻는다.
 */
describe('TeamMatchLineupService.saveLineup — 공개 제외 승계', () => {
  /** 원정팀 팀장이 정정 지시대로 다시 짜는 명단 — 숨긴 선수·대조군 그대로 + 게스트 1명. */
  const awayResaveDto = (expectedVersion: number) => ({
    expectedVersion,
    starters: [
      { userId: 'away-user-1', goalkeeper: true },
      { userId: 'away-user-3' },
      { displayName: '원정 게스트' },
    ],
    bench: [],
  });

  const rowOf = (state: FakeState, lineupId: string, userId: string) =>
    state.participants.find((row) => row.lineupId === lineupId && row.userId === userId)!;

  it('정정 요청을 받은 팀이 라인업을 다시 저장해도 숨긴 경기는 공개되지 않는다', async () => {
    const fake = createFake();
    seedSubmittedAwayLineupWithHiddenPlayer(fake.state);
    const service = new TeamMatchLineupService(fake.prisma, audit);

    // ① 홈팀 팀장이 정정을 요청한다 → 원정 사이드에 복사 리비전이 열린다(숨김 승계됨).
    const reopened = await service.requestChange(manager, 'team-match-1', 'key-change-1', {
      expectedVersion: 1,
      reason: '등번호가 잘못 적혔어요.',
    });
    expect(await isPubliclyVisible(fake.state, copyOf(fake.state, reopened.lineupId, '숨긴 선수').id)).toBe(false);

    // ② 이제 **원정팀** 팀장이 그 지시대로 자기 라인업을 다시 저장한다.
    fake.managerMembership.teamId = 'team-away';
    const resaved = await service.saveLineup(manager, 'team-match-1', 'key-resave-1', awayResaveDto(reopened.revision));
    expect(resaved.lineupId).not.toBe(reopened.lineupId);

    // 결과는 최신 리비전의 참가자에 붙는다 — 여기서 끊기면 그 순간부터 공개된다.
    expect(await isPubliclyVisible(fake.state, rowOf(fake.state, resaved.lineupId, 'away-user-1').id)).toBe(false);
    // 대조군: 숨긴 적 없는 사람은 재저장 뒤에도 그대로 공개된다(= 하네스가 공개를 표현할 수 있다).
    expect(await isPubliclyVisible(fake.state, rowOf(fake.state, resaved.lineupId, 'away-user-3').id)).toBe(true);

    // 옮긴 숨김은 저장 버튼을 누른 팀장이 아니라 본인의 결정으로 남아야 한다.
    const carried = fake.state.consentSnapshots.find(
      (row) => row.participantId === rowOf(fake.state, resaved.lineupId, 'away-user-1').id,
    )!;
    expect(carried.actorUserId).toBe('away-user-1');
    expect(carried.actorUserId).not.toBe(manager.id);
    expect(carried.policyHash).toBe(HIDDEN_POLICY_HASH);
    // 숨김은 **재저장본의 현재 연결** 아래에 있어야 판정이 읽는다.
    expect(carried.linkId).toBe(
      fake.state.links.find((link) => link.participantId === rowOf(fake.state, resaved.lineupId, 'away-user-1').id)!.linkId,
    );
  });

  it('재저장을 반복해도 숨김이 계속 따라간다', async () => {
    const { state, prisma } = createFake({ managerTeamId: 'team-away' });
    seedSubmittedAwayLineupWithHiddenPlayer(state);
    // 원정팀이 직접 고칠 수 있으려면 자기 라인업이 초안 상태여야 한다.
    state.lineups.find((row) => row.id === 'away-lineup-1')!.state = V1GameLineupState.DRAFT;
    const service = new TeamMatchLineupService(prisma, audit);

    const first = await service.saveLineup(manager, 'team-match-1', 'key-1', awayResaveDto(1));
    const second = await service.saveLineup(manager, 'team-match-1', 'key-2', awayResaveDto(first.revision));

    // 한 다리 건너 저장돼도 숨김이 살아 있어야 한다 — 한 칸만 이으면 두 번째 저장에서 샌다.
    expect(await isPubliclyVisible(state, rowOf(state, second.lineupId, 'away-user-1').id)).toBe(false);
    expect(await isPubliclyVisible(state, rowOf(state, second.lineupId, 'away-user-3').id)).toBe(true);
  });

  it('게스트로 올랐다가 본인이 가져간(claim) 행의 숨김도 사람 기준으로 이어진다', async () => {
    const { state, prisma } = createFake({ managerTeamId: 'team-away' });
    seedSubmittedAwayLineupWithHiddenPlayer(state);
    state.lineups.find((row) => row.id === 'away-lineup-1')!.state = V1GameLineupState.DRAFT;
    // 직전 리비전에서는 이름만 올라간 게스트였고, 본인이 신청·승인으로 가져간 상태 —
    // participant.userId 컬럼은 null 인데 연결에는 사람이 있다. 컬럼을 승계 키로 쓰면
    // 여기서 끊긴다.
    state.participants.find((row) => row.id === 'away-participant-1')!.userId = null;
    const service = new TeamMatchLineupService(prisma, audit);

    const resaved = await service.saveLineup(manager, 'team-match-1', 'key-1', awayResaveDto(1));

    expect(await isPubliclyVisible(state, rowOf(state, resaved.lineupId, 'away-user-1').id)).toBe(false);
    // 이번 저장에 새로 올라간 게스트(연결 없음)에는 아무것도 만들지 않는다.
    const guest = state.participants.find((row) => row.lineupId === resaved.lineupId && row.userId === null)!;
    expect(state.links.some((link) => link.participantId === guest.id)).toBe(false);
    expect(state.consentSnapshots.some((row) => row.participantId === guest.id)).toBe(false);
  });

  it('숨긴 적 없는 사람에게는 공개 동의를 만들어내지 않는다', async () => {
    const { state, prisma } = createFake({ managerTeamId: 'team-away' });
    seedSubmittedAwayLineupWithHiddenPlayer(state);
    state.lineups.find((row) => row.id === 'away-lineup-1')!.state = V1GameLineupState.DRAFT;
    // 대조군에게 참가자 단위 GRANTED 가 명시적으로 달려 있어도 옮기지 않는다 —
    // GRANTED 와 "스냅샷 없음"은 판정 결과가 같고, 없는 동의를 새 연결 아래에 만들면
    // 본인이 동의한 적 없는 연결에 동의를 날조하는 셈이라 노출을 늘린다.
    state.consentSnapshots.push({
      participantId: 'away-participant-3',
      linkId: 'away-link-3',
      consentVersion: 1,
      state: V1ConsentState.GRANTED,
      policyHash: 'policy-hash-at-grant-time',
      actorUserId: 'away-user-3',
    });
    const service = new TeamMatchLineupService(prisma, audit);

    const resaved = await service.saveLineup(manager, 'team-match-1', 'key-1', awayResaveDto(1));

    const control = rowOf(state, resaved.lineupId, 'away-user-3');
    expect(state.consentSnapshots.some((row) => row.participantId === control.id)).toBe(false);
    expect(await isPubliclyVisible(state, control.id)).toBe(true);
  });
});

/**
 * 라인업 저장이 동시 요청에 진 경우의 에러 코드.
 *
 * 신원 이벤트 statement 가 P2034 로 지면 mapIdentityEventError 가 먼저 잡아 던지고,
 * 같은 저장의 다른 statement 가 지면 serializable() 이 잡는다. 두 경로가 서로 다른
 * 코드를 내면 클라이언트는 같은 상황(동시 저장 충돌)을 다르게 보게 된다.
 */
describe('TeamMatchLineupService.saveLineup — 동시 충돌 에러 코드', () => {
  const writeConflict = () =>
    new Prisma.PrismaClientKnownRequestError('write conflict', { code: 'P2034', clientVersion: 'test' });

  it('신원 이벤트가 진 충돌도 라인업 행이 진 충돌과 같은 코드로 나간다', async () => {
    const viaIdentity = createFake();
    viaIdentity.tx.v1ParticipantIdentityLinkEvent.create = async () => {
      throw writeConflict();
    };
    const viaLineup = createFake();
    viaLineup.tx.v1GameLineup.create = async () => {
      throw writeConflict();
    };

    await expect(
      new TeamMatchLineupService(viaIdentity.prisma, audit).saveLineup(manager, 'team-match-1', 'key-1', lineupDto(0)),
    ).rejects.toMatchObject({ response: { code: 'COMMAND_CONCURRENCY_CONFLICT' } });
    await expect(
      new TeamMatchLineupService(viaLineup.prisma, audit).saveLineup(manager, 'team-match-1', 'key-1', lineupDto(0)),
    ).rejects.toMatchObject({ response: { code: 'COMMAND_CONCURRENCY_CONFLICT' } });
  });
});
