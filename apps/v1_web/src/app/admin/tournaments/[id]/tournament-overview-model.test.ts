/**
 * tournament-overview-model.test.ts
 *
 * 개요 화면의 계약은 문구가 아니라 **판정 조건**이다. 여기가 틀리면 운영자가 "다 됐다"고
 * 믿는 대회에 접수 마감이나 입금 계좌가 비어 있게 된다.
 */
import { describe, expect, it } from 'vitest';
import type { V1Tournament } from '@/types/api';
import type { StagePlan } from '@/types/stage-plan';
import {
  buildTournamentSetupItems,
  daysUntil,
  requiredSetupLabels,
  resolveNextMilestone,
  type TournamentSetupItem,
} from './tournament-overview-model';

const NOW = new Date('2026-08-20T10:00:00+09:00');

/** 아무것도 지적할 게 없는 대회 — 각 테스트가 필요한 필드만 비운다. */
function tournament(overrides: Partial<V1Tournament> = {}): V1Tournament {
  return {
    id: 'tournament-1',
    status: 'open',
    venue: '서울 풋살장',
    minPlayers: 6,
    maxPlayers: 10,
    registrationDeadlineAt: '2026-08-25T09:00:00+09:00',
    rosterDeadlineAt: '2026-08-28T09:00:00+09:00',
    scheduledAt: '2026-08-30T09:00:00+09:00',
    scheduledEndAt: null,
    bracketPublishedAt: '2026-08-19T09:00:00+09:00',
    bracketPublishScheduledAt: null,
    coverImageUrl: '/uploads/2026/08/cover.webp',
    entryFee: 50000,
    bankAccount: '123-456-7890',
    prizePool: 1000000,
    prizeSummary: null,
    prizeBreakdown: null,
    teamCount: 8,
    registrationCount: 5,
    operationCounts: { registrations: 5, fixtures: 12, announcements: 2 },
    ...overrides,
  } as V1Tournament;
}

describe('daysUntil', () => {
  it('시각이 아니라 날짜 단위로 센다', () => {
    // 오늘 23:59 는 "0일 남음"이지 "지났음"이 아니다.
    expect(daysUntil('2026-08-20T23:59:00+09:00', NOW)).toBe(0);
    expect(daysUntil('2026-08-21T00:01:00+09:00', NOW)).toBe(1);
    expect(daysUntil('2026-08-19T23:59:00+09:00', NOW)).toBe(-1);
    expect(daysUntil(null, NOW)).toBeNull();
  });

  it('실행 환경 타임존이 아니라 한국 날짜로 센다', () => {
    // 같은 순간(UTC 15:01)이 KST 로는 다음 날 00:01 이다. 로컬 타임존으로 세면
    // 브라우저(KST)에서 "내일"인 마감이 UTC 로 도는 CI 에서 "오늘"이 된다.
    expect(daysUntil('2026-08-20T15:01:00Z', new Date('2026-08-20T01:00:00Z'))).toBe(1);
    expect(daysUntil('2026-08-20T14:59:00Z', new Date('2026-08-20T01:00:00Z'))).toBe(0);
  });
});

