import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { BellIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/v1-ui/icons';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
import type { NoticeDetailViewModel, NoticeListViewModel, NoticeModel } from './notices.types';

export function NoticeListPageView({ model }: { model: NoticeListViewModel }) {
  return (
    <AppChrome title="공지사항" activeTab="home" bottomNav={false} backHref="/home">
      <div className="tm-notice-page">
        {/* Desktop: inline page heading replaces hidden mobile topbar */}
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/home" aria-label="홈으로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.2} />
          </Link>
          <h1 className="tm-text-heading">공지사항</h1>
        </div>
        {/* Mobile heading (hidden on desktop by CSS). The AppChrome topBar title
            renders as a <div>, not a heading element, so this h1 must stay in the
            a11y tree to give mobile screen-reader users the page's main heading. */}
        <h1 className="tm-text-heading tm-hide-desktop">공지사항</h1>
        <p className="tm-text-caption tm-notice-lead">홈 공지와 운영 안내를 한곳에서 볼 수 있어요.</p>
        <div className="tm-sport-chip-row tm-notice-filter-row">
          {model.filters.map((filter) => (
            <button
              key={filter.label}
              className={`tm-chip ${filter.active ? 'tm-chip-active' : ''}`}
              type="button"
              aria-pressed={Boolean(filter.active)}
              onClick={filter.onSelect}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="tm-notice-stack">
          {model.status === 'loading' ? (
            <PageSkeleton variant="list" />
          ) : model.status === 'error' ? (
            <ErrorState
              message="공지사항을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
              onRetry={model.onRetry}
            />
          ) : model.notices.length ? (
            model.notices.map((notice) => <NoticeRow key={notice.id} notice={notice} />)
          ) : (
            <Card pad={18} className="tm-notice-summary-card">
              <div className="tm-text-label">공지 없음</div>
              <p className="tm-text-body">이 카테고리에 공지가 아직 없어요.</p>
            </Card>
          )}
        </div>
      </div>
    </AppChrome>
  );
}

export function NoticeDetailPageView({ model }: { model: NoticeDetailViewModel }) {
  const { notice } = model;
  return (
    <AppChrome title="공지사항" activeTab="home" bottomNav={false} backHref="/notices">
      <article className="tm-notice-page">
        {/* Desktop: inline page heading replaces hidden mobile topbar */}
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/notices" aria-label="공지사항 목록으로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.2} />
          </Link>
          {/* breadcrumb-style label, not a section heading — keep the notice title as the sole h1 */}
          <p className="tm-text-heading" aria-hidden="true">공지 상세</p>
        </div>
        {model.status === 'loading' ? (
          <PageSkeleton variant="detail" />
        ) : model.status === 'error' ? (
          <ErrorState
            message="공지사항을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
            onRetry={model.onRetry}
          />
        ) : (
          <>
            <span className={`tm-badge ${notice.pinned ? 'tm-badge-blue' : 'tm-badge-grey'}`}>{notice.tag}</span>
            <h1 className="tm-text-heading tm-notice-title">{notice.title}</h1>
            <p className="tm-text-caption tm-notice-lead">{notice.date} · teameet 운영팀</p>
            <Card pad={18} className="tm-notice-summary-card">
              <div className="tm-text-label">요약</div>
              <p className="tm-text-body">{notice.summary}</p>
            </Card>
            <div className="tm-notice-body">
              {notice.body.map((paragraph) => <p key={paragraph} className="tm-text-body">{paragraph}</p>)}
            </div>
            <Link className="tm-card tm-pressable tm-notice-related" href={model.relatedHref}>
              <div className="tm-text-label">관련 매치 확인</div>
              <div className="tm-text-caption">체크인 시간이 바뀐 경기는 매치 상세와 채팅방 공지에도 같은 안내가 표시돼요.</div>
            </Link>
          </>
        )}
      </article>
    </AppChrome>
  );
}

function NoticeRow({ notice }: { notice: NoticeModel }) {
  return (
    <Link className={`tm-card tm-pressable tm-notice-row ${notice.pinned ? 'tm-notice-row-active' : ''}`} href={`/notices/${notice.id}`}>
      <span className="tm-notice-row-icon" aria-hidden="true">
        <BellIcon size={18} />
      </span>
      <span>
        <span className="tm-text-micro tm-notice-row-meta">{notice.tag} · {notice.date}</span>
        <span className="tm-text-label tm-notice-row-title">{notice.title}</span>
        <span className="tm-text-caption line-clamp-2">{notice.summary}</span>
      </span>
      <ChevronRightIcon size={17} stroke="var(--grey400)" strokeWidth={2} />
    </Link>
  );
}
