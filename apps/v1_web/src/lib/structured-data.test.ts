/**
 * 구조화 데이터의 계약은 두 가지다: **틀린 사실을 내보내지 않는 것**과
 * **script 태그를 깨뜨리지 않는 것**. 아래는 그 둘만 지킨다.
 */
import { describe, expect, it } from 'vitest';
import {
  buildBreadcrumbLd,
  buildSiteIdentityLd,
  buildSportsEventLd,
  buildSportsTeamLd,
  organizationId,
  serializeJsonLd,
} from './structured-data';
import type { V1TeamDetail, V1TournamentDetail } from '@/types/api';

function tournament(overrides: Partial<V1TournamentDetail> = {}): V1TournamentDetail {
  return {
    id: 'tour-1',
    sportId: 'sport-1',
    sport: { code: 'futsal', name: '풋살' },
    title: '제2회 팀밋 풋살컵',
    status: 'open',
    format: 'group_knockout',
    kind: 'regular_tournament',
    registrationDeadlineAt: '2026-09-20T14:59:59.000Z',
    scheduledAt: '2026-10-01T01:00:00.000Z',
    scheduledEndAt: '2026-10-01T09:00:00.000Z',
    venue: '서울 강남 풋살파크',
    latitude: 37.5,
    longitude: 127.03,
    coverImageUrl: 'https://teameet.co.kr/uploads/cover.png',
    teamCount: 8,
    entryFee: 120000,
    promoListSubtitle: '5대5 풋살 남자부',
    prizeSummary: '우승 100만원',
    ...overrides,
  } as unknown as V1TournamentDetail;
}

describe('serializeJsonLd', () => {
  it('본문에 섞인 </script> 가 스크립트 태그를 조기 종료시키지 못한다', () => {
    const serialized = serializeJsonLd({ name: '</script><img src=x onerror=alert(1)>' });

    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<img');
    // 이스케이프해도 JSON 으로서의 값은 원문 그대로여야 한다 — 의미가 바뀌면 안 된다.
    expect(JSON.parse(serialized)).toEqual({ name: '</script><img src=x onerror=alert(1)>' });
  });
});

describe('buildSportsEventLd', () => {
  it('일정이 확정된 대회는 화면에 보이는 값 그대로 SportsEvent 를 만든다', () => {
    const ld = buildSportsEventLd(tournament());

    expect(ld).toMatchObject({
      '@type': 'SportsEvent',
      name: '제2회 팀밋 풋살컵',
      sport: '풋살',
      startDate: '2026-10-01T01:00:00.000Z',
      endDate: '2026-10-01T09:00:00.000Z',
      eventStatus: 'https://schema.org/EventScheduled',
      organizer: { '@id': organizationId() },
    });
    expect(ld?.location).toMatchObject({
      '@type': 'Place',
      name: '서울 강남 풋살파크',
      geo: { '@type': 'GeoCoordinates', latitude: 37.5, longitude: 127.03 },
    });
    expect(ld?.offers).toMatchObject({
      price: 120000,
      priceCurrency: 'KRW',
      availability: 'https://schema.org/InStock',
      validThrough: '2026-09-20T14:59:59.000Z',
    });
  });

  it('일정 미정 대회는 LD 자체를 내보내지 않는다 — 없는 날짜를 지어내지 않기 위해', () => {
    expect(buildSportsEventLd(tournament({ scheduledAt: null }))).toBeNull();
  });

  it('취소된 대회는 EventCancelled 로 표시한다', () => {
    expect(buildSportsEventLd(tournament({ status: 'cancelled' }))?.eventStatus).toBe(
      'https://schema.org/EventCancelled',
    );
  });

  it('모집이 끝난 대회를 InStock 으로 광고하지 않는다', () => {
    expect(buildSportsEventLd(tournament({ status: 'completed' }))?.offers).toMatchObject({
      availability: 'https://schema.org/SoldOut',
    });
  });

  it('상대 경로 이미지를 절대 URL 로 바꾼다 — 크롤러가 해석할 수 있게', () => {
    // API 는 이미지를 `/uploads/...` 로만 내려준다(실측). 그대로 두면 JSON-LD 의 image 가
    // 상대 경로로 나가 크롤러가 해석하지 못한다.
    expect(buildSportsEventLd(tournament({ coverImageUrl: '/uploads/cover.png' }), {})?.image).toBe(
      'https://teameet.co.kr/uploads/cover.png',
    );
  });

  it('이미 절대 URL 인 이미지는 건드리지 않는다', () => {
    expect(
      buildSportsEventLd(tournament(), { image: 'https://cdn.example.com/a.png' })?.image,
    ).toBe('https://cdn.example.com/a.png');
  });

  it('좌표가 없으면 geo 를 붙이지 않는다', () => {
    const ld = buildSportsEventLd(tournament({ latitude: null, longitude: null }));
    expect(ld?.location).not.toHaveProperty('geo');
  });

  it('장소 미정이면 location 을 붙이지 않는다', () => {
    expect(buildSportsEventLd(tournament({ venue: null }))).not.toHaveProperty('location');
  });

  it('참가 팀 수를 참석 인원 필드에 넣지 않는다 — 값의 의미가 다르다', () => {
    // maximumAttendeeCapacity 는 '최대 참석 인원(개인)'이다. 팀 수를 넣으면 8명 대회처럼
    // 읽혀 검색엔진이 틀린 사실을 갖게 된다.
    expect(buildSportsEventLd(tournament({ teamCount: 8 }))).not.toHaveProperty('maximumAttendeeCapacity');
  });

  it('무료 대회는 참가비 0 을 명시한다 — 필드 누락으로 "미확인"이 되지 않게', () => {
    const ld = buildSportsEventLd(tournament({ entryFee: 0 }));
    expect(ld?.offers).toMatchObject({ price: 0, priceCurrency: 'KRW' });
    expect(ld?.isAccessibleForFree).toBe(true);
  });
});

