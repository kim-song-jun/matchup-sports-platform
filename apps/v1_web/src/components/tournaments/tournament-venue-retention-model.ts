import type {
  V1AnnouncementCategory,
  V1TournamentAnnouncement,
  V1TournamentStatus,
} from '@/types/api';

export type HubState = 'confirmed' | 'operator_update' | 'upcoming' | 'available';
export type TournamentAnnouncementSummary = Pick<V1TournamentAnnouncement, 'id' | 'title' | 'category'>;

export type TournamentVenuePrepItem = {
  key: 'venue' | 'parking' | 'rules' | 'roster';
  label: string;
  value: string;
  detail: string;
  status: HubState;
  actionLabel: string | null;
  href: string | null;
};

export type TournamentPostEventCard = {
  key: 'results' | 'video' | 'reviews' | 'sponsor' | 'next_tournament';
  title: string;
  body: string;
  status: HubState;
  actionLabel: string | null;
  href: string | null;
};

export function getTournamentVenuePrepItems({
  venue,
  hasRules,
  minPlayers,
  maxPlayers,
  announcements = [],
}: {
  venue: string | null;
  hasRules: boolean;
  minPlayers?: number;
  maxPlayers?: number;
  announcements?: TournamentAnnouncementSummary[];
}): TournamentVenuePrepItem[] {
  const venueNotice = findAnnouncementByCategory(announcements, 'venue');
  const venueNoticeLink = venueNotice ? announcementHref(venueNotice.id) : null;
  const rosterValue =
    minPlayers != null && maxPlayers != null
      ? `${minPlayers}~${maxPlayers}명`
      : '팀 명단 확인';

  return [
    {
      key: 'venue',
      label: '장소',
      value: venue ?? venueNotice?.title ?? '장소 공지 전',
      detail: venue
        ? '대회 당일 이 장소를 기준으로 모여요.'
        : venueNotice
          ? '장소·주차·입장 동선은 공지사항에서 확인해요.'
          : '최종 장소는 운영진 공지사항으로 업데이트돼요.',
      status: venue ? 'confirmed' : venueNotice ? 'available' : 'operator_update',
      actionLabel: venueNoticeLink ? '공지 보기' : null,
      href: venueNoticeLink,
    },
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
    {
      key: 'rules',
      label: '규정',
      value: hasRules ? '규정 공개됨' : venueNotice ? '공지 확인 가능' : '규정 공지 전',
      detail: hasRules
        ? '아래 대회 규정 섹션에서 세부 규칙을 확인해요.'
        : venueNotice
          ? '경기 준비물과 현장 운영 규칙은 장소·준비 공지로 안내돼요.'
          : '확정된 경기 규정은 운영진 공지 또는 대회 규정 섹션에 공개돼요.',
      status: hasRules ? 'confirmed' : venueNotice ? 'available' : 'operator_update',
      actionLabel: !hasRules && venueNoticeLink ? '공지 보기' : null,
      href: !hasRules ? venueNoticeLink : null,
    },
    {
      key: 'roster',
      label: '선수단',
      value: rosterValue,
      detail: '팀장과 운영진이 신청 전 선수단 명단과 입금자명을 함께 확인해요.',
      status: 'confirmed',
      actionLabel: null,
      href: null,
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
  const reviewNotice = findAnnouncementByCategory(announcements, 'review');
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
    getReviewCard(hasCompletedFixture, reviewNotice),
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

function getReviewCard(
  hasCompletedFixture: boolean,
  reviewNotice: TournamentAnnouncementSummary | null,
): TournamentPostEventCard {
  if (hasCompletedFixture) {
    return {
      key: 'reviews',
      title: '리뷰·매너 기록',
      body: '완료된 대회 경기는 리뷰함에서 상대팀 매너 평가를 작성해요.',
      status: 'available',
      actionLabel: '리뷰 작성',
      href: '/my/reviews',
    };
  }
  return {
    key: 'reviews',
    title: '리뷰·매너 기록',
    body: reviewNotice
      ? '리뷰 참여 방식과 매너 평가 안내는 운영진 공지를 기준으로 확인해요.'
      : '대회 경기 리뷰는 경기 종료 후 리뷰 기능과 연결될 예정이에요.',
    status: reviewNotice ? 'available' : 'upcoming',
    actionLabel: reviewNotice ? '리뷰 안내 보기' : null,
    href: reviewNotice ? announcementHref(reviewNotice.id) : null,
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
