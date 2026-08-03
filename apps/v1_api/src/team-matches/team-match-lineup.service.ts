import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, V1GameLineupState, type V1GameLineup } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { canonicalGameCommandPayloadHash } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangeRequestTeamMatchLineupDto,
  SaveTeamMatchLineupDto,
  SubmitTeamMatchLineupDto,
  TeamMatchLineupParticipantDto,
} from './dto/team-match-lineup.dto';

type Transaction = Prisma.TransactionClient;

/** `V1GameParticipant.position` sentinel reserved for a bench entry. Chosen
 * because the model has no dedicated starter/bench boolean column (see
 * Task 14 report for the follow-up schema request). */
const BENCH_MARKER = 'BENCH';
/** Sentinel for the single starting goalkeeper, matching the convention
 * already used implicitly for `V1GameResultParticipant.goalkeeper`. */
const GOALKEEPER_MARKER = 'GK';

interface TeamMatchLineupContext {
  gameId: string;
  gameCompetitionConfigVersionId: string;
  teamMatchId: string;
  startAt: Date;
  ownSideId: string;
  ownTeamId: string;
  opponentSideId: string;
  opponentTeamId: string | null;
  role: 'team_owner' | 'team_manager';
}

@Injectable()
export class TeamMatchLineupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationAuditWriter: OperationAuditWriterService,
  ) {}

  async getLineup(user: V1AuthUser, teamMatchId: string) {
    return this.prisma.$transaction(async (tx) => {
      const context = await this.loadContext(tx, teamMatchId, user.id);
      const lineup = await this.lazyLock(
        tx,
        await this.latestLineup(tx, context.gameId, context.ownSideId),
        context.startAt,
      );
      const visibility = await tx.v1GameVisibilityPolicy.findUnique({
        where: { gameId: context.gameId },
      });
      return this.serializeLineup(tx, context, lineup, visibility?.lineupAt ?? null);
    });
  }

  async saveLineup(
    user: V1AuthUser,
    teamMatchId: string,
    headerIdempotencyKey: string | undefined,
    dto: SaveTeamMatchLineupDto,
  ) {
    return this.serializable(async (tx) => {
      // Authorization/resource resolution always runs — even on an
      // idempotent replay — mirroring GamesService.withCommand, which
      // resolves the actor before consulting the idempotency record.
      const context = await this.loadContext(tx, teamMatchId, user.id);
      return this.withIdempotency(
        tx,
        {
          actorUserId: user.id,
          action: 'save',
          resourceId: teamMatchId,
          idempotencyKey: headerIdempotencyKey,
          payload: dto,
        },
        async () => {
          if (Date.now() >= context.startAt.getTime()) {
            throw new ConflictException({
              code: 'LINEUP_DEADLINE_PASSED',
              message: '경기 시작 이후에는 라인업을 직접 수정할 수 없어요. 상대팀에 정정을 요청해 주세요.',
            });
          }
          const previous = await this.lazyLock(
            tx,
            await this.latestLineup(tx, context.gameId, context.ownSideId),
            context.startAt,
          );
          if (previous !== null && previous.state !== V1GameLineupState.DRAFT) {
            throw new ConflictException({
              code: 'LINEUP_LOCKED_FOR_DIRECT_EDIT',
              message: '제출된 라인업은 직접 수정할 수 없어요. 상대팀의 정정 요청이 있어야 다시 작성할 수 있어요.',
            });
          }
          // The CAS token is the lineup chain's `revision`, not the raw
          // per-row `version` column: every save supersedes into a brand-new
          // row whose own `version` always restarts at 0, so `version` alone
          // could never detect "someone else already saved a newer draft".
          if ((previous?.revision ?? 0) !== dto.expectedVersion) {
            // details로 감싸지 않으면 AllExceptionsFilter가 messageObj?.details만 클라이언트로
            // 전달하기 때문에 expectedVersion/currentVersion이 응답에서 통째로 사라진다 —
            // team-schedules.service.ts 등 다른 VERSION_CONFLICT 던지는 곳과 동일한 계약으로 맞춘다.
            throw new ConflictException({
              code: 'VERSION_CONFLICT',
              message: '라인업이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
              details: { expectedVersion: dto.expectedVersion, currentVersion: previous?.revision ?? 0 },
            });
          }

          const entries = await this.resolveEntries(tx, context, dto);
          const lineup = await tx.v1GameLineup.create({
            data: {
              gameId: context.gameId,
              sideId: context.ownSideId,
              revision: (previous?.revision ?? 0) + 1,
              supersedesId: previous?.id,
            },
          });
          await tx.v1GameParticipant.createMany({
            data: entries.map((entry) => ({
              gameId: context.gameId,
              sideId: context.ownSideId,
              lineupId: lineup.id,
              displayNameSnapshot: entry.displayNameSnapshot,
              jerseyNumber: entry.jerseyNumber ?? null,
              position: entry.position,
            })),
          });
          return {
            teamMatchId,
            gameId: context.gameId,
            sideId: context.ownSideId,
            lineupId: lineup.id,
            revision: lineup.revision,
            state: lineup.state,
            version: lineup.revision,
          };
        },
      );
    });
  }

  async submitLineup(
    user: V1AuthUser,
    teamMatchId: string,
    headerIdempotencyKey: string | undefined,
    dto: SubmitTeamMatchLineupDto,
  ) {
    return this.serializable(async (tx) => {
      const context = await this.loadContext(tx, teamMatchId, user.id);
      return this.withIdempotency(
        tx,
        {
          actorUserId: user.id,
          action: 'submit',
          resourceId: teamMatchId,
          idempotencyKey: headerIdempotencyKey,
          payload: dto,
        },
        async () => {
          if (Date.now() >= context.startAt.getTime()) {
            throw new ConflictException({
              code: 'LINEUP_DEADLINE_PASSED',
              message: '경기 시작 이후에는 라인업을 제출할 수 없어요.',
            });
          }
          const lineup = await this.lazyLock(
            tx,
            await this.latestLineup(tx, context.gameId, context.ownSideId),
            context.startAt,
          );
          if (lineup === null) {
            throw new NotFoundException({
              code: 'LINEUP_DRAFT_NOT_FOUND',
              message: '제출할 라인업 초안이 없어요. 먼저 라인업을 작성해 주세요.',
            });
          }
          if (lineup.state !== V1GameLineupState.DRAFT) {
            throw new ConflictException({
              code: 'LINEUP_ALREADY_SUBMITTED',
              message: '이미 제출된 라인업이에요.',
            });
          }
          if (lineup.revision !== dto.expectedVersion) {
            throw new ConflictException({
              code: 'VERSION_CONFLICT',
              message: '라인업이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
              details: { expectedVersion: dto.expectedVersion, currentVersion: lineup.revision },
            });
          }
          const submitted = await tx.v1GameLineup.update({
            where: { id: lineup.id },
            data: {
              state: V1GameLineupState.SUBMITTED,
              submittedAt: new Date(),
              version: { increment: 1 },
            },
          });
          const publicLineupAt = await this.ensureDefaultPublicLineupTime(
            tx,
            context.gameId,
            context.startAt,
          );
          return {
            teamMatchId,
            gameId: context.gameId,
            sideId: context.ownSideId,
            lineupId: submitted.id,
            revision: submitted.revision,
            state: submitted.state,
            version: submitted.revision,
            publicLineupAt: publicLineupAt?.toISOString() ?? null,
          };
        },
      );
    });
  }

  async requestChange(
    user: V1AuthUser,
    teamMatchId: string,
    headerIdempotencyKey: string | undefined,
    dto: ChangeRequestTeamMatchLineupDto,
  ) {
    return this.serializable(async (tx) => {
      const context = await this.loadContext(tx, teamMatchId, user.id);
      return this.withIdempotency(
        tx,
        {
          actorUserId: user.id,
          action: 'change_request',
          resourceId: teamMatchId,
          idempotencyKey: headerIdempotencyKey,
          payload: dto,
        },
        async () => {
          const target = await this.lazyLock(
            tx,
            await this.latestLineup(tx, context.gameId, context.opponentSideId),
            context.startAt,
          );
          if (target === null || target.state === V1GameLineupState.DRAFT) {
            throw new NotFoundException({
              code: 'LINEUP_SUBMISSION_NOT_FOUND',
              message: '아직 제출된 상대팀 라인업이 없어요.',
            });
          }
          if (target.state === V1GameLineupState.LOCKED) {
            throw new ConflictException({
              code: 'LINEUP_LOCKED',
              message: '경기 시작 이후에는 정정을 요청할 수 없어요.',
            });
          }
          if (target.revision !== dto.expectedVersion) {
            // 호출자는 상대팀 사이드를 조회할 방법이 없어 이 currentVersion이 사실상 유일한
            // expectedVersion 획득 경로다 — 프론트는 첫 시도(버전 0)가 이 409로 실패하면
            // details.currentVersion으로 정확한 값을 알아내 한 번 더 재시도한다.
            throw new ConflictException({
              code: 'VERSION_CONFLICT',
              message: '라인업이 그새 변경됐어요. 새로고침 후 다시 시도해 주세요.',
              details: { expectedVersion: dto.expectedVersion, currentVersion: target.revision },
            });
          }
          const existingParticipants = await tx.v1GameParticipant.findMany({
            where: { lineupId: target.id },
          });
          const reopened = await tx.v1GameLineup.create({
            data: {
              gameId: context.gameId,
              sideId: context.opponentSideId,
              revision: target.revision + 1,
              supersedesId: target.id,
            },
          });
          if (existingParticipants.length > 0) {
            await tx.v1GameParticipant.createMany({
              data: existingParticipants.map((participant) => ({
                gameId: context.gameId,
                sideId: context.opponentSideId,
                lineupId: reopened.id,
                displayNameSnapshot: participant.displayNameSnapshot,
                jerseyNumber: participant.jerseyNumber,
                position: participant.position,
              })),
            });
          }
          await this.operationAuditWriter.create(tx, {
            actor: { type: 'TEAM_MANAGER', id: user.id },
            requestId: `${context.gameId}:${reopened.id}`,
            action: 'LINEUP_CHANGE_REQUESTED',
            targetType: 'GAME',
            targetId: context.gameId,
            occurredAt: new Date(),
            before: null,
            after: {
              supersededLineupId: target.id,
              newDraftLineupId: reopened.id,
              sideId: context.opponentSideId,
              reason: dto.reason,
            },
          });
          return {
            teamMatchId,
            gameId: context.gameId,
            sideId: context.opponentSideId,
            lineupId: reopened.id,
            revision: reopened.revision,
            state: 'change_requested' as const,
            version: reopened.revision,
            reason: dto.reason,
          };
        },
      );
    });
  }

  /**
   * Runs a mutation under SERIALIZABLE isolation, mirroring
   * `GamesService.withCommand` — mutual exclusion for concurrent
   * save/submit/change-request on the same lineup chain comes from Postgres
   * rejecting the losing transaction's commit (40001), not from any
   * `WHERE state = ...` guard on the individual UPDATE statements.
   */
  private async serializable<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException({
          code: 'COMMAND_CONCURRENCY_CONFLICT',
          message: '동시에 처리된 요청이 있어요. 최신 상태를 다시 불러와 주세요.',
        });
      }
      throw error;
    }
  }

  private async withIdempotency<T extends object>(
    tx: Transaction,
    input: {
      actorUserId: string;
      action: string;
      resourceId: string;
      idempotencyKey: string | undefined;
      payload: unknown;
    },
    mutate: () => Promise<T>,
  ): Promise<T & { replayed: boolean }> {
    const key = input.idempotencyKey?.trim();
    if (key === undefined || key.length === 0) {
      throw new UnprocessableEntityException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key 헤더가 필요해요.',
      });
    }
    const payloadHash = canonicalGameCommandPayloadHash(input.payload);
    const existing = await tx.v1IdempotencyRecord.findUnique({
      where: {
        actorUserId_action_resourceType_resourceId_idempotencyKey: {
          actorUserId: input.actorUserId,
          action: input.action,
          resourceType: 'TEAM_MATCH_LINEUP',
          resourceId: input.resourceId,
          idempotencyKey: key,
        },
      },
    });
    if (existing !== null) {
      if (existing.payloadHash !== payloadHash) {
        throw new ConflictException({
          code: 'IDEMPOTENCY_PAYLOAD_CONFLICT',
          message: '같은 Idempotency-Key를 다른 요청 내용으로 재사용할 수 없어요.',
        });
      }
      return { ...(existing.responseBody as T), replayed: true };
    }
    const response = await mutate();
    await tx.v1IdempotencyRecord.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        resourceType: 'TEAM_MATCH_LINEUP',
        resourceId: input.resourceId,
        idempotencyKey: key,
        payloadHash,
        responseStatus: 200,
        responseBody: response as unknown as Prisma.InputJsonValue,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    return { ...response, replayed: false };
  }

  // ─── internals ───────────────────────────────────────────────────────────

  private async loadContext(
    tx: Transaction,
    teamMatchId: string,
    userId: string,
  ): Promise<TeamMatchLineupContext> {
    const teamMatch = await tx.v1TeamMatch.findUnique({
      where: { id: teamMatchId },
      select: {
        id: true,
        hostTeamId: true,
        approvedApplicantTeamId: true,
        startAt: true,
      },
    });
    if (teamMatch === null) {
      throw new NotFoundException({
        code: 'TEAM_MATCH_NOT_FOUND',
        message: '팀 매칭을 찾을 수 없어요.',
      });
    }
    const game = await tx.v1Game.findUnique({
      where: { teamMatchId },
      select: { id: true, competitionConfigVersionId: true },
    });
    if (game === null) {
      throw new ConflictException({
        code: 'TEAM_MATCH_GAME_REQUIRED',
        message: '경기 정보가 아직 준비되지 않았어요.',
      });
    }
    const sides = await tx.v1GameSide.findMany({ where: { gameId: game.id } });
    const hostSide = sides.find((side) => side.sideKey === 'HOME');
    const awaySide = sides.find((side) => side.sideKey === 'AWAY');
    if (hostSide === undefined || awaySide === undefined) {
      throw new ConflictException({
        code: 'TEAM_MATCH_GAME_REQUIRED',
        message: '경기 진영 정보가 아직 준비되지 않았어요.',
      });
    }
    const teamIds = [teamMatch.hostTeamId, teamMatch.approvedApplicantTeamId].filter(
      (id): id is string => id !== null,
    );
    const membership = await tx.v1TeamMembership.findFirst({
      where: { teamId: { in: teamIds }, userId, status: 'active', role: { in: ['owner', 'manager'] } },
    });
    if (membership === null) {
      throw new ForbiddenException({
        code: 'PERMISSION_DENIED',
        message: '팀장 또는 매니저만 라인업을 관리할 수 있어요.',
      });
    }
    const role = membership.role === 'owner' ? ('team_owner' as const) : ('team_manager' as const);
    if (membership.teamId === teamMatch.hostTeamId) {
      return {
        gameId: game.id,
        gameCompetitionConfigVersionId: game.competitionConfigVersionId,
        teamMatchId,
        startAt: teamMatch.startAt,
        ownSideId: hostSide.id,
        ownTeamId: teamMatch.hostTeamId,
        opponentSideId: awaySide.id,
        opponentTeamId: teamMatch.approvedApplicantTeamId,
        role,
      };
    }
    return {
      gameId: game.id,
      gameCompetitionConfigVersionId: game.competitionConfigVersionId,
      teamMatchId,
      startAt: teamMatch.startAt,
      ownSideId: awaySide.id,
      ownTeamId: membership.teamId,
      opponentSideId: hostSide.id,
      opponentTeamId: teamMatch.hostTeamId,
      role,
    };
  }

  private async latestLineup(tx: Transaction, gameId: string, sideId: string) {
    return tx.v1GameLineup.findFirst({
      where: { gameId, sideId },
      orderBy: { revision: 'desc' },
    });
  }

  /** Deadline is the match's own `startAt`: once reached, a still-SUBMITTED
   * lineup is lazily flipped to LOCKED (no cron/worker required — the first
   * request to observe the passed deadline performs the transition).
   *
   * Not generic: every call site passes the full `V1GameLineup` row (or
   * `null`) straight from `latestLineup()`/`findFirst`, and the update below
   * always returns that same concrete Prisma row shape, so there is no `T`
   * to preserve — declaring one only forced an unsound `as T` cast to make
   * the locked-row result satisfy an unrelated generic parameter. */
  private async lazyLock(
    tx: Transaction,
    lineup: V1GameLineup | null,
    startAt: Date,
  ): Promise<V1GameLineup | null> {
    if (lineup === null || lineup.state !== V1GameLineupState.SUBMITTED) {
      return lineup;
    }
    if (Date.now() < startAt.getTime()) {
      return lineup;
    }
    return tx.v1GameLineup.update({
      where: { id: lineup.id },
      data: { state: V1GameLineupState.LOCKED, version: { increment: 1 } },
    });
  }

  private async ensureDefaultPublicLineupTime(tx: Transaction, gameId: string, startAt: Date) {
    const defaultLineupAt = new Date(startAt.getTime() - 60 * 60 * 1000);
    const policy = await tx.v1GameVisibilityPolicy.findUnique({ where: { gameId } });
    if (policy === null) {
      return null;
    }
    if (policy.lineupAt !== null) {
      return policy.lineupAt;
    }
    const updated = await tx.v1GameVisibilityPolicy.updateMany({
      where: { gameId, lineupAt: null },
      data: { lineupAt: defaultLineupAt, version: { increment: 1 } },
    });
    return updated.count > 0 ? defaultLineupAt : (await tx.v1GameVisibilityPolicy.findUnique({ where: { gameId } }))?.lineupAt ?? null;
  }

  private async resolveEntries(
    tx: Transaction,
    context: TeamMatchLineupContext,
    dto: SaveTeamMatchLineupDto,
  ) {
    const config = await tx.v1CompetitionConfigVersion.findUnique({
      where: { id: context.gameCompetitionConfigVersionId },
      select: { lineup: true },
    });
    const lineupConfig = this.parseLineupConfig(config?.lineup ?? null);

    if (dto.starters.length < lineupConfig.minPlayers || dto.starters.length > lineupConfig.maxPlayers) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_SIZE_INVALID',
        message: `선발 인원은 ${lineupConfig.minPlayers}명 이상 ${lineupConfig.maxPlayers}명 이하여야 해요.`,
      });
    }
    if (
      lineupConfig.substitutions === 'limited' &&
      lineupConfig.maxSubstitutions !== null &&
      dto.bench.length > lineupConfig.maxSubstitutions
    ) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_SIZE_INVALID',
        message: `후보는 최대 ${lineupConfig.maxSubstitutions}명까지 등록할 수 있어요.`,
      });
    }

    const goalkeeperCount = dto.starters.filter((entry) => entry.goalkeeper === true).length;
    if (goalkeeperCount !== 1) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_GOALKEEPER_INVALID',
        message: '선발 라인업에는 골키퍼가 정확히 한 명 있어야 해요.',
      });
    }
    if (dto.bench.some((entry) => entry.goalkeeper === true)) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_GOALKEEPER_INVALID',
        message: '후보 선수는 골키퍼로 지정할 수 없어요.',
      });
    }

    const jerseyNumbers = [...dto.starters, ...dto.bench]
      .map((entry) => entry.jerseyNumber)
      .filter((jerseyNumber): jerseyNumber is number => jerseyNumber !== undefined);
    if (new Set(jerseyNumbers).size !== jerseyNumbers.length) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_DUPLICATE_JERSEY_NUMBER',
        message: '등번호가 중복돼요. 등번호는 팀 내에서 유일해야 해요.',
      });
    }

    // 같은 연동 사용자를 선발+후보를 통틀어 두 번 이상 등록할 수 없다. 이 방어가 없으면
    // 클라이언트가 재수화(hydrate) 시점의 정체성 유실 버그(Task 15 blocker-1) 때문에, 또는
    // 어떤 클라이언트든 버그·경합으로 같은 userId를 두 번 실어 보내는 순간 한 사람에 대해
    // 두 개의 V1GameParticipant 행이 생겨버린다 — 서버가 최종 방어선이다.
    const userIds = [...dto.starters, ...dto.bench]
      .map((entry) => entry.userId)
      .filter((userId): userId is string => userId !== undefined);
    if (new Set(userIds).size !== userIds.length) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_DUPLICATE_PARTICIPANT',
        message: '같은 선수가 라인업에 두 번 등록되어 있어요.',
      });
    }

    const starterEntries = await Promise.all(
      dto.starters.map((entry) =>
        this.resolveEntry(tx, context, entry, entry.goalkeeper === true ? GOALKEEPER_MARKER : (entry.position ?? null)),
      ),
    );
    const benchEntries = await Promise.all(
      dto.bench.map((entry) => this.resolveEntry(tx, context, entry, BENCH_MARKER)),
    );
    return [...starterEntries, ...benchEntries];
  }

  private async resolveEntry(
    tx: Transaction,
    context: TeamMatchLineupContext,
    entry: TeamMatchLineupParticipantDto,
    position: string | null,
  ): Promise<{ displayNameSnapshot: string; jerseyNumber?: number; position: string | null }> {
    if (entry.userId === undefined) {
      const displayName = entry.displayName?.trim();
      if (displayName === undefined || displayName.length === 0) {
        throw new UnprocessableEntityException({
          code: 'LINEUP_PARTICIPANT_INVALID',
          message: '연결된 선수의 userId 또는 게스트 이름 중 하나는 반드시 입력해야 해요.',
        });
      }
      return { displayNameSnapshot: displayName, jerseyNumber: entry.jerseyNumber, position };
    }
    const membership = await tx.v1TeamMembership.findFirst({
      where: { teamId: context.ownTeamId, userId: entry.userId, status: 'active' },
      select: {
        userId: true,
        user: { select: { profile: { select: { nickname: true, displayName: true } } } },
      },
    });
    if (membership === null) {
      throw new UnprocessableEntityException({
        code: 'LINEUP_PARTICIPANT_INELIGIBLE',
        message: '현재 팀 소속이 아닌 사용자는 라인업에 등록할 수 없어요.',
      });
    }
    const schedule = await tx.v1TeamSchedule.findFirst({
      where: { teamMatchId: context.teamMatchId, teamId: context.ownTeamId },
      select: { id: true },
    });
    if (schedule !== null) {
      const attendance = await tx.v1ScheduleAttendance.findUnique({
        where: { scheduleId_userId: { scheduleId: schedule.id, userId: entry.userId } },
        select: { status: true },
      });
      if (attendance === undefined || attendance === null || attendance.status !== 'GOING') {
        throw new UnprocessableEntityException({
          code: 'LINEUP_PARTICIPANT_INELIGIBLE',
          message: '참석으로 응답한 팀원만 라인업에 등록할 수 있어요.',
        });
      }
    }
    const displayNameSnapshot =
      entry.displayName?.trim() ||
      membership.user.profile?.nickname ||
      membership.user.profile?.displayName ||
      '팀원';
    return { displayNameSnapshot, jerseyNumber: entry.jerseyNumber, position };
  }

  private parseLineupConfig(value: Prisma.JsonValue | null): {
    minPlayers: number;
    maxPlayers: number;
    substitutions: 'limited' | 'rolling';
    maxSubstitutions: number | null;
  } {
    const record =
      value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const minPlayers = typeof record.minPlayers === 'number' ? record.minPlayers : 1;
    const maxPlayers = typeof record.maxPlayers === 'number' ? record.maxPlayers : 11;
    const substitutions = record.substitutions === 'rolling' ? 'rolling' : 'limited';
    const maxSubstitutions =
      typeof record.maxSubstitutions === 'number' ? record.maxSubstitutions : null;
    return { minPlayers, maxPlayers, substitutions, maxSubstitutions };
  }

  private async serializeLineup(
    tx: Transaction,
    context: TeamMatchLineupContext,
    lineup: { id: string; revision: number; state: V1GameLineupState; version: number } | null,
    publicLineupAt: Date | null,
  ) {
    const participants =
      lineup === null
        ? []
        : await tx.v1GameParticipant.findMany({
            where: { lineupId: lineup.id },
            orderBy: { createdAt: 'asc' },
          });
    const starters = participants
      .filter((participant) => participant.position !== BENCH_MARKER)
      .map((participant) => ({
        // Task 17: the result-entry form needs the real `V1GameParticipant.id`
        // to attribute a goal/card to a specific roster entry — this route was
        // the only existing lineup read and previously erased the id.
        id: participant.id,
        displayName: participant.displayNameSnapshot,
        jerseyNumber: participant.jerseyNumber,
        position: participant.position === GOALKEEPER_MARKER ? null : participant.position,
        goalkeeper: participant.position === GOALKEEPER_MARKER,
      }));
    const bench = participants
      .filter((participant) => participant.position === BENCH_MARKER)
      .map((participant) => ({
        id: participant.id,
        displayName: participant.displayNameSnapshot,
        jerseyNumber: participant.jerseyNumber,
      }));
    return {
      teamMatchId: context.teamMatchId,
      gameId: context.gameId,
      sideId: context.ownSideId,
      role: context.role,
      lineupId: lineup?.id ?? null,
      revision: lineup?.revision ?? 0,
      state: lineup?.state ?? V1GameLineupState.DRAFT,
      version: lineup?.revision ?? 0,
      publicLineupAt: publicLineupAt?.toISOString() ?? null,
      starters,
      bench,
    };
  }
}
