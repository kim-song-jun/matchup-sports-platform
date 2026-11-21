import type { Metadata } from 'next';
import type { PublicMatchDetail, PublicTeamRecordsResponse } from '@/components/public-game-records/types';
import { bracketIntroLine, competitionFormatLabel, isLeagueCompetition } from '@/lib/competition-kind';
import {
  formatEntryFee,
  formatTournamentDateLong,
  formatTournamentDateRangeLong,
  formatTournamentDateTimeLong,
} from '@/lib/date-utils';
import { socialImageSrc } from '@/lib/og-image';
import { maskContactNumbers } from '@/lib/public-text';
import { competitionFixtureName } from '@/lib/tournament-round-label';
import { resolveTournamentRegistrationBlock } from '@/lib/tournament-registration-availability';
import type { ApiEnvelope, V1TournamentDetail, V1TournamentStatus } from '@/types/api';

const DEFAULT_SITE_ORIGIN = 'https://teameet.co.kr';
/**
 * 커버가 없는 페이지의 링크 미리보기. `app/opengraph-image.tsx` 가 이 경로·크기로 그린다.
 * 카카오톡·페이스북·X 의 큰 카드 규격(1.91:1)이라 정사각 앱 아이콘처럼 잘리지 않는다.
 */
export const DEFAULT_SOCIAL_IMAGE = { path: '/opengraph-image', width: 1200, height: 630 } as const;

export const NOTICES_FEED_PATH = '/notices/feed.xml';

/**
 * RSS 자동 발견 링크. Next 는 `alternates` 를 세그먼트마다 **통째로 교체**하므로, 레이아웃에만 두면
 * canonical 을 선언하는 공개 페이지에서 사라진다 — 레이아웃과 buildPublicMetadata 가 같이 쓴다.
 */
export const SITE_FEED_ALTERNATE_TYPES = {
  'application/rss+xml': [{ url: NOTICES_FEED_PATH, title: 'Teameet 공지사항' }],
};

/**
 * 검색엔진 소유확인 메타(네이버·구글·빙). 정적 프리렌더 페이지(루트 `/` 포함)는 빌드 시점 값을 구워 두므로
 * 이 변수들은 Docker build-arg 로도 넘겨야 한다(deploy/Dockerfile.v1-web). 빈 값은 태그를 내보내지 않는다.
 */
export function buildSiteVerification(): Metadata['verification'] | undefined {
  const naver = process.env.NAVER_SITE_VERIFICATION?.trim();
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const bing = process.env.BING_SITE_VERIFICATION?.trim();
  const other: Record<string, string> = {};
  if (naver) other['naver-site-verification'] = naver;
  if (bing) other['msvalidate.01'] = bing;
  if (!google && Object.keys(other).length === 0) return undefined;
  return {
    ...(google ? { google } : {}),
    ...(Object.keys(other).length > 0 ? { other } : {}),
  };
}

type PublicMetadataInput = {
  title: string;
  description: string;
  path: string;
  image?: string | null;
  /** 정사각 이미지(팀 로고 등). X 의 큰 카드는 1.91:1 로 잘라 위아래가 잘리므로 작은 카드로 보낸다. */
  squareImage?: boolean;
  type?: 'website' | 'article';
};

export function getSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return DEFAULT_SITE_ORIGIN;

  try {
    const parsed = new URL(configured);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return DEFAULT_SITE_ORIGIN;
    if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      return DEFAULT_SITE_ORIGIN;
    }
    return parsed.origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export function absoluteSiteUrl(pathname: string): string {
  return new URL(pathname, `${getSiteOrigin()}/`).toString();
}

export function buildPublicMetadata({
  title,
  description,
  path,
  image,
  squareImage = false,
  type = 'website',
}: PublicMetadataInput): Metadata {
  const socialTitle = `${title} | Teameet`;
  const imageUrl = socialImageSrc(image || DEFAULT_SOCIAL_IMAGE.path);
  // 크기를 아는 건 기본 이미지뿐이다 — 업로드 커버는 비율이 제각각이라 추측해 적지 않는다.
  const ogImage = image
    ? { url: imageUrl, alt: title }
    : { url: imageUrl, width: DEFAULT_SOCIAL_IMAGE.width, height: DEFAULT_SOCIAL_IMAGE.height, alt: title };

  return {
    title,
    description,
    alternates: { canonical: path, types: SITE_FEED_ALTERNATE_TYPES },
    robots: { index: true, follow: true },
    openGraph: {
      type,
      locale: 'ko_KR',
      siteName: 'Teameet',
      title: socialTitle,
      description,
      url: path,
      images: [ogImage],
    },
    twitter: {
      card: image && squareImage ? 'summary' : 'summary_large_image',
      title: socialTitle,
      description,
      images: [imageUrl],
    },
  };
}

