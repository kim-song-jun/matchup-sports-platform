import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(authorId: string, data: CreateReviewDto) {
    let review: Awaited<ReturnType<typeof this.prisma.review.create>>;

    try {
      review = await this.prisma.review.create({
        data: {
          matchId: data.matchId,
          authorId,
          targetId: data.targetId,
          skillRating: data.skillRating,
          mannerRating: data.mannerRating,
          comment: data.comment,
        },
      });
    } catch (err) {
      // P2002: unique constraint violation — duplicate review for same (match, author, target)
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.review.findUnique({
          where: {
            matchId_authorId_targetId: {
              matchId: data.matchId,
              authorId,
              targetId: data.targetId,
            },
          },
        });
        return { ...existing!, alreadySubmitted: true };
      }
      throw err;
    }

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

    // Fire-and-forget: notify reviewed user
    void this.notificationsService.create({
      userId: data.targetId,
      type: NotificationType.review_received,
      title: '새 리뷰가 도착했어요',
      body: '경기에서 함께한 상대방이 리뷰를 남겼습니다.',
      data: { matchId: data.matchId, authorId },
      fromUserId: authorId,
    });

    // Fire-and-forget: update ELO ratings for all participants of this match
    void this.scoring.updateEloAfterMatch(data.matchId);

    return { ...review, alreadySubmitted: false };
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
