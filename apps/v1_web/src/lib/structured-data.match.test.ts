/**
 * 매치·팀매치·공지 구조화 데이터의 계약: 화면에 보이는 값만 싣고, 사용자가 직접 적는
 * 개인정보(이름·연락처·상세 주소)는 어떤 필드로도 새지 않는다.
 */
import { describe, expect, it } from 'vitest';
import {
  buildMatchEventLd,
  buildNoticeArticleLd,
  buildSportsTeamLd,
  buildTeamMatchEventLd,
  organizationId,
  serializeJsonLd,
} from './structured-data';
import type { V1Match, V1Notice, V1TeamDetail, V1TeamMatch } from '@/types/api';

const PRIVATE_VALUES = ['김실명', '010-1234-5678', '올림픽로 25 101동 1203호', '현장에서 계좌이체', '풋살화 필수'];

function match(overrides: Partial<V1Match> = {}): V1Match {
  return {
    id: 'match-1',
    title: '토요일 아침 풋살',
    description: '연락은 010-1234-5678 로 주세요',
    sportName: '풋살',
    sport: { sportId: 'sport-1', name: '풋살' },
    regionName: '서울 송파구',
    region: { regionId: 'region-1', name: '송파구', parentName: '서울' },
    placeName: '잠실 풋살파크',
    place: { name: '잠실 풋살파크', addressText: '서울 송파구 올림픽로 25 101동 1203호' },
    startsAt: '2026-10-03T00:00:00.000Z',
    endsAt: '2026-10-03T02:00:00.000Z',
    capacityText: '8/12명',
    status: 'open',
    host: { userId: 'user-1', displayName: '김실명' },
    participantsPreview: [{ participantId: 'p-1', userId: 'user-1', displayName: '김실명', role: 'host', status: 'confirmed' }],
    costNote: '현장에서 계좌이체',
    rulesText: '풋살화 필수',
    imageUrl: '/uploads/match.png',
    ...overrides,
  };
}

function teamMatch(overrides: Partial<V1TeamMatch> = {}): V1TeamMatch {
  return {
    ...match({ id: 'tm-1', title: '송파 FC 친선전' }),
    hostTeam: { teamId: 'team-host', name: '송파 FC' },
    approvedOpponentTeam: { teamId: 'team-away', name: '강동 유나이티드' },
    ...overrides,
  } as V1TeamMatch;
}

describe('buildMatchEventLd', () => {
  it('상세 화면의 종목·일정·구장·지역(구 단위) 표기 그대로 SportsEvent 를 만든다', () => {
    const ld = buildMatchEventLd(match(), 'match-1');

    expect(ld).toMatchObject({
      '@type': 'SportsEvent',
      '@id': 'https://teameet.co.kr/matches/match-1#event',
      name: '토요일 아침 풋살',
      sport: '풋살',
      startDate: '2026-10-03T00:00:00.000Z',
      endDate: '2026-10-03T02:00:00.000Z',
      eventStatus: 'https://schema.org/EventScheduled',
      image: 'https://teameet.co.kr/uploads/match.png',
      location: {
        '@type': 'Place',
        name: '잠실 풋살파크',
        address: { '@type': 'PostalAddress', addressCountry: 'KR', addressLocality: '송파구' },
      },
    });
  });

  it('호스트 이름·설명·비용 메모·규칙·상세 주소는 어떤 필드에도 나가지 않는다', () => {
    const serialized = serializeJsonLd(buildMatchEventLd(match(), 'match-1')!);

    for (const value of PRIVATE_VALUES) expect(serialized).not.toContain(value);
  });

  it('사용자가 연 매치에 Teameet 을 주최자로 적지 않는다 — 운영자 모집일 때만 조직을 참조한다', () => {
    expect(buildMatchEventLd(match(), 'match-1')).not.toHaveProperty('organizer');
    expect(buildMatchEventLd(match({ platformManaged: true }), 'match-1')).toMatchObject({
      organizer: { '@id': organizationId() },
    });
  });

  it('취소는 EventCancelled, 모집 실패로 열리지 않은 경기는 상태를 단정하지 않는다', () => {
    expect(buildMatchEventLd(match({ displayState: 'cancelled' }), 'match-1')).toMatchObject({
      eventStatus: 'https://schema.org/EventCancelled',
    });
    expect(buildMatchEventLd(match({ displayState: 'expired' }), 'match-1')).not.toHaveProperty('eventStatus');
  });

  it('지역을 모르면 구장 이름만 싣고, 지역 미정 문구를 주소로 만들지 않는다', () => {
    const ld = buildMatchEventLd(match({ region: null, regionName: null }), 'match-1');

    expect(ld?.location).toEqual({
      '@type': 'Place',
      name: '잠실 풋살파크',
      address: { '@type': 'PostalAddress', addressCountry: 'KR' },
    });
  });
});

