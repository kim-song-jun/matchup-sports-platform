'use client';

import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { BarChart3, Bell, Check, List, Users, Zap } from 'lucide-react';
import { HomeIcon, MatchIcon, MyIcon, TeamsIcon, TrophyIcon } from '@/components/v1-ui/icons';
import type { LandingLiveTeamMatch } from '@/lib/landing/landing-v4-data';
import {
  STAGE_SCENE_COUNT,
  railFill,
  sceneFromProgress,
  sceneScrollOffset,
  stagePhoneSize,
  stageProgress,
} from '@/lib/landing/landing-v4-motion';
import { DEMO_TABS } from './landing-v4-demo-state';
import { useLandingV4MotionOn, useScrollFrame } from './landing-v4-motion-hooks';
import { EXAMPLE_TEAM_MATCHES, SceneApply, SceneFind, SceneLive, SceneRecord, SceneRoster } from './landing-v4-stage-scenes';

/** landing.css .tm-landing-nav-inner 높이와 같아야 한다 — 고정 영역에서 내비 아래만 폰 높이로 쓴다. */
const NAV_HEIGHT = 60;
/** 장면별 앱 하단 탭(DEMO_TABS 순서: 홈·매치·대회·팀·마이) */
const TAB_OF_SCENE = [1, 1, 3, 2, 4] as const;
const TAB_ICONS = [HomeIcon, MatchIcon, TrophyIcon, TeamsIcon, MyIcon] as const;

type Scene = {
  key: string;
  label: string;
  title: readonly [string, string];
  body: string;
  points: readonly [string, string];
  badge: { icon: ReactNode; title: string; sub: string };
  zoom?: boolean;
};

function buildScenes(countText: string | null, sportsText: string | null): Scene[] {
  return [
    {
      key: 'find', label: '찾기', title: ['근처 팀 매치를', '한눈에 골라요'],
      body: countText ? `지금 올라온 팀 매치(${countText})를 종목·지역·수준으로 좁혀 봐요.` : '올라온 팀 매치를 종목·지역·수준으로 좁혀 봐요.',
      points: ['일시·장소·방식이 카드 한 장에', '입문부터 리그까지 수준별로'],
      badge: { icon: <List size={18} />, title: countText ? `팀 매치 ${countText}` : '팀 매치 모집 중', sub: sportsText ?? '종목별로 골라 봐요' },
    },
    {
      key: 'apply', label: '신청', title: ['버튼 한 번이면', '신청이 끝나요'],
      body: '단톡방에서 인원 세지 않아도 돼요. 확정되면 알림으로 알려드려요.',
      points: ['신청 현황을 실시간으로 확인', '확정·변경은 알림으로 바로'],
      badge: { icon: <Bell size={18} />, title: '확정되면 알림', sub: '단톡방 확인은 이제 그만' },
    },
    {
      key: 'roster', label: '명단', title: ['등번호와 이름으로', '명단을 채워요'],
      body: '출전자를 한 줄씩 넣으면 상대 팀과 운영진이 같은 명단을 봐요.',
      points: ['등번호 + 이름, 그게 전부예요', '현장 종이 명단이 필요 없어요'],
      badge: { icon: <Users size={18} />, title: '출전 5명 확정', sub: '상대 팀도 같은 명단을 봐요' },
    },
    {
      key: 'live', label: '라이브', title: ['경기 중에는', '스코어가 바로 올라가요'], zoom: true,
      body: '골이 들어가면 바로 반영돼요. 링크만 있으면 누구나 관전할 수 있어요.',
      points: ['득점을 등번호로 기록', '전반·후반 진행 상황 표시'],
      badge: { icon: <Zap size={18} />, title: '링크로 실시간 관전', sub: '가입 없이도 볼 수 있어요' },
    },
    {
      key: 'record', label: '기록', title: ['끝나면 내 기록이', '카드로 남아요'], zoom: true,
      body: '경기·골·도움이 자동으로 쌓여요. 팀 전적과 대회 기록도 함께요.',
      points: ['공식 경기 기록 자동 누적', '링크 하나로 카드 공유'],
      badge: { icon: <BarChart3 size={18} />, title: '기록이 자동으로 쌓여요', sub: '경기 · 골 · 도움' },
    },
  ];
}

