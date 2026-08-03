import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Task 14 blocker fix: requestIdentityLink/attestIdentityLink/
 * revokeIdentityLink/grantParticipantConsent/revokeParticipantConsent used to
 * resolve the calling actor via the plain `'read'` authorization scope - the
 * same scope `getGame` uses, satisfied by any scoped tournament staff
 * assignment (field_operator, support_readonly) on a TOURNAMENT_FIXTURE game,
 * even though the canonical actor-action matrix grants those roles no
 * authority over participant identity/consent at all. This spec proves a
 * dedicated `participant_identity` scope now denies those staff roles and
 * still allows `platform_ops`.
 *
 * On revert, `requestIdentityLink`/`grantParticipantConsent` below would
 * resolve `role: 'field_operator'`/`'support_readonly'` and succeed (creating
 * a real REQUESTED event / attempting a consent mutation) instead of
 * throwing 403 PERMISSION_DENIED.
 */

const ids = {
  platformOps: '6b000000-0000-4000-8000-000000000001',
  fieldOperator: '6b000000-0000-4000-8000-000000000002',
  supportReadonly: '6b000000-0000-4000-8000-000000000003',
  director: '6b000000-0000-4000-8000-000000000004',
  sport: '6b000000-0000-4000-8000-000000000010',
  region: '6b000000-0000-4000-8000-000000000011',
  hostTeam: '6b000000-0000-4000-8000-000000000020',
  opponentTeam: '6b000000-0000-4000-8000-000000000021',
  tournament: '6b000000-0000-4000-8000-000000000030',
  fixture: '6b000000-0000-4000-8000-000000000040',
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
    actor: { actorType: 'USER', actorUserId: ids.platformOps, role: 'platform_ops' },
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

function expectForbidden(error: unknown) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(403);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code: 'PERMISSION_DENIED' }));
}

describe('Task 14 participant identity/consent scope excludes tournament staff', () => {
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
      data: [ids.platformOps, ids.fieldOperator, ids.supportReadonly, ids.director].map((id, index) => ({
        id,
        email: `task14-staff-scope-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
    });
    await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { id: ids.sport, code: 'football', name: 'Task 14 Staff Scope Football' },
      update: {},
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK14_STAFF_SCOPE_REGION', name: 'Task 14 Staff Scope Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task 14 Staff Scope Host' },
        { id: ids.opponentTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task 14 Staff Scope Opponent' },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'Task 14 staff scope tournament', competitionConfigVersionId: configId },
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1TournamentStaffAssignment.createMany({
      data: [
        { tournamentId: ids.tournament, userId: ids.fieldOperator, role: 'FIELD_OPERATOR', grantedByUserId: ids.platformOps },
        { tournamentId: ids.tournament, userId: ids.supportReadonly, role: 'SUPPORT_READONLY', grantedByUserId: ids.platformOps },
        { tournamentId: ids.tournament, userId: ids.director, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: ids.platformOps },
      ],
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 14 Staff Scope Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 14 Staff Scope Opponent' },
      ],
      participants: [
        { sourceParticipantId: 'staff-scope-guest-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Staff Scope Guest' },
      ],
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, creationContext('staff-scope-source-create', input)),
    );
    gameId = created.gameId;
    participantId = (await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('denies field_operator and support_readonly from requesting an identity link, without creating any event', async () => {
    const before = await prisma.v1ParticipantIdentityLinkEvent.count({ where: { participantId } });

    const fieldOperatorDenied = await captureFailure(() =>
      service.requestIdentityLink(authUser(ids.fieldOperator), gameId, participantId, 'staff-scope-field-op-request', {
        expectedVersion: 0,
        clientCommandId: 'staff-scope-field-op-request',
      }),
    );
    expectForbidden(fieldOperatorDenied);

    const supportReadonlyDenied = await captureFailure(() =>
      service.requestIdentityLink(authUser(ids.supportReadonly), gameId, participantId, 'staff-scope-support-request', {
        expectedVersion: 0,
        clientCommandId: 'staff-scope-support-request',
      }),
    );
    expectForbidden(supportReadonlyDenied);

    const directorDenied = await captureFailure(() =>
      service.requestIdentityLink(authUser(ids.director), gameId, participantId, 'staff-scope-director-request', {
        expectedVersion: 0,
        clientCommandId: 'staff-scope-director-request',
      }),
    );
    expectForbidden(directorDenied);

    expect(await prisma.v1ParticipantIdentityLinkEvent.count({ where: { participantId } })).toBe(before);
  });

  it('denies support_readonly from granting participant consent', async () => {
    const denied = await captureFailure(() =>
      service.grantParticipantConsent(authUser(ids.supportReadonly), gameId, participantId, 'staff-scope-consent-grant', {
        expectedVersion: 0,
        clientCommandId: 'staff-scope-consent-grant',
        linkId: '11111111-1111-4111-8111-111111111111',
        policyHash: 'policy-hash-v1',
      }),
    );
    expectForbidden(denied);
    expect(await prisma.v1ParticipantConsentSnapshot.count({ where: { participantId } })).toBe(0);
  });

  it('still allows platform_ops to reach the identity-link command (positive control)', async () => {
    const request = await service.requestIdentityLink(
      authUser(ids.platformOps),
      gameId,
      participantId,
      'staff-scope-admin-request',
      { expectedVersion: 0, clientCommandId: 'staff-scope-admin-request' },
    );
    expect(request).toEqual(expect.objectContaining({ state: 'pending_attestation' }));
  });
});
