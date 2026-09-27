'use client';

import { useEffect, useReducer, useRef, type KeyboardEvent, type TouchEvent } from 'react';
import Image from 'next/image';
import { Check, Hand, Zap } from 'lucide-react';
import { HomeIcon, MatchIcon, MyIcon, TeamsIcon, TrophyIcon } from '@/components/v1-ui/icons';
import { useLandingV4Autoplay } from './landing-v4-autoplay';
import { DemoCupScreen } from './landing-v4-demo-cup';
import { DemoHomeScreen, DemoMatchScreen, DemoMyScreen, DemoTeamScreen } from './landing-v4-demo-screens';
import {
  DEMO_TABS,
  INITIAL_DEMO_STATE,
  demoReducer,
  type CupSub,
  type DemoTab,
  type TryKey,
} from './landing-v4-demo-state';

const TAB_ICONS: Record<DemoTab, typeof HomeIcon> = {
  home: HomeIcon,
  match: MatchIcon,
  cup: TrophyIcon,
  team: TeamsIcon,
  my: MyIcon,
};

const TRY_ITEMS: ReadonlyArray<{ key: TryKey; label: string; tab: DemoTab; sub?: CupSub }> = [
  { key: 'apply', label: '매치 신청', tab: 'match' },
  { key: 'goal', label: '골 넣기', tab: 'cup', sub: 'live' },
  { key: 'bracket', label: '승자 올리기', tab: 'cup', sub: 'bracket' },
  { key: 'flip', label: '카드 뒤집기', tab: 'my' },
];

const TOAST_MS = 2400;
/** 폰 안 세로 스크롤(페이지 스크롤)과 겹치지 않게 가로로 충분히, 세로보다 확실히 길게 밀었을 때만 탭을 넘긴다. */
const SWIPE_MIN_X = 48;
const SWIPE_RATIO = 1.5;

function tabIndexOf(tab: DemoTab): number {
  return DEMO_TABS.findIndex((t) => t.key === tab);
}

/**
 * 히어로의 조작되는 미니 데모. 가짜 데이터로 이 페이지 안에서만 움직인다(네트워크 요청 0건).
 * 폰 화면은 안쪽 스크롤이 없다 — 휠·세로 터치는 그대로 페이지를 스크롤한다.
 */
