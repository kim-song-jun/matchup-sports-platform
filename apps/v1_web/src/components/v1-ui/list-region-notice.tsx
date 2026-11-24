import { MapPin } from 'lucide-react';
import { FromLink } from '@/components/v1-ui/from-link';
import type { ListRegionNotice as ListRegionNoticeModel } from '@/lib/list-region-preference';

/**
 * 목록 머리의 "내 지역 먼저" 안내 한 줄 — 팀·매치·팀 매치·대회/리그 목록이 같이 쓴다.
 * 저장한 활동 지역을 쓰면 안내 글만, 활동 지역이 없는 로그인 사용자에게는 글 오른쪽에 "지역 설정" 알약 버튼이 붙는다.
 * 눈에 보이는 알약은 32px 이고 누르는 영역은 링크 전체(44px)다.
 * 설정 화면의 뒤로가기가 들어온 목록으로 돌아오도록 이동할 때 출처(`?from=`)를 싣는다(FromLink) — 일반 Link 면 고정 목적지(/my/settings)로 나간다.
 */
export function ListRegionNotice({ notice }: { readonly notice: ListRegionNoticeModel | undefined }) {
  if (!notice) return null;
  if (!notice.link) return <p className="tm-text-caption tm-list-region-notice">{notice.text}</p>;
  return (
    <div className="tm-list-region-notice tm-list-region-notice-action">
      <span className="tm-text-caption">{notice.text}</span>
      <FromLink className="tm-list-region-notice-link" href={notice.link.href}>
        <span className="tm-list-region-notice-pill">
          <MapPin size={14} strokeWidth={2.2} aria-hidden="true" />
          {notice.link.label}
        </span>
      </FromLink>
    </div>
  );
}
