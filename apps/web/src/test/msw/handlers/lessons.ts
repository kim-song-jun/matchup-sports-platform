import { http } from 'msw';
import { success, paged } from './_utils';
import { mockLesson, mockLessonTicketPlan, mockLessonTicket } from '../../fixtures/lessons';

export const lessonsHandlers = [
  http.get('/api/v1/lessons', () => {
    return paged([mockLesson]);
  }),

  http.post('/api/v1/lessons', () => {
    return success(mockLesson);
  }),

  http.get('/api/v1/lessons/:id', ({ params }) => {
    return success({
      ...mockLesson,
      id: params.id as string,
      ticketPlans: [mockLessonTicketPlan],
    });
  }),

  http.post('/api/v1/lessons/:id/apply', ({ params }) => {
    return success({ lessonId: params.id as string, status: 'confirmed' });
  }),

  http.post('/api/v1/lessons/:id/ticket-purchase', ({ params }) => {
    return success({
      ticket: { ...mockLessonTicket, lessonId: params.id as string },
      payment: { orderId: 'order-ticket-1', amount: 20000, ticketId: 'ticket-1' },
    });
  }),

  http.get('/api/v1/lessons/:id/schedules', ({ params }) => {
    return success([
      {
        id: 'sched-1',
        lessonId: params.id as string,
        sessionDate: '2026-05-10',
        startTime: '10:00',
        endTime: '12:00',
        isCancelled: false,
        attendeeCount: 3,
      },
    ]);
  }),
];
