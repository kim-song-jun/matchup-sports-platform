import {
  Prisma,
  PrismaClient,
  V1GameSourceType,
  V1IdentityActorType,
  V1TeamMatchApplicationStatus,
  V1TeamMatchStatus,
} from '@prisma/client';
// 같은 `prisma/` 폴더 안의 모듈이라 프로덕션 이미지에도 함께 복사된다(`seed-alpha-tournament-qa.ts`
// 상단 주석과 같은 이유). `assertAlphaSeedAllowed`는 alpha 전용 4중 가드를 그대로 재사용하고,
// `ensureAlphaQaRecordConsent`는 득점/도움 순위 화면을 실 API로 검증할 수 있게 페르소나의
// 공개 기록 동의를 GRANTED로 만드는 헬퍼다 — 기존 alpha QA 페르소나 관행과 동일한 소스를 쓴다.
import { assertAlphaSeedAllowed, ensureAlphaQaRecordConsent } from './seed-alpha-tournament-qa';

/**
 * alpha 리그(League) 화면 QA 시드 (Task R10).
 *
 * 배경: `V1League`를 만드는 시드가 전무해 리그 화면(순위표·확정/미확정 대진 배너·득점/도움
 * 순위)을 alpha에서 눈으로 검증할 방법이 없었다. 대회(Tournament)에는 이미
 * `seed-alpha-tournament-qa.ts`가 있는데 리그에는 그 대응물이 없었다 — 이 파일이 그 공백을
 * 메운다.
 *
 * 이 파일은 `../src/...`를 import할 수 없다(alpha 프로덕션 이미지에 `dist/`·`prisma/`·
 * `node_modules`만 COPY되고 `src/`는 없다 — `seed-alpha-tournament-qa.ts` 상단 주석 참고).
 * 그래서 `league-matches/league-match-admin.service.ts`의 `generateFixtures()`가 실제로
 * 만드는 행 모양(V1TeamMatch + V1TeamMatchApplication(approved) + V1Game + sides/lineups/
 * participants)과, `games/games.service.ts`의 `createFromSourceInTransaction()`이 만드는
 * 게임 스켈레톤(sides·lineups·participants·periods·visibility policy) 모양을 raw Prisma로
 * 그대로 재현한다 — 서비스를 재사용하는 대신 같은 결과 모양을 만든다.
 *
 * 공식 결과(V1GameResultRevision → V1GameOfficialFact)는
 * `test/league-matches/league-match-public.integration-spec.ts`가 검증한 것과 정확히 같은
 * DB 트리거 계약을 만족시켜 만든다:
 *   - v1_guard_result_participant_mutation: 참가자 행은 리비전이 DRAFT일 때만 insert 가능.
 *   - v1_block_terminal_revision_mutation: OFFICIAL로 전환된 리비전은 이후 수정 불가.
 *   - v1_guard_game_official_fact_insert: fact는 그 리비전의 score/eventsHash/officialAt과
 *     byte-exact로 일치해야 하고, home/awayTeamId는 실제 V1GameSide.teamId와 일치해야 한다.
 *
 * 득점/도움 순위 공개 게이트(`games/public-records/public-consent.ts`의
 * `isParticipantPubliclyEligible`)는 ① participant 단위 신원 연결
 * (V1ParticipantIdentityLinkCurrent) ② 그 연결의 userId에 대한 사용자 단위 동의
 * (V1UserRecordConsent.state === 'GRANTED')를 요구한다. 실제 제품에서는 라인업 저장 시
 * `GamesService.saveLineup`이 신원 연결을 자동으로 만들지만(action ROSTER_ASSERTED), 이
 * 시드는 그 결과 상태를 득점자/도움 기록이 있는 참가자에 한해 직접 재현한다(전체 로스터에
 * 강제로 동의를 심지 않는다 — 스탯이 없는 참가자는 신원 연결도 만들지 않는다).
 *
 * 멱등성: 리그·팀·선수·팀매치·게임 스켈레톤은 전부 결정적 UUID로 upsert한다. 공식 결과
 * (revision/fact/result-participant/identity-link)는 트리거가 사실상 불변으로 만들기
 * 때문에 upsert가 아니라 "이미 있으면 완전히 건너뛴다" 가드로 멱등성을 보장한다
 * (`game.currentOfficialRevisionId !== null`이면 그 픽스처의 결과 블록 전체를 skip).
 * `V1TeamMatch.status`/`completedAt`은 create에만 쓴다 — 재배포가 그 사이 스태프가 라이브로
 * 진행시킨 상태를 시드 값으로 되돌리면 안 된다(`seed-alpha-tournament-qa.ts`의 동일 관행).
 */

