/**
 * 앱 안 히스토리 추적기 — 헤더 뒤로가기가 진짜 뒤로(back)인지 교체(replace)인지 가르는 근거.
 *
 * 방식: History.prototype 의 pushState/replaceState 를 감싸 **호출 시점에** 모든 항목의 state 에
 * 순번(__tmIdx)을 끼워 넣고, 순번→URL 거울을 sessionStorage 에 둔다.
 * - Next 는 push·replace 마다 state 를 {__NA, 트리}로 새로 만든다. 커밋 뒤에 도장을 찍으면 둘을
 *   구분할 길이 없어서, 호출 시점에 끼운다. Next 가 읽는 키(__NA·트리)는 그대로 둔다.
 * - popstate 는 도착한 state 의 순번과 현재 순번을 비교한다. state 는 새로고침·bfcache 에도 남고
 *   거울은 탭 세션 동안 남는다.
 * - 설치는 Next Router 의 effect 보다 먼저여야 한다(Next 가 그때의 pushState 를 bind 해 둔다).
 *   소비 컴포넌트가 전부 Router 의 자손이라 effect 순서(자식 먼저)가 이를 보장한다.
 */

const IDX_KEY = '__tmIdx';
const PARENT_KEY = '__tmParent';
/** 오버레이가 URL 을 바꾸지 않고 쌓는 항목의 state 표식(값 = 오버레이 id). */
export const OVERLAY_STATE_KEY = '__tmOverlay';
const STORAGE_KEY = 'teameet.v1.navHistory';
const PARENT_DONE_KEY = 'teameet.v1.navHistory.parentInserted';
const KEEP_AROUND = 50;
// 앱이 부른 back 의 pop 이 이 안에 안 오면(앱 밖으로 나감·취소) 대기 표식을 버린다.
const APP_BACK_PENDING_MS = 1000;
// 모듈이 다시 평가돼도(HMR) 이전 설치를 걷어 낼 수 있게 window 에 남기는 설치 기록.
const INSTALL_MARKER = '__teameetNavHistoryInstall';
const URL_BASE = 'https://nav-history.invalid';

// buffer: a same-URL entry the unsaved-changes guard pushes so a cold-entry back stays in this document.
// stale: the form entry under a buffer that was reloaded — a dead same-URL copy that traversal skips.
type Entry = { url: string; overlay?: boolean; parent?: boolean; buffer?: boolean; stale?: boolean };
// tabStart: mirror index of the tab's very first history entry (nothing, not even another site, is before it).
// leaveTarget: where a leave traversal was headed. A leave out of the app never pops here, so a later forward
// back into this tab must compare against it, not the index the leave started from.
type Mirror = { index: number; entries: Record<number, Entry>; tabStart?: number; leaveTarget?: number };
export type AppPop = { direction: 'back' | 'forward' | 'unknown'; appInitiated: boolean };
type HistoryMethod = History['pushState'];

let mirror: Mirror | null = null;
let coldStart = false;
// Mirror index of this document's first entry — entries below it belong to earlier documents (cross-document pops).
let documentStartIndex = 0;
let pushingBuffer = false;
let originals: { push: HistoryMethod; replace: HistoryMethod } | null = null;
let pendingAppBack = false;
let pendingAppBackTimer: ReturnType<typeof setTimeout> | null = null;
/** 도장 없는 항목(예: `#앵커` 이동)에 있다 — 위치를 모르니 헤더 뒤로가기는 replace 로 간다. */
let untracked = false;
let suppressedPops = 0;
let pushCount = 0;
let softNavigate: ((url: string) => void) | null = null;
const popListeners = new Set<(pop: AppPop) => void>();
/** 추적기가 본 이 pop — 방향(도장 순번 비교)과 떠난 항목과 URL 이 같은지. */
export type PopInfo = { direction: AppPop['direction']; samePage: boolean; leftBuffer: boolean };
/** true 를 돌려주면 그 pop 을 여기서 끝낸다(Next·다른 리스너에 전달하지 않음). */
export type PopInterceptor = (event: PopStateEvent, pop: PopInfo) => boolean;
type InterceptorEntry = { intercept: PopInterceptor; priority: number };
// 한 pop 은 한 가로채기만 처리한다 — priority 가 높은 것부터 묻고, 처음 true 를 돌려준 것에서 끝낸다.
let popInterceptors: InterceptorEntry[] = [];
const appPopEvents = new WeakSet<Event>();

