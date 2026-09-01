'use client';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

export interface SegmentedTabsItem {
  /** 안정된 식별자 — React key 이자 activeId 비교 대상이다. */
  id: string;
  label: ReactNode;
  /** 있으면 라우팅 링크(next/link)로, 없으면 로컬 상태 버튼으로 렌더한다.
      reviews-page/competition-kind-segment/match-type-segment 는 링크,
      bracket-page-client/team-records-content/my-team-contacts-client 는 버튼 —
      실제 소비처 10개가 두 형태로 섞여 있어 둘 다 지원한다. */
  href?: string;
  /** 버튼 항목에만 적용된다(link 항목에 disabled 를 주는 소비처는 아직 없다). */
  disabled?: boolean;
}

export type SegmentedTabsRole = 'tablist' | 'radiogroup';

export interface SegmentedTabsProps {
  items: SegmentedTabsItem[];
  /** 현재 선택된 item.id. 목록 어느 것과도 안 맞으면(로딩 중 등) thumb 을 숨긴다 —
      임의 항목 위에 걸쳐 두면 "그게 선택됐다"는 거짓 신호가 되기 때문이다. */
  activeId: string;
  onSelect?: (id: string) => void;
  ariaLabel: string;
  /** 컨테이너·항목의 ARIA 역할. 'tablist'(role="tab"+aria-selected)와
      'radiogroup'(role="radio"+aria-checked) — 실제 소비처가 화면 성격에 따라
      섞어 쓴다(보기 방식 전환은 tablist, 성별 선택은 radiogroup). 생략하면 역할을
      얹지 않는다 — competition-kind-segment/match-type-segment 처럼 역할 없는
      라우팅 링크 목록도 실존한다. */
  role?: SegmentedTabsRole;
  /** 'md'(기본, 44px 터치 타깃) | 'sm'(40px, 기존 .tm-auth-segment 결정 — 값을
      새로 만든 게 아니라 그대로 옮긴 것이다). */
  size?: 'md' | 'sm';
  className?: string;
}

/**
 * 트랙 배경 위에서 미끄러지는 thumb 하나로 활성 항목을 표시하는 세그먼트 컨트롤.
 *
 * ## 왜 필요한가
 * 이 저장소엔 같은 시각 계약(트랙 위에 뜨는 pill)을 세 화면이 각자 베껴 쓴 CSS가
 * 있었다(.tm-seg-tabs / .tm-review-tabs / .tm-auth-segmented). 셋 다 활성 표시를
 * **항목마다 배경을 켜고 끄는 방식**으로 구현해서 전환이 없었다(툭 켜졌다 꺼짐).
 * 이 컴포넌트는 하단탭 pill(.tm-bottom-nav-pill-slot, shell.tsx)과 같은 방식 —
 * **미끄러지는 단일 요소**로 통일한다.
 *
 * ## thumb 위치 계산 — 왜 "index * 100%" 가 아니라 "index * (100% + 8px)" 인가
 * 트랙은 gap:8px 인 grid 다. 하단탭 pill(gap 없는 트랙)의 `translateX(index*100%)`
 * 식을 그대로 베끼면 인덱스가 늘수록 gap 만큼씩 실제 위치보다 왼쪽으로 처진다 —
 * thumb 자기 폭(100%)만큼만 옮겨서는 항목 사이 8px 간격을 못 건너뛴다. 매 스텝마다
 * "항목 폭 + gap" 을 함께 이동해야 정확히 다음 항목 위에 선다(회귀 테스트:
 * segmented-tabs.test.tsx).
 *
 * ## 항목 수 — 왜 하드코딩하지 않는가
 * `--tm-segmented-count` CSS 변수 하나에 `items.length` 를 실어 globals.css 의
 * grid-template-columns 와 thumb 폭 calc() 양쪽이 같은 값을 보게 한다(하단탭이
 * `tabs.length` 로 열 수를 정하는 것과 같은 방식).
 *
 * ## 마이그레이션 범위 (2026-09-02)
 * competition-kind-segment/match-type-segment(링크)와 bracket-page-client/
 * team-records-content/my-team-contacts-client/reviews-page(버튼) 6개 소비처는
 * 이 컴포넌트로 옮겼다. `app/tournaments/[id]/results/results-page-client.tsx`
 * 의 "결과/영상 탭 전환"은 **아직 옮기지 않았다** — `.tm-segment-row` + 원본
 * `.tm-review-tab`(배경 on/off, transition 없음)을 그대로 쓴다. 소비처 인벤토리에서
 * 빠져 이번 통합에 걸리지 않았다(follow-up 필요, globals.css 의 `.tm-seg-tab`/
 * `.tm-review-tab` 을 아직 지우면 안 되는 이유이기도 하다).
 */
export function SegmentedTabs({ items, activeId, onSelect, ariaLabel, role, size = 'md', className }: SegmentedTabsProps) {
  const count = items.length;
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const itemRole = role === 'radiogroup' ? 'radio' : role === 'tablist' ? 'tab' : undefined;

  const trackClassName = ['tm-segmented-tabs', size === 'sm' ? 'tm-segmented-tabs-sm' : '', className]
    .filter(Boolean)
    .join(' ');

  // role 이 없으면(competition-kind-segment/match-type-segment 부류 — 위젯이 아니라
  // 페이지를 바꾸는 순수 라우팅 링크) <nav aria-label> 로 렌더한다. <div aria-label>
  // 은 role 없이는 접근성 트리에 이름이 노출되지 않는다 — role="tablist"/"radiogroup"
  // 일 때는 그 role 자체가 이름을 받을 수 있으므로 평범한 <div> 로 충분하다.
  const Container = role ? 'div' : 'nav';

  return (
    <Container
      className={trackClassName}
      role={role}
      aria-label={ariaLabel}
      style={{ '--tm-segmented-count': count } as CSSProperties}
    >
      {/* 장식용 활성 표시 — 선택 상태 자체는 각 항목의 aria-selected/aria-checked/
          data-active 가 계속 담당하므로 스크린리더에서는 숨긴다. */}
      <span
        className="tm-segmented-thumb"
        aria-hidden="true"
        style={{
          transform: activeIndex >= 0 ? `translateX(calc(${activeIndex} * (100% + 8px)))` : undefined,
          opacity: activeIndex >= 0 ? 1 : 0,
        }}
      />
      {items.map((item) => {
        const active = item.id === activeId;
        const stateProps =
          role === 'radiogroup' ? { 'aria-checked': active } : role === 'tablist' ? { 'aria-selected': active } : {};

        if (item.href) {
          return (
            <Link
              key={item.id}
              href={item.href}
              role={itemRole}
              className="tm-segmented-tab"
              data-active={active}
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect?.(item.id)}
              {...stateProps}
            >
              {item.label}
            </Link>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            role={itemRole}
            className="tm-segmented-tab"
            data-active={active}
            disabled={item.disabled}
            onClick={() => onSelect?.(item.id)}
            {...stateProps}
          >
            {item.label}
          </button>
        );
      })}
    </Container>
  );
}
