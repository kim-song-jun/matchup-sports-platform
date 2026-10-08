/**
 * 관전자 공개 화면(대회 일정 · 경기 상세 · 대진표)의 라이브 폴링 주기 단일 소스.
 *
 * 이 값을 두 훅이 공유해야 하는 이유는 취향이 아니라 계약이다:
 * `/tournaments/:id/bracket`은 `useV1Tournament(id, { livePolling: true })`와
 * `usePublicTournamentSchedule(id)`를 **같은 화면에서 동시에** 쓴다. 두 곳이 서로
 * 다른 숫자를 갖게 되면 한 페이지가 어긋난 두 주기로 이중 폴링하게 되고, 그 드리프트는
 * 화면상 아무 증상 없이 요청량만 늘린다. 예전에는 두 파일이 같은 숫자를 각자 정의하고
 * "동기화하라"는 주석으로만 묶어 뒀는데, 그건 규율에 의존하는 방식이라 한쪽만 수정되면
 * 그대로 깨진다(PR #433 리뷰 지적) -- 그래서 값 자체를 여기로 옮겼다.
 *
 * 왜 10초인가: 이 화면은 관전자가 진행 중인 경기를 실제로 따라가는 곳이다. 득점과
 * 피리어드 전환(전반 -> 하프타임 -> 후반)이 그 플레이가 아직 진행 중일 때 도착해야
 * 의미가 있다. 분 단위(60초)를 한 번 적용해 봤지만 화면이 "라이브"가 아니라 뒤늦은
 * 요약이 돼 기각했고, 반대로 원래 값이던 8초보다는 조금 완화했다.
 *
 * 부하 모델(정확히 서술): `react-query` 캐시는 브라우저마다 따로라 관전자 간 요청을
 * 합치지 못한다. 서버 부하는 대략 (폴링 중인 관전자 수) x (로드된 페이지 수 / 주기)로
 * **관전자 수에 비례해 늘어난다.** 일정은 예정/진행 경기가 있으면 시작·종료를 발견하도록
 * 폴링하고, 시간 미정 진행 경기도 포함한다. 경기 상세는 live 또는 시작 전 폴링 창에서 갱신한다.
 * 모든 경기가 종료되면 멈추며 뷰어당 10초 하한으로 지불한다. 관전자 수가 이 하한으로 감당이 안
 * 되는 규모가 되면 다음 수는 주기를 더 줄이는 것이 아니라 공유 캐시(CDN/edge 또는
 * 서버측)나 진짜 공개 브로드캐스트 채널이다.
 */
export const PUBLIC_LIVE_POLL_INTERVAL_MS = 10_000;

/** 시작 전 경기도 이 시간 안으로 다가오면 폴링한다 — 일찍 시작하는 경기도 놓치지 않게. */
export const PRESTART_POLL_WINDOW_MS = 15 * 60_000;
/** 예정 시각이 이만큼 지나도 시작하지 않은 경기는 폴링을 멈춘다(열어 둔 화면이 끝없이 묻지 않게). */
export const PRESTART_POLL_GRACE_MS = 3 * 60 * 60_000;
/** 폴링 창이 아직 멀면 이 간격 안에서 다시 확인한다 — false 를 돌려주면 react-query 가 다시 묻지 않는다. */
const PRESTART_IDLE_RECHECK_MS = 15 * 60_000;

/**
 * 경기 하나의 다음 폴링까지 기다릴 시간(ms). 진행 중이면 라이브 주기, 시작 전이면 시작 15분 전부터
 * 예정 시각 3시간 뒤까지 라이브 주기, 그 창이 아직 멀면 창이 열릴 때(최대 15분 간격) 다시 확인한다.
 * 끝났거나 시각이 없거나 너무 오래 시작하지 않은 경기는 false(멈춤).
 *
 * 예전엔 진행 중일 때만 폴링해서, 경기 시작 전에 열어 둔 상세 화면은 경기가 시작돼도 새로고침
 * 전까지 "예정"에 머물렀다.
 */
export function publicLivePollDelay(
  status: string | null | undefined,
  scheduledAt: string | null | undefined,
  now: number = Date.now(),
): number | false {
  if (status === 'live') return PUBLIC_LIVE_POLL_INTERVAL_MS;
  if (status !== 'scheduled' || !scheduledAt) return false;
  const start = Date.parse(scheduledAt);
  if (!Number.isFinite(start) || now > start + PRESTART_POLL_GRACE_MS) return false;
  const opensAt = start - PRESTART_POLL_WINDOW_MS;
  if (now >= opensAt) return PUBLIC_LIVE_POLL_INTERVAL_MS;
  return Math.max(PUBLIC_LIVE_POLL_INTERVAL_MS, Math.min(opensAt - now, PRESTART_IDLE_RECHECK_MS));
}

/** 여러 경기를 한 화면이 함께 볼 때(대진표) — 가장 먼저 필요한 폴링에 맞춘다. 모두 멈춤이면 false. */
export function earliestPublicLivePollDelay(
  games: ReadonlyArray<{ status: string | null | undefined; scheduledAt: string | null | undefined }>,
  now: number = Date.now(),
): number | false {
  let earliest: number | false = false;
  for (const game of games) {
    const delay = publicLivePollDelay(game.status, game.scheduledAt, now);
    if (delay !== false && (earliest === false || delay < earliest)) earliest = delay;
  }
  return earliest;
}
