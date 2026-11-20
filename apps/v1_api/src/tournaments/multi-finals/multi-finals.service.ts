import { normalizeFinalColors, reconcileFinalColors } from './multi-finals-colors';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { V1AuthUser } from '../../auth/v1-auth-user';
import { findTournamentManagementAction } from '../../common/tournament-management-history';
import { AdminContextService } from '../../common/admin-context.service';
import { GamesService } from '../../games/games.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { lockCompetitionForBracketMutationInTx } from '../slots/competition-bracket-lock';
import { loadGroupRankSources } from '../slots/load-group-rank-preview';
import { drawnTieGroups, resolveStoredGroupRank } from '../slots/group-rank-preview';
import { assignSlotsBatchInTx } from '../slots/tournament-slot.service';
import { BracketTemplateService } from '../templates/bracket-template.service';
import { deleteTournamentGroupInTx, softDeleteTournamentFixtureInTx } from '../tournament-bracket-tx';
import { orderFixturesForTeardown } from '../templates/bracket-teardown-order';
import { TOURNAMENT_VENUE_SELECT } from '../../places/tournament-venue';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from '../tournament-surface-lookup';
import { MultiFinalAssignmentDto, MultiFinalAssignmentPreviewDto, MultiFinalGenerateDto, MultiFinalResetDto, MultiFinalSelectionDto, MultiFinalSetupDto, NamedFinalDto } from './multi-finals.dto';
import { crossGroupTopThree, supportsCrossGroupTopThree, validCrossGroupBracket, validCrossGroupTopThree, type SeedGroup } from './multi-finals-seeding';
import { invalidMultiFinal, namedFinalSize, orderRulesByRank, planNamedFinals, planPreliminaryGroups, sameNamedFinalStructure, validateNamedFinals } from './multi-finals-plan';
import { rankOrderSeeds, savedStandingsSnapshot, savedTiePicks, standingOrder, standingsOrderChanged } from './multi-finals-standings';
import { crossSeedGroups, validateTiePicks } from './multi-finals-tie-picks';

type Tx = Prisma.TransactionClient;
type Config = { groups: Array<{ id: string; name: string; capacity: number; legs: 1 | 2; registrationIds?: string[] }>; finals: NamedFinalDto[]; nextColorIndex?: number };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stale = () => new ConflictException({ code: 'MULTI_FINAL_STALE', message: '설정이나 경기 상태가 바뀌었어요. 다시 불러와 주세요.' });
const options = { timeout: 45_000, maxWait: 5_000 };

