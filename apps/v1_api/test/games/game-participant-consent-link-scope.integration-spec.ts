import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Task 14 원래 계약(위 커밋 이력 참고)은 "직전 스냅샷이 GRANTED여야만 철회
 * 가능"이었고, 그 가드가 참가자의 *현재* 신원 연결과 무관하게 `participantId`
 * 만으로 "마지막" 스냅샷을 찾았다(`orderBy consentVersion desc`) -- 그래서
 * 죽은 링크(A) 밑에 남은 낡은 GRANTED를, 그 링크를 가져본 적 없는 새 링크(B)
 * 보유자가 철회 요청 한 번으로 "뒤집을" 수 있는 구멍이 있었다. 그 사고를
 * 재현·고정한 스펙이었다.
 *
 * 이 worktree(2026-08-13 사용자 재정의)는 그 가드 자체를 없앴다: 공개 동의의
 * 출처가 참가자 단위 스냅샷에서 사용자 단위 `V1UserRecordConsent`로 옮겨가면서,
 * 라인업에서 자동 연결(`ROSTER_ASSERTED`)된 참가 기록은 참가자 스냅샷을 한 번도
 * 거치지 않는 경우가 흔해졌다 -- "직전 스냅샷 GRANTED 필수"를 유지하면 그런
 * 사용자는 자기 기록 하나만 개별로 숨기는 길이 아예 막힌다. 새 규칙은
 * "현재 링크가 호출자 것이면, 그 링크 아래 스냅샷이 하나도 없어도 철회(=개별
 * 숨김 생성)할 수 있다"이다(`revokeParticipantConsent`, `games.service.ts`).
 *
 * 다만 이 스펙이 원래 지키려던 불변식 -- **죽은 linkId 아래 남은 낡은 GRANTED를
 * 그 링크를 가져본 적 없는 제3의 링크 보유자가 뒤집어 이력을 날조할 수 없다** --
 * 는 새 규칙에서도 여전히 유효하다. 스냅샷 조회가 `current.linkId`로 스코프되기
 * 때문에(`scoped = findFirst({ participantId, linkId: current.linkId })`), 링크
 * B 보유자가 만드는 새 스냅샷은 항상 `linkId: B`로만 쓰이고 링크 A의 행은 절대
 * 건드리지 않는다. 이 스펙은 그 스코핑이 실제로 지켜지는지를 증명한다:
 *
 *  - 링크 B 보유자의 철회 호출은 이제 성공한다(에러가 아니라 200).
 *  - 새로 생기는 REVOKED 스냅샷의 `linkId`는 B다(A가 아니다).
 *  - 링크 A의 기존 GRANTED 행은 손대지 않은 채로(state=GRANTED, linkId=A) 그대로
 *    남는다.
 *  - `consentVersion`은 `@@unique([participantId, consentVersion])` 제약을
 *    공유하므로 링크로 스코프하지 않은 참가자 전체 최댓값(A의 1)에서 이어
 *    붙는다(B의 새 행은 2).
 */

