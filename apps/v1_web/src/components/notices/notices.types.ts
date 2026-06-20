export type NoticeModel = {
  id: string;
  tag: string;
  title: string;
  summary: string;
  date: string;
  pinned?: boolean;
  body: string[];
};

export type NoticeListViewModel = {
  filters: Array<{ label: string; active?: boolean; onSelect?: () => void }>;
  notices: NoticeModel[];
  /** API 로딩/에러 상태. 뷰에서 loading/error 분기에 사용 */
  status?: 'loading' | 'error' | 'ready';
  onRetry?: () => void;
};

export type NoticeDetailViewModel = {
  notice: NoticeModel;
  relatedHref: string;
  /** API 로딩/에러 상태. 뷰에서 loading/error 분기에 사용 */
  status?: 'loading' | 'error' | 'ready';
  onRetry?: () => void;
};
