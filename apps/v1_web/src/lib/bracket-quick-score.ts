import type {
  V1GameResultParticipantInput,
  V1GameResultParticipantRow,
  V1GameResultScore,
  V1GameResultScoreInput,
  V1QuickResultScore,
} from '@/types/api';

export type QuickScoreInputs = { home: string; away: string; penaltyHome: string; penaltyAway: string };
export type QuickScoreParseResult = { ok: true; score: V1QuickResultScore } | { ok: false; error: string };

const SCORE_PATTERN = /^\d{1,3}$/;

function toScore(value: string): number | null {
  return SCORE_PATTERN.test(value.trim()) ? Number(value.trim()) : null;
}

export function needsPenalties(inputs: QuickScoreInputs, isKnockout: boolean): boolean {
  const home = toScore(inputs.home);
  const away = toScore(inputs.away);
  return isKnockout && home !== null && away !== null && home === away;
}

export function parseQuickScore(inputs: QuickScoreInputs, isKnockout: boolean): QuickScoreParseResult {
  const home = toScore(inputs.home);
  const away = toScore(inputs.away);
  if (home === null) return { ok: false, error: '홈 점수를 0 이상의 정수로 입력해 주세요.' };
  if (away === null) return { ok: false, error: '어웨이 점수를 0 이상의 정수로 입력해 주세요.' };
  if (!needsPenalties(inputs, isKnockout)) return { ok: true, score: { home, away } };

  const penaltyHome = toScore(inputs.penaltyHome);
  const penaltyAway = toScore(inputs.penaltyAway);
  if (penaltyHome === null || penaltyAway === null) {
    return { ok: false, error: '결선 경기가 무승부면 승부차기 점수를 입력해 주세요.' };
  }
  if (penaltyHome === penaltyAway) return { ok: false, error: '승부차기는 승자가 갈리도록 입력해 주세요.' };
  return { ok: true, score: { home, away, penalties: { home: penaltyHome, away: penaltyAway } } };
}

/**
 * 정정 본문의 점수. 서버 `GameScoreDto` 가 받는 키(home/away/penalties)만 쓰되, 선축(firstKickSideKey)은
 * 폼에 입력란이 없어 한 번 떨어뜨리면 되살릴 수 없으므로 기존 값을 이어 받는다.
 */
export function mergeCorrectionScore(base: V1GameResultScore, next: V1QuickResultScore): V1GameResultScoreInput {
  if (next.penalties === undefined) return { home: next.home, away: next.away };
  const firstKick = 'penalties' in base ? base.penalties?.firstKickSideKey : undefined;
  return {
    home: next.home,
    away: next.away,
    penalties: { ...next.penalties, ...(firstKick === undefined ? {} : { firstKickSideKey: firstKick }) },
  };
}

/** 기존 리비전의 참가자 행 → 정정 DTO. 표시용 필드와 null 출전 시간은 보내지 않는다(`forbidNonWhitelisted`). */
export function toCorrectionParticipants(rows: V1GameResultParticipantRow[]): V1GameResultParticipantInput[] {
  return rows.map((row) => ({
    participantId: row.participantId,
    sideId: row.sideId,
    started: row.started,
    ...(row.minutesPlayed === null ? {} : { minutesPlayed: row.minutesPlayed }),
    goals: row.goals,
    assists: row.assists,
    fouls: row.fouls,
    cards: row.cards,
    goalkeeper: row.goalkeeper,
  }));
}
