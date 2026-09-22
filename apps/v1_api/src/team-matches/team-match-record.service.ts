import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { completeTeamMatchAtResultBoundary } from '../games/team-match-result-boundary';
import { canonicalGameCommandPayloadHash } from '../games/games.service';
import { effectivePublicVisibilityMode } from '../games/public-records/public-visibility';
import { isPublicLiveEnabled } from '../games/public-records/public-live-flag';
import { MutateTeamMatchRecordDto } from './dto/team-match-record.dto';

type Tx = Prisma.TransactionClient;
export type SharedSubMatch = { id: string; title: string; order: number };
export type SharedGoal = { id: string; sideId: string; participantId: string | null; ownGoal: boolean; minute: number | null; subMatchId: string | null };
type Confirmation = { sideId: string; userId: string; name: string; at: string };
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const conflict = (code: string, message: string) => new ConflictException({ code, message });
const include = {
  teamMatch: { select: { id: true, title: true, status: true, startAt: true, deletedAt: true, hostTeamId: true, approvedApplicantTeamId: true, leagueId: true, tournamentId: true } },
  sides: true,
  lineups: { orderBy: { revision: 'desc' as const } },
  participants: true,
  sharedRecord: true,
  visibilityPolicy: true,
  events: { take: 1, select: { id: true } },
  resultRevisions: { orderBy: { revision: 'desc' as const }, take: 1 },
} satisfies Prisma.V1GameInclude;
type Loaded = Prisma.V1GameGetPayload<{ include: typeof include }>;

@Injectable()
export class TeamMatchRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async read(user: V1AuthUser | null, teamMatchId: string) {
    return this.prisma.$transaction(async (tx) => this.view(tx, await this.load(tx, teamMatchId), user), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }

