type TeamGameKind = 'TOURNAMENT' | 'LEAGUE' | 'FRIENDLY';

const KIND_BADGE: Record<TeamGameKind, { label: string; className: string }> = {
  TOURNAMENT: { label: '대회', className: 'tm-badge-blue' },
  LEAGUE: { label: '리그', className: 'tm-badge-green' },
  FRIENDLY: { label: '친선', className: 'tm-badge-grey' },
};

/** 내 팀 경기의 종류 배지 — 홈 "다음 경기"와 팀 상세 "다가오는 경기"가 같은 색·문구를 쓴다. 색만으로 구분하지 않고 글자를 함께 둔다. */
export function TeamGameKindBadge({ kind }: { kind: TeamGameKind }) {
  const badge = KIND_BADGE[kind];
  return (
    <span className={`tm-badge tm-badge-sm ${badge.className}`} style={{ flex: '0 0 auto' }}>
      {badge.label}
    </span>
  );
}
