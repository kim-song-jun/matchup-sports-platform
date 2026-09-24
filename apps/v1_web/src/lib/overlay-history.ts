/**
 * 오버레이(모달·확인창·드로어·뷰어)를 뒤로가기로 닫는 단일 스택.
 *
 * - 열 때: 같은 URL 에 OVERLAY_STATE_KEY 표식 항목을 하나 쌓는다.
 * - 뒤로가기(브라우저·Android goBack·iOS 스와이프): 도착한 항목보다 위의 오버레이를 위에서부터 닫는다.
 * - 다른 수단(✕·배경·ESC·완료)으로 닫을 때: 자기 항목이 맨 위면 history.back() 으로 걷는다.
 *   URL 이 바뀐 뒤(모달 안 링크로 이동)면 걷지 않는다 — 남은 표식은 다음 뒤로가기가 건너뛴다.
 * 스스로 부른 back/forward 의 pop 은 Next·페이지 전환에 전달하지 않는다(addPopInterceptor).
 */
import type { MouseEvent as ReactMouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { OVERLAY_STATE_KEY, addPopInterceptor, historyPushCount, type PopInfo } from './navigation-history';

type Overlay = {
  id: string;
  url: string;
  pushed: boolean;
  close: () => void;
  locked: () => boolean;
};
type SelfPopKind = { kind: 'consume'; id: string; url: string } | { kind: 'skip'; url: string } | { kind: 'forward' };
type SelfPop = SelfPopKind & { at: number; pushCount: number };

// 스스로 부른 이동의 pop 이 이 시간 안에 안 오면 포기한다 — 대기열이 남으면 사용자의 다음 뒤로가기를 삼킨다.
const SELF_POP_TIMEOUT_MS = 1000;
// 예약한 back 의 pop 은 수 ms 안에 온다. push 가 끼고 이보다 늦게 온 pop 은 사용자의 뒤로가기다.
const SELF_POP_GRACE_MS = 100;

const stack: Overlay[] = [];
const selfPops: SelfPop[] = [];
let selfTimer: ReturnType<typeof setTimeout> | null = null;
let settleWaiters: Array<() => void> = [];
let removeInterceptor: (() => void) | null = null;
let seq = 0;

const hereUrl = () => `${window.location.pathname}${window.location.search}`;

export function overlayMarkerOf(state: unknown): string | null {
  const value = state && typeof state === 'object' ? (state as Record<string, unknown>)[OVERLAY_STATE_KEY] : null;
  return typeof value === 'string' ? value : null;
}

function pushMarker(overlay: Overlay) {
  const state = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history.pushState({ ...state, [OVERLAY_STATE_KEY]: overlay.id }, '');
  overlay.pushed = true;
}

function settle() {
  if (selfPops.length > 0) return;
  if (selfTimer) clearTimeout(selfTimer);
  selfTimer = null;
  // 걷는 중에 열린 오버레이는 pop 이 끝난 뒤에 쌓는다 — 대기 중 push 가 끼면 back 이 엉뚱한 항목을 걷는다.
  for (const overlay of stack) if (!overlay.pushed) pushMarker(overlay);
  const waiters = settleWaiters;
  settleWaiters = [];
  waiters.forEach((resolve) => resolve());
}

// 스스로 부른 pop 은 onPop 이 true 를 돌려 페이지 전환·Next 에 닿지 않는다(suppressNextPop 불필요).
function runSelf(pop: SelfPopKind, go: () => void) {
  selfPops.push({ ...pop, at: Date.now(), pushCount: historyPushCount() });
  if (selfTimer) clearTimeout(selfTimer);
  selfTimer = setTimeout(() => {
    selfPops.length = 0;
    settle();
  }, SELF_POP_TIMEOUT_MS);
  go();
}

// 남은 표식은 도착한 방향으로 건너뛴다 — 앞으로가기에서 back 으로 건너뛰면 앞으로가기가 영영 막힌다.
const skipStale = (direction: PopInfo['direction']) =>
  runSelf({ kind: 'skip', url: hereUrl() }, () =>
    direction === 'forward' ? window.history.forward() : window.history.back(),
  );

function onPop(event: PopStateEvent, { direction, samePage }: PopInfo): boolean {
  const arriving = overlayMarkerOf(event.state);
  const pending = selfPops[0];
  if (pending && historyPushCount() !== pending.pushCount && Date.now() - pending.at > SELF_POP_GRACE_MS) {
    // back 을 예약한 뒤 push 가 끼면 브라우저가 그 back 을 취소한다 — 이 pop 은 사용자의 것이다.
    selfPops.length = 0;
    settle();
  }
  const self = selfPops.shift();
  if (self) {
    if (self.kind === 'consume' && arriving === self.id) {
      // 닫기 back 과 새 페이지 push 가 엇갈려 새 페이지에서 한 칸 넘어왔다 — 제자리로 되돌린다.
      runSelf({ kind: 'forward' }, () => window.history.forward());
      return true;
    }
    const sameUrl = self.kind === 'forward' || self.url === hereUrl();
    if (sameUrl && arriving !== null && !stack.some((overlay) => overlay.id === arriving)) skipStale(direction);
    else settle();
    return sameUrl;
  }

  if (stack.length === 0) {
    if (arriving === null) return false;
    skipStale(direction); // 닫힌 오버레이의 남은 표식 — 빈 이동이 되지 않게 건너뛴다.
    // 화면이 그대로면 Next 에 알릴 이동이 없다. 바뀌었으면 Next 가 그 화면을 그리게 흘린다.
    return samePage;
  }
  const index = arriving === null ? -1 : stack.findIndex((overlay) => overlay.id === arriving);
  const top = stack[stack.length - 1];
  if (index === stack.length - 1) return false;
  if (top.locked()) {
    pushMarker(top); // 제출 중 — 닫지 않고 항목을 되돌린다.
    return true;
  }
  const closing = stack.splice(index + 1).reverse();
  const handled = closing[0].url === hereUrl();
  closing.forEach((overlay) => overlay.close());
  if (arriving !== null && index === -1) skipStale(direction);
  return handled;
}

/** 오버레이를 연다 — 히스토리 항목을 쌓고 id 를 돌려준다. 닫을 땐 반드시 releaseOverlay(id). */
export function openOverlay(handlers: { close: () => void; locked?: () => boolean }): string {
  if (!removeInterceptor) removeInterceptor = addPopInterceptor(onPop);
  seq += 1;
  const overlay: Overlay = {
    id: `${Date.now().toString(36)}-${seq}`,
    url: hereUrl(),
    pushed: false,
    close: handlers.close,
    locked: handlers.locked ?? (() => false),
  };
  stack.push(overlay);
  if (selfPops.length === 0) pushMarker(overlay);
  return overlay.id;
}

/** 오버레이가 닫혔다(어떤 수단이든). 뒤로가기로 닫힌 것이면 아무것도 안 한다. */
export function releaseOverlay(id: string): void {
  const index = stack.findIndex((overlay) => overlay.id === id);
  if (index === -1) return;
  const [overlay] = stack.splice(index, 1);
  if (!overlay.pushed) return;
  const wasTop = index === stack.length;
  if (!wasTop || overlay.url !== hereUrl() || overlayMarkerOf(window.history.state) !== overlay.id) return;
  runSelf({ kind: 'consume', id: overlay.id, url: overlay.url }, () => window.history.back());
}

/** 오버레이가 스스로 부른 back/forward 가 모두 끝나면 풀린다. 닫힘 뒤에 이동할 코드가 기다린다. */
export function waitForOverlayHistory(): Promise<void> {
  if (selfPops.length === 0) return Promise.resolve();
  return new Promise((resolve) => settleWaiters.push(resolve));
}

/**
 * 오버레이를 닫고 이동하는 핸들러의 단일 경로. 닫기 back 과 이동 push 가 겹치면 브라우저가 back 을
 * 취소하거나 새 페이지를 걷는다 — 닫기를 곧바로 커밋해 back 을 예약시키고, 그 pop 이 끝난 뒤 이동한다.
 * 이동하는 링크는 이 대신 경로 변경으로 닫히게 둔다(URL 이 바뀐 뒤의 release 는 back 하지 않는다).
 */
export async function closeOverlayThenNavigate(close: () => void, navigate: () => void): Promise<void> {
  flushSync(close);
  await waitForOverlayHistory();
  navigate();
}

/**
 * 오버레이 안 내비게이션 링크의 onClick. 다른 화면으로 가는 링크는 그대로 두어 경로 변경이 오버레이를
 * 닫게 한다(URL 이 바뀐 뒤라 back 하지 않는다). 지금 화면으로 가는 링크는 경로가 안 바뀌니 이동 없이 닫는다.
 */
export function closeIfCurrentPage(href: string, pathname: string, close: () => void) {
  return (event: ReactMouseEvent) => {
    if (href !== pathname || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    close();
  };
}

export function __resetOverlayHistoryForTests(): void {
  stack.length = 0;
  selfPops.length = 0;
  if (selfTimer) clearTimeout(selfTimer);
  selfTimer = null;
  settleWaiters.forEach((resolve) => resolve());
  settleWaiters = [];
  removeInterceptor?.();
  removeInterceptor = null;
}
