import { describe, expect, it } from 'vitest';
import type { CursorPage, V1Team, V1TeamMatch, V1TournamentListItem, V1TournamentListPage } from '@/types/api';
import { formatLandingCount, sportChips, summarizeLandingData } from './landing-v4-data';

const NOW = new Date('2026-09-28T00:00:00.000Z');
const FUTURE = '2026-10-01T09:00:00.000Z';
const PAST = '2026-09-01T09:00:00.000Z';

function tournament(overrides: Partial<V1TournamentListItem>): V1TournamentListItem {
  return {
    id: 't-default',
    title: '기본 대회',
    status: 'open',
    scheduledAt: FUTURE,
    sport: { code: 'futsal', name: '풋살' },
    promoHomeEnabled: false,
    promoHomePriority: 0,
    promoHomeDateText: null,
    promoHomeLocationText: null,
    promoHomeTeamsText: null,
    promoHomePrizeText: null,
    ...overrides,
  } as V1TournamentListItem;
}

function teamMatch(overrides: Partial<V1TeamMatch>): V1TeamMatch {
  return {
    id: overrides.id ?? 'tm-default',
    title: '기본 팀매치',
    status: 'matched',
    startsAt: FUTURE,
    sport: { sportId: 's', name: '풋살' },
    hostTeam: { teamId: 'h', name: '홈팀' },
    approvedOpponentTeam: { teamId: 'o', name: '상대팀' },
    ...overrides,
  } as V1TeamMatch;
}

function tournamentPage(items: V1TournamentListItem[], hasNext = false): V1TournamentListPage {
  return { items, pageInfo: { nextCursor: null, hasNext } };
}

function cursorPage<T>(items: T[], hasNext = false): CursorPage<T> {
  return { items, nextCursor: null, pageInfo: { nextCursor: null, hasNext } };
}

