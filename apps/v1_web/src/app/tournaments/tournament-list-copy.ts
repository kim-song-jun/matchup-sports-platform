import type { CompetitionKind } from '@/components/v1-ui/competition-kind-segment';

export const TOURNAMENT_LIST_COPY = {
  all: {
    title: '풋살·축구 등 스포츠 대회·리그 일정과 참가 신청',
    description: '동네 풋살 대회와 축구 대회, 스포츠 정규 리그의 일정·개최 장소·참가 조건을 살펴보세요. 모집 중인 대회와 팀별 경기 결과를 팀밋에서 확인할 수 있어요.',
  },
  tournament: {
    title: '풋살·축구 등 스포츠 대회 일정과 참가 신청',
    description: '동네 풋살 대회와 축구 대회의 일정, 개최 장소, 참가비, 신청 마감과 참가 조건을 살펴보세요. 모집 중인 스포츠 대회와 경기 결과를 팀밋에서 확인할 수 있어요.',
  },
  league: {
    title: '풋살·축구 등 스포츠 정규 리그 일정과 참가 신청',
    description: '풋살 리그와 축구 정규 리그의 시즌 일정, 개최 장소, 참가 조건과 팀별 경기 결과를 살펴보세요. 참가할 수 있는 스포츠 리그를 팀밋에서 확인하세요.',
  },
} as const;

export function tournamentListTitle(kind: CompetitionKind): string {
  return TOURNAMENT_LIST_COPY[kind].title;
}

/** 실제 유형별 기존 링크만 분리하고 임의 필터·추적 파라미터는 대표 주소에서 제외한다. */
export function tournamentListCanonical(kind: CompetitionKind): string {
  return kind === 'all' ? '/tournaments' : `/tournaments?kind=${kind}`;
}
