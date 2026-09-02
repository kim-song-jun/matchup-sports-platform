/**
 * 운영자 결과 입력·정정에 실린 선수별 득점·도움을 `actualParticipants`로 조립하는
 * 순수 규칙 모듈. 네트워크·Prisma 없이 단독 테스트 가능하도록 서비스에서 분리했다
 * (league-standings.ts / league-result-dispute-eligibility.ts 와 같은 관례).
 *
 * 사이드는 클라이언트 입력이 아니라 participant 행에서 도출한다 — 홈/원정이 뒤바뀐
 * 채 저장되면 개인 기록이 상대 팀 선수에게 붙는 사고가 되는데, 그 검증을 화면에
 * 맡기지 않는다.
 *
 * ## 출전 기록(appearances)까지 남기는 이유
 * `V1GameResultParticipant` 행의 **존재 자체**가 "이 선수가 뛰었다"는 뜻이고, 개인
 * 프로필의 "출전 N경기"(games/public-records/player-card-stats.ts)가 그 행 수를 센다.
 * 예전에는 이 모듈이 득점·도움이 모두 0인 선수를 `continue` 로 버렸기 때문에 **골 없이
 * 뛴 선수는 리그에서 출전 기록이 아예 남지 않았고**, 남은 행조차 `started`/`goalkeeper`
 * 를 false 로 못박아 선발 비율이 영구히 0이었다. 대회(TOURNAMENT_FIXTURE) 레인은
 * games.service.ts 가 라인업에서 출전자 전원과 실제 started/goalkeeper 를 가져오는데
 * 리그만 빠져 있었다.
 *
 * ## 다만 "허위 출전"은 만들지 않는다
 * 리그 대진은 생성 시점에 **양 팀 전체 active 멤버**를 자동 로스터로 넣는다
 * (league-match-admin.service.ts → GamesService.createFromSourceInTransaction 이 만드는
 * 사이드별 라인업 리비전 1). 그 14명을 전원 출전으로 기록하면 나오지도 않은 사람의
 * 출전 기록이 생긴다 — 지금 결함보다 나쁘다. 그래서 **팀이 실제로 작성한 라인업이 있는
 * 사이드**(`LeagueSideRoster.teamAuthored`)에서만 로스터 전원을 기록하고, 자동 로스터뿐인
 * 사이드는 예전처럼 기록이 있는 선수만 저장한다.
 *
 * ## 한 경기·한 사람 = 결과 행 하나 (`foldDuplicateIdentities`)
 * `V1GameParticipant` 행은 라인업을 저장할 때마다 **새로 쌓인다**(team-match-lineup.service.ts
 * 는 이전 행을 지우지 않는다). 그래서 같은 사람이 리비전 1·2·3 에 각각 다른 participantId
 * 로 존재하고, 옛 리비전 행에 득점이 달린 채 확정된 경기가 알파에 실제로 있다(득점자
 * 드롭다운이 같은 이름을 2~3번 보여주던 시절의 데이터). 위 로스터 전원 기록과 승계 규칙이
 * 겹치면 그 경기에서 **같은 사람이 결과 행을 두 개** 갖게 되는데, 개인 기록 공개
 * (games/public-records/public-user-records.service.ts)는 `appearances` 를 **행 수**로 세므로
 * 출전이 1 부풀고 전적 목록에 같은 경기가 두 번 뜬다. 그래서 조립 마지막에 사람 단위로
 * 접는다.
 *
 * - **동일인 판정은 `userId` 뿐이다.** `displayNameSnapshot` 은 동명이인을 구분하지 못해
 *   남의 득점을 다른 사람에게 붙일 수 있다 — 이 저장소가 라인업 저장에서 개별 create 로
 *   id 를 직접 받는 이유와 정확히 같은 위험이라(team-match-lineup.service.ts 주석) 이름은
 *   판정에 쓰지 않는다. `userId` 가 없는 게스트는 접을 근거가 없으므로 각자 남는다.
 * - **정본은 최신 로스터 행**이다. 이후 입력·공개 프로젝션이 모두 그 행을 쓰고,
 *   started/goalkeeper 증거도 그 행에만 있다.
 * - **기록은 합산한다**(득점·도움·파울·카드, 출전시간은 최댓값). 옛 행에 달린 득점이
 *   조용히 사라지면 안 된다. 사이드가 다른 행은 접지 않는다 — 접는 순간 득점이 사이드를
 *   넘어가 스코어 검증이 무의미해진다.
 *
 * ## 이벤트가 있는 경기에서는 로스터 확장을 끈다 (`hasGameEvents`)
 * `validateGameResultInvariants`(games/core/game-invariants.ts)의 TEAM_MATCH 면제는
 * **이벤트 행이 0건일 때만** 걸린다. 이벤트가 하나라도 있으면 저장하려는 참가자 전원의
 * 득점·카드가 이벤트 스트림과 정확히 일치해야 하는데, 로스터 전원을 `cards:{0,0}`·`goals:0`
 * 으로 실으면 운영자가 손댈 수 없는 값(카드는 DTO 에 칸조차 없다) 때문에
 * `SCORE_EVENT_MISMATCH` 로 **결과 입력 자체가 막힌다**. 리그 대진은 라이브 콘솔을 쓰지
 * 않아 이벤트가 0건인 것이 정상이지만, 플랫폼 어드민이 `POST /games/:id/events` 로 직접
 * 붙일 수는 있다(sourceType 가드가 없다 — game-invariants.ts 주석).
 *
 * 그래서 이벤트가 있는 경기에서는 출전 기록 확장을 **끄고** 예전 규칙(기록이 있는 행만
 * 저장)으로 돌아간다. 카드만 이벤트에서 읽어 오는 절충도 검토했지만 반쪽짜리다 —
 * 같은 확장이 득점 대조(`participantGoals` vs `eventGoalsByParticipant`)도 함께 넓혀서,
 * 골 이벤트가 달린 로스터 멤버를 운영자가 입력하지 않으면 여전히 하드 실패한다. 이벤트가
 * 권위인 경기에서 출전 기록을 못 남기는 것이, 결과를 아예 기록하지 못하는 것보다 낫다.
 */

