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
const URL_BASE = 'https://nav-history.invalid';

type Entry = { url: string; overlay?: boolean; parent?: boolean };
type Mirror = { index: number; entries: Record<number, Entry> };
export type AppPop = { direction: 'back' | 'forward' | 'unknown'; appInitiated: boolean };
type HistoryMethod = History['pushState'];

let mirror: Mirror | null = null;
let coldStart = false;
let originals: { push: HistoryMethod; replace: HistoryMethod } | null = null;
let pendingAppBack = false;
let suppressedPops = 0;
let pushCount = 0;
let softNavigate: ((url: string) => void) | null = null;
const popListeners = new Set<(pop: AppPop) => void>();
/** true 를 돌려주면 그 pop 을 여기서 끝낸다(Next·다른 리스너에 전달하지 않음). */
export type PopInterceptor = (event: PopStateEvent) => boolean;
const popInterceptors = new Set<PopInterceptor>();
const appPopEvents = new WeakSet<Event>();

type StateRecord = Record<string, unknown>;
const asRecord = (state: unknown): StateRecord | null =>
  state && typeof state === 'object' ? (state as StateRecord) : null;
const readIdx = (state: unknown) => {
  const value = asRecord(state)?.[IDX_KEY];
  return typeof value === 'number' ? value : null;
};
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
  mirror.entries[next] = { url: currentUrl(), overlay: Boolean(asRecord(state)?.[OVERLAY_STATE_KEY]) };
  persist();
}

function onPopState(event: PopStateEvent) {
  if (!mirror) return;
  const state = asRecord(event.state);
  const target = readIdx(state);
  const leaving = mirror.entries[mirror.index];
  const arriving = target === null ? undefined : mirror.entries[target];
  const appInitiated = pendingAppBack;
  pendingAppBack = false;
  const direction: AppPop['direction'] =
    target === null || target === mirror.index ? 'unknown' : target < mirror.index ? 'back' : 'forward';
  if (target !== null) {
    mirror.index = target;
    mirror.entries[target] = { ...arriving, url: currentUrl() };
    persist();
  }
  const overlayPop = suppressedPops > 0 || Boolean(leaving?.overlay) || Boolean(arriving?.overlay);
  if (overlayPop) suppressedPops = Math.max(0, suppressedPops - 1);
  // Next 보다 먼저 등록된 리스너라, 여기서 멈추면 Next 는 이 pop 을 모른다(오버레이 닫기·이탈 막기).
  for (const intercept of popInterceptors) {
    if (intercept(event)) {
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

export function installNavigationHistory(): void {
  if (typeof window === 'undefined' || mirror) return;
  const stored = readStored();
  const stamped = readIdx(window.history.state);
  if (stamped !== null) {
    mirror = { index: stamped, entries: stored?.entries ?? {} }; // 새로고침·bfcache 복귀
  } else if (stored) {
    // 같은 탭의 전체 문서 이동(외부 복귀·네이티브 loadUrl) — 새 항목이 쌓인 것이다.
    mirror = stored;
    for (const key of Object.keys(mirror.entries)) if (Number(key) > stored.index) delete mirror.entries[Number(key)];
    mirror.index = stored.index + 1;
  } else {
    mirror = { index: 0, entries: {} };
    coldStart = true;
  }
  mirror.entries[mirror.index] = { url: currentUrl() };

  const proto = History.prototype;
  const push = proto.pushState;
  const replace = proto.replaceState;
  originals = { push, replace };
  proto.pushState = function pushState(this: History, data, unused, url) {
    const stampedState = withIdx(data, (mirror?.index ?? -1) + 1);
    push.call(this, stampedState, unused, url);
    pushCount += 1;
    recordPush(stampedState);
  };
  proto.replaceState = function replaceState(this: History, data, unused, url) {
    const stampedState = withIdx(data, mirror?.index ?? 0);
    replace.call(this, stampedState, unused, url);
    if (!mirror) return;
    mirror.entries[mirror.index] = { url: currentUrl(), overlay: Boolean(stampedState[OVERLAY_STATE_KEY]) };
    persist();
  };
  replace.call(window.history, withIdx(window.history.state, mirror.index), '');
  window.addEventListener('popstate', onPopState);
  persist();
}

/** 헤더 뒤로가기의 방법. 목적지가 바로 앞 앱 항목이면 back(스크롤도 복원), 아니면 replace(앞 중복 없음). */
export function decideBackAction(target: string): 'back' | 'replace' {
  const previous = mirror?.entries[mirror.index - 1];
  if (!previous || previous.overlay) return 'replace';
  return sameUrl(previous.url, target) ? 'back' : 'replace';
}

/** 이 탭에서 앱 안의 이전 항목으로 돌아갈 수 있는가(router.back() 이 앱 밖으로 나가지 않는가). */
export function hasPreviousInAppEntry(): boolean {
  return Boolean(mirror?.entries[mirror.index - 1]);
}

/** 곧 일어날 popstate 가 앱이 부른 뒤로가기임을 알린다 — iOS 셸도 네이티브 애니메이션이 없다. */
export function markAppInitiatedBack(): void {
  pendingAppBack = true;
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
export function addPopInterceptor(intercept: PopInterceptor): () => void {
  installNavigationHistory();
  popInterceptors.add(intercept);
  return () => {
    popInterceptors.delete(intercept);
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
  coldStart = false;
  persist();
  return true;
}

export function __resetNavigationHistoryForTests(): void {
  if (originals) {
    History.prototype.pushState = originals.push;
    History.prototype.replaceState = originals.replace;
  }
  if (typeof window !== 'undefined') window.removeEventListener('popstate', onPopState);
  mirror = null;
  originals = null;
  coldStart = false;
  pendingAppBack = false;
  suppressedPops = 0;
  softNavigate = null;
  popListeners.clear();
  popInterceptors.clear();
}
