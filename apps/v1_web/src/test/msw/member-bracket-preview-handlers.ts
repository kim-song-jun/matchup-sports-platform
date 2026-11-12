import { http, HttpResponse } from 'msw';

// A preview requires a real administrator and a durable audit record. Never manufacture a member grant in demo mode.
function requiresLiveApi() {
  return HttpResponse.json({ status: 'error', statusCode: 503, code: 'MEMBER_PREVIEW_REQUIRES_LIVE_API',
    message: '회원 대진표 조회는 실제 API에 연결한 뒤 사용할 수 있어요.', details: null, timestamp: new Date().toISOString() },
  { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
}
export const memberBracketPreviewMswHandlers = [
  http.post('*/api/v1/admin/users/:userId/bracket-preview', requiresLiveApi),
  http.get('*/api/v1/admin/users/:userId/bracket-preview/:previewId', requiresLiveApi),
];