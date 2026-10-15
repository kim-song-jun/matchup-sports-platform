import type { CompetitionKind } from '@/components/v1-ui/competition-kind-segment';

export const TOURNAMENT_LIST_COPY = {
  all: {
    title: '풋살·축구 등 스포츠 대회·리그 일정과 참가 신청',
    description: '풋살 대회, 축구 대회와 정규 리그를 찾아보세요. 다양한 스포츠 대회·리그의 일정, 개최 장소, 참가비, 신청 조건과 경기 결과를 팀밋에서 확인하세요.',
  },
  tournament: {
    title: '풋살·축구 등 스포츠 대회 일정과 참가 신청',
    description: '풋살 대회와 축구 대회를 비롯한 스포츠 대회의 일정과 참가 신청을 확인하세요. 개최 장소, 참가비, 신청 마감, 대진과 경기 결과를 팀밋에서 안내합니다.',
  },
  league: {
    title: '풋살·축구 등 스포츠 정규 리그 일정과 참가 신청',
    description: '풋살 리그와 축구 리그를 비롯한 스포츠 정규 리그를 찾아보세요. 시즌 일정, 개최 장소, 참가 조건과 팀별 경기 결과를 팀밋에서 확인하세요.',
  },
} as const;

export function tournamentListTitle(kind: CompetitionKind): string {
  return TOURNAMENT_LIST_COPY[kind].title;
}

/** 실제 유형별 기존 링크만 분리하고 임의 필터·추적 파라미터는 대표 주소에서 제외한다. */
export function tournamentListCanonical(kind: CompetitionKind): string {
  return kind === 'all' ? '/tournaments' : `/tournaments?kind=${kind}`;
}
