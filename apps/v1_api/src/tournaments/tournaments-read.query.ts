import { Prisma } from '@prisma/client';

export const PUBLIC_TOURNAMENT_STATUS_FILTER: Prisma.V1TournamentWhereInput['status'] = {
  in: ['open', 'closed', 'in_progress', 'completed'],
};

/**
 * 공개 표면의 상태 조건 — **종류마다 다르다.**
 *
 * 대회의 `draft` 는 **운영자 준비 중**이라 감춘다(사용자 명시: 그대로 유지). 그런데 정규
 * 리그의 `draft` 는 **"예정"** 이고, 리그 전용 목록이 지금까지 사용자에게 보여 온 상태다.
 * 같은 열에 다른 뜻이 담겨 있다.
 *
 * 그래서 통합 목록이 리그를 담기 시작하자 **예정 리그가 통째로 사라졌다** — 2026-09-01
 * 실측: 리그 88건 중 통합 목록에 보이는 것 53건, 빠진 35건이 전부 `draft` 였다.
 *
 * ## 조건을 **더하는 방향**으로만 쓴다
 * 첫 절은 기존 조건 그대로이고 둘째 절이 리그의 `draft` 만 얹는다. 이렇게 하면
 * **대회에서 빠지는 것이 하나도 없다** — `kind: null`(R1 이전 행)도 첫 절에 그대로 걸린다.
 * `kind: { not: 'regular_league' }` 로 갈랐다면 Prisma 의 `not` 이 NULL 을 어떻게 다루느냐에
 * 따라 옛 행이 조용히 사라질 수 있었다.
 *
 * ## ⚠️ 이 값을 `where` 에 **펴 넣지(spread) 마라** — `AND` 에 담아라
 * 이건 최상위 `OR` 을 갖는다. 그런데 `TOURNAMENT_SURFACE_KIND` 도 최상위 `OR` 이라,
 * 둘을 같은 객체에 펴 넣으면 **뒤엣것이 앞엣것을 덮어 종류 필터가 조용히 사라진다.**
 * 에러도 안 나고 결과만 넓어진다.
 */
export const PUBLIC_COMPETITION_STATUS_WHERE: Prisma.V1TournamentWhereInput = {
  OR: [
    { status: PUBLIC_TOURNAMENT_STATUS_FILTER },
    { kind: 'regular_league', status: 'draft' },
  ],
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
      // 시상 화면의 '참가팀 후기' 개수 배지가 아래 reviews의 take:30 잘린 배열
      // length를 쓰면 31건째부터 틀린 숫자로 고정된다(감사 evidence) — 별도 전체
      // 카운트를 함께 내려 presenter가 잘리지 않은 총계를 노출하게 한다.
      reviews: {
        where: { hiddenAt: null },
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
