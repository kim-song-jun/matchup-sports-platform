import { http, HttpResponse } from 'msw';
import type {
  V1DissolveTeamResult,
  V1MyDissolvedTeams,
  V1RestoreTeamResult,
  V1TeamDissolutionBlocker,
  V1TeamDissolutionPreview,
} from '@/types/api';

/**
 * 팀 해체(보관)·복구(Task 180 H3) — `docs/api/domains/teams.md` "팀 해체(보관)·복구" 계약을 따르는 상태형 핸들러.
 * 이름 확인(앞뒤 공백 무시)·막는 조건 409·30일 복구 409 를 서버와 같은 코드로 돌려준다.
 */
const api = '*/api/v1';
const NOW = '2026-10-01T00:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

export const TEAM_DISSOLUTION_MSW = { teamId: 'team-dissolve-1', teamName: 'QA0929 팀관리 테스트' } as const;

function ok<T>(data: T) {
  return HttpResponse.json({ status: 'success', data, timestamp: NOW });
}

function fail(status: number, code: string, message: string, details: unknown = null) {
  return HttpResponse.json({ status: 'error', statusCode: status, code, message, details, timestamp: NOW }, { status });
}

export function teamDissolutionPreview(overrides: Partial<V1TeamDissolutionPreview> = {}): V1TeamDissolutionPreview {
  return {
    teamId: TEAM_DISSOLUTION_MSW.teamId,
    teamName: TEAM_DISSOLUTION_MSW.teamName,
    canDissolve: true,
    blockers: [],
    cleanup: {
      recruitingTeamMatchCount: 1,
      outgoingApplicationCount: 0,
      joinApplicationCount: 2,
      invitationCount: 1,
      upcomingSchedules: [{ scheduleId: 'schedule-1', title: '망원 유수지 풋살장 연습', startAt: '2026-10-02T11:00:00.000Z' }],
      notifyMemberCount: 17,
    },
    restoreWindowDays: 30,
    ...overrides,
  };
}

export function dissolvedTeamItem(overrides: Partial<V1MyDissolvedTeams['items'][number]> = {}): V1MyDissolvedTeams['items'][number] {
  const teamId = overrides.teamId ?? TEAM_DISSOLUTION_MSW.teamId;
  const dissolvedAt = overrides.dissolvedAt ?? '2026-09-20T06:00:00.000Z';
  return {
    teamId,
    name: TEAM_DISSOLUTION_MSW.teamName,
    logoUrl: null,
    sportName: '풋살',
    memberCount: 1,
    dissolvedAt,
    restoreDeadlineAt: dissolvedAt ? new Date(Date.parse(dissolvedAt) + 30 * DAY_MS).toISOString() : null,
    canRestore: true,
    detailRoute: `/teams/${teamId}`,
    ...overrides,
  };
}

export type TeamDissolutionMswRequest = { method: string; path: string; body: unknown };

export function createV1TeamDissolutionMswHandlers(init: {
  preview?: V1TeamDissolutionPreview;
  /** 점검 뒤 해체 직전에 새로 생긴 막는 조건 — dissolve 가 409 를 주고 이후 점검도 막힌 상태가 된다. */
  blockersAppearOnDissolve?: V1TeamDissolutionBlocker[];
  dissolvedTeams?: V1MyDissolvedTeams['items'];
} = {}) {
  const state = {
    preview: init.preview ?? teamDissolutionPreview(),
    blockersAppearOnDissolve: init.blockersAppearOnDissolve ?? null,
    dissolvedTeams: [...(init.dissolvedTeams ?? [])],
    requests: [] as TeamDissolutionMswRequest[],
  };
  const record = (request: Request, body: unknown = null) => {
    state.requests.push({ method: request.method, path: new URL(request.url).pathname, body });
  };

  const handlers = [
    http.get(`${api}/teams/:teamId/dissolution-preview`, ({ request }) => {
      record(request);
      return ok(state.preview);
    }),
    http.post(`${api}/teams/:teamId/dissolve`, async ({ request, params }) => {
      const body = (await request.json()) as { confirmTeamName?: string };
      record(request, body);
      const teamId = String(params.teamId);
      if ((body.confirmTeamName ?? '').trim() !== state.preview.teamName.trim()) {
        return fail(400, 'TEAM_NAME_MISMATCH', '팀 이름이 달라요. 팀 이름을 그대로 입력해 주세요.', { field: 'confirmTeamName' });
      }
      if (state.blockersAppearOnDissolve) {
        state.preview = { ...state.preview, canDissolve: false, blockers: state.blockersAppearOnDissolve };
      }
      if (!state.preview.canDissolve) {
        return fail(409, 'TEAM_DISSOLVE_BLOCKED', '먼저 정리할 것이 있어요.', { blockers: state.preview.blockers });
      }
      const result: V1DissolveTeamResult = {
        teamId,
        status: 'archived',
        dissolvedAt: NOW,
        restoreDeadlineAt: new Date(Date.parse(NOW) + 30 * DAY_MS).toISOString(),
        canRestore: true,
        cancelledTeamMatchCount: state.preview.cleanup.recruitingTeamMatchCount,
        cancelledScheduleCount: state.preview.cleanup.upcomingSchedules.length,
        notifiedMemberCount: state.preview.cleanup.notifyMemberCount,
        detailRoute: `/teams/${teamId}`,
      };
      return ok(result);
    }),
    http.post(`${api}/teams/:teamId/restore`, ({ request, params }) => {
      record(request);
      const teamId = String(params.teamId);
      const team = state.dissolvedTeams.find((item) => item.teamId === teamId);
      if (!team) return fail(409, 'TEAM_NOT_DISSOLVED', '해체된 팀이 아니에요.');
      if (!team.canRestore) {
        return fail(409, 'TEAM_RESTORE_WINDOW_EXPIRED', '해체하고 30일이 지나 직접 복구할 수 없어요. 운영팀에 문의해 주세요.');
      }
      state.dissolvedTeams = state.dissolvedTeams.filter((item) => item.teamId !== teamId);
      const result: V1RestoreTeamResult = { teamId, status: 'active', detailRoute: `/teams/${teamId}` };
      return ok(result);
    }),
    http.get(`${api}/me/dissolved-teams`, ({ request }) => {
      record(request);
      const data: V1MyDissolvedTeams = { items: state.dissolvedTeams, restoreWindowDays: 30 };
      return ok(data);
    }),
  ];

  return { handlers, state };
}

export const v1TeamDissolutionMswHandlers = createV1TeamDissolutionMswHandlers().handlers;
