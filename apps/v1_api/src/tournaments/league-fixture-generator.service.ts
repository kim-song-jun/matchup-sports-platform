import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { generateRoundRobin } from '../common/scheduling/round-robin';
import { resolveFixtureStartAt, type FixtureScheduleTemplate } from '../league-matches/round-robin-schedule';
import { AdminContextService } from '../common/admin-context.service';
import { canonicalGameCommandPayloadHash, GamesService } from '../games/games.service';
import { PrismaService } from '../prisma/prisma.service';
import { V1AuthUser } from '../auth/v1-auth-user';
import { GenerateLeagueFixturesDto } from './dto/admin-league.dto';
import { hasTournamentFixtureOfficialResult } from './tournament-fixture-official-result';
import { findTournamentOnSurface, TOURNAMENT_KINDS } from './tournament-surface-lookup';

/**
 * ## 교체(`replaceExisting`)는 진짜 삭제다 — 그리고 지울 수 있는 것만 지운다
 *
 * 되돌리기를 "취소 표식(status = cancelled)"으로 만들었던 앞선 시도는 폐기했다. 그 값은 이
 * 저장소가 한 번도 쓴 적이 없어 대진을 읽는 쪽이 아무도 걸러내지 않았고, 물러난 행이 그대로
 * 남아 **공개 리그 진행률·매직넘버·카드 출전정지 판정**을 오염시켰다
 * (`leagueProgressOf` 는 fixture 행 수를 total 로 세고, `games.service.ts` 의 경기 순서
 * 인덱스는 `V1TournamentFixture` 전체를 정렬해 만든다). 표식은 지울 수도 없어 그 오염은
 * 되돌릴 수 없었다. 그래서 이 파일은 **행을 남기지 않는다** — 지우거나, 거절한다.
 *
 * ## 무엇을 지울 수 있는가 — 스키마가 정한다
 *
 * `V1TournamentFixture` 를 참조하는 관계를 `prisma/schema.prisma` 에서 전수로 읽어 두 부류로
 * 나눴다.
 *
 * **(1) DB 가 삭제를 거부하는 관계 (`onDelete: Restrict`)** — 하나라도 있으면 삭제는
 * *물리적으로 불가능*하다.
 *  - `V1Game.tournamentFixtureId` (schema.prisma `onDelete: Restrict`)
 *  - `V1TournamentStaffFixtureScope.fixtureId` (`v1_staff_scope_fixture_fk`, RESTRICT)
 *  - `V1OperationAudit(tournamentId, fixtureId)` (`v1_operation_audits_fixture_fk`, RESTRICT)
 *
 * 이 중 감사 로그는 **우회로가 아예 없다.** 같은 마이그레이션
 * (`20260801040000_v1_task7_staff_audit_scope/migration.sql`)이
 * `CREATE TRIGGER v1_operation_audits_append_only BEFORE UPDATE OR DELETE ON v1_operation_audits`
 * 를 걸어 감사 행을 지우는 것도, `fixture_id` 를 NULL 로 떼어내는 것도 ERRCODE 55000 으로
 * 거부한다. 그리고 `GamesService.createFromSourceInTransaction` 은 게임을 만들 때 항상
 * `GAME_CREATED` 감사를 `fixtureId` 와 함께 남긴다 — 즉 **게임이 한 번이라도 붙은 대진은
 * 영구히 삭제 불가**다. 이건 이 생성기만의 사정이 아니라 수동 폼(`createFixture`)으로 만든
 * 대진도 똑같다.
 *
 * **(2) 삭제하면 함께 사라지는 관계 (`onDelete: Cascade` / `SetNull`)** — `result`(결과),
 * `videos`(영상), `advancementSources`/`advancementTargets`(진출 연결), `childFixtures`(다음
 * 라운드 부모 참조). 조 단위 일괄 교체는 한 번의 클릭으로 수십 개를 지우는데 운영자는 어느
 * 대진에 영상·진출 연결이 걸려 있는지 화면에서 볼 수 없다. 그래서 **일괄 경로에서는 이쪽도
 * 막는다**(단건 삭제 `TournamentBracketService.deleteFixture` 는 대진 하나를 지목해 확인까지
 * 받는 조작이라 기존 cascade 계약을 그대로 둔다).
 *
 * ⇒ 결과적으로 이 생성기가 지우는 것은 **아무것도 매달려 있지 않은 대진 행**뿐이다. 그런
 * 행의 DELETE 는 다른 테이블을 한 줄도 건드리지 않으므로 FK 정리 순서 자체가 존재하지 않는다.
 * 하나라도 매달려 있으면 `LEAGUE_FIXTURES_NOT_DELETABLE` 로 **어느 대진이 무엇 때문에**
 * 막혔는지 이름을 붙여 거절한다.
 */

/** 대진 행 삭제를 막는 사유. `Restrict` 계열과 `Cascade` 계열을 구분해 담는다. */
export type LeagueFixtureBlocker =
  | 'game'
  | 'operation_audit'
  | 'staff_scope'
  | 'video'
  | 'child_fixture'
  | 'advancement_edge';

/** 운영자에게 보여 줄 사유 이름. 코드값을 그대로 노출하지 않는다. */
const BLOCKER_LABEL: Record<LeagueFixtureBlocker, string> = {
  game: '경기 기록',
  operation_audit: '운영 감사 기록',
  staff_scope: '스태프 배정',
  video: '경기 영상',
  child_fixture: '다음 라운드 연결',
  advancement_edge: '진출 연결',
};

