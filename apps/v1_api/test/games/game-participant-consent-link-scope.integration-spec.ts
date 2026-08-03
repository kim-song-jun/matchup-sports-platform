import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Task 14 blocker fix: `revokeParticipantConsent` used to look up the "last"
 * consent snapshot by `participantId` alone (`orderBy consentVersion desc`),
 * never cross-checking it against the participant's *current* identity link
 * - unlike `grantParticipantConsent`, which already rejects a mismatched
 * `dto.linkId` with `409 CONSENT_LINK_MISMATCH`.
 *
 * `revokeIdentityLink` does not itself revoke consent (consent is a separate
 * append-only history), so a still-GRANTED snapshot can be left behind under
 * a link that is no longer current. This spec builds exactly that state -
 * grant under link A, revoke link A (consent stays GRANTED), then establish
 * a brand-new link B that never had its own consent granted - and proves
 * `revokeParticipantConsent` now refuses to "revoke" the stale link-A grant
 * on link B's behalf.
 *
 * On revert, the final call below would succeed (200), fabricate a new
 * `REVOKED` consent snapshot whose `linkId` still points at the dead link A,
 * and bump the snapshot count to 2 instead of throwing `409
 * CONSENT_NOT_GRANTED` with the count held at 1.
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
const service = new GamesService(prisma, new OperationAuditWriterService());

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

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

describe('Task 14 revokeParticipantConsent is scoped to the current identity link', () => {
  let configId: string;
  let gameId: string;
  let participantId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 14 integration verification');
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

  it('refuses to revoke a stale link\'s leftover GRANTED consent snapshot on behalf of a brand-new link', async () => {
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
    ).toEqual([expect.objectContaining({ linkId: linkA, state: 'GRANTED' })]);

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

    // The current (link-B) holder tries to revoke consent without link B
    // ever having been granted any. This must fail - there is nothing to
    // revoke under the CURRENT link - rather than silently "revoking" link
    // A's leftover grant.
    const revokeUnderLinkB = await captureFailure(() =>
      service.revokeParticipantConsent(
        authUser(ids.opponentUser),
        gameId,
        participantId,
        'consent-scope-revoke-under-b',
        { expectedVersion: attestedB.version, clientCommandId: 'consent-scope-revoke-under-b', reason: 'nothing to revoke' },
      ),
    );
    expectHttpCode(revokeUnderLinkB, 409, 'CONSENT_NOT_GRANTED');

    // No new snapshot row was fabricated, and the stale link-A row is
    // untouched (still GRANTED, still linkId=A).
    expect(await prisma.v1ParticipantConsentSnapshot.count({ where: { participantId } })).toBe(1);
    const onlyRow = await prisma.v1ParticipantConsentSnapshot.findFirstOrThrow({ where: { participantId } });
    expect(onlyRow.linkId).toBe(linkA);
    expect(onlyRow.state).toBe('GRANTED');
  });
});