describe('resolveNextMilestone', () => {
  it('접수 중이면 접수 마감까지 남은 일수를 센다', () => {
    const milestone = resolveNextMilestone(tournament(), NOW);
    expect(milestone.phase).toBe('recruiting');
    expect(milestone.daysLeft).toBe(5);
    expect(milestone.overdue).toBe(false);
  });

  it('접수 마감이 지났는데 아직 접수 중이면 확인이 필요하다고 본다', () => {
    const milestone = resolveNextMilestone(
      tournament({ registrationDeadlineAt: '2026-08-18T09:00:00+09:00' }),
      NOW,
    );
    expect(milestone.overdue).toBe(true);
  });

  it('접수 마감이 24시간 안쪽이면 날짜가 아니라 남은 시각으로 말한다(2026-10 알파 실측)', () => {
    const headline = (registrationDeadlineAt: string) =>
      resolveNextMilestone(tournament({ registrationDeadlineAt }), new Date('2026-08-20T23:15:00+09:00')).headline;
    expect(headline('2026-08-21T00:00:00+09:00')).toBe('접수 마감까지 45분 남았어요.');
    expect(headline('2026-08-21T20:00:00+09:00')).toBe('접수 마감까지 20시간 남았어요.');
    expect(headline('2026-08-23T09:00:00+09:00')).toBe('접수 마감까지 3일 남았어요.');
  });

  it('오늘 이미 지난 접수 마감은 "오늘 마감"이 아니라 확인이 필요하다고 본다', () => {
    const milestone = resolveNextMilestone(tournament({ registrationDeadlineAt: '2026-08-20T09:00:00+09:00' }), NOW);
    expect(milestone.overdue).toBe(true);
  });

  it('마감 상태면 경기일을 기준으로 센다', () => {
    const milestone = resolveNextMilestone(
      tournament({ status: 'closed', scheduledAt: '2026-08-20T18:00:00+09:00' }),
      NOW,
    );
    expect(milestone.phase).toBe('closed');
    expect(milestone.daysLeft).toBe(0);
    expect(milestone.headline).toContain('오늘');
  });

  it('완료·취소는 기다릴 게 없다', () => {
    expect(resolveNextMilestone(tournament({ status: 'completed' }), NOW).phase).toBe('finished');
    expect(resolveNextMilestone(tournament({ status: 'cancelled' }), NOW).phase).toBe('finished');
  });
});

const BASE = '/admin/tournaments/tournament-1';
const STAFF_BASE = '/tournament-management/tournaments/tournament-1';
const keysOf = (items: TournamentSetupItem[]) => items.map((item) => item.key);

