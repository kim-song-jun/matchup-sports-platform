import { describe, expect, it } from 'vitest';
import type { V1Tournament } from '@/types/api';
import type { StagePlan } from '@/types/stage-plan';
import {
  INFO_NEED_TIER_LABEL,
  TOURNAMENT_INFO_SECTIONS,
  TOURNAMENT_INFO_SECTION_META,
  infoNeedHref,
  parseInfoEditParam,
  tournamentInfoHref,
  tournamentInfoNeeds,
} from './info-sections';

/** 아무것도 지적할 게 없는 접수 중 대회 — 각 테스트가 필요한 필드만 바꾼다. */
function tournament(overrides: Partial<V1Tournament> = {}): V1Tournament {
  return {
    id: 't-1',
    status: 'open',
    format: 'knockout',
    venue: '서울 풋살장',
    registrationDeadlineAt: '2026-08-25T09:00:00+09:00',
    rosterDeadlineAt: '2026-08-28T09:00:00+09:00',
    scheduledAt: '2026-08-30T09:00:00+09:00',
    coverImageUrl: '/uploads/2026/08/cover.webp',
    entryFee: 0,
    bankAccount: null,
    prizePool: 1000000,
    prizeSummary: null,
    prizeBreakdown: null,
    minPlayers: 6,
    maxPlayers: 10,
    lineupMaxPlayers: 6,
    substitutionMode: 'rolling',
    maxSubstitutions: null,
    ...overrides,
  } as V1Tournament;
}

const keys = (t: V1Tournament, basePath?: string) => tournamentInfoNeeds(t, basePath).map((need) => need.key);
const find = (t: V1Tournament, key: string, basePath?: string) =>
  tournamentInfoNeeds(t, basePath).find((need) => need.key === key);

describe('대회 정보 섹션 키·딥링크', () => {
  it('섹션 키는 C-3 값 6개 그대로다', () => {
    expect([...TOURNAMENT_INFO_SECTIONS]).toEqual(['basic', 'schedule', 'entry', 'rules', 'public', 'promo']);
  });

  it('tournamentInfoHref 는 ?edit= 딥링크를 만들고 basePath 가 있으면 그 경로를 쓴다', () => {
    expect(tournamentInfoHref('t-1', 'rules')).toBe('/admin/tournaments/t-1/info?edit=rules');
    expect(tournamentInfoHref('t-1', 'schedule', '/tournament-management/tournaments/t-1')).toBe(
      '/tournament-management/tournaments/t-1/info?edit=schedule',
    );
  });

  it('단계 이름 표는 필요·기본값 확인·선택이다', () => {
    expect(INFO_NEED_TIER_LABEL).toEqual({ required: '필요', review: '기본값 확인', optional: '선택' });
  });
});