/** 사유 목록을 운영자용 문구로 잇는다. 예: "경기 기록·운영 감사 기록". */
export function describeFixtureDeleteBlockers(blockers: readonly LeagueFixtureBlocker[]): string {
  return blockers.map((blocker) => BLOCKER_LABEL[blocker]).join('·');
}

/**
 * DB 가 삭제 자체를 거부하는 사유(`onDelete: Restrict`). 단건 삭제와 일괄 교체가 **똑같이**
 * 지켜야 하는 하한선이라 여기 한 곳에서만 판정한다 — 두 경로가 다른 기준을 쓰면 한쪽은
 * 매핑 없는 FK 위반 500 이 된다.
 */
export function restrictedFixtureDeleteBlockers(fixture: {
  game: { id: string } | null;
  _count: { operationAudits: number; staffScopes: number };
}): LeagueFixtureBlocker[] {
  const blockers: LeagueFixtureBlocker[] = [];
  if (fixture.game !== null) blockers.push('game');
  if (fixture._count.operationAudits > 0) blockers.push('operation_audit');
  if (fixture._count.staffScopes > 0) blockers.push('staff_scope');
  return blockers;
}

/**
 * 조 단위 일괄 교체가 쓰는 사유. `Restrict` 계열에 더해, 조용히 cascade 로 사라질 콘텐츠까지
 * 막는다(위 파일 주석 (2) 참고).
 */
export function bulkFixtureDeleteBlockers(fixture: {
  game: { id: string } | null;
  _count: {
    operationAudits: number;
    staffScopes: number;
    videos: number;
    childFixtures: number;
    advancementSources: number;
    advancementTargets: number;
  };
}): LeagueFixtureBlocker[] {
  const blockers = restrictedFixtureDeleteBlockers(fixture);
  if (fixture._count.videos > 0) blockers.push('video');
  if (fixture._count.childFixtures > 0) blockers.push('child_fixture');
  if (fixture._count.advancementSources + fixture._count.advancementTargets > 0) {
    blockers.push('advancement_edge');
  }
  return blockers;
}

/** 거절 메시지·`details` 에 실을 "지울 수 없는 대진" 한 건. */
export interface BlockedLeagueFixture {
  round: string;
  fixtureNumber: number;
  legNumber: number;
  reasons: LeagueFixtureBlocker[];
}

/**
 * 메시지와 `details` 에 이름을 붙여 실을 대진 수의 상한. 56대진짜리 조가 통째로 막히면
 * 전부 싣는 것은 토스트에도 응답에도 과하다 — 앞의 몇 건과 나머지 개수로 충분하다.
 */
const BLOCKED_SAMPLE_LIMIT = 5;

/** "league_r1 3번(경기 기록), league_r1 4번(경기 기록) 외 26개" 형태로 지목한다. */
function describeBlockedFixtures(blocked: readonly BlockedLeagueFixture[]): string {
  const sample = blocked
    .slice(0, BLOCKED_SAMPLE_LIMIT)
    .map((fixture) => `${fixture.round} ${fixture.fixtureNumber}번(${describeFixtureDeleteBlockers(fixture.reasons)})`)
    .join(', ');
  const rest = blocked.length - Math.min(blocked.length, BLOCKED_SAMPLE_LIMIT);
  return rest > 0 ? `${sample} 외 ${rest}개` : sample;
}

export interface LeagueGenerationGuardInput {
  format: string;
  groupPhase: string;
  teamCount: number;
  /** 조에 있는 기존 대진 수. */
  existingFixtureCount: number;
  /** 그중 공식 결과가 확정된 대진 수 — 삭제도 재생성도 허용하지 않는다. */
  fixturesWithResultCount: number;
  /** 그중 실제로 지울 수 없는 대진들. 비어 있으면 교체가 가능하다. */
  blockedFixtures: readonly BlockedLeagueFixture[];
  minMatchesPerTeam: number | null;
  legs: number;
  replaceExisting: boolean;
}

/**
 * `LEAGUE_FIXTURES_ALREADY_EXIST` 409 의 `details` — 어드민이 "교체할까요?" 를 누르기 **전에**
 * 무엇이 사라지고 애초에 교체가 가능하기는 한지 보여주기 위한 사전 영향 요약.
 *
 * 최상위 키가 아니라 `details` 아래에 싣는 이유: `AllExceptionsFilter` 가 응답 본문을
 * `{ code, message, details }` 로만 재조립하므로(`common/filters/http-exception.filter.ts`
 * — **파일명과 클래스명이 다르다.**
 * `HttpExceptionFilter` 라는 클래스는 없다 — 의도적 언급, 지우지 말 것)
 * 예외 객체 최상위에 얹은 필드는 클라이언트에 **도달하지 않는다**.
 */
export interface LeagueFixtureReplaceImpact {
  existingFixtureCount: number;
  fixturesWithResultCount: number;
  /** 지울 수 없는 대진 수. */
  blockedFixtureCount: number;
  /** 교체하면 실제로 삭제될 대진 수. */
  deletableFixtureCount: number;
  /** 막힌 대진 중 앞의 몇 건(최대 `BLOCKED_SAMPLE_LIMIT`) — 어느 대진인지 지목한다. */
  blockedFixtures: readonly BlockedLeagueFixture[];
  /**
   * 교체가 **실제로 통과할 것인가**. 화면은 이 값으로 "교체할까요?" 확인 모달을 띄울지 정하므로,
   * 여기서 true 를 주면 그 뒤 서버가 거절해서는 안 된다.
   *
   * 그래서 삭제를 막는 대진(blockedFixtures)뿐 아니라 **공식 결과가 있는 대진 수**도 함께 본다 —
   * 결과만 있고 게임이 없는 레거시 행은 삭제 차단 목록에는 안 잡히지만
   * `assertLeagueGenerationAllowed` 의 `LEAGUE_FIXTURES_HAVE_RESULTS` 가드에는 걸린다.
   * 한쪽만 보면 "물어보고 나서 거절하는" 흐름이 그 경로에만 남는다.
   */
  replaceable: boolean;
}