@Injectable()
export class MultiFinalsService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminContextService,
    private readonly games: GamesService, private readonly templates: BracketTemplateService,
    // 선택값이다 — 진출 알림만 쓰고, 없으면(단위 시험) 알림 없이 배정만 한다.
    private readonly notifications?: NotificationsService) {}

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
  private config(value: Prisma.JsonValue | null): Config | null { return value === null ? null : { ...(value as unknown as Config), ...normalizeFinalColors(value as unknown as Config) }; }
  private async confirmed(tx: Tx, id: string) {
    return tx.v1TournamentRegistration.findMany({ where: { tournamentId: id, status: 'confirmed' },
      select: { id: true, team: { select: { id: true, name: true } } }, orderBy: { id: 'asc' } });
  }
  private assertTeams(finals: readonly NamedFinalDto[], confirmed: ReadonlySet<string>) {
    for (const f of finals) for (const id of f.registrationIds ?? []) if (!confirmed.has(id)) invalidMultiFinal('이 대회의 확정 참가팀만 선택할 수 있어요.');
  }
  private async assertUnstarted(tx: Tx, id: string, all = false, track?: string) {
    const fixtures = await tx.v1TournamentMatchDetails.findMany({ where: { tournamentId: id, ...(!all ? { group: { phase: { not: 'group' as const }, ...(track === undefined ? {} : { bracketTrack: track }) } } : {}), teamMatch: { deletedAt: null } }, orderBy: { teamMatchId: 'asc' },
      select: { teamMatchId: true, updatedAt: true, teamMatch: { select: { updatedAt: true, status: true, game: { select: { version: true, state: true, currentOfficialRevisionId: true, _count: { select: { events: true } } } } } } } });
    if (fixtures.some(f => f.teamMatch.status !== 'matched' || !f.teamMatch.game || f.teamMatch.game.state !== 'SCHEDULED' || f.teamMatch.game.currentOfficialRevisionId || f.teamMatch.game._count.events > 0)) {
      throw new ConflictException({ code: 'BRACKET_LOCKED', message: all ? '시작했거나 기록·결과가 있는 경기가 있어 대진을 초기화할 수 없어요.' : '시작했거나 기록이 있는 결선은 명단과 대진을 변경할 수 없어요.' });
    }
    return fixtures;
  }
  private async clearFinals(tx: Tx, admin: Awaited<ReturnType<AdminContextService['getTournamentMutationAdmin']>>, id: string) {
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
  /** What the latest assign audit of this final still says about the saved roster: whether a rank its rules point at now holds a different team (rosters assigned before snapshots existed report false), and the tie picks it was assigned with. */
  private async savedAssignment(tx: Tx, id: string, final: NamedFinalDto, groupStandings: Parameters<typeof standingOrder>[0]) {
    if (!final.registrationIds) return { standingsChanged: false, tiePicks: [] };
    const assigned = await findTournamentManagementAction(tx, { targetType: 'tournament', targetId: id, action: 'tournament.multi_finals.assign', afterJson: { path: ['finalName'], equals: final.name } });
    const saved = savedStandingsSnapshot(assigned?.afterJson, final.registrationIds);
    // Current rules may point at a group the snapshot never stored; reading it now makes that rank count as changed.
    const groupIds = saved === null ? [] : [...new Set([...saved.map(group => group.groupId), ...final.rules.map(rule => rule.groupId)])];
    return { standingsChanged: saved !== null && standingsOrderChanged(saved, standingOrder(groupStandings, groupIds), final.rules),
      tiePicks: savedTiePicks(assigned?.afterJson, final.registrationIds) };
  }
  private async view(tx: Tx, id: string) {
    const tournament = await this.tournament(tx, id); const config = this.config(tournament.multiFinals);
    const registrations = await this.confirmed(tx, id);
    if (!config) return { revision: tournament.multiFinalsRevision, groups: [], finals: [], registrations, generated: false, fixtureCount: 0, preliminaryFixtureCount: 0, groupStandings: [] };
    const fixtureCount = await tx.v1TournamentMatchDetails.count({ where: { tournamentId: id, teamMatch: { deletedAt: null } } });
    const preliminaryFixtureCount = await tx.v1TournamentMatchDetails.count({ where: { tournamentId: id, group: { phase: 'group' }, teamMatch: { deletedAt: null } } });
    const assignments = await tx.v1TournamentGroupTeam.findMany({ where: { groupId: { in: config.groups.map(g => g.id) } }, select: { groupId: true, registrationId: true }, orderBy: { sortOrder: 'asc' } });
    const entries = await tx.v1TournamentSlot.findMany({ where: { tournamentId: id, kind: 'ENTRY', groupId: { in: config.groups.map(g => g.id) } },
      select: { groupId: true, registrationId: true }, orderBy: { position: 'asc' } });
    const sources = await loadGroupRankSources(tx, id, config.groups.map(g => g.id));
    const drawnTies = new Map(config.groups.map(group => [group.id, drawnTieGroups(sources.get(group.id)!)]));
    const standingRows = await tx.v1TournamentStanding.findMany({
      where: { groupId: { in: config.groups.map(g => g.id) } },
      select: { groupId: true, registrationId: true, position: true, points: true, wins: true, draws: true, losses: true, goalsFor: true, goalsAgainst: true },
      orderBy: [{ position: 'asc' }, { registrationId: 'asc' }],
    });
    const groupStandings = config.groups.map(group => {
      const source = sources.get(group.id)!;
      return { groupId: group.id, name: group.name,
        complete: source.registrationIds.length === group.capacity && resolveStoredGroupRank(source, 1, drawnTies.get(group.id)!).state !== 'group_incomplete',
        rows: standingRows.filter(row => row.groupId === group.id).map(row => {
          const resolution = row.position === null ? null : resolveStoredGroupRank(source, row.position, drawnTies.get(group.id)!);
          return { ...row, teamName: source.teamNameById.get(row.registrationId) ?? '',
            tiedRegistrationIds: resolution?.state === 'tied' ? resolution.tiedRegistrationIds : [] };
        }),
      };
    });
    const savedByFinal = new Map<string, Awaited<ReturnType<MultiFinalsService['savedAssignment']>>>();
    for (const final of config.finals) savedByFinal.set(final.name, await this.savedAssignment(tx, id, final, groupStandings));
    const finals = config.finals.map(final => {
      const candidates: string[] = []; const unresolved: Array<{ groupId: string; rank: number; state: string; tiedRegistrationIds: string[] }> = [];
      for (const rule of final.rules) {
        const source = sources.get(rule.groupId);
        const group = config.groups.find(g => g.id === rule.groupId);
        const result = source && source.registrationIds.length === group?.capacity ? resolveStoredGroupRank(source, rule.rank, drawnTies.get(rule.groupId) ?? []) : { state: 'group_incomplete' as const };
        if (result.state === 'ready') candidates.push(result.registrationId);
        else unresolved.push({ ...rule, state: result.state, tiedRegistrationIds: result.state === 'tied' ? result.tiedRegistrationIds : [] });
      }
      return { ...final, crossGroupTopThreeAvailable: supportsCrossGroupTopThree(final, config.groups.map(group => group.id)), suggestedRegistrationIds: candidates, unresolved, manual: final.registrationIds !== null && final.registrationIds !== undefined,
        standingsChanged: savedByFinal.get(final.name)?.standingsChanged ?? false, tiePicks: savedByFinal.get(final.name)?.tiePicks ?? [] };
    });
    const generated = await tx.v1TournamentGroup.count({ where: { tournamentId: id, phase: { not: 'group' } } }) > 0;
    return { revision: tournament.multiFinalsRevision, groups: config.groups.map(g => {
      const groupEntries = entries.filter(entry => entry.groupId === g.id);
      const members = assignments.filter(a => a.groupId === g.id).map(a => a.registrationId);
      return { ...g, registrationIds: groupEntries.length
        ? groupEntries.flatMap(entry => entry.registrationId === null ? [] : [entry.registrationId])
        : g.registrationIds?.filter(id => members.includes(id)) ?? members };
    }), finals, registrations, generated, fixtureCount, preliminaryFixtureCount, groupStandings };
  }
  async get(user: V1AuthUser, id: string) {
    await this.admins.getTournamentAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(tx => this.view(tx, id), { ...options, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async setup(user: V1AuthUser, id: string, dto: MultiFinalSetupDto, editing = false) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    const plan = planPreliminaryGroups(dto.groups);
    validateNamedFinals(dto.finals, new Map(dto.groups.map((g, i) => [String(i), g.capacity])));
    const groupOrder = dto.groups.map((_, i) => String(i));
    const finals = dto.finals.map(f => ({ ...f, rules: orderRulesByRank(f.rules, groupOrder) }));
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const tournament = await this.tournament(tx, id); this.assertMutable(tournament.status);
      if (tournament.multiFinalsRevision !== dto.expectedRevision) throw stale();
      const existingFixtures = await tx.v1TournamentMatchDetails.count({ where: { tournamentId: id, teamMatch: { deletedAt: null } } });
      if (existingFixtures || !editing && (tournament.multiFinals || await tx.v1TournamentGroup.count({ where: { tournamentId: id } }))) {
        throw new ConflictException({ code: 'BRACKET_NOT_EMPTY', message: '기존 대진이 있어 예선 편성을 수정할 수 없어요. 별도의 대진 초기화를 먼저 실행해 주세요.' });
      }
      if (editing && !tournament.multiFinals) throw stale();
      if (!tournament.competitionConfigVersionId) throw new ConflictException({ code: 'COMPETITION_CONFIG_REQUIRED', message: '대회 경기 규칙을 먼저 저장해 주세요.' });
      const confirmed = new Set((await this.confirmed(tx, id)).map(r => r.id)); this.assertTeams(dto.finals, confirmed);
      for (const group of dto.groups) for (const reg of group.registrationIds ?? []) if (!confirmed.has(reg)) invalidMultiFinal('이 대회의 확정 참가팀만 선택할 수 있어요.');
      // Resolve identities before any teardown so a stale or duplicate id fails without destructive work.
      const colored = reconcileFinalColors(this.config(tournament.multiFinals), finals.map(f => ({ ...f, name: f.name.trim() })));
      if (editing) {
        const scopes = dto.finals.map(f => f.name.trim());
        if (await tx.v1TournamentAward.count({ where: { tournamentId: id, bracketTrack: { notIn: ['overall', ...scopes] } } })
          || await tx.v1TournamentAwardSet.count({ where: { tournamentId: id, bracketTrack: { notIn: scopes } } })) {
          throw new ConflictException({ code: 'BRACKET_TRACK_AWARDS_REQUIRE_RESCOPING', message: '삭제·이름 변경할 토너먼트의 시상 범위를 먼저 정리해 주세요.' });
        }
        await tx.v1TournamentSlot.deleteMany({ where: { tournamentId: id } });
        await tx.v1TournamentStanding.deleteMany({ where: { group: { tournamentId: id } } });
        await tx.v1TournamentGroupTeam.deleteMany({ where: { group: { tournamentId: id } } });
        await tx.v1TournamentByeSlot.deleteMany({ where: { group: { tournamentId: id } } });
        const oldGroups = await tx.v1TournamentGroup.findMany({ where: { tournamentId: id }, select: { id: true } });
        for (const group of oldGroups) await deleteTournamentGroupInTx(tx, admin, group.id);
      }
      const materialized = await this.templates.materialize(tx, admin, { ...tournament, competitionConfigVersionId: tournament.competitionConfigVersionId! }, plan);
      const assignments = dto.groups.flatMap((g, i) => (g.registrationIds ?? []).map((registrationId, j) => ({ slotId: materialized.slotIds.get(`${i}:${j}`)!, registrationId })));
      if (assignments.length) await assignSlotsBatchInTx(tx, { admin, adminContext: this.admins, games: this.games }, assignments);
      const config: Config = { groups: dto.groups.map((g, i) => ({ id: materialized.groupIds.get(String(i))!, name: g.name.trim(), capacity: g.capacity, legs: g.legs })),
        finals: colored.finals.map(f => ({ ...f, rules: f.rules.map(rule => ({ ...rule, groupId: materialized.groupIds.get(rule.groupId)! })) })), nextColorIndex: colored.nextColorIndex };
      await tx.v1Tournament.update({ where: { id }, data: { multiFinals: JSON.parse(JSON.stringify(config)), multiFinalsRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: editing ? 'tournament.multi_finals.preliminary.update' : 'tournament.multi_finals.setup', targetType: 'tournament', targetId: id, beforeJson: tournament.multiFinals ?? undefined, afterJson: JSON.parse(JSON.stringify(config)) }, tx);
      return this.view(tx, id);
    }, options);
  }
  async reset(user: V1AuthUser, id: string, dto: MultiFinalResetDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const tournament = await this.tournament(tx, id); this.assertMutable(tournament.status);
      const config = this.config(tournament.multiFinals);
      if (!config || tournament.multiFinalsRevision !== dto.expectedRevision) throw stale();
      // Serialize with score/event writers before checking whether any game has started.
      await tx.$queryRaw`SELECT g.id FROM v1_games g JOIN v1_tournament_match_details d ON d.team_match_id = g.team_match_id JOIN v1_team_matches m ON m.id = d.team_match_id WHERE d.tournament_id = ${id} AND m.deleted_at IS NULL ORDER BY g.id FOR UPDATE OF g`;
      const fixtures = await this.assertUnstarted(tx, id, true);
      const before = await this.view(tx, id);
      const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId: id }, select: { sourceTeamMatchId: true, targetTeamMatchId: true } });
      for (const fixtureId of orderFixturesForTeardown(fixtures.map(f => f.teamMatchId), edges)) await softDeleteTournamentFixtureInTx(tx, admin, fixtureId);
      await tx.v1TournamentSlot.deleteMany({ where: { tournamentId: id } });
      await tx.v1TournamentStanding.deleteMany({ where: { group: { tournamentId: id } } });
      await tx.v1TournamentByeSlot.deleteMany({ where: { group: { tournamentId: id } } });
      const finalGroups = await tx.v1TournamentGroup.findMany({ where: { tournamentId: id, phase: { not: 'group' } }, select: { id: true } });
      await tx.v1TournamentGroupTeam.deleteMany({ where: { groupId: { in: finalGroups.map(g => g.id) } } });
      for (const group of finalGroups) await deleteTournamentGroupInTx(tx, admin, group.id);
      const next: Config = { ...config, groups: before.groups, finals: config.finals.map(f => ({ ...f, registrationIds: null })) };
      await tx.v1Tournament.update({ where: { id }, data: { multiFinals: JSON.parse(JSON.stringify(next)), multiFinalsRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: 'tournament.multi_finals.reset', targetType: 'tournament', targetId: id,
        beforeJson: JSON.parse(JSON.stringify(config)), afterJson: { deletedFixtureCount: fixtures.length, config: JSON.parse(JSON.stringify(next)) } }, tx);
      return this.view(tx, id);
    }, options);
  }
  async select(user: V1AuthUser, id: string, dto: MultiFinalSelectionDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
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
      const groupOrder = config.groups.map(g => g.id);
      const next: Config = { ...config, ...reconcileFinalColors(config, dto.finals.map(f => ({ ...f, name: f.name.trim(), rules: orderRulesByRank(f.rules, groupOrder) }))) };
      if (sameNamedFinalStructure(config.finals, dto.finals)) await this.assertUnstarted(tx, id);
      else await this.clearFinals(tx, admin, id);
      await tx.v1Tournament.update({ where: { id }, data: { multiFinals: JSON.parse(JSON.stringify(next)), multiFinalsRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: 'tournament.multi_finals.selection', targetType: 'tournament', targetId: id, beforeJson: JSON.parse(JSON.stringify(config)), afterJson: JSON.parse(JSON.stringify(next)) }, tx);
      return this.view(tx, id);
    }, options);
  }
  private async assertCrossGroupBracket(tx: Tx, id: string, name: string, groups: SeedGroup[], seeds: string[]) {
    const slots = await tx.v1TournamentSlot.findMany({ where: { tournamentId: id, kind: 'GROUP_RANK', group: { bracketTrack: name } }, select: { id: true, position: true } });
    const fixtures = await tx.v1TournamentMatchDetails.findMany({ where: { tournamentId: id, group: { bracketTrack: name }, teamMatch: { deletedAt: null } },
      select: { teamMatchId: true, group: { select: { phase: true } }, teamMatch: { select: { homeSlotId: true, awaySlotId: true } }, advancementTargets: { select: { sourceTeamMatchId: true, sourceOutcome: true } } } });
    const graph = fixtures.map(fixture => ({ id: fixture.teamMatchId, phase: fixture.group?.phase ?? '', ...fixture.teamMatch,
      incoming: fixture.advancementTargets.map(edge => ({ sourceId: edge.sourceTeamMatchId, outcome: edge.sourceOutcome })) }));
    if (!validCrossGroupBracket(groups, seeds, slots, graph)) invalidMultiFinal('저장된 12강·8강 연결이 교차 배치 규칙과 달라요. 대진 연결을 확인하거나 기본 수동 배치를 사용해 주세요.');
  }
  async assignmentPreview(user: V1AuthUser, id: string, dto: MultiFinalAssignmentPreviewDto) {
    await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(async tx => {
      const view = await this.view(tx, id);
      if (dto.expectedRevision !== view.revision) throw stale();
      const final = view.finals.find(final => final.name === dto.finalName);
      if (!final) return invalidMultiFinal('배정할 토너먼트를 찾을 수 없어요.');
      // Tied ranks do not block: those seeds come back null for the operator to pick.
      if (!view.groupStandings.length || view.groupStandings.some(group => !group.complete) || final.unresolved.some(rule => rule.state !== 'tied')) {
        throw new ConflictException({ code: 'MULTI_FINAL_PRELIMINARY_INCOMPLETE', message: '예선 공식 결과와 순위 반영이 완료된 뒤 추천 배치를 만들 수 있어요.' });
      }
      const policy = dto.assignmentPolicy ?? 'rank_order';
      if (policy === 'cross_group_top3' && !final.crossGroupTopThreeAvailable) return invalidMultiFinal('4개 조의 1~3위가 진출하는 토너먼트에서만 교차 배치할 수 있어요.');
      const picks = dto.tiePicks ?? [];
      // Cross placement needs every tied seat picked; rank order leaves unpicked seats open (null).
      const crossGroups = policy === 'cross_group_top3' ? crossSeedGroups(final, view.groups.map(group => group.id), picks) : null;
      if (!crossGroups) validateTiePicks(final, picks);
      const crossSeeds = crossGroups ? crossGroupTopThree(crossGroups) : null;
      const registrationIds: Array<string | null> = crossSeeds ?? (final.rules.length === namedFinalSize(final) ? rankOrderSeeds(final) : final.registrationIds ?? []);
      if (registrationIds.length !== namedFinalSize(final)) return invalidMultiFinal('진출 규칙과 대진 자리 수를 먼저 맞춰 주세요.');
      if (crossGroups && crossSeeds) await this.assertCrossGroupBracket(tx, id, final.name, crossGroups, crossSeeds);
      return { revision: view.revision, finalName: final.name, assignmentPolicy: policy, registrationIds, sourceVersion: hash(view.groupStandings) };
    }, { ...options, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async assign(user: V1AuthUser, id: string, dto: MultiFinalAssignmentDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    // 이번 확정으로 이 토너먼트에 새로 들어간 팀(자리 번호 = 시드). 같은 명단을 다시 확정해도 알리지 않는다.
    const advanced: { value: { title: string; entries: Array<{ registrationId: string; seed: number }> } | null } = { value: null };
    const view = await this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id);
      await lockCompetitionForBracketMutationInTx(tx, initial);
      const tournament = await this.tournament(tx, id);
      this.assertMutable(tournament.status);
      const config = this.config(tournament.multiFinals);
      if (!config || dto.expectedRevision !== tournament.multiFinalsRevision) throw stale();
      const selected = config.finals.find(final => final.name === dto.finalName);
      if (!selected) return invalidMultiFinal('배정할 토너먼트를 찾을 수 없어요. 다시 불러와 주세요.');
      if (dto.registrationIds.length !== namedFinalSize(selected)) invalidMultiFinal('해당 토너먼트의 대진 자리 수에 맞게 진출팀을 선택해 주세요.');
      const picks = (dto.tiePicks ?? []).map(({ groupId, rank, registrationId }) => ({ groupId, rank, registrationId }));
      if (picks.some(pick => !dto.registrationIds.includes(pick.registrationId))) invalidMultiFinal('동률 자리에서 고른 팀이 진출팀 명단에 있어야 해요.');
      const finals = config.finals.map(final => final.name === dto.finalName ? { ...final, registrationIds: dto.registrationIds, assignmentPolicy: dto.assignmentPolicy ?? 'rank_order' } : final);
      validateNamedFinals(finals, new Map(config.groups.map(group => [group.id, group.capacity])));
      this.assertTeams([{ ...selected, registrationIds: dto.registrationIds }], new Set((await this.confirmed(tx, id)).map(row => row.id)));
      await tx.$queryRaw`SELECT g.id FROM v1_games g JOIN v1_tournament_match_details d ON d.team_match_id = g.team_match_id JOIN v1_team_matches m ON m.id = d.team_match_id JOIN v1_tournament_groups tg ON tg.id = d.group_id WHERE d.tournament_id = ${id} AND (tg.phase = 'group' OR tg.bracket_track = ${dto.finalName}) AND m.deleted_at IS NULL ORDER BY g.id FOR UPDATE OF g`;
      const view = await this.view(tx, id);
      if (dto.sourceVersion !== undefined && dto.sourceVersion !== hash(view.groupStandings)) throw stale();
      if (!view.groupStandings.length || view.groupStandings.some(group => !group.complete)) {
        throw new ConflictException({ code: 'MULTI_FINAL_PRELIMINARY_INCOMPLETE', message: '예선 경기가 모두 끝나고 공식 순위가 반영된 뒤 진출팀을 배정할 수 있어요.' });
      }
      const current = view.finals.find(final => final.name === dto.finalName);
      if (!current) return invalidMultiFinal('배정할 토너먼트를 찾을 수 없어요. 다시 불러와 주세요.');
      validateTiePicks(current, picks);
      const cross = dto.assignmentPolicy === 'cross_group_top3';
      const crossGroups = cross && supportsCrossGroupTopThree(selected, config.groups.map(group => group.id)) ? crossSeedGroups(current, view.groups.map(group => group.id), picks) : null;
      if (cross && (!crossGroups || !validCrossGroupTopThree(crossGroups, dto.registrationIds))) {
        return invalidMultiFinal('1위 부전승·2위 교차 고정·3위 동일 조 회피 규칙에 맞지 않는 배치예요. 추천 배치를 다시 만들어 주세요.');
      }
      // Other finals may already be live; only this track's start/record state blocks its assignment.
      const fixtures = await this.assertUnstarted(tx, id, false, dto.finalName);
      const slots = await tx.v1TournamentSlot.findMany({
        where: { tournamentId: id, kind: 'GROUP_RANK', group: { bracketTrack: dto.finalName, phase: { not: 'group' } } },
        select: { id: true, position: true }, orderBy: { position: 'asc' },
      });
      if (!fixtures.length || slots.length !== dto.registrationIds.length || slots.some((slot, index) => slot.position !== index + 1)) {
        throw new ConflictException({ code: 'MULTI_FINAL_BRACKET_REQUIRED', message: '해당 토너먼트의 빈 대진을 먼저 생성해 주세요.' });
      }
      if (crossGroups) await this.assertCrossGroupBracket(tx, id, dto.finalName, crossGroups, dto.registrationIds);
      await assignSlotsBatchInTx(tx, { admin, adminContext: this.admins, games: this.games },
        slots.map((slot, index) => ({ slotId: slot.id, registrationId: dto.registrationIds[index] })));
      const next: Config = { ...config, finals };
      await tx.v1Tournament.update({ where: { id }, data: { multiFinals: JSON.parse(JSON.stringify(next)), multiFinalsRevision: { increment: 1 } } });
      await this.admins.logAdminAction(admin, { action: 'tournament.multi_finals.assign', targetType: 'tournament', targetId: id,
        beforeJson: JSON.parse(JSON.stringify(selected)), afterJson: { finalName: dto.finalName, registrationIds: dto.registrationIds, assignmentPolicy: dto.assignmentPolicy ?? 'rank_order',
          tiePicks: picks, standingsSnapshot: standingOrder(view.groupStandings, [...new Set(selected.rules.map(rule => rule.groupId))]) } }, tx);
      const previous = new Set(selected.registrationIds ?? []);
      advanced.value = { title: tournament.title, entries: dto.registrationIds.flatMap((registrationId, index) => previous.has(registrationId) ? [] : [{ registrationId, seed: index + 1 }]) };
      return this.view(tx, id);
    }, options);
    if (advanced.value) this.notifyAdvanced(id, dto.finalName, advanced.value);
    return view;
  }
  /** 진출한 팀의 팀장·매니저에게 알린다. 커밋 뒤 best-effort 라서 알림 실패가 확정을 되돌리지 않는다. */
  private notifyAdvanced(tournamentId: string, finalName: string, advanced: { title: string; entries: Array<{ registrationId: string; seed: number }> }) {
    for (const { registrationId, seed } of advanced.entries) {
      this.notifications?.emitToManyDeferred(
        async () => {
          const rows = await this.prisma.v1TeamMembership.findMany({
            where: { status: 'active', role: { in: ['owner', 'manager'] }, team: { tournamentRegistrations: { some: { id: registrationId } } } },
            select: { userId: true },
          });
          return [...new Set(rows.map(row => row.userId))];
        },
        'tournament_finals_advanced',
        tournamentId,
        `"${advanced.title}" · ${finalName} · ${seed}번 시드로 진출했어요. 대진표에서 첫 경기를 확인해 보세요.`,
        { businessKey: `tournament-finals-advanced:${tournamentId}:${finalName}:${registrationId}` },
      );
    }
  }
  private async previewInTx(tx: Tx, id: string) {
    const view = await this.view(tx, id);
    const finals: NamedFinalDto[] = view.finals.map(({ suggestedRegistrationIds: _suggested, unresolved: _unresolved, manual: _manual, crossGroupTopThreeAvailable: _cross, standingsChanged: _changed, tiePicks: _tiePicks, ...f }) => {
      // Preserve the entire pending roster: a partial suggestion must never shrink the bracket.
      return { ...f, name: f.name, capacity: f.capacity, rules: f.rules, thirdPlace: f.thirdPlace, assignmentPolicy: f.assignmentPolicy,
        registrationIds: f.registrationIds ?? null };
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
    await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(tx => this.previewInTx(tx, id), { ...options, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }
  async generate(user: V1AuthUser, id: string, dto: MultiFinalGenerateDto) {
    const admin = await this.admins.getTournamentMutationAdmin(user.id, { tournamentId: id });
    return this.prisma.$transaction(async tx => {
      const initial = await this.tournament(tx, id); await lockCompetitionForBracketMutationInTx(tx, initial);
      const prior = await findTournamentManagementAction(tx, { targetType: 'tournament', targetId: id, action: 'tournament.multi_finals.generate', afterJson: { path: ['requestId'], equals: dto.requestId } });
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
        select: { id: true, position: true, group: { select: { phase: true, bracketTrack: true } } },
      });
      const slotIds = new Map<string, string>();
      for (const slot of plan.slots) {
        const group = plan.groups.find(g => g.key === slot.groupKey)!;
        const match = existing.find(row => row.group !== null && row.group.bracketTrack === group.bracketTrack && row.group.phase === group.phase && row.position === slot.position);
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
      const next = { ...config, finals: preview.finals.map(f => ({ ...f, name: f.name, rules: f.rules, thirdPlace: f.thirdPlace, capacity: f.capacity, registrationIds: f.registrationIds, assignmentPolicy: f.assignmentPolicy })) };
      await tx.v1Tournament.update({ where: { id }, data: { multiFinals: JSON.parse(JSON.stringify(next)), multiFinalsRevision: { increment: 1 } } });
      const revision = tournament.multiFinalsRevision + 1;
      await this.admins.logAdminAction(admin, { action: 'tournament.multi_finals.generate', targetType: 'tournament', targetId: id, afterJson: { requestId: dto.requestId, previewHash: dto.previewHash, revision, counts: preview.counts, finals: JSON.parse(JSON.stringify(next.finals)) } }, tx);
      return { revision, counts: preview.counts, replayed: false };
    }, options);
  }
}
