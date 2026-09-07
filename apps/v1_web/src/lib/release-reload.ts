/**
 * 배포로 사라진 JS 청크를 잡은 탭을 되살리는 경로. `ReleaseVersionWatcher`(정상 화면에서
 * 배포를 미리 감지)와 `global-error`(이미 터진 뒤)가 **같은 리로드**를 쓰도록 여기 모은다.
 *
 * 청크 실패는 리렌더로 못 고친다 — 오래된 문서가 배포로 사라진 청크 URL 을 요청하는 것이라
 * 다시 그려도 같은 URL 을 또 404 낸다. 새 청크 이름은 새 문서를 받아야 알 수 있다.
 */

const RELOAD_DELAY_MS = 1500;
const CHUNK_RELOAD_MARK = 'teameet.chunk-reload';
/** 이 창 안에 이미 리로드했으면 다시 하지 않는다 — 청크가 아닌 원인으로 계속 터지면 무한 루프가 된다. */
const CHUNK_RELOAD_WINDOW_MS = 10_000;

/**
 * 청크 로드 실패인지. **좁게 판별한다** — 코드 버그로 매번 터지는 화면까지 자동 리로드하면
 * 지금보다 나쁘다. 문자열은 번들러마다 다르다: `Failed to load chunk`(turbopack, alpha 실측)·
 * `Loading chunk`(webpack)·나머지는 브라우저의 동적 import 실패 문구다.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown };
  if (candidate.name === 'ChunkLoadError') return true;
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  return (
    message.includes('Failed to load chunk') ||
    message.includes('Loading chunk') ||
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('Importing a module script failed')
  );
}

/**
 * 워처와 같은 리로드. SW 가 살아있으면 정적 자산 캐시를 먼저 지운다 — 안 지우면 새 문서를
 * 받아도 캐시에 남은 옛 청크를 다시 집는다. 컨트롤러가 없으면 조용히 스킵되고 리로드는 그대로.
 */
export function requestReleaseReload(): void {
  navigator.serviceWorker?.controller?.postMessage({ type: 'TEAMEET_RELEASE_CHANGED' });
  window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
}

/**
 * 자동 리로드를 해도 되는지 묻고, 된다면 표식을 남긴다. 표식이 최근이면 `false` —
 * 그때는 리로드하지 말고 에러 화면을 그대로 보여 사용자가 직접 고를 수 있게 한다.
 *
 * sessionStorage 는 프라이빗 모드·차단 설정에서 접근 자체가 던진다. 읽기 실패는
 * "표식 없음"으로, 쓰기 실패는 무시로 처리한다 — 저장이 안 되는 브라우저에서 자동 복구를
 * 통째로 포기하는 쪽이 더 나쁘다.
 */
export function claimChunkReloadAttempt(now: number = Date.now()): boolean {
  let previous: string | null = null;
  try {
    previous = window.sessionStorage.getItem(CHUNK_RELOAD_MARK);
  } catch {
    previous = null;
  }
  if (previous !== null) {
    const at = Number(previous);
    if (Number.isFinite(at) && now - at < CHUNK_RELOAD_WINDOW_MS) return false;
  }
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_MARK, String(now));
  } catch {
    // 저장이 안 되면 루프 방지가 약해지지만, 리로드 자체는 시도한다.
  }
  return true;
}

/** 화면이 정상으로 떴다는 뜻 — 다음 배포 때 자동 복구가 다시 한 번 열려야 한다. */
export function clearChunkReloadMark(): void {
  try {
    window.sessionStorage.removeItem(CHUNK_RELOAD_MARK);
  } catch {
    // 지울 수 없으면 창(10초)이 지나 자연히 만료된다.
  }
}