describe('buildTeamMatchEventLd', () => {
  it('주최 팀을 organizer·homeTeam 으로, 확정된 상대를 awayTeam 으로 싣는다', () => {
    const ld = buildTeamMatchEventLd(teamMatch(), 'tm-1');

    expect(ld).toMatchObject({
      '@id': 'https://teameet.co.kr/team-matches/tm-1#event',
      organizer: { '@type': 'SportsTeam', name: '송파 FC' },
      homeTeam: { '@type': 'SportsTeam', name: '송파 FC' },
      awayTeam: { '@type': 'SportsTeam', name: '강동 유나이티드' },
    });
  });

  it('팀 참조의 @id 가 팀 상세의 SportsTeam @id 와 같다 — 같은 팀이 두 엔티티로 쪼개지지 않는다', () => {
    const ld = buildTeamMatchEventLd(teamMatch(), 'tm-1');
    const teamLd = buildSportsTeamLd({ id: 'team-host', name: '송파 FC' } as unknown as V1TeamDetail);

    expect((ld?.homeTeam as Record<string, unknown>)['@id']).toBe(teamLd['@id']);
  });

  it('플랫폼 모집은 HOME 팀이 배정돼도 주최자가 조직이다 — 배정 팀을 주최자로 적지 않는다', () => {
    const ld = buildTeamMatchEventLd(teamMatch({ platformManaged: true }), 'tm-1');

    expect(ld).toMatchObject({
      organizer: { '@id': organizationId() },
      homeTeam: { '@type': 'SportsTeam', name: '송파 FC' },
    });
    expect(buildTeamMatchEventLd(teamMatch({ platformManaged: true, hostTeam: null }), 'tm-1')).toMatchObject({
      organizer: { '@id': organizationId() },
    });
  });

  it('상대가 확정되지 않았으면 awayTeam 을 만들지 않는다', () => {
    expect(buildTeamMatchEventLd(teamMatch({ approvedOpponentTeam: null }), 'tm-1')).not.toHaveProperty('awayTeam');
  });

  it('팀매치에서도 개인정보 값은 나가지 않는다', () => {
    const serialized = serializeJsonLd(buildTeamMatchEventLd(teamMatch(), 'tm-1')!);

    for (const value of PRIVATE_VALUES) expect(serialized).not.toContain(value);
  });
});

describe('buildNoticeArticleLd', () => {
  const notice: V1Notice = {
    noticeId: 'notice-1',
    title: '추석 연휴 고객센터 운영 안내',
    publishedAt: '2026-09-20T01:00:00.000Z',
    updatedAt: '2026-09-22T03:00:00.000Z',
    body: '본문',
  };

  it('제목·발행·수정 시각을 싣고 발행 주체는 전역 조직을 참조한다', () => {
    expect(buildNoticeArticleLd(notice, 'notice-1')).toMatchObject({
      '@type': 'Article',
      headline: '추석 연휴 고객센터 운영 안내',
      url: 'https://teameet.co.kr/notices/notice-1',
      datePublished: '2026-09-20T01:00:00.000Z',
      dateModified: '2026-09-22T03:00:00.000Z',
      publisher: { '@id': organizationId() },
      image: 'https://teameet.co.kr/opengraph-image',
    });
  });

  it('수정 시각이 없거나 발행보다 이르면 발행 시각을 쓴다 — 수정일이 발행일보다 앞서지 않는다', () => {
    expect(buildNoticeArticleLd({ ...notice, updatedAt: undefined }, 'notice-1')?.dateModified).toBe(notice.publishedAt);
    expect(buildNoticeArticleLd({ ...notice, updatedAt: '2026-09-19T00:00:00.000Z' }, 'notice-1')?.dateModified).toBe(
      notice.publishedAt,
    );
  });

  it('발행 시각이 없으면 Article 을 만들지 않는다', () => {
    expect(buildNoticeArticleLd({ ...notice, publishedAt: '' }, 'notice-1')).toBeNull();
  });
});
