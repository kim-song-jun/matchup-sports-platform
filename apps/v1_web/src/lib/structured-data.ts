import { absoluteSiteUrl, getSiteOrigin } from '@/lib/seo';
import type { V1TeamDetail, V1TournamentDetail, V1TournamentStatus } from '@/types/api';

/**
 * JSON-LD(schema.org 구조화 데이터) 빌더.
 *
 * 두 가지 규약을 지킨다:
 *
 * 1. **가시 텍스트와 100% 일치.** 화면에 없는 사실을 LD에만 넣으면 검색엔진이 스팸으로
 *    판정한다. 여기 들어가는 필드는 전부 해당 화면이 실제로 렌더하는 값이다
 *    (대회 상세: 종목·일정·장소·참가비·참가 팀 / 팀 상세: 종목·지역·소개).
 * 2. **엔티티는 전역에서 하나의 `@id`.** 페이지마다 Organization을 새로 선언하면
 *    검색엔진·LLM 안에서 같은 실체가 여러 개로 쪼개진다. 조직·사이트는 루트 레이아웃에서
 *    한 번만 선언하고, 개별 페이지는 `@id`로 참조만 한다.
 */

export const ORGANIZATION_NAME = 'Teameet';
export const ORGANIZATION_ALTERNATE_NAME = '팀밋';

/** 실제로 운영 중인 공식 표면만 넣는다 — 없는 계정을 적으면 엔티티 신뢰가 깨진다. */
const OFFICIAL_SURFACES = ['https://www.instagram.com/teameet_official/'] as const;
const CONTACT_EMAIL = 'teameetsports@naver.com';

export function organizationId(): string {
  return `${getSiteOrigin()}/#organization`;
}

export function websiteId(): string {
  return `${getSiteOrigin()}/#website`;
}

export type JsonLdNode = Record<string, unknown>;

/**
 * 이미지 URL 을 절대 URL 로 만든다.
 *
 * API 는 이미지를 `/uploads/...` 같은 **루트-상대 경로로만** 내려준다(실측: 대회·팀 응답의
 * 이미지 URL 전부 상대). `og:image` 는 Next 가 `metadataBase` 로 절대화해 주지만 JSON-LD 는
 * 우리가 직접 넣는 값이라 그 보정을 받지 못한다 — 상대 경로로 나가면 크롤러가 이미지를
 * 해석하지 못할 수 있다.
 */
function absoluteImageUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : absoluteSiteUrl(value);
}


/**
 * 루트 레이아웃에서 1회만 렌더한다. Organization과 WebSite를 `@graph`로 묶어
 * "이 사이트를 운영하는 조직"과 "사이트" 사이의 관계를 명시한다.
 */
export function buildSiteIdentityLd(): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId(),
        name: ORGANIZATION_NAME,
        alternateName: ORGANIZATION_ALTERNATE_NAME,
        url: absoluteSiteUrl('/'),
        logo: absoluteSiteUrl('/brand/icon-512.png'),
        description:
          '풋살·농구·배드민턴 등 생활체육 종목의 아마추어 대회와 팀·매치를 운영하는 멀티스포츠 매칭 플랫폼.',
        sameAs: [...OFFICIAL_SURFACES],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: CONTACT_EMAIL,
          availableLanguage: ['ko'],
        },
      },
      {
        '@type': 'WebSite',
        '@id': websiteId(),
        url: absoluteSiteUrl('/'),
        name: ORGANIZATION_NAME,
        inLanguage: 'ko-KR',
        publisher: { '@id': organizationId() },
      },
    ],
  };
}

/**
 * schema.org의 eventStatus는 4개 값만 인정한다. 우리 상태 6종 중 취소만 별도 값이 있고
 * 나머지(모집중·마감·진행중·완료)는 전부 "예정대로 진행"에 해당한다 — 없는 값을 만들어
 * 넣지 않고 표준 어휘로만 매핑한다.
 */
function eventStatusOf(status: V1TournamentStatus): string {
  if (status === 'cancelled') return 'https://schema.org/EventCancelled';
  return 'https://schema.org/EventScheduled';
}

function placeNode(tournament: V1TournamentDetail): JsonLdNode | null {
  if (!tournament.venue) return null;
  const place: JsonLdNode = {
    '@type': 'Place',
    name: tournament.venue,
    address: { '@type': 'PostalAddress', addressCountry: 'KR', name: tournament.venue },
  };
  // 좌표는 지오코딩에 성공한 대회만 갖는다(카카오 로컬 API 미설정/검색 실패 시 null).
  if (typeof tournament.latitude === 'number' && typeof tournament.longitude === 'number') {
    place.geo = {
      '@type': 'GeoCoordinates',
      latitude: tournament.latitude,
      longitude: tournament.longitude,
    };
  }
  return place;
}

