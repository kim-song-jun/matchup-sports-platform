import { Injectable } from '@nestjs/common';
import type { V1AuthUser } from '../auth/v1-auth-user';
import { resolveLeagueWeekNumbers } from '../league-matches/league-week-number';
import { PrismaService } from '../prisma/prisma.service';

/**
 * 리그 상세(순위·득점·도움) 화면이 쓰는 **"이 리그에서 내가 연결할 수 있는 대진"** 목록
 * (F8, 2026-08-26).
 *
 * ## 왜 필요한가
 * 리그 상세의 득점·도움 순위 빈 상태는 "선수가 신원 연동과 경기 기록 공개에 동의하면
 * 순위가 공개돼요"라고 이유를 정직하게 말하는데, **그 화면에서 연동을 시작할 수단이
 * 없었다**. 연동 입구는 개별 경기 상세의 `LeagueClaimMyRecordSection` 하나뿐이고 리그
 * 상세는 거기로 안내하지 않았다 — 안내만 하고 길은 막아 둔 셈이다. 이 목록이 그 길이다.
 *
 * ## 무엇을 담는가 — "이미 치러져 기록이 존재하는" 대진만
 * 내 팀의 대진 중 ① 결과가 공식 확정됐고(`game.currentOfficialRevisionId != null`)
 * ② 취소·삭제되지 않았으며 ③ 아직 아무 계정에도 연결되지 않은 참가자가 남아 있고
 * ④ 내가 이미 연결된 적 없는 대진만 돌려준다. 네 조건 모두 같은 원칙에서 나온다 —
 * **여기 뜬 행을 눌렀을 때 실제로 할 일이 있어야 하고, 하고 나면 이 화면 순위에
 * 반영돼야 한다.** 어느 하나라도 어긋나면 배너가 거짓 안내가 된다. 각 조건의 근거는
 * 아래 where 절 주석 참고.
 *
 * ## 인가 — 새 규칙을 만들지 않는다
 * 대진 하나짜리 목록(`GamesService.listLeagueClaimableParticipants`)은
 * `resolveActor(..., 'participant_identity')` 로 게이트하고, 그 TEAM_MATCH 분기는
 * **두 참가팀(host / approvedApplicant)의 활성 멤버**에게 허용한다.
 *
 * 리그 범위 목록은 그 판정을 뒤집어 쓴다: 먼저 호출자의 활성 팀 멤버십을 구하고,
 * **그 팀이 host 또는 approvedApplicant 인 대진만** 고른다. 그래서 여기서 돌려주는 모든
 * 행은 대진 상세 엔드포인트의 게이트도 반드시 통과한다 — 이 목록이 그보다 넓어지는
 * 경로가 구조적으로 없다(가장 단순하고 안전한 판정을 고른 근거).
 *
 * 반대로 `platform_ops` 관리자는 resolveActor 라면 통과할 대진도 여기서는 안 보인다.
 * 의도된 좁힘이다 — 이 목록이 답하는 질문은 "운영자가 볼 수 있는 대진"이 아니라
 * "**내가** 내 기록을 연결할 대진"이고, 운영 개입 경로는 대진별 엔드포인트가 그대로
 * 유지한다.
 *
 * ## 존재하지 않는 리그 id 를 404 로 만들지 않는 이유
 * 멤버십 교집합이 비면 빈 목록이 나오므로, 없는 리그와 "내 팀이 없는 리그"가 같은 응답이
 * 된다. 404 를 붙이면 리그 id 존재 여부를 알려주는 오라클이 생기는데, 이 목록에는 그
 * 대가를 치를 이유가 없다.
 *
 * ## 성능
 * 대진 수와 무관하게 **조회 5번**으로 끝난다(멤버십 → 대진 → 참가자 IN → 연결 IN → 리그+형제 경기일).
 * 대진마다 조회를 도는 N+1 은 금지 — `GamesService.listMyTournamentFixtures` 가 세운
 * 같은 관례를 따른다.
 */
