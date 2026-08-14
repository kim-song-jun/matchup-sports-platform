import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { validate as validateDto } from 'class-validator';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import { projectParticipantForPublic } from '../../src/games/core';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';

const ids = {
  hostUser: '68000000-0000-4000-8000-000000000001',
  opponentUser: '68000000-0000-4000-8000-000000000002',
  strangerUser: '68000000-0000-4000-8000-000000000003',
  hostManagerUser: '68000000-0000-4000-8000-000000000004',
  hostMemberUser: '68000000-0000-4000-8000-000000000005',
  sport: '68000000-0000-4000-8000-000000000010',
  region: '68000000-0000-4000-8000-000000000011',
  hostTeam: '68000000-0000-4000-8000-000000000020',
  opponentTeam: '68000000-0000-4000-8000-000000000021',
  teamMatch: '68000000-0000-4000-8000-000000000030',
  teamMatchManagerScope: '68000000-0000-4000-8000-000000000031',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function context(commandId: string, payload: unknown): GameCommandContext {
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

describe('Task 14 participant identity link + consent', () => {
  let configId: string;
  let gameId: string;
  let participantId: string;
  let managerScopeGameId: string;
  let managerScopeParticipantId: string;

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
      data: [
        ids.hostUser,
        ids.opponentUser,
        ids.strangerUser,
        ids.hostManagerUser,
        ids.hostMemberUser,
      ].map((id, index) => ({
        id,
        email: `task14-identity-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'football', name: 'Task 14 Identity Football' },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK14_IDENTITY_REGION', name: 'Task 14 Identity Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.hostUser, sportId: ids.sport, regionId: ids.region, name: 'Task 14 Host' },
        { id: ids.opponentTeam, ownerUserId: ids.opponentUser, sportId: ids.sport, regionId: ids.region, name: 'Task 14 Opponent' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: ids.hostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
        { teamId: ids.opponentTeam, userId: ids.opponentUser, role: 'owner', status: 'active' },
        // Track A fixture: a manager and a plain member on the host team, used to prove
        // assertAttestorAuthority() now accepts manager (not owner-only) while still
        // rejecting member.
        { teamId: ids.hostTeam, userId: ids.hostManagerUser, role: 'manager', status: 'active' },
        { teamId: ids.hostTeam, userId: ids.hostMemberUser, role: 'member', status: 'active' },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostUser,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Task 14 identity match',
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
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 14 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 14 Opponent' },
      ],
      participants: [
        { sourceParticipantId: 'guest-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Unlinked Guest' },
      ],
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, context('identity-source-create', input)),
    );
    gameId = created.gameId;
    const persisted = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId } });
    participantId = persisted.id;

    // Track A fixture: a second, independent team match/game so the manager/member
    // attestation-authority cases below don't depend on the mutable state the tests
    // above leave `gameId`/`participantId` in.
    await prisma.v1TeamMatch.create({
      data: {
        id: ids.teamMatchManagerScope,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostUser,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Task 14 identity match (manager scope)',
        placeName: 'Task 14 ground',
        startAt: new Date('2026-09-02T00:00:00.000Z'),
        approvedApplicantTeamId: ids.opponentTeam,
        competitionConfigVersionId: configId,
      },
    });
    const managerScopeInput: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: ids.teamMatchManagerScope,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 14 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 14 Opponent' },
      ],
      participants: [
        { sourceParticipantId: 'guest-manager-scope-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Unlinked Guest 2' },
      ],
    };
    const managerScopeCreated = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(
        tx,
        managerScopeInput,
        context('identity-manager-scope-source-create', managerScopeInput),
      ),
    );
    managerScopeGameId = managerScopeCreated.gameId;
    const managerScopePersisted = await prisma.v1GameParticipant.findFirstOrThrow({
      where: { gameId: managerScopeGameId },
    });
    managerScopeParticipantId = managerScopePersisted.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lets the claimant self-request, requires a distinct attestor, and rejects self-attestation', async () => {
    const request = await service.requestIdentityLink(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      'identity-request-1',
      { expectedVersion: 0, clientCommandId: 'identity-request-1' },
    );
    expect(request).toEqual(
      expect.objectContaining({ state: 'pending_attestation', requestId: expect.any(String) }),
    );

    const selfAttest = await captureFailure(() =>
      service.attestIdentityLink(
        authUser(ids.opponentUser),
        gameId,
        participantId,
        request.requestId,
        'identity-self-attest',
        { expectedVersion: request.version, clientCommandId: 'identity-self-attest', decision: 'approve' },
      ),
    );
    expectHttpCode(selfAttest, 403, 'IDENTITY_LINK_SELF_ATTESTATION_FORBIDDEN');

    const attested = await service.attestIdentityLink(
      authUser(ids.hostUser),
      gameId,
      participantId,
      request.requestId,
      'identity-attest-1',
      { expectedVersion: request.version, clientCommandId: 'identity-attest-1', decision: 'approve' },
    );
    expect(attested).toEqual(expect.objectContaining({ linkState: 'active' }));

    const current = await prisma.v1ParticipantIdentityLinkCurrent.findUniqueOrThrow({
      where: { participantId },
    });
    expect(current.userId).toBe(ids.opponentUser);

    const publicView = await service.getPublicParticipant(gameId, participantId);
    // No consent yet: still unlinked in the public projection.
    expect(publicView).toEqual({ participantId, kind: 'unlinked' });
  });

  it('requires a matching linkId to grant consent, then reveals nickname only while granted and the link stays current', async () => {
    await prisma.v1UserProfile.create({
      data: { userId: ids.opponentUser, nickname: 'Opponent Nickname', realName: 'Real Person Name' },
    });
    const current = await prisma.v1ParticipantIdentityLinkCurrent.findUniqueOrThrow({
      where: { participantId },
    });

    const staleLinkId = await captureFailure(() =>
      service.grantParticipantConsent(authUser(ids.opponentUser), gameId, participantId, 'consent-stale', {
        expectedVersion: 2,
        clientCommandId: 'consent-stale',
        linkId: 'not-the-current-link',
        policyHash: 'policy-hash-v1',
      }),
    );
    expectHttpCode(staleLinkId, 409, 'CONSENT_LINK_MISMATCH');

    const granted = await service.grantParticipantConsent(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      'consent-grant-1',
      { expectedVersion: 2, clientCommandId: 'consent-grant-1', linkId: current.linkId, policyHash: 'policy-hash-v1' },
    );
    expect(granted.state).toBe('GRANTED');

    const publicView = await service.getPublicParticipant(gameId, participantId);
    expect(publicView).toEqual({ participantId, kind: 'linked', nickname: 'Opponent Nickname' });
    // Real name must never leak into the public projection shape.
    expect(JSON.stringify(publicView)).not.toContain('Real Person Name');

    const revoked = await service.revokeParticipantConsent(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      'consent-revoke-1',
      { expectedVersion: granted.version, clientCommandId: 'consent-revoke-1', reason: '개인정보 비공개 요청' },
    );
    expect(revoked.state).toBe('REVOKED');
    expect(new Date(revoked.purgeDeadline).getTime() - new Date(revoked.effectiveAt).getTime()).toBe(5000);

    const afterRevoke = await service.getPublicParticipant(gameId, participantId);
    expect(afterRevoke).toEqual({ participantId, kind: 'unlinked' });
  });

  it('lets the linked user revoke the identity link, and forbids reusing the dead link for consent afterward', async () => {
    const current = await prisma.v1ParticipantIdentityLinkCurrent.findUniqueOrThrow({
      where: { participantId },
    });
    const revoked = await service.revokeIdentityLink(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      current.linkId,
      'identity-revoke-1',
      { expectedVersion: 4, clientCommandId: 'identity-revoke-1', reason: '연결 해제' },
    );
    expect(revoked.linkId).toBe(current.linkId);
    expect(
      await prisma.v1ParticipantIdentityLinkCurrent.findUnique({ where: { participantId } }),
    ).toBeNull();

    const revokeAgain = await captureFailure(() =>
      service.revokeIdentityLink(
        authUser(ids.opponentUser),
        gameId,
        participantId,
        current.linkId,
        'identity-revoke-2',
        { expectedVersion: revoked.version, clientCommandId: 'identity-revoke-2', reason: 'retry' },
      ),
    );
    expectHttpCode(revokeAgain, 404, 'IDENTITY_LINK_NOT_FOUND');
  });

  it('allows a fresh request after revoke without overlapping the dead link, expires stale requests, and blocks wrong-opponent decisions', async () => {
    const second = await service.requestIdentityLink(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      'identity-request-2',
      { expectedVersion: 5, clientCommandId: 'identity-request-2' },
    );
    expect(second.requestId).not.toBe(''); // fresh linkId path (see linkId===requestId convention)

    const rejectedByStranger = await captureFailure(() =>
      service.attestIdentityLink(
        authUser(ids.strangerUser),
        gameId,
        participantId,
        second.requestId,
        'identity-attest-stranger',
        { expectedVersion: second.version, clientCommandId: 'identity-attest-stranger', decision: 'approve' },
      ),
    );
    expect(rejectedByStranger).toBeInstanceOf(HttpException);
    expect((rejectedByStranger as HttpException).getStatus()).toBe(403);

    const rejected = await service.attestIdentityLink(
      authUser(ids.hostUser),
      gameId,
      participantId,
      second.requestId,
      'identity-reject-1',
      { expectedVersion: second.version, clientCommandId: 'identity-reject-1', decision: 'reject', reason: '본인 확인 불가' },
    );
    expect(rejected.linkState).toBe('rejected');

    const decideAgain = await captureFailure(() =>
      service.attestIdentityLink(
        authUser(ids.hostUser),
        gameId,
        participantId,
        second.requestId,
        'identity-decide-again',
        { expectedVersion: rejected.version, clientCommandId: 'identity-decide-again', decision: 'approve' },
      ),
    );
    expectHttpCode(decideAgain, 409, 'IDENTITY_LINK_ALREADY_DECIDED');

    // Backdate the still-open next request beyond the 24h attestation window
    // to prove expiry is enforced and surfaced with the literal contract code.
    const third = await service.requestIdentityLink(
      authUser(ids.opponentUser),
      gameId,
      participantId,
      'identity-request-3',
      { expectedVersion: rejected.version, clientCommandId: 'identity-request-3' },
    );
    await prisma.v1ParticipantIdentityLinkEvent.updateMany({
      where: { participantId, requestId: third.requestId, action: 'REQUESTED' },
      data: { effectiveAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const expired = await captureFailure(() =>
      service.attestIdentityLink(
        authUser(ids.hostUser),
        gameId,
        participantId,
        third.requestId,
        'identity-attest-expired',
        { expectedVersion: third.version, clientCommandId: 'identity-attest-expired', decision: 'approve' },
      ),
    );
    expectHttpCode(expired, 409, 'IDENTITY_LINK_REQUEST_EXPIRED');

    const expiryRow = await prisma.v1ParticipantIdentityLinkEvent.findFirst({
      where: { participantId, requestId: third.requestId, action: 'EXPIRED' },
    });
    expect(expiryRow).not.toBeNull();
    expect(expiryRow?.systemActor).toBe('IDENTITY_LINK_EXPIRY');
  });

  it('rejects backdated/future/caller-supplied timestamps on every identity-link DTO via global whitelisting', async () => {
    // Mirrors main.ts's global ValidationPipe({ whitelist: true,
    // forbidNonWhitelisted: true }) exactly, so this proves what actually runs
    // in production rejects a caller-supplied effectiveAt/occurredAt — not
    // merely that the DTO class "looks" like it lacks the field.
    const { plainToInstance } = await import('class-transformer');
    const {
      RequestIdentityLinkDto,
      AttestIdentityLinkDto,
      RevokeIdentityLinkDto,
      GrantParticipantConsentDto,
      RevokeParticipantConsentDto,
    } = await import('../../src/games/dto/game-participant-identity.dto');

    const cases: Array<{ cls: new () => object; plain: Record<string, unknown> }> = [
      {
        cls: RequestIdentityLinkDto,
        plain: { expectedVersion: 0, clientCommandId: 'c', effectiveAt: '2020-01-01T00:00:00.000Z' },
      },
      {
        cls: AttestIdentityLinkDto,
        plain: {
          expectedVersion: 0,
          clientCommandId: 'c',
          decision: 'approve',
          effectiveAt: '2999-01-01T00:00:00.000Z',
        },
      },
      {
        cls: RevokeIdentityLinkDto,
        plain: { expectedVersion: 0, clientCommandId: 'c', reason: 'r', effectiveAt: '2020-01-01T00:00:00.000Z' },
      },
      {
        cls: GrantParticipantConsentDto,
        plain: {
          expectedVersion: 0,
          clientCommandId: 'c',
          linkId: '11111111-1111-4111-8111-111111111111',
          policyHash: 'h',
          effectiveAt: '2020-01-01T00:00:00.000Z',
        },
      },
      {
        cls: RevokeParticipantConsentDto,
        plain: { expectedVersion: 0, clientCommandId: 'c', reason: 'r', effectiveAt: '2020-01-01T00:00:00.000Z' },
      },
    ];

    for (const { cls, plain } of cases) {
      const instance = plainToInstance(cls, plain);
      const errors = await validateDto(instance, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors.some((error) => error.property === 'effectiveAt')).toBe(true);
    }
  });

  it('derives a consent-safe public projection deterministically (pure unit check)', () => {
    expect(
      projectParticipantForPublic({
        participantId: 'p1',
        currentLink: { userId: 'u1' },
        latestConsent: { state: 'GRANTED' },
        nickname: '닉네임',
      }),
    ).toEqual({ participantId: 'p1', kind: 'linked', nickname: '닉네임' });

    expect(
      projectParticipantForPublic({
        participantId: 'p2',
        currentLink: { userId: 'u2' },
        latestConsent: { state: 'REVOKED' },
        nickname: '닉네임2',
      }),
    ).toEqual({ participantId: 'p2', kind: 'unlinked' });

    expect(
      projectParticipantForPublic({
        participantId: 'p3',
        currentLink: null,
        latestConsent: null,
        nickname: null,
      }),
    ).toEqual({ participantId: 'p3', kind: 'unlinked' });
  });

  // Track A regression: assertAttestorAuthority() used to query team membership with
  // role: 'owner' only, so a team manager could never approve/reject an identity-link
  // request for their own team's participant even though every other attestation-adjacent
  // gate in this service (resolveActor's team_manager/team_owner branches) already treats
  // owner and manager as equally authoritative. A plain member must still be forbidden.
  it('lets a team manager (not just the owner) attest an identity link for their own team, and forbids a plain member', async () => {
    const request = await service.requestIdentityLink(
      authUser(ids.opponentUser),
      managerScopeGameId,
      managerScopeParticipantId,
      'identity-manager-scope-request-1',
      { expectedVersion: 0, clientCommandId: 'identity-manager-scope-request-1' },
    );
    expect(request).toEqual(
      expect.objectContaining({ state: 'pending_attestation', requestId: expect.any(String) }),
    );

    const memberAttempt = await captureFailure(() =>
      service.attestIdentityLink(
        authUser(ids.hostMemberUser),
        managerScopeGameId,
        managerScopeParticipantId,
        request.requestId,
        'identity-manager-scope-member-attempt',
        {
          expectedVersion: request.version,
          clientCommandId: 'identity-manager-scope-member-attempt',
          decision: 'approve',
        },
      ),
    );
    expectHttpCode(memberAttempt, 403, 'PERMISSION_DENIED');

    const attestedByManager = await service.attestIdentityLink(
      authUser(ids.hostManagerUser),
      managerScopeGameId,
      managerScopeParticipantId,
      request.requestId,
      'identity-manager-scope-manager-attest',
      {
        expectedVersion: request.version,
        clientCommandId: 'identity-manager-scope-manager-attest',
        decision: 'approve',
      },
    );
    expect(attestedByManager).toEqual(expect.objectContaining({ linkState: 'active' }));

    const current = await prisma.v1ParticipantIdentityLinkCurrent.findUniqueOrThrow({
      where: { participantId: managerScopeParticipantId },
    });
    expect(current.userId).toBe(ids.opponentUser);
  });
});