function replaceImpactOf(input: LeagueGenerationGuardInput): LeagueFixtureReplaceImpact {
  return {
    existingFixtureCount: input.existingFixtureCount,
    fixturesWithResultCount: input.fixturesWithResultCount,
    blockedFixtureCount: input.blockedFixtures.length,
    deletableFixtureCount: input.existingFixtureCount - input.blockedFixtures.length,
    blockedFixtures: input.blockedFixtures.slice(0, BLOCKED_SAMPLE_LIMIT),
    replaceable: input.blockedFixtures.length === 0 && input.fixturesWithResultCount === 0,
  };
}

/** 한 팀이 치르는 경기 수 = (참가팀 수 - 1) × 회전 수. */
export function matchesPerTeam(teamCount: number, legs: number): number {
  return Math.max(teamCount - 1, 0) * legs;
}

export function assertLeagueGenerationAllowed(input: LeagueGenerationGuardInput): void {
  // 조별리그+토너먼트 대회의 **조 단계**는 리그와 대진 규칙이 완전히 같다(라운드로빈).
  // 그런데 format 검사에서 먼저 막혀 자동 생성을 아예 못 썼다 — 조가 8팀이면 28경기를
  // 손으로 넣어야 했다. 결선 브래킷(semi/final/third_place)은 조 순위에서 진출팀을 뽑는
  // 별개 문제라 아래 groupPhase 가드가 그대로 막는다.
  if (input.format !== 'league' && input.format !== 'group_knockout') {
    throw new UnprocessableEntityException({
      code: 'TOURNAMENT_NOT_LEAGUE',
      message: '리그 또는 조별리그+토너먼트 대회에서만 조별 대진을 생성할 수 있어요.',
    });
  }
  if (input.groupPhase !== 'group') {
    throw new UnprocessableEntityException({
      code: 'LEAGUE_GROUP_PHASE_INVALID',
      message: '자동 생성은 조별 단계에서만 할 수 있어요. 준결승·결승·3위 결정전 대진은 직접 넣어주세요.',
    });
  }
  if (input.teamCount < 2) {
    throw new UnprocessableEntityException({
      code: 'LEAGUE_TEAMS_INSUFFICIENT',
      message: '조에 배정된 팀이 2팀 이상이어야 대진을 만들 수 있어요.',
    });
  }
  if (!input.replaceExisting && input.existingFixtureCount > 0) {
    // 교체 진입점. 여기서 넘기는 details 가 어드민 확인 모달의 문구를 만든다 —
    // 운영자는 "교체"를 누르기 전에 몇 개가 삭제되는지, 애초에 교체가 가능한지를 본다.
    throw new ConflictException({
      code: 'LEAGUE_FIXTURES_ALREADY_EXIST',
      message: '이미 대진이 있어요. 다시 만들려면 기존 대진을 교체해주세요.',
      details: replaceImpactOf(input),
    });
  }
  if (input.replaceExisting && input.fixturesWithResultCount > 0) {
    // 기존 경계선 — 공식 결과가 있는 대진은 삭제도 재생성도 하지 않는다. 아래 일반
    // 거절보다 먼저 두는 이유는 이쪽이 운영자에게 훨씬 구체적인 사실이어서다.
    throw new ConflictException({
      code: 'LEAGUE_FIXTURES_HAVE_RESULTS',
      message: '결과가 확정된 경기가 있어 대진을 다시 만들 수 없어요.',
      details: { fixturesWithResultCount: input.fixturesWithResultCount },
    });
  }
  // 지울 수 없는 대진이 하나라도 있으면 **아무것도 지우지 않고** 거절한다. 일부만 지우면
  // 조에 옛 대진과 새 대진이 뒤섞여, 어느 것이 진짜 일정인지 아무도 알 수 없는 상태가 된다.
  //
  // 여기서 "무엇이 막고 있는지"를 반드시 이름으로 말한다. 예전 문구("해당 경기를 먼저
  // 정리해주세요")는 정리할 방법이 없는 상태를 가리키고 있었다 — 게임이 붙은 대진은
  // 감사 로그 FK(RESTRICT) + append-only 트리거 때문에 어떤 순서로도 지울 수 없다.
  if (input.replaceExisting && input.blockedFixtures.length > 0) {
    throw new ConflictException({
      code: 'LEAGUE_FIXTURES_NOT_DELETABLE',
      message:
        `${describeBlockedFixtures(input.blockedFixtures)} 에 기록이 남아 있어 지울 수 없어요. ` +
        '기록이 남은 대진은 되돌릴 수 없으니, 대진을 새로 만드는 대신 각 경기를 "수정" 해서 팀과 일시를 바꿔주세요.',
      details: {
        blockedFixtureCount: input.blockedFixtures.length,
        blockedFixtures: input.blockedFixtures.slice(0, BLOCKED_SAMPLE_LIMIT),
      },
    });
  }
  const perTeam = matchesPerTeam(input.teamCount, input.legs);
  if (input.minMatchesPerTeam !== null && perTeam < input.minMatchesPerTeam) {
    const requiredLegs = Math.ceil(input.minMatchesPerTeam / Math.max(input.teamCount - 1, 1));
    throw new UnprocessableEntityException({
      code: 'LEAGUE_MIN_MATCHES_NOT_MET',
      message: `최소 ${input.minMatchesPerTeam}경기를 보장하려면 회전 수를 ${requiredLegs} 이상으로 설정해주세요.`,
      details: { requiredLegs, currentMatchesPerTeam: perTeam },
    });
  }
}

