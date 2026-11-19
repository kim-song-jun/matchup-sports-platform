import { http, HttpResponse } from 'msw';

// 운영 판단 자료는 실제 권한·감사·참가 데이터가 필요하다. 데모를 실제 이력처럼 보여 주지 않는다.
function requiresLiveApi() {
  return HttpResponse.json({ status: 'error', statusCode: 503, code: 'ADMIN_OPERATIONS_REQUIRES_LIVE_API',
    message: '회원·팀 운영 정보는 실제 API 연결이 필요해요.', details: null, timestamp: new Date().toISOString() },
  { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
}

export const adminEntityOperationsHandlers = [
  http.get('*/api/v1/admin/:entity/:id/operations', requiresLiveApi),
  http.get('*/api/v1/admin/:entity/:id/operations/:section', requiresLiveApi),
];
