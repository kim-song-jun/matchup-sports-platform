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
  ice_hockey: 'bg-teal-50 text-teal-600',
  tennis: 'bg-red-50 text-red-500',
  swimming: 'bg-sky-50 text-sky-600',
  figure_skating: 'bg-gray-100 text-gray-500',
  short_track: 'bg-gray-100 text-gray-500',
  baseball: 'bg-orange-50 text-orange-600',
  volleyball: 'bg-blue-50 text-blue-500',
};

// Sport card accent — tint, badge, dot colors for card-level sport identity
export const sportCardAccent: Record<string, { tint: string; badge: string; dot: string }> = {
  soccer:         { tint: 'bg-green-50/40 dark:bg-green-900/10',  badge: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400',     dot: 'bg-green-400' },
  futsal:         { tint: 'bg-blue-50/40 dark:bg-blue-900/10',   badge: 'bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400',       dot: 'bg-blue-400' },
  basketball:     { tint: 'bg-amber-50/40 dark:bg-amber-900/10',  badge: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',    dot: 'bg-amber-400' },
  badminton:      { tint: 'bg-cyan-50/40 dark:bg-cyan-900/10',   badge: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400',       dot: 'bg-cyan-400' },
  ice_hockey:     { tint: 'bg-teal-50/40 dark:bg-teal-900/10',   badge: 'bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',       dot: 'bg-teal-400' },
  tennis:         { tint: 'bg-red-50/40 dark:bg-red-900/10',    badge: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',          dot: 'bg-red-400' },
  swimming:       { tint: 'bg-sky-50/40 dark:bg-sky-900/10',    badge: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400',          dot: 'bg-sky-400' },
  figure_skating: { tint: 'bg-purple-50/40 dark:bg-purple-900/10', badge: 'bg-purple-50 text-purple-500 dark:bg-purple-900/30 dark:text-purple-400', dot: 'bg-purple-300' },
  short_track:    { tint: 'bg-slate-50/40 dark:bg-slate-900/10',  badge: 'bg-slate-50 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400',    dot: 'bg-slate-400' },
  baseball:       { tint: 'bg-orange-50/40 dark:bg-orange-900/10', badge: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-400' },
  volleyball:     { tint: 'bg-indigo-50/40 dark:bg-indigo-900/10', badge: 'bg-indigo-50 text-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-400', dot: 'bg-indigo-400' },
};

// Match status
export const matchStatusLabel: Record<string, string> = {
  recruiting: '모집중',
  full: '마감',
  in_progress: '진행중',
  completed: '완료',
  cancelled: '취소',
};

export const matchStatusColor: Record<string, string> = {
  recruiting: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400',
  full: 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400',
  in_progress: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
  completed: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  cancelled: 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400',
};

// Lesson type
export const lessonTypeLabel: Record<string, string> = {
  group_lesson: '그룹 레슨',
  practice_match: '연습 경기',
  free_practice: '자유 연습',
  clinic: '클리닉',
};

export const ticketTypeLabel: Record<string, string> = {
  single: '1일 체험',
  multi: '정기수강',
  unlimited: '무제한',
};

export const attendanceStatusLabel: Record<string, string> = {
  scheduled: '예약',
  attended: '출석',
  absent: '결석',
  late: '지각',
  cancelled: '취소',
};
