import { Injectable, NotFoundException } from '@nestjs/common';

export interface MercenaryPost {
  id: string;
  teamId: string;
  teamName: string;
  sportType: string;
  matchDate: string;
  venue: string;
  position: string;
  count: number;
  level: number;
  fee: number;
  notes: string | null;
  status: string;
  applicants: MercenaryApplicant[];
  createdAt: string;
  createdBy: string;
}

interface MercenaryApplicant {
  userId: string;
  userName: string;
  appliedAt: string;
  status: string;
}

@Injectable()
export class MercenaryService {
  private posts: MercenaryPost[] = [
    {
      id: 'merc-001',
      teamId: 'team-001',
      teamName: 'FC 서울 유나이티드',
      sportType: 'FUTSAL',
      matchDate: '2026-03-28T14:00:00Z',
      venue: '강남 풋살파크 A코트',
      position: '공격수',
      count: 2,
      level: 3,
      fee: 15000,
      notes: '즐겁게 경기할 분 구합니다. 실력 무관!',
      status: 'open',
      applicants: [
        {
          userId: 'user-010',
          userName: '축구좋아',
          appliedAt: '2026-03-20T10:00:00Z',
          status: 'pending',
        },
      ],
      createdAt: '2026-03-19T09:00:00Z',
      createdBy: 'user-001',
    },
    {
      id: 'merc-002',
      teamId: 'team-003',
      teamName: '판교 농구단',
      sportType: 'BASKETBALL',
      matchDate: '2026-03-29T18:00:00Z',
      venue: '판교 체육관',
      position: '센터',
      count: 1,
      level: 4,
      fee: 10000,
      notes: '180cm 이상 선호합니다.',
      status: 'open',
      applicants: [],
      createdAt: '2026-03-19T11:00:00Z',
      createdBy: 'user-003',
    },
    {
      id: 'merc-003',
      teamId: 'team-005',
      teamName: '홍대 배드민턴',
      sportType: 'BADMINTON',
      matchDate: '2026-03-30T10:00:00Z',
      venue: '마포구민체육센터',
      position: '복식 파트너',
      count: 2,
      level: 3,
      fee: 8000,
      notes: null,
      status: 'open',
      applicants: [
        {
          userId: 'user-011',
          userName: '셔틀러',
          appliedAt: '2026-03-20T15:00:00Z',
          status: 'pending',
        },
        {
          userId: 'user-012',
          userName: '라켓맨',
          appliedAt: '2026-03-21T08:00:00Z',
          status: 'accepted',
        },
      ],
      createdAt: '2026-03-20T08:00:00Z',
      createdBy: 'user-005',
    },
    {
      id: 'merc-004',
      teamId: 'team-007',
      teamName: '잠실 아이스',
      sportType: 'ICE_HOCKEY',
      matchDate: '2026-04-05T20:00:00Z',
      venue: '목동 아이스링크',
      position: '윙어',
      count: 1,
      level: 4,
      fee: 30000,
      notes: '개인 장비 지참 필수. 헬멧/장갑 필수.',
      status: 'open',
      applicants: [],
      createdAt: '2026-03-20T12:00:00Z',
      createdBy: 'user-007',
    },
    {
      id: 'merc-005',
      teamId: 'team-002',
      teamName: '강남 풋살클럽',
      sportType: 'FUTSAL',
      matchDate: '2026-03-22T16:00:00Z',
      venue: '역삼 풋살장',
      position: '골키퍼',
      count: 1,
      level: 2,
      fee: 0,
      notes: '골키퍼 급구! 비용 없습니다.',
      status: 'closed',
      applicants: [
        {
          userId: 'user-013',
          userName: '골키퍼왕',
          appliedAt: '2026-03-21T07:00:00Z',
          status: 'accepted',
        },
      ],
      createdAt: '2026-03-20T18:00:00Z',
      createdBy: 'user-002',
    },
  ];

  private nextId = 6;

  findAll(filter: { sportType?: string; status?: string }) {
    let result = [...this.posts];
    if (filter.sportType) {
      result = result.filter((p) => p.sportType === filter.sportType);
    }
    if (filter.status) {
      result = result.filter((p) => p.status === filter.status);
    }
    return { items: result };
  }

  findById(id: string) {
    const post = this.posts.find((p) => p.id === id);
    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }
    return post;
  }

  create(
    userId: string,
    data: {
      teamId: string;
      matchDate: string;
      venue: string;
      position: string;
      count: number;
      level: number;
      fee: number;
      notes?: string;
    },
  ): MercenaryPost {
    const post: MercenaryPost = {
      id: `merc-${String(this.nextId++).padStart(3, '0')}`,
      teamId: data.teamId,
      teamName: '팀',
      sportType: 'FUTSAL',
      matchDate: data.matchDate,
      venue: data.venue,
      position: data.position,
      count: data.count,
      level: data.level,
      fee: data.fee,
      notes: data.notes || null,
      status: 'open',
      applicants: [],
      createdAt: new Date().toISOString(),
      createdBy: userId,
    };
    this.posts.push(post);
    return post;
  }

  apply(postId: string, userId: string) {
    const post = this.posts.find((p) => p.id === postId);
    if (!post) {
      throw new NotFoundException('용병 모집글을 찾을 수 없습니다.');
    }

    const alreadyApplied = post.applicants.some((a) => a.userId === userId);
    if (alreadyApplied) {
      return { message: '이미 지원한 모집글입니다.' };
    }

    post.applicants.push({
      userId,
      userName: '지원자',
      appliedAt: new Date().toISOString(),
      status: 'pending',
    });

    return { message: '용병 지원이 완료되었습니다.' };
  }
}
