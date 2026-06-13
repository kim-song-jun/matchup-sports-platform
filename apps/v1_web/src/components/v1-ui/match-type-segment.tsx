import Link from 'next/link';

type MatchType = 'personal' | 'team';

interface MatchTypeSegmentProps {
  active: MatchType;
}

export function MatchTypeSegment({ active }: MatchTypeSegmentProps) {
  return (
    <div
      className="tm-segment"
      role="tablist"
      aria-label="매치 유형 선택"
    >
      <Link
        href="/matches"
        role="tab"
        aria-selected={active === 'personal'}
        aria-current={active === 'personal' ? 'page' : undefined}
        aria-label="개인 매치"
        className={`tm-segment-pill${active === 'personal' ? ' tm-segment-pill-active' : ''}`}
        style={{ minHeight: '44px', minWidth: '44px' }}
      >
        개인
      </Link>
      <Link
        href="/team-matches"
        role="tab"
        aria-selected={active === 'team'}
        aria-current={active === 'team' ? 'page' : undefined}
        aria-label="팀 매치"
        className={`tm-segment-pill${active === 'team' ? ' tm-segment-pill-active' : ''}`}
        style={{ minHeight: '44px', minWidth: '44px' }}
      >
        팀
      </Link>
    </div>
  );
}
