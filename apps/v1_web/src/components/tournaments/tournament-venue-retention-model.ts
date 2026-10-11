import type {
  V1AnnouncementCategory,
  V1TournamentAnnouncement,
  V1TournamentStatus,
} from '@/types/api';

export type HubState = 'confirmed' | 'operator_update' | 'upcoming' | 'available';
export type TournamentAnnouncementSummary = Pick<V1TournamentAnnouncement, 'id' | 'title' | 'category'>;

export type TournamentVenuePrepItem = {
  key: 'parking' | 'notice';
  label: string;
  value: string;
  detail: string | null;
  /** null이면 상태 배지를 렌더하지 않는다. venue가 없는 극히 드문 폴백 분기만 공지 유무에 따라 배지를 쓴다. */
  status: HubState | null;
  actionLabel: string | null;
  href: string | null;
};

export type TournamentPostEventCard = {
  // 'reviews'는 없다 — 후기 진입점은 이 카드 목록이 아니라 TournamentFixtureReviewEntrySection과
  // 완료 액션 리스트가 담당한다. 예전엔 카드도 만들었지만 소비처가 항상 필터로 걸러 렌더된 적이 없다.
  key: 'results' | 'video' | 'sponsor' | 'next_tournament';
  title: string;
  body: string;
  status: HubState;
  actionLabel: string | null;
  href: string | null;
};

/**
 * 장소 이름·주소·지도·길찾기는 PlaceCard 가 맡는다. 여기서는 그 아래 덧붙는 사실 행만 만든다 —
 * 대회가 정한 주차 안내와 운영진 장소 공지. venue 가 없는 극히 드문 경우에만 공지-only 폴백을 쓴다.
 */
const DEFAULT_PARKING_INFO = '주차와 입장 동선은 지도에서 확인해요.';

export function getTournamentVenuePrepItems({
  venue = null,
  parkingInfo = DEFAULT_PARKING_INFO,
  announcements = [],
}: {
  venue?: string | null;
  parkingInfo?: string | null;
  announcements?: TournamentAnnouncementSummary[];
}): TournamentVenuePrepItem[] {
  const venueNotice = findAnnouncementByCategory(announcements, 'venue');
  const venueNoticeLink = venueNotice ? announcementHref(venueNotice.id) : null;

  if (venue) {
    const items: TournamentVenuePrepItem[] = [];
    if (parkingInfo) {
      items.push({
        key: 'parking',
        label: '주차',
        value: parkingInfo,
        detail: null,
        status: null,
        actionLabel: null,
        href: null,
      });
    }
    if (venueNotice && venueNoticeLink) {
      items.push({
        key: 'notice',
        label: '공지',
        value: venueNotice.title,
        detail: null,
        status: null,
        actionLabel: '공지 보기',
        href: venueNoticeLink,
      });
    }
    return items;
  }

  return [
    {
      key: 'parking',
      label: '주차',
      value: venueNotice ? '공지 확인 가능' : '운영진 공지 확인',
      detail: venueNotice
        ? '주차와 현장 입장 안내는 장소·준비 공지 기준으로 확인해요.'
        : '주차와 입장 동선은 현장 운영 공지로 업데이트돼요.',
      status: venueNotice ? 'available' : 'operator_update',
      actionLabel: venueNoticeLink ? '공지 보기' : null,
      href: venueNoticeLink,
    },
  ];
}

