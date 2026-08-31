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
import {
  assertAlphaSeedAllowed,
  ensureAlphaQaRecordConsent,
  FEATURED_PERSONAS,
  FEATURED_TEAMS,
} from './seed-alpha-tournament-qa';

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

/**
 * **`../src/...` 를 import 하지 않는다.** 이 시드는 API 프로덕션 이미지 안에서
 * `ts-node prisma/seed-alpha-league-qa.ts` 로 도는데 그 이미지에는 `src/` 가 없다
 * (`dist/`·`prisma/`·`node_modules` 만 COPY). 실제로 `../src/` import 하나 때문에
 * 2026-08-09 배포가 MODULE_NOT_FOUND 로 죽었다.
 *
 * 그래서 통합 축 거울에 필요한 값을 **복제한다.** 복제본이 어긋나면 시드가 리그와 다른
 * 값을 대회 행에 박게 되므로, `seed-alpha-league-qa.spec.ts` 가 원본
 * (`src/tournaments/league-competition-mirror.ts`)과 같은지 고정한다.
 */
export const ALPHA_SEED_LEAGUE_CONFIG_ID = '22222222-2222-4222-8222-222222222222';
export const ALPHA_SEED_STATUS_BY_LEAGUE_STATE = {
  draft: 'draft',
  active: 'in_progress',
  completed: 'completed',
} as const;

const LEAGUE_QA_ID = 'ad100000-0000-4000-8000-000000000001';
// 티어(1부/2부) 표본용 시리즈. 리그 QA 시드에 시리즈가 0건이라 "N부" 뱃지·시리즈 부제가
// alpha 화면에서 한 번도 확인된 적이 없었다(2026-08-21 재감사) — 티어 리그는 전부 손으로
// API 를 친 세션들이 만든 것이었다. 대진은 만들지 않는다: 뱃지·시리즈 문맥 노출이 목적이고,
// 경기 진행 검증은 위 단발 리그가 이미 덮는다.
const LEAGUE_QA_SERIES_ID = 'ad200000-0000-4000-8000-000000000001';
const LEAGUE_QA_SERIES_TITLE = '서울 풋살 커뮤니티 리그';
const TIER_LEAGUE_IDS: readonly string[] = [
  'ad210000-0000-4000-8000-000000000001', // 1부
  'ad210000-0000-4000-8000-000000000002', // 2부
];
const LEAGUE_TITLE = '서울 나이트 풋살 리그';

