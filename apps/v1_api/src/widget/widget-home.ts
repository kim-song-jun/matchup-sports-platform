import type { Prisma } from '@prisma/client';
import { parseOfficialScore } from '../game-operations/parse-official-score';

/** 진행 중인 경기는 시작한 지 이만큼까지만 보여준다 — 운영자가 종료를 깜빡한 경기가 위젯에 계속 남지 않게(대부분 30분 안에 끝난다). */
export const WIDGET_LIVE_MAX_AGE_MS = 12 * 60 * 60 * 1_000;
/** 끝난 경기는 이 시간 동안만 「방금 끝남」으로 최종 점수(승부차기 포함)를 보여준다. 승부차기는 종료할 때 한꺼번에 기록돼 진행 중에는 서버가 모른다. */
export const WIDGET_JUST_ENDED_MS = 15 * 60 * 1_000;
export const WIDGET_PENDING_LIMIT = 3;
export const WIDGET_SCHEDULE_LIMIT = 4;

export type WidgetPerspectiveScore = { mine: number; opponent: number };

/** 공식 결과(점수 JSON)를 우리 팀 기준으로 읽는다. 승부차기는 있을 때만. 읽을 수 없는 값이면 null. */
export function readEndedResult(
  revisionScore: Prisma.JsonValue | null | undefined,
  mineSideKey: 'HOME' | 'AWAY',
): { score: WidgetPerspectiveScore; penalties: WidgetPerspectiveScore | null } | null {
  if (revisionScore === null || revisionScore === undefined) return null;
  let parsed;
  try {
    parsed = parseOfficialScore(revisionScore);
  } catch {
    return null;
  }
  const pick = (value: { home: number; away: number }): WidgetPerspectiveScore =>
    mineSideKey === 'HOME' ? { mine: value.home, opponent: value.away } : { mine: value.away, opponent: value.home };
  return { score: pick(parsed), penalties: parsed.penalties === undefined ? null : pick(parsed.penalties) };
}

/**
 * 친선 팀 매치의 진행 중 점수. 친선 팀 매치는 득점을 `V1GameEvent` 가 아니라 공유 기록(`V1TeamMatchRecord.goals`, JSON)에 두므로
 * 이벤트만 세면 항상 0 : 0 이 나온다. 공개 경기 화면(`TeamMatchRecordService.view`)과 같게 골의 `sideId` 로 센다.
 */
export function tallySharedRecordGoals(
  goals: Prisma.JsonValue | null | undefined,
  sideKeyById: ReadonlyMap<string, 'HOME' | 'AWAY'>,
): { home: number; away: number } {
  let home = 0;
  let away = 0;
  if (!Array.isArray(goals)) return { home, away };
  for (const goal of goals) {
    if (typeof goal !== 'object' || goal === null || Array.isArray(goal)) continue;
    const sideId = (goal as { sideId?: unknown }).sideId;
    if (typeof sideId !== 'string') continue;
    const key = sideKeyById.get(sideId);
    if (key === 'HOME') home += 1;
    else if (key === 'AWAY') away += 1;
  }
  return { home, away };
}