/**
 * team-match 라인업이 선발 골키퍼를 표시하는 센티널(같은 파일의 `GOALKEEPER_MARKER`).
 *
 * 종목별 골키퍼 코드(축구 'GK', 풋살 'GOLEIRO')와 **별개로** 반드시 함께 봐야 한다:
 * 대회 라인업(games.service.ts saveLineup)은 competition config 사전의 코드를 그대로
 * 저장하지만, team-match 라인업은 `goalkeeper: true` 를 받아 **항상 리터럴 'GK'** 로
 * 눌러 담는다. 리그 대진은 team-match 경로를 쓰므로 config 코드만 비교하면 풋살
 * 리그의 골키퍼는 영원히 goalkeeper=false 로 저장된다. 두 값 모두 소비처
 * (player-card-stats.ts `normalizePosition`)에서 같은 'GK'로 접힌다.
 */
const TEAM_MATCH_GOALKEEPER_POSITION = 'GK';

const SIDE_KEYS = ['HOME', 'AWAY'] as const;

export interface LeagueResultParticipantStatInput {
  participantId: string;
  goals: number;
  assists?: number;
}

export interface LeagueGameParticipantRow {
  id: string;
  sideId: string;
}

export interface LeagueGameSideRow {
  id: string;
  sideKey: 'HOME' | 'AWAY';
}

/** 사이드별 **최신 라인업 리비전**의 참가자 한 명분. */
export interface LeagueLineupParticipantRow {
  id: string;
  sideId: string;
  /**
   * 포지션 코드. 'GK'(팀 매치는 종목 무관 리터럴) 또는 종목 사전 코드, 없으면 null.
   *
   * **선발/후보는 여기 없다** — 정본 §3 이 그 구분을 없앴다(명단 = 출전자). 예전엔 이
   * 자리의 `'BENCH'` 센티널이 후보 표시였고 이 모듈이 그 값을 **복사해** 갖고 있었다.
   */
  position: string | null;
}

