import { Prisma } from '@prisma/client';

export const PUBLIC_TOURNAMENT_STATUS_FILTER: Prisma.V1TournamentWhereInput['status'] = {
  in: ['open', 'closed', 'in_progress', 'completed'],
};

export const TOURNAMENT_LIST_INCLUDE = {
  sport: { select: { code: true, name: true } },
  _count: {
    select: {
      registrations: {
        where: { status: 'confirmed' },
      },
    },
  },
  registrations: {
    where: { status: { in: ['awaiting_payment', 'payment_checking', 'paid'] } },
    select: { status: true },
  },
  campaign: { select: { slug: true, status: true } },
} as const satisfies Prisma.V1TournamentInclude;

export const TOURNAMENT_DETAIL_INCLUDE = {
  sport: { select: { code: true, name: true } },
  groups: {
    orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }],
    include: {
      groupTeams: {
        orderBy: { sortOrder: 'asc' },
        include: {
          registration: {
            include: {
              team: { select: { id: true, name: true, profile: { select: { logoUrl: true } } } },
            },
          },
        },
      },
      standings: {
        orderBy: { position: 'asc' },
        include: {
          registration: {
            include: {
              team: {
                select: {
                  id: true,
                  name: true,
                  profile: { select: { logoUrl: true } },
                },
              },
            },
          },
        },
      },
    },
  },
  fixtures: {
    orderBy: [{ round: 'asc' }, { fixtureNumber: 'asc' }],
    include: {
      homeRegistration: {
        include: { team: { select: { id: true, name: true, profile: { select: { logoUrl: true } } } } },
      },
      awayRegistration: {
        include: { team: { select: { id: true, name: true, profile: { select: { logoUrl: true } } } } },
      },
      // R3 §4-3단계: 공개 상세의 fixtures[].result는 이제 아래 game.currentOfficialRevision
      // 에서 조립한다(tournament-detail.presenter.ts). result/goals 조인은 §4-4단계까지는
      // 의도적으로 남겨둔다 -- docs/ops/legacy-game-result-r3-removal-inventory.md §4.
      result: { include: { goals: { orderBy: { createdAt: 'asc' } } } },
      game: {
        select: {
          // `V1Game.state` is what actually moves when a match kicks off —
          // `V1TournamentFixture.status` only ever goes scheduled → completed
          // (tournament-result-review.service.ts marks it at officialize; no
          // writer advances it to `in_progress`). The presenter derives
          // `liveStatus` from this so the public detail response can say a
          // fixture is live at all.
          state: true,
          sides: { select: { id: true, sideKey: true } },
          participants: { select: { id: true, displayNameSnapshot: true } },
          currentOfficialRevision: {
            select: { id: true, state: true, score: true, officialAt: true, createdAt: true, updatedAt: true },
          },
          events: {
            where: { OR: [{ type: 'GOAL' }, { reversesEventId: { not: null } }] },
            select: { id: true, type: true, sideId: true, participantId: true, clockMs: true, reversesEventId: true },
          },
        },
      },
      videos: { orderBy: { sortOrder: 'asc' } },
    },
  },
  announcements: {
    where: { audience: 'public', publishedAt: { not: null } },
    orderBy: { publishedAt: 'desc' },
  },
  sponsors: {
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  registrations: {
    where: {
      status: {
        in: ['confirmed', 'waitlisted', 'awaiting_payment', 'payment_checking', 'paid'],
      },
    },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          profile: { select: { logoUrl: true } },
          region: { select: { name: true } },
        },
      },
    },
  },
  _count: {
    select: {
      registrations: {
        where: { status: 'confirmed' },
      },
    },
  },
  reviews: {
    where: { hiddenAt: null },
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      author: {
        select: {
          id: true,
          profile: { select: { nickname: true, profileImageUrl: true } },
        },
      },
    },
  },
  awards: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
  campaign: { select: { slug: true, status: true } },
} as const satisfies Prisma.V1TournamentInclude;

export type TournamentListRow = Prisma.V1TournamentGetPayload<{
  include: typeof TOURNAMENT_LIST_INCLUDE;
}>;

export type TournamentDetailRow = Prisma.V1TournamentGetPayload<{
  include: typeof TOURNAMENT_DETAIL_INCLUDE;
}>;