export function LandingV4Demo() {
  const [state, dispatch] = useReducer(demoReducer, INITIAL_DEMO_STATE);
  const deviceRef = useRef<HTMLElement>(null);
  const tablistRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<TryKey | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const playing = useLandingV4Autoplay(deviceRef, dispatch);

  const toastId = state.toast?.id;
  useEffect(() => {
    if (toastId === undefined) return;
    const timer = window.setTimeout(() => dispatch({ type: 'dismissToast', id: toastId }), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toastId]);

  // "해 볼 것"은 화면을 옮긴 뒤(커밋 후) 조작할 버튼으로 포커스를 넘긴다 — 숨은 화면은 inert 라 그 전엔 못 옮긴다.
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    deviceRef.current?.querySelector<HTMLElement>(`[data-try-target="${key}"]`)?.focus();
  }, [state.announce.seq]);

  const goTab = (tab: DemoTab, announce: boolean) => dispatch({ type: 'tab', tab, announce });

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabIndexOf(state.tab);
    const last = DEMO_TABS.length - 1;
    const next =
      event.key === 'ArrowRight' ? (current + 1) % DEMO_TABS.length
      : event.key === 'ArrowLeft' ? (current - 1 + DEMO_TABS.length) % DEMO_TABS.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    const tab = DEMO_TABS[next].key;
    goTab(tab, false);
    tablistRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`)?.focus();
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const t = event.touches[0];
    touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    const t = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
    const current = tabIndexOf(state.tab);
    const next = dx < 0 ? Math.min(current + 1, DEMO_TABS.length - 1) : Math.max(current - 1, 0);
    if (next !== current) goTab(DEMO_TABS[next].key, true);
  };

  const onTry = (item: (typeof TRY_ITEMS)[number]) => {
    pendingFocus.current = item.key;
    dispatch({ type: 'tab', tab: item.tab, sub: item.sub, announce: true });
  };

  return (
    <div className="tm-landing-v4-stage">
      <div className="tm-landing-v4-stage-phone">
        <p className="tm-landing-v4-demo-tag">
          <Hand size={16} aria-hidden="true" />
          {playing ? '자동 시연 중 · 누르면 바로 멈춰요' : '체험용 예시 · 직접 눌러 보세요'}
        </p>
        <section ref={deviceRef} className="tm-landing-device tm-landing-v4-device" aria-labelledby="tm-landing-v4-demo-title">
          <h2 id="tm-landing-v4-demo-title" className="sr-only">
            팀밋 앱 체험(체험용 예시). 하단 탭으로 화면을 바꾸고, 신청·득점·대진·카드 뒤집기를 해 볼 수 있어요. 실제로 신청되거나 기록되지 않아요.
          </h2>
          <div className="tm-landing-device-screen">
            <div className="lpm-vp">
              <div className="lpm-status" aria-hidden="true">
                <span>9:41</span>
                <span className="lpm-status-icons"><i /><i /></span>
              </div>
              <div className="lpm-screens tm-landing-v4-screens" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                {DEMO_TABS.map(({ key }) => {
                  const on = state.tab === key;
                  return (
                    <div
                      key={key}
                      className="lpm-screen"
                      role="tabpanel"
                      id={`tm-landing-v4-panel-${key}`}
                      aria-labelledby={`tm-landing-v4-tab-${key}`}
                      data-on={on}
                      aria-hidden={!on}
                      inert={!on}
                    >
                      {key === 'home' ? <DemoHomeScreen state={state} dispatch={dispatch} /> : null}
                      {key === 'match' ? <DemoMatchScreen state={state} dispatch={dispatch} /> : null}
                      {key === 'cup' ? <DemoCupScreen state={state} dispatch={dispatch} /> : null}
                      {key === 'team' ? <DemoTeamScreen state={state} dispatch={dispatch} /> : null}
                      {key === 'my' ? <DemoMyScreen state={state} dispatch={dispatch} /> : null}
                    </div>
                  );
                })}
              </div>
              <div className="tm-landing-v4-toast" data-show={state.toast !== null} aria-hidden="true">
                <Check size={20} />
                <span>
                  {state.toast?.title ?? '신청했어요'}
                  <small>체험용 예시라 실제로 신청되지 않아요</small>
                </span>
              </div>
              <div className="lpm-tabbar" role="tablist" aria-label="앱 하단 탭" ref={tablistRef} onKeyDown={onTabKeyDown}>
                {DEMO_TABS.map(({ key, label }) => {
                  const Icon = TAB_ICONS[key];
                  const on = state.tab === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      className="lpm-tab tm-landing-v4-tab"
                      id={`tm-landing-v4-tab-${key}`}
                      aria-controls={`tm-landing-v4-panel-${key}`}
                      aria-selected={on}
                      tabIndex={on ? 0 : -1}
                      data-tab={key}
                      data-on={on}
                      onClick={() => goTab(key, false)}
                    >
                      <span className="lpm-tab-ic"><Icon size={24} aria-hidden="true" /></span>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
        <p className="sr-only" role="status">
          <span key={state.announce.seq}>{state.announce.text}</span>
        </p>
      </div>
      <div className="tm-landing-v4-stage-side">
        <Image
          className="tm-landing-v4-illust"
          src="/illustrations/landing-hero-640.webp"
          alt=""
          aria-hidden="true"
          width={640}
          height={640}
          sizes="(min-width: 768px) 176px, 80px"
          priority
        />
        <div className="tm-landing-v4-float" aria-hidden="true">
          <span className="tm-landing-v4-float-ic"><Zap size={16} /></span>
          <span>
            <b>{`FC 한강 ${state.score.a} : ${state.score.b} 성수 러너스`}</b>
            <small>결승 · 후반 진행 중</small>
          </span>
        </div>
        <div className="tm-landing-v4-try" role="group" aria-labelledby="tm-landing-v4-try-title">
          <p className="tm-landing-v4-try-title" id="tm-landing-v4-try-title">폰에서 해 볼 것</p>
          {TRY_ITEMS.map((item) => {
            const done = state.tried[item.key];
            return (
              <button key={item.key} type="button" className="tm-landing-v4-try-btn" data-done={done} onClick={() => onTry(item)}>
                {done ? <Check size={16} aria-hidden="true" /> : <span className="tm-landing-v4-try-dot" aria-hidden="true" />}
                {item.label}
                {done ? <span className="sr-only"> (해 봤어요)</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