/** 사이드 하나의 최신 라인업 스냅샷. */
export interface LeagueSideRoster {
  sideId: string;
  /**
   * 팀이 실제로 작성한 라인업인가. false 면 대진 생성이 만든 자동 로스터(팀 전체 멤버)
   * 뿐이라 "누가 뛰었는지"에 대한 증거가 없다 — 그 사이드에서는 출전 기록을 만들지 않는다.
   */
  teamAuthored: boolean;
  participants: LeagueLineupParticipantRow[];
}

/** GamesService.createResultRevision 계열이 받는 actualParticipants 한 명분. */
export interface AssembledResultParticipant {
  participantId: string;
  sideId: string;
  started: boolean;
  goals: number;
  assists?: number;
  fouls?: number;
  minutesPlayed?: number;
  cards: { yellow: number; red: number };
  goalkeeper: boolean;
}

/** 직전 공식 리비전에 저장돼 있던 개인 기록 한 행 (V1GameResultParticipant 부분집합). */
export interface StoredResultParticipantRow {
  participantId: string;
  sideId: string;
  started: boolean;
  minutesPlayed: number | null;
  goals: number;
  assists: number;
  fouls: number;
  cards: unknown;
  goalkeeper: boolean;
}

export type AssembleResult =
  | { ok: true; actualParticipants: AssembledResultParticipant[] }
  | { ok: false; code: string; message: string };

/**
 * participantId → 그 행이 가리키는 실제 사용자(`V1GameParticipant.userId`).
 * 게스트·레거시 행은 null 이며 접기 대상이 아니다.
 */
export type ParticipantUserIdMap = ReadonlyMap<string, string | null>;

/** 두 결과 행이 같은 사람인지 판정하는 키. 사이드가 다르면 절대 같은 항목으로 접지 않는다. */
function identityKey(row: AssembledResultParticipant, userIdByParticipantId: ParticipantUserIdMap): string | null {
  const userId = userIdByParticipantId.get(row.participantId) ?? null;
  return userId === null ? null : `${row.sideId}:${userId}`;
}

/** 같은 사람의 두 결과 행을 하나로 합친다. 정본(최신 로스터 행)의 신원·출전 판정을 유지한다. */
function mergeSamePerson(
  canonical: AssembledResultParticipant,
  extra: AssembledResultParticipant,
): AssembledResultParticipant {
  const assists = (canonical.assists ?? 0) + (extra.assists ?? 0);
  const fouls = (canonical.fouls ?? 0) + (extra.fouls ?? 0);
  // 출전시간은 합산하지 않는다 — 같은 경기의 같은 사람이라 두 값은 같은 시간을 두 번
  // 적은 것이지 이어 뛴 시간이 아니다. 더 길게 적힌 쪽을 남긴다.
  const minutes = [canonical.minutesPlayed, extra.minutesPlayed].filter(
    (value): value is number => value !== undefined,
  );
  return {
    participantId: canonical.participantId,
    sideId: canonical.sideId,
    started: canonical.started,
    goals: canonical.goals + extra.goals,
    ...(assists === 0 ? {} : { assists }),
    ...(fouls === 0 ? {} : { fouls }),
    ...(minutes.length === 0 ? {} : { minutesPlayed: Math.max(...minutes) }),
    cards: {
      yellow: canonical.cards.yellow + extra.cards.yellow,
      red: canonical.cards.red + extra.cards.red,
    },
    goalkeeper: canonical.goalkeeper,
  };
}

/**
 * 같은 사람(같은 사이드의 같은 `userId`)의 결과 행을 하나로 접는다. 먼저 나온 행이
 * 정본이므로 호출자는 **로스터 행을 먼저 싣고** 승계 행을 뒤에 실어야 한다.
 * 모듈 docblock "한 경기·한 사람 = 결과 행 하나" 참고.
 */
function foldDuplicateIdentities(
  rows: AssembledResultParticipant[],
  userIdByParticipantId: ParticipantUserIdMap,
): AssembledResultParticipant[] {
  const canonicalIndexByIdentity = new Map<string, number>();
  const folded: AssembledResultParticipant[] = [];
  for (const row of rows) {
    const key = identityKey(row, userIdByParticipantId);
    if (key === null) {
      folded.push(row);
      continue;
    }
    const at = canonicalIndexByIdentity.get(key);
    if (at === undefined) {
      canonicalIndexByIdentity.set(key, folded.length);
      folded.push(row);
      continue;
    }
    folded[at] = mergeSamePerson(folded[at]!, row);
  }
  return folded;
}

