import Link from 'next/link';

type MatchType = 'personal' | 'team';

interface MatchTypeSegmentProps {
  active: MatchType;
}

/**
 * 매치(개인/팀) 유형 세그먼트. 탭 위젯이 아니라 라우팅 링크 2개이므로 aria-current로
 * 현재 선택을 표현하고, 스타일은 기존 정의된 .tm-segment-row + .tm-review-tab(data-active)
 * 패턴을 재사용한다.
 */
export function MatchTypeSegment({ active }: MatchTypeSegmentProps) {
  return (
    <nav className="tm-segment-row" aria-label="매치 유형" style={{ marginBottom: 12 }}>
      <Link
        href="/matches"
        className="tm-review-tab"
        data-active={active === 'personal'}
        aria-current={active === 'personal' ? 'page' : undefined}
        style={{ minHeight: 44 }}
      >
        개인
      </Link>
      <Link
        href="/team-matches"
        className="tm-review-tab"
        data-active={active === 'team'}
        aria-current={active === 'team' ? 'page' : undefined}
        style={{ minHeight: 44 }}
      >
        팀
      </Link>
    </nav>
  );
}