export interface LeagueFixtureRow {
  groupId: string;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  homeRegistrationId: string;
  awayRegistrationId: string;
  startAt: Date | null;
}

export function buildLeagueFixtureRows(input: {
  groupId: string;
  registrationIds: readonly string[];
  legs: number;
  balanceHome: boolean;
  schedule: { startsOn: Date; template: FixtureScheduleTemplate } | null;
  /**
   * 대회 전체에서 fixtureNumber가 연속 증가해야 하는 관례를 지키기 위한 오프셋.
   * `@@unique([tournamentId, round, fixtureNumber, legNumber])` 제약 때문에, 같은 대회의
   * 다른 조가 이미 만든 fixtureNumber와 겹치면 안 된다(F3). 호출부가 대회 전체의 현재
   * max fixtureNumber를 넘겨준다. 생략 시 0(기존 동작과 동일하게 1부터 시작).
   */
  fixtureNumberOffset?: number;
}): LeagueFixtureRow[] {
  const offset = input.fixtureNumberOffset ?? 0;
  const pairings = generateRoundRobin(input.registrationIds, {
    legs: input.legs,
    balanceHome: input.balanceHome,
  });
  return pairings.map((pairing, index) => ({
    groupId: input.groupId,
    round: `league_r${pairing.round}`,
    fixtureNumber: offset + index + 1,
    legNumber: pairing.leg,
    homeRegistrationId: pairing.homeId,
    awayRegistrationId: pairing.awayId,
    startAt: input.schedule
      ? resolveFixtureStartAt(input.schedule.startsOn, pairing.round, input.schedule.template)
      : null,
  }));
}

/**
 * 교체 가능 여부를 판정하는 데 필요한 최소 정보. 트랜잭션 밖 사전 점검과 트랜잭션 안
 * 재점검이 **같은 셀렉트**를 써야 두 판정이 어긋나지 않는다.
 *
 * `_count` 는 최상위 select 에만 쓴다(중첩 관계 안의 `_count` 는 이 저장소에 실행 선례가
 * 없다). 최상위 `_count` 는 `deleteGroup` 이 `groupTeams`/`fixtures` 로 이미 쓰고 있는
 * 형태다 — 여기 오류는 운영자 복구 경로 전체를 500 으로 만들기 때문에 선례가 있는 쪽만
 * 쓴다. 개수를 읽는 이유는 "하나라도 있는가"만 알면 되기 때문이고, 관계별 개수는 그대로
 * 거절 메시지의 사유가 된다.
 */
const existingFixtureSelect = {
  id: true,
  round: true,
  fixtureNumber: true,
  legNumber: true,
  game: { select: { id: true, currentOfficialRevision: { select: { state: true } } } },
  result: { select: { id: true } },
  _count: {
    select: {
      operationAudits: true,
      staffScopes: true,
      videos: true,
      childFixtures: true,
      advancementSources: true,
      advancementTargets: true,
    },
  },
} satisfies Prisma.V1TournamentFixtureSelect;

type ExistingFixture = Prisma.V1TournamentFixtureGetPayload<{ select: typeof existingFixtureSelect }>;

function summarizeExistingFixtures(fixtures: readonly ExistingFixture[]) {
  const blockedFixtures: BlockedLeagueFixture[] = [];
  for (const fixture of fixtures) {
    const reasons = bulkFixtureDeleteBlockers(fixture);
    if (reasons.length === 0) continue;
    blockedFixtures.push({
      round: fixture.round,
      fixtureNumber: fixture.fixtureNumber,
      legNumber: fixture.legNumber,
      reasons,
    });
  }
  return {
    existingFixtureCount: fixtures.length,
    fixturesWithResultCount: fixtures.filter((fixture) =>
      hasTournamentFixtureOfficialResult(fixture.game, fixture.result),
    ).length,
    blockedFixtures,
  };
}

/**
 * 이 조에 만들어질 대진 수. 라운드로빈은 회전당 C(n,2) 경기라 팀 수·회전 수만으로 정해진다.
 * 트랜잭션이 시간 안에 못 끝났을 때 "몇 개를 만들려다 실패했는지"를 운영자에게 말해 준다.
 */
function plannedFixtureCount(teamCount: number, legs: number): number {
  return (Math.max(teamCount, 0) * Math.max(teamCount - 1, 0) * legs) / 2;
}

