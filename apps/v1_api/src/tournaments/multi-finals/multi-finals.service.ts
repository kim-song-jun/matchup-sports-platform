import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { AdminContextService } from '../../common/admin-context.service';
import { GamesService } from '../../games/games.service';
import { PrismaService } from '../../prisma/prisma.service';
import { lockCompetitionForBracketMutationInTx } from '../slots/competition-bracket-lock';
import { loadGroupRankSources } from '../slots/load-group-rank-preview';
import { resolveGroupRank } from '../slots/group-rank-preview';
import { assignSlotsBatchInTx } from '../slots/tournament-slot.service';
import { BracketTemplateService } from '../templates/bracket-template.service';
import { deleteTournamentGroupInTx, softDeleteTournamentFixtureInTx } from '../tournament-bracket-tx';
import { orderFixturesForTeardown } from '../templates/bracket-teardown-order';
import { TOURNAMENT_VENUE_SELECT } from '../../places/tournament-venue';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { MultiFinalGenerateDto, MultiFinalSelectionDto, MultiFinalSetupDto, NamedFinalDto } from './multi-finals.dto';
import { invalidMultiFinal, planNamedFinals, planPreliminaryGroups, sameNamedFinalStructure, validateNamedFinals } from './multi-finals-plan';

type Tx = Prisma.TransactionClient;
type Config = { groups: Array<{ id: string; name: string; capacity: number; legs: 1 | 2 }>; finals: NamedFinalDto[] };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stale = () => new ConflictException({ code: 'MULTI_FINAL_STALE', message: '설정이나 경기 상태가 바뀌었어요. 다시 불러와 주세요.' });
const options = { timeout: 45_000, maxWait: 5_000 };