describe('summarizeLandingData', () => {
  it('홍보(promoHomeEnabled)가 꺼진 대회는 지금 열려 있어요에서 빠진다', () => {
    const on = tournament({ id: 'on', promoHomeEnabled: true });
    const off = tournament({ id: 'off', promoHomeEnabled: false });
    const data = summarizeLandingData(null, tournamentPage([off, on]), null, NOW);
    expect(data.tournaments.map((c) => c.id)).toEqual(['on']);
  });

  it('상태 우선순위(in_progress > open > closed)로 정렬하고 최대 3개만 남긴다', () => {
    const closed = tournament({ id: 'closed', status: 'closed', promoHomeEnabled: true });
    const open = tournament({ id: 'open', status: 'open', promoHomeEnabled: true });
    const open2 = tournament({ id: 'open2', status: 'open', promoHomeEnabled: true, promoHomePriority: 1 });
    const inProgress = tournament({ id: 'live', status: 'in_progress', promoHomeEnabled: true });
    const data = summarizeLandingData(null, tournamentPage([closed, open2, open, inProgress]), null, NOW);
    expect(data.tournaments.map((c) => c.id)).toEqual(['live', 'open', 'open2']);
  });

  it('지난 팀매치·상대 미확정 팀매치는 제외하고, 조건을 만족하는 것만 남긴다', () => {
    const upcoming = teamMatch({ id: 'upcoming', startsAt: FUTURE });
    const past = teamMatch({ id: 'past', startsAt: PAST });
    const noOpponent = teamMatch({ id: 'no-opponent', startsAt: FUTURE, approvedOpponentTeam: null });
    const data = summarizeLandingData(cursorPage([past, noOpponent, upcoming]), null, null, NOW);
    expect(data.teamMatches.map((c) => c.id)).toEqual(['upcoming']);
  });

  it('팀매치는 startsAt 오름차순으로 정렬한다', () => {
    const later = teamMatch({ id: 'later', startsAt: '2026-10-05T09:00:00.000Z' });
    const sooner = teamMatch({ id: 'sooner', startsAt: '2026-10-02T09:00:00.000Z' });
    const data = summarizeLandingData(cursorPage([later, sooner]), null, null, NOW);
    expect(data.teamMatches.map((c) => c.id)).toEqual(['sooner', 'later']);
  });

  it('다음 페이지가 있어도 이번 페이지에 모집 중이 0개면 "0개 이상"이 아니라 "0개"다', () => {
    const none = summarizeLandingData(null, tournamentPage([tournament({ status: 'completed' })], true), null, NOW);
    expect(formatLandingCount(none.counts.tournamentsOpen)).toBe('0개');
    const some = summarizeLandingData(null, tournamentPage([tournament({ status: 'open' })], true), null, NOW);
    expect(formatLandingCount(some.counts.tournamentsOpen)).toBe('1개 이상');
  });

  it('pageInfo.hasNext 가 있으면 more:true 로 "N개 이상" 표기를 만든다', () => {
    const data = summarizeLandingData(
      cursorPage([teamMatch({})], true),
      null,
      cursorPage([{ id: 'a' } as V1Team], false),
      NOW,
    );
    expect(data.counts.teamMatches).toEqual({ value: 1, more: true });
    expect(formatLandingCount(data.counts.teamMatches)).toBe('1개 이상');
    expect(data.counts.teams).toEqual({ value: 1, more: false });
    expect(formatLandingCount(data.counts.teams)).toBe('1개');
  });

  it('종목별로 팀매치·대회·팀 건수를 집계한다', () => {
    const data = summarizeLandingData(
      cursorPage([teamMatch({ sport: { sportId: 's', name: '축구' } }), teamMatch({ sport: { sportId: 's', name: '축구' } })]),
      tournamentPage([tournament({ sport: { code: 'soccer', name: '축구' } })]),
      cursorPage([{ sport: { sportId: 's', name: '풋살' } } as V1Team]),
      NOW,
    );
    expect(data.bySport['축구']).toEqual({ teamMatches: 2, tournaments: 1, teams: 0 });
    expect(data.bySport['풋살']).toEqual({ teamMatches: 0, tournaments: 0, teams: 1 });
  });

  it('세 목록이 모두 null 이면 수치·종목 집계 없이 hasAnyData 도 false 다', () => {
    const data = summarizeLandingData(null, null, null, NOW);
    expect(data.counts).toEqual({ teamMatches: null, tournaments: null, tournamentsOpen: null, teams: null });
    expect(data.bySport).toEqual({});
    expect(data.hasAnyData).toBe(false);
    expect(data.tournaments).toEqual([]);
    expect(data.teamMatches).toEqual([]);
  });

  it('일부만 실패해도 hasAnyData 는 true 이고, 실패한 목록만 null 로 남는다', () => {
    const data = summarizeLandingData(cursorPage([teamMatch({})]), null, null, NOW);
    expect(data.hasAnyData).toBe(true);
    expect(data.counts.teamMatches).toEqual({ value: 1, more: false });
    expect(data.counts.tournaments).toBeNull();
  });

  it('모집 중(open) 대회 개수를 페이지 안에서 따로 센다', () => {
    const data = summarizeLandingData(
      null,
      tournamentPage([tournament({ status: 'open' }), tournament({ status: 'closed' }), tournament({ status: 'open' })]),
      null,
      NOW,
    );
    expect(data.counts.tournamentsOpen).toEqual({ value: 2, more: false });
  });

  it('팀매치는 최대 6개까지 남기고, 로고·장소·형식·수준을 싣는다(없는 값은 null)', () => {
    const items = Array.from({ length: 7 }, (_, i) =>
      teamMatch({ id: `m${i}`, startsAt: `2026-10-0${i + 1}T09:00:00.000Z` }),
    );
    items[0] = teamMatch({
      id: 'm0',
      startsAt: '2026-10-01T09:00:00.000Z',
      hostTeam: { teamId: 'h', name: '마포 레인저스', logoUrl: '/logo/h.png' },
      approvedOpponentTeam: { teamId: 'o', name: '한강 로버스', logoUrl: null },
      place: { name: '케이풋살파크' },
      matchFormat: '4:4',
      levelLabel: '입문',
    });
    const data = summarizeLandingData(cursorPage(items), null, null, NOW);
    expect(data.teamMatches).toHaveLength(6);
    expect(data.teamMatches[0]).toMatchObject({
      hostName: '마포 레인저스',
      hostLogoUrl: '/logo/h.png',
      opponentLogoUrl: null,
      place: '케이풋살파크',
      formatText: '4:4',
      levelLabel: '입문',
    });
    expect(data.teamMatches[1]).toMatchObject({ hostLogoUrl: null, place: null, formatText: null, levelLabel: null });
  });

  it('대회 이미지는 홈 홍보 이미지 > 커버 > null 순이고, 형식 라벨은 리그를 먼저 가른다', () => {
    const promo = tournament({ id: 'a', promoHomeEnabled: true, promoHomeImageUrl: '/p.png', coverImageUrl: '/c.png', format: 'knockout', kind: 'regular_tournament' });
    const cover = tournament({ id: 'b', promoHomeEnabled: true, promoHomeImageUrl: null, coverImageUrl: '/c.png', format: 'group_knockout', kind: 'regular_league' });
    const none = tournament({ id: 'c', promoHomeEnabled: true, promoHomeImageUrl: null, coverImageUrl: null, format: 'group_knockout', kind: null });
    const byId = Object.fromEntries(summarizeLandingData(null, tournamentPage([promo, cover, none]), null, NOW).tournaments.map((t) => [t.id, t]));
    expect([byId.a.imageUrl, byId.b.imageUrl, byId.c.imageUrl]).toEqual(['/p.png', '/c.png', null]);
    expect([byId.a.formatLabel, byId.b.formatLabel, byId.c.formatLabel]).toEqual(['토너먼트', '리그 방식', '조별리그 + 토너먼트']);
  });

  it('정원 칸은 정원이 있는 모집 중 대회에만 있다(리그·진행 중은 null)', () => {
    const open = tournament({ id: 'open', status: 'open', promoHomeEnabled: true, teamCount: 4, confirmedCount: 1, format: 'knockout', kind: null });
    const league = tournament({ id: 'league', status: 'open', promoHomeEnabled: true, teamCount: 8, confirmedCount: 2, format: 'league', kind: null });
    const live = tournament({ id: 'live', status: 'in_progress', promoHomeEnabled: true, teamCount: 4, confirmedCount: 4, format: 'knockout', kind: null });
    const byId = Object.fromEntries(summarizeLandingData(null, tournamentPage([open, league, live]), null, NOW).tournaments.map((t) => [t.id, t]));
    expect(byId.open.slots).toEqual({ confirmed: 1, total: 4 });
    expect(byId.league.slots).toBeNull();
    expect(byId.live.slots).toBeNull();
  });
});

describe('sportChips', () => {
  it('지표가 있는 종목만 많은 순으로 칩을 만들고, 0건 운영 종목은 한 줄로 묶는다', () => {
    const bySport = {
      축구: { teamMatches: 11, tournaments: 0, teams: 3 },
      풋살: { teamMatches: 74, tournaments: 2, teams: 0 },
    };
    expect(sportChips(bySport, 'teamMatches')).toEqual({
      chips: [{ name: '풋살', count: 74 }, { name: '축구', count: 11 }],
      soon: '러닝·수영 준비 중',
    });
    expect(sportChips(bySport, 'teams')).toEqual({ chips: [{ name: '축구', count: 3 }], soon: '풋살·러닝·수영 준비 중' });
  });

  it('운영 종목이 전부 있으면 준비 중 줄이 없다', () => {
    const one = { teamMatches: 1, tournaments: 0, teams: 0 };
    expect(sportChips({ 풋살: one, 축구: one, 러닝: one, 수영: one }, 'teamMatches').soon).toBeNull();
  });
});