/**
 * 인터랙티브 트랜잭션 상한. **앞단 프록시 상한보다 반드시 낮아야 한다.**
 *
 * 예전 값은 120초였는데 앞단 ALB idle_timeout 이 60초다. 그래서 큰 조를 생성하면 운영자는
 * 60초에 504 를 받아 "실패했다"고 믿는 동안 백엔드는 계속 돌아 **그대로 커밋**했다. 그 다음
 * 클릭은 `LEAGUE_FIXTURES_ALREADY_EXIST` 로 막히고, 교체를 눌러도 방금 만들어진 게임 때문에
 * 지울 수 없어 조가 잠긴다. nginx 만 늘려서는 풀리지 않는다 — 커넥션을 끊는 쪽은 ALB 다.
 *
 * 그래서 **앱이 먼저 포기**하게 둔다. 45초 + `maxWait` 5초 = 최악 50초라 ALB 60초 안에서
 * 끝나고, Prisma 가 트랜잭션을 만료시키면 열려 있던 쓰기는 전부 롤백된다 — 운영자가 받는
 * 실패가 실제 실패와 일치한다.
 *
 * 한 번에 만들 수 있는 규모의 상한(예: "대진 N개 초과 거부")은 검토했지만 두지 않았다.
 * 대진 하나당 비용(게임·사이드·라인업·참가자·피리어드·감사)은 조의 명단 크기에 따라 크게
 * 달라져서, 실측 없이 정한 상수는 지금 잘 도는 생성까지 막을 수 있다. 대신 만료를 아래
 * `LEAGUE_FIXTURES_GENERATION_TIMEOUT` 로 번역해 "무엇이 저장됐는지(아무것도 아님)"와
 * "무엇을 하면 되는지"를 말해 준다 — 이쪽이 스스로 보정되고 거짓 거절이 없다.
 */
const TRANSACTION_TIMEOUT_MS = 45_000;
const TRANSACTION_MAX_WAIT_MS = 5_000;

/**
 * Prisma 가 **시간 초과로 트랜잭션을 닫은** 경우인가.
 *
 * P2028 은 "트랜잭션을 시작조차 못 함(커넥션 풀 포화)"과 "열어 둔 트랜잭션이 만료됨" 두
 * 가지를 같은 코드로 쓴다. 앞의 것은 잠시 뒤 재시도로 풀리는 가용성 실패라 전역 필터가 이미
 * 503 `SERVICE_TEMPORARILY_BUSY` 로 번역한다(`common/prisma-availability-error.ts`) —
 * 그쪽까지 가로채면 "조를 작게 나누라"는 엉뚱한 안내를 하게 된다. 그래서 만료 쪽만 문구로
 * 가려낸다. 문구가 바뀌면 이 검사가 false 가 되고 전역 503 으로 되돌아갈 뿐이라, 틀려도
 * 지금보다 나빠지지 않는다.
 */
function isExpiredTransactionError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2028') return false;
  return /expired transaction|transaction already closed/i.test(error.message);
}

