'use client';

/**
 * 팀 상세 개편(2026-11-26) 조각들.
 *
 * - `TeamDetailHeader`: 로고·팀명·칩·숫자 3칸. 모바일은 본문 맨 위, 데스크톱은 왼쪽 본문 열 맨 위.
 * - `TeamDetailCompactBar`: 모바일에서 헤더가 상단바 뒤로 지나가면 상단바 바로 아래에 한 줄로 남는다.
 *   헤더 자체를 sticky 로 줄이면 본문 높이가 바뀌어 스크롤 위치가 튄다 — 헤더는 그대로 흐르게 두고
 *   별도의 고정 줄을 띄운다.
 * - `TeamIntroSection` · `TeamJoinConditions` · `TeamActivitySection`: 예전 "팀 기본 정보" 카드를
 *   읽는 순서대로 나눈 것. 헤더에 이미 있는 팀명·종목·지역은 다시 적지 않는다.
 * - `TeamParticipationSection`: 매치·리그·대회를 밑줄 탭 하나로 묶는다.
 */

import Link from 'next/link';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { CalendarDays, MapPin } from 'lucide-react';
import { readTopbarHeight } from '@/components/v1-ui/focus-below-topbar';
import { ShareIcon } from '@/components/v1-ui/icons';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { optimizedCssUrl } from '@/lib/assets';
import { getSportAccent } from '@/lib/v1-sport-accent';

export type TeamDetailStat = {
  key: string;
  value: ReactNode;
  label: string;
  /** 스크린리더용 한 문장 — 숫자와 단위가 시각적으로 나뉘어 있어 그대로 읽히면 어색하다. */
  ariaLabel: string;
  href?: string;
};

type HeaderTeam = {
  id: string;
  name: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  sport: string;
  region: string;
  /** 커버 사진이 없을 때 배너 색을 고르는 종목 코드. 모르는 값이면 회색. */
  sportCode?: string;
};

// 커버 배너 요청 폭. 데스크톱 본문 열(최대 약 760px)도 600 기준(2배 → 1200 단계)이면 장식용 배너로 충분하고,
// 760 으로 잡으면 2배가 1920 단계로 넘어가 모바일까지 큰 사진을 받는다 — 예전 상세 히어로와 같은 값이다.
const TEAM_COVER_BANNER_WIDTH = 600;

/** 종목 색 배너 — 종목 아이콘 배지와 같은 135° 그라디언트. 종목을 모르면 회색 계열(FALLBACK)이다. */
export function sportBannerGradient(sportCode: string | undefined): string {
  const accent = getSportAccent(sportCode ?? '');
  return `linear-gradient(135deg, ${accent.dot} 0%, ${accent.gradientTo} 100%)`;
}

