import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(authorId: string, data: Record<string, unknown>) {
    const review = await this.prisma.review.create({
      data: {
        matchId: data.matchId as string,
        authorId,
        targetId: data.targetId as string,
        skillRating: data.skillRating as number,
        mannerRating: data.mannerRating as number,
        comment: data.comment as string | undefined,
      },
    });

    // 대상 사용자 매너 점수 업데이트
    const avg = await this.prisma.review.aggregate({
      where: { targetId: data.targetId as string },
      _avg: { mannerRating: true },
    });

    if (avg._avg.mannerRating) {
      await this.prisma.user.update({
        where: { id: data.targetId as string },
        data: { mannerScore: avg._avg.mannerRating },
      });
    }

    return review;
  }

  async getPending(userId: string) {
    // 완료된 매치 중 아직 평가하지 않은 참가자 목록
    const completedParticipations = await this.prisma.matchParticipant.findMany({
      where: {
        userId,
        match: { status: 'completed' },
      },
      include: {
        match: {
          include: {
            participants: {
              where: { userId: { not: userId } },
              include: {
                user: { select: { id: true, nickname: true, profileImageUrl: true } },
              },
            },
          },
        },
      },
    });

    const existingReviews = await this.prisma.review.findMany({
      where: { authorId: userId },
      select: { matchId: true, targetId: true },
    });

    const reviewedSet = new Set(
      existingReviews.map((r) => `${r.matchId}:${r.targetId}`),
    );

    return completedParticipations.flatMap((p) =>
      p.match.participants
        .filter((mp) => !reviewedSet.has(`${p.matchId}:${mp.userId}`))
        .map((mp) => ({
          matchId: p.matchId,
          matchTitle: p.match.title,
          target: mp.user,
        })),
    );
  }
}
