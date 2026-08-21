import Link from 'next/link';

type CompetitionType = 'tournament' | 'league';

interface CompetitionTypeSegmentProps {
  active: CompetitionType;
}

/**
 * 대회(토너먼트) / 리그 유형 세그먼트.
 *
 * **왜 매치 탭이 아니라 대회 탭인가**: 리그는 여러 주에 걸쳐 순위표가 쌓이고 시즌이 끝나면
 * 승격·강등이 일어나는 **경쟁 컨테이너**다 — 성격이 대회와 같은 축이다. 리그 대진이
 * 내부적으로 팀매치 레코드를 쓰는 것은 구현 디테일이지 사용자가 고르는 축이 아니다.
 * 매치 탭(개인/팀)은 "지금 참가할 경기를 찾는" 축이라 성격이 다르고, 실제로 거기에 세 번째
 * 항목을 넣었더니 `.tm-segment-row` 가 2열 그리드라 '리그' 가 두 번째 줄로 밀려 나갔다.
 *
 * 스타일은 MatchTypeSegment 와 같은 .tm-segment-row + .tm-review-tab(data-active) 패턴을
 * 그대로 쓴다 — 두 세그먼트가 서로 다른 탭에서 같은 역할을 하므로 모양이 같아야 한다.
 * 탭 위젯이 아니라 라우팅 링크 2개이므로 현재 선택은 aria-current 로 표현한다.
 */
export function CompetitionTypeSegment({ active }: CompetitionTypeSegmentProps) {
  return (
    <nav className="tm-segment-row tm-match-type-segment" aria-label="대회 유형">
      <Link
        href="/tournaments"
        className="tm-review-tab"
        data-active={active === 'tournament'}
        aria-current={active === 'tournament' ? 'page' : undefined}
      >
        대회
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
