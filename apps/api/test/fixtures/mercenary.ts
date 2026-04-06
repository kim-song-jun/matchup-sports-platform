import { PrismaClient, MercenaryPost, MercenaryApplication, SportType, MercenaryPostStatus } from '@prisma/client';

export interface MercenaryPostWithApp {
  post: MercenaryPost;
  application: MercenaryApplication;
}

/**
 * Creates a MercenaryPost under a team.
 */
export async function createMercenaryPost(
  prisma: PrismaClient,
  teamId: string,
  authorId: string,
  overrides: Partial<{
    sportType: SportType;
    matchDate: Date;
    venue: string;
    position: string;
    count: number;
    level: number;
    fee: number;
    status: MercenaryPostStatus;
  }> = {},
): Promise<MercenaryPost> {
  return prisma.mercenaryPost.create({
    data: {
      teamId,
      authorId,
      sportType: overrides.sportType ?? SportType.futsal,
      matchDate: overrides.matchDate ?? new Date('2026-05-10T14:00:00Z'),
      venue: overrides.venue ?? 'Test Futsal Park',
      position: overrides.position ?? 'MF',
      count: overrides.count ?? 2,
      level: overrides.level ?? 3,
      fee: overrides.fee ?? 10000,
      status: overrides.status ?? MercenaryPostStatus.open,
    },
  });
}

/**
 * Creates a MercenaryPost and a pending application from applicantId.
 */
export async function createMercenaryPostWithApplication(
  prisma: PrismaClient,
  teamId: string,
  authorId: string,
  applicantId: string,
): Promise<MercenaryPostWithApp> {
  const post = await createMercenaryPost(prisma, teamId, authorId);

  const application = await prisma.mercenaryApplication.create({
    data: {
      postId: post.id,
      userId: applicantId,
      status: 'pending',
    },
  });

  return { post, application };
}
