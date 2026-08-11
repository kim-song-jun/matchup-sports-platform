/**
 * 대진 관리 "조 카드" 리팩터(설계안 B)의 핵심 순수 함수 계약 테스트.
 * 이 파일이 검증하는 건 실제 알고리즘 정확성이다(형식만 통과하는 가짜 테스트가 아님):
 * - templateFor: 조 이름 자동 채움이 실제로 중복을 피하며 순번을 매기는가
 * - isGroupReady: "준비완료" 판정이 팀·경기 둘 다 있어야 참이 되는가
 * - computeQualifyingShortlist: 예선 상위 N팀 추천이 이미 배정된 팀·조별 조 자신을 제외하는가
 */
import { describe, expect, it } from 'vitest';
import type { V1AdminBracketFixture, V1AdminBracketGroup, V1AdminBracketStanding } from '@/types/api';
import { computeQualifyingShortlist, isGroupReady, templateFor } from './bracket-group-helpers';

function group(overrides: Partial<V1AdminBracketGroup>): V1AdminBracketGroup {
  return {
    id: 'g-1',
    tournamentId: 't-1',
    name: 'A조',
    phase: 'group',
    sortOrder: 0,
    advanceCount: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    groupTeams: [],
    ...overrides,
  };
}

function fixture(overrides: Partial<V1AdminBracketFixture>): V1AdminBracketFixture {
  return {
    id: 'fx-1',
    tournamentId: 't-1',
    groupId: 'g-1',
    round: '조별 1라운드',
    fixtureNumber: 1,
    legNumber: 1,
    parentFixtureId: null,
    homeRegistrationId: 'r1',
    homeTeamName: '팀A',
    awayRegistrationId: 'r2',
    awayTeamName: '팀B',
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    result: null,
    videos: [],
    ...overrides,
  };
}

function standing(overrides: Partial<V1AdminBracketStanding>): V1AdminBracketStanding {
  return {
    id: 's-1',
    groupId: 'g-1',
    registrationId: 'r-1',
    teamName: '팀',
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    position: 1,
    recalculatedAt: null,
    ...overrides,
  };
}

describe('templateFor', () => {
  it('조별 단계 — 기존 조 개수만큼 알파벳을 순번으로 매긴다(A조→B조→C조)', () => {
    expect(templateFor('group', [])).toEqual({ name: 'A조', phase: 'group' });
    expect(templateFor('group', [{ name: 'A조', phase: 'group' }])).toEqual({ name: 'B조', phase: 'group' });
    expect(
      templateFor('group', [
        { name: 'A조', phase: 'group' },
        { name: 'B조', phase: 'group' },
      ]),
    ).toEqual({ name: 'C조', phase: 'group' });
  });

  it('조별 단계는 다른 단계(4강 등) 조 개수를 세지 않는다', () => {
    expect(
      templateFor('group', [
        { name: 'A조', phase: 'group' },
        { name: '4강', phase: 'semi' },
      ]),
    ).toEqual({ name: 'B조', phase: 'group' });
  });

  it('결선 단계 — 이름이 비어 있으면 라벨을 그대로 쓴다', () => {
    expect(templateFor('semi', [])).toEqual({ name: '4강', phase: 'semi' });
    expect(templateFor('final', [])).toEqual({ name: '결승', phase: 'final' });
    expect(templateFor('third_place', [])).toEqual({ name: '3위 결정전', phase: 'third_place' });
  });

  it('결선 단계 — 이름이 겹치면 번호를 붙이고, 그 번호도 겹치면 다음 번호로 넘어간다', () => {
    expect(templateFor('semi', [{ name: '4강', phase: 'semi' }])).toEqual({ name: '4강 2', phase: 'semi' });
    expect(
      templateFor('semi', [
        { name: '4강', phase: 'semi' },
        { name: '4강 2', phase: 'semi' },
      ]),
    ).toEqual({ name: '4강 3', phase: 'semi' });
  });
});

