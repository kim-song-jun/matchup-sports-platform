import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const BADGE_TYPES = [
  {
    type: 'manner_player',
    name: '매너 플레이어',
    description: '상대팀에게 높은 매너 점수를 받은 팀',
  },
  {
    type: 'punctual',
    name: '시간 엄수',
    description: '경기 시간을 항상 잘 지키는 팀',
  },
  {
    type: 'referee_hero',
    name: '심판 영웅',
    description: '자체 심판으로 다수 참여한 팀',
  },
  {
    type: 'honest_team',
    name: '정직한 팀',
    description: '팀 정보를 정확하게 기재하는 팀',
  },
  {
    type: 'newcomer',
    name: '신생팀',
    description: '플랫폼에 새로 가입한 팀',
  },
  {
    type: 'winning_streak',
    name: '연승 행진',
    description: '5연승 이상 달성한 팀',
  },
  {
    type: 'community_star',
    name: '커뮤니티 스타',
    description: '활발한 커뮤니티 활동을 하는 팀',
  },
];

@Injectable()
export class BadgesService {
  constructor(private readonly prisma: PrismaService) {}

  getBadgeTypes() {
    return BADGE_TYPES;
  }

  async getTeamBadges(teamId: string) {
    return this.prisma.badge.findMany({
      where: { teamId },
      orderBy: { earnedAt: 'desc' },
    });
  }

  async awardBadge(
    teamId: string,
    data: { type: string; name: string; description?: string },
  ) {
    return this.prisma.badge.create({
      data: {
        teamId,
        type: data.type,
        name: data.name,
        description: data.description,
      },
    });
  }
}
