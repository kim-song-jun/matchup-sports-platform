import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { ReactElement } from 'react';
import { createV1QueryClient } from '@/lib/query-client';
import { server } from '@/test/msw/server';
import { createV1TeamMatchRulesMswHandlers } from '@/test/msw/team-match-rules-handlers';
import type { TeamMatchRulesHostFixture } from '@/test/msw/team-match-rules.fixtures';
import type { V1TeamMatchEdit, V1TeamMatchPeriod, V1TeamMatchPeriodInput } from '@/types/api';
import { getTeamMatchCreateViewModel } from './team-matches.view-model';

export const rulesDraftKey = 'teameet:v1:team-match-draft:v3';
export const rulesHostId = 'mdqa141-host';
export const rulesMatchId = 'mdqa141-match';
const api = '*/api/v1';
const queryClients = new Set<QueryClient>();
const halfDefaults: readonly V1TeamMatchPeriod[] = [
  { code: 'FIRST_HALF', label: '전반', durationMinutes: 17, extraTime: false },
  { code: 'SECOND_HALF', label: '후반', durationMinutes: 19, extraTime: false },
];
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
export function rulesDraft(grade = '초보-중수') {
  return { ...getTeamMatchCreateViewModel('condition').draft,
    title: '합성 규칙 경기', description: '이전 단계에서 작성한 설명', grade,
    place: { kind: 'manual' as const, name: '합성 경기장', address: '합성 주소' },
    date: '2030-10-10', startTime: '18:00', endTime: '20:00',
  };
}
export function rulesServerEdit(teamMatchId = rulesMatchId): V1TeamMatchEdit {
  return { teamMatchId, editable: true, lockedReason: null,
    rulesEditable: true, rulesLockedReason: null, competitionConfigVersionId: 'config-original',
    status: 'recruiting', version: '2030-10-01T00:00:00.000Z',
    form: { hostTeamId: rulesHostId, sportId: 'sport-futsal', regionId: 'region-gangnam',
      title: '서버에 저장된 현재 경기', description: '현재 경기 설명',
      startsAt: '2030-10-10T09:00:00.000Z', endsAt: '2030-10-10T11:00:00.000Z',
      deadlineAt: null, manualPlaceName: '합성 경기장', imageUrl: null,
      minLevelCode: 'novice', maxLevelCode: 'intermediate', matchFormat: '5:5',
      matchStyle: [], genderRule: '성별 무관', uniformColor: null,
      periods: [{ durationMinutes: 17 }, { durationMinutes: 19 }],
    },
  };
}
export type RulesApiFault = { status: number; code: string; message: string } | null;
export function installRulesFlowApi(options: { edit?: V1TeamMatchEdit; fault?: RulesApiFault; editFault?: RulesApiFault } = {}) {
  const writes: Array<{ method: string; teamMatchId?: string; payload: Record<string, unknown> }> = [];
  let currentEdit = options.edit ?? rulesServerEdit();
  let fault = options.fault ?? null;
  let editFault = options.editFault ?? null;
  server.use(
    http.post(api + '/logs/client-error', () => new HttpResponse(null, { status: 204 })),
    http.get(api + '/me/teams', () => ok([{ teamId: rulesHostId, name: '합성 규칙 팀',
      role: 'owner', status: 'active', sport: { sportId: 'sport-futsal', name: '풋살' },
      memberCount: 8, canManage: true, canCreateTeamMatch: true,
    }])),
    http.get(api + '/master/sports', () => ok([{ id: 'sport-futsal', code: 'futsal', name: '풋살', levels: [] }])),
    http.get(api + '/master/regions', () => ok([
      { id: 'region-seoul', name: '서울', parentId: null, level: 1 },
      { id: 'region-gangnam', name: '강남구', parentId: 'region-seoul', level: 2 },
    ])),
    http.get(api + '/teams/:teamId/recent-venues', () => ok({ items: [] })),
    http.get(api + '/teams/:teamId/team-match-rule-options', ({ params }) => fault
      ? HttpResponse.json({ status: 'error', statusCode: fault.status, code: fault.code, message: fault.message }, { status: fault.status })
      : ok({ hostTeamId: params.teamId, sportId: 'sport-futsal', competitionConfigVersionId: 'config-original',
        periods: halfDefaults, twoPeriodDefaults: halfDefaults,
      })),
    http.get(api + '/team-matches/:teamMatchId/edit', ({ params }) => editFault
      ? HttpResponse.json({ status: 'error', statusCode: editFault.status, code: editFault.code, message: editFault.message }, { status: editFault.status })
      : ok({ ...currentEdit, teamMatchId: params.teamMatchId })),
    http.post(api + '/team-matches', async ({ request }) => {
      const payload = await request.json() as Record<string, unknown>;
      writes.push({ method: 'POST', payload });
      return ok({ teamMatchId: 'mdqa141-created', gameId: 'mdqa141-game', detailRoute: '/team-matches/mdqa141-created' });
    }),
    http.patch(api + '/team-matches/:teamMatchId', async ({ request, params }) => {
      const payload = await request.json() as Record<string, unknown>;
      writes.push({ method: 'PATCH', teamMatchId: String(params.teamMatchId), payload });
      currentEdit = { ...currentEdit, version: '2030-10-02T00:00:00.000Z', form: { ...currentEdit.form,
        title: String(payload.title), description: payload.description as string | null,
        periods: (payload.periods as readonly V1TeamMatchPeriodInput[] | undefined) ?? currentEdit.form.periods,
      } };
      return ok({ teamMatchId: params.teamMatchId, gameId: 'mdqa141-game', detailRoute: '/team-matches/' + params.teamMatchId });
    }),
  );
  return { writes, setFault: (next: RulesApiFault) => { fault = next; }, setEditFault: (next: RulesApiFault) => { editFault = next; } };
}
export function installPersistedRulesFlowApi(options: {
  readonly periods: readonly V1TeamMatchPeriod[];
  readonly twoPeriodDefaults: readonly V1TeamMatchPeriod[] | null;
}) {
  const apiFixture = installRulesFlowApi();
  const host: TeamMatchRulesHostFixture = {
    hostTeamId: rulesHostId, name: '합성 규칙 팀', sportId: 'sport-futsal', sportName: '풋살',
    managerUserId: 'user-1', active: true, competitionConfigVersionId: 'config-original',
    periods: options.periods, twoPeriodDefaults: options.twoPeriodDefaults,
  };
  const transport = createV1TeamMatchRulesMswHandlers([], [host]);
  server.use(
    http.post(api + '/team-matches', async ({ request }) => {
      const payload = await request.clone().json() as Record<string, unknown>;
      apiFixture.writes.push({ method: 'POST', payload });
      return undefined;
    }),
    ...transport.handlers,
  );
  return { ...apiFixture, transport };
}
export function renderRulesFlow(ui: ReactElement, queryClient = createV1QueryClient()) {
  queryClients.add(queryClient);
  return { ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>), queryClient };
}
export function clearRulesFlowQueryClients() {
  queryClients.forEach((queryClient) => queryClient.clear());
  queryClients.clear();
}
