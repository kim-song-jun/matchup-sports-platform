import { HttpException } from '@nestjs/common';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import type { AdminContextService } from '../../common/admin-context.service';
import type { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TournamentStaffAccessService } from '../../tournaments/staff/tournament-staff-access.service';
import { AdminEventTimeCorrectionController } from './admin-event-time-correction.controller';
import type { AdminCorrectGameEventTimeDto } from './tournament-result-review.dto';
import { TournamentResultReviewService } from './tournament-result-review.service';

const appendEventTimeCorrection = jest.fn();
const syncRevisionEventTimes = jest.fn();
jest.mock('../../games/event-time-correction', () => ({
  appendEventTimeCorrection: (...args: unknown[]) => appendEventTimeCorrection(...args),
  syncRevisionEventTimes: (...args: unknown[]) => syncRevisionEventTimes(...args),
}));
jest.mock('../resolve-game-source', () => ({
  resolveGameSource: async () => ({
    kind: 'teamMatch', tournamentId: 'tournament-1', fixtureId: 'fixture-1',
    tournamentKind: 'regular_tournament', fieldId: null, teamMatchId: 'fixture-1',
  }),
}));

const user: V1AuthUser = { id: 'admin-1', email: 'admin@example.test', accountStatus: 'active', onboardingStatus: 'completed' };
const dto: AdminCorrectGameEventTimeDto = { expectedVersion: 5, clientCommandId: 'cmd-1', clockMs: 9 * 60_000, reason: ' 심판 보고서 대조 ' };
const officialRevision = { id: 'rev-1', revision: 2, state: 'OFFICIAL' };

function harness(options: { role?: 'platform_ops' | 'tournament_director'; officialState?: string | null } = {}) {
  const audits: Array<Record<string, unknown>> = [];
  const tx = {
    $queryRaw: async () => [],
    v1Game: {
      findUnique: async () => ({
        id: 'game-1', sourceType: 'TEAM_MATCH', teamMatchId: 'fixture-1', state: 'ENDED', version: 5,
        currentOfficialRevisionId: options.officialState === null ? null : 'rev-1', competitionConfigVersionId: 'config-1',
      }),
      findUniqueOrThrow: async () => ({ lastSequence: 12 }),
    },
    v1GameResultRevision: {
      findUnique: async () => (options.officialState === null ? null : { ...officialRevision, state: options.officialState ?? 'OFFICIAL' }),
    },
    v1IdempotencyRecord: { findUnique: async () => null, create: async () => ({}) },
  };
  const prisma = { $transaction: async <T>(callback: (client: unknown) => Promise<T>) => callback(tx) } as unknown as PrismaService;
  const role = options.role ?? 'platform_ops';
  const staffAccess = {
    assertAccess: async () => ({ role, authorizationSubject: `${role}:admin-1@1`, assignmentId: null, assignmentVersion: null }),
  } as unknown as TournamentStaffAccessService;
  const auditWriter = {
    create: async (_client: unknown, input: Record<string, unknown>) => {
      audits.push(input);
      return {};
    },
  } as unknown as OperationAuditWriterService;
  return { service: new TournamentResultReviewService(prisma, staffAccess, auditWriter), audits };
}

async function failure(operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;
    return { status: exception.getStatus(), code: (exception.getResponse() as { code: string }).code };
  }
  throw new Error('expected failure');
}

beforeEach(() => {
  appendEventTimeCorrection.mockReset().mockResolvedValue({
    correction: { id: 'correction-1' }, target: { id: 'card-1', period: 1 }, previousClockMs: 11 * 60_000,
    sequence: 13, version: 6, state: 'ENDED',
  });
  syncRevisionEventTimes.mockReset().mockResolvedValue({
    revisionId: 'rev-2', revision: 3, revisionState: 'OFFICIAL', supersedesRevisionId: 'rev-1',
  });
});

describe('TournamentResultReviewService.correctOfficialEventTime (MD-QA #187)', () => {
  it('appends a PLATFORM_ADMIN correction, supersedes the official snapshot and audits old/new clock with the reason', async () => {
    const { service, audits } = harness();
    const result = await service.correctOfficialEventTime(user, 'game-1', 'card-1', 'cmd-1', dto);
    expect(appendEventTimeCorrection).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      gameId: 'game-1', eventId: 'card-1', clockMs: 9 * 60_000, lane: 'PLATFORM_ADMIN', clientEventId: 'cmd-1',
      actorUserId: 'admin-1', lastSequence: 12, competitionConfigVersionId: 'config-1',
    }));
    expect(syncRevisionEventTimes).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      gameId: 'game-1', base: expect.objectContaining({ id: 'rev-1' }), reason: '어드민 사건 시각 정정: 심판 보고서 대조',
    }));
    expect(result).toMatchObject({
      revisionId: 'rev-2', revisionState: 'OFFICIAL', version: 6, replayed: false,
      eventTimeCorrection: { eventId: 'card-1', correctionEventId: 'correction-1', previousClockMs: 11 * 60_000, clockMs: 9 * 60_000, supersededRevisionId: 'rev-1' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'EVENT_TIME_CORRECT_OFFICIAL',
      reason: '심판 보고서 대조',
      after: expect.objectContaining({ eventTimeCorrection: expect.objectContaining({ previousClockMs: 11 * 60_000, clockMs: 9 * 60_000 }) }),
    });
  });

  it('keeps the current official revision when no snapshot minute changed', async () => {
    syncRevisionEventTimes.mockResolvedValueOnce(null);
    const { service } = harness();
    const result = await service.correctOfficialEventTime(user, 'game-1', 'card-1', 'cmd-1', dto);
    expect(result).toMatchObject({ revisionId: 'rev-1', revision: 2, eventTimeCorrection: { supersededRevisionId: null } });
  });

  it('refuses tournament directors — after confirmation only platform owner/ops admins may correct', async () => {
    const { service } = harness({ role: 'tournament_director' });
    expect(await failure(service.correctOfficialEventTime(user, 'game-1', 'card-1', 'cmd-1', dto))).toEqual({ status: 403, code: 'PERMISSION_DENIED' });
    expect(appendEventTimeCorrection).not.toHaveBeenCalled();
  });

  it.each([[null], ['VOID']])('sends unconfirmed results (official=%s) back to the console path', async (state) => {
    const { service } = harness({ officialState: state });
    expect(await failure(service.correctOfficialEventTime(user, 'game-1', 'card-1', 'cmd-1', dto))).toEqual({ status: 409, code: 'RESULT_NOT_OFFICIAL' });
    expect(appendEventTimeCorrection).not.toHaveBeenCalled();
  });
});

describe('AdminEventTimeCorrectionController', () => {
  it('requires a mutation admin (support is refused) before calling the service', async () => {
    const order: string[] = [];
    const adminContext = { getMutationAdmin: jest.fn(async () => { order.push('admin'); }) } as unknown as AdminContextService;
    const resultReview = { correctOfficialEventTime: jest.fn(async () => { order.push('service'); return {}; }) } as unknown as TournamentResultReviewService;
    const controller = new AdminEventTimeCorrectionController(adminContext, resultReview);
    await controller.correctTime(user, 'game-1', 'card-1', 'cmd-1', dto);
    expect(adminContext.getMutationAdmin).toHaveBeenCalledWith('admin-1');
    expect(order).toEqual(['admin', 'service']);
  });
});
