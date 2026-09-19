import { Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { createTeamMatchScheduleInTx } from '../team-schedules/team-schedules.service';
import { scheduleLeagueResultEntryReminder } from '../jobs/league-reminders/league-result-entry-reminder.service';
import { participantDisplayName } from '../tournaments/participant-display-name';
import { findTournamentOnSurfaceOrThrow } from '../tournaments/tournament-surface-lookup';
import {
  fillLeagueTeamRoster,
  notifyLeagueRosterFillOutcomes,
  type LeagueRosterFillOutcome,
} from './league-roster-autofill';

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
 * 스펙이 `league-match-admin.service.spec.ts` 에 있다(자동 경로 1건 + 수동 경로 1건).
 * "행 수가 같다" 로 뭉뚱그리지 않는다 — 하나가 빠지고 다른 하나가 두 번 생기면 총계는 같다.
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

type ParticipantProfile = { nickname: string | null; displayName: string | null };

/** 자동 로스터를 만들 만큼의 팀 정보 — `loadTeamsWithMembers` 가 돌려주는 모양. */
export interface LeagueFixtureTeam {
  id: string;
  name: string;
  memberships: Array<{ id: string; user: { profile: ParticipantProfile | null } }>;
  /** 이 리그의 참가 명단(confirmed 신청에서 제외되지 않은 선수). 비어 있으면 명단 미제출이다. */
  registeredPlayers: Array<{ id: string; userId: string; user: { profile: ParticipantProfile | null } }>;
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

export interface LeagueRosterEntry {
  sourceParticipantId: string;
  userId?: string;
  displayNameSnapshot: string;
}

/**
 * 한 팀의 경기 명단. 정본 §3 "명단 = 출전자" — 참가 명단이 있으면 그 선수들을 계정과 함께
 * 넣고, 게임 생성·명단 동기화가 ROSTER_ASSERTED 연결을 만든다(대회와 같은 경로).
 *
 * 명단이 없는 팀은 팀원 전원을 **계정 없이** 넣는다. 명단을 내지 않은 팀원 전원을 출전자로
 * 연결하면 뛰지 않은 사람이 상호평가 대상(reviews.service.ts)과 선수 카드 기록에 오르고,
 * "이 선수가 저예요" 신청 목록(연결 없는 참가자만)에서도 빠진다.
 *
 * 대진 생성과 명단 동기화(`league-roster-sync.ts`)가 같은 규칙을 쓴다.
 */
export function leagueTeamRosterEntries(team: LeagueFixtureTeam): LeagueRosterEntry[] {
  if (team.registeredPlayers.length > 0) {
    return team.registeredPlayers.map((player) => ({
      sourceParticipantId: player.id,
      userId: player.userId,
      displayNameSnapshot: participantDisplayName(player),
    }));
  }
  return team.memberships.map((membership) => ({
    sourceParticipantId: membership.id,
    displayNameSnapshot: participantDisplayName(membership),
  }));
}

function fixtureRoster(team: LeagueFixtureTeam, sideKey: V1GameSideKey) {
  return leagueTeamRosterEntries(team).map((entry) => ({ ...entry, sideKey }));
}

/**
 * 대진 생성·명단 동기화가 읽는 팀 정보 — 활성 멤버십과 이 리그의 참가 명단.
 *
 * **`V1TournamentPlayer` 행이 아예 없는 confirmed 등록은 여기서 즉시 채운다** (#9,
 * 2026-09-19 QA). 원래는 D10 크론(`league-roster-autoconfirm.service.ts`)만 채웠는데,
 * 대진 생성이 그보다 먼저 일어나면(흔한 운영 순서) 명단 없는 팀이
 * `leagueTeamRosterEntries()`의 계정 없는 폴백을 타고, 그 경기가 크론 전에 시작·종료되면
 * 영영 못 고친다 — `league-roster-autofill.ts` 상단 주석 참고.
 *
 * "비어 있다" 를 **활성 선수(`removedAt: null`) 수** 로 재지 않는다 — 크론과 똑같이
 * `_count.players`(전체 행 수, `removedAt` 무관)로 판정한다. 활성 수로 재면 "한 번
 * 올렸다가 팀장이 전원 뺀 팀" 까지 다시 채워 버리는데, 그건 정책상 자동 채움 대상이
 * 아니다(`league-roster-autofill.ts` 참고) — 게다가 방금 뺀 그 유저를 그 자리에서 다시
 * 채우려다 유니크 제약에 걸려 **선수 삭제 트랜잭션 자체가 롤백된 적**이 있다
 * (`removePlayer` → `syncLeagueRosterLineups` → 이 함수, 같은 트랜잭션).
 */
export async function loadLeagueTeamRosters(
  tx: Prisma.TransactionClient,
  leagueId: string,
  teamIds: string[],
): Promise<Map<string, LeagueFixtureTeam>> {
  const profile = { select: { profile: { select: { nickname: true, displayName: true } } } } as const;
  const playerSelect = {
    where: { removedAt: null },
    orderBy: { id: 'asc' },
    select: { id: true, userId: true, user: profile },
  } as const;
  const teams = await tx.v1Team.findMany({
    where: { id: { in: teamIds }, status: 'active', deletedAt: null },
    select: {
      id: true,
      name: true,
      memberships: {
        where: { status: 'active' },
        orderBy: { id: 'asc' },
        // userId 를 읽지 않는다 — 명단 미제출 팀의 팀원은 계정 없이 들어간다.
        select: { id: true, user: profile },
      },
    },
  });
  const registrations = await tx.v1TournamentRegistration.findMany({
    where: { tournamentId: leagueId, teamId: { in: teamIds }, status: 'confirmed' },
    select: { id: true, teamId: true, players: playerSelect, _count: { select: { players: true } } },
  });

  const emptyRegistrations = registrations.filter((row) => row._count.players === 0);
  const fillOutcomes: LeagueRosterFillOutcome[] = [];
  for (const registration of emptyRegistrations) {
    fillOutcomes.push(await fillLeagueTeamRoster(tx, leagueId, registration));
  }
  if (emptyRegistrations.length > 0) {
    const refilled = await tx.v1TournamentRegistration.findMany({
      where: { id: { in: emptyRegistrations.map((row) => row.id) } },
      select: { id: true, players: playerSelect },
    });
    const refilledById = new Map(refilled.map((row) => [row.id, row.players]));
    for (const registration of emptyRegistrations) {
      registration.players = refilledById.get(registration.id) ?? registration.players;
    }
  }
  if (fillOutcomes.length > 0) {
    // 크론이 자동 채움을 알리는 것과 같은 이유 — 대진 생성이 먼저 채우면 그 등록은
    // 크론의 `players: { none: {} }` 대상에서도 빠지니, 여기서 안 알리면 팀장은 영영
    // 통보를 못 받는다(`league-roster-autofill.ts` 참고).
    const league = await findTournamentOnSurfaceOrThrow(tx, ['regular_league'], {
      where: { id: leagueId },
      select: { title: true },
    });
    await notifyLeagueRosterFillOutcomes(tx, { id: leagueId, title: league.title }, fillOutcomes);
  }

  const playersByTeam = new Map(registrations.map((row) => [row.teamId, row.players]));
  return new Map(
    teams.map((team) => [team.id, { ...team, registeredPlayers: playersByTeam.get(team.id) ?? [] }]),
  );
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
      // A league match is also an official tournament-scoped TeamMatch. Keep
      // the canonical ownership column populated at creation time so audit
      // rows can use the composite (tournamentId, teamMatchId) scope without
      // mutating historical rows from the audit writer.
      tournamentId: input.leagueId,
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
      participants: [...fixtureRoster(home, V1GameSideKey.HOME), ...fixtureRoster(away, V1GameSideKey.AWAY)],
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
      // 자동 생성과 수동 추가가 **같은 함수**를 쓰므로 경로를 단정하지 않는다 —
      // 이 문구는 어드민 화면(팀매치 상세의 applications.message)에 그대로 노출된다.
      message: '리그 대진 편성',
    },
  });

  // ⑤ 결과 입력 리마인더. 사용자 확정: 경기 시작 +24시간에도 결과 미입력이면 운영자
  //    리마인더 1회. updateFixture() 가 시작 시각을 바꾸면 새 세대로 다시 스케줄한다.
  await scheduleLeagueResultEntryReminder(tx, { teamMatchId: teamMatch.id, startAt });

  return teamMatch.id;
}
