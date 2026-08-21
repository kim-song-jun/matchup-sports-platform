import Link from 'next/link';

type MatchType = 'personal' | 'team' | 'league';

interface MatchTypeSegmentProps {
  active: MatchType;
}

/**
 * 매치(개인/팀/리그) 유형 세그먼트. 탭 위젯이 아니라 라우팅 링크 3개이므로 aria-current로
 * 현재 선택을 표현하고, 스타일은 기존 정의된 .tm-segment-row + .tm-review-tab(data-active)
 * 패턴을 재사용한다.
 *
 * '리그'가 여기 있는 이유: 공개 리그 목록(/league-matches)은 페이지만 있고 그리로 향하는
 * 인앱 링크가 저장소 전체에 0건이라 URL 을 직접 입력해야만 닿았다(2026-08-21 재감사).
 * 하단 탭은 홈·매치·대회·팀·마이 5개로 고정이고 6번째를 늘리는 건 전역 내비 변경이라
 * 범위가 크다. 리그는 개인·팀 매치와 같은 "경기를 찾는" 축이고 리그 대진 자체가 팀매치
 * 레코드이므로, 이미 그 축을 표현하는 이 세그먼트가 가장 가까운 자리다.
 *
 * .tm-match-type-segment: 이 세그먼트는 스크롤 영역 직속 자식이라 .tm-segment-row 기본값만으로는
 * 좌우 여백이 0이 되어 위(검색바)·아래(종목 칩·카드)의 페이지 리듬과 어긋난다. 좌우 인셋만
 * 담당하는 변형 클래스를 따로 둔다(.tm-segment-row는 이미 패딩이 있는 셸 안에서도 쓰이므로 공용
 * 클래스를 건드리지 않는다). 세로 여백도 같은 클래스에 모아 인라인 스타일 상수를 없앤다.
 * 터치 타깃 44px는 .tm-review-tab이 min-height로 이미 보장한다.
 */
export function MatchTypeSegment({ active }: MatchTypeSegmentProps) {
  return (
    <nav className="tm-segment-row tm-match-type-segment" aria-label="매치 유형">
      <Link
        href="/matches"
        className="tm-review-tab"
        data-active={active === 'personal'}
        aria-current={active === 'personal' ? 'page' : undefined}
      >
        개인
      </Link>
      <Link
        href="/team-matches"
        className="tm-review-tab"
        data-active={active === 'team'}
        aria-current={active === 'team' ? 'page' : undefined}
      >
        팀
      </Link>
      <Link
        href="/league-matches"
        className="tm-review-tab"
        data-active={active === 'league'}
        aria-current={active === 'league' ? 'page' : undefined}
      >
        리그
      </Link>
    </nav>
  );
}
