import { test, expect } from '@playwright/test';
import {
  HOST_EMAIL,
  OPPONENT_EMAIL,
  UNAUTHORIZED_EMAIL,
  createApprovedTeamMatchWithHomeLineup,
} from './helpers/team-match-scenario';
import { apiGet, apiPost, commandId, unwrap } from './helpers/v1-http';

/**
 * E2E-TEAM-02 -- opponent result approval, version-conflict race, and API
 * error surface (plan Todo 26 scope note under Todo 17: "focused Jest
 * integration for E2E-TEAM-01/02 API portion (owner/manager/opponent result
 * approval, 409 race, API error, projection-pending)").
 *
 * Route surface: `POST/PATCH? /games/:gameId/result-revisions[...]` in
 * `apps/v1_api/src/games/games.controller.ts` -> `GamesService`. Task 16's
 * design ("Task 16: draft creation and submission are host-only" --
 * `GamesService.resolveActor`) is the authorization contract under test:
 *
 *  - owner@teameet.v1  (HOST team owner) -- `POST .../result-revisions`
 *    (create draft) then `.../submit` -> 200/200. HOST-only: the OPPONENT
 *    side can never draft or submit a result, only decide on one (see next).
 *  - host@teameet.v1   (OPPONENT/AWAY team owner) -- `POST
 *    .../result-revisions/:id/decision` with `decision:'approve'` -> 200.
 *    This is the "opponent result approval" the scope note names.
 *  - member@teameet.v1 (HOST team member, non-owner/manager, unaffiliated
 *    with the AWAY team) -- attempts BOTH the host-only submit path and the
 *    opponent-only decision path -> 403 `PERMISSION_DENIED` on both, proving
 *    the host-only / opponent-only split is enforced by role+side, not by
 *    generic team membership.
 *  - 409 race: replaying `decision` with a stale `expectedVersion` (the
 *    version captured before the approve, not after) -> 409
 *    `VERSION_CONFLICT` (`assertGameCommandContext`), the optimistic-
 *    concurrency contract `withCommand` enforces on every command in this
 *    boundary.
 *
 * Team-match-with-events invariant note: this scenario submits a result with
 * ZERO `V1GameEvent` rows, which `validateGameResultInvariants` documents as
 * deliberately exempt from score/participant-goal cross-checking for
 * TEAM_MATCH games with no events ("the SUBMITTED score is authoritative") --
 * this is not a shortcut this spec invented, it is the actual contract for
 * the ordinary "host self-reports, opponent approves" flow the futsal-v1
 * `teamMatchScorerPolicy: 'optional_with_warning'` config describes.
 *
 * Cleanup: `submitResultRevision` atomically flips the `V1TeamMatch` to
 * `completed` on first submission (see `assertTeamMatchMatched`'s doc in
 * `games.service.ts`) -- `completed` is a terminal state with no further
 * cleanup surface (no delete endpoint exists), so `cancelTeamMatch()` is not
 * called here; see `cancelTeamMatch`'s own doc for why that is intentional,
 * not an omission.
 */