describe('buildTournamentSetupItems', () => {
  it('다 채워진 접수 중 대회는 항목이 없다', () => {
    expect(buildTournamentSetupItems(tournament(), NOW, BASE)).toEqual([]);
  });

  it('끝난 대회는 항목이 없다', () => {
    const empty = {
      venue: null,
      registrationDeadlineAt: null,
      rosterDeadlineAt: null,
      coverImageUrl: null,
      prizePool: null,
      operationCounts: { registrations: 0, fixtures: 0, announcements: 0 },
    };
    expect(buildTournamentSetupItems(tournament({ status: 'completed', ...empty }), NOW, BASE)).toEqual([]);
    expect(buildTournamentSetupItems(tournament({ status: 'cancelled', ...empty }), NOW, BASE)).toEqual([]);
  });

  it('info 항목은 ?edit= 딥링크로, 스태프 면 basePath 에서도 그 경로를 쓴다', () => {
    const [venue] = buildTournamentSetupItems(tournament({ venue: null }), NOW, BASE);
    expect(venue.key).toBe('venue');
    expect(venue.href).toBe('/admin/tournaments/tournament-1/info?edit=schedule');

    const [staffVenue] = buildTournamentSetupItems(tournament({ venue: null }), NOW, STAFF_BASE);
    expect(staffVenue.href).toBe('/tournament-management/tournaments/tournament-1/info?edit=schedule');
  });

  it('경기가 없으면 편성부터, 있으면 공개 여부를 지적하고 예약 공개 시각이 지난 대진표는 미공개로 보지 않는다', () => {
    const noFixtures = buildTournamentSetupItems(
      tournament({ bracketPublishedAt: null, operationCounts: { registrations: 5, fixtures: 0, announcements: 2 } }),
      NOW,
      BASE,
    );
    expect(noFixtures).toHaveLength(1);
    expect(noFixtures[0]).toMatchObject({
      key: 'bracket',
      tier: 'optional',
      label: '대진',
      detail: '대진 관리에서 조를 만들고 경기를 편성해요.',
      href: `${BASE}/bracket`,
    });

    const unpublished = buildTournamentSetupItems(
      tournament({ bracketPublishedAt: null, bracketPublishScheduledAt: '2026-08-29T09:00:00+09:00' }),
      NOW,
      BASE,
    );
    expect(unpublished).toHaveLength(1);
    expect(unpublished[0]).toMatchObject({
      key: 'bracket',
      label: '대진표 공개',
      detail: '공개 전에는 참가자에게 조와 경기가 보이지 않아요.',
      href: `${BASE}/bracket`,
    });

    // bracketPublishedAt 은 예약 공개가 발효돼도 null 로 남는다 — 이 필드만 보면 공개된 대진표를 계속 미공개로 지적한다.
    const published = buildTournamentSetupItems(
      tournament({ bracketPublishedAt: null, bracketPublishScheduledAt: '2026-08-19T09:00:00+09:00' }),
      NOW,
      BASE,
    );
    expect(published).toEqual([]);
  });

  it('공지가 없으면 공지 항목이 나온다', () => {
    const items = buildTournamentSetupItems(
      tournament({ operationCounts: { registrations: 5, fixtures: 12, announcements: 0 } }),
      NOW,
      BASE,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: 'announcements',
      tier: 'optional',
      label: '공지',
      detail: '집합 시간·준비물 같은 안내를 공지로 남겨요.',
      href: `${BASE}/announcements`,
    });
  });

  it('operationCounts 가 없는 응답은 경기·공지가 0 건인 것과 같다', () => {
    const items = buildTournamentSetupItems(tournament({ operationCounts: undefined }), NOW, BASE);
    expect(keysOf(items)).toEqual(['bracket', 'announcements']);
  });

  it('단계 순서는 필요 → 기본값 확인 → 선택이다', () => {
    const items = buildTournamentSetupItems(
      tournament({ status: 'draft', venue: null, coverImageUrl: null, operationCounts: { registrations: 0, fixtures: 0, announcements: 0 } }),
      NOW,
      BASE,
    );
    expect(items.map((item) => [item.key, item.tier])).toEqual([
      ['venue', 'required'],
      ['entry', 'review'],
      ['rules', 'review'],
      ['public-screen', 'optional'],
      ['bracket', 'optional'],
      ['announcements', 'optional'],
    ]);
  });

  it('requiredSetupLabels 는 필요 항목의 label 만 같은 순서로 준다', () => {
    const items = buildTournamentSetupItems(tournament({ venue: null, entryFee: 30000, bankAccount: null }), NOW, BASE);
    expect(requiredSetupLabels(items)).toEqual(['장소', '정산 계좌']);
    expect(requiredSetupLabels([])).toEqual([]);
  });

  it.each([
    ['venue', { venue: null }, '장소 정하기'],
    ['roster-deadline', { rosterDeadlineAt: null }, '마감 정하기'],
    ['registration-deadline', { registrationDeadlineAt: null }, '마감 정하기'],
    ['bank-account', { entryFee: 30000, bankAccount: null }, '계좌 입력하기'],
    ['scheduled-at', { scheduledAt: null }, '일정 정하기'],
    ['entry', { status: 'draft' }, '대회 정보'],
    ['rules', { status: 'draft' }, '대회 정보'],
    ['public-screen', { coverImageUrl: null }, '대회 정보'],
    ['bracket', { operationCounts: { registrations: 5, fixtures: 0, announcements: 2 } }, '대진'],
    ['announcements', { operationCounts: { registrations: 5, fixtures: 12, announcements: 0 } }, '공지'],
  ] satisfies [string, Partial<V1Tournament>, string][])('actionLabel 은 키별로 정해진 글자다 — %s', (key, overrides, label) => {
    const item = buildTournamentSetupItems(tournament(overrides), NOW, BASE).find((candidate) => candidate.key === key);
    expect(item?.actionLabel).toBe(label);
  });

  it('여러 단계 초안의 단계 구성 항목은 대진 탭으로 가고 actionLabel 은 대진이다', () => {
    const stagePlan = { version: 1, stages: [] } as StagePlan;
    const items = buildTournamentSetupItems(
      tournament({ status: 'draft', format: 'league_knockouts', stagePlan }),
      NOW,
      BASE,
    );
    const stage = items.find((item) => item.key === 'stage-plan');
    expect(stage).toMatchObject({ tier: 'review', href: `${BASE}/bracket`, actionLabel: '대진' });
  });
});