/**
 * 팀 목록·상세의 메타 설명 폴백 문구.
 *
 * 종목·지역은 둘 다 없을 수 있는데(마스터 미연결 팀 등), 템플릿에 그대로 끼우면
 * "undefined · null에서 활동하는 …" 이 검색 결과에 그대로 노출된다. 있는 조각만 조합한다.
 */
export function teamDescriptionFallback(
  teamName: string,
  sportName?: string | null,
  regionName?: string | null,
): string {
  const sport = sportName?.trim();
  const region = regionName?.trim();
  const entityName = teamName.trim().endsWith('팀') ? teamName.trim() : `${teamName.trim()} 팀`;
  if (sport && region) return `${sport} · ${region}에서 활동하는 ${entityName}을 만나보세요.`;
  if (region) return `${region}에서 활동하는 ${entityName}을 만나보세요.`;
  if (sport) return `${sport}을 함께할 ${entityName}을 만나보세요.`;
  return `${entityName}을 만나보세요.`;
}

/**
 * 매치·팀매치 상세의 메타 설명 폴백. 상세 응답은 종목·장소를 `sport.name`·`place.name` 에 담아
 * 평평한 `sportName`·`placeName` 이 비어 있을 수 있다 — 있는 조각만 조합한다.
 */
export function matchDescriptionFallback(
  kind: '개인 매치' | '팀매치',
  sportName?: string | null,
  placeName?: string | null,
): string {
  const sport = sportName?.trim();
  const place = placeName?.trim();
  if (sport && place) return `${sport} · ${place}에서 열리는 ${kind} 정보를 확인해 보세요.`;
  if (place) return `${place}에서 열리는 ${kind} 정보를 확인해 보세요.`;
  if (sport) return `${sport} ${kind} 정보를 확인해 보세요.`;
  return `${kind} 정보를 확인해 보세요.`;
}

export function buildNoIndexMetadata(title: string, description?: string): Metadata {
  return {
    title,
    ...(description ? { description } : {}),
    robots: { index: false, follow: false, nocache: true },
  };
}

// 이보다 짧은 사용자 입력("dfd"·"ㅇㅇ")은 검색 결과·AI 요약에 쓸 설명이 못 된다 — 종목·장소가 든 기본 문구가 낫다.
const MIN_DESCRIPTION_LENGTH = 15;

/** 운영자가 정한 이름을 보존하면서 실제 종목·대회 유형을 검색 제목에 명시한다. */
export function buildTournamentTitle(tournament: Pick<V1TournamentDetail, 'title' | 'sport' | 'kind'>): string {
  const context = `${tournament.sport.name} ${tournament.kind === 'regular_league' ? '리그' : '대회'}`;
  return tournament.title.includes(context) ? tournament.title : `${tournament.title} · ${context}`;
}

export function metadataDescription(value: string | null | undefined, fallback: string): string {
  // 번호는 길이 판정과 자르기 전에 가린다 — 자르기 경계에서 앞자리만 남아 드러나는 일을 막는다.
  // fallback 도 제목처럼 사용자 글일 수 있어 같은 정리를 거친다.
  const clean = (text: string | null | undefined) => maskContactNumbers(text?.replace(/\s+/g, ' ')).trim();
  const normalized = clean(value);
  if (!normalized || normalized.length < MIN_DESCRIPTION_LENGTH) return clean(fallback);
  return normalized.length > 155 ? `${normalized.slice(0, 152).trimEnd()}…` : normalized;
}

const TOURNAMENT_STATUS_PHRASE: Partial<Record<V1TournamentStatus, string>> = {
  closed: '신청 마감',
  in_progress: '진행 중',
  completed: '대회 종료',
  cancelled: '대회 취소',
};

/** 대회 상세·하위 화면 설명이 함께 쓰는 앞쪽 사실: 일정 · 장소 · 종목과 방식. */
function tournamentFactParts(
  tournament: Pick<V1TournamentDetail, 'sport' | 'format' | 'kind' | 'scheduledAt' | 'scheduledEndAt' | 'venue'>,
): Array<string | null> {
  return [
    tournament.scheduledAt ? formatTournamentDateRangeLong(tournament.scheduledAt, tournament.scheduledEndAt) : null,
    tournament.venue?.trim() || null,
    `${tournament.sport.name} ${competitionFormatLabel(tournament)}`,
  ];
}

