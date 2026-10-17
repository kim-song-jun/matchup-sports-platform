import { describe, expect, it } from 'vitest';
import type { V1TeamDetail } from '@/types/api';
import { buildTeamDiscoveryMetadata } from './team-discovery-metadata';

function teamFixture(overrides: Partial<V1TeamDetail> = {}): V1TeamDetail {
  return {
    teamId: 'team-1',
    name: '성수 러너스',
    status: 'active',
    visibility: 'public',
    sport: { sportId: 'running', name: '러닝' },
    region: { regionId: 'seongdong', name: '성동구', parentName: '서울' },
    membersVisibilityEnabled: true,
    canViewMembers: false,
    profile: {
      logoUrl: null,
      coverImageUrl: null,
      introduction: '주말마다 한강을 달리고 초보자 페이스에 맞춰 함께하는 러닝 모임입니다.',
      activityAreaText: '서울 성동구',
      activityDays: ['sat'],
      activityFrequency: 'weekly',
      activityTimeSlots: ['morning'],
      activityTypes: ['running'],
      activityMemo: null,
      activitySummary: '주말 · 오전 · 주 1회 · 러닝',
      skillLevelText: null,
      levelLabel: '초급-중급',
      joinPolicy: 'approval_required',
      memberGoalCount: 20,
    },
    owner: { userId: 'owner-1', displayName: '비공개 이름', profileImageUrl: null },
    membersPreview: [],
    memberCount: 5,
    managerCount: 1,
    trust: { trustState: 'sample', score: null },
    viewer: { role: 'none', membershipId: null, joinState: 'none', canRequestJoin: false, disabledReason: null, manageRoute: null },
    ...overrides,
  };
}

