import type {
  V1AnnouncementCategory,
  V1TournamentAnnouncement,
  V1TournamentStatus,
} from '@/types/api';

export type HubState = 'confirmed' | 'operator_update' | 'upcoming' | 'available';
export type TournamentAnnouncementSummary = Pick<V1TournamentAnnouncement, 'id' | 'title' | 'category'>;

export type TournamentVenuePrepItem = {
  key: 'parking';
  label: string;
  value: string;
  detail: string;
  /**
   * null이면 이 행에 상태 배지를 렌더하지 않는다. venue가 있는 일반 케이스는 항상
   * null — 장소명·지도 링크가 이미 무조건 노출되는 상태에서 "확인 가능" 배지를
   * 붙여봐야 그 정보를 다시 확인할 수 있다는 뜻인데 정작 그 정보가 배지 없이도
   * 전부 보여서 아무 부가 정보가 없었다(사용자 피드백, 배지를 가려도 잃는 정보 없음
   * 실제 확인). venue가 없는 극히 드문 edge case(아래 폴백 분기)는 공지 유무에 따라
   * 실제로 값이 달라지므로 배지를 유지한다.
   */
  status: HubState | null;
  actionLabel: string | null;
  href: string | null;
  /** true면 href가 외부 링크(지도 검색 등) — target="_blank" + rel="noopener noreferrer"로 열어야 함. */
  hrefExternal: boolean;
  /** 장소 정보에 보조적으로 덧붙는 운영진 공지 요약. 장소 정보 자체를 대체하지 않는다. */
  notice: { summary: string; actionLabel: string; href: string } | null;
};

export type TournamentPostEventCard = {
  key: 'results' | 'video' | 'reviews' | 'sponsor' | 'next_tournament';
  title: string;
  body: string;
  status: HubState;
  actionLabel: string | null;
  href: string | null;
};

/**
 * 규정·선수단은 대회 상세 페이지 상단 "대회 정보" 섹션에 이미 나오는 값을 그대로
 * 반복 표시하면서 "확정" 배지까지 붙어 오히려 혼란을 줬다(사용자 피드백) — 그래서
 * 제거됐다. 하지만 "현장 안내"라는 섹션명 자체가 위치·동선 정보를 기대하게 만드는데,
 * venue(장소명)는 대회 생성 시 항상 입력되는 값인데도 이 섹션이 전혀 활용하지 않아
 * "관리자 공지가 없으면 아무 정보도 없다"는 인상을 줬다(재차 지적된 문제). venue가
 * 있으면 장소명 + 지도 링크를 항상 보여주고, 관리자가 venue 카테고리 공지를 추가로
 * 올렸다면 그 내용은 장소 정보에 보조적으로 덧붙인다 — 공지 유무가 장소 정보 노출
 * 자체를 좌우하지 않는다. venue가 없는 극히 드문 edge case에서만 기존 공지-only
 * 폴백을 유지한다.
 *
 * 좌표(latitude/longitude, 카카오 지오코딩 결과)가 있으면 이 row의 "지도에서 보기"
 * 네이버 검색 링크는 렌더하지 않는다 — TournamentVenuePrepSection이 대신 실제 지도
 * 임베드 + 내비게이션 앱 딥링크 버튼을 별도로 렌더하기 때문(더 정확한 정보이므로
 * 텍스트 검색 링크와 중복 노출하지 않음). 좌표가 없으면(키 미설정/지오코딩 실패 포함)
 * 기존 네이버 지도 검색 링크 폴백을 그대로 유지 — 회귀 없음.
 */
export function getTournamentVenuePrepItems({
  venue = null,
  announcements = [],
  latitude = null,
  longitude = null,
}: {
  venue?: string | null;
  announcements?: TournamentAnnouncementSummary[];
  latitude?: number | null;
  longitude?: number | null;
}): TournamentVenuePrepItem[] {
  const venueNotice = findAnnouncementByCategory(announcements, 'venue');
  const venueNoticeLink = venueNotice ? announcementHref(venueNotice.id) : null;
  const hasCoordinates = latitude !== null && longitude !== null;

  if (venue) {
    return [
      {
        key: 'parking',
        label: '장소',
        value: venue,
        detail: '주차와 입장 동선은 지도에서 확인해요.',
        // 장소명 + 지도 링크가 이 행에 항상 함께 노출되므로 "확인 가능" 배지는
        // 아무 부가 정보 없이 중복이었다 — 배지 없음(null)으로 제거.
        status: null,
        actionLabel: hasCoordinates ? null : '지도에서 보기',
        href: hasCoordinates ? null : naverMapSearchUrl(venue),
        hrefExternal: !hasCoordinates,
        notice:
          venueNotice && venueNoticeLink
            ? { summary: `공지: ${venueNotice.title}`, actionLabel: '공지 보기', href: venueNoticeLink }
            : null,
      },
    ];
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
      hrefExternal: false,
      notice: null,
    },
  ];
}

function naverMapSearchUrl(venue: string): string {
  return `https://map.naver.com/v5/search/${encodeURIComponent(venue)}`;
}

// ── 내비게이션 앱 딥링크 (좌표 있을 때만 사용) ──────────────────────────────────

export type VenueNavPlatform = 'ios' | 'android' | 'unknown';

export type VenueNavigationLink = {
  key: 'kakao' | 'naver' | 'tmap';
  label: string;
  /** 앱 커스텀 URL 스킴 딥링크. 앱 미설치 시 브라우저가 처리(무반응 포함) — 의도된 동작. */
  appHref: string;
  fallbackLabel: string;
  fallbackHref: string;
};

const NAVER_MAP_APP_NAME = 'teameet.kr';
const TMAP_IOS_STORE_URL = 'https://apps.apple.com/kr/app/tmap/id431589174';
const TMAP_ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.skt.tmap.ku';

/**
 * 장소명+좌표로 카카오맵/네이버맵/티맵 길찾기 딥링크 3종을 만든다. 순수 함수 —
 * 플랫폼 감지(UA sniffing)는 호출부(클라이언트 컴포넌트)에서 한 줄로 하고 결과만
 * platform 인자로 전달한다(모델 자체는 브라우저 API에 의존하지 않아 테스트하기 쉽다).
 */
export function getVenueNavigationLinks(
  venue: string,
  latitude: number,
  longitude: number,
  platform: VenueNavPlatform = 'unknown',
): VenueNavigationLink[] {
  const encodedVenue = encodeURIComponent(venue);

  return [
    {
      key: 'kakao',
      label: '카카오맵',
      appHref: `kakaomap://route?ep=${latitude},${longitude}&by=CAR`,
      fallbackLabel: '웹으로 보기',
      fallbackHref: `https://map.kakao.com/link/to/${encodedVenue},${latitude},${longitude}`,
    },
    {
      key: 'naver',
      label: '네이버지도',
      appHref: `nmap://route/car?dlat=${latitude}&dlng=${longitude}&dname=${encodedVenue}&appname=${encodeURIComponent(NAVER_MAP_APP_NAME)}`,
      fallbackLabel: '웹으로 보기',
      fallbackHref: `https://map.naver.com/v5/directions/-/-/-/car?destination=${longitude},${latitude}`,
    },
    {
      key: 'tmap',
      label: '티맵',
      appHref: `tmap://route?goalx=${longitude}&goaly=${latitude}&goalname=${encodedVenue}`,
      fallbackLabel: '설치하기',
      fallbackHref: platform === 'ios' ? TMAP_IOS_STORE_URL : TMAP_ANDROID_STORE_URL,
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