type StateRecord = Record<string, unknown>;
const asRecord = (state: unknown): StateRecord | null =>
  state && typeof state === 'object' ? (state as StateRecord) : null;
const readIdx = (state: unknown) => {
  const value = asRecord(state)?.[IDX_KEY];
  return typeof value === 'number' ? value : null;
};
type InstallRecord = { originals: { push: HistoryMethod; replace: HistoryMethod }; listener: (event: PopStateEvent) => void; pageshow: () => void };
type MarkedWindow = Window & { [INSTALL_MARKER]?: InstallRecord };

function clearPendingAppBack() {
  pendingAppBack = false;
  if (pendingAppBackTimer) clearTimeout(pendingAppBackTimer);
  pendingAppBackTimer = null;
}

const currentUrl = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

/** 비교용 정규화 — 쿼리 인코딩 차이(`from=/a` vs `from=%2Fa`)와 hash 는 같은 화면으로 본다. */
export function normalizeInAppUrl(url: string): string | null {
  try {
    const parsed = new URL(url, URL_BASE);
    if (parsed.origin !== URL_BASE) return null;
    const query = parsed.searchParams.toString();
    return `${parsed.pathname}${query ? `?${query}` : ''}`;
  } catch {
    return null; // URL 로 읽히지 않는 값은 어떤 항목과도 같지 않다.
  }
}

const sameUrl = (a: string, b: string) => {
  const left = normalizeInAppUrl(a);
  return left !== null && left === normalizeInAppUrl(b);
};

function withIdx(data: unknown, index: number): StateRecord {
  const next: StateRecord = { ...(asRecord(data) ?? {}), [IDX_KEY]: index };
  delete next[PARENT_KEY]; // 부모 표식은 삽입 때만 원본 메서드로 직접 쓴다.
  return next;
}

function withoutOverlay(data: unknown): StateRecord {
  const next: StateRecord = { ...(asRecord(data) ?? {}) };
  delete next[OVERLAY_STATE_KEY];
  return next;
}

function readStored(): Mirror | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Mirror) : null;
    return parsed && typeof parsed.index === 'number' && parsed.entries ? parsed : null;
  } catch {
    return null; // 손상·프라이빗 모드 — 거울 없이 시작하면 뒤로가기는 replace 로 안전하게 간다.
  }
}

function persist() {
  if (!mirror) return;
  for (const key of Object.keys(mirror.entries)) {
    if (Math.abs(Number(key) - mirror.index) > KEEP_AROUND) delete mirror.entries[Number(key)];
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(mirror));
  } catch {
    // 쿼터 초과 — 메모리 거울은 그대로라 이 탭의 판단은 계속된다. 새로고침 뒤에만 잊는다.
  }
}

function recordPush(state: unknown) {
  if (!mirror) return;
  const next = mirror.index + 1;
  for (const key of Object.keys(mirror.entries)) if (Number(key) >= next) delete mirror.entries[Number(key)];
  mirror.index = next;
  mirror.entries[next] = pushingBuffer
    ? { url: currentUrl(), buffer: true }
    : { url: currentUrl(), overlay: Boolean(asRecord(state)?.[OVERLAY_STATE_KEY]) };
  persist();
}

