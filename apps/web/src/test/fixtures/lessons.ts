import type { Lesson, LessonTicketPlan, LessonTicket } from '@/types/api';

export const mockLesson: Lesson = {
  id: 'lesson-1',
  hostId: 'user-1',
  sportType: 'soccer',
  type: 'group_lesson',
  title: '주말 풋살 그룹 레슨',
  description: '초보자 환영',
  venueName: '서울 풋살장',
  lessonDate: '2026-05-10',
  startTime: '10:00',
  endTime: '12:00',
  maxParticipants: 10,
  currentParticipants: 3,
  fee: 20000,
  levelMin: 1,
  levelMax: 3,
  status: 'open',
  coachName: '코치김',
  coachBio: '10년 경력의 풋살 코치',
  createdAt: '2024-01-01T00:00:00.000Z',
};

export const mockLessonTicketPlan: LessonTicketPlan = {
  id: 'plan-1',
  lessonId: 'lesson-1',
  name: '1회권',
  type: 'single',
  price: 20000,
  isActive: true,
  sortOrder: 0,
};

export const mockLessonTicket: LessonTicket = {
  id: 'ticket-1',
  planId: 'plan-1',
  userId: 'user-2',
  lessonId: 'lesson-1',
  status: 'active',
  usedSessions: 0,
  paidAmount: 20000,
  purchasedAt: '2024-01-05T10:00:00.000Z',
};
