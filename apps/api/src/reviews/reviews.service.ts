import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
  ) {}

  async create(authorId: string, data: CreateReviewDto) {
    const review = await this.prisma.review.create({
      data: {
        matchId: data.matchId,
        authorId,
        targetId: data.targetId,
        skillRating: data.skillRating,
        mannerRating: data.mannerRating,
        comment: data.comment,
      },
    });

    // 대상 사용자 매너 점수 업데이트
    const avg = await this.prisma.review.aggregate({
      where: { targetId: data.targetId },
      _avg: { mannerRating: true },
    });

    if (avg._avg.mannerRating) {
      await this.prisma.user.update({
        where: { id: data.targetId },
        data: { mannerScore: avg._avg.mannerRating },
      });
    }

    // Fire-and-forget: update ELO ratings for all participants of this match
    void this.scoring.updateEloAfterMatch(data.matchId);

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
      existingReviews.map((r: { matchId: string; targetId: string }) => `${r.matchId}:${r.targetId}`),
    );

    return completedParticipations.flatMap((p: { matchId: string; match: { title: string; participants: Array<{ userId: string; user?: { id: string; nickname: string } }> } }) =>
      p.match.participants
        .filter((mp: { userId: string; user?: { id: string; nickname: string } }) => !reviewedSet.has(`${p.matchId}:${mp.userId}`))
        .map((mp: { userId: string; user?: { id: string; nickname: string } }) => ({
          matchId: p.matchId,
          matchTitle: p.match.title,
          target: mp.user,
        })),
    );
  }
}
