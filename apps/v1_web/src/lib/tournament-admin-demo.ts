import type { V1Tournament, V1AdminTournamentRegistration, V1AdminTournamentBracket } from '@/types/api';
import type { V1DataSource } from '@/components/providers/v1-data-source';
import { V1ApiError } from '@/lib/api-client';

export const ADMIN_DEMO_ID = 'sample-partner-cup';
export const ADMIN_DEMO_STORAGE_KEY = 'teameet.tournament-admin-demo.v2';
const base = `/admin/tournaments/${ADMIN_DEMO_ID}`;
const stamp = '2026-11-05T00:00:00.000Z';
const teamNames = ['블루 FC', '오렌지 FS', '그린 FC', '화이트 FS'];
type Row = Record<string, unknown>;
export type AdminDemoState = {
  version: 2;
  tournament: V1Tournament;
  registrations: V1AdminTournamentRegistration[];
  bracket: V1AdminTournamentBracket;
  bracketDraft: { input: Row | null; revision: number };
  periods: { revision: number; minutes: number[]; matches: Record<string, number[]> };
  collections: Record<'announcements' | 'sponsors' | 'awards' | 'award-sets' | 'popups' | 'fields' | 'staff', Row[]>;
};

export function createAdminDemoState(): AdminDemoState {
  const tournament: V1Tournament = {
    id: ADMIN_DEMO_ID, sportId: 'sample-futsal', title: 'Teameet 파트너컵 · 샘플',
    sixTeamMode: false, sixTeamBracket: null, canRevertStart: true, formatChangeBlockedReason: null,
    status: 'open', kind: 'regular_tournament', format: 'knockout', isPublic: false,
    registrationDeadlineAt: null, rosterDeadlineAt: null, bracketPublishedAt: null,
    bracketPublishScheduledAt: null, scheduledAt: null, scheduledEndAt: null,
    venue: '체험 풋살장 A코트', latitude: null, longitude: null, coverImageUrl: null,
    venueAddress: null, venueProvider: null, venueProviderId: null, parkingInfo: null, listImageUrl: null, showDetailImage: true,
    teamCount: 4, minPlayers: 6, maxPlayers: 12, competitionConfigVersionId: null,
    lineupMaxPlayers: 6, lineupMinPlayers: 6, lineupSizeOptions: [5, 6],
    substitutionMode: 'rolling', maxSubstitutions: null, substitutionModeOptions: ['limited', 'rolling'],
    genderCategory: null, genderMinMale: null, genderMaxMale: null, genderMinFemale: null, genderMaxFemale: null,
    minMatchesPerTeam: null, entryFee: 0, prizePool: null, prizeSummary: null, prizeBreakdown: null,
    promoHomeEnabled: false, promoHomeTitle: null, promoHomeSubtitle: null, promoHomeImageUrl: null,
    promoHomeBadgeText: null, promoHomeDateText: null, promoHomeTeamsText: null, promoHomeLocationText: null,
    promoHomePrizeText: null, promoHomePriority: 0, promoListEnabled: false, promoListTitle: null,
    promoListSubtitle: null, promoListImageUrl: null, promoListBadgeText: null, promoListDateText: null,
    promoListTeamsText: null, promoListLocationText: null, promoListPrizeText: null, promoListPriority: 0,
    bankName: null, bankAccount: null, bankHolder: null, yellowAccumulationLimit: null,
    redCardSuspensionMatches: null, rulesText: '샘플 대회 운영을 자유롭게 체험해 보세요.',
    refundPolicyText: null, registrationCount: 4, operationCounts: { registrations: 4, fixtures: 0, announcements: 0 },
    createdAt: stamp, updatedAt: stamp,
  };
  return {
    version: 2, tournament,
    registrations: teamNames.map((teamName, index) => ({
      id: `sample-registration-${index + 1}`, tournamentId: ADMIN_DEMO_ID,
      teamId: `sample-team-${index + 1}`, teamName, appliedByUserId: `sample-owner-${index + 1}`,
      status: 'paid', depositorName: null, agreedRules: true, agreedPrivacy: true,
      agreedRefund: true, agreedMediaConsent: true, confirmedAt: null, rosterLockedAt: null,
      rosterDeadlineOverrideAt: null, cancelRequestedAt: null, cancelReason: null, adminCancelReason: null,
      cancelOutcome: null, playerCount: 6, payment: null, confirmedByAdminUserId: null, createdAt: stamp, updatedAt: stamp,
    })),
    bracket: { groups: [], fixtures: [], standings: [], slots: [] },
    bracketDraft: { input: null, revision: 0 },
    periods: { revision: 1, minutes: [20, 20], matches: {} },
    collections: { announcements: [], sponsors: [], awards: [], 'award-sets': [], popups: [], fields: [], staff: [] },
  };
}