describe('buildSportsTeamLd', () => {
  /** 팀 **상세** 응답 모양 — 로고·소개가 `profile` 아래에 있는 것이 목록 응답과 다른 점이다. */
  function team(profile: Partial<V1TeamDetail['profile']> = {}): V1TeamDetail {
    return {
      id: 'team-1',
      teamId: 'team-1',
      name: '강남 FC',
      sport: { sportId: 's1', name: '풋살' },
      // 실제 shape: regionName 은 표시용 전체 이름, region.name 은 하위 지역명만.
      regionName: '서울 송파구',
      region: { regionId: 'r1', name: '송파구', parentName: '서울' },
      profile: {
        logoUrl: null,
        coverImageUrl: null,
        introduction: '주말   저녁에\n모이는 팀입니다',
        ...profile,
      },
    } as unknown as V1TeamDetail;
  }

  it('상세 응답의 profile 에서 로고·소개를 읽는다 — 목록 구조로 읽으면 통째로 빠진다', () => {
    // 실사고: 목록 타입(`logoUrl` 최상위)으로 읽어 로고·커버·소개가 전부 LD 에서 누락됐다.
    const ld = buildSportsTeamLd(team({ logoUrl: '/images/team-logos/a.jpg' }));

    expect(ld.logo).toBe('https://teameet.co.kr/images/team-logos/a.jpg');
    expect(ld.image).toBe('https://teameet.co.kr/images/team-logos/a.jpg');
    expect(ld.description).toBe('주말 저녁에 모이는 팀입니다');
  });

  it('커버가 있으면 커버를 대표 이미지로 쓴다', () => {
    const ld = buildSportsTeamLd(team({ logoUrl: '/a.png', coverImageUrl: '/b.png' }));

    expect(ld.image).toBe('https://teameet.co.kr/b.png');
    expect(ld.logo).toBe('https://teameet.co.kr/a.png');
  });

  it('팀 화면의 종목·지역을 SportsTeam 으로 옮긴다', () => {
    const ld = buildSportsTeamLd(team());

    expect(ld).toMatchObject({
      '@type': 'SportsTeam',
      name: '강남 FC',
      sport: '풋살',
      memberOf: { '@id': organizationId() },
    });
    // 화면 표기와 같은 '서울 송파구' 여야 한다 — region.name('송파구')만 쓰면 정보가 깎인다.
    expect(ld.location).toMatchObject({ '@type': 'Place', name: '서울 송파구' });
  });

  it('regionName 이 없으면 부모 지역과 조합해 같은 형태를 만든다', () => {
    const base = team();
    const ld = buildSportsTeamLd({ ...base, regionName: undefined } as unknown as V1TeamDetail);

    expect(ld.location).toMatchObject({ name: '서울 송파구' });
  });

  it('공백만 있는 소개는 description 을 아예 넣지 않는다', () => {
    const ld = buildSportsTeamLd(team({ introduction: '  \n\n  ' }));

    expect(ld).not.toHaveProperty('description');
  });

  it('지역 정보가 아예 없으면 location 을 붙이지 않는다', () => {
    const base = team();
    const ld = buildSportsTeamLd({ ...base, regionName: undefined, region: null } as unknown as V1TeamDetail);

    expect(ld).not.toHaveProperty('location');
  });

  it('이미지가 없으면 image/logo 를 아예 넣지 않는다', () => {
    const ld = buildSportsTeamLd(team());

    expect(ld).not.toHaveProperty('logo');
    expect(ld).not.toHaveProperty('image');
  });
});

describe('buildSiteIdentityLd', () => {
  it('Organization 과 WebSite 를 각각 한 번씩만 선언하고 서로 잇는다', () => {
    const graph = buildSiteIdentityLd()['@graph'] as Array<Record<string, unknown>>;
    const types = graph.map((node) => node['@type']);

    expect(types).toEqual(['Organization', 'WebSite']);
    expect(graph[1].publisher).toEqual({ '@id': organizationId() });
  });
});

describe('buildBreadcrumbLd', () => {
  it('순서를 1부터 매기고 절대 URL 로 만든다', () => {
    const ld = buildBreadcrumbLd([
      { name: '대회', path: '/tournaments' },
      { name: '풋살컵', path: '/tournaments/tour-1' },
    ]);

    expect(ld.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: '대회', item: 'https://teameet.co.kr/tournaments' },
      {
        '@type': 'ListItem',
        position: 2,
        name: '풋살컵',
        item: 'https://teameet.co.kr/tournaments/tour-1',
      },
    ]);
  });
});
