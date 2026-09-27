import { describe, expect, it } from 'vitest';
import type { CursorPage, V1Team, V1TeamMatch, V1TournamentListItem, V1TournamentListPage } from '@/types/api';
import { formatLandingCount, summarizeLandingData } from './landing-v4-data';

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
    expect(data.live.map((c) => c.id)).toEqual(['on']);
  });

  it('상태 우선순위(in_progress > open > closed)로 정렬하고 최대 2개만 남긴다', () => {
    const closed = tournament({ id: 'closed', status: 'closed', promoHomeEnabled: true });
    const open = tournament({ id: 'open', status: 'open', promoHomeEnabled: true });
    const inProgress = tournament({ id: 'live', status: 'in_progress', promoHomeEnabled: true });
    const data = summarizeLandingData(null, tournamentPage([closed, open, inProgress]), null, NOW);
    expect(data.live.map((c) => c.id)).toEqual(['live', 'open']);
  });

  it('지난 팀매치·상대 미확정 팀매치는 제외하고, 조건을 만족하는 것만 남긴다', () => {
    const upcoming = teamMatch({ id: 'upcoming', startsAt: FUTURE });
    const past = teamMatch({ id: 'past', startsAt: PAST });
    const noOpponent = teamMatch({ id: 'no-opponent', startsAt: FUTURE, approvedOpponentTeam: null });
    const data = summarizeLandingData(cursorPage([past, noOpponent, upcoming]), null, null, NOW);
    expect(data.live.map((c) => c.id)).toEqual(['upcoming']);
  });

  it('팀매치는 startsAt 오름차순으로 정렬한다', () => {
    const later = teamMatch({ id: 'later', startsAt: '2026-10-05T09:00:00.000Z' });
    const sooner = teamMatch({ id: 'sooner', startsAt: '2026-10-02T09:00:00.000Z' });
    const data = summarizeLandingData(cursorPage([later, sooner]), null, null, NOW);
    expect(data.live.map((c) => c.id)).toEqual(['sooner', 'later']);
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
    expect(data.live).toEqual([]);
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
});
