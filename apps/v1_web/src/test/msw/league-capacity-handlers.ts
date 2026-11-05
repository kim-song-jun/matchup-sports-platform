import { http, HttpResponse } from 'msw';
import { randomUuid } from '@/lib/uuid';
import type { V1CreateLeaguePayload } from '@/types/league-match';
import type { UpdateLeagueSettings } from '@/types/league-settings';
import {
  createCapacityLeagueRow, createLeagueCapacityFixtures, LEAGUE_CAPACITY_MSW,
  leagueCapacityAdminDetail, leagueCapacityCounts, leagueCapacityPublicDetail, leagueRegistrationWindowOpen,
} from './league-capacity-fixtures';

const api = '*/api/v1';
type Actor = 'owner' | 'ops' | 'support' | 'member' | 'guest';
type SettingsPatch = Omit<UpdateLeagueSettings, 'plannedFixtureCount'> & { plannedFixtureCount?: number | null };
const createFields = [
  'title', 'sportId', 'regionId', 'startsOn', 'endsOn', 'teamIds', 'minPlayers', 'maxPlayers', 'maxTeams', 'plannedFixtureCount',
  'registrationDeadlineAt', 'entryFee', 'bankName', 'bankAccount', 'bankHolder',
] as const;
const BANK_FIELD = /^[^\u0000-\u001f\u007f]+$/;
const settingsFields = ['expectedUpdatedAt', 'title', 'rulesText', 'regionId', 'startsOn', 'endsOn', 'registrationDeadlineAt', 'plannedFixtureCount', 'maxTeams'] as const;

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
}
function fail(statusCode: number, code: string, message: string) {
  return HttpResponse.json({ status: 'error', statusCode, code, message, details: null, timestamp: new Date().toISOString() }, { status: statusCode });
}
const invalid = () => fail(400, 'VALIDATION_ERROR', '입력값을 확인해 주세요.');
const missing = () => fail(404, 'LEAGUE_NOT_FOUND', '리그를 찾을 수 없어요.');
function authorize(actor: Actor, mutation: boolean) {
  switch (actor) {
    case 'guest': return fail(401, 'UNAUTHENTICATED', '로그인이 필요해요.');
    case 'member': return fail(403, 'PERMISSION_DENIED', '관리자 권한이 필요해요.');
    case 'support': return mutation ? fail(403, 'PERMISSION_DENIED', '조회 전용 관리자는 수정할 수 없어요.') : null;
    case 'owner': case 'ops': return null;
    default: { const unexpected: never = actor; throw new RangeError(`Unknown fixture actor: ${unexpected}`); }
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function isUuidList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => isUuid(item) && item.charAt(14) === '4');
}
function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value));
}
function isInteger(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= maximum;
}
function isOptionalInteger(value: unknown, maximum: number): value is number | null | undefined {
  return value === null || value === undefined || isInteger(value, maximum);
}
/** 서버 DTO 와 같다 — 앞뒤 공백을 뺀 1~60자, 제어 문자 없음. 안 보내면 undefined. */
function optionalBankField(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 60 && BANK_FIELD.test(trimmed) ? trimmed : null;
}
async function readBody(request: Request): Promise<unknown> {
  try { return await request.json(); }
  catch (error) { if (error instanceof SyntaxError) return null; throw error; }
}
function parseCreate(value: unknown): V1CreateLeaguePayload | null {
  if (!isRecord(value) || Object.keys(value).some(key => !createFields.some(field => field === key))) return null;
  const { title, sportId, regionId, startsOn, endsOn, teamIds, minPlayers, maxPlayers, maxTeams, plannedFixtureCount, registrationDeadlineAt, entryFee } = value;
  const bankName = optionalBankField(value.bankName);
  const bankAccount = optionalBankField(value.bankAccount);
  const bankHolder = optionalBankField(value.bankHolder);
  if (typeof title !== 'string' || title.length > 100 || !isUuid(sportId)
    || typeof regionId !== 'string' || regionId.length === 0 || regionId.length > 100
    || !isDateString(startsOn) || !isDateString(endsOn) || !isUuidList(teamIds)
    || (minPlayers !== undefined && !isInteger(minPlayers, 50))
    || !isOptionalInteger(maxPlayers, 50) || !isOptionalInteger(maxTeams, 2147483647)
    || (plannedFixtureCount !== undefined && !isInteger(plannedFixtureCount, 500))
    || !(registrationDeadlineAt === undefined || registrationDeadlineAt === null || isDateString(registrationDeadlineAt))
    // 서버는 원본 JSON 값으로 검사한다 — '0'·null·false 를 0원(무료 확정)으로 바꾸지 않는다.
    || !(entryFee === undefined || (typeof entryFee === 'number' && Number.isInteger(entryFee) && entryFee >= 0 && entryFee <= 100_000_000))
    || bankName === null || bankAccount === null || bankHolder === null) return null;
  return { title, sportId, regionId, startsOn, endsOn, teamIds,
    ...(minPlayers !== undefined ? { minPlayers } : {}), ...(maxPlayers !== undefined ? { maxPlayers } : {}),
    ...(maxTeams !== undefined ? { maxTeams } : {}), ...(plannedFixtureCount !== undefined ? { plannedFixtureCount } : {}),
    ...(registrationDeadlineAt !== undefined ? { registrationDeadlineAt } : {}), ...(entryFee !== undefined ? { entryFee } : {}),
    ...(bankName !== undefined ? { bankName } : {}), ...(bankAccount !== undefined ? { bankAccount } : {}),
    ...(bankHolder !== undefined ? { bankHolder } : {}) };
}
function parseSettings(value: unknown): SettingsPatch | null {
  if (!isRecord(value) || Object.keys(value).some(key => !settingsFields.some(field => field === key))) return null;
  const { expectedUpdatedAt, title, rulesText, regionId, startsOn, endsOn, registrationDeadlineAt, plannedFixtureCount, maxTeams } = value;
  if (!isDateString(expectedUpdatedAt) || typeof title !== 'string' || title.trim().length === 0 || title.trim().length > 100
    || typeof rulesText !== 'string' || rulesText.length > 10000 || typeof regionId !== 'string' || regionId.length === 0 || regionId.length > 100
    || !isDateString(startsOn) || !isDateString(endsOn) || !(registrationDeadlineAt === null || isDateString(registrationDeadlineAt))
    || !isOptionalInteger(plannedFixtureCount, 500) || !isOptionalInteger(maxTeams, 2147483647)) return null;
  return { expectedUpdatedAt, title: title.trim(), rulesText, regionId, startsOn, endsOn, registrationDeadlineAt,
    ...(plannedFixtureCount !== undefined ? { plannedFixtureCount } : {}), ...(maxTeams !== undefined ? { maxTeams } : {}) };
}