function onPopState(event: PopStateEvent) {
  if (!mirror) return;
  const state = asRecord(event.state);
  const target = readIdx(state);
  const leaving = mirror.entries[mirror.index];
  const arriving = target === null ? undefined : mirror.entries[target];
  const appInitiated = pendingAppBack;
  clearPendingAppBack();
  const direction: AppPop['direction'] =
    target === null || target === mirror.index ? 'unknown' : target < mirror.index ? 'back' : 'forward';
  // 도장 없는 항목이면 거울을 믿지 않는다 — 다음 도장 있는 pop·push 에서 다시 맞춘다.
  untracked = target === null;
  if (target !== null) {
    delete mirror.leaveTarget;
    mirror.index = target;
    mirror.entries[target] = { ...arriving, url: currentUrl() };
    persist();
  }
  // 오버레이 표식을 지나도 화면(URL)이 바뀌었으면 페이지 이동이다 — 닫기 back 과 사용자 back 이 합쳐진 경우 등.
  const touchesOverlay = Boolean(leaving?.overlay) || Boolean(arriving?.overlay);
  const samePage = leaving !== undefined && sameUrl(leaving.url, currentUrl());
  const overlayPop = suppressedPops > 0 || (touchesOverlay && samePage);
  if (overlayPop) suppressedPops = Math.max(0, suppressedPops - 1);
  // Next 보다 먼저 등록된 리스너라, 여기서 멈추면 Next 는 이 pop 을 모른다(오버레이 닫기·이탈 막기).
  for (const { intercept } of popInterceptors) {
    if (intercept(event, { direction, samePage, leftBuffer: Boolean(leaving?.buffer) })) {
      event.stopImmediatePropagation();
      return;
    }
  }
  if (arriving?.stale && direction !== 'unknown') {
    // A superseded same-URL copy — keep going the same way. From another page, let Next draw it first.
    window.history.go(direction === 'back' ? -1 : 1);
    if (samePage) {
      event.stopImmediatePropagation();
      return;
    }
  }
  if (overlayPop) return; // 오버레이만 닫힌 pop — 페이지 전환·스크롤 초기화 대상이 아니다.
  appPopEvents.add(event);
  // 콜드스타트 부모 항목엔 Next 트리가 없다(__NA 없음) — 그대로 두면 Next 가 전체 새로고침한다.
  if (state?.[PARENT_KEY] && !state.__NA && softNavigate) {
    event.stopImmediatePropagation();
    softNavigate(currentUrl());
  }
  popListeners.forEach((listener) => listener({ direction, appInitiated }));
}

/** 이전 모듈 인스턴스(HMR)의 설치를 걷는다 — 겹쳐 감싸면 도장·리스너가 두 벌이 된다. */
function removePreviousInstall() {
  const win = window as MarkedWindow;
  const previous = win[INSTALL_MARKER];
  if (!previous) return;
  History.prototype.pushState = previous.originals.push;
  History.prototype.replaceState = previous.originals.replace;
  window.removeEventListener('popstate', previous.listener);
  window.removeEventListener('pageshow', previous.pageshow);
  delete win[INSTALL_MARKER];
}

/** Marks every contiguous entry from `start` down that shows this URL — all are copies the loaded entry replaces. */
function markSameUrlRunStale(start: number) {
  if (!mirror) return;
  for (let i = start; mirror.entries[i] && sameUrl(mirror.entries[i].url, currentUrl()); i -= 1) {
    mirror.entries[i] = { ...mirror.entries[i], stale: true };
  }
}