describe('isGroupReady', () => {
  it('팀 배정 0명이면 경기가 있어도 준비완료가 아니다', () => {
    const g = group({ groupTeams: [] });
    const fixtures = [fixture({ groupId: g.id })];
    expect(isGroupReady(g, fixtures)).toBe(false);
  });

  it('팀은 있는데 이 조 소속 경기가 없으면 준비완료가 아니다', () => {
    const g = group({ groupTeams: [{ id: 'gt-1', groupId: 'g-1', registrationId: 'r1', teamName: '팀A', sortOrder: 0, createdAt: '2026-08-01T00:00:00.000Z' }] });
    const fixtures = [fixture({ groupId: 'other-group' })];
    expect(isGroupReady(g, fixtures)).toBe(false);
  });

  it('팀도 있고 이 조 소속 경기도 있으면 준비완료다', () => {
    const g = group({ groupTeams: [{ id: 'gt-1', groupId: 'g-1', registrationId: 'r1', teamName: '팀A', sortOrder: 0, createdAt: '2026-08-01T00:00:00.000Z' }] });
    const fixtures = [fixture({ groupId: 'g-1' })];
    expect(isGroupReady(g, fixtures)).toBe(true);
  });
});

describe('computeQualifyingShortlist', () => {
  it('조별(group) 단계 조는 추천을 받지 않는다(수동검색만)', () => {
    const g = group({ phase: 'group' });
    expect(computeQualifyingShortlist(g, [g], [standing({ groupId: 'g-1', registrationId: 'r1' })])).toEqual([]);
  });

  it('결선 조 — 예선 조별 상위 advanceCount명을 순위순으로 모은다', () => {
    const groupA = group({ id: 'A', name: 'A조', phase: 'group', advanceCount: 2 });
    const semi = group({ id: 'semi-1', name: '4강', phase: 'semi', groupTeams: [] });
    const standings = [
      standing({ groupId: 'A', registrationId: 'r3', teamName: '3위팀', position: 3 }),
      standing({ groupId: 'A', registrationId: 'r1', teamName: '1위팀', position: 1 }),
      standing({ groupId: 'A', registrationId: 'r2', teamName: '2위팀', position: 2 }),
    ];
    const shortlist = computeQualifyingShortlist(semi, [groupA, semi], standings);
    expect(shortlist).toEqual([
      { id: 'r1', label: '1위팀' },
      { id: 'r2', label: '2위팀' },
    ]);
  });

  it('advanceCount 미설정이면 기본 상위 2팀만 추천한다', () => {
    const groupA = group({ id: 'A', name: 'A조', phase: 'group', advanceCount: null });
    const semi = group({ id: 'semi-1', name: '4강', phase: 'semi', groupTeams: [] });
    const standings = [1, 2, 3].map((position) =>
      standing({ groupId: 'A', registrationId: `r${position}`, teamName: `${position}위팀`, position }),
    );
    const shortlist = computeQualifyingShortlist(semi, [groupA, semi], standings);
    expect(shortlist.map((c) => c.id)).toEqual(['r1', 'r2']);
  });

  it('이미 이 조에 배정된 팀은 추천 목록에서 빠진다', () => {
    const groupA = group({ id: 'A', name: 'A조', phase: 'group', advanceCount: 2 });
    const semi = group({
      id: 'semi-1',
      name: '4강',
      phase: 'semi',
      groupTeams: [{ id: 'gt-1', groupId: 'semi-1', registrationId: 'r1', teamName: '1위팀', sortOrder: 0, createdAt: '2026-08-01T00:00:00.000Z' }],
    });
    const standings = [1, 2].map((position) =>
      standing({ groupId: 'A', registrationId: `r${position}`, teamName: `${position}위팀`, position }),
    );
    const shortlist = computeQualifyingShortlist(semi, [groupA, semi], standings);
    expect(shortlist.map((c) => c.id)).toEqual(['r2']);
  });

  it('예선 조가 여러 개면 합쳐서 추천하되 중복 등록 팀은 한 번만 담는다', () => {
    const groupA = group({ id: 'A', name: 'A조', phase: 'group', advanceCount: 1 });
    const groupB = group({ id: 'B', name: 'B조', phase: 'group', advanceCount: 1 });
    const semi = group({ id: 'semi-1', name: '4강', phase: 'semi', groupTeams: [] });
    const standings = [
      standing({ groupId: 'A', registrationId: 'r1', teamName: 'A조1위', position: 1 }),
      standing({ groupId: 'B', registrationId: 'r2', teamName: 'B조1위', position: 1 }),
    ];
    const shortlist = computeQualifyingShortlist(semi, [groupA, groupB, semi], standings);
    expect(shortlist.map((c) => c.id)).toEqual(['r1', 'r2']);
  });
});
