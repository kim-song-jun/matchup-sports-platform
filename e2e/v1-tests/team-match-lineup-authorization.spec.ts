import { test, expect } from '@playwright/test';
import {
  HOST_EMAIL,
  OPPONENT_EMAIL,
  UNAUTHORIZED_EMAIL,
  cancelTeamMatch,
  createApprovedTeamMatchWithHomeLineup,
} from './helpers/team-match-scenario';
import { apiGet, apiPost, commandId, unwrap } from './helpers/v1-http';

/**
 * E2E-TEAM-01 -- opponent lineup change authorization (plan Todo 26
 * acceptance criterion: "E2E-TEAM-01 covers opponent lineup change
 * authorization").
 *
 * Persona / route / expected outcome matrix this spec asserts (all via raw
 * HTTP against v1_api, matching the plan's "expected response/DB/projection/
 * audit/UI state" requirement at the API-response layer -- the harness has
 * no DB access from `e2e/v1-tests`, so "DB state" is verified indirectly
 * through the follow-up `GET .../lineup` read, which is the closest
 * observable proxy to persisted state this harness has):
 *
 *  - owner@teameet.v1  (owner of the HOME team)        -- builds+submits the
 *    HOME lineup (setup precondition, not the assertion target itself).
 *  - host@teameet.v1   (owner of the AWAY/opponent team) --
 *    `POST /team-matches/:id/lineup/change-request` targeting the HOME
 *    side's SUBMITTED lineup -> 200, reopens it to a fresh DRAFT
 *    (`TeamMatchLineupService.requestChange`). This is the "opponent" in
 *    "opponent lineup change authorization": the route always operates on
 *    the CALLER's opponent side, never their own.
 *  - member@teameet.v1 (a `member`-role, non-owner/non-manager member of the
 *    HOME team, and unaffiliated with the AWAY team) -- same request -> 403
 *    `PERMISSION_DENIED`. `TeamMatchLineupService.loadContext` gates on
 *    `role IN (owner, manager)` of EITHER match team, not mere membership,
 *    so this is the authorization boundary the scenario name refers to, not
 *    a generic "stranger" check.
 *  - visitor (no auth headers at all) -- same request -> 401
 *    `UNAUTHENTICATED` (`V1AuthGuard`), the outermost boundary.
 *
 * Cleanup: `cancelTeamMatch()` (POST .../cancel) -- this spec never submits
 * a result, so the match stays cancellable in every branch.
 */
test.describe('[E2E-TEAM-01] 팀매치 라인업 상대팀 정정 요청 권한', () => {
  test('상대팀 owner는 정정을 요청할 수 있고, 팀 소속이라도 owner/manager가 아니면 거부되며, 미인증은 401이다', async ({
    request,
  }) => {
    const scenario = await createApprovedTeamMatchWithHomeLineup(request);
    try {
      // Given: HOME(owner@teameet.v1) 라인업은 SUBMITTED 상태 (setup에서 이미 제출됨).

      // When: 인증되지 않은 요청자가 정정 요청 -> 401 UNAUTHENTICATED (가장 바깥 경계).
      const unauthenticated = await apiPost(request, `/api/v1/team-matches/${scenario.teamMatchId}/lineup/change-request`, {
        email: null,
        data: { expectedVersion: 0, reason: 'unauthenticated probe' },
      });
      expect(unauthenticated.status).toBe(401);
      expect((unauthenticated.body as { code?: string }).code).toBe('UNAUTHENTICATED');

      // When: HOME팀의 일반 member(owner/manager 아님)가 정정 요청 -> 403 PERMISSION_DENIED.
      // (member@teameet.v1은 AWAY팀 소속도 아니므로 두 팀 어느 쪽으로도 권한을 얻지 못한다.)
      const unauthorized = await apiPost(
        request,
        `/api/v1/team-matches/${scenario.teamMatchId}/lineup/change-request`,
        {
          email: UNAUTHORIZED_EMAIL,
          data: { expectedVersion: 0, reason: 'unauthorized probe' },
        },
      );
      expect(unauthorized.status).toBe(403);
      expect((unauthorized.body as { code?: string }).code).toBe('PERMISSION_DENIED');

      // When: 상대팀(AWAY) owner가 HOME의 SUBMITTED 라인업에 정정 요청 -> 200, 새 DRAFT로 reopen.
      const changeRequest = await apiPost(
        request,
        `/api/v1/team-matches/${scenario.teamMatchId}/lineup/change-request`,
        {
          email: OPPONENT_EMAIL,
          idempotencyKey: commandId(),
          data: { expectedVersion: 1, reason: '골키퍼 등번호를 다시 확인해 주세요.' },
        },
      );
      expect(changeRequest.status, JSON.stringify(changeRequest.body)).toBe(200);
      const reopened = unwrap<{
        teamMatchId: string;
        sideId: string;
        state: string;
        revision: number;
        reason: string;
      }>(changeRequest);
      expect(reopened.sideId).toBe(scenario.homeSideId);
      expect(reopened.state).toBe('change_requested');
      expect(reopened.revision).toBe(2); // supersedes revision 1 (the submitted lineup)
      expect(reopened.reason).toBe('골키퍼 등번호를 다시 확인해 주세요.');

      // Then (state proxy): a follow-up GET as the HOME owner shows the lineup back at DRAFT,
      // i.e. the change-request really persisted a new reopened lineup row, not just a 200 shell.
      const homeAfter = unwrap<{ state: string; revision: number }>(
        await apiGet(request, `/api/v1/team-matches/${scenario.teamMatchId}/lineup`, {
          email: HOST_EMAIL,
        }),
      );
      expect(homeAfter.state).toBe('DRAFT');
      expect(homeAfter.revision).toBe(2);

      // Version-conflict guard: a second change-request replaying the now-stale expectedVersion=1
      // must 409, not silently reopen again -- this is the same optimistic-concurrency contract
      // `TeamMatchLineupService.requestChange` documents (`details.currentVersion` lets a real
      // client recover).
      const stale = await apiPost(request, `/api/v1/team-matches/${scenario.teamMatchId}/lineup/change-request`, {
        email: OPPONENT_EMAIL,
        idempotencyKey: commandId(),
        data: { expectedVersion: 1, reason: 'stale replay' },
      });
      expect(stale.status).toBe(409);
      expect((stale.body as { code?: string }).code).toBe('VERSION_CONFLICT');
    } finally {
      await cancelTeamMatch(request, scenario.teamMatchId);
    }
  });
});
