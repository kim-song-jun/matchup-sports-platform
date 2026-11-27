import type { AdminTabNavItem } from '@/components/admin/admin-tab-nav';
import type { V1TournamentStatus } from '@/types/api';

export interface TournamentNavInput {
  id: string;
  status: V1TournamentStatus;
  /** 대회 스태프(담당 대회 관리) 면 — 전역 팝업·징계 현황을 두지 않는다. */
  staffSurface: boolean;
  /** `navigation` 을 받는 공개 샘플 — 징계 현황을 두지 않는다. */
  restricted: boolean;
  /** 팝업을 전역 화면이 아니라 대회 경로의 슬러그로 연다(공개 샘플). */
  localPopups: boolean;
  counts?: { registrations?: number; fixtures?: number; announcements?: number };
}

export interface TournamentNavModel {
  tabs: AdminTabNavItem[];
  more: { label: string; items: AdminTabNavItem[] }[];
}

function item(slug: string, label: string, count?: number): AdminTabNavItem {
  return typeof count === 'number' && count > 0 ? { slug, label, count } : { slug, label };
}

/**
 * 자주 쓰는 탭 몇 개와 더보기 묶음. 대회가 시작되면 시상·리뷰·통계가 탭으로 올라오고
 * 대회 정보는 더보기「운영」으로 내려간다.
 */
export function buildTournamentNav(input: TournamentNavInput): TournamentNavModel {
  const afterStart = input.status === 'in_progress' || input.status === 'completed';
  const counts = input.counts;

  const tabs: AdminTabNavItem[] = [
    item('overview', '개요'),
    item('registrations', '신청', counts?.registrations),
    item('bracket', '대진', counts?.fixtures),
    item('announcements', '공지', counts?.announcements),
    ...(afterStart
      ? [item('awards', '시상'), item('reviews', '리뷰 관리'), item('statistics', '통계')]
      : [item('info', '대회 정보')]),
  ];

  const popups: AdminTabNavItem | null = input.staffSurface
    ? null
    : input.localPopups
      ? item('popups', '팝업')
      : {
          slug: 'popups',
          label: '팝업',
          externalHref: `/admin/content?tab=popups&targetPath=${encodeURIComponent(`/tournaments/${input.id}`)}`,
          externalNote: '전역 팝업 화면으로 이동해요',
        };
  const hasDiscipline = !input.staffSurface && !input.restricted;

  const groups: { label: string; items: (AdminTabNavItem | null)[] }[] = [
    { label: '홍보', items: [item('sponsors', '협찬'), popups, item('campaign', '캠페인')] },
    {
      label: '운영',
      items: [afterStart ? item('info', '대회 정보') : null, hasDiscipline ? item('discipline', '징계 현황') : null],
    },
    {
      label: '대회 후',
      items: afterStart ? [] : [item('reviews', '리뷰 관리'), item('awards', '시상'), item('statistics', '통계')],
    },
  ];

  return {
    tabs,
    more: groups
      .map((group) => ({ label: group.label, items: group.items.filter((entry): entry is AdminTabNavItem => entry !== null) }))
      .filter((group) => group.items.length > 0),
  };
}
