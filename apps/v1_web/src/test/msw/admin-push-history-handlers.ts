import { http, HttpResponse } from 'msw';
import type { AdminPushHistoryDetail } from '@/types/admin-push-history';

/** Demo content is explicitly labelled and never sends an actual notification. */
export const adminPushHistoryFixture: AdminPushHistoryDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  createdAt: '2026-11-19T03:00:00.000Z', title: '[샘플] 경기 안내',
  target: 'broadcast', recipientUserId: null, sender: { name: '샘플 운영자', role: 'ops' },
  sent: 2, skipped: 1, failed: 0,
  content: { source: 'snapshot', body: '이 내용은 미리보기용 샘플이에요.', url: '/tournaments' },
  delivery: { web: { total: 1, delivered: 1, failed: 0, disabled: false }, native: { total: 2, delivered: 1, failed: 1, disabled: false } },
};
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });

export const adminPushHistoryMswHandlers = [
  http.get('*/api/v1/admin/ops/push-history', ({ request }) => {
    const url = new URL(request.url);
    const { content: _content, delivery: _delivery, ...item } = adminPushHistoryFixture;
    const items = url.searchParams.has('cursor') || ['user', 'competition'].includes(url.searchParams.get('target') ?? '') ? [] : [item];
    return ok({ items, pageInfo: { hasNextPage: false, nextCursor: null } });
  }),
  // 예상 인원 샘플 — 실제 집계가 아니라 화면 확인용 고정값이다.
  http.get('*/api/v1/admin/ops/push-send/audience', () => ok({ audience: 24, noticeOff: 2, recipients: 22 })),
  http.get('*/api/v1/admin/ops/push-history/:id', ({ params }) => {
    if (params.id === adminPushHistoryFixture.id) return ok(adminPushHistoryFixture);
    return HttpResponse.json({ status: 'error', statusCode: 404, code: 'PUSH_HISTORY_NOT_FOUND', message: '발송 이력을 찾을 수 없어요.', timestamp: new Date().toISOString() }, { status: 404 });
  }),
];
