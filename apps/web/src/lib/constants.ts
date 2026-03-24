// Sport labels — single source of truth
export const sportLabel: Record<string, string> = {
  soccer: '축구',
  futsal: '풋살',
  basketball: '농구',
  badminton: '배드민턴',
  ice_hockey: '아이스하키',
  figure_skating: '피겨',
  short_track: '쇼트트랙',
  swimming: '수영',
  tennis: '테니스',
  baseball: '야구',
  volleyball: '배구',
};

// Level labels
export const levelLabel: Record<number, string> = {
  1: '입문',
  2: '초급',
  3: '중급',
  4: '상급',
  5: '고수',
};

// Sport icon colors for card backgrounds
export const sportIconColor: Record<string, string> = {
  soccer: 'bg-green-50 text-green-600',
  futsal: 'bg-blue-50 text-blue-500',
  basketball: 'bg-amber-50 text-amber-600',
  badminton: 'bg-cyan-50 text-cyan-600',
  ice_hockey: 'bg-blue-50 text-blue-600',
  tennis: 'bg-red-50 text-red-500',
  swimming: 'bg-sky-50 text-sky-600',
  figure_skating: 'bg-gray-100 text-gray-500',
  short_track: 'bg-gray-100 text-gray-500',
  baseball: 'bg-orange-50 text-orange-600',
  volleyball: 'bg-blue-50 text-blue-500',
};

// Match status
export const matchStatusLabel: Record<string, string> = {
  recruiting: '모집중',
  full: '마감',
  in_progress: '진행중',
  completed: '완료',
  cancelled: '취소',
};

// Lesson type
export const lessonTypeLabel: Record<string, string> = {
  group_lesson: '그룹 레슨',
  practice_match: '연습 경기',
  free_practice: '자유 연습',
  clinic: '클리닉',
};
