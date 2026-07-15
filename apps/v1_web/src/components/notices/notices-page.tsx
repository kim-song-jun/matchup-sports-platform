import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { BellIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/v1-ui/icons';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
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
        <p className="tm-text-caption tm-notice-lead">
          팀밋의 주요 소식과 서비스 운영 안내를 확인할 수 있어요.
        </p>
        <p className="tm-text-caption tm-notice-lead">
          대회 일정, 서비스 업데이트, 점검 안내, 이벤트 및 기타 운영 관련 공지는 여기서 안내해요.
        </p>
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
            /* [P2 UX 라이팅] 능동형 + 해요체 */
            <EmptyState
              title="아직 공지가 없어요"
              sub="새 공지가 올라오면 여기서 바로 확인할 수 있어요."
            />
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
            <span className="tm-badge tm-badge-grey">{notice.tag}</span>
            <h1 className="tm-text-heading tm-notice-title">{notice.title}</h1>
            <p className="tm-text-caption tm-notice-lead">{notice.date} · teameet 운영팀</p>
            <div className="tm-notice-body">
              {notice.body.map((paragraph, index) => <p key={`${index}-${paragraph}`} className="tm-text-body">{paragraph}</p>)}
            </div>
            {model.relatedHref ? (
              <Link className="tm-card tm-pressable tm-notice-related" href={model.relatedHref}>
                <div className="tm-text-label">관련 매치 확인</div>
                {/* [P2 UX 라이팅] 능동형 — 시스템이 표시하는 게 아니라 사용자가 확인하는 맥락으로 전환 */}
                <div className="tm-text-caption">체크인 시간이 바뀐 경기는 매치 상세와 채팅방 공지에서도 확인할 수 있어요.</div>
              </Link>
            ) : null}
          </>
        )}
      </article>
    </AppChrome>
  );
}

function NoticeRow({ notice }: { notice: NoticeModel }) {
  return (
    <Link className="tm-card tm-pressable tm-notice-row" href={"/notices/" + notice.id}>
      <span className="tm-notice-row-icon" aria-hidden="true">
        <BellIcon size={18} />
      </span>
      <span>
        <span className="tm-text-micro tm-notice-row-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {notice.tag} · {notice.date}
        </span>
        <span className="tm-text-label tm-notice-row-title">{notice.title}</span>
        <span
          className="tm-text-caption"
          style={{
            display: '-webkit-box',
            overflow: 'hidden',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: 4,
          }}
        >
          {notice.summary}
        </span>
      </span>
      <ChevronRightIcon size={17} stroke="var(--grey400)" strokeWidth={2} />
    </Link>
  );
}
