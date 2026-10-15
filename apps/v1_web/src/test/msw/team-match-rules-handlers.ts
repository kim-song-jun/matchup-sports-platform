import { http, HttpResponse } from 'msw';
import type { V1TeamMatch, V1TeamMatchRuleOptions } from '@/types/api';
import { teamMatchRulesHostFixtures, type TeamMatchRulesHostFixture } from './team-match-rules.fixtures';
import { isTeamMatchRulesPayload } from './team-match-rules-payload';
import { createTeamMatchRulesStore, hostRulesBlockedReason } from './team-match-rules-store';

const api = '*/api/v1';
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
const fail = (statusCode: number, code: string, message: string) => HttpResponse.json(
  { status: 'error', statusCode, code, message, timestamp: new Date().toISOString() }, { status: statusCode },
);

/** Stateful MSW transport, not a substitute for the backend's transaction/permission tests. */
export function createV1TeamMatchRulesMswHandlers(
  initial: readonly V1TeamMatch[], hosts: readonly TeamMatchRulesHostFixture[] = teamMatchRulesHostFixtures,
) {
  const store = createTeamMatchRulesStore(initial);
  const managedHost = (id: string, request: Request) => {
    // Existing global auth/me MSW fixture represents user-1 when no dev-auth header is present.
    const actor = request.headers.get('x-v1-user-id') ?? 'user-1';
    return hosts.find(host => host.hostTeamId === id && host.active && host.managerUserId === actor);
  };
  const notFound = () => fail(404, 'NOT_FOUND_OR_ARCHIVED', '팀매치를 찾을 수 없어요.');
  const denied = () => fail(403, 'PERMISSION_DENIED', '호스트 팀의 활성 운영 권한이 필요해요.');
  const badInput = () => fail(400, 'VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');

  const handlers = [
    http.get(`${api}/teams/:teamId/team-match-rule-options`, ({ params, request }) => {
      const host = managedHost(String(params.teamId), request);
      if (!host) return denied();
      const blocked = hostRulesBlockedReason(host);
      if (blocked) return fail(409, blocked, '현재 종목의 경기 규칙을 사용할 수 없어요.');
      if (!host.competitionConfigVersionId || !host.periods) return fail(409, 'COMPETITION_CONFIG_REQUIRED', '경기 설정이 필요해요.');
      const options: V1TeamMatchRuleOptions = {
        hostTeamId: host.hostTeamId, sportId: host.sportId,
        competitionConfigVersionId: host.competitionConfigVersionId, periods: host.periods,
      };
      return ok(options);
    }),
    http.get(`${api}/team-matches/:teamMatchId/edit`, ({ params, request }) => {
      const record = store.matches.get(String(params.teamMatchId));
      if (!record) return notFound();
      const host = managedHost(record.form.hostTeamId, request);
      if (!host) return denied();
      return ok(store.edit(record, host));
    }),
    http.get(`${api}/team-matches/:teamMatchId`, ({ params }) => {
      const record = store.matches.get(String(params.teamMatchId));
      return record ? ok(record.detail) : notFound();
    }),
    http.post(`${api}/team-matches`, async ({ request }) => {
      const body: unknown = await request.json();
      if (!isTeamMatchRulesPayload(body) || body.version !== undefined) return badInput();
      const host = managedHost(body.hostTeamId, request);
      if (!host) return denied();
      if (body.sportId !== host.sportId) return fail(400, 'VALIDATION_FAILED', '호스트 팀의 종목을 선택해 주세요.');
      const blocked = body.periods === undefined
        ? (!host.competitionConfigVersionId ? 'COMPETITION_CONFIG_REQUIRED' : null)
        : hostRulesBlockedReason(host);
      if (blocked) return fail(409, blocked, '현재 종목의 경기 규칙을 사용할 수 없어요.');
      return ok(store.result(store.write(body, host)));
    }),
    http.patch(`${api}/team-matches/:teamMatchId`, async ({ params, request }) => {
      const body: unknown = await request.json();
      if (!isTeamMatchRulesPayload(body) || typeof body.version !== 'string') return badInput();
      const record = store.matches.get(String(params.teamMatchId));
      if (!record) return notFound();
      const host = managedHost(record.form.hostTeamId, request);
      if (!host) return denied();
      if (body.version !== record.version) return fail(409, 'VERSION_CONFLICT', '최신 내용을 다시 확인해 주세요.');
      if (!store.edit(record, host).editable) return fail(409, 'STATE_CONFLICT', '현재 상태에서는 팀매치를 바꿀 수 없어요.');
      if (body.hostTeamId !== record.form.hostTeamId) return fail(409, 'STATE_CONFLICT', '호스트 팀을 바꿀 수 없어요.');
      if (body.sportId !== host.sportId) return fail(400, 'VALIDATION_FAILED', '호스트 팀의 종목을 선택해 주세요.');
      if (body.sportId !== record.form.sportId) return fail(409, 'COMPETITION_CONFIG_IMMUTABLE', '경기 종목을 바꿀 수 없어요.');
      if (body.periods !== undefined) {
        const blocked = record.rulesLockedReason ?? hostRulesBlockedReason(host);
        if (blocked) return fail(409, blocked, '현재 경기의 규칙을 바꿀 수 없어요.');
      }
      const { version: _version, ...payload } = body;
      return ok(store.result(store.write(payload, host, record)));
    }),
    http.get(`${api}/games/:gameId`, ({ params }) => {
      const gameId = String(params.gameId);
      const game = store.game(gameId);
      if (game) return ok(game);
      return gameId.startsWith('msw-team-match-game-') ? fail(404, 'GAME_NOT_FOUND', '경기를 찾을 수 없어요.') : undefined;
    }),
  ];
  return { ...store, handlers };
}