@Injectable()
export class MultiFinalsService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService,
    private readonly games: GamesService, private readonly templates: BracketTemplateService) {}

  private async tournament(tx: Tx, id: string) {
    const row = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, { where: { id, deletedAt: null }, select: {
      id: true, kind: true, format: true, status: true, sportId: true, regionId: true, title: true, competitionConfigVersionId: true,
      multiFinals: true, multiFinalsRevision: true, ...TOURNAMENT_VENUE_SELECT,
    } });
    if (!row) throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    if (row.kind !== 'regular_tournament' || row.format !== 'league_knockouts') invalidMultiFinal('정규리그 + N개 토너먼트 방식의 정규대회에서만 사용할 수 있어요.');
    return row;
  }
  private assertMutable(status: string) {
    if (status === 'completed' || status === 'cancelled' || status === 'archived') throw new ConflictException({ code: 'BRACKET_LOCKED', message: '종료·취소된 대회의 대진 구조는 변경할 수 없어요.' });
  }
  private config(value: Prisma.JsonValue | null): Config | null { return value === null ? null : value as unknown as Config; }
  private async confirmed(tx: Tx, id: string) {
    return tx.v1TournamentRegistration.findMany({ where: { tournamentId: id, status: 'confirmed' },
      select: { id: true, team: { select: { id: true, name: true } } }, orderBy: { id: 'asc' } });
  }
  private assertTeams(finals: readonly NamedFinalDto[], confirmed: ReadonlySet<string>) {
    for (const f of finals) for (const id of f.registrationIds ?? []) if (!confirmed.has(id)) invalidMultiFinal('이 대회의 확정 참가팀만 선택할 수 있어요.');
  }
  private async assertUnstarted(tx: Tx, id: string) {
    const fixtures = await tx.v1TournamentMatchDetails.findMany({ where: { tournamentId: id, group: { phase: { not: 'group' } }, teamMatch: { deletedAt: null } }, orderBy: { teamMatchId: 'asc' },
      select: { teamMatchId: true, updatedAt: true, teamMatch: { select: { updatedAt: true, status: true, game: { select: { version: true, state: true, currentOfficialRevisionId: true, _count: { select: { events: true } } } } } } } });
    if (fixtures.some(f => f.teamMatch.status !== 'matched' || !f.teamMatch.game || f.teamMatch.game.state !== 'SCHEDULED' || f.teamMatch.game.currentOfficialRevisionId || f.teamMatch.game._count.events > 0)) {
      throw new ConflictException({ code: 'BRACKET_LOCKED', message: '시작했거나 기록이 있는 결선은 명단과 대진을 변경할 수 없어요.' });
    }
    return fixtures;
  }
  private async clearFinals(tx: Tx, admin: Awaited<ReturnType<AdminContextService['getMutationAdmin']>>, id: string) {
    const fixtures = await this.assertUnstarted(tx, id);
    const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId: id }, select: { sourceTeamMatchId: true, targetTeamMatchId: true } });
    const ids = new Set(fixtures.map(f => f.teamMatchId));
    for (const fixtureId of orderFixturesForTeardown([...ids], edges.filter(e => ids.has(e.sourceTeamMatchId) && ids.has(e.targetTeamMatchId)))) await softDeleteTournamentFixtureInTx(tx, admin, fixtureId);
    const groups = await tx.v1TournamentGroup.findMany({ where: { tournamentId: id, phase: { not: 'group' } }, select: { id: true } });
    const groupIds = groups.map(g => g.id);
    await tx.v1TournamentSlot.deleteMany({ where: { tournamentId: id, groupId: { in: groupIds } } });
    await tx.v1TournamentStanding.deleteMany({ where: { groupId: { in: groupIds } } });
    await tx.v1TournamentGroupTeam.deleteMany({ where: { groupId: { in: groupIds } } });
    await tx.v1TournamentByeSlot.deleteMany({ where: { groupId: { in: groupIds } } });
    for (const group of groups) await deleteTournamentGroupInTx(tx, admin, group.id);
  }
  private async view(tx: Tx, id: string) {
    const tournament = await this.tournament(tx, id); const config = this.config(tournament.multiFinals);
    const registrations = await this.confirmed(tx, id);
    if (!config) return { revision: tournament.multiFinalsRevision, groups: [], finals: [], registrations, generated: false, groupStandings: [] };
    const sources = await loadGroupRankSources(tx, id, config.groups.map(g => g.id));
    const standingRows = await tx.v1TournamentStanding.findMany({
      where: { groupId: { in: config.groups.map(g => g.id) } },
      select: { groupId: true, registrationId: true, position: true, points: true, wins: true, draws: true, losses: true, goalsFor: true, goalsAgainst: true },
      orderBy: [{ position: 'asc' }, { registrationId: 'asc' }],
    });
    const groupStandings = config.groups.map(group => {
      const source = sources.get(group.id)!;
      return { groupId: group.id, name: group.name,
        complete: source.registrationIds.length === group.capacity && resolveGroupRank(source, 1).state !== 'group_incomplete',
        rows: standingRows.filter(row => row.groupId === group.id).map(row => {
          const resolution = row.position === null ? null : resolveGroupRank(source, row.position);
          return { ...row, teamName: source.teamNameById.get(row.registrationId) ?? '',
            tiedRegistrationIds: resolution?.state === 'tied' ? resolution.tiedRegistrationIds : [] };
        }),
      };
    });
    const finals = config.finals.map(final => {
      const candidates: string[] = []; const unresolved: Array<{ groupId: string; rank: number; state: string; tiedRegistrationIds: string[] }> = [];
      for (const rule of final.rules) {
        const source = sources.get(rule.groupId);
        const group = config.groups.find(g => g.id === rule.groupId);
        const result = source && source.registrationIds.length === group?.capacity ? resolveGroupRank(source, rule.rank) : { state: 'group_incomplete' as const };
        if (result.state === 'ready') candidates.push(result.registrationId);
        else unresolved.push({ ...rule, state: result.state, tiedRegistrationIds: result.state === 'tied' ? result.tiedRegistrationIds : [] });
      }
      return { ...final, suggestedRegistrationIds: candidates, unresolved, manual: final.registrationIds !== null && final.registrationIds !== undefined };
    });
    const generated = await tx.v1TournamentGroup.count({ where: { tournamentId: id, phase: { not: 'group' } } }) > 0;
    return { revision: tournament.multiFinalsRevision, groups: config.groups, finals, registrations, generated, groupStandings };
  }
  async get(user: V1AuthUser, id: string) {
    await this.admins.getActiveAdmin(user.id);
    return this.prisma.$transaction(tx => this.view(tx, id), { ...options, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async setup(user: V1AuthUser, id: string, dto: MultiFinalSetupDto) {
    const admin = await this.admins.getMutationAdmin(user.id);
    const plan = planPreliminaryGroups(dto.groups);
    validateNamedFinals(dto.finals, new Map(dto.groups.map((g, i) => [String(i), g.capacity])));
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const tournament = await this.tournament(tx, id); this.assertMutable(tournament.status);
      if (tournament.multiFinalsRevision !== dto.expectedRevision) throw stale();
      if (tournament.multiFinals || await tx.v1TournamentGroup.count({ where: { tournamentId: id } }) || await tx.v1TournamentMatchDetails.count({ where: { tournamentId: id, teamMatch: { deletedAt: null } } })) {
        throw new ConflictException({ code: 'BRACKET_NOT_EMPTY', message: '예선 대진이 이미 있어요. 기존 예선은 유지하고 결선 설정을 편집해 주세요.' });
      }
      if (!tournament.competitionConfigVersionId) throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '대회 경기 규칙을 먼저 저장해 주세요.' });
      const confirmed = new Set((await this.confirmed(tx, id)).map(r => r.id)); this.assertTeams(dto.finals, confirmed);
      for (const group of dto.groups) for (const reg of group.registrationIds ?? []) if (!confirmed.has(reg)) invalidMultiFinal('이 대회의 확정 참가팀만 선택할 수 있어요.');
      const materialized = await this.templates.materialize(tx, admin, { ...tournament, competitionConfigVersionId: tournament.competitionConfigVersionId! }, plan);
      const assignments = dto.groups.flatMap((g, i) => (g.registrationIds ?? []).map((registrationId, j) => ({ slotId: materialized.slotIds.get(`${i}:${j}`)!, registrationId })));
      if (assignments.length) await assignSlotsBatchInTx(tx, { admin, adminContext: this.admins, games: this.games }, assignments);
      const config: Config = { groups: dto.groups.map((g, i) => ({ id: materialized.groupIds.get(String(i))!, name: g.name.trim(), capacity: g.capacity, legs: g.legs })),
        finals: dto.finals.map(f => ({ ...f, name: f.name.trim(), rules: f.rules.map(rule => ({ ...rule, groupId: materialized.groupIds.get(rule.groupId)! })) })) };
      await tx.v1Tournament.update({ where: { id }, data: { multiFinals: JSON.parse(JSON.stringify(config)), multiFinalsRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: 'tournament.multi_finals.setup', targetType: 'tournament', targetId: id, afterJson: JSON.parse(JSON.stringify(config)) }, tx);
      return this.view(tx, id);
    }, options);
  }
  async select(user: V1AuthUser, id: string, dto: MultiFinalSelectionDto) {
    const admin = await this.admins.getMutationAdmin(user.id);
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const tournament = await this.tournament(tx, id); this.assertMutable(tournament.status); const config = this.config(tournament.multiFinals);
      if (!config || dto.expectedRevision !== tournament.multiFinalsRevision) throw stale();
      validateNamedFinals(dto.finals, new Map(config.groups.map(g => [g.id, g.capacity])));
      this.assertTeams(dto.finals, new Set((await this.confirmed(tx, id)).map(r => r.id)));
      // Keep award scopes stable: removing/renaming a final with awards requires explicit re-scoping first.
      const scopes = dto.finals.map(f => f.name.trim());
      const [awards, awardSets] = await Promise.all([
        tx.v1TournamentAward.count({ where: { tournamentId: id, bracketTrack: { notIn: ['overall', ...scopes] } } }),
        tx.v1TournamentAwardSet.count({ where: { tournamentId: id, bracketTrack: { notIn: scopes } } }),
      ]);
      if (awards || awardSets) throw new ConflictException({ code: 'BRACKET_TRACK_AWARDS_REQUIRE_RESCOPING', message: '삭제·이름 변경할 토너먼트의 시상 범위를 먼저 정리해 주세요.' });
      if (sameNamedFinalStructure(config.finals, dto.finals)) await this.assertUnstarted(tx, id);
      else await this.clearFinals(tx, admin, id);
      const next: Config = { ...config, finals: dto.finals.map(f => ({ ...f, name: f.name.trim() })) };
      await tx.v1Tournament.update({ where: { id }, data: { multiFinals: JSON.parse(JSON.stringify(next)), multiFinalsRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: 'tournament.multi_finals.selection', targetType: 'tournament', targetId: id, beforeJson: JSON.parse(JSON.stringify(config)), afterJson: JSON.parse(JSON.stringify(next)) }, tx);
      return this.view(tx, id);
    }, options);
  }
  private async previewInTx(tx: Tx, id: string) {
    const view = await this.view(tx, id);
    const finals: NamedFinalDto[] = view.finals.map(f => {
      // Preserve the entire pending roster: a partial suggestion must never shrink the bracket.
      return { name: f.name, rules: f.rules, thirdPlace: f.thirdPlace,
        registrationIds: f.manual ? f.registrationIds : f.unresolved.length || !view.groupStandings.every(group => group.complete) ? null : f.suggestedRegistrationIds };
    });
    validateNamedFinals(finals, new Map(view.groups.map(g => [g.id, g.capacity])));
    this.assertTeams(finals, new Set(view.registrations.map(r => r.id)));
    if (!finals.length) invalidMultiFinal('예선 편성을 먼저 저장해 주세요.');
    const max = await tx.v1TournamentMatchDetails.aggregate({ where: { tournamentId: id, group: { phase: 'group' }, teamMatch: { deletedAt: null } }, _max: { fixtureNumber: true } });
    const plan = planNamedFinals(finals, max._max.fixtureNumber ?? 0);
    const fixtures = await this.assertUnstarted(tx, id);
    return { finals, plan, revision: view.revision, previewHash: hash({ view, fixtures, finals, plan }), counts: { fixtures: plan.fixtures.length, byes: plan.byeSlots.length, tournaments: finals.length } };
  }
  async preview(user: V1AuthUser, id: string) {
    await this.admins.getMutationAdmin(user.id);
    return this.prisma.$transaction(tx => this.previewInTx(tx, id), { ...options, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async generate(user: V1AuthUser, id: string, dto: MultiFinalGenerateDto) {
    const admin = await this.admins.getMutationAdmin(user.id);
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const prior = await tx.v1AdminActionLog.findFirst({ where: { targetType: 'tournament', targetId: id, action: 'tournament.multi_finals.generate', afterJson: { path: ['requestId'], equals: dto.requestId } }, select: { afterJson: true } });
      if (prior) {
        const saved = prior.afterJson as { previewHash: string; revision: number };
        if (saved.previewHash !== dto.previewHash) throw stale();
        return { revision: saved.revision, replayed: true };
      }
      const preview = await this.previewInTx(tx, id);
      if (preview.previewHash !== dto.previewHash || preview.revision !== dto.expectedRevision) throw stale();
      const tournament = await this.tournament(tx, id); this.assertMutable(tournament.status);
      if (!tournament.competitionConfigVersionId) invalidMultiFinal('경기 규칙이 필요해요.');
      const plan = preview.plan;
      const existing = await tx.v1TournamentSlot.findMany({
        where: { tournamentId: id, kind: 'GROUP_RANK', group: { phase: { not: 'group' } } },
        select: { id: true, position: true, group: { select: { name: true, bracketTrack: true } } },
      });
      const slotIds = new Map<string, string>();
      for (const slot of plan.slots) {
        const group = plan.groups.find(g => g.key === slot.groupKey)!;
        const match = existing.find(row => row.group !== null && row.group.bracketTrack === group.bracketTrack && row.group.name === group.name && row.position === slot.position);
        if (match) slotIds.set(slot.key, match.id);
      }
      const fixtureCount = await tx.v1TournamentMatchDetails.count({ where: { tournamentId: id, group: { phase: { not: 'group' } }, teamMatch: { deletedAt: null } } });
      const groupCount = await tx.v1TournamentGroup.count({ where: { tournamentId: id, phase: { not: 'group' } } });
      // Identical topology keeps fixture IDs, schedules, venues and progression edges intact.
      if (existing.length !== plan.slots.length || slotIds.size !== plan.slots.length || fixtureCount !== plan.fixtures.length || groupCount !== plan.groups.length) {
        await this.clearFinals(tx, admin, id);
        const materialized = await this.templates.materialize(tx, admin, { ...tournament, competitionConfigVersionId: tournament.competitionConfigVersionId! }, plan);
        for (const [key, value] of materialized.slotIds) slotIds.set(key, value);
      }
      await assignSlotsBatchInTx(tx, { admin, adminContext: this.admins, games: this.games }, plan.slots.map(slot => {
        const group = plan.groups.find(g => g.key === slot.groupKey)!;
        const final = preview.finals.find(f => f.name === group.bracketTrack)!;
        return { slotId: slotIds.get(slot.key)!, registrationId: final.registrationIds?.[slot.position - 1] ?? null };
      }));
      const config = this.config(tournament.multiFinals)!;
      // Freeze the approved roster. Result recalculation never reselects or refills these seeds.
      const next = { ...config, finals: preview.finals.map(f => ({ name: f.name, rules: f.rules, thirdPlace: f.thirdPlace, registrationIds: f.registrationIds })) };
      await tx.v1Tournament.update({ where: { id }, data: { multiFinals: JSON.parse(JSON.stringify(next)), multiFinalsRevision: { increment: 1 } } });
      const revision = tournament.multiFinalsRevision + 1;
      await this.admins.logAdminAction(admin, { action: 'tournament.multi_finals.generate', targetType: 'tournament', targetId: id, afterJson: { requestId: dto.requestId, previewHash: dto.previewHash, revision, counts: preview.counts, finals: JSON.parse(JSON.stringify(next.finals)) } }, tx);
      return { revision, counts: preview.counts, replayed: false };
    }, options);
  }
}
