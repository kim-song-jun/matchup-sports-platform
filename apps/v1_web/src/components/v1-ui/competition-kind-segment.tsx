import Link from 'next/link';

/**
 * 통합 대회 목록의 유형 축. 서버의 `COMPETITION_LIST_SURFACE` 키와 **같은 이름**을 쓴다 —
 * 이 값이 그대로 `?kind=` 로 나가서 서버의 목록 표면을 고른다.
 */
export const COMPETITION_KINDS = ['all', 'tournament', 'league'] as const;
export type CompetitionKind = (typeof COMPETITION_KINDS)[number];

/**
 * 쿼리스트링에서 유형을 읽는다. 모르는 값·없음은 `fallback` 으로 떨어진다 —
 * 주소창에 아무거나 쳐도 목록이 비거나 깨지지 않아야 한다(서버도 같은 이유로 기본값을 둔다).
 */
export function parseCompetitionKind(raw: string | null, fallback: CompetitionKind): CompetitionKind {
  return COMPETITION_KINDS.includes(raw as CompetitionKind) ? (raw as CompetitionKind) : fallback;
}

const TABS: Array<{ kind: CompetitionKind; label: string }> = [
  { kind: 'all', label: '전체' },
  { kind: 'tournament', label: '정규 대회' },
  { kind: 'league', label: '정규 리그' },
];

interface CompetitionKindSegmentProps {
  active: CompetitionKind;
}

/**
 * 대회 유형(전체 / 정규 대회 / 정규 리그) 세그먼트.
 *
 * ## 자리 — "대회 목록" 제목 아래, 종목 칩 위 (2026-09-01 사용자 확정, B안)
 * 전에는 화면 맨 위(헤더 바로 아래)에 있었다. 그때는 이것이 **다른 페이지로 가는 이동
 * 메뉴**였기 때문이다. 통합 뒤에는 **같은 목록을 좁히는 필터**라서, 종목 칩과 한 덩어리로
 * 붙어 있어야 "제목 → 유형 → 종목 → 카드" 가 위에서 아래로 한 줄로 읽힌다. 사이에 프로모
 * 배너가 끼면 두 필터가 서로 다른 것처럼 갈라진다.
 *
 * 유형과 종목은 **축이 다르므로 형태도 다르다** — 유형은 세그먼트, 종목은 칩. 둘 다 "전체"
 * 를 갖는데 같은 모양이면 어느 전체인지 구분되지 않는다.
 *
 * ## 형태
 * `MatchTypeSegment` 와 같은 패턴(`.tm-segment-row` + `.tm-review-tab[data-active]`)을 쓴다.
 * 칸이 셋이라 `.tm-segment-row` 의 2칸 grid 를 `.tm-segment-row-3` 로 덮는다.
 * 터치 타깃 44px 는 `.tm-review-tab` 의 min-height 가 보장한다.
 *
 * 탭 위젯이 아니라 **라우팅 링크**이므로 `role="tab"` 이 아니라 `aria-current="page"` 로
 * 현재 위치를 알린다(선택 상태를 색으로만 알리지 않는다 — 프로젝트 접근성 규칙).
 */
export function CompetitionKindSegment({ active }: CompetitionKindSegmentProps) {
  return (
    <nav className="tm-segment-row tm-segment-row-3 tm-competition-kind-segment" aria-label="대회 유형">
      {TABS.map(({ kind, label }) => (
        <Link
          key={kind}
          href={`/tournaments?kind=${kind}`}
          className="tm-review-tab"
          data-active={active === kind}
          aria-current={active === kind ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
