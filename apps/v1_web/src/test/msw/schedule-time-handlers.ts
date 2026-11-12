import { http, HttpResponse } from 'msw';
import { randomUuid } from '@/lib/uuid';
import type { ScheduleTime } from '@/hooks/use-fixture-schedule-times';

const rows = new Map<string, ScheduleTime[]>();
const path = '*/api/v1/admin/tournaments/:tournamentId/schedule-times';
const success = (data: unknown) => HttpResponse.json({ status: 'success', data, timestamp: new Date().toISOString() });
export const scheduleTimeHandlers = [
  http.get(path, ({ params }) => success({ items: rows.get(String(params.tournamentId)) ?? [] })),
  http.post(path, async ({ params, request }) => {
    const body = await request.json() as { scheduledAt?: unknown };
    if (Object.keys(body).some(key => key !== 'scheduledAt') || typeof body.scheduledAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(body.scheduledAt) || !Number.isFinite(Date.parse(body.scheduledAt))) {
      return HttpResponse.json({ status: 'error', statusCode: 400, code: 'VALIDATION_ERROR', message: '날짜와 시간을 확인해 주세요.' }, { status: 400 });
    }
    const tournamentId = String(params.tournamentId), scheduledAt = new Date(body.scheduledAt).toISOString();
    const items = rows.get(tournamentId) ?? [];
    let item = items.find(row => row.scheduledAt === scheduledAt);
    if (!item) { item = { id: randomUuid(), tournamentId, scheduledAt, createdAt: new Date().toISOString() }; items.push(item); }
    items.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)); rows.set(tournamentId, items);
    return success({ item });
  }),
];