function isGoalkeeperPosition(position: string | null, goalkeeperPositionCode: string): boolean {
  if (position === null) return false;
  return position === TEAM_MATCH_GOALKEEPER_POSITION || position === goalkeeperPositionCode;
}

function parseStoredCards(cards: unknown): { yellow: number; red: number } {
  if (typeof cards !== 'object' || cards === null) return { yellow: 0, red: 0 };
  return {
    yellow: Number((cards as { yellow?: unknown }).yellow) || 0,
    red: Number((cards as { red?: unknown }).red) || 0,
  };
}

/**
 * 사이드별 득점 합이 그 팀 스코어를 넘는지 검사한다. **미만은 정상**이다 — 자책골이나
 * 득점자 미기재가 있는 경기는 "기록된 득점 합 < 스코어"가 실제 상태다.
 */
function assertGoalSumWithinScore(
  goalSum: Record<'HOME' | 'AWAY', number>,
  scoreBySideKey: Record<'HOME' | 'AWAY', number>,
  code: string,
  message: (label: string, sum: number, score: number) => string,
): { code: string; message: string } | null {
  for (const sideKey of SIDE_KEYS) {
    const label = sideKey === 'HOME' ? '홈' : '원정';
    if (goalSum[sideKey] > scoreBySideKey[sideKey]) {
      return { code, message: message(label, goalSum[sideKey], scoreBySideKey[sideKey]) };
    }
  }
  return null;
}

/**
 * 운영자가 보낸 `participants` 를 저장 모양으로 조립한다.
 *
 * **`participants: []`(명시적 빈 배열) = "득점·도움 기록을 전부 비운다"**, "출전 기록까지
 * 지운다"가 아니다. 이 배열의 의미는 DTO 가 정의하는 그대로 "누가 득점·도움을 기록했는가"
 * 뿐이고, 출전 여부는 운영자가 아니라 팀이 작성한 라인업이 정한다. 그래서 빈 배열은
 * ① 승계될 뻔한 옛 기록을 포함해 모든 득점·도움을 0으로 만들고 ② 팀이 라인업을 작성한
 * 사이드의 출전 기록은 그대로 남긴다. 0-0 경기는 정상적인 결과이므로, 빈 배열을 "이 경기는
 * 아무도 뛰지 않았다"로 읽으면 정상 입력 한 번에 그 경기의 출전 기록이 통째로 사라진다.
 * 잘못 붙은 출전 기록을 지우는 수단은 결과 입력이 아니라 **라인업 수정**이다 — 결과 화면이
 * 라인업을 반박할 수 있게 두지 않는 것이 이 모듈 전체의 규칙이다.
 */
