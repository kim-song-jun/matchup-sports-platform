/**
 * "예정만" 필터와 "다음 경기" 배지의 문구·URL 키. 정규 리그 화면과 대회 일정 탭이
 * 같은 말과 같은 주소 키를 쓰도록 한 곳에 둔다.
 */
export const UPCOMING_FILTER_LABEL = '예정만';
export const NEXT_MATCH_BADGE_LABEL = '다음 경기';

export const UPCOMING_EMPTY_STATE = {
  title: '예정된 경기가 없어요',
  sub: "'전체'를 눌러 지난 경기를 다시 볼 수 있어요.",
  cta: '전체 보기',
} as const;

export const UPCOMING_QUERY_KEY = 'schedule';
export const UPCOMING_QUERY_VALUE = 'upcoming';
