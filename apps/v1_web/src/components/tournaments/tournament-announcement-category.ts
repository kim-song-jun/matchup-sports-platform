import type { V1AnnouncementCategory } from '@/types/api';

export const TOURNAMENT_ANNOUNCEMENT_CATEGORY_LABEL: Record<V1AnnouncementCategory, string> = {
  general: '일반',
  venue: '장소·준비',
  sponsor: '협찬·이벤트',
  media: '미디어',
  results: '결과',
  review: '리뷰',
};

export function getTournamentAnnouncementCategoryLabel(category: V1AnnouncementCategory): string {
  return TOURNAMENT_ANNOUNCEMENT_CATEGORY_LABEL[category];
}
