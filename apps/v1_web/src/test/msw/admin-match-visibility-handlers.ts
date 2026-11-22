import { http, HttpResponse } from 'msw';
import type { V1AdminMatchVisibilityResult } from '@/types/api';

/**
 * `POST /admin/matches/:matchId/hide|unhide` — `docs/api/domains/admin-and-ops.md` 계약.
 * 시나리오는 매치 id 로 고른다. 상태를 들고 있지 않아 테스트 간 오염이 없다.
 * 본문은 서버 DTO(`ChangeMatchVisibilityDto`)와 같다: `reason` 하나, 앞뒤 공백을 뺀 1~500자.
 */
const api = '*/api/v1';
const NOW = '2026-11-22T00:00:00.000Z';

export const ADMIN_MATCH_VISIBILITY_MSW = {
  hasParticipantsMatchId: 'admin-match-hide-has-participants',
  alreadyHiddenMatchId: 'admin-match-hide-already-hidden',
  notHiddenMatchId: 'admin-match-unhide-not-hidden',
  deletedByHostMatchId: 'admin-match-unhide-deleted-by-host',
  forbiddenMatchId: 'admin-match-hide-forbidden',
} as const;

function fail(statusCode: number, code: string, message: string) {
  return HttpResponse.json({ status: 'error', statusCode, code, message, details: null, timestamp: NOW }, { status: statusCode });
}

export function adminMatchVisibilityResult(matchId: string, hidden: boolean): V1AdminMatchVisibilityResult {
  return { matchId, hidden, hiddenAt: hidden ? NOW : null, actionLogId: `action-log-match-${hidden ? 'hide' : 'unhide'}` };
}

async function validReason(request: Request): Promise<boolean> {
  const body: unknown = await request.json().catch(() => null);
  const fields = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const { reason, ...rest } = fields;
  return typeof reason === 'string' && reason.trim() === reason && reason.length >= 1 && reason.length <= 500 && Object.keys(rest).length === 0;
}

export const v1AdminMatchVisibilityMswHandlers = [
  http.post(`${api}/admin/matches/:matchId/hide`, async ({ params, request }) => {
    const matchId = String(params.matchId);
    if (!(await validReason(request))) return fail(400, 'VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
    switch (matchId) {
      case ADMIN_MATCH_VISIBILITY_MSW.forbiddenMatchId:
        return fail(403, 'PERMISSION_DENIED', 'Support admins cannot mutate status');
      case ADMIN_MATCH_VISIBILITY_MSW.hasParticipantsMatchId:
        return fail(409, 'MATCH_HIDE_HAS_PARTICIPANTS', '신청자나 확정 참가자가 있는 진행 예정 매치는 숨길 수 없어요. 먼저 매치를 취소해 주세요.');
      case ADMIN_MATCH_VISIBILITY_MSW.alreadyHiddenMatchId:
        return fail(409, 'MATCH_ALREADY_HIDDEN', '이미 숨겨진 매치예요.');
      default:
        return HttpResponse.json({ status: 'success', data: adminMatchVisibilityResult(matchId, true), timestamp: NOW }, { status: 201 });
    }
  }),
  http.post(`${api}/admin/matches/:matchId/unhide`, async ({ params, request }) => {
    const matchId = String(params.matchId);
    if (!(await validReason(request))) return fail(400, 'VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
    switch (matchId) {
      case ADMIN_MATCH_VISIBILITY_MSW.notHiddenMatchId:
        return fail(409, 'MATCH_NOT_HIDDEN', '숨겨진 매치가 아니에요.');
      case ADMIN_MATCH_VISIBILITY_MSW.deletedByHostMatchId:
        return fail(409, 'MATCH_DELETED_BY_HOST', '주최자가 직접 삭제한 매치는 다시 공개할 수 없어요.');
      default:
        return HttpResponse.json({ status: 'success', data: adminMatchVisibilityResult(matchId, false), timestamp: NOW }, { status: 201 });
    }
  }),
];
