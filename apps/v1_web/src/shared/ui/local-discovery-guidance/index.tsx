import Link from 'next/link';

type LocalDiscoveryKind = 'teams' | 'all' | 'tournament' | 'league';

const COPY: Record<LocalDiscoveryKind, { text: string; links: Array<{ href: string; label: string }> }> = {
  teams: {
    text: '동네에서 함께할 풋살·축구 팀을 찾고 있나요? 활동 지역과 종목, 모집 상태를 살펴보고 팀 상세에서 가입 조건을 확인하세요.',
    links: [
      { href: '/tournaments?kind=tournament', label: '스포츠 대회 보기' },
      { href: '/team-matches', label: '팀 매치 보기' },
    ],
  },
  all: {
    text: '동네 풋살 대회와 축구 대회, 정규 리그의 일정과 등록된 개최 장소, 참가 조건을 살펴보세요. 모집 중인 대회와 리그별 경기 결과를 확인할 수 있어요.',
    links: [
      { href: '/teams', label: '스포츠 팀 찾기' },
      { href: '/team-matches', label: '팀 매치 보기' },
    ],
  },
  tournament: {
    text: '동네 풋살 대회를 찾는다면 일정과 등록된 개최 장소, 참가비와 신청 조건을 확인하고 참가할 대회를 살펴보세요.',
    links: [
      { href: '/teams', label: '스포츠 팀 찾기' },
      { href: '/team-matches', label: '팀 매치 보기' },
    ],
  },
  league: {
    text: '풋살 리그와 축구 리그의 시즌 일정, 등록된 개최 장소와 참가 조건, 팀별 경기 결과를 살펴보세요.',
    links: [
      { href: '/teams', label: '스포츠 팀 찾기' },
      { href: '/team-matches', label: '팀 매치 보기' },
    ],
  },
};

export function LocalDiscoveryGuidance({ kind }: { readonly kind: LocalDiscoveryKind }) {
  const copy = COPY[kind];
  return (
    <p className="tm-text-caption mt-2 mb-3">
      {copy.text}{' '}
      {copy.links.map((link, index) => (
        <span key={link.href}>
          {index > 0 ? ' · ' : null}
          <Link className="tm-ps-text-link" href={link.href}>{link.label}</Link>
        </span>
      ))}
    </p>
  );
}