@Injectable()
export class LeagueFixtureGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminContext: AdminContextService,
    private readonly games: GamesService,
  ) {}

  async generate(user: V1AuthUser, tournamentId: string, dto: GenerateLeagueFixturesDto) {
    const admin = await this.adminContext.getMutationAdmin(user.id);

    const tournament = await findTournamentOnSurface(this.prisma, TOURNAMENT_KINDS, {
      where: { id: tournamentId },
      select: { id: true, format: true, minMatchesPerTeam: true },
    });
    if (!tournament) {
      throw new NotFoundException({ code: 'TOURNAMENT_NOT_FOUND', message: '대회를 찾을 수 없어요.' });
    }

    const group = await this.prisma.v1TournamentGroup.findFirst({
      where: { id: dto.groupId, tournamentId },
      include: { groupTeams: { select: { registrationId: true, sortOrder: true } } },
    });
    if (!group) {
      throw new NotFoundException({ code: 'GROUP_NOT_FOUND', message: '해당 대회의 조를 찾을 수 없어요.' });
    }

    // F1: DB 반환 순서는 정렬 순서를 보장하지 않는다. 라운드로빈 커널의 홈 균형
    // tie-break(pickHome)가 입력 순서에 의존하므로, sortOrder(동률이면
    // registrationId)로 명시 정렬해 대진 생성이 실행마다 흔들리지 않게 한다.
    const sortedRegistrationIds = [...group.groupTeams]
      .sort((a, b) => a.sortOrder - b.sortOrder || (a.registrationId < b.registrationId ? -1 : a.registrationId > b.registrationId ? 1 : 0))
      .map((team) => team.registrationId);

    // F2: `game?.currentOfficialRevisionId != null` 만으로는 결과 확정 여부를 정확히
    // 판정할 수 없다(VOID 리비전에도 값이 있을 수 있고, 레거시 result-only 픽스처는
    // 놓친다). `hasTournamentFixtureOfficialResult`가 이 판정의 단일 기준이다.
    //
    // status 로 거르지 않는다 — 교체는 행을 남기지 않으므로 "죽은 대진" 상태가 존재하지
    // 않는다. 조에 있는 대진은 전부 진짜 일정이다.
    const existingFixtures = await this.prisma.v1TournamentFixture.findMany({
      where: { groupId: group.id },
      select: existingFixtureSelect,
    });

    const guardBase = {
      format: tournament.format,
      groupPhase: group.phase,
      teamCount: group.groupTeams.length,
      minMatchesPerTeam: tournament.minMatchesPerTeam,
      legs: dto.legs,
      replaceExisting: dto.replaceExisting ?? false,
    };
    // 사전 점검 — 트랜잭션을 열기 전에 409/422 를 돌려준다(교체 확인 모달의 입력이기도 하다).
    assertLeagueGenerationAllowed({ ...guardBase, ...summarizeExistingFixtures(existingFixtures) });

    const schedule = dto.schedule
      ? { startsOn: new Date(dto.schedule.startsOn), template: dto.schedule.template }
      : null;

    // F3: fixtureNumber는 대회 전체에서 연속 증가해야 한다
    // (`@@unique([tournamentId, round, fixtureNumber, legNumber])`) — 조가 2개 이상이면
    // 각 조가 1부터 매기던 기존 방식은 unique 위반으로 생성이 실패한다. 트랜잭션 안에서
    // 대회 전체 max fixtureNumber를 조회해 오프셋을 준다. rows도 이 오프셋이 정해진 뒤에야
    // 확정되므로 트랜잭션 안에서 빌드한다. 교체 시에는 기존 대진을 **먼저 지우고** max 를
    // 읽으므로 지워진 번호가 그대로 재사용되고, 대회 전체 번호가 계속 촘촘하게 이어진다.
    const generated = await this.runGenerationTransaction(
      guardBase.teamCount,
      dto.legs,
      async (tx) => {
        // C1: 대회 경기는 **활성 경기 규칙 버전을 못 박은 V1Game 을 반드시 동반한다**
        // (tournament-bracket.service.ts createFixture 와 같은 계약). 이 생성기는 fixture
        // 행만 만들고 게임을 만들지 않아서, 만들어진 경기가 공개 일정 프로젝션에서
        // `fixture.game?.visibilityPolicy?.mode ?? 'HIDDEN'` → hidden 으로 접혀 한 건도
        // 안 보였고, 경기 상세는 404, 라인업은 TOURNAMENT_FIXTURE_GAME_NOT_FOUND 였다.
        // 규칙 버전 조회를 트랜잭션 안에서 하는 이유는 createFixture 와 같다 — 이 트랜잭션이
        // 쓰는 모든 fixture·game 이 **하나의 같은 버전**에 고정돼야 하기 때문이다.
        const pinnedTournament = await findTournamentOnSurface(tx, TOURNAMENT_KINDS, {
          where: { id: tournamentId },
          select: { competitionConfigVersionId: true },
        });
        const competitionConfigVersionId = pinnedTournament?.competitionConfigVersionId;
        if (!competitionConfigVersionId) {
          // 여기서 막지 않으면 규칙 없는 fixture 가 그대로 만들어지고, 그 행은 나중에
          // fixture-game-backfill CLI 마저 CONFIG_MISSING 으로 격리해 복구 수단이 사라진다.
          // 기존 대진을 취소하기 전에 던져야 replaceExisting 이 빈손으로 끝나지 않는다.
          throw new ConflictException({
            code: 'COMPETITION_CONFIG_REQUIRED',
            message: '대회 경기에는 활성 경기 규칙 버전이 필요해요.',
          });
        }

        // 트랜잭션 안에서 다시 판정한다. 사전 점검과 여기 사이에 다른 운영자가 경기를
        // 시작했거나 대진을 더 만들었을 수 있는데, 그 상태를 못 보고 지우면 방금 만들어진
        // 기록을 잃는다. 같은 순수 가드를 같은 셀렉트로 한 번 더 돌린다.
        const currentFixtures = await tx.v1TournamentFixture.findMany({
          where: { groupId: group.id },
          select: existingFixtureSelect,
        });
        assertLeagueGenerationAllowed({ ...guardBase, ...summarizeExistingFixtures(currentFixtures) });

        let deletedCount = 0;
        if (dto.replaceExisting && currentFixtures.length > 0) {
          deletedCount = await this.deleteFixtures(tx, currentFixtures);
          await this.adminContext.logAdminAction(
            admin,
            {
              action: 'tournament.league.fixtures.delete',
              targetType: 'tournament_group',
              targetId: group.id,
              beforeJson: { fixtureIds: currentFixtures.map((fixture) => fixture.id) },
            },
            tx,
          );
        }

        const maxFixtureNumber = await tx.v1TournamentFixture.aggregate({
          where: { tournamentId },
          _max: { fixtureNumber: true },
        });
        const fixtureNumberOffset = maxFixtureNumber._max.fixtureNumber ?? 0;

        const builtRows = buildLeagueFixtureRows({
          groupId: group.id,
          registrationIds: sortedRegistrationIds,
          legs: dto.legs,
          balanceHome: dto.balanceHome ?? true,
          schedule,
          fixtureNumberOffset,
        });

        // 게임의 사이드(팀)·초기 로스터 스냅샷 재료. 조 전체를 한 번에 읽는다 — 대진마다
        // 다시 조회하면 8팀 조(28경기)에서 같은 등록을 56번 읽게 된다.
        //
        // `status: 'confirmed'` 로 **거르지 않는다.** 거르면 확정이 아닌 신청이 "조회 결과에
        // 없음" 으로만 나타나서, 어느 팀이 문제인지 이름조차 알려줄 수 없다. 조에 배정된
        // 신청을 전부 읽어 온 뒤 아래에서 상태를 판정한다.
        const registrations = await tx.v1TournamentRegistration.findMany({
          where: { id: { in: sortedRegistrationIds }, tournamentId },
          include: {
            team: { select: { id: true, name: true } },
            players: {
              where: { removedAt: null },
              // userId 를 함께 싣는 이유는 createFixture 와 같다 — 이름 문자열만으로는
              // 동명이인을 구분할 수 없어 라인업 화면이 등록 명단과 참가자를 잇지 못한다.
              select: { id: true, userId: true, realName: true },
              orderBy: { id: 'asc' },
            },
          },
        });
        const registrationById = new Map(registrations.map((registration) => [registration.id, registration]));

        // 조 배정 시점에는 confirmed 였어도 그 뒤 참가 취소될 수 있다(취소 경로가
        // V1TournamentGroupTeam 행을 지우지 않는다 — tournament-registrations.service.ts
        // requestCancel / admin-registrations.service.ts approveCancel). 팀 없는 사이드로
        // 게임을 만들면 또 하나의 유령 경기가 되므로 도메인 오류로 거부한다
        // (createFixture 의 HOME/AWAY_REGISTRATION_INVALID 와 같은 계약).
        //
        // **어느 팀인지 반드시 알려준다.** 8팀 조에서 "확정이 아닌 신청이 있어요" 만 받으면
        // 운영자는 신청 목록을 한 줄씩 대조해야 한다 — 어드민 대진표 화면에는 조 팀별 신청
        // 상태 표시가 없다. 팀명은 공개 정보라 details 에 실어도 PII 문제가 없다.
        const unconfirmed = sortedRegistrationIds
          .map((registrationId) => ({ registrationId, registration: registrationById.get(registrationId) }))
          .filter(({ registration }) => registration === undefined || registration.status !== 'confirmed')
          .map(({ registrationId, registration }) => ({
            registrationId,
            teamName: registration?.team.name ?? null,
            status: registration?.status ?? null,
          }));
        if (unconfirmed.length > 0) {
          const named = unconfirmed
            .map((entry) => entry.teamName ?? `신청 ${entry.registrationId}`)
            .join(', ');
          throw new UnprocessableEntityException({
            code: 'LEAGUE_REGISTRATION_NOT_CONFIRMED',
            message: `${named} 의 신청이 확정 상태가 아니에요. 신청을 확정하거나 조 배정을 해제한 뒤 다시 시도해주세요.`,
            details: { registrations: unconfirmed },
          });
        }
        const requireConfirmed = (registrationId: string) => {
          const registration = registrationById.get(registrationId);
          if (registration === undefined) {
            // 위 unconfirmed 검사를 통과했으면 도달할 수 없다. 조용히 지나가면 팀 없는
            // 게임이 만들어지므로 같은 도메인 오류로 명시적으로 끊는다.
            throw new UnprocessableEntityException({
              code: 'LEAGUE_REGISTRATION_NOT_CONFIRMED',
              message: '조에 배정된 신청을 찾을 수 없어요. 조 배정을 확인한 뒤 다시 시도해주세요.',
              details: { registrations: [{ registrationId, teamName: null, status: null }] },
            });
          }
          return registration;
        };
        // 한 행도 쓰기 전에 전부 확인한다 — 마지막 팀이 취소 상태라서 27경기를 만든 뒤
        // 롤백하는 낭비를 막는다.
        const pairedRows = builtRows.map((row) => ({
          row,
          home: requireConfirmed(row.homeRegistrationId),
          away: requireConfirmed(row.awayRegistrationId),
        }));

        for (const { row, home, away } of pairedRows) {
          const fixture = await tx.v1TournamentFixture.create({
            data: {
              tournamentId,
              groupId: row.groupId,
              round: row.round,
              fixtureNumber: row.fixtureNumber,
              legNumber: row.legNumber,
              homeRegistrationId: row.homeRegistrationId,
              awayRegistrationId: row.awayRegistrationId,
              scheduledAt: row.startAt,
              competitionConfigVersionId,
            },
          });

          // 커맨드 키·페이로드 해시는 createFixture 와 **같은 규약**을 쓴다. 얻는 것은
          // 경로 간 멱등성이다 — 같은 대진 좌표(round/fixtureNumber/legNumber)를 수동 폼으로
          // 다시 만들면 키와 payloadHash 가 둘 다 일치해 중복 생성 대신 REPLAY 로 처리된다
          // (`canonicalGameCommandPayloadHash` 가 키를 정렬해 해싱하므로 아래 10개 필드가
          // createFixture 의 `existingPayload` 와 그대로 대응한다).
          //
          // 이 루프 안에서 키가 뭉치는지 여부는 **중복 생성과 무관하다.** 멱등 조회의
          // 복합 유니크는 `(actorUserId, action, resourceType, resourceId, idempotencyKey)`
          // 이고 `resourceId` 는 방금 만든 fixture.id 라 건마다 다르며, 그 앞 단락 조회도
          // `v1Game.findFirst({ tournamentFixtureId: sourceId })` 로 fixture 별로 스코프된다
          // (games.service.ts createFromSourceInTransaction). 즉 키가 6건 모두 같아도 게임은
          // 6개 생긴다 — "키가 뭉치면 REPLAY 로 삼켜진다" 는 이 코드에 존재하지 않는
          // 메커니즘이다. 그래도 좌표별로 다른 키를 쓰는 이유는 위의 경로 간 멱등성과,
          // 감사 로그(`V1OperationAudit.requestId`)에서 어느 대진의 커맨드인지 식별하기
          // 위해서다.
          const durableCommandId = `tournament-fixture:${tournamentId}:${row.round}:${row.fixtureNumber}:${row.legNumber}`;
          const payloadHash = canonicalGameCommandPayloadHash({
            tournamentId,
            groupId: row.groupId,
            round: row.round,
            fixtureNumber: row.fixtureNumber,
            legNumber: row.legNumber,
            parentFixtureId: null,
            homeRegistrationId: row.homeRegistrationId,
            awayRegistrationId: row.awayRegistrationId,
            scheduledAt: row.startAt?.toISOString() ?? null,
            venue: null,
          });

          await this.games.createFromSourceInTransaction(
            tx,
            {
              sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
              sourceId: fixture.id,
              competitionConfigVersionId,
              sides: [
                { sideKey: V1GameSideKey.HOME, teamId: home.team.id, displayNameSnapshot: home.team.name },
                { sideKey: V1GameSideKey.AWAY, teamId: away.team.id, displayNameSnapshot: away.team.name },
              ],
              participants: [
                ...home.players.map((player) => ({
                  sourceParticipantId: player.id,
                  userId: player.userId,
                  sideKey: V1GameSideKey.HOME,
                  displayNameSnapshot: player.realName,
                })),
                ...away.players.map((player) => ({
                  sourceParticipantId: player.id,
                  userId: player.userId,
                  sideKey: V1GameSideKey.AWAY,
                  displayNameSnapshot: player.realName,
                })),
              ],
            },
            {
              actor: {
                actorType: 'USER',
                actorUserId: user.id,
                role: 'platform_ops',
                tournamentId,
                fixtureId: fixture.id,
              },
              expectedVersion: 0,
              durableCommandId,
              payloadHash,
            },
          );
        }

        return { deleted: deletedCount, rows: builtRows };
      },
    );
    const { deleted, rows } = generated;

    const warnings: Array<{ code: string; message: string }> = [];
    if (!dto.schedule) {
      warnings.push({ code: 'SCHEDULE_NOT_SET', message: '경기 일시가 지정되지 않았어요.' });
    }
    if (group.groupTeams.length % 2 !== 0) {
      warnings.push({ code: 'ODD_TEAM_COUNT_BYE', message: '팀 수가 홀수라 라운드마다 한 팀이 쉬어요.' });
    }

    return {
      created: rows.length,
      /** 이 호출이 조에서 실제로 삭제한 기존 대진 수 — 행이 남지 않는다. */
      deleted,
      perTeamMatches: matchesPerTeam(group.groupTeams.length, dto.legs),
      rounds: rows.length === 0 ? 0 : new Set(rows.map((r) => r.round)).size,
      warnings,
    };
  }

  /**
   * 생성 트랜잭션을 연다. 만료(시간 초과)만 도메인 오류로 번역하고 나머지는 그대로 흘린다 —
   * 상한을 왜 45초로 두는지는 `TRANSACTION_TIMEOUT_MS` 주석에 있다.
   */
  private async runGenerationTransaction<T>(
    teamCount: number,
    legs: number,
    body: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(body, {
        timeout: TRANSACTION_TIMEOUT_MS,
        maxWait: TRANSACTION_MAX_WAIT_MS,
      });
    } catch (error) {
      if (!isExpiredTransactionError(error)) throw error;
      const planned = plannedFixtureCount(teamCount, legs);
      throw new UnprocessableEntityException({
        code: 'LEAGUE_FIXTURES_GENERATION_TIMEOUT',
        message:
          `한 번에 만들 대진이 ${planned}개라 ${TRANSACTION_TIMEOUT_MS / 1000}초 안에 끝내지 못했어요. ` +
          '저장된 대진은 하나도 없으니, 조를 더 작게 나누거나 회전 수를 줄여 다시 시도해주세요.',
        details: { plannedFixtureCount: planned, timeoutMs: TRANSACTION_TIMEOUT_MS },
      });
    }
  }

  /**
   * 기존 대진을 **실제로 지운다**. 여기 도달하는 대진은 `assertLeagueGenerationAllowed` 가
   * 이미 "아무것도 매달려 있지 않다"고 판정한 것뿐이라, 이 DELETE 는 다른 테이블을 한 줄도
   * 건드리지 않는다(파일 상단 주석 참고).
   *
   * `where` 에 그 전제를 **그대로 다시 적는 것이 CAS 다.** 재점검과 이 DELETE 사이에 다른
   * 요청이 경기를 붙였다면 Postgres 가 최신 커밋본으로 이 조건을 다시 따져 그 행을 빼므로,
   * 지운 행 수가 모자란 것으로 드러난다 — 그때는 전체를 롤백한다(같은 저장소의
   * `tournament-operations-fields.service.ts` 가 쓰는 패턴).
   */
  private async deleteFixtures(
    tx: Prisma.TransactionClient,
    fixtures: readonly ExistingFixture[],
  ): Promise<number> {
    const fixtureIds = fixtures.map((fixture) => fixture.id);
    if (fixtureIds.length === 0) return 0;

    let deleted: { count: number };
    try {
      deleted = await tx.v1TournamentFixture.deleteMany({
        where: {
          id: { in: fixtureIds },
          game: { is: null },
          result: { is: null },
          operationAudits: { none: {} },
          staffScopes: { none: {} },
          videos: { none: {} },
          childFixtures: { none: {} },
          advancementSources: { none: {} },
          advancementTargets: { none: {} },
        },
      });
    } catch (error) {
      // 상대 트랜잭션이 아직 커밋 전이면 위 조건이 그 행을 걸러내지 못한다. Postgres 는
      // FK 검사로 잡은 락 때문에 이 DELETE 를 대기시켰다가, 상대가 커밋하면 FK 위반으로
      // 거부한다(P2003). 매핑하지 않으면 운영자가 원인 없는 500 을 본다.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw this.fixturesChangedConflict();
      }
      throw error;
    }
    if (deleted.count !== fixtureIds.length) throw this.fixturesChangedConflict();
    return deleted.count;
  }

  private fixturesChangedConflict(): ConflictException {
    return new ConflictException({
      code: 'LEAGUE_FIXTURES_CHANGED',
      message: '다른 요청이 방금 이 조의 대진을 바꿨어요. 새로고침한 뒤 다시 시도해주세요.',
    });
  }
}