describe('tournamentInfoNeeds', () => {
  it('다 채워진 접수 중 대회는 항목이 없다', () => {
    expect(tournamentInfoNeeds(tournament())).toEqual([]);
  });

  it('끝난 대회(completed·cancelled)는 항목이 없다', () => {
    const empty = { venue: null, registrationDeadlineAt: null, rosterDeadlineAt: null, scheduledAt: null, coverImageUrl: null, prizePool: null };
    expect(tournamentInfoNeeds(tournament({ ...empty, status: 'completed' }))).toEqual([]);
    expect(tournamentInfoNeeds(tournament({ ...empty, status: 'cancelled' }))).toEqual([]);
    expect(tournamentInfoNeeds(tournament({ ...empty, status: 'open' })).length).toBeGreaterThan(0);
  });

  it('필요 항목은 장소·명단 제출 마감·유료 정산 계좌·신청 마감·대회 시작 순으로 비어 있을 때만 나온다', () => {
    const allEmpty = tournament({
      venue: null,
      rosterDeadlineAt: null,
      entryFee: 20000,
      bankAccount: null,
      registrationDeadlineAt: null,
      scheduledAt: null,
    });
    const needs = tournamentInfoNeeds(allEmpty).filter((need) => need.tier === 'required');
    expect(needs.map((need) => [need.key, need.section, need.label])).toEqual([
      ['venue', 'schedule', '장소'],
      ['roster-deadline', 'schedule', '명단 제출 마감'],
      ['bank-account', 'entry', '정산 계좌'],
      ['registration-deadline', 'schedule', '신청 마감'],
      ['scheduled-at', 'schedule', '대회 시작'],
    ]);
    expect(needs.map((need) => need.detail)).toEqual([
      '정하지 않으면 참가자에게 「장소 미정」으로 보여요.',
      '마감이 없으면 경기 직전까지 선수단이 바뀔 수 있어요.',
      '참가비를 받는데 정산 계좌가 없으면 신청 팀이 입금할 곳을 알 수 없어요.',
      '마감이 없으면 신청이 언제까지 열려 있는지 알 수 없어요.',
      '대회 날짜가 없으면 목록과 상세에 일정이 보이지 않아요.',
    ]);

    expect(keys(tournament({ venue: null }))).toEqual(['venue']);
    expect(keys(tournament({ rosterDeadlineAt: null }))).toEqual(['roster-deadline']);
    expect(keys(tournament({ registrationDeadlineAt: null }))).toEqual(['registration-deadline']);
    expect(keys(tournament({ scheduledAt: null }))).toEqual(['scheduled-at']);
  });

  it('신청 마감은 아직 신청을 받는 초안·접수 중에만 필요하다 — 접수가 끝난 뒤에는 정할 일이 없다', () => {
    const noDeadline = (status: V1Tournament['status']) => keys(tournament({ status, registrationDeadlineAt: null }));

    expect(noDeadline('open')).toEqual(['registration-deadline']);
    expect(noDeadline('draft')).toContain('registration-deadline');
    expect(noDeadline('closed')).toEqual([]);
    expect(noDeadline('in_progress')).toEqual([]);
  });

  it('정산 계좌는 참가비가 있을 때만 필요하다', () => {
    expect(keys(tournament({ entryFee: 0, bankAccount: null }))).toEqual([]);
    expect(keys(tournament({ entryFee: 20000, bankAccount: null }))).toEqual(['bank-account']);
    expect(keys(tournament({ entryFee: 20000, bankAccount: '   ' }))).toEqual(['bank-account']);
    expect(keys(tournament({ entryFee: 20000, bankAccount: '123-456' }))).toEqual([]);
  });

  it('공백뿐인 장소도 비어 있는 것으로 본다', () => {
    expect(keys(tournament({ venue: '   ' }))).toEqual(['venue']);
  });

  it('오래된 응답(장소 필드가 아예 없음)에서도 던지지 않고 장소를 비어 있다고 본다', () => {
    const legacy = tournament();
    delete (legacy as Partial<V1Tournament>).venue;
    expect(keys(legacy)).toEqual(['venue']);
  });

  it('기본값 확인은 초안에서만 나오고 접수 중에는 없다', () => {
    expect(tournamentInfoNeeds(tournament({ status: 'draft' })).map((need) => [need.key, need.tier])).toEqual([
      ['entry', 'review'],
      ['rules', 'review'],
    ]);
    expect(keys(tournament({ status: 'open' }))).toEqual([]);
    expect(keys(tournament({ status: 'in_progress' }))).toEqual([]);
  });

  it('참가 조건 detail 은 인원 범위·참가비를 사실대로 말한다', () => {
    const draft = (overrides: Partial<V1Tournament>) => find(tournament({ status: 'draft', ...overrides }), 'entry');

    expect(draft({})?.section).toBe('entry');
    expect(draft({})?.label).toBe('참가 조건');
    expect(draft({})?.detail).toBe('종목 기본값이에요. 팀당 선수 6~10명, 참가비 무료.');
    expect(draft({ maxPlayers: null, entryFee: 20000 })?.detail).toBe('종목 기본값이에요. 팀당 선수 6명 이상, 참가비 20,000원.');
  });

  it('경기 규칙 detail 은 있는 조각만 말한다', () => {
    const draft = (overrides: Partial<V1Tournament>) => find(tournament({ status: 'draft', ...overrides }), 'rules');

    expect(draft({})?.section).toBe('rules');
    expect(draft({})?.label).toBe('경기 규칙');
    expect(draft({})?.detail).toBe('종목 기본값이에요. 출전 6명, 자유 교체.');
    expect(draft({ substitutionMode: 'limited', maxSubstitutions: 3 })?.detail).toBe('종목 기본값이에요. 출전 6명, 교체 3회 제한.');
    expect(draft({ substitutionMode: 'limited', maxSubstitutions: null })?.detail).toBe('종목 기본값이에요. 출전 6명, 교체 횟수 제한.');
    expect(draft({ lineupMaxPlayers: null, substitutionMode: null, maxSubstitutions: null })?.detail).toBe('종목 기본값이에요.');
    expect(draft({ substitutionMode: null, maxSubstitutions: null })?.detail).toBe('종목 기본값이에요. 출전 6명.');
  });

  it('여러 단계(league_knockouts + stagePlan) 초안만 단계 구성 항목이 있고 대진 탭으로 보낸다', () => {
    const stagePlan = { stages: [] } as unknown as StagePlan;
    const staged = tournament({ status: 'draft', format: 'league_knockouts', stagePlan });

    const need = find(staged, 'stage-plan');
    expect(need).toMatchObject({
      section: 'basic',
      tier: 'review',
      label: '단계 구성',
      detail: '예선과 결선 구성을 기본값으로 만들어 뒀어요. 대진 관리에서 확인해 주세요.',
      href: '/admin/tournaments/t-1/bracket',
    });
    expect(find(staged, 'stage-plan', '/tournament-management/tournaments/t-1')?.href).toBe('/tournament-management/tournaments/t-1/bracket');

    expect(find(tournament({ status: 'draft', format: 'league_knockouts', stagePlan: null }), 'stage-plan')).toBeUndefined();
    expect(find(tournament({ status: 'draft', format: 'league_knockouts' }), 'stage-plan')).toBeUndefined();
    expect(find(tournament({ status: 'draft', format: 'knockout', stagePlan }), 'stage-plan')).toBeUndefined();
    expect(find(tournament({ status: 'open', format: 'league_knockouts', stagePlan }), 'stage-plan')).toBeUndefined();
  });

  it('infoNeedHref 는 href 가 있는 항목은 그 값을, 없는 항목은 정보 섹션 딥링크를 돌려준다', () => {
    const staged = tournament({ status: 'draft', format: 'league_knockouts', stagePlan: { stages: [] } as unknown as StagePlan });

    const stage = find(staged, 'stage-plan')!;
    expect(infoNeedHref(stage, 't-1')).toBe('/admin/tournaments/t-1/bracket');

    const entry = find(staged, 'entry')!;
    expect(entry.href).toBeUndefined();
    expect(infoNeedHref(entry, 't-1')).toBe('/admin/tournaments/t-1/info?edit=entry');
    expect(infoNeedHref(entry, 't-1', '/tournament-management/tournaments/t-1')).toBe(
      '/tournament-management/tournaments/t-1/info?edit=entry',
    );
  });

  it('공개 화면은 이미지·상금 중 비어 있는 쪽만 말한다', () => {
    const publicNeed = (overrides: Partial<V1Tournament>) => find(tournament(overrides), 'public-screen');

    expect(publicNeed({})).toBeUndefined();
    expect(publicNeed({ coverImageUrl: null, prizePool: null })).toMatchObject({
      section: 'public',
      tier: 'optional',
      label: '공개 화면',
      detail: '커버 이미지와 상금·시상 안내가 비어 있어요.',
    });
    expect(publicNeed({ coverImageUrl: null })?.detail).toBe('커버 이미지가 없으면 목록과 상세 상단이 비어 보여요.');
    expect(publicNeed({ prizePool: null })?.detail).toBe('상금과 시상 정보는 참가 결정에 큰 영향을 줘요.');
    // 상금 총액이 없어도 시상 안내 글이 있으면 상금 정보는 있는 것이다.
    expect(publicNeed({ prizePool: null, prizeSummary: '우승 팀 트로피' })).toBeUndefined();
    expect(publicNeed({ prizePool: 0, prizeBreakdown: '1위 50만원' })).toBeUndefined();
  });

  it('단계 순서는 필요 → 기본값 확인 → 선택이고 key 는 겹치지 않는다', () => {
    const everything = tournament({
      status: 'draft',
      format: 'league_knockouts',
      stagePlan: { stages: [] } as unknown as StagePlan,
      venue: null,
      rosterDeadlineAt: null,
      entryFee: 20000,
      bankAccount: null,
      registrationDeadlineAt: null,
      scheduledAt: null,
      coverImageUrl: null,
      prizePool: null,
    });

    const needs = tournamentInfoNeeds(everything);

    expect(needs.map((need) => need.key)).toEqual([
      'venue',
      'roster-deadline',
      'bank-account',
      'registration-deadline',
      'scheduled-at',
      'entry',
      'rules',
      'stage-plan',
      'public-screen',
    ]);
    expect(new Set(needs.map((need) => need.key)).size).toBe(needs.length);
    const order = { required: 0, review: 1, optional: 2 } as const;
    expect(needs.map((need) => order[need.tier])).toEqual([...needs.map((need) => order[need.tier])].sort());
  });
});

describe('parseInfoEditParam', () => {
  it.each(TOURNAMENT_INFO_SECTIONS)('%s 는 그대로 섹션 키다', (key) => {
    expect(parseInfoEditParam(key)).toBe(key);
  });

  it.each([null, '', 'foo', 'BASIC', ' basic', 'basic,rules'])('%j 는 섹션이 아니다', (raw) => {
    expect(parseInfoEditParam(raw)).toBeNull();
  });
});

describe('TOURNAMENT_INFO_SECTION_META', () => {
  it('여섯 섹션의 이름과 한 줄 설명을 가진다', () => {
    expect(TOURNAMENT_INFO_SECTIONS.map((key) => TOURNAMENT_INFO_SECTION_META[key].title)).toEqual([
      '기본', '일정·장소', '참가', '경기 규칙', '공개 화면', '홍보',
    ]);
    for (const key of TOURNAMENT_INFO_SECTIONS) {
      expect(TOURNAMENT_INFO_SECTION_META[key].description).toMatch(/요\.$/);
    }
  });
});
