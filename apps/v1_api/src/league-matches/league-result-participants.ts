/**
 * 운영자 결과 입력·정정에 실린 선수별 득점·도움을 `actualParticipants`로 조립하는
 * 순수 규칙 모듈. 네트워크·Prisma 없이 단독 테스트 가능하도록 서비스에서 분리했다
 * (league-standings.ts / league-result-dispute-eligibility.ts 와 같은 관례).
 *
 * 사이드는 클라이언트 입력이 아니라 participant 행에서 도출한다 — 홈/원정이 뒤바뀐
 * 채 저장되면 개인 기록이 상대 팀 선수에게 붙는 사고가 되는데, 그 검증을 화면에
 * 맡기지 않는다.
 */

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

export function assembleLeagueResultParticipants(input: {
  participants: LeagueResultParticipantStatInput[];
  gameParticipants: LeagueGameParticipantRow[];
  sides: LeagueGameSideRow[];
  homeScore: number;
  awayScore: number;
}): AssembleResult {
  const { participants, gameParticipants, sides, homeScore, awayScore } = input;

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

  const assembled: AssembledResultParticipant[] = [];
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
    // 득점도 도움도 0이면 기록할 것이 없다 — 조용히 제외한다(전송 편의를 위해
    // 화면이 로스터 전체를 보내도 서버 저장은 실제 기록이 있는 선수로만 좁힌다).
    if (stat.goals === 0 && assists === 0) continue;
    goalSum[sideKey] += stat.goals;
    assistSum[sideKey] += assists;
    assembled.push({
      participantId: stat.participantId,
      sideId: row.sideId,
      started: false,
      goals: stat.goals,
      ...(assists === 0 ? {} : { assists }),
      cards: { yellow: 0, red: 0 },
      goalkeeper: false,
    });
  }

  for (const sideKey of ['HOME', 'AWAY'] as const) {
    const label = sideKey === 'HOME' ? '홈' : '원정';
    if (goalSum[sideKey] > scoreBySideKey[sideKey]) {
      return {
        ok: false,
        code: 'LEAGUE_RESULT_GOALS_EXCEED_SCORE',
        message: `${label} 팀 선수 득점 합(${goalSum[sideKey]})이 팀 스코어(${scoreBySideKey[sideKey]})보다 많아요.`,
      };
    }
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

  return { ok: true, actualParticipants: assembled };
}

/**
 * 정정에서 participants 를 **보내지 않았을 때**, 직전 공식 리비전의 개인 기록을 새
 * 리비전으로 그대로 승계한다 — 스코어·사유만 고치는 정정이 득점·도움 기록을
 * 소실시키면 안 된다(BRACKET-6 outcome_note 승계와 같은 원칙, Copilot 리뷰 반영).
 * 명시적 빈 배열(`participants: []`)은 승계가 아니라 "기록 삭제"로, 이 함수를 타지 않는다.
 *
 * 스코어를 낮추는 정정으로 승계 기록의 사이드별 득점 합이 새 스코어를 넘게 되면,
 * 조용히 불일치 기록을 저장하는 대신 거부한다 — 운영자가 기록을 함께 다시 입력해야 한다.
 */
export function carryForwardResultParticipants(input: {
  rows: StoredResultParticipantRow[];
  sides: LeagueGameSideRow[];
  homeScore: number;
  awayScore: number;
}): AssembleResult {
  const { rows, sides, homeScore, awayScore } = input;
  const sideKeyById = new Map(sides.map((side) => [side.id, side.sideKey]));
  const scoreBySideKey: Record<'HOME' | 'AWAY', number> = { HOME: homeScore, AWAY: awayScore };
  const goalSum: Record<'HOME' | 'AWAY', number> = { HOME: 0, AWAY: 0 };

  const carried: AssembledResultParticipant[] = [];
  for (const row of rows) {
    const sideKey = sideKeyById.get(row.sideId);
    // 승계 원본이 이 게임의 사이드가 아닐 수는 없지만(같은 게임의 리비전), 방어적으로 건너뛴다.
    if (sideKey === undefined) continue;
    goalSum[sideKey] += row.goals;
    const cards =
      typeof row.cards === 'object' && row.cards !== null
        ? {
            yellow: Number((row.cards as { yellow?: unknown }).yellow) || 0,
            red: Number((row.cards as { red?: unknown }).red) || 0,
          }
        : { yellow: 0, red: 0 };
    carried.push({
      participantId: row.participantId,
      sideId: row.sideId,
      started: row.started,
      goals: row.goals,
      ...(row.assists === 0 ? {} : { assists: row.assists }),
      ...(row.fouls === 0 ? {} : { fouls: row.fouls }),
      ...(row.minutesPlayed === null ? {} : { minutesPlayed: row.minutesPlayed }),
      cards,
      goalkeeper: row.goalkeeper,
    });
  }

  for (const sideKey of ['HOME', 'AWAY'] as const) {
    const label = sideKey === 'HOME' ? '홈' : '원정';
    if (goalSum[sideKey] > scoreBySideKey[sideKey]) {
      return {
        ok: false,
        code: 'LEAGUE_RESULT_CARRIED_PARTICIPANTS_CONFLICT',
        message: `${label} 팀의 기존 선수 득점 합(${goalSum[sideKey]})이 정정 스코어(${scoreBySideKey[sideKey]})보다 많아요. 득점·도움 기록을 함께 다시 입력해 주세요.`,
      };
    }
  }

  return { ok: true, actualParticipants: carried };
}