export function assembleLeagueResultParticipants(input: {
  participants: LeagueResultParticipantStatInput[];
  gameParticipants: LeagueGameParticipantRow[];
  sides: LeagueGameSideRow[];
  /** 사이드별 최신 라인업. 출전 기록(전원 저장)과 started/goalkeeper 판정의 유일한 근거다. */
  rosters: LeagueSideRoster[];
  /** 이 경기 종목의 골키퍼 포지션 코드(competition config 사전에서 도출, 폴백 'GK'). */
  goalkeeperPositionCode: string;
  /** 결과 행 → 실제 사용자. 같은 사람의 행이 둘 이상 실리지 않게 접는 데 쓴다. */
  userIdByParticipantId: ParticipantUserIdMap;
  /** 이 게임에 `V1GameEvent` 행이 하나라도 있는가. true 면 출전 기록 확장을 끈다(모듈 docblock). */
  hasGameEvents: boolean;
  homeScore: number;
  awayScore: number;
}): AssembleResult {
  const {
    participants,
    gameParticipants,
    sides,
    rosters,
    goalkeeperPositionCode,
    userIdByParticipantId,
    hasGameEvents,
    homeScore,
    awayScore,
  } = input;

  const seen = new Set<string>();
  for (const stat of participants) {
    if (seen.has(stat.participantId)) {
      return {
        ok: false,
        code: 'LEAGUE_RESULT_PARTICIPANT_DUPLICATED',
        message: '같은 선수가 두 번 이상 실려 있어요. 선수별로 한 줄씩만 보내 주세요.',
      };
    }
    seen.add(stat.participantId);
  }

  const rowById = new Map(gameParticipants.map((row) => [row.id, row]));
  const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey]));
  const scoreBySideKey: Record<'HOME' | 'AWAY', number> = { HOME: homeScore, AWAY: awayScore };
  const goalSum: Record<'HOME' | 'AWAY', number> = { HOME: 0, AWAY: 0 };
  const assistSum: Record<'HOME' | 'AWAY', number> = { HOME: 0, AWAY: 0 };

  // 입력 검증과 사이드 도출을 먼저 끝내고, 조립은 그 다음 단계에서 한다 — 조립 순서가
  // 이제 입력 순서가 아니라 라인업 순서를 따르기 때문이다(아래 조립 루프 참고).
  const statById = new Map<string, { sideId: string; goals: number; assists: number }>();
  for (const stat of participants) {
    const row = rowById.get(stat.participantId);
    const sideKey = row === undefined ? undefined : sideKeyById.get(row.sideId);
    if (row === undefined || sideKey === undefined) {
      return {
        ok: false,
        code: 'LEAGUE_RESULT_PARTICIPANT_NOT_IN_GAME',
        message: '이 대진의 선수가 아닌 항목이 있어요. 선수 목록을 다시 불러와 주세요.',
      };
    }
    const assists = stat.assists ?? 0;
    goalSum[sideKey] += stat.goals;
    assistSum[sideKey] += assists;
    statById.set(stat.participantId, { sideId: row.sideId, goals: stat.goals, assists });
  }

  const goalConflict = assertGoalSumWithinScore(
    goalSum,
    scoreBySideKey,
    'LEAGUE_RESULT_GOALS_EXCEED_SCORE',
    (label, sum, score) => `${label} 팀 선수 득점 합(${sum})이 팀 스코어(${score})보다 많아요.`,
  );
  if (goalConflict !== null) return { ok: false, ...goalConflict };

  for (const sideKey of SIDE_KEYS) {
    const label = sideKey === 'HOME' ? '홈' : '원정';
    // 도움은 골 하나에 최대 하나 — 팀 스코어가 아니라 **기록된 득점 합**을 기준으로
    // 막는다(Copilot 리뷰 반영). 스코어 기준으로 두면 자책골·미기록 득점이 있는 경기에서
    // "기록된 골 0개인데 도움 2개" 같은 물리적으로 불가능한 기록이 저장될 수 있다.
    if (assistSum[sideKey] > goalSum[sideKey]) {
      return {
        ok: false,
        code: 'LEAGUE_RESULT_ASSISTS_EXCEED_GOALS',
        message: `${label} 팀 도움 합(${assistSum[sideKey]})이 기록된 득점 합(${goalSum[sideKey]})보다 많아요.`,
      };
    }
  }

  const rosterBySideId = new Map(rosters.map((roster) => [roster.sideId, roster]));
  const assembled: AssembledResultParticipant[] = [];
  const emitted = new Set<string>();

  // ① 팀이 실제로 작성한 라인업이 있는 사이드: 로스터 **전원**을 기록한다(무득점 포함).
  //    라인업이 출전의 유일한 증거이므로 goalkeeper 도 여기서만 채운다.
  for (const sideKey of SIDE_KEYS) {
    const side = sides.find((row) => row.sideKey === sideKey);
    if (side === undefined) continue;
    const roster = rosterBySideId.get(side.id);
    // 이벤트가 있는 경기에서는 확장을 끈다 — 모듈 docblock `hasGameEvents` 참고.
    if (hasGameEvents || roster === undefined || !roster.teamAuthored) continue;
    for (const row of roster.participants) {
      if (emitted.has(row.id)) continue;
      const stat = statById.get(row.id);
      const assists = stat?.assists ?? 0;
      assembled.push({
        participantId: row.id,
        sideId: roster.sideId,
        started: true,
        goals: stat?.goals ?? 0,
        ...(assists === 0 ? {} : { assists }),
        cards: { yellow: 0, red: 0 },
        goalkeeper: isGoalkeeperPosition(row.position, goalkeeperPositionCode),
      });
      emitted.add(row.id);
    }
  }

  // ② 로스터가 덮지 못한 기록: 자동 로스터뿐인 사이드의 득점자, 그리고 최신 라인업에서는
  //    빠졌지만 현재 공식 기록이 있어 승계된 선수(league-match-result-entry.service.ts
  //    listFixtureParticipants 참고). 라인업 증거가 없으므로 예전 규칙 그대로 **기록이 있는
  //    행만** 싣는다 — 뛰지 않은 사람의 출전 기록을 만들지 않기 위해서다. `started` 는
  //    true 다(정본 §3: 행의 존재 자체가 "뛰었다" 이므로 출전자는 전부 true). `goalkeeper`
  //    는 포지션 증거가 없으므로 false 로 남는다 — 그건 여전히 모르는 값이다.
  for (const stat of participants) {
    if (emitted.has(stat.participantId)) continue;
    const resolved = statById.get(stat.participantId);
    // 위 검증 루프가 미해결 항목을 이미 거부했으므로 도달하지 않는다(타입 좁히기용).
    if (resolved === undefined) continue;
    if (resolved.goals === 0 && resolved.assists === 0) continue;
    assembled.push({
      participantId: stat.participantId,
      sideId: resolved.sideId,
      started: true,
      goals: resolved.goals,
      ...(resolved.assists === 0 ? {} : { assists: resolved.assists }),
      cards: { yellow: 0, red: 0 },
      goalkeeper: false,
    });
    emitted.add(stat.participantId);
  }

  return { ok: true, actualParticipants: foldDuplicateIdentities(assembled, userIdByParticipantId) };
}

