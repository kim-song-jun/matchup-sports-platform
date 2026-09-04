import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';

type MatchType = 'personal' | 'team';

interface MatchTypeSegmentProps {
  active: MatchType;
}

/**
 * 매치(개인/팀) 유형 세그먼트. 탭 위젯이 아니라 라우팅 링크 2개이므로 role 을 주지 않고
 * aria-current 로 현재 선택을 표현한다.
 *
 * ## 형태 — SegmentedTabs 공용 컴포넌트 (2026-09-02 이관, 세부탭 모션 통일 작업)
 * 예전엔 `.tm-segment-row` + `.tm-review-tab[data-active]` 를 직접 썼다(항목마다 배경을
 * 켜고 끄는 방식이라 전환이 없었다). `SegmentedTabs` 는 활성 표시를 미끄러지는 thumb
 * 하나로 통일한다 — 하단탭 pill 과 같은 토큰(`--duration-base`+`--ease-standard`).
 *
 * `.tm-match-type-segment`: 이 세그먼트는 스크롤 영역 직속 자식이라 트랙 기본값만으로는
 * 좌우 여백이 0이 되어 위(검색바)·아래(종목 칩·카드)의 페이지 리듬과 어긋난다. 좌우 인셋
 * (+ 데스크탑 리셋)을 담당하는 이 클래스를 `SegmentedTabs` 의 `className` 으로 그대로
 * 넘겨 트랙에 붙인다 — 값은 옮기기 전과 동일(globals.css). 터치 타깃 44px 는 `size` 를
 * 생략한 기본값(`'md'`)이 보장한다.
 */
export function MatchTypeSegment({ active }: MatchTypeSegmentProps) {
  return (
    <SegmentedTabs
      items={[
        { id: 'team', label: '팀', href: '/team-matches' },
        { id: 'personal', label: '개인', href: '/matches' },
      ]}
      activeId={active}
      ariaLabel="매치 유형"
      className="tm-match-type-segment"
    />
  );
}