describe('buildTeamDiscoveryMetadata', () => {
  it('uses the real sport, region, activity, level and approval policy from the public detail contract', () => {
    const metadata = buildTeamDiscoveryMetadata(teamFixture());

    expect(metadata.title).toBe('성수 러너스 · 러닝 · 서울 성동구 팀');
    expect(metadata.description).toContain('성수 러너스 팀 · 러닝 · 서울 성동구:');
    expect(metadata.description).toContain('주말마다 한강을 달리고 초보자 페이스에 맞춰 함께하는 러닝 모임입니다.');
    expect(metadata.description).toContain('활동: 주말 · 오전 · 주 1회 · 러닝.');
    expect(metadata.description).toContain('수준: 초급-중급.');
    expect(metadata.description).toContain('가입은 운영진 승인 방식이에요.');
    expect(metadata.description).not.toContain('비공개 이름');
  });

  it('uses the actual sport for different team disciplines and does not invent optional facts', () => {
    const metadata = buildTeamDiscoveryMetadata(teamFixture({
      name: '마포 수영 모임',
      sport: { sportId: 'swimming', name: '수영' },
      regionName: null,
      region: null,
      profile: {
        logoUrl: null,
        coverImageUrl: null,
        introduction: null,
        activityAreaText: null,
        activityDays: [],
        activityFrequency: null,
        activityTimeSlots: [],
        activityTypes: [],
        activityMemo: null,
        activitySummary: null,
        skillLevelText: null,
        joinPolicy: 'closed',
        memberGoalCount: null,
      },
    }));

    expect(metadata.title).toContain('수영');
    expect(metadata.description).toContain('수영을 함께할 마포 수영 모임 팀을 만나보세요.');
    expect(metadata.description).toContain('현재 가입 신청을 받지 않아요.');
    expect(metadata.description).not.toMatch(/풋살|축구|undefined|null|수준:|활동:/);
  });

  it('normalizes duplicate whitespace and bounds title and description', () => {
    const metadata = buildTeamDiscoveryMetadata(teamFixture({
      name: '성수 러너스 '.repeat(10),
      regionName: '서울   성동구',
      profile: {
        ...teamFixture().profile,
        activitySummary: '  주말   · 오전 · 주 1회 · 러닝  ',
      },
    }));

    expect(metadata.title.length).toBeLessThanOrEqual(60);
    expect(metadata.description.length).toBeLessThanOrEqual(155);
    expect(metadata.description).not.toMatch(/\s{2,}|undefined|null/);
  });

  it('reserves title space for the real sport and region when the valid team name is 50 characters', () => {
    const metadata = buildTeamDiscoveryMetadata(teamFixture({ name: '가'.repeat(50), sport: { sportId: 'futsal', name: '풋살' } }));

    expect(metadata.title).toHaveLength(60);
    expect(metadata.title).toContain('풋살');
    expect(metadata.title).toContain('서울 성동구');
    expect(metadata.title).toMatch(/… · 풋살 · 서울 성동구 팀$/);
  });

  it('retains the entity label when truncating a 50-character name that already ends with 팀', () => {
    const metadata = buildTeamDiscoveryMetadata(teamFixture({
      name: `${'가'.repeat(49)}팀`,
      sport: { sportId: 'futsal', name: '풋살' },
    }));

    expect(metadata.title.length).toBeLessThanOrEqual(60);
    expect(metadata.title).toContain('풋살');
    expect(metadata.title).toContain('서울 성동구');
    expect(metadata.title).toMatch(/… · 풋살 · 서울 성동구 팀$/);
  });

  it('bounds unusually long sport and region context while leaving a nonempty team name', () => {
    const metadata = buildTeamDiscoveryMetadata(teamFixture({
      sport: { sportId: 'long-sport', name: '풋살'.repeat(30) },
      regionName: '서울 성동구'.repeat(20),
    }));

    expect(metadata.title).toHaveLength(60);
    expect(metadata.title).toMatch(/^성…/);
    expect(metadata.title).toContain('풋살');
    expect(metadata.title).toContain('…');
  });

  it('does not duplicate the team suffix with or without an introduction', () => {
    const withIntroduction = buildTeamDiscoveryMetadata(teamFixture({ name: '새 풋살 팀', sport: { sportId: 'futsal', name: '풋살' } }));
    const withoutIntroduction = buildTeamDiscoveryMetadata(teamFixture({
      name: '새 풋살 팀',
      sport: { sportId: 'futsal', name: '풋살' },
      profile: { ...teamFixture().profile, introduction: null },
    }));

    expect(withIntroduction.title).toBe('새 풋살 팀 · 서울 성동구');
    expect(withIntroduction.description).toContain('새 풋살 팀 · 풋살 · 서울 성동구:');
    expect(withIntroduction.description).not.toContain('팀 팀');
    expect(withoutIntroduction.description).toContain('새 풋살 팀을 만나보세요.');
    expect(withoutIntroduction.description).not.toContain('팀 팀');
  });

  it('uses the existing fallback for a short introduction and retains one at the 15-character threshold', () => {
    const short = buildTeamDiscoveryMetadata(teamFixture({ profile: { ...teamFixture().profile, introduction: '가'.repeat(14) } }));
    const accepted = buildTeamDiscoveryMetadata(teamFixture({ profile: { ...teamFixture().profile, introduction: '가'.repeat(15) } }));

    expect(short.description).not.toContain('가'.repeat(14));
    expect(short.description).toContain('서울 성동구');
    expect(accepted.description).toContain('가'.repeat(15));
  });

  it('keeps sport and region context while fitting a long public introduction into the description limit', () => {
    const intro = '성수 한강공원에서 주말마다 초보자와 함께 천천히 달리는 모임입니다. '.repeat(8);
    const metadata = buildTeamDiscoveryMetadata(teamFixture({
      profile: { ...teamFixture().profile, introduction: intro },
    }));

    expect(metadata.description.length).toBeLessThanOrEqual(155);
    expect(metadata.description).toContain('러닝');
    expect(metadata.description).toContain('서울 성동구');
    expect(metadata.description).toContain('성수 한강공원에서 주말마다 초보자와 함께 천천히 달리는');
    expect(metadata.description).not.toContain('undefined');
  });
});
