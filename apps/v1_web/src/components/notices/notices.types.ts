import type { V1RichContentDocument } from '@/types/api';

export type NoticeModel = {
  id: string;
  tag: string;
  title: string;
  summary: string;
  date: string;
  body: string[];
  content?: V1RichContentDocument;
};

export type NoticeListViewModel = {
  filters: Array<{ label: string; active?: boolean; onSelect?: () => void }>;
  notices: NoticeModel[];
  /** 선택한 목록 조건과 상위 출처를 상세 복귀에 전달한다. */
  readonly selfHref?: string;
  /** API 로딩/에러 상태. 뷰에서 loading/error 분기에 사용 */
  status?: 'loading' | 'error' | 'ready';
  onRetry?: () => void;
};

export type NoticeDetailViewModel = {
  notice: NoticeModel;
  relatedHref?: string;
  /** API 로딩/에러 상태. 뷰에서 loading/error 분기에 사용 */
  status?: 'loading' | 'error' | 'ready';
  onRetry?: () => void;
};