const ids = {
  hostUser: '6c000000-0000-4000-8000-000000000001',
  opponentUser: '6c000000-0000-4000-8000-000000000002',
  sport: '6c000000-0000-4000-8000-000000000010',
  region: '6c000000-0000-4000-8000-000000000011',
  hostTeam: '6c000000-0000-4000-8000-000000000020',
  opponentTeam: '6c000000-0000-4000-8000-000000000021',
  teamMatch: '6c000000-0000-4000-8000-000000000030',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function creationContext(commandId: string, payload: unknown): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.hostUser, role: 'team_owner' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

describe('revokeParticipantConsent is scoped to the current identity link', () => {
  let configId: string;
  let gameId: string;
  let participantId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for this integration verification');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('Task 11 football-v1 preset is required');
    }
    configId = config.id;
    await prisma.v1User.createMany({
      data: [ids.hostUser, ids.opponentUser].map((id, index) => ({
        id,
        email: `task14-consent-link-scope-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1UserProfile.create({
      data: { userId: ids.opponentUser, nickname: 'Consent Scope Nickname' },
    });
    await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { id: ids.sport, code: 'football', name: 'Task 14 Consent Scope Football' },
      update: {},
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK14_CONSENT_SCOPE_REGION', name: 'Task 14 Consent Scope Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostUser, sportId: ids.sport, regionId: ids.region, name: 'Task 14 Consent Scope Host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentUser, sportId: ids.sport, regionId: ids.region, name: 'Task 14 Consent Scope Opponent' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentUser, role: 'owner', status: 'active' },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostUser,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Task 14 consent link scope match',
        placeName: 'Task 14 ground',
        startAt: new Date('2026-09-01T00:00:00.000Z'),
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: configId,
      },
    });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatch,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 14 Consent Scope Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 14 Consent Scope Opponent' },
      ],
      participants: [
        { sourceParticipantId: 'consent-scope-guest-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Consent Scope Guest' },
      ],
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, creationContext('consent-scope-source-create', input)),
    );
    gameId = created.gameId;
    participantId = (await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("revokes only the current link's own history, never rewriting a dead link's leftover GRANTED snapshot", async () => {
    // Link A: opponentUser self-requests, hostUser (distinct, owns the
    // participant's HOME side) attests.
    const requestA = await service.requestIdentityLink(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      'consent-scope-request-a',
      { expectedVersion: 0, clientCommandId: 'consent-scope-request-a' },
    );
    const attestedA = await service.attestIdentityLink(
      authUser(ids.hostUser),
      gameId,
      participantId,
      requestA.requestId,
      'consent-scope-attest-a',
      { expectedVersion: requestA.version, clientCommandId: 'consent-scope-attest-a', decision: 'approve' },
    );
    const linkA = requestA.requestId;

    // Consent is granted under link A.
    const grantedA = await service.grantParticipantConsent(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      'consent-scope-grant-a',
      { expectedVersion: attestedA.version, clientCommandId: 'consent-scope-grant-a', linkId: linkA, policyHash: 'policy-hash-v1' },
    );
    expect(grantedA.state).toBe('GRANTED');
    expect(
      await prisma.v1ParticipantConsentSnapshot.findMany({ where: { participantId }, orderBy: { consentVersion: 'asc' } }),
    ).toEqual([expect.objectContaining({ linkId: linkA, state: 'GRANTED', consentVersion: 1 })]);

    // Link A is revoked. This does NOT itself revoke the consent granted
    // under it - the v1 GRANTED row is left behind, now orphaned from any
    // current link.
    const revokedA = await service.revokeIdentityLink(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      linkA,
      'consent-scope-revoke-link-a',
      { expectedVersion: grantedA.version, clientCommandId: 'consent-scope-revoke-link-a', reason: 'link A revoked' },
    );
    expect(await prisma.v1ParticipantIdentityLinkCurrent.findUnique({ where: { participantId } })).toBeNull();
    // The stale grant is still there, untouched, and still GRANTED.
    expect(
      await prisma.v1ParticipantConsentSnapshot.count({ where: { participantId, linkId: linkA, state: 'GRANTED' } }),
    ).toBe(1);

    // Link B: a fresh request/attest cycle establishes a brand-new current
    // link with a brand-new linkId. No consent has ever been granted under
    // link B.
    const requestB = await service.requestIdentityLink(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      'consent-scope-request-b',
      { expectedVersion: revokedA.version, clientCommandId: 'consent-scope-request-b' },
    );
    const attestedB = await service.attestIdentityLink(
      authUser(ids.hostUser),
      gameId,
      participantId,
      requestB.requestId,
      'consent-scope-attest-b',
      { expectedVersion: requestB.version, clientCommandId: 'consent-scope-attest-b', decision: 'approve' },
    );
    const linkB = requestB.requestId;
    expect(linkB).not.toBe(linkA);
    const currentAfterB = await prisma.v1ParticipantIdentityLinkCurrent.findUniqueOrThrow({
      where: { participantId },
    });
    expect(currentAfterB.linkId).toBe(linkB);

    const snapshotCountBeforeRevoke = await prisma.v1ParticipantConsentSnapshot.count({ where: { participantId } });
    expect(snapshotCountBeforeRevoke).toBe(1); // only the stale link-A grant

    // The current (link-B) holder revokes without link B ever having been
    // granted any consent snapshot of its own. Under the new contract this
    // now SUCCEEDS -- "current link is mine" is sufficient to create an
    // individual hide-override, precisely so a ROSTER_ASSERTED-linked user
    // (who never went through a participant-scoped grant at all) can still
    // hide their own record. It must NOT touch link A's leftover grant.
    const revokedUnderB = await service.revokeParticipantConsent(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      'consent-scope-revoke-under-b',
      { expectedVersion: attestedB.version, clientCommandId: 'consent-scope-revoke-under-b', reason: 'hide my own record' },
    );
    expect(revokedUnderB.state).toBe('REVOKED');

    // A brand-new snapshot was written under link B, not link A, and its
    // consentVersion continues from the participant-wide max (A's 1) rather
    // than starting its own sequence at 1 -- the two share one
    // `@@unique([participantId, consentVersion])` space.
    const allSnapshots = await prisma.v1ParticipantConsentSnapshot.findMany({
      where: { participantId },
      orderBy: { consentVersion: 'asc' },
    });
    expect(allSnapshots).toHaveLength(2);
    expect(allSnapshots[0]).toEqual(
      expect.objectContaining({ linkId: linkA, state: 'GRANTED', consentVersion: 1 }),
    );
    expect(allSnapshots[1]).toEqual(
      expect.objectContaining({ linkId: linkB, state: 'REVOKED', consentVersion: 2 }),
    );

    // Link A's row is byte-for-byte untouched: still GRANTED, still linkId=A.
    const linkARow = await prisma.v1ParticipantConsentSnapshot.findFirstOrThrow({
      where: { participantId, linkId: linkA },
    });
    expect(linkARow.state).toBe('GRANTED');
    expect(linkARow.consentVersion).toBe(1);
  });
});