/**
 * 대회 검색 설명문. 주최자 소개는 이모지 한 줄("⚽️ 5대5 풋살 ⚽️")인 경우가 많아 검색 결과·AI 요약이
 * 일정도 장소도 모른다 — 사람이 대회를 고를 때 묻는 사실(언제·어디·방식·참가비·자리)을 앞에 둔다.
 */
export function buildTournamentDescription(
  tournament: Pick<
    V1TournamentDetail,
    | 'sport'
    | 'format'
    | 'kind'
    | 'status'
    | 'scheduledAt'
    | 'scheduledEndAt'
    | 'venue'
    | 'entryFee'
    | 'entryFeeConfigured'
    | 'teamCount'
    | 'confirmedCount'
    | 'pendingPaymentCount'
    | 'registrationDeadlineAt'
    | 'prizeSummary'
    | 'promoListSubtitle'
  >,
): string {
  const facts = [
    ...tournamentFactParts(tournament),
    // 미설정 리그의 entryFee 0 은 '무료' 가 아니라 미확정이다.
    tournament.kind === 'regular_league' && !tournament.entryFeeConfigured
      ? null
      : `참가비 ${formatEntryFee(tournament.entryFee)}`,
  ];
  const block = resolveTournamentRegistrationBlock(tournament);
  if (tournament.status === 'open') {
    if (tournament.kind !== 'regular_league' && tournament.teamCount) facts.push(`${tournament.teamCount}팀 중 ${tournament.confirmedCount}팀 확정`);
    if (block === 'deadline_passed') facts.push('신청 마감됨');
    else if (block === 'capacity_full') facts.push('정원 마감');
    if (tournament.registrationDeadlineAt) facts.push(`신청 마감 ${formatTournamentDateLong(tournament.registrationDeadlineAt)}`);
  } else {
    facts.push(TOURNAMENT_STATUS_PHRASE[tournament.status] ?? null);
  }
  facts.push(tournament.prizeSummary?.trim() || null);
  const factLine = facts.filter(Boolean).join(' · ');
  const organizerLine = tournament.promoListSubtitle?.replace(/\s+/g, ' ').trim();
  return metadataDescription(
    organizerLine && organizerLine.length >= MIN_DESCRIPTION_LENGTH ? `${factLine} — ${organizerLine}` : factLine,
    `${tournament.sport.name} 대회의 일정, 참가 조건과 경기 정보를 확인해 보세요.`,
  );
}

type TournamentSubpageSection = 'bracket' | 'results' | 'awards';

const SUBPAGE_PURPOSE: Record<Exclude<TournamentSubpageSection, 'bracket'>, string> = {
  results: '경기별 결과와 기록을 확인하세요.',
  awards: 'MVP와 개인 시상 결과를 확인하세요.',
};

/**
 * 대회 하위 화면(대진표·결과·시상) 검색 설명. 화면 목적 한 문장 뒤에 일정·장소·방식·진행 상태를 붙여
 * 같은 대회의 상세·하위 화면끼리, 대회끼리 설명이 갈리게 한다. 일정·장소를 모르면 방식·상태만 붙는다.
 */
export function buildTournamentSubpageDescription(
  tournament: Pick<
    V1TournamentDetail,
    'title' | 'sport' | 'format' | 'kind' | 'status' | 'scheduledAt' | 'scheduledEndAt' | 'venue'
  >,
  section: TournamentSubpageSection,
): string {
  const purpose = section === 'bracket'
    ? isLeagueCompetition(tournament)
      ? bracketIntroLine(tournament)
      : '조별 순위와 토너먼트 대진표를 확인하세요.'
    : SUBPAGE_PURPOSE[section];
  const facts = [...tournamentFactParts(tournament), TOURNAMENT_STATUS_PHRASE[tournament.status] ?? null]
    .filter(Boolean)
    .join(' · ');
  return metadataDescription(`${tournament.title}의 ${purpose} ${facts}`, `${tournament.title}의 ${purpose}`);
}