function fail(message: string, statusCode = 400): never {
  throw new V1ApiError({ status: 'error', statusCode, code: 'DEMO_ACTION_UNAVAILABLE', message, timestamp: stamp });
}
function object(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('체험 입력 형식을 확인해 주세요.');
  if (['__proto__', 'constructor', 'prototype'].some((key) => Object.hasOwn(value, key))) fail('체험 입력 형식을 확인해 주세요.');
  return value as Row;
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
const page = (items: unknown[]) => ({ items, pageInfo: { hasNext: false, nextCursor: null } });

/** Replay validated commands instead of trusting persisted response objects or production IDs. */
export type AdminDemoCommand = { method: string; path: string; body?: unknown };
export function restoreAdminDemo(raw: string | null): { state: AdminDemoState; commands: AdminDemoCommand[] } {
  let state = createAdminDemoState();
  if (raw === null) return { state, commands: [] };
  const parsed: unknown = JSON.parse(raw);
  const saved = object(parsed);
  if (saved.version !== 2 || !Array.isArray(saved.commands) || saved.commands.length > 1000) fail('체험 저장 기록을 읽지 못했어요. 체험을 초기화해 주세요.');
  const commands: AdminDemoCommand[] = [];
  for (const value of saved.commands) {
    const command = object(value);
    if (typeof command.method !== 'string' || command.method === 'GET' || typeof command.path !== 'string') fail('체험 저장 기록이 손상됐어요.');
    const next = runAdminDemo(state, command.method, command.path, command.body);
    state = next.state;
    commands.push({ method: command.method, path: command.path, body: command.body });
  }
  return { state, commands };
}

export function runAdminDemo(current: AdminDemoState, method: string, rawPath: string, body?: unknown): { state: AdminDemoState; data: unknown } {
  const path = rawPath.split('?')[0];
  const state = clone(current);
  const data = method === 'GET' ? read(state, path, new URLSearchParams(rawPath.split('?')[1])) : write(state, method, path, body);
  state.tournament.operationCounts = {
    registrations: state.registrations.length, fixtures: state.bracket.fixtures.length,
    announcements: state.collections.announcements.length,
  };
  return { state, data: clone(data) };
}

function read(state: AdminDemoState, path: string, query: URLSearchParams): unknown {
  if (path === base) return state.tournament;
  if (path === '/admin/me') return { userId: 'sample-operator', adminRole: 'ops', capabilities: ['status:write'] };
  if (path === '/admin/tournaments') return page([state.tournament]);
  if (path === '/admin/popups') return {
    ...page(state.collections.popups.filter((row) => !query.get('status') || row.status === query.get('status'))),
    nextCursor: null, summary: { total: state.collections.popups.length, byStatus: Object.fromEntries(['published', 'archived', 'draft'].map((status) => [status, state.collections.popups.filter((row) => row.status === status).length])) },
  };
  if (path === `/tournaments/${ADMIN_DEMO_ID}`) return {
    ...state.tournament, groups: state.bracket.groups, fixtures: state.bracket.fixtures,
    standings: [], sponsors: state.collections.sponsors, awards: state.collections.awards,
    announcements: state.collections.announcements, leagueFixtures: [],
  };
  if (path === '/master/sports') return [{ id: 'sample-futsal', code: 'futsal', name: '풋살', isActive: true }];
  if (path === '/admin/competition-configs/lineup-size-options') return { sportId: 'sample-futsal', supported: true, options: [5, 6], defaultMaxPlayers: 6, substitutionModes: ['limited', 'rolling'], defaultSubstitutionMode: 'rolling', defaultMaxSubstitutions: null, defaultPeriods: [{ label: '전반', durationMinutes: 20 }, { label: '후반', durationMinutes: 20 }] };
  if (path === `${base}/registrations`) return page(state.registrations);
  if (path === `${base}/bracket`) return state.bracket;
  if (path === `${base}/bracket/template/capabilities`) return { flexibleEnabled: true, sixTeamEligible: false };
  if (path === `${base}/bracket/template/draft`) return state.bracketDraft;
  if (path === `${base}/reviews`) return { ...page([]), summary: { count: 0, averageRating: null } };
  if (path === `${base}/player-records`) return { tournamentId: ADMIN_DEMO_ID, goals: [], assists: [] };
  if (path === `${base}/campaign`) fail('아직 샘플 캠페인이 없어요.', 404);
  if (path === `${base}/periods`) return {
    tournamentId: ADMIN_DEMO_ID, kind: 'regular_tournament', competitionConfigVersionId: null,
    expectedVersion: `sample-period-${state.periods.revision}`, periods: periodRows(state.periods.minutes), legacyPeriodCount: null, requiresDurationInput: false,
    stageOverrides: [], groupOverrides: [], matchOverrideCount: 0,
  };
  const periodFixture = state.bracket.fixtures.find((f) => path === `${base}/periods/matches/${f.id}`);
  if (periodFixture) return {
    tournamentId: ADMIN_DEMO_ID, teamMatchId: periodFixture.id,
    expectedVersion: `sample-period-${state.periods.revision}`, overridden: Object.hasOwn(state.periods.matches, periodFixture.id),
    editable: !periodFixture.result, periods: state.periods.matches[periodFixture.id] ? periodRows(state.periods.matches[periodFixture.id]) : null,
    legacyPeriodCount: null, inherited: { source: 'default', phase: null, groupName: null, periods: periodRows(state.periods.minutes), legacyPeriodCount: null },
  };
  if (path === `/tournament-ops/tournaments/${ADMIN_DEMO_ID}/staff`) return { items: state.collections.staff };
  if (path === `/tournament-ops/tournaments/${ADMIN_DEMO_ID}/fields`) return { items: state.collections.fields };
  if (path === `/tournament-ops/tournaments/${ADMIN_DEMO_ID}/staff/user-search`) return { items: [
    { id: 'sample-staff-1', nickname: '샘플 기록 담당자', displayName: '샘플 담당자', maskedEmail: null },
  ] };
  if (path === `/tournament-ops/tournaments/${ADMIN_DEMO_ID}/operations`) return {
    items: state.bracket.fixtures.filter((f) => (!query.get('status') || f.game?.state === query.get('status')) && (!query.get('fieldId') || f.fieldId === query.get('fieldId'))).map((f) => ({
      fixtureId: f.id, tournamentId: ADMIN_DEMO_ID, homeTeamName: f.homeTeamName, awayTeamName: f.awayTeamName,
      round: f.round, fixtureNumber: f.fixtureNumber, legNumber: 1, groupName: null, gameId: f.game?.id,
      gameState: f.game?.state, fieldId: f.fieldId ?? null,
      fieldName: state.collections.fields.find((field) => field.id === f.fieldId)?.name ?? null,
      homeRegistrationId: f.homeRegistrationId, awayRegistrationId: f.awayRegistrationId, scheduledAt: f.scheduledAt,
      currentScore: f.game?.latestRevision?.score ?? null, currentRevisionState: f.game?.latestRevision?.state ?? null,
      warnings: [], version: f.game?.version, revisionId: f.game?.latestRevision?.id ?? null, stableRevision: 'sample',
    })), nextCursor: null, watermark: stamp, liveWarnings: [],
  };
  const collection = path.startsWith(`${base}/`) ? path.slice(base.length + 1) : '';
  if (Object.hasOwn(state.collections, collection)) {
    const rows = state.collections[collection as keyof AdminDemoState['collections']];
    return collection === 'sponsors' ? { items: rows } : collection === 'announcements' ? page(rows) : rows;
  }
  const roster = state.registrations.find((r) => path === `/admin/registrations/${r.id}/players`);
  if (roster) return {
    registrationId: roster.id, tournamentId: ADMIN_DEMO_ID, teamId: roster.teamId, teamName: roster.teamName,
    locked: Boolean(roster.rosterLockedAt), rosterLockedAt: roster.rosterLockedAt,
    minPlayers: 6, maxPlayers: 12,
    players: Array.from({ length: 6 }, (_, i) => ({
      id: `${roster.id}-player-${i + 1}`, userId: `sample-player-${roster.teamId}-${i + 1}`,
      jerseyNumber: i + 1, realName: `${roster.teamName} 선수 ${i + 1}`, birthDateSnapshot: null,
      genderSnapshot: null, eligibilityStatus: 'eligible', createdAt: stamp, updatedAt: stamp,
    })),
  };
  if (state.registrations.some((r) => path === `/admin/registrations/${r.id}/eligible-players`)) return { members: [] };
  const rosterMatrix = state.registrations.find((r) => path === `${base}/registrations/${r.id}/game-rosters`);
  if (rosterMatrix) fail('경기별 출전 명단 조정은 체험에서 지원하지 않아요. 신청 관리의 명단 보기에서 샘플 선수들을 확인해 주세요.');
  const revisionFixture = state.bracket.fixtures.find((f) => path === `/games/${f.game?.id}/result-revisions`);
  if (revisionFixture) return revisionFixture.game?.latestRevision ? [{
    ...revisionFixture.game.latestRevision, gameId: revisionFixture.game.id, revision: 1,
    eventsHash: 'sample-no-live-events', missingScorer: false, mvpParticipantId: null, reason: null,
    outcomeReason: 'NORMAL', outcomeNote: null, createdByActorType: 'USER', createdByUserId: 'sample-operator',
    createdByName: '샘플 운영자', officializedByName: '샘플 운영자', createdBySystemActor: null,
    supersedesId: null, submittedAt: stamp, officialAt: stamp, createdAt: stamp, updatedAt: stamp, resultParticipants: [],
  }] : [];
  const popup = state.collections.popups.find((row) => path === `/admin/popups/${row.id}`);
  if (popup) return popup;
  return fail('이 기능은 아직 체험에서 지원하지 않아요. 실제 대회에는 요청하지 않았어요.');
}

function write(state: AdminDemoState, method: string, path: string, value: unknown): unknown {
  const body = value === undefined ? {} : object(value);
  if (path === `${base}/periods` && method === 'PATCH') {
    if (body.expectedVersion !== `sample-period-${state.periods.revision}`) fail('경기 시간 설정이 바뀌었어요. 다시 확인해 주세요.');
    if (body.phase || body.groupId) fail('단계·조별 경기 시간 변경은 체험에서 지원하지 않아요. 대회 기본값이나 경기별로 설정해 주세요.');
    const fixture = state.bracket.fixtures.find((f) => f.id === body.teamMatchId);
    if (body.teamMatchId && (!fixture || fixture.result)) fail('결과가 없는 샘플 경기만 시간을 변경할 수 있어요.');
    if (body.inheritDefault === true && fixture) delete state.periods.matches[fixture.id];
    else {
      if (!Array.isArray(body.periods) || !body.periods.length) fail('경기 시간을 입력해 주세요.');
      const minutes = body.periods.map((p) => object(p).durationMinutes);
      if (!minutes.every((n) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 180)) fail('각 경기 시간은 1~180분으로 입력해 주세요.');
      if (fixture) state.periods.matches[fixture.id] = minutes.map(Number);
      else state.periods.minutes = minutes.map(Number);
    }
    state.periods.revision += 1; return read(state, `${base}/periods`, new URLSearchParams());
  }
  if (path === base && method === 'PATCH') {
    const { expectedVersion, ...updates } = body;
    if (expectedVersion !== undefined && expectedVersion !== state.tournament.updatedAt) fail('대회 정보가 바뀌었어요. 창을 다시 열어 주세요.');
    // Every submitted field must be stored, or the action fails. No partial pretend-save.
    for (const key of Object.keys(updates)) if (!Object.hasOwn(state.tournament, key) || ['id', 'createdAt', 'operationCounts', 'status', 'updatedAt'].includes(key)) fail(`체험에서 저장할 수 없는 설정이에요: ${key}`);
    if ('title' in updates && (typeof updates.title !== 'string' || !updates.title.trim())) fail('대회명을 입력해 주세요.');
    if ((updates.format !== undefined && updates.format !== 'knockout') || (updates.teamCount !== undefined && updates.teamCount !== 4) || updates.sixTeamMode === true) fail('현재 샘플은 4팀 토너먼트를 지원해요.');
    Object.assign(state.tournament, updates);
    state.tournament.updatedAt = new Date(Date.parse(state.tournament.updatedAt) + 1).toISOString();
    return state.tournament;
  }
  if (path === `${base}/visibility` && method === 'PATCH') {
    if (typeof body.isPublic !== 'boolean') fail('공개 설정을 확인해 주세요.');
    state.tournament.isPublic = body.isPublic; return { tournamentId: ADMIN_DEMO_ID, isPublic: body.isPublic };
  }
  if (path === `${base}/status` && method === 'POST') {
    const transitions: Record<string, string[]> = { draft: ['open', 'cancelled'], open: ['closed', 'cancelled'], closed: ['open', 'in_progress', 'cancelled'], in_progress: ['completed', 'closed', 'cancelled'], completed: ['in_progress'], cancelled: ['draft'] };
    if (!transitions[state.tournament.status]?.includes(String(body.status))) fail('현재 상태에서는 변경할 수 없어요.');
    if (body.status === 'in_progress' && state.bracket.fixtures.length === 0) fail('대진을 먼저 만들어 주세요.');
    if (body.status === 'completed' && state.bracket.fixtures.some((f) => !f.result)) fail('모든 경기 결과를 먼저 확정해 주세요.');
    state.tournament.status = body.status as V1Tournament['status'];
    return { tournament: state.tournament, alreadyInStatus: false };
  }
  const registration = state.registrations.find((r) => path.startsWith(`/admin/registrations/${r.id}/`));
  if (registration) {
    if (method === 'PATCH' && path.endsWith('/confirm')) {
      if (!['paid', 'waitlisted'].includes(registration.status)) fail('확정할 수 있는 신청이 아니에요.');
      const decision = body.decision ?? 'confirm';
      if (decision !== 'confirm' && decision !== 'waitlist') fail('신청 처리 방식을 확인해 주세요.');
      registration.status = decision === 'confirm' ? 'confirmed' : 'waitlisted';
      registration.confirmedAt = decision === 'confirm' ? stamp : null;
      return { ...registration, alreadyProcessed: false };
    }
    if (method === 'PATCH' && path.endsWith('/cancel')) {
      if (state.bracket.fixtures.some((f) => f.homeRegistrationId === registration.id || f.awayRegistrationId === registration.id)) fail('대진에 배정된 샘플 팀은 먼저 팀 자리에서 배정을 해제해 주세요.');
      registration.cancelOutcome = registration.status === 'cancel_requested' ? 'approved' : 'rejected';
      registration.status = 'cancelled'; registration.adminCancelReason = typeof body.reason === 'string' ? body.reason : null;
      return registration;
    }
    if (path.endsWith('/roster-lock') && (method === 'POST' || method === 'DELETE')) {
      if (registration.status !== 'confirmed') fail('참가 확정 후 명단을 확정해 주세요.');
      registration.rosterLockedAt = method === 'POST' ? stamp : null; return registration;
    }
    if (path.endsWith('/roster-deadline-override') && (method === 'POST' || method === 'DELETE')) {
      registration.rosterDeadlineOverrideAt = method === 'POST' ? stamp : null; return registration;
    }
    fail('이 명단 작업은 아직 체험에서 지원하지 않아요.');
  }
  if (path === `${base}/bracket/template` && method === 'POST') {
    if (body.kind !== 'knockout' || (body.size !== 4 && body.participantCount !== 4) || body.thirdPlace === true) fail('현재 샘플은 4팀 토너먼트(3·4위전 없음)를 지원해요.');
    if (state.bracket.fixtures.length && body.replaceExisting !== true) fail('기존 대진 교체를 확인해 주세요.');
    if (state.bracket.fixtures.some((f) => f.result)) fail('결과가 있는 대진은 교체할 수 없어요.');
    buildBracket(state);
    if (Array.isArray(body.registrationIds)) {
      if (body.registrationIds.length !== 4 || new Set(body.registrationIds).size !== 4) fail('확정된 4팀을 중복 없이 배정해 주세요.');
      body.registrationIds.forEach((id, index) => {
        const team = state.registrations.find((r) => r.id === id && r.status === 'confirmed');
        if (!team) fail('확정된 샘플 팀만 배정할 수 있어요.');
        state.bracket.slots[index].registrationId = team.id; state.bracket.slots[index].teamName = team.teamName ?? null;
      });
      syncSlots(state);
    }
    return { groups: 1, slots: 4, fixtures: 3, edges: 2 };
  }
  if (path === `${base}/bracket/template/preview` && method === 'POST') {
    if (body.kind !== 'knockout' || body.participantCount !== 4 || body.thirdPlace === true) fail('현재 샘플은 4팀 토너먼트(3·4위전 없음)를 지원해요.');
    const planned = clone(state); buildBracket(planned);
    return {
      counts: { groups: 1, slots: 4, fixtures: 3, edges: 2 }, previewHash: 'sample-four-team-v1',
      confirmedTeamCount: state.registrations.filter((r) => r.status === 'confirmed').length,
      groups: [{ key: 'sample-knockout', name: '토너먼트', phase: 'knockout', advanceCount: null }],
      slots: planned.bracket.slots.map((s) => ({ key: s.id, kind: s.kind, groupKey: s.groupId, sourceGroupKey: null, position: s.position })),
      fixtures: planned.bracket.fixtures.map((f) => ({ key: f.id, groupKey: f.groupId, round: f.round, fixtureNumber: f.fixtureNumber, homeSlotKey: f.homeSlotId, awaySlotKey: f.awaySlotId })),
      edges: [{ sourceFixtureKey: 'sample-fixture-1', targetFixtureKey: 'sample-fixture-3', outcome: 'WINNER', targetSide: 'HOME' }, { sourceFixtureKey: 'sample-fixture-2', targetFixtureKey: 'sample-fixture-3', outcome: 'WINNER', targetSide: 'AWAY' }],
      byeSlots: [], warnings: [],
    };
  }
  if (path === `${base}/bracket/template/draft` && method === 'PUT') {
    if (body.expectedRevision !== null && body.expectedRevision !== state.bracketDraft.revision) fail('설정 초안이 바뀌었어요. 다시 열어 주세요.');
    const { expectedRevision: _revision, ...input } = body;
    state.bracketDraft = { input, revision: state.bracketDraft.revision + 1 }; return state.bracketDraft;
  }
  if (path === `${base}/slots/random-fill` && method === 'POST') {
    const teams = state.registrations.filter((r) => r.status === 'confirmed');
    if (teams.length !== 4 || state.bracket.slots.length !== 4) fail('4팀 참가 확정과 대진 생성을 먼저 진행해 주세요.');
    if (state.bracket.fixtures.some((f) => f.result)) fail('결과가 있는 대진은 다시 배정할 수 없어요.');
    state.bracket.slots.forEach((slot, index) => { slot.registrationId = teams[index].id; slot.teamName = teams[index].teamName ?? null; });
    syncSlots(state); return { assignments: state.bracket.slots.map((slot) => ({ slotId: slot.id, registrationId: slot.registrationId })) };
  }
  const slot = state.bracket.slots.find((s) => path === `/admin/tournament-slots/${s.id}/assignment`);
  if (slot && method === 'PUT') {
    if (state.bracket.fixtures.some((f) => f.result)) fail('결과가 있는 대진의 팀 배정은 변경할 수 없어요.');
    const team = state.registrations.find((r) => r.id === body.registrationId && r.status === 'confirmed');
    if (body.registrationId !== null && !team) fail('확정된 샘플 팀을 선택해 주세요.');
    if (team && state.bracket.slots.some((s) => s.id !== slot.id && s.registrationId === team.id)) fail('이미 배정된 팀이에요.');
    slot.registrationId = team?.id ?? null; slot.teamName = team?.teamName ?? null; syncSlots(state);
    return { slot, affectedTeamMatchIds: [] };
  }
  const gameFixture = state.bracket.fixtures.find((f) => path === `/admin/games/${f.game?.id}/quick-result`);
  if (gameFixture && method === 'POST') {
    if (!gameFixture.homeRegistrationId || !gameFixture.awayRegistrationId) fail('양 팀을 먼저 배정해 주세요.');
    if (gameFixture.result || body.expectedVersion !== gameFixture.game?.version) fail('경기 상태가 바뀌었어요. 다시 확인해 주세요.');
    const score = object(body.score);
    if (![score.home, score.away].every((v) => Number.isInteger(v) && Number(v) >= 0)) fail('점수를 확인해 주세요.');
    const penalties = score.penalties ? object(score.penalties) : null;
    if (score.home === score.away && (!penalties || ![penalties.home, penalties.away].every((v) => Number.isInteger(v) && Number(v) >= 0) || penalties.home === penalties.away)) fail('동점 경기는 승부차기 점수를 입력해 주세요.');
    gameFixture.result = { id: `sample-result-${gameFixture.id}`, fixtureId: gameFixture.id, homeScore: Number(score.home), awayScore: Number(score.away), hasPenalty: Boolean(penalties), homePenaltyScore: penalties ? Number(penalties.home) : null, awayPenaltyScore: penalties ? Number(penalties.away) : null, note: null, outcomeReason: 'NORMAL', recordedAt: stamp, createdAt: stamp, updatedAt: stamp, goals: [] };
    gameFixture.status = 'completed';
    gameFixture.game = { ...gameFixture.game!, state: 'ENDED', version: gameFixture.game!.version + 1, hasOfficialResult: true, latestRevision: { id: `sample-revision-${gameFixture.id}`, state: 'OFFICIAL', score: { home: Number(score.home), away: Number(score.away) }, entryMethod: 'quick' } };
    const winner = Number(score.home) > Number(score.away) || (score.home === score.away && Number(penalties?.home) > Number(penalties?.away)) ? 'home' : 'away';
    for (const target of state.bracket.fixtures) {
      for (const source of target.bracketSources ?? []) {
        if (source.fixtureId !== gameFixture.id) continue;
        const side = source.side === 'HOME' ? 'home' : 'away';
        const resultSide = source.outcome === 'WINNER' ? winner : winner === 'home' ? 'away' : 'home';
        target[`${side}RegistrationId`] = gameFixture[`${resultSide}RegistrationId`];
        target[`${side}TeamName`] = gameFixture[`${resultSide}TeamName`];
      }
    }
    return { gameId: gameFixture.game.id, version: gameFixture.game.version, revisionId: gameFixture.game.latestRevision!.id, score };
  }
  const fixture = state.bracket.fixtures.find((f) => path === `/admin/fixtures/${f.id}`);
  if (fixture && method === 'PATCH') {
    if (fixture.result) fail('결과가 있는 경기는 수정할 수 없어요.');
    const allowed = ['fixtureNumber', 'scheduledAt', 'venue', 'venueAddress', 'latitude', 'longitude', 'venueProvider', 'venueProviderId', 'fieldId', 'homeDisplayLabel', 'awayDisplayLabel'];
    if (Object.keys(body).some((key) => !allowed.includes(key))) fail('이 경기 설정은 체험에서 변경할 수 없어요. 팀 배정은 팀 자리에서 진행해 주세요.');
    for (const key of ['fixtureNumber', 'scheduledAt', 'venue', 'fieldId', 'homeDisplayLabel', 'awayDisplayLabel']) {
      if (Object.hasOwn(body, key)) Object.assign(fixture, { [key]: body[key] });
    }
    if (Object.hasOwn(body, 'venue')) fixture.place = {
      name: String(body.venue ?? ''), address: typeof body.venueAddress === 'string' ? body.venueAddress : null,
      latitude: typeof body.latitude === 'number' ? body.latitude : null, longitude: typeof body.longitude === 'number' ? body.longitude : null,
      provider: body.venueProvider === 'kakao' ? 'kakao' : null, providerPlaceId: typeof body.venueProviderId === 'string' ? body.venueProviderId : null,
    };
    return fixture;
  }
  if (fixture && method === 'DELETE') {
    if (fixture.result || state.bracket.fixtures.some((f) => f.result && f.bracketSources?.some((s) => s.fixtureId === fixture.id))) fail('결과가 있는 경기와 진출 연결은 삭제할 수 없어요.');
    state.bracket.fixtures = state.bracket.fixtures.filter((f) => f.id !== fixture.id);
    for (const f of state.bracket.fixtures) f.bracketSources = f.bracketSources?.filter((s) => s.fixtureId !== fixture.id);
    return { deleted: true };
  }
  if ((path === `${base}/publish-bracket` || path === `${base}/unpublish-bracket`) && method === 'POST') {
    if (path.endsWith('/publish-bracket') && !state.bracket.fixtures.length) fail('대진을 먼저 만들어 주세요.');
    state.tournament.bracketPublishedAt = path.endsWith('/publish-bracket') && !body.scheduledAt ? stamp : null;
    state.tournament.bracketPublishScheduledAt = typeof body.scheduledAt === 'string' ? body.scheduledAt : null;
    return { bracketPublishedAt: state.tournament.bracketPublishedAt, bracketPublishScheduledAt: state.tournament.bracketPublishScheduledAt };
  }
  for (const key of ['awards', 'award-sets'] as const) {
    if (path === `${base}/${key}` && method === 'PUT') {
      const rows = body[key === 'awards' ? 'awards' : 'awardSets'];
      if (!Array.isArray(rows)) fail('시상 내용을 확인해 주세요.');
      state.collections[key] = rows.map((r, i) => ({ ...object(r), id: `sample-${key}-${i + 1}` }));
      return state.collections[key];
    }
  }
  for (const key of ['announcements', 'sponsors'] as const) {
    if (path === `${base}/${key}` && method === 'POST') {
      const row = { ...body, id: nextId(`sample-${key}`, state.collections[key]), tournamentId: ADMIN_DEMO_ID, status: 'draft', active: true, createdAt: stamp, updatedAt: stamp, publishedAt: null };
      state.collections[key].push(row); return row;
    }
    const row = state.collections[key].find((r) => path === `${base}/${key}/${r.id}` || path === `/admin/${key}/${r.id}` || path === `/admin/${key}/${r.id}/publish`);
    if (row && method === 'PATCH') {
      Object.assign(row, body, path.endsWith('/publish') ? { status: 'published', publishedAt: stamp } : {}); return row;
    }
    if (row && method === 'DELETE') { state.collections[key] = state.collections[key].filter((r) => r.id !== row.id); return { deleted: true }; }
  }
  if (path === '/admin/popups' && method === 'POST') {
    const row = { ...body, id: nextId('sample-popup', state.collections.popups), createdAt: stamp, updatedAt: stamp, viewCount: 0, clickCount: 0 };
    state.collections.popups.push(row); return row;
  }
  const popup = state.collections.popups.find((row) => path === `/admin/popups/${row.id}`);
  if (popup && method === 'PATCH') { Object.assign(popup, body); return popup; }
  if (popup && method === 'DELETE') { state.collections.popups = state.collections.popups.filter((row) => row.id !== popup.id); return { deleted: true }; }
  if (path === `/tournament-ops/tournaments/${ADMIN_DEMO_ID}/fields` && method === 'POST') {
    if (typeof body.name !== 'string' || !body.name.trim()) fail('경기장 이름을 입력해 주세요.');
    const field = { ...body, id: nextId('sample-field', state.collections.fields), scopeKey: 'sample', active: true, sortOrder: state.collections.fields.length, tournamentId: ADMIN_DEMO_ID, createdAt: stamp, updatedAt: stamp };
    state.collections.fields.push(field); return field;
  }
  if (path === `/tournament-ops/tournaments/${ADMIN_DEMO_ID}/staff` && method === 'POST') {
    if (body.userId !== 'sample-staff-1') fail('샘플 담당자만 배정할 수 있어요.');
    if (!['TOURNAMENT_DIRECTOR', 'FIELD_OPERATOR', 'SUPPORT_READONLY'].includes(String(body.role))) fail('배정할 역할을 확인해 주세요.');
    if (body.role === 'FIELD_OPERATOR' && !state.collections.fields.some((field) => field.id === body.fieldId)) fail('샘플 경기장을 먼저 등록하고 선택해 주세요.');
    const assignment = { ...body, id: `sample-staff-assignment-${state.collections.staff.length + 1}`, tournamentId: ADMIN_DEMO_ID, version: 1, nickname: '샘플 기록 담당자', grantedByUserId: 'sample-operator', revokedAt: null, expiresAt: body.expiresAt ?? null, fixtureIds: body.fixtureIds ?? [], fieldId: body.fieldId ?? null, createdAt: stamp };
    state.collections.staff.push(assignment); return assignment;
  }
  const assignment = state.collections.staff.find((row) => path === `/tournament-ops/tournaments/${ADMIN_DEMO_ID}/staff/${row.id}/revoke`);
  if (assignment && method === 'POST') {
    if (body.expectedVersion !== assignment.version) fail('배정 상태가 바뀌었어요. 다시 확인해 주세요.');
    assignment.revokedAt = stamp; assignment.version = Number(assignment.version) + 1; return assignment;
  }
  return fail('이 작업은 아직 체험에서 지원하지 않아요. 실제 데이터는 변경하지 않았어요.');
}

function buildBracket(state: AdminDemoState) {
  state.periods.matches = {};
  state.bracket = {
    groups: [{ id: 'sample-knockout', tournamentId: ADMIN_DEMO_ID, name: '토너먼트', phase: 'knockout', sortOrder: 0, advanceCount: null, createdAt: stamp, updatedAt: stamp, groupTeams: [] }],
    slots: Array.from({ length: 4 }, (_, i) => ({ id: `sample-slot-${i + 1}`, kind: 'ENTRY', groupId: 'sample-knockout', sourceGroupId: null, position: i + 1, label: `${i + 1}번 자리`, registrationId: null, teamName: null })),
    fixtures: Array.from({ length: 3 }, (_, i) => ({
      id: `sample-fixture-${i + 1}`, tournamentId: ADMIN_DEMO_ID, groupId: 'sample-knockout', round: i < 2 ? 'semi' : 'final', fixtureNumber: i + 1, legNumber: 1, parentFixtureId: null,
      homeRegistrationId: null, awayRegistrationId: null, homeTeamName: '미배정', awayTeamName: '미배정', scheduledAt: null, venue: state.tournament.venue,
      status: 'scheduled', createdAt: stamp, updatedAt: stamp, result: null, videos: [],
      homeSlotId: i < 2 ? `sample-slot-${i * 2 + 1}` : null, awaySlotId: i < 2 ? `sample-slot-${i * 2 + 2}` : null,
      bracketSources: i === 2 ? [{ fixtureId: 'sample-fixture-1', outcome: 'WINNER', side: 'HOME' }, { fixtureId: 'sample-fixture-2', outcome: 'WINNER', side: 'AWAY' }] : [],
      game: { id: `sample-game-${i + 1}`, state: 'SCHEDULED', version: 1, hasLiveRecords: false, hasOfficialResult: false, latestRevision: null },
    })), standings: [],
  };
}
function syncSlots(state: AdminDemoState) {
  for (const f of state.bracket.fixtures) for (const side of ['home', 'away'] as const) {
    const slot = state.bracket.slots.find((s) => s.id === f[`${side}SlotId`]);
    if (slot) { f[`${side}RegistrationId`] = slot.registrationId; f[`${side}TeamName`] = slot.teamName ?? '미배정'; }
  }
}
function periodRows(minutes: number[]) {
  return minutes.map((durationMinutes, i) => ({ code: `sample-period-${i + 1}`, label: minutes.length === 2 ? ['전반', '후반'][i] : `${i + 1}피리어드`, durationMinutes, extraTime: false }));
}
function nextId(prefix: string, rows: Row[]) {
  return `${prefix}-${Math.max(0, ...rows.map((row) => Number(String(row.id).split('-').at(-1)) || 0)) + 1}`;
}

/** No network fallback, even for unknown paths. The caller commits persistence before publishing state. */
export function createAdminDemoSource(request: (method: string, path: string, body?: unknown) => unknown): V1DataSource {
  const send = async <T,>(method: string, path: string, body?: unknown): Promise<T> => request(method, path, body) as T;
  return {
    v1Get: <T,>(path: string, query?: Parameters<V1DataSource['v1Get']>[1]) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null) params.set(key, String(value));
      return send<T>('GET', params.size ? `${path}${path.includes('?') ? '&' : '?'}${params}` : path);
    },
    v1Post: <T,>(path: string, body?: unknown) => send<T>('POST', path, body),
    v1Put: <T,>(path: string, body?: unknown) => send<T>('PUT', path, body),
    v1Patch: <T,>(path: string, body?: unknown) => send<T>('PATCH', path, body),
    v1Delete: <T,>(path: string, body?: unknown) => send<T>('DELETE', path, body),
    v1Api: <T,>(path: string, init: RequestInit = {}) => send<T>(String(init.method ?? 'GET').toUpperCase(), path, typeof init.body === 'string' ? JSON.parse(init.body) : undefined),
    v1MultipartPost: async () => fail('체험에서는 파일 업로드를 지원하지 않아요. 실제 서버에는 업로드하지 않았어요.'),
  };
}
