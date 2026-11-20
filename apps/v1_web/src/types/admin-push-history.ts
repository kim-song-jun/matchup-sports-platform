import type { V1AdminPushSendTarget } from './api';

export interface AdminPushHistoryItem {
  id: string;
  createdAt: string;
  title: string | null;
  target: V1AdminPushSendTarget | null;
  recipientUserId: string | null;
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
