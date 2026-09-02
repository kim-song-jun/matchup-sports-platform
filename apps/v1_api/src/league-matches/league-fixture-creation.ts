import { Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { createTeamMatchScheduleInTx } from '../team-schedules/team-schedules.service';
import { scheduleLeagueResultEntryReminder } from '../jobs/league-reminders/league-result-entry-reminder.service';

/**
 * 리그 대진 **한 경기**를 만드는 단일 경로.
 *
 * 자동 생성(라운드로빈 전체)과 수동 추가(운영자가 한 경기씩)가 **같은 함수**를 부른다.
 * 두 경로가 각자 팀매치를 만들면 한쪽에만 부수효과가 빠지는데, 그게 실제로 일어났던 사고다:
 * 리그 대진이 팀 일정을 만들지 않아 참가 팀 캘린더에 리그 경기가 한 건도 안 뜨고, 용병
 * 모집(일정의 자식 리소스)도 못 열고, D-1 리마인더 대상에서도 빠졌었다.
 *
 * ## 한 경기를 만든다는 것은 다섯 가지를 만든다는 뜻이다
 * 1. `V1TeamMatch` — 양 팀이 이미 확정된 `status: 'matched'` 행
 * 2. **양 팀의 팀 일정 2건** — "매치가 곧 팀일정" 불변식(team-schedules.service.ts).
 *    일반 팀매치와 달리 호스트 먼저·상대 나중이 아니라 두 팀 것을 여기서 함께 만든다.
 * 3. `V1Game` + 사이드 2개 + **자동 로스터** — 아래 `participants` 주석 참고
 * 4. **승인된 신청서** — 재생성한 대진과 처음 생성한 대진이 같은 계약을 갖게 한다
 * 5. **결과 입력 리마인더** — 시작 +24시간에도 결과가 없으면 운영자에게 1회
 *
 * 하나라도 빠지면 화면·알림·정산 중 한 곳이 조용히 비므로, 이 다섯을 각각 단언하는
 * 스펙이 `league-fixture-creation.integration-spec.ts` 에 있다.
 */
export interface LeagueFixtureCreationInput {
  leagueId: string;
  adminUserId: string;
  sportId: string;
  regionId: string;
  competitionConfigId: string;
  /** 이 경기의 제목. 자동·수동 모두 `leagueFixtureTitle()` 로 만든다. */
  title: string;
  placeName: string;
  startAt: Date;
  /** 슬롯 계산이 있을 때만. 없으면 종료 시각을 저장하지 않는다. */
  endAt: Date | null;
  home: LeagueFixtureTeam;
  away: LeagueFixtureTeam;
}

/** 자동 로스터를 만들 만큼의 팀 정보 — `loadTeamsWithMembers` 가 돌려주는 모양. */
export interface LeagueFixtureTeam {
  id: string;
  name: string;
  memberships: Array<{ id: string; user: { profile: { nickname: string | null; displayName: string | null } | null } }>;
}

/**
 * 대진 제목. **자동·수동이 같은 규칙을 쓴다** — 템플릿 문자열을 두 곳에 복사하면 한쪽만
 * 바뀌어 같은 리그 안에서 제목 모양이 갈린다.
 *
 * - `matchday`/`orderInDay` 가 있으면(= 한 구장 순차 진행 슬롯) "N주차 M경기".
 *   하루에 여러 경기가 서면 "N주차" 만으로는 팀 화면에서 같은 제목이 반복된다.
 * - 없으면 "N주차".
 *
 * ⚠️ `round`(주차 번호)는 **어디에도 저장되지 않는다** — `V1TeamMatch` 에 컬럼이 없고
 * 순위 계산(`league-standings.ts`)도 쓰지 않는다. 화면의 주차 라벨은 `startAt` 순서에서
 * 파생한다(`league-fixture-videos.service.ts`). 그래서 수동 대진은 주차를 받지 않고
 * 제목만 받는다(2026-09-02 사용자 확정, Task 164 Ambiguity 3).
 */
export function leagueFixtureTitle(input: {
  leagueTitle: string;
  round: number;
  matchday?: number;
  orderInDay?: number;
}): string {
  if (input.matchday !== undefined && input.orderInDay !== undefined) {
    return `${input.leagueTitle} ${input.matchday}주차 ${input.orderInDay}경기`;
  }
  return `${input.leagueTitle} ${input.round}주차`;
}

export async function createLeagueFixture(
  tx: Prisma.TransactionClient,
  games: GamesService,
  input: LeagueFixtureCreationInput,
): Promise<string> {
  const { home, away, title, startAt, endAt } = input;

  // ① 팀매치. 리그 대진은 생성 시점에 양 팀이 확정이므로 곧바로 matched 다.
  const teamMatch = await tx.v1TeamMatch.create({
    data: {
      hostTeamId: home.id,
      createdByUserId: input.adminUserId,
      sportId: input.sportId,
      regionId: input.regionId,
      title,
      placeName: input.placeName,
      startAt,
      endAt: endAt ?? undefined,
      status: 'matched',
      approvedApplicantTeamId: away.id,
      competitionConfigVersionId: input.competitionConfigId,
      leagueId: input.leagueId,
    },
  });

  // ② 양 팀의 팀 일정. "매치가 곧 팀일정" 불변식(team-schedules.service.ts:37-41)이
  //    리그 대진에는 지켜지지 않고 있었다 — 이 raw create 경로가 team-matches.service.ts 의
  //    create()/approveApplication() 이 부르는 createTeamMatchScheduleInTx 를 우회해서,
  //    참가 팀 캘린더에 리그 경기가 한 건도 안 뜨고 용병 모집도 못 열고 D-1 일정 리마인더
  //    대상에서도 빠졌다. title/startAt/endAt 은 방금 create 에 넘긴 것과 **같은 로컬
  //    변수**를 그대로 재사용한다 — create() 반환 행에서 되읽지 않는다.
  await createTeamMatchScheduleInTx(tx, home.id, teamMatch.id, title, startAt, endAt);
  await createTeamMatchScheduleInTx(tx, away.id, teamMatch.id, title, startAt, endAt);

  // ③ 게임 + 사이드 2개 + 자동 로스터.
  await games.createFromSourceInTransaction(
    tx,
    {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: teamMatch.id,
      competitionConfigVersionId: input.competitionConfigId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: home.id, displayNameSnapshot: home.name },
        { sideKey: V1GameSideKey.AWAY, teamId: away.id, displayNameSnapshot: away.name },
      ],
      // 자동 로스터에는 **사람(userId)을 붙이지 않는다.** 이 목록은 팀이 이 경기를
      // 위해 작성한 명단이 아니라 대진 생성 시점의 **팀 전체 활성 멤버 스냅샷**이다
      // (loadTeamsWithMembers 의 `status: 'active'` 전원). 여기에 userId 를 실으면
      // createFromSourceInTransaction 이 그 전원에게 신원 연결(ROSTER_ASSERTED)을
      // 만드는데, 만들어진 사실이 전부 거짓이 된다:
      //   · 선수 카드가 한 경기도 안 뛴 팀원에게 "기록 공개 동의를 켜면 골·도움·출전이
      //     열려요"라고 안내한다. 정작 켜도 출전이 0이라 아무것도 열리지 않는다 —
      //     2026-08-24 alpha 실측으로 잡은 '거짓 약속' 결함이다. **이 한 줄은 2026-08-26
      //     에 카드 쪽에서 한 겹 막혔다**: 판정 필드가 옛 `hasRecordLinks`("연결이 있는가")
      //     에서 `hasUnlockableRecords`("동의를 켜면 실제로 열릴 공식 결과가 있는가")로
      //     바뀌어(games/public-records/player-card-stats.ts), 연결만 있고 공식 결과가
      //     0건이면 카드는 이제 동의가 아니라 출전을 안내한다. 회귀는
      //     profile/player-card.spec.ts 의 "동의를 켜도 열릴 기록이 없는 사용자" 블록이
      //     못박는다. **그래도 여기서 userId 를 실어도 된다는 뜻은 아니다** — 아래 근거는
      //     카드 수정과 무관하게 그대로 살아 있다.
      //   · 상호평가 대상 로스터(reviews.service.ts 의 `userId: { not: null }` 조회)가
      //     라인업이 아니라 이 행을 그대로 읽어, 뛰지 않은 팀원 전원이 평가 대상으로 뜬다.
      //     이 조회는 손대지 않았으므로 **여전히 깨진다** — 카드가 고쳐졌으니 괜찮다고
      //     읽지 말 것. 아래 본인 확인 경로 문단도 마찬가지로 유효하다.
      // 개인 기록으로 이어지는 연결은 **팀이 실제로 작성한 라인업**에서만 생긴다
      // (team-matches/team-match-lineup.service.ts 의 saveLineup — 새 리비전의 참가자
      // 행마다 팀장 이름으로 연결을 만든다). 대회 쪽(tournament-bracket.service.ts)이
      // `userId: player.userId` 를 싣는 것과 모순되지 않는다: 그 명단은 팀이 대회에
      // 등록한 선수 명단(V1TournamentRegistrationPlayer)이라 이미 팀의 작성물이다.
      //
      // 연결이 없는 채로 두는 것이 오히려 본인 확인 경로를 연다 —
      // listLeagueClaimableParticipants 는 "연결 없는 참가자"만 돌려주므로, 미리 연결을
      // 만들어 두면 선수가 자기 기록을 신청(requestIdentityLink → 팀장 승인)할 길까지
      // 함께 막힌다.
      participants: [
        ...home.memberships.map((m) => ({
          sourceParticipantId: m.id,
          sideKey: V1GameSideKey.HOME,
          displayNameSnapshot: m.user.profile?.nickname ?? m.user.profile?.displayName ?? '팀원',
        })),
        ...away.memberships.map((m) => ({
          sourceParticipantId: m.id,
          sideKey: V1GameSideKey.AWAY,
          displayNameSnapshot: m.user.profile?.nickname ?? m.user.profile?.displayName ?? '팀원',
        })),
      ],
    },
    {
      actor: { actorType: 'USER', actorUserId: input.adminUserId, role: 'platform_ops' },
      expectedVersion: 0,
      durableCommandId: `league-fixture-create:${teamMatch.id}`,
      payloadHash: canonicalGameCommandPayloadHash({ teamMatchId: teamMatch.id, leagueId: input.leagueId }),
    },
  );

  // ④ 승인된 신청서.
  await tx.v1TeamMatchApplication.create({
    data: {
      teamMatchId: teamMatch.id,
      applicantTeamId: away.id,
      appliedByUserId: input.adminUserId,
      status: 'approved',
      reviewedByUserId: input.adminUserId,
      reviewedAt: new Date(),
      message: '리그 대진 자동 생성',
    },
  });

  // ⑤ 결과 입력 리마인더. 사용자 확정: 경기 시작 +24시간에도 결과 미입력이면 운영자
  //    리마인더 1회. updateFixture() 가 시작 시각을 바꾸면 새 세대로 다시 스케줄한다.
  await scheduleLeagueResultEntryReminder(tx, { teamMatchId: teamMatch.id, startAt });

  return teamMatch.id;
}
