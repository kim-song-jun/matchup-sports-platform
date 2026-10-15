import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { TOURNAMENT_CUTOVER_SHARED_LOCK } from '../common/tournament-cutover-lock';
import { isCommandConcurrencyConflict } from '../games/command-concurrency-error';
import { assertGameCommandContext } from '../games/core/game-contract';
import { gameOperationAuditScope } from '../games/game-operation-audit-scope';
import { endLiveGamePeriod } from '../games/period-transition';
import type { PrismaService } from '../prisma/prisma.service';
import { parsePeriodDurations } from '../tournaments/competition-config/competition-config.parse';

const SCAN_BATCH_SIZE = 20;
const SCAN_INTERVAL_MS = 1_000;
const CLOCK_TRANSACTION_BUDGET_MS = 2_000;
const CLOCK_ACTOR = { actorType: 'SYSTEM', systemActor: 'GAME_CLOCK_EXPIRY' } as const;
const clockSelect = {
  id: true, sourceType: true, state: true, version: true,
  teamMatch: { select: { deletedAt: true } },
  competitionConfig: { select: { periods: true } },
  periods: {
    where: { state: 'LIVE' }, orderBy: { number: 'asc' }, take: 1,
    select: { id: true, state: true, number: true, startedAt: true, pausedAt: true, pausedTotalMs: true },
  },
} as const satisfies Prisma.V1GameSelect;
type ClockGame = Prisma.V1GameGetPayload<{ select: typeof clockSelect }>;

function expiredPeriod(game: ClockGame, now: Date) {
  // A shared score sheet owns result confirmation; it does not disable an already-started clock.
  if (game.sourceType !== 'TEAM_MATCH' || game.state !== 'LIVE' ||
      game.teamMatch === null || game.teamMatch.deletedAt !== null) return null;
  const period = game.periods[0];
  if (!period || period.state !== 'LIVE' || period.startedAt === null || period.pausedAt !== null) return null;
  const duration = parsePeriodDurations(game.competitionConfig.periods)?.[period.number - 1];
  if (!duration) return null;
  // extraTime identifies a separate period; its duration is already the complete threshold.
  const playedMs = now.getTime() - period.startedAt.getTime() - Math.max(0, period.pausedTotalMs);
  return playedMs >= duration.durationMinutes * 60_000 ? period : null;
}

/** Poll persisted clocks, including games whose operator browser has disconnected. */
export class GameClockExpiryService {
  private cursor: string | null = null;
  private nextScanAt = 0;
  private readonly audit = new OperationAuditWriterService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly accepting: () => boolean = () => true,
  ) {}

  async processOne(): Promise<boolean> {
    if (!this.accepting() || Date.now() < this.nextScanAt) return false;
    this.nextScanAt = Date.now() + SCAN_INTERVAL_MS;
    const candidates = await this.prisma.v1Game.findMany({
      where: {
        sourceType: 'TEAM_MATCH', state: 'LIVE',
        teamMatch: { is: { deletedAt: null } },
        periods: { some: { state: 'LIVE', startedAt: { not: null }, pausedAt: null } },
        ...(this.cursor === null ? {} : { id: { gt: this.cursor } }),
      },
      select: clockSelect, orderBy: { id: 'asc' }, take: SCAN_BATCH_SIZE,
    });
    if (candidates.length === 0) this.cursor = null;
    for (const candidate of candidates) {
      if (!this.accepting()) return false;
      this.cursor = candidate.id;
      if (expiredPeriod(candidate, new Date()) === null) continue;
      // At most one locked transaction per poll, even if many candidates race an operator.
      return this.expire(candidate.id);
    }
    return false;
  }

  private async expire(gameId: string): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const maintenance = await tx.$queryRaw<Array<{ acquired: boolean }>>(TOURNAMENT_CUTOVER_SHARED_LOCK);
        if (maintenance[0]?.acquired !== true) return false;
        // Same canonical lock as operator commands, before any decision based on a fresh clock.
        await tx.$queryRaw`SELECT id FROM v1_games WHERE id = ${gameId} FOR UPDATE`;
        const game = await tx.v1Game.findUnique({ where: { id: gameId }, select: clockSelect });
        if (game === null) return false;
        const now = new Date();
        const period = expiredPeriod(game, now);
        if (period === null) return false;
        const commandId = `clock-expiry:${game.id}:${period.id}:${game.version}`;
        const payloadHash = createHash('sha256').update(JSON.stringify({
          gameId: game.id, periodId: period.id, version: game.version,
        })).digest('hex');
        const context = assertGameCommandContext({
          actor: CLOCK_ACTOR, expectedVersion: game.version, currentVersion: game.version,
          headerIdempotencyKey: commandId, bodyClientCommandId: commandId, payloadHash,
        });
        const scope = {
          actorUserId: `SYSTEM:${CLOCK_ACTOR.systemActor}`, action: 'game_end_period',
          resourceType: 'GAME', resourceId: game.id, idempotencyKey: context.durableCommandId,
        };
        if (await tx.v1IdempotencyRecord.findUnique({
          where: { actorUserId_action_resourceType_resourceId_idempotencyKey: scope },
        })) return false;
        const auditScope = await gameOperationAuditScope(tx, game.id, (code = 'GAME_NOT_FOUND') =>
          new NotFoundException({ code, message: '경기를 찾을 수 없어요' }));
        const result = await endLiveGamePeriod(tx, game, context.durableCommandId);
        const response = { ...result };
        await tx.v1IdempotencyRecord.create({
          data: {
            ...scope, payloadHash, responseStatus: 200, responseBody: response,
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
          },
        });
        await this.audit.create(tx, {
          actor: { type: 'SYSTEM', id: CLOCK_ACTOR.systemActor },
          requestId: context.durableCommandId, action: 'GAME_END_PERIOD',
          targetType: 'GAME', targetId: game.id, occurredAt: now, sourceIp: null,
          before: { state: game.state, version: game.version }, after: response, ...auditScope,
        });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 1_000, timeout: CLOCK_TRANSACTION_BUDGET_MS });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError &&
          isCommandConcurrencyConflict(error.code, error.meta, error.message)) return false;
      throw error;
    }
  }
}
