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
          // `V1Game.state` is what actually moves when a match kicks off. The
          // `V1TournamentFixture.status` enum has four values
          // (scheduled | in_progress | completed | cancelled), but only two are
          // ever written: `scheduled` at creation (tournament-bracket.service.ts)
          // and `completed` at officialize (tournament-result-review.service.ts).
          // No writer advances it to `in_progress` or `cancelled`. The presenter
          // derives `liveStatus` from this state so the public detail response can
          // say a fixture is live at all.
          state: true,
          sides: { select: { id: true, sideKey: true } },
          participants: { select: { id: true, sideId: true, displayNameSnapshot: true } },
          currentOfficialRevision: {
            select: { id: true, state: true, score: true, goalEvents: true, officialAt: true, createdAt: true, updatedAt: true },
          },
          events: {
            where: { OR: [{ type: { in: ['GOAL', 'OWN_GOAL'] } }, { reversesEventId: { not: null } }] },
            // `payload`는 골 이벤트 백필의 `minuteKnown: false` 표식용 --
            // tournament-bracket.service.ts의 같은 인라인 select와 정확히 일치해야 한다
            // (tournament-fixture-official-result.ts 하단 주석 참고).
            select: { id: true, type: true, sideId: true, participantId: true, clockMs: true, reversesEventId: true, payload: true },
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
  // 공개 상세 응답의 recipientName은 명단 실명을 그대로 내보내지 않는다 --
  // `tournament-detail.presenter.ts`가 참가자 이름 공개 정책 정본
  // (`resolveParticipantDisplayName`, games/public-records/participant-name-gating.ts,
  // 2026-08-18 사용자 결정: 닉네임 기본 + 프로필 토글)으로 다시 해석해야 하므로,
  // 그 판정에 필요한 프로필 필드만 좁혀서 함께 가져온다. `recipient`가 null이거나
  // (미연동 레거시 수상 행) 프로필이 없으면 presenter가 저장된 스냅샷으로 폴백한다.
  awards: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      recipient: {
        select: {
          profile: {
            select: {
              realName: true,
              displayName: true,
              nickname: true,
              tournamentRealNameVisible: true,
              deletedAt: true,
            },
          },
        },
      },
    },
  },
  campaign: { select: { slug: true, status: true } },
} as const satisfies Prisma.V1TournamentInclude;

export type TournamentListRow = Prisma.V1TournamentGetPayload<{
  include: typeof TOURNAMENT_LIST_INCLUDE;
}>;

export type TournamentDetailRow = Prisma.V1TournamentGetPayload<{
  include: typeof TOURNAMENT_DETAIL_INCLUDE;
}>;
