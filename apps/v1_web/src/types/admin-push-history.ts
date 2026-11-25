import type { V1AdminPushGender, V1AdminPushSendTarget } from './api';

export interface AdminPushHistoryItem {
  id: string;
  createdAt: string;
  title: string | null;
  target: V1AdminPushSendTarget | null;
  recipientUserId: string | null;
  /** 발송 때 고른 성별. 안 골랐거나 예전 이력이면 null. */
  gender?: V1AdminPushGender | null;
  /** target === 'competition' 일 때의 대회·리그. 제목은 발송 당시 값이다. */
  competition?: { id: string; title: string | null } | null;
  sender: { name: string | null; role: 'owner' | 'ops' | 'support' };
  sent: number | null;
  skipped: number | null;
  failed: number | null;
}

export interface AdminPushDeliveryChannel {
  total: number;
  delivered: number;
  failed: number;
  disabled: boolean;
}

export interface AdminPushHistoryDetail extends AdminPushHistoryItem {
  content: {
    source: 'snapshot' | 'notification' | 'unavailable' | 'ambiguous';
    body: string | null;
    url: string | null;
  };
  delivery: { web: AdminPushDeliveryChannel | null; native: AdminPushDeliveryChannel | null };
}

export interface AdminPushHistoryPage {
  items: AdminPushHistoryItem[];
  pageInfo: { hasNextPage: boolean; nextCursor: string | null };
}