test.describe('[E2E-TEAM-02] 팀매치 결과 제출 및 상대팀 승인', () => {
  test('호스트만 결과를 제출할 수 있고, 상대팀만 승인할 수 있으며, 버전 충돌은 409다', async ({ request }) => {
    const scenario = await createApprovedTeamMatchWithHomeLineup(request);

    const currentVersion = async (): Promise<number> =>
      unwrap<{ version: number }>(await apiGet(request, `/api/v1/games/${scenario.gameId}`, { email: HOST_EMAIL }))
        .version;

    const actualParticipants = [
      ...scenario.homeStarterIds.map((participantId, index) => ({
        participantId,
        sideId: scenario.homeSideId,
        started: true,
        goals: index === 0 ? 1 : 0, // one HOME goal -> score.home = 1
        cards: { yellow: 0, red: 0 },
        goalkeeper: index === 0,
      })),
      ...scenario.awayParticipantIds.map((participantId) => ({
        participantId,
        sideId: scenario.awaySideId,
        started: true,
        goals: 0,
        cards: { yellow: 0, red: 0 },
        goalkeeper: false,
      })),
    ];
    const score = { home: 1, away: 0 };

    // When: HOME이 아닌 member@teameet.v1(HOST팀 소속이지만 owner/manager 아님)이 결과 초안 생성 시도
    // -> 403 PERMISSION_DENIED (host-only 게이트, `resolveActor`의 'team_result_submit' 분기).
    const unauthorizedCreate = await apiPost(request, `/api/v1/games/${scenario.gameId}/result-revisions`, {
      email: UNAUTHORIZED_EMAIL,
      idempotencyKey: commandId(),
      data: {
        expectedVersion: await currentVersion(),
        clientCommandId: commandId(),
        score,
        actualParticipants,
        eventsHash: 'e2e-no-events',
      },
    });
    expect(unauthorizedCreate.status).toBe(403);
    expect((unauthorizedCreate.body as { code?: string }).code).toBe('PERMISSION_DENIED');

    // When: HOST(owner@teameet.v1)가 결과 초안 생성 -> 200, DRAFT.
    const created = await apiPost(request, `/api/v1/games/${scenario.gameId}/result-revisions`, {
      email: HOST_EMAIL,
      idempotencyKey: commandId(),
      data: {
        expectedVersion: await currentVersion(),
        clientCommandId: commandId(),
        score,
        actualParticipants,
        eventsHash: 'e2e-no-events',
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const draft = unwrap<{ revisionId: string; revisionState: string; version: number }>(created);
    expect(draft.revisionState).toBe('DRAFT');

    // When: HOST가 제출 -> 200, SUBMITTED. TeamMatch도 이 시점에 'completed'로 전이된다(서비스 계약).
    const submitted = await apiPost(
      request,
      `/api/v1/games/${scenario.gameId}/result-revisions/${draft.revisionId}/submit`,
      {
        email: HOST_EMAIL,
        idempotencyKey: commandId(),
        data: { expectedVersion: await currentVersion(), clientCommandId: commandId() },
      },
    );
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    const versionBeforeDecision = unwrap<{ revisionState: string; version: number }>(submitted).version;
    expect(unwrap<{ revisionState: string }>(submitted).revisionState).toBe('SUBMITTED');

    // When: member@teameet.v1이 결정(approve) 시도 -> 403 PERMISSION_DENIED (opponent-only 게이트,
    // 'opponent_result_decide' 분기 -- HOST팀 멤버라는 사실은 이 권한에 무관하다).
    const unauthorizedDecision = await apiPost(
      request,
      `/api/v1/games/${scenario.gameId}/result-revisions/${draft.revisionId}/decision`,
      {
        email: UNAUTHORIZED_EMAIL,
        idempotencyKey: commandId(),
        data: { expectedVersion: versionBeforeDecision, clientCommandId: commandId(), decision: 'approve' },
      },
    );
    expect(unauthorizedDecision.status).toBe(403);
    expect((unauthorizedDecision.body as { code?: string }).code).toBe('PERMISSION_DENIED');

    // When: 상대팀(AWAY) owner인 host@teameet.v1이 낡은 expectedVersion(제출 직후 시점, 승인 시도 시점보다
    // 한 단계 낮은 값 -- 사이에 아무도 커맨드를 실행하지 않았으므로 현재값보다 정확히 1 낮다)으로 승인 시도
    // -> 409 VERSION_CONFLICT. `createResultRevision`/`submitResultRevision`/`decideResultRevision`
    // 모두 매 커맨드마다 `game.version`을 1씩 증가시키므로(games.service.ts), submit 직후 값은 항상 >=1이다.
    expect(versionBeforeDecision).toBeGreaterThan(0);
    const staleDecision = await apiPost(
      request,
      `/api/v1/games/${scenario.gameId}/result-revisions/${draft.revisionId}/decision`,
      {
        email: OPPONENT_EMAIL,
        idempotencyKey: commandId(),
        data: {
          expectedVersion: versionBeforeDecision - 1,
          clientCommandId: commandId(),
          decision: 'approve',
        },
      },
    );
    expect(staleDecision.status).toBe(409);
    expect((staleDecision.body as { code?: string }).code).toBe('VERSION_CONFLICT');

    // When: 상대팀(AWAY) owner가 올바른 버전으로 승인 -> 200, OFFICIAL. 이것이 "opponent result approval".
    const approved = await apiPost(
      request,
      `/api/v1/games/${scenario.gameId}/result-revisions/${draft.revisionId}/decision`,
      {
        email: OPPONENT_EMAIL,
        idempotencyKey: commandId(),
        data: { expectedVersion: await currentVersion(), clientCommandId: commandId(), decision: 'approve' },
      },
    );
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(unwrap<{ revisionState: string }>(approved).revisionState).toBe('OFFICIAL');

    // Then (state proxy): the game's result-revisions list reflects the same OFFICIAL state read
    // back independently, confirming the decision really persisted (not just a 200 shell).
    const revisions = unwrap<{ id: string; state: string }[]>(
      await apiGet(request, `/api/v1/games/${scenario.gameId}/result-revisions`, { email: HOST_EMAIL }),
    );
    const persisted = revisions.find((revision) => revision.id === draft.revisionId);
    expect(persisted?.state).toBe('OFFICIAL');
  });
});