export function getTournamentPostEventCards({
  status,
  hasCompletedFixture,
  hasAnnouncements,
  sponsorCount = 0,
  announcements = [],
}: {
  status: V1TournamentStatus;
  hasCompletedFixture: boolean;
  hasAnnouncements?: boolean;
  sponsorCount?: number;
  announcements?: TournamentAnnouncementSummary[];
}): TournamentPostEventCard[] {
  const resultsNotice = findAnnouncementByCategory(announcements, 'results');
  const mediaNotice = findAnnouncementByCategory(announcements, 'media');
  const sponsorNotice = findAnnouncementByCategory(announcements, 'sponsor');

  return [
    getResultCard({ status, hasCompletedFixture, resultsNotice }),
    {
      key: 'video',
      title: '하이라이트 영상',
      body: mediaNotice
        ? '영상 링크와 하이라이트 공유는 운영진 미디어 공지 기준으로 확인해요.'
        : '영상 업로드 기능은 준비 중이에요. 공유 영상은 운영진 공지로 안내돼요.',
      status: mediaNotice ? 'available' : 'upcoming',
      actionLabel: mediaNotice ? '미디어 공지 보기' : null,
      href: mediaNotice ? announcementHref(mediaNotice.id) : null,
    },
    getSponsorCard({ sponsorCount, sponsorNotice, hasAnnouncements }),
    {
      key: 'next_tournament',
      title: '다음 대회',
      body: '새로운 대회를 둘러보고 팀의 다음 참가 일정을 이어서 준비해요.',
      status: 'available',
      actionLabel: '다음 대회 찾기',
      href: '/tournaments',
    },
  ];
}

function getResultCard({
  status,
  hasCompletedFixture,
  resultsNotice,
}: {
  status: V1TournamentStatus;
  hasCompletedFixture: boolean;
  resultsNotice: TournamentAnnouncementSummary | null;
}): TournamentPostEventCard {
  if (hasCompletedFixture) {
    return {
      key: 'results',
      title: '결과·순위',
      body: '종료된 경기 결과가 일정과 대진표에 반영됐어요.',
      status: 'available',
      actionLabel: '결과 보기',
      href: '#tournament-results',
    };
  }
  if (resultsNotice) {
    return {
      key: 'results',
      title: '결과·순위',
      body: '운영진이 공개한 결과 공지를 기준으로 후속 안내를 확인해요.',
      status: 'available',
      actionLabel: '결과 공지 보기',
      href: announcementHref(resultsNotice.id),
    };
  }
  return {
    key: 'results',
    title: '결과·순위',
    body: status === 'completed'
      ? '대회는 종료됐고, 경기 결과는 운영진 업데이트를 기다리고 있어요.'
      : '대회 종료 후 결과와 순위가 공개돼요.',
    status: status === 'completed' ? 'operator_update' : 'upcoming',
    actionLabel: null,
    href: null,
  };
}

function getSponsorCard({
  sponsorCount,
  sponsorNotice,
  hasAnnouncements,
}: {
  sponsorCount: number;
  sponsorNotice: TournamentAnnouncementSummary | null;
  hasAnnouncements?: boolean;
}): TournamentPostEventCard {
  return {
    key: 'sponsor',
    title: '협찬·현장 이벤트',
    body: sponsorCount > 0
      ? '협찬사 혜택과 이벤트 참여 방식이 대회 상세에 공개됐어요.'
      : sponsorNotice
      ? '협찬 이벤트와 현장 혜택은 운영진이 공개한 이벤트 공지를 기준으로 확인해요.'
      : hasAnnouncements
      ? '협찬 이벤트와 현장 혜택은 공지사항에 올라온 내용만 기준으로 확인해요.'
      : '협찬 이벤트와 현장 혜택은 운영진 공지로 공개돼요.',
    status: sponsorCount > 0 || sponsorNotice ? 'available' : 'operator_update',
    actionLabel: sponsorCount > 0 ? '협찬 보기' : sponsorNotice ? '이벤트 공지 보기' : null,
    href: sponsorCount > 0 ? '#tournament-sponsors' : sponsorNotice ? announcementHref(sponsorNotice.id) : null,
  };
}

function findAnnouncementByCategory(
  announcements: TournamentAnnouncementSummary[],
  category: V1AnnouncementCategory,
): TournamentAnnouncementSummary | null {
  return announcements.find((announcement) => announcement.category === category) ?? null;
}

function announcementHref(announcementId: string): string {
  return `#announcement-${announcementId}`;
}