export function buildSportsEventLd(
  tournament: V1TournamentDetail,
  options: { readonly image?: string | null } = {},
): JsonLdNode | null {
  // startDate는 SportsEvent의 사실상 필수 필드다. 일정 미정 대회에 가짜 날짜를 채우느니
  // LD 자체를 내보내지 않는다 — 틀린 구조화 데이터는 없는 것보다 나쁘다.
  if (!tournament.scheduledAt) return null;

  const url = absoluteSiteUrl(`/tournaments/${tournament.id}`);
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    '@id': `${url}#event`,
    name: tournament.title,
    url,
    sport: tournament.sport.name,
    startDate: tournament.scheduledAt,
    eventStatus: eventStatusOf(tournament.status),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    inLanguage: 'ko-KR',
    organizer: { '@id': organizationId() },
    isAccessibleForFree: tournament.entryFee === 0,
  };

  if (tournament.scheduledEndAt) node.endDate = tournament.scheduledEndAt;

  const place = placeNode(tournament);
  if (place) node.location = place;

  const image = options.image ?? tournament.coverImageUrl;
  if (image) node.image = absoluteImageUrl(image);

  const description = tournament.promoListSubtitle || tournament.prizeSummary;
  if (description) node.description = description.replace(/\s+/g, ' ').trim();

  // 참가비는 화면(참가 안내)에 그대로 노출되는 값이다. 무료 대회도 price 0으로 명시해야
  // 답변엔진이 "참가비 얼마"라는 질문에 이 페이지를 근거로 쓸 수 있다.
  node.offers = {
    '@type': 'Offer',
    price: tournament.entryFee,
    priceCurrency: 'KRW',
    url,
    availability:
      tournament.status === 'open'
        ? 'https://schema.org/InStock'
        : 'https://schema.org/SoldOut',
    ...(tournament.registrationDeadlineAt ? { validThrough: tournament.registrationDeadlineAt } : {}),
  };

  // 참가 팀 수는 화면에 노출되지만 LD 에는 싣지 않는다 — `maximumAttendeeCapacity` 는
  // '최대 참석 인원(개인)'을 뜻해서 팀 수를 넣으면 값의 의미가 어긋난다. 팀 수를 담을
  // 마땅한 표준 필드가 없으므로, 맞지 않는 필드에 억지로 넣느니 뺀다(멤버 수와 같은 이유).

  return node;
}

/**
 * 화면에 보이는 지역 표기를 그대로 쓴다.
 *
 * 실측: 상세 응답은 `regionName` 에 표시용 전체 이름("서울 송파구" · "서울 전체")을 주고,
 * `region.name` 에는 하위 지역명만("송파구") 준다. 후자를 우선하면 LD 가 "송파구" 로 나가
 * 화면 표기와 어긋난다 — 구조화 데이터는 가시 텍스트와 같아야 한다. `regionName` 이 없을
 * 때만 부모 지역과 조합해 같은 형태를 만든다.
 */
function displayRegionName(team: V1TeamDetail): string | null {
  const display = team.regionName?.trim();
  if (display) return display;
  const region = team.region;
  if (!region?.name) return null;
  return region.parentName ? `${region.parentName} ${region.name}` : region.name;
}

/**
 * 팀 **상세** 응답(`GET /teams/:id`)을 받는다 — 목록 응답(`V1Team`)이 아니다.
 *
 * 둘은 같은 값을 다른 자리에 담는다: 목록은 `logoUrl`·`introductionPreview` 를 최상위에 주는데,
 * 상세는 `profile.logoUrl`·`profile.introduction` 아래에 준다. 처음에 목록 타입으로 받아 쓴
 * 탓에 로고·커버·소개가 전부 `undefined` 가 되어 LD 에서 통째로 빠져 있었다(alpha 실측으로
 * 확인). 상세 화면에서만 쓰는 함수이므로 상세 구조 하나만 받는다.
 */
export function buildSportsTeamLd(team: V1TeamDetail): JsonLdNode {
  const id = team.id ?? team.teamId;
  const url = absoluteSiteUrl(`/teams/${id}`);
  const sportName = team.sport?.name ?? team.sportName;
  const regionName = displayRegionName(team);
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'SportsTeam',
    '@id': `${url}#team`,
    name: team.name,
    url,
    inLanguage: 'ko-KR',
    memberOf: { '@id': organizationId() },
  };

  if (sportName) node.sport = sportName;
  if (regionName) {
    node.location = {
      '@type': 'Place',
      name: regionName,
      address: { '@type': 'PostalAddress', addressCountry: 'KR', addressRegion: regionName },
    };
  }
  if (team.profile?.introduction) {
    node.description = team.profile.introduction.replace(/\s+/g, ' ').trim();
  }
  if (team.profile?.logoUrl) node.logo = absoluteImageUrl(team.profile.logoUrl);
  const image = team.profile?.coverImageUrl || team.profile?.logoUrl;
  if (image) node.image = absoluteImageUrl(image);
  // 멤버 수는 화면에 "N명"으로 노출되지만 SportsTeam에 이를 담는 표준 필드가 없다.
  // `member`는 Person/Organization을 기대하고 `numberOfEmployees`는 팀이 아니라 회사용이다 —
  // 맞지 않는 필드에 억지로 넣느니 빼는 쪽이 구조화 데이터의 신뢰를 지킨다.

  return node;
}

export type BreadcrumbItem = { readonly name: string; readonly path: string };

export function buildBreadcrumbLd(items: readonly BreadcrumbItem[]): JsonLdNode {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteSiteUrl(item.path),
    })),
  };
}

/**
 * `</script>`로 스크립트 태그를 조기 종료시키는 XSS를 막는다. JSON-LD는 script 태그
 * 안에 원문 그대로 들어가야 하므로(HTML 엔티티 이스케이프 불가) `<`를 유니코드
 * 이스케이프로 바꾸는 것이 표준 방어다 — JSON 파서는 `<`를 `<`로 되돌려 읽는다.
 */
export function serializeJsonLd(data: JsonLdNode): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
