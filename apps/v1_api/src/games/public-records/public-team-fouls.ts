import type { Prisma, V1GameEventType } from '@prisma/client';
import type { GamePeriodClockRow } from './public-clock';

/**
 * 관전자 화면에 "지금 몇 번째 팀 파울인가"를 보여 주는 값 — **진행 중인 경기에서만** 내려간다.
 *
 * 팀 파울은 기록으로 남기지 않는 값이다. 선수별 파울은 공개 API 어디에도 없고(결과·전적은 골·카드만),
 * 이 값도 경기가 끝나면 응답에서 사라진다 — 호출부가 `clock`·`periodBreak`와 같은 게이트
 * (`mode === 'live' && !showOfficialResult && status === 'live'`)로만 만든다.
 */
export interface PublicTeamFouls {
  /** 이 개수가 어느 피리어드의 것인지(팀 파울은 피리어드마다 0부터 다시 센다). 화면이 "전반 팀 파울"로 부른다. */
  readonly periodNumber: number;
  /** 이 개수에 이르면 "10m 프리킥" — 대회·리그별 기준(`teamFoulThreshold`)이고 비워 둔 곳은 기본값. 읽는 시점의 지금 값이다. */
  readonly threshold: number;
  readonly home: number;
  readonly away: number;
}

export interface TeamFoulEventRow {
  readonly id: string;
  readonly type: V1GameEventType;
  readonly sideId: string | null;
  readonly participantId: string | null;
  readonly period: number;
  readonly sequence: number;
  readonly reversesEventId: string | null;
  readonly payload: Prisma.JsonValue;
}

/** 이 이벤트가 어떤 카드인지. 카드가 아니거나 payload 에 없으면 null. */
function cardKindOf(payload: Prisma.JsonValue): 'RED' | 'YELLOW' | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const card = (payload as Prisma.JsonObject).card;
  if (card === 'RED') return 'RED';
  return 'YELLOW';
}

/**
 * 어느 피리어드의 팀 파울을 보여 줄지 — 진행 중(LIVE)이면 그 피리어드, 하프타임·정규 시간 종료처럼 진행 중인 피리어드가
 * 없으면 가장 최근에 **시작한** 피리어드다(하프타임에는 방금 끝난 전반의 개수). 아직 시작한 피리어드가 없으면 null.
 * 하프타임에는 다음 피리어드 행이 `HALFTIME` 상태로 이미 있지만 시작 전이라(`startedAt` 없음) 고르지 않는다.
 */
export function resolveTeamFoulPeriod(periods: readonly GamePeriodClockRow[]): number | null {
  const live = periods.find((period) => period.state === 'LIVE');
  if (live !== undefined) return live.number;
  const started = periods
    .filter((period) => period.startedAt !== null)
    .sort((left, right) => right.number - left.number);
  return started[0]?.number ?? null;
}

/**
 * 한 피리어드의 팀별 파울 개수. 운영 콘솔의 `deriveFoulCounts`(`apps/v1_web/src/lib/team-foul-counter.ts`)와 같은 규칙이다 —
 * 두 화면이 다른 숫자를 말하면 안 되는데 두 앱이 코드를 공유하지 못해(`pnpm-workspace.yaml` 이 `apps/*` 만 묶는다) 규칙을
 * 그대로 옮겼다.
 *
 * - FOUL 이벤트 1건 = 파울 1개. 되돌린(reverse) 이벤트는 세지 않는다.
 * - 카드(옐로·레드) 1장 = 파울 1개. 단, 한 선수가 옐로 2장을 받은 뒤 붙는 레드(경고 누적 퇴장)는 세지 않는다.
 *   경고 누적은 경기 전체의 카드를 순서(sequence)대로 보고 판정하므로 장수를 세는 일은 피리어드 필터보다 먼저 한다.
 */
export function tallyTeamFouls(
  events: readonly TeamFoulEventRow[],
  sideKeyById: ReadonlyMap<string, 'HOME' | 'AWAY'>,
  periodNumber: number,
): { home: number; away: number } {
  const reversedIds = new Set(
    events.map((event) => event.reversesEventId).filter((id): id is string => id !== null),
  );
  const yellowsByParticipant = new Map<string, number>();
  let home = 0;
  let away = 0;
  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    if (reversedIds.has(event.id)) continue;
    if (event.type === 'CARD') {
      if (event.participantId !== null) {
        const yellows = yellowsByParticipant.get(event.participantId) ?? 0;
        if (cardKindOf(event.payload) === 'RED') {
          // 옐로 2장 뒤의 레드 = 경고 누적 퇴장. 파울로 세지 않는다.
          if (yellows >= 2) continue;
        } else {
          yellowsByParticipant.set(event.participantId, yellows + 1);
        }
      }
    } else if (event.type !== 'FOUL') {
      continue;
    }
    if (event.period !== periodNumber || event.sideId === null) continue;
    // 아는 두 값만 센다 — 모르는 sideId 를 원정으로 몰지 않는다(`tallyLiveScore` 와 같은 이유).
    const sideKey = sideKeyById.get(event.sideId);
    if (sideKey === 'HOME') home += 1;
    else if (sideKey === 'AWAY') away += 1;
  }
  return { home, away };
}
