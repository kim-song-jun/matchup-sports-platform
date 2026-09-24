/**
 * 앱 안 히스토리 추적기 — 헤더 뒤로가기가 back 인지 replace 인지, 콜드스타트 부모 항목이 제대로 끼는지.
 * 이 테스트가 잡는 버그: 헤더 뒤로가기가 push 로 쌓여 하드웨어 뒤로가 방금 떠난 화면으로 튀는 것,
 * 알림으로 상세에 바로 들어와 첫 뒤로가기가 앱을 나가 버리는 것.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetNavigationHistoryForTests,
  OVERLAY_STATE_KEY,
  bindSoftNavigator,
  decideBackAction,
  ensureColdStartParent,
  hasPreviousInAppEntry,
  installNavigationHistory,
  isAppNavigationPop,
  markAppInitiatedBack,
  subscribeAppPop,
  suppressNextPop,
  type AppPop,
} from './navigation-history';

/** jsdom 은 history.back() 을 비동기로 처리하고 popstate 를 쏜다 — 그 이벤트를 기다린다. */
function traverse(step: () => void): Promise<PopStateEvent> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', (event) => resolve(event), { once: true, capture: true });
    step();
  });
}
const back = () => traverse(() => window.history.back());
const forward = () => traverse(() => window.history.forward());
const idx = () => (window.history.state as Record<string, unknown> | null)?.__tmIdx;

/** 새 탭처럼 시작한다 — 이 탭의 거울·표식이 없고 현재 항목에 순번도 없다. */
function freshTab(url: string) {
  __resetNavigationHistoryForTests();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', url);
}

beforeEach(() => freshTab('/home'));
afterEach(() => __resetNavigationHistoryForTests());

