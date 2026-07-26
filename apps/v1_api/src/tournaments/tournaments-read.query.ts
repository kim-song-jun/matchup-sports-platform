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
            include: { team: { select: { id: true, name: true } } },
          },
        },
      },
      standings: {
        orderBy: { position: 'asc' },
        include: {
          registration: {
            include: { team: { select: { id: true, name: true } } },
          },
        },
      },
    },
  },
  fixtures: {
    orderBy: [{ round: 'asc' }, { fixtureNumber: 'asc' }],
    include: {
      homeRegistration: {
        include: { team: { select: { id: true, name: true } } },
      },
      awayRegistration: {
        include: { team: { select: { id: true, name: true } } },
      },
      result: { include: { goals: { orderBy: { createdAt: 'asc' } } } },
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