export function installNavigationHistory(): void {
  if (typeof window === 'undefined' || mirror) return;
  removePreviousInstall();
  const stored = readStored();
  const stamped = readIdx(window.history.state);
  let skipStale: -1 | 1 | null = null;
  let leftoverMarker = false;
  if (stamped !== null) {
    mirror = { index: stamped, entries: stored?.entries ?? {}, tabStart: stored?.tabStart }; // 새로고침·bfcache 복귀
    const here = mirror.entries[stamped];
    if (here?.buffer && sameUrl(here.url, currentUrl())) {
      // Reloaded on a buffer: this entry becomes the form entry; the old one below is now another document.
      markSameUrlRunStale(stamped - 1);
    }
    const from = stored?.leaveTarget ?? stored?.index;
    if (here?.stale && from !== undefined && from !== stamped) skipStale = stamped < from ? -1 : 1;
    delete mirror.leaveTarget;
    // Loaded onto an overlay marker (reload with a modal open): no overlay is open in a fresh document.
    // The entry turns into the page entry, and the same-URL page entry under it becomes a skipped copy.
    if (!skipStale && asRecord(window.history.state)?.[OVERLAY_STATE_KEY]) {
      leftoverMarker = true;
      markSameUrlRunStale(stamped - 1);
    }
  } else if (stored) {
    // 같은 탭의 전체 문서 이동(외부 복귀·네이티브 loadUrl) — 새 항목이 쌓인 것이다.
    mirror = stored;
    for (const key of Object.keys(mirror.entries)) if (Number(key) > stored.index) delete mirror.entries[Number(key)];
    mirror.index = stored.index + 1;
  } else {
    mirror = { index: 0, entries: {}, ...(window.history.length === 1 ? { tabStart: 0 } : {}) };
    coldStart = true;
  }
  mirror.entries[mirror.index] = { url: currentUrl(), ...(skipStale ? { stale: true } : {}) };
  documentStartIndex = mirror.index;

  const proto = History.prototype;
  const push = proto.pushState;
  const replace = proto.replaceState;
  originals = { push, replace };
  proto.pushState = function pushState(this: History, data, unused, url) {
    const here = mirror?.entries[mirror.index];
    if (mirror && here?.buffer && !pushingBuffer && url != null && !sameUrl(String(url), currentUrl())) {
      // Leaving the buffer: the destination takes its place, so no duplicate form entry stays behind it.
      replace.call(this, withIdx(data, mirror.index), unused, url);
      untracked = false;
      mirror.entries[mirror.index] = { url: currentUrl() };
      persist();
      return;
    }
    const stampedState = withIdx(data, (mirror?.index ?? -1) + 1);
    push.call(this, stampedState, unused, url);
    pushCount += 1;
    untracked = false;
    recordPush(stampedState);
  };
  proto.replaceState = function replaceState(this: History, data, unused, url) {
    const stampedState = withIdx(data, mirror?.index ?? 0);
    replace.call(this, stampedState, unused, url);
    if (!mirror) return;
    const previous = mirror.entries[mirror.index];
    const keepBuffer = Boolean(previous?.buffer) && sameUrl(previous.url, currentUrl());
    mirror.entries[mirror.index] = { url: currentUrl(), overlay: Boolean(stampedState[OVERLAY_STATE_KEY]), ...(keepBuffer ? { buffer: true } : {}) };
    persist();
  };
  replace.call(window.history, withIdx(leftoverMarker ? withoutOverlay(window.history.state) : window.history.state, mirror.index), '');
  window.addEventListener('popstate', onPopState);
  // bfcache 복귀엔 popstate 가 없다 — 떠나기 직전의 대기 표식이 다음 클릭을 막지 않게 지운다.
  window.addEventListener('pageshow', clearPendingAppBack);
  (window as MarkedWindow)[INSTALL_MARKER] = { originals, listener: onPopState, pageshow: clearPendingAppBack };
  persist();
  if (skipStale) window.history.go(skipStale); // traversal landed on a dead same-URL copy — keep going
}

/** 헤더 뒤로가기의 방법. 목적지가 바로 앞 앱 항목이면 back(스크롤도 복원), 아니면 replace(앞 중복 없음). */
export function decideBackAction(target: string): 'back' | 'replace' {
  if (untracked) return 'replace';
  const previous = mirror?.entries[mirror.index - 1];
  if (!previous || previous.overlay) return 'replace';
  return sameUrl(previous.url, target) ? 'back' : 'replace';
}