/** The shared harness starts as an authenticated ops admin; other actors exercise the same auth gates. */
export function createV1LeagueCapacityMswHandlers(actor: Actor = 'ops') {
  const rows = createLeagueCapacityFixtures();
  const admin = `${api}/admin/league-matches`;
  return [
    http.post(admin, async ({ request }) => {
      const denied = authorize(actor, true);
      if (denied) return denied;
      const body = parseCreate(await readBody(request));
      if (!body) return invalid();
      if (Date.parse(body.endsOn) < Date.parse(body.startsOn)) return fail(422, 'LEAGUE_PERIOD_INVALID', '종료일은 시작일보다 빠를 수 없어요.');
      if (body.maxPlayers !== undefined && body.maxPlayers !== null && body.maxPlayers < (body.minPlayers ?? 1)) {
        return fail(422, 'LEAGUE_ROSTER_RANGE_INVALID', '팀 명단 최대 인원은 최소 인원 이상이어야 해요.');
      }
      // 팀은 비워 두고 참가 신청으로 모아도 된다(2026-10-27) — 넣은 팀만 종목·활성을 검사한다.
      const teamIds = [...new Set(body.teamIds)];
      const knownTeamIds: readonly string[] = LEAGUE_CAPACITY_MSW.teamIds;
      if (body.sportId !== LEAGUE_CAPACITY_MSW.sportId || teamIds.some(id => !knownTeamIds.includes(id))) {
        return fail(422, 'LEAGUE_TEAM_INVALID', '리그 종목과 일치하는 활성 팀만 등록할 수 있어요.');
      }
      if (body.registrationDeadlineAt && Date.parse(body.registrationDeadlineAt) <= Date.now()) {
        return fail(422, 'LEAGUE_REGISTRATION_DEADLINE_PAST', '신청 마감은 지금보다 뒤여야 해요.');
      }
      if (body.entryFee !== undefined && body.entryFee > 0 && (!body.bankName || !body.bankAccount || !body.bankHolder)) {
        return fail(422, 'LEAGUE_PAYMENT_INSTRUCTIONS_REQUIRED', '유료 리그는 은행명, 계좌번호, 예금주를 모두 입력해야 해요.');
      }
      if (body.regionId !== LEAGUE_CAPACITY_MSW.regionId) return fail(422, 'LEAGUE_REGION_INVALID', '활성화된 시·군·구 지역을 선택해 주세요.');
      if (body.maxTeams !== null && body.maxTeams !== undefined && teamIds.length > body.maxTeams) {
        return fail(409, 'TOURNAMENT_CAPACITY_FULL', '참가팀 정원이 가득 찼어요.');
      }
      const row = createCapacityLeagueRow({ ...body, leagueId: randomUuid() });
      rows.set(row.detail.leagueId, row);
      return ok({ leagueId: row.detail.leagueId, title: row.detail.title, state: row.detail.state });
    }),
    http.get(`${admin}/:leagueId/settings`, ({ params }) => {
      const denied = authorize(actor, false);
      if (denied) return denied;
      if (!isUuid(params.leagueId)) return fail(400, 'LEAGUE_ID_INVALID', '올바르지 않은 리그 ID예요.');
      const row = rows.get(params.leagueId);
      return row ? ok(row.settings) : missing();
    }),
    http.patch(`${admin}/:leagueId/settings`, async ({ params, request }) => {
      const denied = authorize(actor, true);
      if (denied) return denied;
      if (!isUuid(params.leagueId)) return fail(400, 'LEAGUE_ID_INVALID', '올바르지 않은 리그 ID예요.');
      const body = parseSettings(await readBody(request));
      if (!body) return invalid();
      const row = rows.get(params.leagueId);
      if (!row) return missing();
      const current = row.settings;
      if (Date.parse(body.expectedUpdatedAt) !== Date.parse(current.updatedAt)) return fail(409, 'LEAGUE_SETTINGS_STALE', '최신 정보를 다시 불러와 주세요.');
      if (current.status === 'completed' || current.status === 'cancelled') return fail(409, 'LEAGUE_ENDED', '끝났거나 취소된 리그는 수정할 수 없어요.');
      const counts = leagueCapacityCounts(row);
      if (body.maxTeams !== null && body.maxTeams !== undefined && body.maxTeams < counts.confirmedCount + counts.pendingPaymentCount) {
        return fail(409, 'LEAGUE_CAPACITY_BELOW_OCCUPANCY', '참가팀 정원은 확정·입금대기 팀 수보다 작게 설정할 수 없어요.');
      }
      if (Date.parse(body.endsOn) < Date.parse(body.startsOn)) return fail(422, 'LEAGUE_PERIOD_INVALID', '종료일은 시작일보다 빠를 수 없어요.');
      if (body.regionId !== LEAGUE_CAPACITY_MSW.regionId) return fail(422, 'LEAGUE_REGION_INVALID', '활성화된 시·군·구 지역을 선택해 주세요.');
      const deadline = body.registrationDeadlineAt === null ? null : new Date(body.registrationDeadlineAt).toISOString();
      if (deadline !== current.registrationDeadlineAt && deadline !== null && Date.parse(deadline) <= Date.now()) {
        return fail(422, 'LEAGUE_REGISTRATION_DEADLINE_PAST', '새 신청 마감은 현재보다 뒤여야 해요.');
      }
      const { expectedUpdatedAt: _expectedUpdatedAt, ...changes } = body;
      row.settings = { ...current, ...changes, rulesText: body.rulesText.trim(),
        startsOn: new Date(body.startsOn).toISOString(), endsOn: new Date(body.endsOn).toISOString(), registrationDeadlineAt: deadline,
        updatedAt: new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString() };
      row.detail = { ...row.detail, title: row.settings.title, maxTeams: row.settings.maxTeams,
        startsOn: row.settings.startsOn, plannedFixtureCount: row.settings.plannedFixtureCount,
        registrationDeadlineAt: row.settings.registrationDeadlineAt,
        registrationOpen: leagueRegistrationWindowOpen(row.settings.status, row.settings.registrationDeadlineAt) };
      return ok(row.settings);
    }),
    http.get(`${admin}/:leagueId`, ({ params }) => {
      if (params.leagueId === 'league-visibility-fixture') return undefined;
      const denied = authorize(actor, false);
      if (denied) return denied;
      if (!isUuid(params.leagueId)) return fail(400, 'LEAGUE_ID_INVALID', '올바르지 않은 리그 ID예요.');
      const row = rows.get(params.leagueId);
      return row ? ok(leagueCapacityAdminDetail(row)) : missing();
    }),
    http.get(`${api}/league-matches/:leagueId`, ({ params }) => {
      if (params.leagueId === 'league-visibility-fixture') return undefined;
      if (!isUuid(params.leagueId)) return fail(400, 'LEAGUE_ID_INVALID', '올바르지 않은 리그 ID예요.');
      const row = rows.get(params.leagueId);
      return row?.detail.isPublic ? ok(leagueCapacityPublicDetail(row)) : missing();
    }),
  ];
}

export const v1LeagueCapacityMswHandlers = createV1LeagueCapacityMswHandlers();