/** 확정 결과만 점수 문장이 된다 — 진행 중·확정 전 점수는 검색 결과·AI 답변에 인용되면 안 된다. */
export function officialScoreText(
  match: Pick<PublicMatchDetail, 'scoreStatus' | 'score'>,
  home: string,
  away: string,
): string | null {
  if (match.scoreStatus !== 'official' || !match.score) return null;
  const penalties = match.score.penalties
    ? ` (승부차기 ${match.score.penalties.home} : ${match.score.penalties.away})`
    : '';
  return `최종 스코어 ${home} ${match.score.home} : ${match.score.away} ${away}${penalties}`;
}

/** 구장 이름이 장소 이름과 같은 경기(운영자가 같은 값을 두 칸에 넣은 행)는 한 번만 적는다. */
export function fixtureVenueText(match: Pick<PublicMatchDetail, 'venue' | 'fieldName'>): string {
  const venue = match.venue?.trim() ?? '';
  const field = match.fieldName?.trim() ?? '';
  return field && field !== venue ? [venue, field].filter(Boolean).join(' ') : venue;
}

/**
 * 경기 상세 검색 설명. 같은 대회 경기는 대회명·라운드가 같아 제목만으로는 서로 갈리지 않으므로
 * 팀 · 일정 · 장소 · 확정 점수를 앞에 둔다. 일정이 미정이면 날짜는 적지 않고(가짜 날짜 금지),
 * 날짜·확정 점수·장소가 모두 없을 때만 기본 문구로 둔다.
 */
export function buildFixtureDescription(
  match: Pick<
    PublicMatchDetail,
    | 'tournamentTitle'
    | 'displayTitle'
    | 'round'
    | 'groupName'
    | 'legNumber'
    | 'scheduledAt'
    | 'venue'
    | 'fieldName'
    | 'home'
    | 'away'
    | 'status'
    | 'scoreStatus'
    | 'score'
  >,
): string {
  const fixtureName = `${match.tournamentTitle} ${competitionFixtureName(match)}`;
  const fallback = `${fixtureName} 경기 기록을 확인하세요.`;

  const home = match.home?.teamName ?? '미정';
  const away = match.away?.teamName ?? '미정';
  const score = officialScoreText(match, home, away);
  const venue = fixtureVenueText(match);
  if (!match.scheduledAt && !score && !venue) return metadataDescription(null, fallback);
  const facts = [
    score ?? `${home} vs ${away}`,
    match.status === 'cancelled' ? '취소된 경기' : null,
    match.scheduledAt ? formatTournamentDateTimeLong(match.scheduledAt) : null,
    venue || null,
  ];
  return metadataDescription(`${facts.filter(Boolean).join(' · ')} — ${fixtureName} 경기 일정과 득점·카드 기록을 확인하세요.`, fallback);
}

/** 팀 전적 검색 설명. 공식 경기가 하나도 없으면 전적 숫자를 적지 않는다. */
export function buildTeamRecordsDescription(
  records: Pick<PublicTeamRecordsResponse, 'teamName' | 'summary' | 'availableSeasons'>,
): string {
  const { played, won, drawn, lost } = records.summary;
  const lead = `${records.teamName}의 공식 경기 전적과 최근 결과를 확인하세요.`;
  if (played <= 0) return metadataDescription(lead, lead);
  const seasons = records.availableSeasons;
  const seasonRange = seasons.length > 1 ? `${seasons[seasons.length - 1]}~${seasons[0]}년 ` : seasons.length === 1 ? `${seasons[0]}년 ` : '';
  return metadataDescription(`${lead} ${seasonRange}공식 ${played}경기 ${won}승 ${drawn}무 ${lost}패`, lead);
}

export async function fetchPublicV1<T>(path: string, options: { cache?: 'no-store' } = {}): Promise<T | null> {
  const response = await fetch(`${getInternalApiOrigin()}/api/v1${path}`, {
    headers: { accept: 'application/json' },
    ...(options.cache === 'no-store' ? { cache: 'no-store' as const } : { next: { revalidate: 300 } }),
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`SEO metadata request failed: ${path} (${response.status})`);

  const envelope = (await response.json()) as ApiEnvelope<T>;
  return envelope.data;
}

function getInternalApiOrigin(): string {
  const configured = process.env.INTERNAL_API_ORIGIN
    ?? process.env.NEXT_PUBLIC_API_URL?.replace(/\/api\/v1\/?$/, '');
  if (configured) return configured.replace(/\/$/, '');
  return process.env.NODE_ENV === 'production' ? 'http://v1_api:8121' : 'http://localhost:8121';
}
