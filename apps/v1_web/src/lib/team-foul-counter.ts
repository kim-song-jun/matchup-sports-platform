import type { GameEventRecord } from '@/types/game-operations';

/**
 * D-5 — 팀 누적 파울은 별도 카운터 컬럼 없이 (gameId, sideId, period) 활성
 * 이벤트 개수에서 파생한다. void/reverse된 이벤트는 제외한다 — reverseEvent가
 * 만드는 CORRECTION 행의 reversesEventId가 원본 이벤트의 id를 가리키므로, 그
 * id 집합을 먼저 모아 제외한다.
 *
 * 2026-11-18 사용자 결정으로 집계 대상이 넓어졌다(MD-QA #189 의 "집계 규칙 유지"를 바꾼다):
 * - FOUL 이벤트 1건 = 파울 1개.
 * - 카드(옐로·레드) 1장 = 파울 1개. 카드는 반칙에 대한 제재라 따로 파울을 또 기록하지 않아도 센다.
 * - 단, 한 선수가 옐로 2장을 받은 뒤 붙는 레드(경고 누적 퇴장)는 세지 않는다. 두 번째 옐로가 이미
 *   그 반칙으로 1개를 셌고 레드는 그 결과일 뿐이다. 취소된 옐로는 장수에 넣지 않는다.
 *
 * 경고 누적 여부는 경기 전체의 카드를 순서(sequence)대로 보고 판정한다. 그래서 옐로가 전반, 레드가
 * 후반이어도 후반 숫자에서 그 레드가 빠진다. 장수를 세는 일은 피리어드 필터보다 먼저 한다.
 */
export function deriveFoulCounts(events: readonly GameEventRecord[], period: number): Record<string, number> {
  const reversedIds = new Set(
    events.filter((event) => event.reversesEventId !== null).map((event) => event.reversesEventId as string),
  );
  const yellowCardsByParticipant = new Map<string, number>();
  const counts: Record<string, number> = {};
  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    if (reversedIds.has(event.id)) continue;
    if (event.type === 'CARD') {
      if (event.participantId !== null) {
        const yellows = yellowCardsByParticipant.get(event.participantId) ?? 0;
        if (event.payload.card === 'RED') {
          // 옐로 2장 뒤의 레드 = 경고 누적 퇴장. 파울로 세지 않는다.
          if (yellows >= 2) continue;
        } else {
          yellowCardsByParticipant.set(event.participantId, yellows + 1);
        }
      }
    } else if (event.type !== 'FOUL') {
      continue;
    }
    if (event.period !== period || event.sideId === null) continue;
    counts[event.sideId] = (counts[event.sideId] ?? 0) + 1;
  }
  return counts;
}

/**
 * 팀 파울 경고 기준(개) — 팀 누적 파울이 이 개수에 이르면 콘솔이 "다음부터 10m 프리킥"을 알린다.
 * 대회·리그마다 다를 수 있고(`teamFoulThreshold`), 값을 비워 둔 대회·리그와 친선 경기는 기본값을 쓴다.
 * 서버(`apps/v1_api/src/tournaments/team-foul-threshold.ts`)와 같은 값·같은 범위다.
 */
export const DEFAULT_TEAM_FOUL_THRESHOLD = 5;
export const MIN_TEAM_FOUL_THRESHOLD = 1;
export const MAX_TEAM_FOUL_THRESHOLD = 20;

/** 서버가 준 값(없거나 범위 밖이면 기본값)을 콘솔이 쓸 개수로 바꾼다. */
export function resolveTeamFoulThreshold(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return DEFAULT_TEAM_FOUL_THRESHOLD;
  if (value < MIN_TEAM_FOUL_THRESHOLD || value > MAX_TEAM_FOUL_THRESHOLD) return DEFAULT_TEAM_FOUL_THRESHOLD;
  return value;
}

/**
 * 어드민 입력칸 값을 서버로 보낼 값으로 바꾼다. 빈칸 = null(기본값으로 되돌리기).
 * 정수가 아니거나 범위 밖이면 `'invalid'` — 호출부가 오류 문구를 보여 준다.
 */
export function parseTeamFoulThresholdInput(raw: string): number | null | 'invalid' {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^\d+$/.test(text)) return 'invalid';
  const value = Number(text);
  return value >= MIN_TEAM_FOUL_THRESHOLD && value <= MAX_TEAM_FOUL_THRESHOLD ? value : 'invalid';
}

export const TEAM_FOUL_THRESHOLD_ERROR = `팀 파울 기준은 ${MIN_TEAM_FOUL_THRESHOLD}부터 ${MAX_TEAM_FOUL_THRESHOLD} 사이의 정수로 입력해 주세요. 비우면 기본 ${DEFAULT_TEAM_FOUL_THRESHOLD}개예요.`;
