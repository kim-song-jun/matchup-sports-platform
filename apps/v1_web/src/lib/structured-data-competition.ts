import type { PublicMatchDetail } from '@/components/public-game-records/types';
import { fixtureDetailHref } from '@/lib/fixture-detail-route';
import { absoluteSiteUrl } from '@/lib/seo';
import { organizationId, teamReference, type JsonLdNode } from '@/lib/structured-data';
import { competitionFixtureName } from '@/lib/tournament-round-label';

/**
 * 리그·대회 경기 단위 JSON-LD. `structured-data.ts` 와 같은 두 규약을 따른다 — 화면에 보이는 값만,
 * 엔티티는 전역 `@id` 로 연결. 팀은 팀 상세의 `…/teams/:id#team`, 대회는 대회 상세의
 * `…/tournaments/:id#event` 와 같은 `@id` 를 써서 검색엔진·LLM 이 같은 실체로 잇게 한다.
 */

/** schema.org 에 점수 필드가 없어 description 으로 싣는다 — 확정 결과만(진행 중·확정 전 점수는 인용되면 안 된다). */
function officialScoreText(match: PublicMatchDetail, home: string, away: string): string | null {
  if (match.scoreStatus !== 'official' || !match.score) return null;
  const penalties = match.score.penalties
    ? ` (승부차기 ${match.score.penalties.home} : ${match.score.penalties.away})`
    : '';
  return `최종 스코어 ${home} ${match.score.home} : ${match.score.away} ${away}${penalties}`;
}

/** `isRegularLeague` 는 canonical 을 정한 판정과 같은 값이어야 한다 — url 이 canonical 과 다른 주소를 가리키면 안 된다. */
export function buildFixtureEventLd(
  match: PublicMatchDetail,
  { isRegularLeague }: { readonly isRegularLeague: boolean },
): JsonLdNode | null {
  // SportsEvent 의 사실상 필수 필드. 일정 미정 경기에 가짜 날짜를 채우지 않는다.
  if (!match.scheduledAt) return null;

  const url = absoluteSiteUrl(fixtureDetailHref({
    isRegularLeague,
    competitionId: match.tournamentId,
    fixtureId: match.fixtureId,
  }));
  const homeName = match.home?.teamName ?? '미정';
  const awayName = match.away?.teamName ?? '미정';
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    '@id': `${url}#event`,
    name: `${homeName} vs ${awayName} | ${match.tournamentTitle} ${competitionFixtureName(match)}`,
    url,
    startDate: match.scheduledAt,
    eventStatus: match.status === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    inLanguage: 'ko-KR',
    organizer: { '@id': organizationId() },
  };

  const home = teamReference(match.home?.teamId, match.home?.teamName);
  const away = teamReference(match.away?.teamId, match.away?.teamName);
  if (home) node.homeTeam = home;
  if (away) node.awayTeam = away;

  const venue = [match.venue, match.fieldName].filter(Boolean).join(' ');
  if (venue) {
    const place = match.place;
    const location: JsonLdNode = {
      '@type': 'Place',
      name: venue,
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'KR',
        name: venue,
        ...(place?.address ? { streetAddress: place.address } : {}),
      },
    };
    if (typeof place?.latitude === 'number' && typeof place.longitude === 'number') {
      location.geo = { '@type': 'GeoCoordinates', latitude: place.latitude, longitude: place.longitude };
    }
    node.location = location;
  }

  const score = officialScoreText(match, homeName, awayName);
  if (score) node.description = score;
  return node;
}
