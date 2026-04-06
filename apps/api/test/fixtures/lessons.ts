import { PrismaClient, Lesson, LessonTicketPlan, SportType } from '@prisma/client';

export interface LessonWithPlan {
  lesson: Lesson;
  ticketPlan: LessonTicketPlan;
}

/**
 * Creates a Lesson and a default single-session ticket plan.
 */
export async function createLessonWithTicketPlan(
  prisma: PrismaClient,
  hostId: string,
  overrides: Partial<{
    sportType: SportType;
    title: string;
    lessonDate: Date;
    startTime: string;
    endTime: string;
    fee: number;
    maxParticipants: number;
  }> = {},
): Promise<LessonWithPlan> {
  const lesson = await prisma.lesson.create({
    data: {
      hostId,
      sportType: overrides.sportType ?? SportType.basketball,
      type: 'group_lesson',
      title: overrides.title ?? 'Test Lesson',
      lessonDate: overrides.lessonDate ?? new Date('2026-05-15'),
      startTime: overrides.startTime ?? '10:00',
      endTime: overrides.endTime ?? '12:00',
      maxParticipants: overrides.maxParticipants ?? 10,
      fee: overrides.fee ?? 30000,
      imageUrls: [],
      recurringDays: [],
    },
  });

  const ticketPlan = await prisma.lessonTicketPlan.create({
    data: {
      lessonId: lesson.id,
      name: '1회권',
      type: 'single',
      price: lesson.fee,
    },
  });

  return { lesson, ticketPlan };
}
