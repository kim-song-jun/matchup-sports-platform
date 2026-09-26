import type { PublicMatchDetail, PublicSideSummary } from '@/components/public-game-records/types';
import { absoluteSiteUrl } from '@/lib/seo';
import { organizationId, type JsonLdNode } from '@/lib/structured-data';
import type { V1LeagueStandingsResponse, V1PublicLeagueDetail } from '@/types/league-match';

/**
 * 리그·대회 경기 단위 JSON-LD. `structured-data.ts` 와 같은 두 규약을 따른다 — 화면에 보이는 값만,
 * 엔티티는 전역 `@id` 로 연결. 팀은 팀 상세의 `…/teams/:id#team`, 대회는 대회 상세의
 * `…/tournaments/:id#event` 와 같은 `@id` 를 써서 검색엔진·LLM 이 같은 실체로 잇게 한다.
 */

function teamRef(teamId: string | null | undefined, name: string): JsonLdNode {
  if (!teamId) return { '@type': 'SportsTeam', name };
  const url = absoluteSiteUrl(`/teams/${teamId}`);
  return { '@type': 'SportsTeam', '@id': `${url}#team`, name, url };
}

function sideRef(side: PublicSideSummary | null): JsonLdNode | null {
  return side?.teamName ? teamRef(side.teamId, side.teamName) : null;
}

export function buildLeagueEventLd(
  league: V1PublicLeagueDetail,
  standings: V1LeagueStandingsResponse | null,
): JsonLdNode {
  const url = absoluteSiteUrl(`/league-matches/${league.leagueId}`);
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    '@id': `${url}#event`,
    name: league.title,
    url,
    startDate: league.startsOn,
    endDate: league.endsOn,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    inLanguage: 'ko-KR',
    organizer: { '@id': organizationId() },
  };
  // 순위표에 이름이 보이는 팀만 참가 팀으로 싣는다(대진 없는 준비 중 리그는 순위표가 비어 있다).
  const competitors = (standings?.standings ?? [])
    .filter((row) => row.teamName)
    .map((row) => teamRef(row.teamId, row.teamName));
  if (competitors.length > 0) node.competitor = competitors;
  return node;
}

/** schema.org 에 점수 필드가 없어 description 으로 싣는다 — 확정 결과만(진행 중·확정 전 점수는 인용되면 안 된다). */
function officialScoreText(match: PublicMatchDetail, home: string, away: string): string | null {
  if (match.scoreStatus !== 'official' || !match.score) return null;
  const penalties = match.score.penalties
    ? ` (승부차기 ${match.score.penalties.home} : ${match.score.penalties.away})`
    : '';
  return `최종 스코어 ${home} ${match.score.home} : ${match.score.away} ${away}${penalties}`;
}

export function buildFixtureEventLd(match: PublicMatchDetail): JsonLdNode | null {
  // SportsEvent 의 사실상 필수 필드. 일정 미정 경기에 가짜 날짜를 채우지 않는다.
  if (!match.scheduledAt) return null;

  const tournamentUrl = absoluteSiteUrl(`/tournaments/${match.tournamentId}`);
  const url = absoluteSiteUrl(`/tournaments/${match.tournamentId}/matches/${match.fixtureId}`);
  const homeName = match.home?.teamName ?? '미정';
  const awayName = match.away?.teamName ?? '미정';
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    '@id': `${url}#event`,
    name: `${homeName} vs ${awayName} | ${match.tournamentTitle} ${match.round}`,
    url,
    startDate: match.scheduledAt,
    eventStatus: match.status === 'cancelled'
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    inLanguage: 'ko-KR',
    organizer: { '@id': organizationId() },
    superEvent: { '@id': `${tournamentUrl}#event` },
  };

  const home = sideRef(match.home);
  const away = sideRef(match.away);
  if (home) node.homeTeam = home;
  if (away) node.awayTeam = away;

  const venue = [match.venue, match.fieldName].filter(Boolean).join(' ');
  if (venue) {
    node.location = {
      '@type': 'Place',
      name: venue,
      address: { '@type': 'PostalAddress', addressCountry: 'KR', name: venue },
    };
  }

  const score = officialScoreText(match, homeName, awayName);
  if (score) node.description = score;
  return node;
}