export function TeamDetailHeader({
  team,
  chips,
  stats,
  onShare,
  nameAs = 'div',
  headerRef,
  footnote,
  badge,
}: {
  team: HeaderTeam;
  chips: string[];
  stats: TeamDetailStat[];
  onShare: () => void;
  /** 숫자 칸 아래 한 줄 — 받은 후기에서 가장 많이 꼽힌 태그. */
  footnote?: ReactNode;
  /** 조건 칩 맨 앞의 강조 칩 — 만든 지 3개월 미만이면 '신생팀'. */
  badge?: string;
  /** 데스크톱은 h2, 모바일은 sr-only h1 과 겹치지 않게 aria-hidden div. */
  nameAs?: 'h2' | 'div';
  headerRef?: RefObject<HTMLElement | null>;
}) {
  const Name = nameAs;
  return (
    <section ref={headerRef} className="tm-team-profile" aria-label="팀 정보">
      {team.coverImageUrl ? (
        <div
          className="tm-team-profile-cover"
          aria-hidden="true"
          style={{ backgroundImage: optimizedCssUrl(team.coverImageUrl, TEAM_COVER_BANNER_WIDTH) }}
        />
      ) : (
        // 커버 사진이 없으면 종목 색 배너 — 목록·대회 카드의 종목 아이콘과 같은 그라디언트(dot → gradientTo).
        <div className="tm-team-profile-banner" aria-hidden="true" style={{ backgroundImage: sportBannerGradient(team.sportCode) }} />
      )}
      <div className="tm-team-profile-main">
        <div className="tm-team-profile-identity">
          {/* 로고는 배너에 반쯤 걸친다(흰 테두리로 배너와 떼어 낸다). */}
          <span className="tm-team-profile-logo">
            <TeamAvatar teamId={team.id} name={team.name} logoUrl={team.logoUrl} size="xl" />
          </span>
          <div className="tm-team-profile-text">
            <Name className="tm-team-profile-name" aria-hidden={nameAs === 'div' ? true : undefined}>{team.name}</Name>
            <div className="tm-text-caption tm-team-profile-meta">{[team.sport, team.region].filter(Boolean).join(' · ')}</div>
          </div>
          <button className="tm-btn tm-btn-icon tm-btn-ghost tm-team-profile-share" type="button" aria-label="공유" onClick={onShare}>
            <ShareIcon size={20} />
          </button>
        </div>
        {chips.length || badge ? (
          <ul className="tm-team-profile-chips" aria-label="팀 조건">
            {/* 모양은 앱 공용 배지(.tm-badge) — 목록 카드·다른 상세와 같은 배지. tm-team-profile-chip* 는 표시용 이름표다. */}
            {badge ? <li className="tm-badge tm-badge-blue tm-team-profile-chip tm-team-profile-chip-badge">{badge}</li> : null}
            {chips.map((chip) => (
              <li key={chip} className="tm-badge tm-badge-grey tm-team-profile-chip">{chip}</li>
            ))}
          </ul>
        ) : null}
      </div>
      <ul className="tm-team-profile-stats" aria-label="팀 활동 요약">
        {stats.map((stat) => {
          const body = (
            <>
              <span className="tm-team-profile-stat-value" aria-hidden="true">{stat.value}</span>
              <span className="tm-team-profile-stat-label" aria-hidden="true">{stat.label}</span>
              <span className="sr-only">{stat.ariaLabel}</span>
            </>
          );
          return (
            <li key={stat.key}>
              {stat.href ? (
                <Link className="tm-team-profile-stat tm-pressable" href={stat.href}>{body}</Link>
              ) : (
                <div className="tm-team-profile-stat">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {footnote ? <p className="tm-text-caption tm-team-profile-footnote">{footnote}</p> : null}
    </section>
  );
}

/**
 * 모바일 축소 헤더. 위 헤더가 상단바 아래로 완전히 지나가면 나타난다. 같은 정보를 한 번 더 읽지 않도록
 * 스크린리더에서는 숨긴다(헤더가 이미 같은 내용을 담고 있다).
 */
export function TeamDetailCompactBar({
  targetRef,
  team,
  summary,
}: {
  targetRef: RefObject<HTMLElement | null>;
  team: Pick<HeaderTeam, 'id' | 'name' | 'logoUrl'>;
  summary: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    // 상단바에 가려진 부분은 보이지 않는 것으로 친다 — rootMargin 은 CSS 변수를 못 읽어 px 로 넘긴다.
    const topbar = readTopbarHeight();
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < topbar),
      { rootMargin: `-${topbar}px 0px 0px 0px`, threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetRef]);
  return (
    <div className="tm-team-compact-bar tm-hide-desktop" data-visible={visible ? 'true' : 'false'} aria-hidden="true">
      <TeamAvatar teamId={team.id} name={team.name} logoUrl={team.logoUrl} size="md" />
      <div className="tm-team-compact-bar-text">
        <div className="tm-team-compact-bar-name">{team.name}</div>
        <div className="tm-text-caption tm-team-compact-bar-summary">{summary}</div>
      </div>
    </div>
  );
}

/** 팀 소개. `clamp` 면 4줄까지만 보이고, 넘칠 때만 더보기를 둔다(모바일). 데스크톱은 전부 보인다. */
export function TeamIntroSection({ text, clamp = false }: { text: string; clamp?: boolean }) {
  const bodyRef = useRef<HTMLParagraphElement>(null);
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const trimmed = text.trim();
  useEffect(() => {
    const body = bodyRef.current;
    if (!clamp || !body) return;
    setOverflowing(body.scrollHeight > body.clientHeight + 1);
  }, [clamp, trimmed]);
  return (
    <section className="tm-team-section">
      <SectionTitle title="팀 소개" />
      {trimmed ? (
        <>
          <p
            ref={bodyRef}
            id={bodyId}
            className={`tm-text-body tm-team-intro-text${clamp && !open ? ' tm-team-intro-text-clamped' : ''}`}
          >
            {trimmed}
          </p>
          {clamp && (overflowing || open) ? (
            <button
              type="button"
              className="tm-team-intro-more"
              aria-expanded={open}
              aria-controls={bodyId}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? '접기' : '더보기'}
            </button>
          ) : null}
        </>
      ) : (
        <p className="tm-text-caption">아직 팀 소개가 없어요.</p>
      )}
    </section>
  );
}

export type TeamConditionRow = { label: string; value: string; muted?: boolean };

/** 가입 조건 — 라벨 왼쪽, 값 오른쪽. 데스크톱에서는 오른쪽 고정 카드 안에 들어간다(`bare`). */
export function TeamJoinConditions({ rows, bare = false }: { rows: TeamConditionRow[]; bare?: boolean }) {
  const list = (
    <dl className="tm-team-kv">
      {rows.map((row) => (
        <div key={row.label} className="tm-team-kv-row">
          <dt>{row.label}</dt>
          <dd className={row.muted ? 'tm-team-kv-muted' : undefined}>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
  if (bare) {
    return (
      <div>
        <div className="tm-text-body-lg tm-team-side-title">가입 조건</div>
        {list}
      </div>
    );
  }
  return (
    <section className="tm-team-section">
      <SectionTitle title="가입 조건" />
      {list}
    </section>
  );
}

export type TeamActivityRows = {
  /** 요일 · 시간대 · 빈도. 비어 있으면 '활동 일정 미정'. */
  schedule: string;
  /** 활동 유형(정기 모임, 친선 경기 …). */
  types: string;
  region: string;
  /** 팀이 적은 활동 지역·메모. */
  area: string;
};

/** 활동 정보 — 아이콘 두 줄(언제 / 어디서). 모바일·데스크톱 같은 모양. */
export function TeamActivitySection({ rows }: { rows: TeamActivityRows }) {
  return (
    <section className="tm-team-section">
      <SectionTitle title="활동 정보" />
      <ul className="tm-team-activity">
        <li className="tm-team-activity-row">
          <CalendarDays size={20} aria-hidden="true" className="tm-team-activity-icon" />
          <div>
            <div className={`tm-text-label${rows.schedule ? '' : ' tm-team-kv-muted'}`}>{rows.schedule || '활동 일정 미정'}</div>
            {rows.types ? <div className="tm-text-caption tm-team-activity-sub">{rows.types}</div> : null}
          </div>
        </li>
        <li className="tm-team-activity-row">
          <MapPin size={20} aria-hidden="true" className="tm-team-activity-icon" />
          <div>
            <div className="tm-text-label">{rows.region || '지역 미정'}</div>
            {rows.area ? <div className="tm-text-caption tm-team-activity-sub">{rows.area}</div> : null}
          </div>
        </li>
      </ul>
    </section>
  );
}

export type TeamParticipationItem = {
  key: string;
  href: string;
  title: string;
  sub: string;
  status?: { label: string; badgeClass: string };
};

export type TeamParticipationTab = {
  key: 'match' | 'league' | 'tournament';
  label: string;
  count: number;
  state: 'loading' | 'error' | 'ready';
  content: ReactNode;
  /** 목록 아래 "전체 보기" 같은 링크. */
  footer?: ReactNode;
};

/** 참가 중인 경기 탭은 처음에 이만큼만 보이고 나머지는 [자세히 보기]로 펼친다(2026-11-27 사용자 확정). */
export const PARTICIPATION_PREVIEW_LIMIT = 5;

/**
 * 목록을 앞 5개로 자르고, 넘치면 [자세히 보기 (+N)] / [접기] 버튼을 준다. 공개 목록(TeamParticipationList)과
 * 팀원용 신청 목록(TeamCompetitionEntryList)이 같이 쓴다.
 */
export function useParticipationPreview<T>(items: T[]) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const hiddenCount = items.length - PARTICIPATION_PREVIEW_LIMIT;
  const shown = expanded || hiddenCount <= 0 ? items : items.slice(0, PARTICIPATION_PREVIEW_LIMIT);
  const toggle =
    hiddenCount > 0 ? (
      <button
        type="button"
        className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block tm-team-participation-more"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? '접기' : `자세히 보기 (+${hiddenCount})`}
      </button>
    ) : null;
  return { listId, shown, toggle };
}

/** 링크 카드 목록 — 매치·공개 리그·공개 대회가 같은 모양을 쓴다. */
export function TeamParticipationList({ items }: { items: TeamParticipationItem[] }) {
  const { listId, shown, toggle } = useParticipationPreview(items);
  return (
    <>
      <ul id={listId} className="tm-team-participation-list">
        {shown.map((item) => (
          <li key={item.key}>
            <Link className="tm-list-row tm-pressable tm-team-participation-row" href={item.href}>
              <span className="tm-team-participation-text">
                <span className="tm-text-label tm-team-participation-title">{item.title}</span>
                {item.sub ? <span className="tm-text-caption">{item.sub}</span> : null}
              </span>
              {item.status ? (
                // 색만으로 상태를 말하지 않는다 — 배지는 항상 글자를 담는다.
                <span className={`tm-badge ${item.status.badgeClass} tm-team-participation-badge`}>{item.status.label}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      {toggle}
    </>
  );
}

/** 비어 있는 탭 안에 보이는 안내 — 탭은 항상 셋 다 보이므로 탭마다 따로 말한다. */
const PARTICIPATION_EMPTY: Record<TeamParticipationTab['key'], { title: string; sub: string }> = {
  match: { title: '모집 중인 매치가 없어요', sub: '이 팀이 매치를 열면 여기서 볼 수 있어요.' },
  league: { title: '참가 중인 리그가 없어요', sub: '이 팀이 리그에 참가하면 여기서 볼 수 있어요.' },
  tournament: { title: '참가 중인 대회가 없어요', sub: '이 팀이 대회에 참가하면 여기서 볼 수 있어요.' },
};

/**
 * 참가 중인 경기 — 매치·리그·대회 밑줄 탭. 탭은 비어 있어도 항상 셋 다 보인다(2026-11-27 사용자 확정) —
 * 빈 탭은 탭 안에 안내를 보인다. 처음에는 내용이 있는 첫 탭을, 셋 다 비었으면 첫 탭(매치)을 연다.
 * 탭은 좌우 화살표로도 옮길 수 있다.
 */
export function TeamParticipationSection({ tabs }: { tabs: TeamParticipationTab[] }) {
  const baseId = useId();
  const [selected, setSelected] = useState<TeamParticipationTab['key'] | null>(null);
  const active = tabs.find((tab) => tab.key === selected) ?? tabs.find((tab) => tab.state === 'ready' && tab.count > 0) ?? tabs[0];
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.key === active?.key);
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    setSelected(next.key);
    tabRefs.current.get(next.key)?.focus();
  };

  return (
    <section className="tm-team-section">
      <SectionTitle title="참가 중인 경기" />
      {active ? (
        <>
          <div className="tm-team-tabs" role="tablist" aria-label="참가 중인 경기 종류">
            {tabs.map((tab) => {
              const isActive = tab.key === active.key;
              return (
                <button
                  key={tab.key}
                  ref={(node) => {
                    if (node) tabRefs.current.set(tab.key, node);
                    else tabRefs.current.delete(tab.key);
                  }}
                  id={`${baseId}-tab-${tab.key}`}
                  type="button"
                  role="tab"
                  className="tm-team-tab"
                  aria-selected={isActive}
                  aria-controls={`${baseId}-panel-${tab.key}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setSelected(tab.key)}
                  onKeyDown={onKeyDown}
                >
                  {tab.label}
                  {tab.state === 'ready' ? <span className="tm-team-tab-count">{tab.count}</span> : null}
                </button>
              );
            })}
          </div>
          {/* key — 탭을 바꾸면 패널을 새로 그려 [자세히 보기]로 펼친 상태가 다른 탭으로 옮겨 가지 않게 한다. */}
          <div key={active.key} id={`${baseId}-panel-${active.key}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active.key}`}>
            {active.state === 'ready' && active.count === 0 ? (
              // grey50 지면 위 캡션 — 다른 틴트 카드처럼 tm-on-tint 로 보조 글자 대비를 올린다.
              <div className="tm-card tm-on-tint tm-team-participation-empty">
                <div className="tm-text-label">{PARTICIPATION_EMPTY[active.key].title}</div>
                <div className="tm-text-caption">{PARTICIPATION_EMPTY[active.key].sub}</div>
              </div>
            ) : (
              <>
                {active.content}
                {active.footer}
              </>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

/** 탭 안의 불러오는 중 자리. */
export function TeamParticipationSkeleton({ label }: { label: string }) {
  return (
    <div className="tm-team-participation-list" aria-busy="true" aria-label={label}>
      {[0, 1].map((i) => (
        <div key={i} className="tm-review-skeleton tm-team-participation-skeleton" aria-hidden="true" />
      ))}
    </div>
  );
}