describe('push · replace · pop 분류', () => {
  it('push 는 순번을 하나 올리고 replace 는 그 자리를 유지한다 — Next 의 state 키는 그대로 둔다', () => {
    installNavigationHistory();
    expect(idx()).toBe(0);

    const nextState = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { tree: ['x'] } };
    window.history.pushState(nextState, '', '/teams/1?from=%2Fhome');
    expect(idx()).toBe(1);
    expect(window.history.state).toMatchObject(nextState);

    window.history.replaceState({ __NA: true }, '', '/teams/1?from=%2Fhome&tab=members');
    expect(idx()).toBe(1);
  });

  it('뒤로·앞으로 popstate 를 방향과 함께 알린다', async () => {
    installNavigationHistory();
    const pops: AppPop[] = [];
    subscribeAppPop((pop) => pops.push(pop));
    window.history.pushState({}, '', '/teams');
    window.history.pushState({}, '', '/teams/1');

    const event = await back();
    expect(pops.at(-1)).toEqual({ direction: 'back', appInitiated: false });
    expect(isAppNavigationPop(event)).toBe(true);

    await forward();
    expect(pops.at(-1)).toEqual({ direction: 'forward', appInitiated: false });
  });

  it('앱이 부른 뒤로가기는 appInitiated 로 표시하고, 다음 pop 에는 남지 않는다', async () => {
    installNavigationHistory();
    const pops: AppPop[] = [];
    subscribeAppPop((pop) => pops.push(pop));
    window.history.pushState({}, '', '/teams');
    window.history.pushState({}, '', '/teams/1');

    markAppInitiatedBack();
    await back();
    await back();
    expect(pops.map((pop) => pop.appInitiated)).toEqual([true, false]);
  });

  it('오버레이 항목의 pop 과 억제된 pop 은 페이지 이동으로 알리지 않는다', async () => {
    installNavigationHistory();
    const listener = vi.fn();
    subscribeAppPop(listener);
    window.history.pushState({}, '', '/teams/1');
    window.history.pushState({ [OVERLAY_STATE_KEY]: 'sheet' }, '');

    const overlayPop = await back();
    expect(listener).not.toHaveBeenCalled();
    expect(isAppNavigationPop(overlayPop)).toBe(false);

    suppressNextPop();
    await back();
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('헤더 뒤로가기 — back 인가 replace 인가', () => {
  it('목적지가 바로 앞 앱 항목이면 back, 아니면 replace', () => {
    installNavigationHistory();
    window.history.pushState({}, '', '/teams/1?from=%2Fhome');

    expect(decideBackAction('/home')).toBe('back');
    expect(decideBackAction('/teams')).toBe('replace');
  });

  it('쿼리 인코딩만 다른 출처 체인도 같은 항목으로 본다', () => {
    installNavigationHistory();
    window.history.pushState({}, '', '/teams/1?from=%2Fteams');
    window.history.pushState({}, '', '/league-matches/9?from=%2Fteams%2F1%3Ffrom%3D%252Fteams');

    // AppBackLink 는 searchParams.get('from') 으로 디코딩된 값을 목적지로 쓴다.
    expect(decideBackAction('/teams/1?from=/teams')).toBe('back');
  });

  it('앞에 앱 항목이 없으면(첫 항목) replace — 앱 밖으로 back 하지 않는다', () => {
    installNavigationHistory();
    expect(decideBackAction('/home')).toBe('replace');
    expect(hasPreviousInAppEntry()).toBe(false);
  });

  it('설치 전(서버 렌더·초기화 전)에는 항상 replace', () => {
    expect(decideBackAction('/home')).toBe('replace');
  });

  it('새로고침 뒤에도 탭의 거울과 항목 순번으로 판단을 이어 간다', () => {
    installNavigationHistory();
    window.history.pushState({}, '', '/teams/1?from=%2Fhome');

    __resetNavigationHistoryForTests(); // 문서가 새로 뜬 것처럼 — sessionStorage·history.state 는 남는다
    installNavigationHistory();
    expect(idx()).toBe(1);
    expect(decideBackAction('/home')).toBe('back');
  });
});

describe('콜드스타트 부모 항목', () => {
  it('첫 항목이 상세면 부모를 앞에 끼워 브라우저 뒤로가 부모에 닿게 한다', async () => {
    freshTab('/teams/1?from=%2Fteams');
    installNavigationHistory();
    const lengthBefore = window.history.length;

    expect(ensureColdStartParent('/teams')).toBe(true);
    expect(window.history.length).toBe(lengthBefore + 1);
    expect(window.location.pathname).toBe('/teams/1');
    expect(decideBackAction('/teams')).toBe('back');

    await back();
    expect(window.location.pathname).toBe('/teams');
  });

  it('부모 항목에 도착하면 Next 보다 먼저 가로채 소프트 이동한다(Next 는 새로고침하지 않는다)', async () => {
    freshTab('/teams/1');
    installNavigationHistory();
    const softNavigate = vi.fn();
    bindSoftNavigator(softNavigate);
    // Next Router 의 popstate 리스너는 추적기보다 늦게 등록된다(effect 순서) — 그 자리를 흉내 낸다.
    const nextRouterPop = vi.fn();
    window.addEventListener('popstate', nextRouterPop);
    ensureColdStartParent('/teams');

    await back();
    expect(softNavigate).toHaveBeenCalledWith('/teams');
    expect(nextRouterPop).not.toHaveBeenCalled();
    window.removeEventListener('popstate', nextRouterPop);
  });

  it('소프트 이동이 없으면 이벤트를 그대로 흘린다 — 부모 항목엔 __NA 가 없어 Next 는 새로고침한다', async () => {
    freshTab('/teams/1');
    installNavigationHistory();
    const nextRouterPop = vi.fn();
    window.addEventListener('popstate', nextRouterPop);
    ensureColdStartParent('/teams');

    await back();
    expect(nextRouterPop).toHaveBeenCalledTimes(1);
    expect(nextRouterPop.mock.calls[0][0].state).toMatchObject({ __tmParent: true });
    expect(nextRouterPop.mock.calls[0][0].state.__NA).toBeUndefined();
    window.removeEventListener('popstate', nextRouterPop);
  });

  it('부모가 없으면(루트 탭 등) 아무것도 끼우지 않는다', () => {
    installNavigationHistory();
    const lengthBefore = window.history.length;
    expect(ensureColdStartParent(null)).toBe(false);
    expect(window.history.length).toBe(lengthBefore);
  });

  it('탭 세션에 한 번만 — 앱 안에서 이미 이동한 뒤나 같은 탭의 새 문서에서는 끼우지 않는다', () => {
    freshTab('/teams/1');
    installNavigationHistory();
    expect(ensureColdStartParent('/teams')).toBe(true);
    expect(ensureColdStartParent('/teams')).toBe(false);

    // 같은 탭에서 전체 문서 이동(순번 없는 새 항목) — 첫 항목이 아니다.
    __resetNavigationHistoryForTests();
    window.history.pushState(null, '', '/matches/3');
    installNavigationHistory();
    const lengthBefore = window.history.length;
    expect(ensureColdStartParent('/matches')).toBe(false);
    expect(window.history.length).toBe(lengthBefore);
    expect(idx()).toBe(2);
  });
});