/**
 * 정정에서 participants 를 **보내지 않았을 때**, 직전 공식 리비전의 개인 기록을 새
 * 리비전으로 그대로 승계한다 — 스코어·사유만 고치는 정정이 득점·도움 기록을
 * 소실시키면 안 된다(BRACKET-6 outcome_note 승계와 같은 원칙, Copilot 리뷰 반영).
 * 명시적 빈 배열(`participants: []`)은 이 함수를 타지 않는다 — 그쪽은 "득점·도움을 전부
 * 비운다"는 뜻이라 `assembleLeagueResultParticipants` 가 처리한다(그 함수 docblock 참고).
 *
 * 스코어를 낮추는 정정으로 승계 기록의 사이드별 득점 합이 새 스코어를 넘게 되면,
 * 조용히 불일치 기록을 저장하는 대신 거부한다 — 운영자가 기록을 함께 다시 입력해야 한다.
 *
 * `assembleLeagueResultParticipants` 와 **같은 출전 규칙**을 적용한다: 팀이 작성한
 * 라인업이 있는 사이드는 로스터 전원이 남고, started/goalkeeper 는 라인업에서 다시
 * 읽는다. 승계 계약을 깨는 것이 아니다 — 승계 대상은 운영자가 입력한 득점·도움·카드이고,
 * started/goalkeeper 는 운영자가 입력할 수 없는(DTO 에 칸조차 없는) 라인업 파생값이라
 * 옛 리비전의 하드코딩된 false 를 그대로 물려받으면 버그를 승계하는 셈이 된다.
 */