const TEAM_COUNT = 4;
const PLAYERS_PER_TEAM = 4;
export const LEAGUE_TEAM_NAMES = ['마포 레인저스', '성수 아틀레틱', '한강 로버스', '송파 유나이티드'] as const;
export const LEAGUE_PLAYER_NAMES = [
  ['강현우', '오지훈', '김태성', '윤서준'],
  ['이준호', '박시우', '정우진', '한도윤'],
  ['최민석', '김재윤', '임성호', '조하람'],
  ['박건우', '이승민', '김도현', '장예준'],
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const PLACE_NAME = '서울 송파 풋살파크';

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
  return LEAGUE_PLAYER_NAMES[teamNo - 1]?.[playerNo - 1] ?? `선수 ${teamNo}-${playerNo}`;
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
          realName: personaNickname(teamNo, playerNo),
          gender: playerNo % 2 === 0 ? 'female' : 'male',
          birthDate: '1996-03-10',
          bio: `${LEAGUE_TEAM_NAMES[teamNo - 1]}에서 활동하는 풋살 선수입니다. Alpha 쇼케이스 계정입니다.`,
          deletedAt: null,
        },
        create: {
          userId: user.id,
          nickname: personaNickname(teamNo, playerNo),
          displayName: personaNickname(teamNo, playerNo),
          realName: personaNickname(teamNo, playerNo),
          gender: playerNo % 2 === 0 ? 'female' : 'male',
          birthDate: '1996-03-10',
          bio: `${LEAGUE_TEAM_NAMES[teamNo - 1]}에서 활동하는 풋살 선수입니다. Alpha 쇼케이스 계정입니다.`,
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
    const name = LEAGUE_TEAM_NAMES[teamNo - 1];
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
    const activityAreas = ['마포구', '성동구', '영등포구', '송파구'] as const;
    const activityArea = activityAreas[teamNo - 1];
    await tx.v1TeamProfile.upsert({
      where: { teamId: team.id },
      update: {
        description: `서울 지역에서 주 1회 정기 경기를 진행하는 풋살 팀입니다. ${LEAGUE_TITLE} 참가팀이며 Alpha 쇼케이스 데이터입니다.`,
        activityNote: `매주 수·일 저녁 · 서울 ${activityArea}`,
        activityDays: ['wed', 'sun'],
        activityFrequency: 'weekly',
        activityTimeSlots: ['evening'],
        activityTypes: ['league', 'friendly'],
        skillNote: teamNo % 2 === 0 ? '중상급 · 압박과 빠른 역습 중심' : '중급 · 빌드업과 패스 플레이 중심',
        memberGoalCount: 6,
        deletedAt: null,
      },
      create: {
        teamId: team.id,
        description: `서울 지역에서 주 1회 정기 경기를 진행하는 풋살 팀입니다. ${LEAGUE_TITLE} 참가팀이며 Alpha 쇼케이스 데이터입니다.`,
        activityNote: `매주 수·일 저녁 · 서울 ${activityArea}`,
        activityDays: ['wed', 'sun'],
        activityFrequency: 'weekly',
        activityTimeSlots: ['evening'],
        activityTypes: ['league', 'friendly'],
        skillNote: teamNo % 2 === 0 ? '중상급 · 압박과 빠른 역습 중심' : '중급 · 빌드업과 패스 플레이 중심',
        memberGoalCount: 6,
      },
    });
    for (const [index, memberId] of memberIds.entries()) {
      const role = index === 0 ? 'owner' : index === 1 ? 'manager' : 'member';
      const jerseyNumber = [10, 7, 4, 1][index];
      await tx.v1TeamMembership.upsert({
        where: { teamId_userId: { teamId: team.id, userId: memberId } },
        update: { role, status: 'active', joinedAt: now, leftAt: null, jerseyNumber },
        create: { teamId: team.id, userId: memberId, role, status: 'active', joinedAt: now, jerseyNumber },
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
  /** 리그에 속하지 않는 일반 팀매치. 팀 전적의 `친선` 분류를 실제 계약으로 만든다. */
  readonly friendly?: boolean;
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

/** 서울 나이트 FC 한 팀에서 대회·리그·친선·개인 기록을 이어 보는 Alpha 쇼케이스 경기. */
const SHOWCASE_FIXTURES: readonly FixtureSpec[] = [
  {
    no: 101,
    round: 5,
    homeTeamNo: 5,
    awayTeamNo: 1,
    startAtOffsetDays: -18,
    result: {
      homeScore: 4,
      awayScore: 2,
      scorers: [
        { sideKey: 'HOME', playerIdx: 1, goals: 2, assists: 1 },
        { sideKey: 'HOME', playerIdx: 2, goals: 1, assists: 1 },
        { sideKey: 'HOME', playerIdx: 3, goals: 1, assists: 0 },
        { sideKey: 'AWAY', playerIdx: 1, goals: 2, assists: 0 },
      ],
    },
  },
  {
    no: 102,
    round: 1,
    homeTeamNo: 5,
    awayTeamNo: 2,
    startAtOffsetDays: -12,
    friendly: true,
    result: {
      homeScore: 2,
      awayScore: 2,
      scorers: [
        { sideKey: 'HOME', playerIdx: 1, goals: 1, assists: 1 },
        { sideKey: 'HOME', playerIdx: 4, goals: 1, assists: 0 },
        { sideKey: 'AWAY', playerIdx: 1, goals: 2, assists: 0 },
      ],
    },
  },
  {
    no: 103,
    round: 2,
    homeTeamNo: 5,
    awayTeamNo: 3,
    startAtOffsetDays: -6,
    friendly: true,
    result: {
      homeScore: 1,
      awayScore: 3,
      scorers: [
        { sideKey: 'HOME', playerIdx: 1, goals: 1, assists: 0 },
        { sideKey: 'AWAY', playerIdx: 1, goals: 2, assists: 0 },
        { sideKey: 'AWAY', playerIdx: 2, goals: 1, assists: 1 },
      ],
    },
  },
] as const;

async function ensureShowcaseRoster(
  tx: Prisma.TransactionClient,
): Promise<LeagueTeamRoster> {
  const teamSeed = FEATURED_TEAMS[0];
  const playerIds = FEATURED_PERSONAS.map((persona) => persona.id);
  const existingUsers = await tx.v1User.findMany({
    where: { id: { in: playerIds } },
    select: { id: true },
  });
  if (existingUsers.length !== playerIds.length) {
    throw new Error('Featured tournament roster must be seeded before the team showcase.');
  }

  const jerseyNumbers = [10, 7, 11, 1] as const;
  for (const [index, userId] of playerIds.entries()) {
    await ensureAlphaQaRecordConsent(tx, userId);
    await tx.v1TeamMembership.upsert({
      where: { teamId_userId: { teamId: teamSeed.id, userId } },
      update: { status: 'active', leftAt: null, jerseyNumber: jerseyNumbers[index] },
      create: {
        teamId: teamSeed.id,
        userId,
        role: index === 0 ? 'owner' : index === 1 ? 'manager' : 'member',
        status: 'active',
        joinedAt: new Date(),
        jerseyNumber: jerseyNumbers[index],
      },
    });
  }
  await tx.v1Team.update({
    where: { id: teamSeed.id },
    data: { memberCount: playerIds.length, managerCount: 1, membersVisible: true },
  });
  await tx.v1TeamProfile.update({
    where: { teamId: teamSeed.id },
    data: {
      description: '서울 송파구를 중심으로 매주 활동하는 풋살 팀입니다. 대회·리그·친선 경기에 꾸준히 참가하며, Alpha 쇼케이스 데이터로 운영됩니다.',
      activityNote: '매주 화·토 저녁 · 서울 송파구',
      activityDays: ['tue', 'sat'],
      activityFrequency: 'weekly',
      activityTimeSlots: ['evening'],
      activityTypes: ['league', 'friendly', 'tournament'],
      skillNote: '중급 · 패스와 전환 플레이 중심',
      memberGoalCount: 8,
    },
  });
  return { id: teamSeed.id, name: teamSeed.name, playerIds };
}

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
        userId: roster.playerIds[index],
        displayNameSnapshot: `${roster.name} ${playerIdx}번`,
        jerseyNumber: playerIdx === 1 ? 10 : playerIdx === 2 ? 7 : playerIdx === 3 ? 11 : 1,
        position: playerIdx === 1 ? 'PIVO' : playerIdx === 2 ? 'ALA' : playerIdx === 3 ? 'FIXO' : 'GOLEIRO',
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
    // 팀 이름을 자연스러운 쇼케이스 이름으로 바꿔도 기존 공식 경기의 side snapshot은
    // 자동으로 따라오지 않는다. 최근 활동 카드가 이 값을 직접 읽으므로 Alpha 시드가
    // 소유한 결정적 게임에 한해 표시 스냅샷을 현재 팀명과 동기화한다. 점수·리비전·fact는
    // 건드리지 않아 이미 확정된 기록의 의미는 그대로 유지된다.
    await Promise.all([
      tx.v1GameSide.update({ where: { id: homeSide.id }, data: { displayNameSnapshot: home.name } }),
      tx.v1GameSide.update({ where: { id: awaySide.id }, data: { displayNameSnapshot: away.name } }),
    ]);
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
    title: spec.friendly ? `서울 나이트 FC 친선전 ${spec.round}` : `${league.title} ${spec.round}주차`,
    placeName: PLACE_NAME,
    startAt,
    approvedApplicantTeamId: away.id,
    competitionConfigVersionId,
    leagueId: spec.friendly ? null : league.id,
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
  if (skeleton.currentOfficialRevisionId !== null) {
    // 이 projection을 만들기 전 버전의 시드가 이미 공식 revision까지만 만든 경우를 복구한다.
    // OFFICIAL revision은 불변이라 건드리지 않고 누락된 team-record fact만 멱등 추가한다.
    const existingRevision = await tx.v1GameResultRevision.findUnique({
      where: { id: skeleton.currentOfficialRevisionId },
      select: { officialAt: true },
    });
    if (!existingRevision?.officialAt) {
      throw new Error(`league QA fixture ${spec.no} current revision is missing officialAt`);
    }
    const homeResult = spec.result.homeScore > spec.result.awayScore ? 'WON' : spec.result.homeScore < spec.result.awayScore ? 'LOST' : 'DRAWN';
    const awayResult = homeResult === 'WON' ? 'LOST' : homeResult === 'LOST' ? 'WON' : 'DRAWN';
    await tx.v1TeamRecordFact.createMany({
      data: [
        {
          revisionId: skeleton.currentOfficialRevisionId,
          gameId: skeleton.gameId,
          teamId: home.id,
          opponentTeamId: away.id,
          tournamentId: null,
          result: homeResult,
          goalsFor: spec.result.homeScore,
          goalsAgainst: spec.result.awayScore,
          sourceHash: `league-qa-fixture-${spec.no}-hash-home`,
          playedAt: startAt,
          officialAt: existingRevision.officialAt,
        },
        {
          revisionId: skeleton.currentOfficialRevisionId,
          gameId: skeleton.gameId,
          teamId: away.id,
          opponentTeamId: home.id,
          tournamentId: null,
          result: awayResult,
          goalsFor: spec.result.awayScore,
          goalsAgainst: spec.result.homeScore,
          sourceHash: `league-qa-fixture-${spec.no}-hash-away`,
          playedAt: startAt,
          officialAt: existingRevision.officialAt,
        },
      ],
      skipDuplicates: true,
    });
    return;
  }

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

  let eventSequence = 0;
  for (const scorer of spec.result.scorers) {
    const sideParticipantIds = scorer.sideKey === 'HOME' ? skeleton.homeParticipantIds : skeleton.awayParticipantIds;
    const pid = sideParticipantIds[scorer.playerIdx - 1];
    const sideId = scorer.sideKey === 'HOME' ? skeleton.homeSideId : skeleton.awaySideId;
    for (let goal = 0; goal < scorer.goals; goal += 1) {
      eventSequence += 1;
      const clientEventId = `alpha-showcase-${spec.no}-goal-${eventSequence}`;
      await tx.v1GameEvent.upsert({
        where: { gameId_clientEventId: { gameId: skeleton.gameId, clientEventId } },
        update: {},
        create: {
          gameId: skeleton.gameId,
          sequence: eventSequence,
          clientEventId,
          payloadHash: `${clientEventId}-hash`,
          type: 'GOAL',
          sideId,
          participantId: pid,
          period: eventSequence <= Math.ceil((spec.result.homeScore + spec.result.awayScore) / 2) ? 1 : 2,
          clockMs: (4 + eventSequence * 3) * 60_000,
          occurredAt: officialAt,
          actorUserId: createdByUserId,
          payload: { seeded: true, showcase: spec.no >= 101 },
        },
      });
    }
  }

  await tx.v1GameResultRevision.update({
    where: { id: revision.id },
    data: { state: 'OFFICIAL', submittedAt: officialAt, officialAt },
  });
  await tx.v1Game.update({
    where: { id: skeleton.gameId },
    data: { currentOfficialRevisionId: revision.id, lastSequence: eventSequence, state: 'ENDED' },
  });
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
  const homeResult = spec.result.homeScore > spec.result.awayScore
    ? 'WON'
    : spec.result.homeScore < spec.result.awayScore
      ? 'LOST'
      : 'DRAWN';
  const awayResult = homeResult === 'WON' ? 'LOST' : homeResult === 'LOST' ? 'WON' : 'DRAWN';
  // 공개 팀 전적은 official fact를 매 요청마다 다시 계산하지 않고 이 projection을 읽는다.
  // 운영 경로에서는 worker가 만들지만 alpha 시드는 한 트랜잭션에서 종료되므로, 양 팀 행을
  // 함께 심어 배포 직후에도 공식 결과와 팀 전적이 갈리지 않게 한다.
  await tx.v1TeamRecordFact.createMany({
    data: [
      {
        revisionId: revision.id,
        gameId: skeleton.gameId,
        teamId: home.id,
        opponentTeamId: away.id,
        tournamentId: null,
        result: homeResult,
        goalsFor: spec.result.homeScore,
        goalsAgainst: spec.result.awayScore,
        sourceHash: `${eventsHash}-home`,
        playedAt: startAt,
        officialAt,
      },
      {
        revisionId: revision.id,
        gameId: skeleton.gameId,
        teamId: away.id,
        opponentTeamId: home.id,
        tournamentId: null,
        result: awayResult,
        goalsFor: spec.result.awayScore,
        goalsAgainst: spec.result.homeScore,
        sourceHash: `${eventsHash}-away`,
        playedAt: startAt,
        officialAt,
      },
    ],
    skipDuplicates: true,
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
  // dual-write — 통합 축의 거울도 같은 고정 id 로 upsert 한다. 리그당 정확히 한 행이
  // 영원히 재사용되므로 고아가 생기지 않는다(이 시드는 지우지 않는다).
  //
  // **`status` 는 create 전용이다** — 바로 위 `state` 와 같은 이유다. 스태프가 alpha 에서
  // 직접 바꾼 상태를 재배포가 되돌리면 안 된다. update 분기에 넣으면 **거울만 시드값으로
  // 되돌아가고 리그는 스태프 값을 유지해 두 축이 반대 방향으로 갈라진다.**
  await tx.v1Tournament.upsert({
    where: { id: LEAGUE_QA_ID },
    update: {
      title: commonLeagueData.title,
      sportId,
      regionId,
      scheduledAt: startsOn,
      scheduledEndAt: endsOn,
    },
    create: {
      id: LEAGUE_QA_ID,
      kind: 'regular_league',
      sportId,
      title: commonLeagueData.title,
      status: ALPHA_SEED_STATUS_BY_LEAGUE_STATE.active,
      regionId,
      scheduledAt: startsOn,
      scheduledEndAt: endsOn,
      competitionConfigVersionId: ALPHA_SEED_LEAGUE_CONFIG_ID,
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
    // dual-write — 통합 축의 거울도 같은 고정 id 로 upsert 한다. 리그당 정확히 한 행이
    // 영원히 재사용되므로 고아가 생기지 않는다(이 시드는 지우지 않는다).
    //
    // **`status` 는 create 전용이다** — 바로 위 `state` 와 같은 이유다. 스태프가 alpha 에서
    // 직접 바꾼 상태를 재배포가 되돌리면 안 된다. update 분기에 넣으면 **거울만 시드값으로
    // 되돌아가고 리그는 스태프 값을 유지해 두 축이 반대 방향으로 갈라진다.**
    await tx.v1Tournament.upsert({
      where: { id: leagueId },
      update: {
        title: commonData.title,
        sportId,
        regionId,
        scheduledAt: startsOn,
        scheduledEndAt: endsOn,
      },
      create: {
        id: leagueId,
        kind: 'regular_league',
        sportId,
        title: commonData.title,
        status: ALPHA_SEED_STATUS_BY_LEAGUE_STATE.draft,
        regionId,
        scheduledAt: startsOn,
        scheduledEndAt: endsOn,
        seriesId: LEAGUE_QA_SERIES_ID,
        tier,
        seasonNo: 1,
        competitionConfigVersionId: ALPHA_SEED_LEAGUE_CONFIG_ID,
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

async function ensureShowcaseReviews(
  tx: Prisma.TransactionClient,
  sportId: string,
  showcase: LeagueTeamRoster,
  opponents: readonly LeagueTeamRoster[],
  now: Date,
) {
  const tagLabels = ['패스가 좋아요', '시간 약속을 잘 지켜요', '매너가 좋아요'] as const;
  const submittedDaysAgo = [17, 11, 5] as const;
  for (const [index, opponent] of opponents.entries()) {
    const sourceId = fixtureId(101 + index);
    // 각 경기(-18/-12/-6일) 종료 뒤 하루에 작성되고, 모두 72시간 reveal 폴백을 지난다.
    const submittedAt = new Date(now.getTime() - submittedDaysAgo[index] * DAY_MS);
    const teamReviewId = `ae100000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const personalReviewId = `ae200000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const rating = index === 1 ? 4 : 5;

    for (const review of [
      {
        id: teamReviewId,
        reviewerUserId: opponent.playerIds[0],
        reviewerTeamId: opponent.id,
        targetType: 'team' as const,
        targetTeamId: showcase.id,
        targetUserId: null,
      },
      {
        id: personalReviewId,
        reviewerUserId: opponent.playerIds[1],
        reviewerTeamId: opponent.id,
        targetType: 'user' as const,
        targetTeamId: null,
        targetUserId: showcase.playerIds[0],
      },
    ]) {
      await tx.v1PostEventReview.upsert({
        where: { id: review.id },
        update: {},
        create: {
          ...review,
          sourceType: 'team_match',
          sourceId,
          rating,
          sportId,
          status: 'submitted',
          scoringVersion: 'four_metric',
          submittedAt,
        },
      });
      await tx.v1PostEventReviewTag.upsert({
        where: { reviewId_tagCode: { reviewId: review.id, tagCode: `showcase_${index + 1}` } },
        update: {},
        create: { reviewId: review.id, tagCode: `showcase_${index + 1}`, labelSnapshot: tagLabels[index] },
      });
      const scores = [
        ['SKILL', rating],
        ['MANNER', 5],
        ['PUNCTUALITY', index === 1 ? 4 : 5],
        ['SAFETY', 5],
      ] as const;
      for (const [metric, score] of scores) {
        await tx.v1PostEventReviewMetricScore.upsert({
          where: { reviewId_metric: { reviewId: review.id, metric } },
          update: {},
          create: { reviewId: review.id, metric, score },
        });
      }
    }
  }
  // 실제 제출 경로는 후기 저장 직후 이 projection을 재계산한다. 시드는 raw Prisma로 같은
  // 결과 상태를 만들기 때문에 대표 선수 카드의 후기 기반 능력치도 함께 동기화한다.
  await tx.v1UserReputationSummary.upsert({
    where: { userId: showcase.playerIds[0] },
    update: {
      trustState: 'verified',
      mannerScore: 4.67,
      reviewCount: opponents.length,
      sourceLabel: 'Alpha 쇼케이스 팀매치 후기 기반',
      metricSkillScore: 4.67,
      metricMannerScore: 5,
      metricPunctualityScore: 4.67,
      metricSafetyScore: 5,
      metricReviewCount: opponents.length,
      calculatedAt: now,
    },
    create: {
      userId: showcase.playerIds[0],
      trustState: 'verified',
      mannerScore: 4.67,
      reviewCount: opponents.length,
      sourceLabel: 'Alpha 쇼케이스 팀매치 후기 기반',
      metricSkillScore: 4.67,
      metricMannerScore: 5,
      metricPunctualityScore: 4.67,
      metricSafetyScore: 5,
      metricReviewCount: opponents.length,
      calculatedAt: now,
    },
  });
  return { teamReviews: opponents.length, personalReviews: opponents.length };
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
        const showcase = await ensureShowcaseRoster(tx);
        const allTeams = [...teams, showcase];
        const teamsByNo = new Map(allTeams.map((team, index) => [index + 1, team]));
        const league = await ensureLeague(tx, sport.id, region.id, admin.id, allTeams, now);

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
        for (const spec of SHOWCASE_FIXTURES) {
          await ensureFixture(tx, spec, league, teamsByNo, showcase.playerIds[0], competitionConfig.id, now);
        }
        const showcaseReviews = await ensureShowcaseReviews(tx, sport.id, showcase, teams.slice(0, 3), now);

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
          showcaseTeamId: showcase.id,
          showcaseFixtures: SHOWCASE_FIXTURES.length,
          ...showcaseReviews,
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