function Device({ tab, style, children }: { tab: number; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className="tm-landing-device tm-landing-v4-day-device" style={style}>
      <div className="tm-landing-device-screen">
        <div className="lpm-vp">
          <div className="lpm-status"><span>9:41</span><span className="lpm-status-icons"><i /><i /></span></div>
          <div className="lpm-screens">{children}</div>
          <div className="lpm-tabbar tm-landing-v4-day-tabs" style={{ '--tm-landing-v4-tab': tab } as CSSProperties}>
            {DEMO_TABS.map((t, k) => {
              const Icon = TAB_ICONS[k];
              return (
                <span key={t.key} className="lpm-tab" data-on={k === tab}>
                  <span className="lpm-tab-ic"><Icon size={24} /></span>
                  {t.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

type StageProps = { matches: readonly LandingLiveTeamMatch[]; countText: string | null; sportsText: string | null };

/**
 * 고정 무대 — 모션이 켜지면 폰이 고정되고 스크롤 진행도로 장면 5개가 바뀐다.
 * 서버 HTML·모션 꺼짐은 장면 5개를 세로로 나열한 최종 상태(data-mode="stack")다.
 */
export function LandingV4Stage({ matches, countText, sportsText }: StageProps) {
  const motionOn = useLandingV4MotionOn();
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLOListElement>(null);
  const [scene, setScene] = useState(0);
  const [armed, setArmed] = useState(false);
  const [phone, setPhone] = useState<{ dw: number; dh: number } | null>(null);

  const example = matches.length === 0;
  const cards = example ? EXAMPLE_TEAM_MATCHES : matches;
  const scenes = buildScenes(countText, sportsText);

  const scrollRange = (section: HTMLElement, sticky: HTMLElement) => section.offsetHeight - sticky.offsetHeight;

  useScrollFrame(motionOn, () => {
    const section = sectionRef.current;
    const sticky = stickyRef.current;
    if (!section || !sticky) return;
    const top = section.getBoundingClientRect().top;
    const progress = stageProgress(top, scrollRange(section, sticky));
    // 무대에 닿기 전엔 첫 장면 연출을 아껴 두었다가 닿는 순간 재생한다
    if (!armed && top <= window.innerHeight * 0.4) setArmed(true);
    const next = sceneFromProgress(progress);
    setScene((prev) => (prev === next ? prev : next));
    railRef.current?.querySelectorAll<HTMLElement>('[data-rail-bar]').forEach((bar, k) => {
      bar.style.setProperty('--tm-landing-v4-f', railFill(progress, k).toFixed(4));
    });
    const size = stagePhoneSize(window.innerWidth, sticky.clientHeight - NAV_HEIGHT);
    setPhone((prev) => (prev && prev.dw === size.dw && prev.dh === size.dh ? prev : size));
  });

  const goScene = (index: number) => {
    const section = sectionRef.current;
    const sticky = stickyRef.current;
    if (!section || !sticky) return;
    const top = window.scrollY + section.getBoundingClientRect().top + sceneScrollOffset(index, scrollRange(section, sticky));
    window.scrollTo({ top: Math.round(top), behavior: 'smooth' });
  };

  const stateOf = (i: number) => (i === scene ? 'active' : i < scene ? 'past' : 'next');
  const screen = (i: number) =>
    i === 0 ? <SceneFind matches={cards} countText={countText} example={example} />
    : i === 1 ? <SceneApply match={cards[0]} example={example} />
    : i === 2 ? <SceneRoster />
    : i === 3 ? <SceneLive />
    : <SceneRecord />;
  const phoneStyle = phone ? ({ '--dw': phone.dw, '--dh': phone.dh } as CSSProperties) : undefined;

  return (
    <section
      ref={sectionRef}
      id="stage"
      className="tm-landing-v4-day"
      aria-labelledby="stage-heading"
      data-mode={motionOn ? 'stage' : 'stack'}
      data-armed={armed}
      style={{ '--tm-landing-v4-scenes': STAGE_SCENE_COUNT } as CSSProperties}
    >
      <div className="tm-landing-section-inner tm-landing-v4-day-intro" aria-hidden="true">
        <p className="tm-landing-section-kw">이렇게 흘러가요</p>
        <p className="tm-landing-section-title">내리면 경기 하루가<br />지나가요</p>
      </div>
      <div ref={stickyRef} className="tm-landing-v4-day-sticky">
        <div className="tm-landing-section-inner tm-landing-v4-day-grid">
          <div className="tm-landing-v4-day-copy">
            <div className="tm-landing-v4-day-head">
              <p className="tm-landing-section-kw">이렇게 흘러가요</p>
              <h2 id="stage-heading" className="tm-landing-section-title">내리면 경기 하루가<br />지나가요</h2>
            </div>
            {motionOn ? (
              <ol className="tm-landing-v4-rail" ref={railRef} aria-label="장면 이동">
                {scenes.map((s, i) => (
                  <li key={s.key}>
                    <button type="button" className="tm-landing-v4-rail-btn" aria-current={i === scene ? 'step' : undefined} onClick={() => goScene(i)}>
                      <span className="tm-landing-v4-rail-lab"><b>{`0${i + 1}`}</b>{s.label}</span>
                      <span className="tm-landing-v4-rail-bar" aria-hidden="true"><i data-rail-bar /></span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
            <ol className="tm-landing-v4-scenes">
              {scenes.map((s, i) => (
                <li key={s.key} className="tm-landing-v4-scene" data-state={stateOf(i)}>
                  <div className="tm-landing-v4-scene-copy">
                    <span className="tm-landing-v4-scene-kicker">{`0${i + 1} · ${s.label}`}</span>
                    <h3>{s.title[0]}<br />{s.title[1]}</h3>
                    <p>{s.body}</p>
                    <ul className="tm-landing-v4-scene-points">
                      {s.points.map((point) => (
                        <li key={point}><Check size={14} aria-hidden="true" />{point}</li>
                      ))}
                    </ul>
                  </div>
                  {motionOn ? null : (
                    <div className="tm-landing-v4-scene-phone" aria-hidden="true">
                      <Device tab={TAB_OF_SCENE[i]}>
                        <div className="tm-landing-v4-scr" data-state="active">{screen(i)}</div>
                      </Device>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
          {motionOn ? (
            <div className="tm-landing-v4-day-phone" aria-hidden="true" style={phone ? ({ '--tm-landing-v4-dw': phone.dw } as CSSProperties) : undefined}>
              <span className="tm-landing-v4-day-glow" />
              <Device tab={TAB_OF_SCENE[scene]} style={phoneStyle}>
                {scenes.map((s, i) => (
                  <div key={s.key} className="tm-landing-v4-scr" data-state={stateOf(i)} data-zoom={s.zoom ? 'true' : undefined}>
                    {screen(i)}
                  </div>
                ))}
              </Device>
              <div className="tm-landing-v4-day-badges">
                {scenes.map((s, i) => (
                  <div key={s.key} className="tm-landing-v4-sbadge" data-state={stateOf(i)}>
                    <span className="tm-landing-v4-sbadge-ic">{s.badge.icon}</span>
                    <span><b>{s.badge.title}</b><small>{s.badge.sub}</small></span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
