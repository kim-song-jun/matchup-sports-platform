import { http, HttpResponse } from 'msw';
import type { V1AdminReleaseUserPhoneResult } from '@/types/api';

/**
 * `POST /admin/users/:userId/phone/release` — `docs/api/domains/admin-and-ops.md` 계약.
 * 시나리오는 회원 id 로 고른다. 상태를 들고 있지 않아 테스트 간 오염이 없다.
 * 본문은 서버 DTO(`ReleaseAdminUserPhoneDto`)와 같다: `reason` 하나, 앞뒤 공백을 뺀 1~500자, 모르는 필드는 400.
 */
const api = '*/api/v1';
const NOW = '2026-11-01T00:00:00.000Z';

export const ADMIN_PHONE_RELEASE_MSW = {
  noPhoneUserId: 'admin-phone-release-no-phone',
  deletedUserId: 'admin-phone-release-deleted',
  forbiddenUserId: 'admin-phone-release-forbidden',
} as const;

function fail(statusCode: number, code: string, message: string) {
  return HttpResponse.json({ status: 'error', statusCode, code, message, details: null, timestamp: NOW }, { status: statusCode });
}

export function adminPhoneReleaseResult(userId: string, overrides: Partial<V1AdminReleaseUserPhoneResult> = {}): V1AdminReleaseUserPhoneResult {
  return {
    userId,
    previousStatus: 'confirmed',
    status: 'released',
    actionLogId: 'action-log-phone-release',
    statusChangeLogId: 'status-log-phone-release',
    ...overrides,
  };
}

export const v1AdminUserPhoneReleaseMswHandlers = [
  http.post(`${api}/admin/users/:userId/phone/release`, async ({ params, request }) => {
    const userId = String(params.userId);
    const body: unknown = await request.json().catch(() => null);
    const fields = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const { reason, ...rest } = fields;
    if (typeof reason !== 'string' || reason.trim() !== reason || reason.length < 1 || reason.length > 500 || Object.keys(rest).length > 0) {
      return fail(400, 'VALIDATION_ERROR', '입력값을 다시 확인해 주세요.');
    }
    switch (userId) {
      case ADMIN_PHONE_RELEASE_MSW.forbiddenUserId:
        return fail(403, 'PERMISSION_DENIED', 'Support admins cannot mutate status');
      case ADMIN_PHONE_RELEASE_MSW.deletedUserId:
        return fail(409, 'USER_DELETED_IRREVERSIBLE', '이미 삭제된 계정이에요. 휴대폰 번호는 삭제할 때 이미 해제됐어요.');
      case ADMIN_PHONE_RELEASE_MSW.noPhoneUserId:
        return fail(409, 'PHONE_NOT_SET', '해제할 휴대폰 번호가 없어요.');
      default:
        return HttpResponse.json({ status: 'success', data: adminPhoneReleaseResult(userId), timestamp: NOW });
    }
  }),
];
