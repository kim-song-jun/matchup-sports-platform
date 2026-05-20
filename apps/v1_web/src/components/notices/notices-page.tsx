import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card } from '@/components/v1-ui/primitives';
import type { NoticeDetailViewModel, NoticeListViewModel, NoticeModel } from './notices.types';

export function NoticeListPageView({ model }: { model: NoticeListViewModel }) {
  return (
    <AppChrome title="공지사항" activeTab="home" bottomNav={false} backHref="/home">
      <div className="tm-notice-page">
        <h1 className="tm-text-heading">공지사항</h1>
        <p className="tm-text-caption tm-notice-lead">홈에 노출되는 고정 공지와 운영 안내를 한곳에서 확인합니다.</p>
        <div className="tm-sport-chip-row tm-notice-filter-row">
          {model.filters.map((filter) => <button key={filter.label} className={`tm-chip ${filter.active ? 'tm-chip-active' : ''}`} type="button">{filter.label}</button>)}
        </div>
        <div className="tm-notice-stack">
          {model.notices.map((notice) => <NoticeRow key={notice.id} notice={notice} />)}
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
      <span className={`tm-badge ${notice.pinned ? 'tm-badge-blue' : 'tm-badge-grey'}`}>{notice.tag}</span>
      <span>
        <span className="tm-text-body-lg">{notice.title}</span>
        <span className="tm-text-caption line-clamp-2">{notice.summary}</span>
      </span>
      <span className="tm-text-caption">{notice.date}</span>
    </Link>
  );
}
