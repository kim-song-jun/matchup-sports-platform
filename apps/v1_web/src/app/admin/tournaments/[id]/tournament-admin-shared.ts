import type { V1TournamentStatus } from '@/types/api';

/**
 * 대회 상세 셸(layout)과 섹션 화면이 함께 쓰는 표시 헬퍼. 라우트를 섹션별로 나누면서
 * 한쪽에만 있던 정의를 양쪽이 import 할 수 있도록 leaf 모듈로 뺐다 — 셸이 탭 파일을
 * import 하면 순환 참조가 생긴다.
 */

export const TOURNAMENT_STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  open: '접수 중',
  closed: '마감',
  in_progress: '진행 중',
  completed: '완료',
  cancelled: '취소됨',
};

export function allowedNextStatuses(current: V1TournamentStatus): V1TournamentStatus[] {
  switch (current) {
    case 'draft':
      return ['open', 'cancelled'];
    case 'open':
      return ['closed', 'cancelled'];
    case 'closed':
      return ['in_progress', 'open', 'cancelled'];
    case 'in_progress':
      return ['completed', 'cancelled'];
    case 'completed':
    case 'cancelled':
      return [];
    default:
      return [];
  }
}

/**
 * 어드민 목록의 시각 표기.
 *
 * **`timeZone` 을 고정한다.** 없으면 브라우저(=기기) 타임존으로 렌더돼, 해외에서 접속한
 * 운영자와 한국 운영자가 **같은 신청을 다른 시각으로 본다.** 이 화면의 값은 전부 서버가
 * KST 기준으로 다루는 것들이라(신청 시각·취소 요청 시각·명단 자동 확정 시각) 표기도
 * KST 로 고정하는 것이 맞다 — `lib/date-utils.ts` 가 같은 이유로 KST 고정을 쓴다.
 */
export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function formatDateRange(startStr: string | null, endStr: string | null): string {
  const start = formatDate(startStr);
  if (start === '—') return start;
  const end = formatDate(endStr);
  if (end === '—' || end === start) return start;
  return `${start} ~ ${end}`;
}
