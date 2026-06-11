import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { BellIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/v1-ui/icons';
import { Card } from '@/components/v1-ui/primitives';
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
        {/* Mobile heading (hidden on desktop by CSS).
            aria-hidden: the AppChrome topBar title="공지사항" provides the a11y heading
            on mobile, so this visual element is decorative in the a11y tree. */}
        <h1 className="tm-text-heading tm-hide-desktop" aria-hidden="true">공지사항</h1>
        <p className="tm-text-caption tm-notice-lead">홈에 노출되는 고정 공지와 운영 안내를 한곳에서 확인합니다.</p>
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
          {model.notices.length ? model.notices.map((notice) => <NoticeRow key={notice.id} notice={notice} />) : (
            <Card pad={18} className="tm-notice-summary-card">
              <div className="tm-text-label">공지 없음</div>
              <p className="tm-text-body">선택한 카테고리에 등록된 공지가 아직 없습니다.</p>
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
    <AppChrome title="공지 상세" activeTab="home" bottomNav={false} backHref="/notices">
      <article className="tm-notice-page">
        {/* Desktop: inline page heading replaces hidden mobile topbar */}
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/notices" aria-label="공지사항 목록으로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.2} />
          </Link>
          <h2 className="tm-text-heading">공지 상세</h2>
        </div>
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
          <div className="tm-text-caption">체크인 시간이 바뀐 경기는 매치 상세와 채팅방 공지에 같은 내용을 표시합니다.</div>
        </Link>
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
