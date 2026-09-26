import type { Metadata } from 'next';
import type { CompetitionKind } from '@/components/v1-ui/competition-kind-segment';
import { buildPublicMetadata } from '@/lib/seo';

const LIST_COPY = {
  default: {
    title: '스포츠 대회',
    description: '모집 중인 스포츠 대회를 찾고 일정, 참가 조건, 경기 결과를 한곳에서 확인하세요.',
  },
  league: {
    title: '정규 리그',
    description: '시즌 단위로 운영되는 스포츠 정규 리그를 찾고 참가 신청부터 경기 일정과 결과까지 한곳에서 확인하세요.',
  },
} as const;

export function tournamentListTitle(kind: CompetitionKind): string {
  return kind === 'league' ? LIST_COPY.league.title : LIST_COPY.default.title;
}

/** canonical 은 유형과 무관하게 `/tournaments` 하나다 — `?kind=` 는 같은 목록의 보기 전환이다. */
export function buildTournamentListMetadata(kind: CompetitionKind): Metadata {
  const copy = kind === 'league' ? LIST_COPY.league : LIST_COPY.default;
  return buildPublicMetadata({ ...copy, path: '/tournaments' });
}
