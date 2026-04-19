/**
 * Shared label maps for dispute status and type.
 * Exported from one source of truth — no duplicated Korean strings across files.
 *
 * Two status label maps are intentional:
 *   USER_DISPUTE_STATUS_LABELS  — buyer-facing phrasing (e.g. "운영팀 검토 중")
 *   ADMIN_DISPUTE_STATUS_LABELS — admin-facing phrasing (e.g. "검토중")
 */

export interface StatusLabelConfig {
  text: string;
  color: string;
}

export interface AdminStatusLabelConfig {
  label: string;
  color: string;
}

/** Status labels shown to regular users (buyer / seller). */
export const USER_DISPUTE_STATUS_LABELS: Record<string, StatusLabelConfig> = {
  filed: { text: '검토 대기', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  seller_responded: { text: '판매자 응답', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  admin_reviewing: { text: '운영팀 검토 중', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  resolved_refund: { text: '환불 완료', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  resolved_release: { text: '지급 완료', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  dismissed: { text: '기각됨', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  withdrawn: { text: '취하됨', color: 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500' },
};

/** Status labels shown to admin users. */
export const ADMIN_DISPUTE_STATUS_LABELS: Record<string, AdminStatusLabelConfig> = {
  filed: { label: '접수됨', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  seller_responded: { label: '판매자 응답', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  admin_reviewing: { label: '검토중', color: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300' },
  resolved_refund: { label: '환불 완료', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  resolved_release: { label: '지급 완료', color: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' },
  dismissed: { label: '기각됨', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  withdrawn: { label: '취하됨', color: 'bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500' },
};

/** Dispute type labels — covers marketplace + legacy team-match types. */
export const DISPUTE_TYPE_LABELS: Record<string, string> = {
  // Marketplace types (API enum)
  not_delivered: '상품 미수령',
  not_as_described: '상품 상태 불일치',
  damaged: '파손',
  other: '기타',
  // Legacy team-match types
  no_show: '노쇼',
  late: '지각',
  level_mismatch: '실력 차이',
  misconduct: '비매너',
};

/** Statuses considered "active" (dispute still in progress). */
export const ACTIVE_DISPUTE_STATUSES = new Set(['filed', 'seller_responded', 'admin_reviewing']);

/** Statuses considered "resolved" (dispute closed). */
export const RESOLVED_DISPUTE_STATUSES = new Set([
  'resolved_refund',
  'resolved_release',
  'dismissed',
  'withdrawn',
]);
