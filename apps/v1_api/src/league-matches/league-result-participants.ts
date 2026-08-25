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
  cards: { yellow: number; red: number };
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
    // 도움은 골 하나에 최대 하나 — 사이드 스코어를 넘을 수 없다.
    if (assistSum[sideKey] > scoreBySideKey[sideKey]) {
      return {
        ok: false,
        code: 'LEAGUE_RESULT_ASSISTS_EXCEED_SCORE',
        message: `${label} 팀 도움 합(${assistSum[sideKey]})이 팀 스코어(${scoreBySideKey[sideKey]})보다 많아요.`,
      };
    }
  }

  return { ok: true, actualParticipants: assembled };
}