const LEAGUE_QA_ID = 'ad100000-0000-4000-8000-000000000001';
// 티어(1부/2부) 표본용 시리즈. 리그 QA 시드에 시리즈가 0건이라 "N부" 뱃지·시리즈 부제가
// alpha 화면에서 한 번도 확인된 적이 없었다(2026-08-21 재감사) — 티어 리그는 전부 손으로
// API 를 친 세션들이 만든 것이었다. 대진은 만들지 않는다: 뱃지·시리즈 문맥 노출이 목적이고,
// 경기 진행 검증은 위 단발 리그가 이미 덮는다.
const LEAGUE_QA_SERIES_ID = 'ad200000-0000-4000-8000-000000000001';
const LEAGUE_QA_SERIES_TITLE = '(테스트) 리그 QA 풋살 리그 체계';
const TIER_LEAGUE_IDS: readonly string[] = [
  'ad210000-0000-4000-8000-000000000001', // 1부
  'ad210000-0000-4000-8000-000000000002', // 2부
];
const LEAGUE_TITLE = '(테스트) 리그 QA 풋살 정기 리그';

const TEAM_COUNT = 4;
const PLAYERS_PER_TEAM = 4;
const TEAM_NAME_SUFFIXES = ['알파', '브라보', '찰리', '델타'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const PLACE_NAME = '서울 송파 리그 QA 구장';

type SideKey = 'HOME' | 'AWAY';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** `ad200000-…-{TTPP}` — 팀 TT 의 PP 번 선수. */
function personaId(teamNo: number, playerNo: number): string {
  return `ad200000-0000-4000-8000-${`${pad2(teamNo)}${pad2(playerNo)}`.padStart(12, '0')}`;
}
/** `ad300000-…-{T}` — 팀 슬롯 1..4. */
function teamId(teamNo: number): string {
  return `ad300000-0000-4000-8000-${String(teamNo).padStart(12, '0')}`;
}
function personaEmail(teamNo: number, playerNo: number): string {
  return `league.qa.t${pad2(teamNo)}.p${pad2(playerNo)}@teameet.test`;
}
/**
 * 010 + 8자리. `0103` 대역을 써서 tournament QA 페르소나(`0100`)·alpha QA 스쿼드(`0102`)와
 * 겹치지 않는다.
 */
function personaPhone(teamNo: number, playerNo: number): string {
  return `0103${pad2(teamNo)}${pad2(playerNo)}000`;
}
function personaNickname(teamNo: number, playerNo: number): string {
  return `리그QA${pad2(teamNo)}팀${pad2(playerNo)}`;
}
/** `ad400000-…-{F}` — 대진(V1TeamMatch) 슬롯 1..6. */
function fixtureId(fixtureNo: number): string {
  return `ad400000-0000-4000-8000-${String(fixtureNo).padStart(12, '0')}`;
}
/** `ad500000-…-{F}` — 픽스처 F 의 V1Game. 픽스처와 1:1이라 같은 번호를 쓴다. */
function gameId(fixtureNo: number): string {
  return `ad500000-0000-4000-8000-${String(fixtureNo).padStart(12, '0')}`;
}
/** `ad600000-…-{F}{side}{P}` — 픽스처 F, 사이드(1=HOME/2=AWAY), 로스터 P 번 참가자. */
function participantId(fixtureNo: number, sideKey: SideKey, playerIdx: number): string {
  const sideDigit = sideKey === 'HOME' ? '1' : '2';
  return `ad600000-0000-4000-8000-${`${pad2(fixtureNo)}${sideDigit}${pad2(playerIdx)}`.padStart(12, '0')}`;
}

interface LeagueTeamRoster {
  readonly id: string;
  readonly name: string;
  readonly playerIds: readonly string[];
}

async function ensureLeagueTeams(
  tx: Prisma.TransactionClient,
  sportId: string,
  regionId: string,
): Promise<LeagueTeamRoster[]> {
  const now = new Date();
  const teams: LeagueTeamRoster[] = [];
  for (let teamNo = 1; teamNo <= TEAM_COUNT; teamNo += 1) {
    const memberIds: string[] = [];
    for (let playerNo = 1; playerNo <= PLAYERS_PER_TEAM; playerNo += 1) {
      const id = personaId(teamNo, playerNo);
      const email = personaEmail(teamNo, playerNo);
      const user = await tx.v1User.upsert({
        where: { id },
        update: {
          email,
          phone: personaPhone(teamNo, playerNo),
          // 휴대폰 인증은 쓰기 전역 게이트의 조건이다(다른 alpha QA 페르소나와 동일 관행).
          phoneVerifiedAt: now,
          emailVerifiedAt: now,
          accountStatus: 'active',
          onboardingStatus: 'completed',
          deletedAt: null,
        },
        create: {
          id,
          email,
          phone: personaPhone(teamNo, playerNo),
          phoneVerifiedAt: now,
          emailVerifiedAt: now,
          accountStatus: 'active',
          onboardingStatus: 'completed',
        },
      });
      await tx.v1UserProfile.upsert({
        where: { userId: user.id },
        update: {
          nickname: personaNickname(teamNo, playerNo),
          displayName: personaNickname(teamNo, playerNo),
          realName: `리그큐에이${pad2(teamNo)}${pad2(playerNo)}`,
          gender: playerNo % 2 === 0 ? 'female' : 'male',
          birthDate: '1996-03-10',
          bio: 'ALPHA 리그 QA 검증용 가상 선수입니다.',
          deletedAt: null,
        },
        create: {
          userId: user.id,
          nickname: personaNickname(teamNo, playerNo),
          displayName: personaNickname(teamNo, playerNo),
          realName: `리그큐에이${pad2(teamNo)}${pad2(playerNo)}`,
          gender: playerNo % 2 === 0 ? 'female' : 'male',
          birthDate: '1996-03-10',
          bio: 'ALPHA 리그 QA 검증용 가상 선수입니다.',
        },
      });
      // 득점/도움 순위 화면을 실 API로 검증하려면 사용자 단위 공개 기록 동의가 GRANTED여야
      // 한다(games/public-records/public-consent.ts). 최초 행만 GRANTED로 만들고 이후
      // 철회는 덮지 않는다 — ensureAlphaQaRecordConsent 자체가 upsert(update: {})다.
      await ensureAlphaQaRecordConsent(tx, user.id);
      memberIds.push(user.id);
    }

    const id = teamId(teamNo);
    const [ownerId] = memberIds;
    const name = `(테스트) 리그 QA ${TEAM_NAME_SUFFIXES[teamNo - 1]}FC`;
    const team = await tx.v1Team.upsert({
      where: { id },
      update: {
        ownerUserId: ownerId,
        sportId,
        regionId,
        name,
        status: 'active',
        joinPolicy: 'approval_required',
        membersVisible: true,
        memberCount: memberIds.length,
        deletedAt: null,
      },
      create: {
        id,
        ownerUserId: ownerId,
        sportId,
        regionId,
        name,
        status: 'active',
        joinPolicy: 'approval_required',
        membersVisible: true,
        memberCount: memberIds.length,
      },
    });
    await tx.v1TeamProfile.upsert({
      where: { teamId: team.id },
      update: { description: 'ALPHA 리그 QA 검증용 가상 팀입니다.', deletedAt: null },
      create: { teamId: team.id, description: 'ALPHA 리그 QA 검증용 가상 팀입니다.' },
    });
    for (const [index, memberId] of memberIds.entries()) {
      const role = index === 0 ? 'owner' : index === 1 ? 'manager' : 'member';
      await tx.v1TeamMembership.upsert({
        where: { teamId_userId: { teamId: team.id, userId: memberId } },
        update: { role, status: 'active', joinedAt: now, leftAt: null },
        create: { teamId: team.id, userId: memberId, role, status: 'active', joinedAt: now },
      });
    }
    await tx.v1Team.update({ where: { id: team.id }, data: { memberCount: memberIds.length, managerCount: 1 } });
    teams.push({ id: team.id, name: team.name, playerIds: memberIds });
  }
  return teams;
}

interface ScorerSpec {
  readonly sideKey: SideKey;
  /** 1-based 인덱스 — 해당 사이드 로스터(팀 memberIds)에서 몇 번째 선수인지. */
  readonly playerIdx: number;
  readonly goals: number;
  readonly assists: number;
}

interface FixtureSpec {
  readonly no: number;
  readonly round: number;
  readonly homeTeamNo: number;
  readonly awayTeamNo: number;
  /** now 기준 시작일 오프셋(일). 음수=이미 치른 경기, 양수=예정 경기. */
  readonly startAtOffsetDays: number;
  /** null이면 아직 공식 결과가 없는 미확정 대진(pendingFixtures로 표시됨). */
  readonly result: null | {
    readonly homeScore: number;
    readonly awayScore: number;
    readonly scorers: readonly ScorerSpec[];
  };
  /**
   * 취소된 대진. **공식 결과가 있는 채로 취소된 상태**를 만든다 — R8(순위 집계에서 제외)과
   * 화면 표기("취소됨 · 집계 제외"), 그리고 득점 순위에서도 빠지는지를 한 번에 볼 수 있어야
   * 하는데 그동안 시드에 취소 대진이 0건이라 alpha 에서 그 경로를 눈으로 확인할 방법이
   * 없었다(2026-08-21 재감사).
   */
  readonly cancelled?: boolean;
  /**
   * 몰수패(부전승). 실 제품에서는 어드민 액션이 결과 리비전의 reason 에 마커를 붙여
   * 만든다 — 시드는 그 결과 상태를 재현한다(참가자 0명·이벤트 0건·1:0 고정 스코어).
   * 공개 화면에서 일반 1:0 승리와 구분되지 않는 것이 현재 설계의 알려진 한계이고,
   * 이 대진이 그 한계를 실제로 보여주는 예시가 된다.
   */
  readonly forfeit?: boolean;
}

/**
 * 4팀 완전 라운드로빈(3주차 × 2경기 = 6경기) + 취소·몰수 표본 2경기.
 * 라운드로빈 6경기는 일부러 확정 3 / 미확정 3으로 섞고 1경기를 무승부로 만들어
 * 순위표·"확인 중" 배너·득점 순위를 한 번에 검증할 수 있게 한다.
 * 7·8번은 취소(공식 결과 有)·몰수 경로 전용이다 — 아래 각 항목 주석 참고.
 */
const FIXTURES: readonly FixtureSpec[] = [
  {
    no: 1,
    round: 1,
    homeTeamNo: 1,
    awayTeamNo: 2,
    startAtOffsetDays: -14,
    result: {
      homeScore: 3,
      awayScore: 1,
      scorers: [
        { sideKey: 'HOME', playerIdx: 1, goals: 2, assists: 0 },
        { sideKey: 'HOME', playerIdx: 2, goals: 1, assists: 0 },
        { sideKey: 'HOME', playerIdx: 3, goals: 0, assists: 2 },
        { sideKey: 'AWAY', playerIdx: 1, goals: 1, assists: 0 },
      ],
    },
  },
  {
    no: 2,
    round: 1,
    homeTeamNo: 3,
    awayTeamNo: 4,
    startAtOffsetDays: -14,
    result: {
      homeScore: 2,
      awayScore: 2, // 무승부
      scorers: [
        { sideKey: 'HOME', playerIdx: 1, goals: 2, assists: 0 },
        { sideKey: 'AWAY', playerIdx: 1, goals: 2, assists: 0 },
      ],
    },
  },
  {
    no: 3,
    round: 2,
    homeTeamNo: 1,
    awayTeamNo: 3,
    startAtOffsetDays: -7,
    result: {
      homeScore: 1,
      awayScore: 0,
      scorers: [
        { sideKey: 'HOME', playerIdx: 1, goals: 1, assists: 0 },
        { sideKey: 'HOME', playerIdx: 2, goals: 0, assists: 1 },
      ],
    },
  },
  { no: 4, round: 2, homeTeamNo: 4, awayTeamNo: 2, startAtOffsetDays: -7, result: null },
  { no: 5, round: 3, homeTeamNo: 1, awayTeamNo: 4, startAtOffsetDays: 7, result: null },
  { no: 6, round: 3, homeTeamNo: 2, awayTeamNo: 3, startAtOffsetDays: 7, result: null },
  // 7·8번은 라운드로빈의 일부가 아니라 **취소·몰수 경로 전용 표본**이다. 그 전까지 시드에
  // 취소 대진이 0건, 몰수 0건이라 R8(순위 제외)·N-4(득점 순위 제외)·"집계 제외" 표기·
  // 몰수 결과가 alpha 화면에서 한 번도 확인된 적이 없었다(2026-08-21 재감사).
  {
    // 공식 결과가 **있는데 취소된** 대진. 순위표·득점 순위 양쪽에서 빠져야 하고, 경기 일정에는
    // 점수 대신 "집계 제외"가 떠야 한다. 득점자를 일부러 넣어 둔다 — 이 골이 득점 순위에
    // 나타나면 N-4 회귀다.
    no: 7,
    round: 4,
    homeTeamNo: 1,
    awayTeamNo: 3,
    startAtOffsetDays: -3,
    cancelled: true,
    result: {
      homeScore: 5,
      awayScore: 0,
      scorers: [{ sideKey: 'HOME', playerIdx: 4, goals: 5, assists: 0 }],
    },
  },
  {
    // 몰수패(부전승). 승자 1 : 몰수팀 0 고정, 참가자 스탯 없음. 공개 화면에서 실제 1:0
    // 승리와 구분되지 않는 것이 현재 설계의 알려진 한계이고, 이 대진이 그 예시다.
    no: 8,
    round: 4,
    homeTeamNo: 2,
    awayTeamNo: 4,
    startAtOffsetDays: -3,
    forfeit: true,
    result: { homeScore: 1, awayScore: 0, scorers: [] },
  },
] as const;

async function createSideWithRoster(
  tx: Prisma.TransactionClient,
  fixtureNo: number,
  targetGameId: string,
  sideKey: SideKey,
  roster: LeagueTeamRoster,
): Promise<{ readonly sideId: string; readonly participantIds: readonly string[] }> {
  const side = await tx.v1GameSide.upsert({
    where: { gameId_sideKey: { gameId: targetGameId, sideKey } },
    update: {},
    create: { gameId: targetGameId, sideKey, teamId: roster.id, displayNameSnapshot: roster.name },
  });
  const lineup = await tx.v1GameLineup.upsert({
    where: { gameId_sideId_revision: { gameId: targetGameId, sideId: side.id, revision: 1 } },
    update: {},
    create: { gameId: targetGameId, sideId: side.id, revision: 1 },
  });
  const participantIds: string[] = [];
  for (const [index] of roster.playerIds.entries()) {
    const playerIdx = index + 1;
    const pid = participantId(fixtureNo, sideKey, playerIdx);
    await tx.v1GameParticipant.upsert({
      where: { id: pid },
      update: {},
      create: {
        id: pid,
        gameId: targetGameId,
        sideId: side.id,
        lineupId: lineup.id,
        displayNameSnapshot: `${roster.name} ${playerIdx}번`,
      },
    });
    participantIds.push(pid);
  }
  return { sideId: side.id, participantIds };
}

interface GameSkeleton {
  readonly gameId: string;
  readonly currentOfficialRevisionId: string | null;
  readonly homeSideId: string;
  readonly awaySideId: string;
  readonly homeParticipantIds: readonly string[];
  readonly awayParticipantIds: readonly string[];
}

/**
 * `games.service.ts`의 `createFromSourceInTransaction()`이 만드는 게임 스켈레톤(sides·
 * lineups·participants·periods·visibility policy)을 재현한다. 이미 있으면(재배포) 그대로
 * 재사용하고, 참가자 id는 결정적 함수로 다시 계산한다(둘 다 같은 입력에 대해 항상 같은
 * 값을 내므로 별도 조회 없이 재구성 가능).
 */
async function ensureGameSkeleton(
  tx: Prisma.TransactionClient,
  spec: FixtureSpec,
  teamMatchId: string,
  competitionConfigVersionId: string,
  home: LeagueTeamRoster,
  away: LeagueTeamRoster,
): Promise<GameSkeleton> {
  const existingGame = await tx.v1Game.findUnique({ where: { teamMatchId } });
  if (existingGame !== null) {
    const sides = await tx.v1GameSide.findMany({ where: { gameId: existingGame.id } });
    const homeSide = sides.find((s) => s.sideKey === 'HOME');
    const awaySide = sides.find((s) => s.sideKey === 'AWAY');
    if (!homeSide || !awaySide) {
      throw new Error(`league QA fixture ${spec.no} game ${existingGame.id} is missing a side`);
    }
    return {
      gameId: existingGame.id,
      currentOfficialRevisionId: existingGame.currentOfficialRevisionId,
      homeSideId: homeSide.id,
      awaySideId: awaySide.id,
      homeParticipantIds: home.playerIds.map((_, index) => participantId(spec.no, 'HOME', index + 1)),
      awayParticipantIds: away.playerIds.map((_, index) => participantId(spec.no, 'AWAY', index + 1)),
    };
  }

  const game = await tx.v1Game.create({
    data: {
      id: gameId(spec.no),
      sourceType: V1GameSourceType.TEAM_MATCH,
      teamMatchId,
      competitionConfigVersionId,
    },
  });
  const homeSide = await createSideWithRoster(tx, spec.no, game.id, 'HOME', home);
  const awaySide = await createSideWithRoster(tx, spec.no, game.id, 'AWAY', away);
  // 피리어드 2개(풋살 전후반). `computePeriodCount()`(games.service.ts)를 import할 수 없어
  // 그 함수의 malformed-config 폴백값(2)과 동일하게 하드코딩한다.
  await tx.v1GamePeriod.upsert({ where: { gameId_number: { gameId: game.id, number: 1 } }, update: {}, create: { gameId: game.id, number: 1 } });
  await tx.v1GamePeriod.upsert({ where: { gameId_number: { gameId: game.id, number: 2 } }, update: {}, create: { gameId: game.id, number: 2 } });
  await tx.v1GameVisibilityPolicy.upsert({ where: { gameId: game.id }, update: {}, create: { gameId: game.id } });

  return {
    gameId: game.id,
    currentOfficialRevisionId: game.currentOfficialRevisionId,
    homeSideId: homeSide.sideId,
    awaySideId: awaySide.sideId,
    homeParticipantIds: homeSide.participantIds,
    awayParticipantIds: awaySide.participantIds,
  };
}

async function ensureFixture(
  tx: Prisma.TransactionClient,
  spec: FixtureSpec,
  league: { readonly id: string; readonly title: string; readonly sportId: string; readonly regionId: string },
  teamsByNo: ReadonlyMap<number, LeagueTeamRoster>,
  createdByUserId: string,
  competitionConfigVersionId: string,
  now: Date,
): Promise<void> {
  const home = teamsByNo.get(spec.homeTeamNo);
  const away = teamsByNo.get(spec.awayTeamNo);
  if (!home || !away) throw new Error(`league QA fixture ${spec.no} references an unknown team slot`);

  const startAt = new Date(now.getTime() + spec.startAtOffsetDays * DAY_MS);
  const officialAt = new Date(startAt.getTime() + 90 * 60 * 1000);
  const id = fixtureId(spec.no);

  // 대진 정체성(누가 언제 어디서)은 create/update 공통 — 팀은 절대 삭제되지 않는 고정 id라
  // 재동기화해도 값이 바뀌지 않는다. status/completedAt만 create 전용이다(아래 참고).
  const commonFixtureData = {
    hostTeamId: home.id,
    sportId: league.sportId,
    regionId: league.regionId,
    title: `${league.title} ${spec.round}주차`,
    placeName: PLACE_NAME,
    startAt,
    approvedApplicantTeamId: away.id,
    competitionConfigVersionId,
    leagueId: league.id,
  };
  const teamMatch = await tx.v1TeamMatch.upsert({
    where: { id },
    update: commonFixtureData,
    // status/completedAt은 create에만 쓴다 — 재배포가 그 사이 스태프가 라이브로 진행시킨
    // 상태를 시드 값으로 되돌리면 안 된다(seed-alpha-tournament-qa.ts의 동일 관행, 파일
    // 상단 주석 참고).
    create: {
      id,
      ...commonFixtureData,
      createdByUserId,
      status: spec.cancelled
        ? V1TeamMatchStatus.cancelled
        : spec.result
          ? V1TeamMatchStatus.completed
          : V1TeamMatchStatus.matched,
      completedAt: spec.result && !spec.cancelled ? officialAt : null,
      cancelledAt: spec.cancelled ? officialAt : null,
    },
  });

  await tx.v1TeamMatchApplication.upsert({
    where: { teamMatchId_applicantTeamId: { teamMatchId: teamMatch.id, applicantTeamId: away.id } },
    update: {},
    create: {
      teamMatchId: teamMatch.id,
      applicantTeamId: away.id,
      appliedByUserId: createdByUserId,
      status: V1TeamMatchApplicationStatus.approved,
      reviewedByUserId: createdByUserId,
      reviewedAt: now,
      message: '리그 QA 시드 자동 생성',
    },
  });

  const skeleton = await ensureGameSkeleton(tx, spec, teamMatch.id, competitionConfigVersionId, home, away);

  if (spec.result === null) return;
  // 공식 결과는 한 번만 만든다 — OFFICIAL 리비전은 v1_block_terminal_revision_mutation
  // 트리거가 이후의 어떤 수정도 막으므로, 재배포 시 완전히 건너뛰는 것이 유일하게 안전한
  // 멱등 전략이다(upsert로 재시도하면 트리거가 예외를 던진다).
  if (skeleton.currentOfficialRevisionId !== null) return;

  const score = { home: spec.result.homeScore, away: spec.result.awayScore };
  const eventsHash = `league-qa-fixture-${spec.no}-hash`;

  // v1_guard_result_participant_mutation 트리거가 참가자 행 insert 시점의 리비전 상태를
  // DRAFT로 강제하므로, 먼저 DRAFT로 만들고 참가자를 넣은 뒤 OFFICIAL로 전환한다.
  const revision = await tx.v1GameResultRevision.create({
    data: {
      gameId: skeleton.gameId,
      revision: 1,
      state: 'DRAFT',
      score,
      eventsHash,
      createdByActorType: V1IdentityActorType.SYSTEM,
      createdBySystemActor: 'LEAGUE_QA_SEED',
      // 몰수 마커는 문자열 컨벤션이다 — league-match-forfeit.service.ts 의
      // FORFEIT_REASON_MARKER 와 같은 값을 쓴다(그 파일은 src/ 라 여기서 import 할 수 없다).
      // 값이 갈리면 어드민이 만든 몰수와 시드가 만든 몰수가 서로 다른 것이 되므로
      // 문자열을 바꿀 때 두 곳을 함께 고쳐야 한다.
      ...(spec.forfeit ? { reason: '[LEAGUE_FORFEIT] 리그 QA 시드 — 상대팀 불참' } : {}),
    },
  });

  for (const scorer of spec.result.scorers) {
    const sideParticipantIds = scorer.sideKey === 'HOME' ? skeleton.homeParticipantIds : skeleton.awayParticipantIds;
    const pid = sideParticipantIds[scorer.playerIdx - 1];
    if (!pid) throw new Error(`league QA fixture ${spec.no} scorer references an unknown roster slot`);
    const sideId = scorer.sideKey === 'HOME' ? skeleton.homeSideId : skeleton.awaySideId;
    const teamRoster = scorer.sideKey === 'HOME' ? home : away;
    const userId = teamRoster.playerIds[scorer.playerIdx - 1];

    await tx.v1GameResultParticipant.create({
      data: {
        resultRevisionId: revision.id,
        participantId: pid,
        sideId,
        started: true,
        goals: scorer.goals,
        assists: scorer.assists,
        cards: { yellow: 0, red: 0 },
      },
    });

    // 득점/도움 순위 공개 게이트(isParticipantPubliclyEligible)는 participant 단위 신원
    // 연결(V1ParticipantIdentityLinkCurrent)을 요구한다. 실 제품에서는 라인업 저장 시
    // GamesService.saveLineup이 자동으로 만든다(action ROSTER_ASSERTED) — 이 시드는 그
    // 결과 상태를 스탯이 있는 참가자에 한해 직접 재현한다. 사용자 단위 동의(GRANTED)는
    // ensureLeagueTeams에서 로스터 전원에게 이미 심어져 있다.
    await tx.v1ParticipantIdentityLinkCurrent.upsert({
      where: { participantId: pid },
      update: {},
      create: {
        participantId: pid,
        linkId: `league-qa-link-${pid}`,
        userId,
        version: 1,
        effectiveFrom: now,
      },
    });
  }

  await tx.v1GameResultRevision.update({
    where: { id: revision.id },
    data: { state: 'OFFICIAL', submittedAt: officialAt, officialAt },
  });
  await tx.v1Game.update({ where: { id: skeleton.gameId }, data: { currentOfficialRevisionId: revision.id } });
  // v1_guard_game_official_fact_insert 트리거가 이 fact를 방금 만든 리비전과 byte-exact로
  // 대조한다(score/eventsHash/officialAt) + home/awayTeamId가 실제 V1GameSide.teamId와
  // 일치할 것을 요구한다(test/league-matches/league-match-public.integration-spec.ts와
  // 동일 계약).
  await tx.v1GameOfficialFact.create({
    data: {
      revisionId: revision.id,
      gameId: skeleton.gameId,
      revision: 1,
      sourceType: V1GameSourceType.TEAM_MATCH,
      tournamentId: null,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homeScore: spec.result.homeScore,
      awayScore: spec.result.awayScore,
      score,
      eventsHash,
      officialAt,
    },
  });
}

async function ensureLeague(
  tx: Prisma.TransactionClient,
  sportId: string,
  regionId: string,
  createdByAdminUserId: string,
  teams: readonly LeagueTeamRoster[],
  now: Date,
) {
  const startsOn = new Date(now.getTime() - 14 * DAY_MS);
  const endsOn = new Date(now.getTime() + 14 * DAY_MS);
  const commonLeagueData = { title: LEAGUE_TITLE, sportId, regionId, startsOn, endsOn };
  // state는 create에만 쓴다 — 스태프가 alpha에서 직접 리그를 완료 처리했다면 재배포가
  // 그 결정을 되돌리면 안 된다(위 팀매치 status와 같은 이유).
  const league = await tx.v1League.upsert({
    where: { id: LEAGUE_QA_ID },
    update: commonLeagueData,
    create: {
      id: LEAGUE_QA_ID,
      ...commonLeagueData,
      createdByAdminUserId,
      tieBreakJson: { order: ['points', 'goalDifference', 'goalsFor', 'headToHead'] },
      state: 'active',
    },
  });
  // 참가팀 연결(V1LeagueTeam) — 순위표·득점/도움 순위 둘 다 league.teams(이 조인)를 통해
  // teamId 목록을 읽으므로 이게 없으면 리그가 빈 리그로 보인다.
  for (const team of teams) {
    await tx.v1LeagueTeam.upsert({
      where: { leagueId_teamId: { leagueId: league.id, teamId: team.id } },
      update: {},
      create: { leagueId: league.id, teamId: team.id },
    });
  }
  return league;
}

/**
 * 티어 시리즈 + 1부/2부 리그. 4팀을 2팀씩 나눠 넣는다(리그 최소 인원 = 2팀).
 * 단발 리그와 같은 팀을 재사용하므로 팀을 새로 만들지 않는다 — 한 팀이 여러 리그에
 * 참가하는 것은 실제로도 정상이고, 마이 화면의 "내 리그"가 여러 건 뜨는 표본도 된다.
 */
async function ensureTierSeries(
  tx: Prisma.TransactionClient,
  sportId: string,
  regionId: string,
  createdByAdminUserId: string,
  teams: readonly LeagueTeamRoster[],
  now: Date,
) {
  const startsOn = new Date(now.getTime() - 7 * DAY_MS);
  const endsOn = new Date(now.getTime() + 21 * DAY_MS);

  await tx.v1LeagueSeries.upsert({
    where: { id: LEAGUE_QA_SERIES_ID },
    update: { title: LEAGUE_QA_SERIES_TITLE, sportId, regionId },
    create: {
      id: LEAGUE_QA_SERIES_ID,
      title: LEAGUE_QA_SERIES_TITLE,
      sportId,
      regionId,
      createdByAdminUserId,
      tierCount: 2,
      // league-promotion.ts 의 DEFAULT_PROMOTION_RULE 과 같은 값. 이 파일은 src/ 를
      // import 할 수 없어 값을 복제한다 — 기본 규칙이 바뀌면 두 곳을 함께 고친다.
      promotionRuleJson: { mode: 'ratio', ratio: 0.2, rounding: 'ceil', minSlots: 1 },
      state: 'active',
    },
  });

  for (const [index, leagueId] of TIER_LEAGUE_IDS.entries()) {
    const tier = index + 1;
    const tierTeams = teams.slice(index * 2, index * 2 + 2);
    if (tierTeams.length < 2) continue;
    const commonData = {
      title: `${LEAGUE_QA_SERIES_TITLE} 1시즌 ${tier}부`,
      sportId,
      regionId,
      startsOn,
      endsOn,
    };
    await tx.v1League.upsert({
      where: { id: leagueId },
      update: commonData,
      // state·tier·seasonNo 는 create 전용 — 단발 리그와 같은 이유로, 스태프가 alpha 에서
      // 직접 바꾼 상태를 재배포가 되돌리면 안 된다.
      create: {
        id: leagueId,
        ...commonData,
        createdByAdminUserId,
        tieBreakJson: { order: ['points', 'goalDifference', 'goalsFor', 'headToHead'] },
        state: 'draft',
        seriesId: LEAGUE_QA_SERIES_ID,
        tier,
        seasonNo: 1,
      },
    });
    for (const team of tierTeams) {
      await tx.v1LeagueTeam.upsert({
        where: { leagueId_teamId: { leagueId, teamId: team.id } },
        update: {},
        create: { leagueId, teamId: team.id },
      });
    }
  }

  return { seriesId: LEAGUE_QA_SERIES_ID, tierLeagues: TIER_LEAGUE_IDS.length };
}

async function main() {
  assertAlphaSeedAllowed(process.env);
  const prisma = new PrismaClient();
  try {
    const [sport, region, admin, competitionConfig] = await Promise.all([
      prisma.v1Sport.findFirst({ where: { code: 'futsal', isActive: true }, select: { id: true } }),
      // 리그 region은 league-match-admin.service.ts의 create()와 동일 조건(활성 + level 2
      // 시·군·구)을 만족해야 한다 — 아니면 실제 관리자 UI가 이 시드로 만든 리그의 대진을
      // 못 만든다.
      prisma.v1Region.findFirst({ where: { code: 'seoul-songpa', isActive: true, level: 2 }, select: { id: true } }),
      prisma.v1AdminUser.findFirst({ where: { status: 'active' }, orderBy: { createdAt: 'asc' }, select: { id: true, userId: true } }),
      // resolveTeamMatchCompetitionConfig(team-matches/resolve-team-match-competition-config.ts)와
      // 정확히 같은 조회 — 이 파일은 src/를 import할 수 없어 하드코딩된 config id 대신 매번
      // 같은 조건으로 다시 찾는다. 그래야 그 함수가 실제로 반환할 값과 항상 일치한다(드리프트 불가).
      prisma.v1CompetitionConfigVersion.findFirst({
        where: { sportCode: 'futsal', name: 'futsal-v1', status: 'ACTIVE' },
        orderBy: { version: 'desc' },
        select: { id: true },
      }),
    ]);
    if (!sport) throw new Error('Active futsal sport is required for alpha league QA data.');
    if (!region) throw new Error('Active seoul-songpa (level 2) region is required for alpha league QA data.');
    if (!admin) throw new Error('Active admin user is required for alpha league QA data.');
    if (!competitionConfig) {
      throw new Error(
        'Active futsal-v1 competition config is required for alpha league QA data. Run ' +
          'src/tournaments/competition-config/competition-config-backfill.cli.ts first ' +
          '(same requirement as league-matches/resolve-team-match-competition-config.ts).',
      );
    }

    const now = new Date();
    const summary = await prisma.$transaction(
      async (tx) => {
        const teams = await ensureLeagueTeams(tx, sport.id, region.id);
        const teamsByNo = new Map(teams.map((team, index) => [index + 1, team]));
        const league = await ensureLeague(tx, sport.id, region.id, admin.id, teams, now);

        let confirmedCount = 0;
        let pendingCount = 0;
        let cancelledCount = 0;
        let forfeitCount = 0;
        for (const spec of FIXTURES) {
          await ensureFixture(tx, spec, league, teamsByNo, admin.userId, competitionConfig.id, now);
          if (spec.cancelled) cancelledCount += 1;
          else if (spec.result) confirmedCount += 1;
          else pendingCount += 1;
          if (spec.forfeit) forfeitCount += 1;
        }

        const series = await ensureTierSeries(tx, sport.id, region.id, admin.id, teams, now);

        return {
          leagueId: league.id,
          seriesId: series.seriesId,
          tierLeagues: series.tierLeagues,
          teams: teams.length,
          fixtures: FIXTURES.length,
          confirmedFixtures: confirmedCount,
          pendingFixtures: pendingCount,
          cancelledFixtures: cancelledCount,
          forfeitFixtures: forfeitCount,
        };
      },
      // 팀 4 × 선수 4 + 픽스처 6 × (게임 스켈레톤 + 결과) 규모라 Prisma 기본 timeout(5초)을
      // 쉽게 넘긴다 — 레포 선례(league-match-admin.service.ts의 generateFixtures, 120초)를
      // 따른다.
      { timeout: 120_000, maxWait: 10_000 },
    );

    process.stdout.write(`${JSON.stringify({ status: 'ok', ...summary })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
