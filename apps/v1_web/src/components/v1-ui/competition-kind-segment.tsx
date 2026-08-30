import Link from 'next/link';

type CompetitionKind = 'tournament' | 'league';

interface CompetitionKindSegmentProps {
  active: CompetitionKind;
}

/**
 * 대회 유형(정규 대회 / 정규 리그) 세그먼트.
 *
 * 하단 탭에서 '리그'가 빠지면서 **대회 목록에서 리그로 건너갈 유일한 수단**이 된다.
 * 리그로 들어오는 길이 이것뿐인 것은 아니다(홈의 리그 위젯 등도 `/league-matches` 로
 * 보낸다) — 다만 **대회를 보고 있던 사용자**에게는 이 세그먼트가 사라지면 리그가 없는
 * 것처럼 보인다. 탭만 줄이고 이것을 안 두면 그 경로가 끊긴다.
 *
 * 시각 형태를 새로 만들지 않고 `MatchTypeSegment` 와 **같은 패턴**(`.tm-segment-row` +
 * `.tm-review-tab[data-active]`)을 그대로 쓴다 — 매치 탭에 이미 같은 성격의 세그먼트가
 * 있는데 대회 탭만 다른 시각 언어를 쓰면 "같은 역할인데 다르게 보이는" 것이 된다.
 * 터치 타깃 44px 는 `.tm-review-tab` 의 min-height 가 보장한다.
 *
 * 탭 위젯이 아니라 **라우팅 링크 둘**이므로 `role="tab"` 이 아니라 `aria-current="page"`
 * 로 현재 위치를 알린다(선택 상태를 색으로만 알리지 않는다 — 프로젝트 접근성 규칙).
 */
export function CompetitionKindSegment({ active }: CompetitionKindSegmentProps) {
  return (
    <nav className="tm-segment-row tm-match-type-segment" aria-label="대회 유형">
      <Link
        href="/tournaments"
        className="tm-review-tab"
        data-active={active === 'tournament'}
        aria-current={active === 'tournament' ? 'page' : undefined}
      >
        정규 대회
      </Link>
      <Link
        href="/league-matches"
        className="tm-review-tab"
        data-active={active === 'league'}
        aria-current={active === 'league' ? 'page' : undefined}
      >
        정규 리그
      </Link>
    </nav>
  );
}
