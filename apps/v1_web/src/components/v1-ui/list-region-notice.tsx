import Link from 'next/link';
import { MapPin } from 'lucide-react';
import type { ListRegionNotice as ListRegionNoticeModel } from '@/lib/list-region-preference';

/**
 * 목록 머리의 "내 지역 먼저" 안내 한 줄 — 팀·매치·팀 매치·대회/리그 목록이 같이 쓴다.
 * 저장한 활동 지역을 쓰면 안내 글만, 활동 지역이 없는 로그인 사용자에게는 글 오른쪽에 "지역 설정" 알약 버튼이 붙는다.
 * 눈에 보이는 알약은 32px 이고 누르는 영역은 링크 전체(44px)다.
 */
export function ListRegionNotice({ notice }: { readonly notice: ListRegionNoticeModel | undefined }) {
  if (!notice) return null;
  if (!notice.link) return <p className="tm-text-caption tm-list-region-notice">{notice.text}</p>;
  return (
    <div className="tm-list-region-notice tm-list-region-notice-action">
      <span className="tm-text-caption">{notice.text}</span>
      <Link className="tm-list-region-notice-link" href={notice.link.href}>
        <span className="tm-list-region-notice-pill">
          <MapPin size={14} strokeWidth={2.2} aria-hidden="true" />
          {notice.link.label}
        </span>
      </Link>
    </div>
  );
}