export function carryForwardResultParticipants(input: {
  rows: StoredResultParticipantRow[];
  sides: LeagueGameSideRow[];
  rosters: LeagueSideRoster[];
  goalkeeperPositionCode: string;
  /** 결과 행 → 실제 사용자. 옛 리비전 행에 달린 승계 기록을 최신 행으로 접는 데 쓴다. */
  userIdByParticipantId: ParticipantUserIdMap;
  /** 이 게임에 `V1GameEvent` 행이 하나라도 있는가. true 면 출전 기록 확장을 끈다(모듈 docblock). */
  hasGameEvents: boolean;
  homeScore: number;
  awayScore: number;
}): AssembleResult {
  const {
    rows,
    sides,
    rosters,
    goalkeeperPositionCode,
    userIdByParticipantId,
    hasGameEvents,
    homeScore,
    awayScore,
  } = input;
  const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey]));
  const rosterBySideId = new Map(rosters.map((roster) => [roster.sideId, roster]));
  const storedById = new Map(rows.map((row) => [row.participantId, row]));
  const scoreBySideKey: Record<'HOME' | 'AWAY', number> = { HOME: homeScore, AWAY: awayScore };
  const goalSum: Record<'HOME' | 'AWAY', number> = { HOME: 0, AWAY: 0 };

  const carried: AssembledResultParticipant[] = [];
  const emitted = new Set<string>();

  const push = (participant: AssembledResultParticipant, sideKey: 'HOME' | 'AWAY') => {
    goalSum[sideKey] += participant.goals;
    carried.push(participant);
    emitted.add(participant.participantId);
  };

  // ① 팀이 작성한 라인업이 있는 사이드: 로스터 전원 + (있으면) 저장된 기록을 얹는다.
  for (const sideKey of SIDE_KEYS) {
    const side = sides.find((row) => row.sideKey === sideKey);
    if (side === undefined) continue;
    const roster = rosterBySideId.get(side.id);
    // 이벤트가 있는 경기에서는 확장을 끈다 — 모듈 docblock `hasGameEvents` 참고.
    if (hasGameEvents || roster === undefined || !roster.teamAuthored) continue;
    for (const row of roster.participants) {
      if (emitted.has(row.id)) continue;
      const stored = storedById.get(row.id);
      push(
        {
          participantId: row.id,
          sideId: roster.sideId,
          started: true,
          goals: stored?.goals ?? 0,
          ...(stored === undefined || stored.assists === 0 ? {} : { assists: stored.assists }),
          ...(stored === undefined || stored.fouls === 0 ? {} : { fouls: stored.fouls }),
          ...(stored?.minutesPlayed == null ? {} : { minutesPlayed: stored.minutesPlayed }),
          cards: stored === undefined ? { yellow: 0, red: 0 } : parseStoredCards(stored.cards),
          goalkeeper: isGoalkeeperPosition(row.position, goalkeeperPositionCode),
        },
        sideKey,
      );
    }
  }

  // ② 로스터가 덮지 못한 저장 기록은 그대로 승계한다 — 자동 로스터뿐인 사이드의 득점자와,
  //    최신 라인업에서 빠졌지만 공식 기록이 있는 선수(그 기록을 지우면 안 된다).
  for (const row of rows) {
    if (emitted.has(row.participantId)) continue;
    const sideKey = sideKeyById.get(row.sideId);
    // 승계 원본이 이 게임의 사이드가 아닐 수는 없지만(같은 게임의 리비전), 방어적으로 건너뛴다.
    if (sideKey === undefined) continue;
    push(
      {
        participantId: row.participantId,
        sideId: row.sideId,
        // ⚠️ 승계는 **원본 그대로**다. 새로 짓는 행(위 ①)은 정본 §3 대로 true 지만,
        // 이미 저장된 공식 기록의 값을 다시 쓰지는 않는다.
        started: row.started,
        goals: row.goals,
        ...(row.assists === 0 ? {} : { assists: row.assists }),
        ...(row.fouls === 0 ? {} : { fouls: row.fouls }),
        ...(row.minutesPlayed === null ? {} : { minutesPlayed: row.minutesPlayed }),
        cards: parseStoredCards(row.cards),
        goalkeeper: row.goalkeeper,
      },
      sideKey,
    );
  }

  const conflict = assertGoalSumWithinScore(
    goalSum,
    scoreBySideKey,
    'LEAGUE_RESULT_CARRIED_PARTICIPANTS_CONFLICT',
    (label, sum, score) =>
      `${label} 팀의 기존 선수 득점 합(${sum})이 정정 스코어(${score})보다 많아요. 득점·도움 기록을 함께 다시 입력해 주세요.`,
  );
  if (conflict !== null) return { ok: false, ...conflict };

  // 접기는 사이드 안에서만 일어나므로 위 사이드별 득점 합 검증 결과를 바꾸지 않는다.
  return { ok: true, actualParticipants: foldDuplicateIdentities(carried, userIdByParticipantId) };
}