  private async load(tx: Tx, teamMatchId: string): Promise<Loaded> {
    const game = await tx.v1Game.findUnique({ where: { teamMatchId }, include });
    if (!game?.teamMatch || game.teamMatch.deletedAt) throw new NotFoundException({ code: 'TEAM_MATCH_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    return game;
  }

  private roster(game: Loaded) {
    const latest = new Map<string, string>();
    for (const lineup of game.lineups) {
      if (!latest.has(lineup.sideId)) latest.set(lineup.sideId, lineup.invalidatedAt || lineup.state === 'DRAFT' ? '' : lineup.id);
    }
    return game.participants.filter((p) => latest.get(p.sideId) === p.lineupId && game.sides.some((s) => s.id === p.sideId));
  }

  private subMatches(game: Loaded): SharedSubMatch[] {
    const stored = (game.sharedRecord?.subMatches ?? []) as unknown;
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((row): row is SharedSubMatch => !!row && typeof row === 'object' && typeof (row as SharedSubMatch).id === 'string')
      .map((row, index) => ({
        id: row.id,
        title: typeof row.title === 'string' && row.title.trim() ? row.title.trim() : `${index + 1}경기`,
        order: Number.isInteger(row.order) ? row.order : index,
      }))
      .sort((a, b) => a.order - b.order);
  }

  private goals(game: Loaded): SharedGoal[] {
    const stored = (game.sharedRecord?.goals ?? []) as unknown;
    if (!Array.isArray(stored)) return [];
    return stored.map((goal) => ({ ...(goal as Omit<SharedGoal, 'subMatchId'>), subMatchId: (goal as Partial<SharedGoal>).subMatchId ?? null }));
  }

  private async actor(tx: Tx, game: Loaded, user: V1AuthUser | null) {
    if (!user || user.accountStatus !== 'active') return null;
    const roster = this.roster(game);
    const links = await tx.v1ParticipantIdentityLinkCurrent.findMany({
      where: { userId: user.id, participantId: { in: roster.filter((p) => !p.userId).map((p) => p.id) } },
      select: { participantId: true },
    });
    const entries = roster.filter((p) => p.userId === user.id || (!p.userId && links.some((link) => link.participantId === p.id)));
    return entries.length === 1 ? entries[0] : null;
  }

  private phase(game: Loaded) {
    const match = game.teamMatch!;
    if (match.leagueId || match.tournamentId) return 'managed' as const;
    if (match.status === 'cancelled' || game.state === 'CANCELLED') return 'cancelled' as const;
    if (game.sharedRecord?.officialAt && game.resultRevisions[0]?.revision === 1 && game.resultRevisions[0]?.state === 'OFFICIAL') return 'official' as const;
    if ((!game.sharedRecord && game.events.length) || game.resultRevisions.length || match.status === 'completed' || game.state === 'ENDED') return 'legacy' as const;
    if (match.status !== 'matched' || !match.approvedApplicantTeamId || !match.hostTeamId || !match.startAt || match.startAt.getTime() > Date.now()) return 'scheduled' as const;
    return 'live' as const;
  }

  private async view(tx: Tx, game: Loaded, user: V1AuthUser | null) {
    const actor = await this.actor(tx, game, user);
    const phase = this.phase(game);
    const record = game.sharedRecord;
    const goals = this.goals(game);
    const subMatches = this.subMatches(game);
    const privateView = !!actor && phase !== 'managed';
    const visibility = privateView ? 'live' : effectivePublicVisibilityMode(game.visibilityPolicy?.mode ?? 'STATUS_ONLY', await isPublicLiveEnabled(tx));
    if (visibility === 'hidden') throw new NotFoundException({ code: 'TEAM_MATCH_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
    const showScore = privateView || visibility === 'live' || (visibility === 'official_only' && phase === 'official');
    const changes = privateView ? await tx.v1TeamMatchRecordChange.findMany({ where: { gameId: game.id }, orderBy: { version: 'desc' }, take: 100 }) : [];
    return {
      teamMatchId: game.teamMatchId, title: game.teamMatch!.title, startsAt: game.teamMatch!.startAt,
      phase, version: record?.version ?? 0, serverTime: new Date().toISOString(),
      canEdit: !!actor && phase === 'live', participant: !!actor, ownSideId: actor?.sideId ?? null,
      sides: game.sides.map((s) => ({ id: s.id, key: s.sideKey, name: s.displayNameSnapshot, score: showScore ? goals.filter((g) => g.sideId === s.id).length : null })),
      subMatches: subMatches.map((subMatch) => ({ ...subMatch, scores: game.sides.map((side) => ({ sideId: side.id, score: showScore ? goals.filter((goal) => goal.subMatchId === subMatch.id && goal.sideId === side.id).length : null })) })),
      participants: privateView ? this.roster(game).map((p) => ({ id: p.id, sideId: p.sideId, name: p.displayNameSnapshot, jerseyNumber: p.jerseyNumber })) : [],
      goals: privateView ? goals : [],
      confirmations: privateView ? ((record?.confirmations ?? []) as Confirmation[]).map((c) => ({ sideId: c.sideId, name: c.name, at: c.at })) : [],
      history: changes.map((c) => ({ id: c.id, version: c.version, action: c.action, actorName: c.actorName, goalId: c.goalId, subMatchId: c.subMatchId, before: c.before, after: c.after, at: c.createdAt })),
      officialAt: record?.officialAt ?? null,
    };
  }

  async mutate(user: V1AuthUser, teamMatchId: string, dto: MutateTeamMatchRecordDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${teamMatchId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE id = ${teamMatchId} FOR UPDATE`;
      const game = await this.load(tx, teamMatchId);
      const actor = await this.actor(tx, game, user);
      if (!actor || user.accountStatus !== 'active') throw new ForbiddenException({ code: 'RECORD_PARTICIPANT_REQUIRED', message: '양 팀의 제출된 라인업 참가자만 기록할 수 있어요.' });
      const payloadHash = canonicalGameCommandPayloadHash(dto);
      const replay = await tx.v1TeamMatchRecordChange.findUnique({ where: { gameId_commandId: { gameId: game.id, commandId: dto.commandId } } });
      if (replay) {
        if (replay.actorUserId !== user.id || replay.payloadHash !== payloadHash) throw conflict('COMMAND_REUSED', '다른 요청에 사용된 요청 번호예요. 새로고침해 주세요.');
        return this.view(tx, game, user);
      }
      if (this.phase(game) !== 'live') throw conflict('RECORD_NOT_EDITABLE', '경기 시작 후에만 기록할 수 있으며, 확정된 결과는 수정할 수 없어요.');
      const record = game.sharedRecord;
      if ((record?.version ?? 0) !== dto.expectedVersion) throw conflict('VERSION_CONFLICT', '다른 참가자가 기록을 바꿨어요. 최신 내용을 확인하고 다시 시도해 주세요.');

      let goals = this.goals(game);
      let subMatches = this.subMatches(game);
      let confirmations = [...((record?.confirmations ?? []) as Confirmation[])];
      let before: SharedGoal | SharedSubMatch | null = null;
      let after: SharedGoal | SharedSubMatch | null = null;
      let goalId: string | null = dto.goalId ?? null;
      let subMatchId: string | null = dto.subMatchId ?? null;

      if (dto.action === 'confirm') {
        if (confirmations.some((c) => c.sideId === actor.sideId)) throw conflict('ALREADY_CONFIRMED', '우리 팀은 이미 종료를 확인했어요.');
        confirmations.push({ sideId: actor.sideId, userId: user.id, name: actor.displayNameSnapshot, at: new Date().toISOString() });
      } else if (dto.action === 'reopen') {
        confirmations = [];
      } else {
        confirmations = [];
        if (dto.action === 'submatch_add') {
          if (subMatches.length >= 20) throw conflict('SUBMATCH_LIMIT', '서브매치는 20개까지 만들 수 있어요.');
          const title = dto.title?.trim();
          if (!title) throw new UnprocessableEntityException({ code: 'SUBMATCH_INVALID', message: '서브매치 이름을 입력해 주세요.' });
          const created = { id: randomUUID(), title, order: subMatches.length };
          subMatches = [...subMatches, created];
          if (subMatches.length === 1) goals = goals.map((goal) => ({ ...goal, subMatchId: created.id }));
          subMatchId = created.id;
          after = created;
        } else if (dto.action === 'submatch_edit') {
          const index = subMatches.findIndex((row) => row.id === subMatchId);
          const title = dto.title?.trim();
          if (index < 0) throw conflict('SUBMATCH_NOT_FOUND', '서브매치를 찾을 수 없어요.');
          if (!title) throw new UnprocessableEntityException({ code: 'SUBMATCH_INVALID', message: '서브매치 이름을 입력해 주세요.' });
          before = subMatches[index];
          after = { ...subMatches[index], title };
          subMatches = subMatches.map((row) => row.id === subMatchId ? after as SharedSubMatch : row);
        } else if (dto.action === 'submatch_delete') {
          const target = subMatches.find((row) => row.id === subMatchId);
          if (!target) throw conflict('SUBMATCH_NOT_FOUND', '서브매치를 찾을 수 없어요.');
          if (goals.some((goal) => goal.subMatchId === target.id)) throw conflict('SUBMATCH_HAS_GOALS', '득점이 있는 서브매치는 비울 때까지 삭제할 수 없어요.');
          before = target;
          subMatches = subMatches.filter((row) => row.id !== target.id).map((row, order) => ({ ...row, order }));
        } else if (dto.action === 'undo') {
          const change = dto.changeId ? await tx.v1TeamMatchRecordChange.findFirst({ where: { id: dto.changeId, gameId: game.id } }) : null;
          if (!change?.goalId) throw conflict('CHANGE_NOT_REVERSIBLE', '되돌릴 득점 변경을 찾을 수 없어요.');
          goalId = change.goalId;
          before = goals.find((g) => g.id === goalId) ?? null;
          if (JSON.stringify(before) !== JSON.stringify(change.after)) throw conflict('VERSION_CONFLICT', '이 득점은 이후에 변경됐어요. 최신 기록에서 직접 수정해 주세요.');
          after = change.before as SharedGoal | null;
          if (after) this.validateGoal(game, after, subMatches);
          goals = goals.filter((g) => g.id !== goalId);
          if (after) goals.push(after);
        } else {
          const previous = goals.find((g) => g.id === goalId) ?? null;
          before = previous;
          if (dto.action !== 'add' && !previous) throw conflict('GOAL_NOT_FOUND', '이미 삭제되었거나 존재하지 않는 득점이에요.');
          if (dto.action !== 'delete') {
            const nextSubMatchId = dto.subMatchId === undefined ? previous?.subMatchId ?? null : dto.subMatchId;
            after = { id: previous?.id ?? randomUUID(), sideId: dto.sideId ?? '', participantId: dto.participantId ?? null, ownGoal: dto.ownGoal ?? false, minute: dto.minute ?? null, subMatchId: nextSubMatchId };
            goalId = after.id;
            subMatchId = nextSubMatchId;
            this.validateGoal(game, after, subMatches);
          }
          goals = goals.filter((g) => g.id !== goalId);
          if (after) goals.push(after as SharedGoal);
          if (goals.length > 500) throw conflict('RECORD_LIMIT', '득점 기록은 500개까지 등록할 수 있어요.');
        }
      }

      const official = confirmations.length === 2 && new Set(confirmations.map((c) => c.sideId)).size === 2;
      const version = (record?.version ?? 0) + 1;
      await tx.v1TeamMatchRecord.upsert({
        where: { gameId: game.id },
        create: { gameId: game.id, version, goals: json(goals), subMatches: json(subMatches), confirmations: json(confirmations), officialAt: official ? new Date() : null },
        update: { version, goals: json(goals), subMatches: json(subMatches), confirmations: json(confirmations), officialAt: official ? new Date() : null },
      });
      await tx.v1TeamMatchRecordChange.create({ data: {
        gameId: game.id, version, commandId: dto.commandId, payloadHash, actorUserId: user.id, actorName: actor.displayNameSnapshot,
        action: dto.action, goalId, subMatchId, before: before ? json(before) : Prisma.JsonNull, after: after ? json(after) : Prisma.JsonNull,
      } });
      if (official) await this.officialize(tx, game, goals, subMatches, confirmations, user.id);
      else await tx.v1Game.update({ where: { id: game.id }, data: { state: 'LIVE', version: { increment: 1 } } });
      return this.view(tx, await this.load(tx, teamMatchId), user);
    });
  }

  private validateGoal(game: Loaded, goal: SharedGoal, subMatches: SharedSubMatch[]) {
    const side = game.sides.find((s) => s.id === goal.sideId);
    const participant = this.roster(game).find((p) => p.id === goal.participantId);
    const subMatchValid = subMatches.length === 0 ? goal.subMatchId === null : subMatches.some((row) => row.id === goal.subMatchId);
    if (!side || !subMatchValid || (goal.participantId && (!participant || (goal.ownGoal ? participant.sideId === side.id : participant.sideId !== side.id)))) {
      throw new UnprocessableEntityException({ code: 'PARTICIPANT_INVALID', message: '서브매치, 득점 팀과 라인업 선수를 다시 확인해 주세요.' });
    }
  }

  private async officialize(tx: Tx, game: Loaded, goals: SharedGoal[], subMatches: SharedSubMatch[], confirmations: Confirmation[], userId: string) {
    for (const goal of goals) this.validateGoal(game, goal, subMatches);
    const home = game.sides.find((s) => s.sideKey === 'HOME');
    const away = game.sides.find((s) => s.sideKey === 'AWAY');
    if (!home || !away) throw conflict('SIDES_REQUIRED', '양 팀 정보가 필요해요.');
    const score = {
      home: goals.filter((g) => g.sideId === home.id).length,
      away: goals.filter((g) => g.sideId === away.id).length,
      ...(subMatches.length === 0 ? {} : { subMatches: subMatches.map((subMatch) => ({ id: subMatch.id, title: subMatch.title, home: goals.filter((goal) => goal.subMatchId === subMatch.id && goal.sideId === home.id).length, away: goals.filter((goal) => goal.subMatchId === subMatch.id && goal.sideId === away.id).length })) }),
    };
    const revision = await tx.v1GameResultRevision.create({ data: {
      gameId: game.id, revision: 1, state: 'DRAFT', score,
      goalEvents: json(goals.map((g) => ({ ...g, period: null, playerNameSnapshot: this.roster(game).find((p) => p.id === g.participantId)?.displayNameSnapshot ?? null }))),
      eventsHash: createHash('sha256').update(JSON.stringify({ subMatches, goals })).digest('hex'), missingScorer: goals.some((g) => !g.participantId),
      createdByActorType: 'USER', createdByUserId: userId, submittedAt: new Date(), officialAt: new Date(), reason: '양 팀 참가자 공동 기록 확인',
    } });
    await tx.v1GameResultParticipant.createMany({ data: this.roster(game).map((p) => ({ resultRevisionId: revision.id, participantId: p.id, sideId: p.sideId, started: p.started, goals: goals.filter((g) => g.participantId === p.id && !g.ownGoal).length, cards: [], goalkeeper: p.position === 'GK' })) });
    await tx.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'SUBMITTED' } });
    await tx.v1GameResultRevision.update({ where: { id: revision.id }, data: { state: 'OFFICIAL' } });
    await tx.v1GameResultDecision.createMany({ data: confirmations.map((c) => ({ revisionId: revision.id, decision: 'approve', actorType: 'USER', actorUserId: c.userId, reason: '공동 경기 기록 종료 확인' })) });
    await tx.v1Game.update({ where: { id: game.id }, data: { state: 'ENDED', currentOfficialRevisionId: revision.id, version: { increment: 1 } } });
    await tx.v1GamePeriod.updateMany({ where: { gameId: game.id, state: { in: ['LIVE', 'HALFTIME'] } }, data: { state: 'ENDED', endedAt: new Date() } });
    await completeTeamMatchAtResultBoundary(tx, game.teamMatchId!, userId, 'shared_record_confirmed');
    await tx.v1OutboxEvent.create({ data: { businessKey: `game:${game.id}:revision:1:official`, aggregateType: 'GAME', aggregateId: game.id, revisionId: revision.id, type: 'GAME_RESULT_OFFICIAL', payload: { revisionId: revision.id } } });
  }
}