/** 이 탭에서 앱 안의 이전 항목으로 돌아갈 수 있는가(router.back() 이 앱 밖으로 나가지 않는가). */
export function hasPreviousInAppEntry(): boolean {
  return !untracked && Boolean(mirror?.entries[mirror.index - 1]);
}

/** Is there an earlier entry created by this document (a back to it is a same-document popstate)? */
export function hasPreviousSameDocumentEntry(): boolean {
  if (untracked || !mirror) return false;
  let below = mirror.index - 1;
  while (mirror.entries[below]?.stale) below -= 1; // a back skips over superseded copies
  return below >= documentStartIndex && Boolean(mirror.entries[below]);
}

/** Pushes a same-URL buffer entry. A later push to another URL replaces it instead of stacking on it. */
export function pushBufferEntry(): void {
  if (!mirror) return;
  pushingBuffer = true;
  try {
    window.history.pushState(window.history.state, '', currentUrl());
  } finally {
    pushingBuffer = false;
  }
}

/**
 * How a real leave from the buffer goes back past the buffer, the form entry and any dead same-URL copies under it.
 * exit: nothing is before them in this tab — `steps` then only reaches the bottom form entry, which the caller replaces.
 */
export function bufferLeavePlan(): { steps: number; exit: boolean } {
  if (!mirror) return { steps: 2, exit: false };
  let bottom = mirror.index - 1;
  while (mirror.entries[bottom - 1]?.stale && sameUrl(mirror.entries[bottom - 1].url, currentUrl())) bottom -= 1;
  const exit = mirror.tabStart !== undefined && bottom <= mirror.tabStart;
  return { steps: mirror.index - bottom + (exit ? 0 : 1), exit };
}

/**
 * Closes an overlay whose marker sits right on the buffer without a back(): the marker entry becomes the buffer,
 * the old buffer becomes the form entry and the form entry under it a skipped copy. A back() here would leave the
 * marker as a forward entry that the buffer's push-as-replace never truncates.
 */
export function collapseOverlayOntoBuffer(): boolean {
  if (!mirror || !originals || untracked) return false;
  const below = mirror.entries[mirror.index - 1];
  if (!below?.buffer || !sameUrl(below.url, currentUrl())) return false;
  originals.replace.call(window.history, withIdx(withoutOverlay(window.history.state), mirror.index), '');
  mirror.entries[mirror.index] = { url: currentUrl(), buffer: true };
  mirror.entries[mirror.index - 1] = { url: below.url };
  const form = mirror.entries[mirror.index - 2];
  if (form && sameUrl(form.url, below.url)) mirror.entries[mirror.index - 2] = { ...form, stale: true };
  persist();
  return true;
}

/** go(-steps) for a leave, remembering the target in case it lands outside the app. */
export function goBackLeaving(steps: number): void {
  if (mirror) {
    mirror.leaveTarget = mirror.index - steps;
    persist();
  }
  window.history.go(-steps);
}

export function currentEntryIsBuffer(): boolean {
  return Boolean(mirror?.entries[mirror.index]?.buffer);
}

/** Replace the current entry with an in-app URL — soft (router.replace) when bound, otherwise a full load. */
export function replaceInApp(url: string): void {
  if (softNavigate) softNavigate(url);
  else window.location.replace(url);
}

/** 곧 일어날 popstate 가 앱이 부른 뒤로가기임을 알린다 — iOS 셸도 네이티브 애니메이션이 없다. */
export function markAppInitiatedBack(): void {
  clearPendingAppBack();
  pendingAppBack = true;
  pendingAppBackTimer = setTimeout(clearPendingAppBack, APP_BACK_PENDING_MS);
}

/** 앱이 부른 back 의 pop 을 기다리는 중인가 — 헤더 뒤로가기 연타가 두 칸 가지 않게. */
export function isAppBackPending(): boolean {
  return pendingAppBack;
}

