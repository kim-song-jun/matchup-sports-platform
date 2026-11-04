import { http, HttpResponse } from 'msw';
import type { MultiFinalDefinition, MultiFinalPreview } from '@/hooks/use-multi-finals';
import type { V1AdminTournamentAwardSet, V1TournamentFixture, V1TournamentGroup } from '@/types/api';
import { NAMED_FINALS_ID, namedFinalPublicDetail, namedFinalView } from './named-finals-fixtures';

const api = '*/api/v1';
type Actor = 'ops' | 'support' | 'member' | 'guest';
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
const fail = (statusCode: number, code: string, message: string) => HttpResponse.json({ status: 'error', statusCode, code, message }, { status: statusCode });
const invalid = () => fail(422, 'MULTI_FINAL_INVALID', '설정과 확정 참가팀을 확인해 주세요.');
const stale = () => fail(409, 'MULTI_FINAL_STALE', '설정이 바뀌었어요. 다시 불러와 주세요.');
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
async function body(request: Request) { try { return await request.json() as unknown; } catch { return null; } }

/** Stateful sample of a configured competition. Never intercepts unknown fixture IDs. */
export function createNamedFinalsMsw(actor: Actor = 'ops') {
  let view = namedFinalView(); let detail = namedFinalPublicDetail(); let awardSets: V1AdminTournamentAwardSet[] = [];
  const replays = new Map<string, { hash: string; revision: number }>();
  const preliminaryGroups = (): V1TournamentGroup[] => view.groups.map((group, i) => ({ id: group.id, name: group.name, phase: 'group',
    sortOrder: i, advanceCount: null, bracketTrack: 'overall', groupTeams: view.registrations.slice(i * 2, i * 2 + 2).map((reg, j) => ({ id: `group-team-${i}-${j}`, registrationId: reg.id, teamId: reg.team.id, teamName: reg.team.name, teamLogoUrl: null, sortOrder: j })), standings: [], qualification: null }));
  function reset() {
    view = namedFinalView(); detail = namedFinalPublicDetail(); detail.groups = preliminaryGroups();
    detail.fixtures = view.groups.map((group, i) => {
      const [home, away] = view.registrations.slice(i * 2, i * 2 + 2);
      return { id: `pre-fixture-${i}`, groupId: group.id, round: 'league_r1', fixtureNumber: i + 1, legNumber: 1, scheduledAt: null, venue: null,
        status: 'scheduled', liveStatus: 'scheduled', homeRegistrationId: home.id, awayRegistrationId: away.id, homeTeamId: home.team.id, awayTeamId: away.team.id,
        homeTeamName: home.team.name, awayTeamName: away.team.name, homeTeamLogoUrl: null, awayTeamLogoUrl: null, homeSlotLabel: null, awaySlotLabel: null, result: null, videos: [] };
    });
    awardSets = []; detail.awardSets = []; replays.clear();
  }
  reset();
  function auth(mutation: boolean) {
    if (actor === 'guest') return fail(401, 'UNAUTHENTICATED', '로그인이 필요해요.');
    if (actor === 'member' || mutation && actor === 'support') return fail(403, 'PERMISSION_DENIED', '관리자 권한을 확인해 주세요.');
    return null;
  }
  function parseFinals(value: unknown): MultiFinalDefinition[] | null {
    if (!Array.isArray(value) || !value.length) return null;
    const names = new Set<string>(), rules = new Set<string>(), teams = new Set<string>();
    const finals: MultiFinalDefinition[] = [];
    for (const f of value) {
      if (!record(f) || Object.keys(f).some(key => !['name', 'rules', 'thirdPlace', 'registrationIds'].includes(key))
        || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 80 || typeof f.thirdPlace !== 'boolean'
        || ['overall', 'upper', 'lower'].includes(f.name.trim()) || names.has(f.name.trim()) || !Array.isArray(f.rules)) return null;
      names.add(f.name.trim());
      const parsedRules: MultiFinalDefinition['rules'] = [];
      for (const r of f.rules) {
        if (!record(r) || typeof r.groupId !== 'string' || typeof r.rank !== 'number' || !Number.isInteger(r.rank)
          || r.rank < 1 || r.rank > (view.groups.find(group => group.id === r.groupId)?.capacity ?? 0)
          || Object.keys(r).some(key => !['groupId', 'rank'].includes(key))) return null;
        const key = JSON.stringify([r.groupId, r.rank]); if (rules.has(key)) return null; rules.add(key);
        parsedRules.push({ groupId: r.groupId, rank: r.rank });
      }
      if (f.registrationIds != null && (!Array.isArray(f.registrationIds) || f.registrationIds.some(id => typeof id !== 'string' || !view.registrations.some(reg => reg.id === id)))) return null;
      const ids = f.registrationIds as string[] | null | undefined;
      for (const id of ids ?? []) { if (teams.has(id)) return null; teams.add(id); }
      finals.push({ name: f.name.trim(), rules: parsedRules, thirdPlace: f.thirdPlace, registrationIds: ids });
    }
    return finals;
  }
  // The fixture has no official preliminary results. Manual selections remain
  // available; it never invents resolved ranks or successful result confirmation.
  function preview(): MultiFinalPreview | Response {
    const finals = view.finals.map(f => ({ ...f, registrationIds: f.registrationIds ?? (f.unresolved.length ? null : f.suggestedRegistrationIds) }));
    const capacity = (f: MultiFinalDefinition) => f.registrationIds?.length ?? f.rules.length;
    if (finals.some(f => capacity(f) < 2 || f.thirdPlace && capacity(f) < 4)) return invalid();
    const plan: NonNullable<MultiFinalPreview['plan']> & { groups: Array<{ key: string; name: string; bracketTrack: string; phase: string }> } = { groups: [], slots: [], fixtures: [], edges: [] };
    let number = detail.fixtures.filter(f => f.groupId?.startsWith('group-')).length, byes = 0;
    for (const [index, final] of finals.entries()) {
      const size = capacity(final); const width = 2 ** Math.ceil(Math.log2(size)); byes += width - size;
      let seeds = [1, 2]; while (seeds.length < width) { const sum = seeds.length * 2 + 1; seeds = seeds.flatMap(seed => [seed, sum - seed]); }
      type Origin = { slot: string } | { fixture: string } | null;
      let origins: Origin[] = seeds.map(seed => seed > size ? null : { slot: `seed:${index}:${seed}` });
      plan.slots.push(...Array.from({ length: size }, (_, i) => ({ key: `seed:${index}:${i + 1}`, groupKey: `final:${index}:${width}`, position: i + 1 })));
      for (let size = width; size >= 2; size /= 2) {
        const key = `final:${index}:${size}`; const phase = size === 2 ? 'final' : 'semi';
        plan.groups.push({ key, name: `${final.name} · ${size === 2 ? '결승' : `${size}강`}`, bracketTrack: final.name, phase });
        const next: Origin[] = [];
        for (let pair = 0; pair < origins.length / 2; pair++) {
          const home = origins[pair * 2], away = origins[pair * 2 + 1];
          if (!home || !away) { next.push(home ?? away); continue; }
          const fixtureKey = `fixture:${++number}`;
          plan.fixtures.push({ key: fixtureKey, groupKey: key, fixtureNumber: number, homeSlotKey: 'slot' in home ? home.slot : null, awaySlotKey: 'slot' in away ? away.slot : null });
          for (const [origin, targetSide] of [[home, 'HOME'], [away, 'AWAY']] as const) if ('fixture' in origin) plan.edges.push({ sourceFixtureKey: origin.fixture, targetFixtureKey: fixtureKey, outcome: 'WINNER', targetSide });
          next.push({ fixture: fixtureKey });
        }
        origins = next;
      }
      if (final.thirdPlace) {
        const key = `third:${index}`; const fixtureKey = `fixture:${++number}`;
        plan.groups.push({ key, name: `${final.name} · 3·4위전`, bracketTrack: final.name, phase: 'third_place' });
        plan.fixtures.push({ key: fixtureKey, groupKey: key, fixtureNumber: number, homeSlotKey: null, awaySlotKey: null });
        plan.fixtures.filter(f => f.groupKey === `final:${index}:4`).forEach((f, i) => plan.edges.push({ sourceFixtureKey: f.key, targetFixtureKey: fixtureKey, outcome: 'LOSER', targetSide: i === 0 ? 'HOME' : 'AWAY' }));
      }
    }
    return { revision: view.revision, previewHash: `mock-revision-${view.revision}`, finals: structuredClone(finals), plan, counts: { tournaments: view.finals.length, fixtures: plan.fixtures.length, byes } };
  }
  const prefix = `${api}/admin/tournaments/${NAMED_FINALS_ID}`;
  const path = `${prefix}/bracket/multi-finals`;
  const handlers = [
    http.get(`${api}/tournaments/${NAMED_FINALS_ID}`, () => ok(detail)),
    http.get(`${prefix}/award-sets`, () => auth(false) ?? ok(awardSets)),
    http.put(`${prefix}/award-sets`, async ({ request }) => {
      const denied = auth(true); if (denied) return denied;
      const input = await body(request);
      if (!record(input) || Object.keys(input).some(key => key !== 'awardSets') || !Array.isArray(input.awardSets)) return fail(400, 'VALIDATION_ERROR', '입력값을 확인해 주세요.');
      const tracks = new Set<string>(); const next: V1AdminTournamentAwardSet[] = [];
      for (const row of input.awardSets) {
        if (!record(row) || typeof row.bracketTrack !== 'string' || !view.finals.some(f => f.name === row.bracketTrack)) return fail(400, 'AWARD_TRACK_UNSUPPORTED', '설정된 토너먼트 시상 범위를 선택해 주세요.');
        if (tracks.has(row.bracketTrack)) return fail(400, 'DUPLICATE_AWARD_TRACK', '시상 범위를 중복 설정할 수 없어요.');
        if (Object.keys(row).some(key => !['bracketTrack', 'prizePool', 'prizeSummary', 'prizeBreakdown'].includes(key))
          || row.prizePool != null && (typeof row.prizePool !== 'number' || !Number.isInteger(row.prizePool) || row.prizePool < 0 || row.prizePool > 2147483647)
          || ['prizeSummary', 'prizeBreakdown'].some(key => row[key] != null && (typeof row[key] !== 'string' || String(row[key]).length > 500))) return fail(400, 'VALIDATION_ERROR', '입력값을 확인해 주세요.');
        tracks.add(row.bracketTrack); next.push({ id: `award-set-${next.length}`, bracketTrack: row.bracketTrack, prizePool: row.prizePool as number ?? null, prizeSummary: row.prizeSummary as string ?? null, prizeBreakdown: row.prizeBreakdown as string ?? null });
      }
      awardSets = next; detail.awardSets = next.map(({ id: _id, ...row }) => row); return ok(awardSets);
    }),
    http.get(path, () => auth(false) ?? ok(view)),
    http.post(`${path}/setup`, () => auth(true) ?? fail(409, 'BRACKET_NOT_EMPTY', '예선 대진이 이미 있어요.')),
    http.put(`${path}/selection`, async ({ request }) => {
      const denied = auth(true); if (denied) return denied;
      const input = await body(request); if (!record(input) || Object.keys(input).some(key => !['expectedRevision', 'finals'].includes(key))) return invalid();
      if (input.expectedRevision !== view.revision) return stale();
      const finals = parseFinals(input.finals); if (!finals) return invalid();
      if (awardSets.some(row => !finals.some(f => f.name === row.bracketTrack))) return fail(409, 'BRACKET_TRACK_AWARDS_REQUIRE_RESCOPING', '시상 범위를 먼저 정리해 주세요.');
      const sameStructure = finals.length === view.finals.length && finals.every((final, i) => {
        const previous = view.finals[i];
        return final.name === previous.name && final.thirdPlace === previous.thirdPlace
          && (final.registrationIds?.length ?? final.rules.length) === (previous.registrationIds?.length ?? previous.rules.length);
      });
      view = { ...view, revision: view.revision + 1, generated: sameStructure && view.generated, finals: finals.map(f => ({ ...f, manual: f.registrationIds != null, suggestedRegistrationIds: [], unresolved: f.rules.map(rule => ({ ...rule, state: 'group_incomplete', tiedRegistrationIds: [] })) })) };
      if (!sameStructure) { detail.groups = preliminaryGroups(); detail.fixtures = detail.fixtures.filter(f => f.groupId?.startsWith('group-')); }
      return ok(view);
    }),
    http.post(`${path}/preview`, () => { const denied = auth(true); if (denied) return denied; const value = preview(); return value instanceof Response ? value : ok(value); }),
    http.post(`${path}/generate`, async ({ request }) => {
      const denied = auth(true); if (denied) return denied;
      const input = await body(request); if (!record(input) || typeof input.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.requestId) || Object.keys(input).some(key => !['expectedRevision', 'previewHash', 'requestId'].includes(key))) return fail(400, 'VALIDATION_ERROR', '입력값을 확인해 주세요.');
      const prior = replays.get(input.requestId); if (prior) return prior.hash === input.previewHash ? ok({ revision: prior.revision, replayed: true }) : stale();
      const value = preview(); if (value instanceof Response) return value;
      if (input.expectedRevision !== value.revision || input.previewHash !== value.previewHash) return stale();
      view = { ...view, generated: true, revision: view.revision + 1 };
      const plan = value.plan!;
      detail.groups = [...preliminaryGroups(), ...plan.groups.map((group, i) => ({ id: group.key, name: group.name, bracketTrack: group.bracketTrack, phase: group.key.startsWith('third:') ? 'third_place' : group.key.endsWith(':2') ? 'final' : 'semi', sortOrder: i, advanceCount: null, groupTeams: [], standings: [], qualification: null }))];
      detail.fixtures = [...detail.fixtures.filter(f => f.groupId?.startsWith('group-')), ...plan.fixtures.map((fixture): V1TournamentFixture => {
        const group = plan.groups.find(g => g.key === fixture.groupKey)!;
        const final = view.finals.find(f => f.name === group.bracketTrack)!;
        const team = (slotKey: string | null) => { const slot = plan.slots.find(s => s.key === slotKey); return view.registrations.find(r => r.id === final.registrationIds?.[(slot?.position ?? 0) - 1]); };
        const home = team(fixture.homeSlotKey), away = team(fixture.awaySlotKey);
        const previous = detail.fixtures.find(row => row.id === fixture.key);
        return { id: fixture.key, groupId: group.key, round: group.name, fixtureNumber: fixture.fixtureNumber, legNumber: 1, scheduledAt: previous?.scheduledAt ?? null, venue: previous?.venue ?? null, status: 'scheduled', liveStatus: 'scheduled', homeRegistrationId: home?.id ?? null, awayRegistrationId: away?.id ?? null, homeTeamId: home?.team.id ?? null, awayTeamId: away?.team.id ?? null, homeTeamName: home?.team.name ?? 'TBD', awayTeamName: away?.team.name ?? 'TBD', homeTeamLogoUrl: null, awayTeamLogoUrl: null, homeSlotLabel: null, awaySlotLabel: null, result: null, videos: [] };
      })];
      replays.set(input.requestId, { hash: value.previewHash, revision: view.revision }); return ok({ revision: view.revision, counts: value.counts, replayed: false });
    }),
  ];
  return { handlers, reset };
}
export const namedFinalsMsw = createNamedFinalsMsw();
