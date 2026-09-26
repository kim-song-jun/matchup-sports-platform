/**
 * 운영자가 입력한 리그 결과를 **공개 경기 기록 타임라인이 읽는 모양**
 * (`V1GameResultRevision.goalEvents`)으로 펼치는 순수 모듈.
 *
 * ## 왜 필요한가
 * 공개 경기 기록의 "경기 기록" 섹션은 두 갈래로 채워진다
 * (games/public-records/public-tournament-records.service.ts `buildEvents`):
 * ① 라이브 콘솔이 남긴 `V1GameEvent` 행, ② 공식 리비전의 `goalEvents` JSON 스냅샷.
 * 대회는 ①로 채워지지만 리그는 라이브 콘솔을 쓰지 않아 이벤트 행이 0건이고, 운영자
 * 결과 입력 경로가 ②도 남기지 않아 득점자를 입력해도 화면이 "기록된 이벤트가 없어요"로
 * 남았다(알파 실측).
 *
 * ## 계약
 * 스냅샷은 `tournament-fixture-official-result.ts` 의
 * `parseTournamentFixtureRevisionGoals` 가 파싱한다 — `id`/`sideId` 는 문자열 필수,
 * `ownGoal` 은 boolean 필수, `participantId`/`minute`/`period` 는 null 허용이다.
 *
 * **분(minute)·전후반(period)은 null 로 남긴다.** 운영자 입력 화면에는 득점 시각 칸이
 * 없어서 그 값이 존재하지 않는다. 0 으로 채우면 공개 화면이 "0'" 와 "전반"이라는 없던
 * 사실을 만든다(같은 파일의 `isPeriodUnknown`/`isMinuteUnknown` 이 백필 골에서 이미 그
 * 함정을 다루고 있다). 소비처는 null 을 "표시 없음"으로 렌더하고
 * (`clockMs: event.minute === null ? null : ...`) 정렬에서도 뒤로 보낸다(`byUnknownLast`).
 *
 * **자책골은 표현하지 않는다.** 운영자 입력 DTO 에는 선수별 득점·도움만 있고 자책골
 * 칸이 없다 — 그래서 "기록된 득점 합 < 스코어" 인 경기가 정상적으로 존재한다. 스냅샷은
 * 입력된 득점자만 담고, 스코어와 어긋나도 그것을 이유로 저장을 막지 않는다(스코어의
 * 권위는 리비전의 `score` 이지 이 스냅샷이 아니다).
 */

/** 스냅샷 한 줄. `parseTournamentFixtureRevisionGoals` 가 받는 모양 그대로다. */
export interface LeagueGoalEventSnapshotRow {
  id: string;
  sideId: string;
  participantId: string;
  minute: null;
  period: null;
  ownGoal: false;
}

/** 스냅샷을 만들 때 필요한 최소 정보(V1GameResultParticipant 부분집합). */
export interface LeagueGoalEventSourceRow {
  participantId: string;
  sideId: string;
  goals: number;
}

/**
 * 저장된 선수별 득점을 골 1개당 한 줄로 펼친다. 득점이 하나도 없으면 빈 배열이다 —
 * 호출자는 그때 스냅샷을 **쓰지 않는다**(`buildEvents` 는 `goalEvents` 가 배열이기만 하면
 * 이벤트 레인을 통째로 대체하므로, 빈 배열을 저장하면 다른 경로로 들어온 골 이벤트까지
 * 가려 버린다).
 *
 * `id` 는 `<participantId>:<n>` 으로 결정적이다 — 같은 입력을 재시도해도 같은 스냅샷이
 * 나와 멱등 재시도가 화면을 흔들지 않고, 소비처가 목록 key 로 쓰기에도 유일하다.
 */
export function buildLeagueGoalEventSnapshot(
  rows: readonly LeagueGoalEventSourceRow[],
): LeagueGoalEventSnapshotRow[] {
  const snapshot: LeagueGoalEventSnapshotRow[] = [];
  for (const row of rows) {
    // 음수·소수가 들어오면 루프가 돌지 않는다(DTO 가 이미 0~99 정수로 막지만, 이 모듈은
    // 저장된 행도 받으므로 방어한다).
    for (let index = 1; index <= row.goals; index += 1) {
      snapshot.push({
        id: `${row.participantId}:${index}`,
        sideId: row.sideId,
        participantId: row.participantId,
        minute: null,
        period: null,
        ownGoal: false,
      });
    }
  }
  return snapshot;
}