/** 앱 페이지 이동인 popstate 만 알린다(오버레이 pop 제외). 해지 함수를 돌려준다. */
export function subscribeAppPop(listener: (pop: AppPop) => void): () => void {
  popListeners.add(listener);
  return () => {
    popListeners.delete(listener);
  };
}

/** 직접 popstate 를 듣는 코드용 — 이 이벤트가 페이지 이동이었는지(오버레이 pop 이 아닌지). */
export function isAppNavigationPop(event: Event): boolean {
  return appPopEvents.has(event);
}

/** popstate 를 Next 보다 먼저 볼 가로채기를 건다. 해지 함수를 돌려준다. */
export function addPopInterceptor(intercept: PopInterceptor, { priority = 0 }: { priority?: number } = {}): () => void {
  installNavigationHistory();
  const entry = { intercept, priority };
  popInterceptors = [...popInterceptors, entry].sort((a, b) => b.priority - a.priority);
  return () => {
    popInterceptors = popInterceptors.filter((item) => item !== entry);
  };
}

/** 지금까지의 pushState 횟수 — 예약한 back 뒤에 push 가 끼었는지(그 back 은 취소된다) 판단용. */
export function historyPushCount(): number {
  return pushCount;
}

/** 오버레이가 자기 항목을 history.back() 으로 걷을 때, 그 pop 하나를 페이지 이동에서 뺀다. */
export function suppressNextPop(): void {
  suppressedPops += 1;
}

/** 콜드스타트 부모 항목에 도착했을 때 새로고침 대신 쓸 소프트 이동(router.replace). */
export function bindSoftNavigator(navigate: (url: string) => void): () => void {
  softNavigate = navigate;
  return () => {
    if (softNavigate === navigate) softNavigate = null;
  };
}

/**
 * 탭의 첫 앱 항목으로 상세에 바로 들어왔으면(알림·딥링크) 그 앞에 부모 항목을 한 번 끼운다.
 * 브라우저 뒤로·iOS 스와이프·Android goBack 이 모두 이 항목을 만난다.
 * Next 패치를 거치지 않는 원본 메서드로 쓴다 — 거치면 Next 가 현재 트리를 부모 URL 에 복사한다.
 */
export function ensureColdStartParent(parentUrl: string | null): boolean {
  if (!mirror || !originals || !coldStart || mirror.index !== 0 || !parentUrl) return false;
  const here = currentUrl();
  if (normalizeInAppUrl(parentUrl) === null || sameUrl(parentUrl, here)) return false;
  try {
    if (window.sessionStorage.getItem(PARENT_DONE_KEY)) return false;
    window.sessionStorage.setItem(PARENT_DONE_KEY, '1');
  } catch {
    // 표식을 못 남겨도 coldStart 는 메모리에서 한 번만 참이다.
  }
  const detailState = window.history.state;
  originals.replace.call(window.history, { [IDX_KEY]: 0, [PARENT_KEY]: true }, '', parentUrl);
  originals.push.call(window.history, withIdx(detailState, 1), '', here);
  mirror.entries = { 0: { url: parentUrl, parent: true }, 1: { url: here } };
  mirror.index = 1;
  documentStartIndex = 0;
  coldStart = false;
  persist();
  return true;
}

export function __resetNavigationHistoryForTests(): void {
  if (originals) {
    History.prototype.pushState = originals.push;
    History.prototype.replaceState = originals.replace;
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('pageshow', clearPendingAppBack);
    delete (window as MarkedWindow)[INSTALL_MARKER];
  }
  mirror = null;
  originals = null;
  coldStart = false;
  documentStartIndex = 0;
  pushingBuffer = false;
  clearPendingAppBack();
  untracked = false;
  suppressedPops = 0;
  softNavigate = null;
  popListeners.clear();
  popInterceptors = [];
}