export type LeagueClaimableFixtureRow = {
  teamMatchId: string;
  /**
   * 사람이 읽는 라벨 — "<리그명> N주차".
   *
   * `V1TeamMatch.title` 을 그대로 쓰지 않는다. 그 값에는 대진 **생성 시점**의 주차가 박제돼
   * 있는데 재일정(`updateFixture`)은 `startAt` 만 갱신하므로, 일정을 옮긴 대진은 옛 주차를
   * 계속 말한다. 주차는 `startAt` 에서 매번 파생한다 — 규칙은 공개 경기기록·어드민 영상
   * 화면과 같은 단일 소스(`league-week-number.ts`)를 쓴다.
   */
  title: string;
  startAt: string;
  /** 그 대진에서 아직 아무 계정에도 연결되지 않은 참가자 수. */
  claimableCount: number;
};

export type LeagueClaimableFixturesResponse = {
  leagueId: string;
  fixtures: LeagueClaimableFixtureRow[];
};

@Injectable()
export class LeagueClaimableFixturesService {
  constructor(private readonly prisma: PrismaService) {}

  async listClaimableFixtures(
    user: V1AuthUser,
    leagueId: string,
  ): Promise<LeagueClaimableFixturesResponse> {
    const memberships = await this.prisma.v1TeamMembership.findMany({
      where: { userId: user.id, status: 'active' },
      select: { teamId: true },
    });
    const myTeamIds = [...new Set(memberships.map((membership) => membership.teamId))];
    if (myTeamIds.length === 0) {
      return { leagueId, fixtures: [] };
    }

    const fixtures = await this.prisma.v1TeamMatch.findMany({
      where: {
        leagueId,
        deletedAt: null,
        // 취소된 대진은 순위·득점 집계에서 빠진다(league-match-public.service.ts
        // playerRecords 와 같은 기준). 거기에 기록을 연결해도 이 화면의 순위에는 영영
        // 나타나지 않으므로, 이 배너가 그리로 보내면 그 자체가 거짓 안내가 된다.
        status: { not: 'cancelled' },
        // **아직 결과가 확정되지 않은 대진은 안내하지 않는다** (R5).
        //
        // 리그는 `generateFixtures` 가 시즌 전체 대진을 한 번에 만들면서 양 팀 활성 멤버
        // 전원을 자동 로스터 참가자로 함께 만든다. 그래서 미래 대진은 예외 없이 "미연결
        // 참가자 = 양 팀 로스터 전원"으로 잡힌다 — 게이트가 없으면 시즌 초 배너가 통째로
        // 아직 열리지도 않은 경기로 채워지고, 라인업에 든 적 없는 벤치 선수에게는 **미래
        // 경기만** 남는다. "이 리그에서 뛰었는데 내 기록이 없나요?"가 뛴 적이 없는(있을 수
        // 없는) 경기를 가리키는 셈이다.
        //
        // 기준을 `startAt <= now` 가 아니라 **공식 결과 존재**로 잡은 이유: 이 배너의 약속은
        // "연결하면 내 기록이 이 화면 순위에 나타난다"인데, 그 순위(playerRecords)가 세는
        // 경기 집합이 바로 `currentOfficialRevisionId != null` 이다
        // (league-match-public.service.ts). 새 규칙을 만들지 않고 순위와 **같은 경기 집합**을
        // 쓰면 "연결했는데 순위에 안 뜬다"가 구조적으로 불가능해진다.
        //
        // 경계 두 가지는 의도적으로 **제외**한다:
        // - **진행 중인 경기**: 결과가 확정되기 전이라 연결해도 실릴 기록이 없다.
        // - **끝났지만 결과 미입력**: 같은 이유로 제외한다. 결과가 확정되는 순간 이 목록에
        //   자동으로 나타나므로 안내가 사라지는 게 아니라 **미뤄질 뿐**이고, 연결 자체는
        //   경기 상세에서 언제든 할 수 있다(이 목록은 유일한 길이 아니라 발견 수단이다).
        game: { is: { currentOfficialRevisionId: { not: null } } },
        OR: [{ hostTeamId: { in: myTeamIds } }, { approvedApplicantTeamId: { in: myTeamIds } }],
      },
      select: { id: true, startAt: true, game: { select: { id: true } } },
      orderBy: { startAt: 'asc' },
    });

    const gameIdByFixtureId = new Map<string, string>();
    for (const fixture of fixtures) {
      // where 의 `game: { is: ... }` 가 이미 게임 없는 대진을 걸렀지만, Prisma 는 관계
      // 필터를 select 타입에 반영하지 않아 `game` 이 여전히 nullable 이다 — 타입 좁히기.
      if (fixture.game !== null) {
        gameIdByFixtureId.set(fixture.id, fixture.game.id);
      }
    }
    const gameIds = [...gameIdByFixtureId.values()];
    if (gameIds.length === 0) {
      return { leagueId, fixtures: [] };
    }

    const participants = await this.prisma.v1GameParticipant.findMany({
      where: { gameId: { in: gameIds } },
      select: { id: true, gameId: true },
    });
    if (participants.length === 0) {
      return { leagueId, fixtures: [] };
    }

    const links = await this.prisma.v1ParticipantIdentityLinkCurrent.findMany({
      where: { participantId: { in: participants.map((participant) => participant.id) } },
      select: { participantId: true, userId: true },
    });
    const linkedUserByParticipantId = new Map(links.map((link) => [link.participantId, link.userId]));

    const claimableCountByGameId = new Map<string, number>();
    // 내가 이미 연결된 경기는 통째로 뺀다. 남은 미연결 참가자는 전부 **남의 자리**라,
    // 그 경기를 다시 안내하면 두 번째 자리를 고르라고 부추기는 셈이다 — 서버에
    // (gameId, userId) 유니크가 없어서 실제로 신청이 통과한다(첫 요청은 409 가 아니다).
    const gamesAlreadyLinkedToMe = new Set<string>();
    for (const participant of participants) {
      const linkedUserId = linkedUserByParticipantId.get(participant.id);
      if (linkedUserId === undefined) {
        claimableCountByGameId.set(
          participant.gameId,
          (claimableCountByGameId.get(participant.gameId) ?? 0) + 1,
        );
        continue;
      }
      if (linkedUserId === user.id) {
        gamesAlreadyLinkedToMe.add(participant.gameId);
      }
    }

    // 라벨용 리그명 + 주차 파생에 필요한 형제 경기일. 한 번의 조회로 둘 다 얻는다.
    // 형제 조건은 `deletedAt: null` 뿐이다 — 취소된 대진도 경기일로 세야 공개 경기기록·
    // 어드민 영상 화면과 주차가 어긋나지 않는다(league-week-number.ts 참고).
    const league = await this.prisma.v1League.findUnique({
      where: { id: leagueId },
      select: { title: true, teamMatches: { where: { deletedAt: null }, select: { startAt: true } } },
    });
    const weekNumbers = resolveLeagueWeekNumbers(
      new Map([[leagueId, (league?.teamMatches ?? []).map((sibling) => sibling.startAt)]]),
      fixtures.map((fixture) => ({ id: fixture.id, leagueId, startAt: fixture.startAt })),
    );

    return {
      leagueId,
      fixtures: fixtures.flatMap((fixture) => {
        const gameId = gameIdByFixtureId.get(fixture.id);
        if (gameId === undefined || gamesAlreadyLinkedToMe.has(gameId)) return [];
        const claimableCount = claimableCountByGameId.get(gameId) ?? 0;
        // 연결할 사람이 없는 대진은 목록에서 뺀다 — 눌러 봐야 "연결할 참가자가 없어요"
        // 만 보게 된다.
        if (claimableCount === 0) return [];
        return [
          {
            teamMatchId: fixture.id,
            // 리그명이 비어 있을 리는 없지만(대진이 있으면 리그가 있다), 라벨이 "undefined
            // N주차"가 되는 것보다는 주차만 말하는 편이 낫다.
            title: [league?.title, `${weekNumbers.get(fixture.id) ?? 1}주차`].filter(Boolean).join(' '),
            startAt: fixture.startAt.toISOString(),
            claimableCount,
          },
        ];
      }),
    };
  }
}
