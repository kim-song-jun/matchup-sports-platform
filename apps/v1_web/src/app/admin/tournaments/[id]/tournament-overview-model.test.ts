/**
 * tournament-overview-model.test.ts
 *
 * 개요 화면의 계약은 문구가 아니라 **판정 조건**이다. 여기가 틀리면 운영자가 "다 됐다"고
 * 믿는 대회에 접수 마감이나 입금 계좌가 비어 있게 된다.
 */
import { describe, expect, it } from 'vitest';
import type { V1Tournament } from '@/types/api';
import { buildTournamentChecklist, daysUntil, resolveNextMilestone } from './tournament-overview-model';

const NOW = new Date('2026-08-20T10:00:00+09:00');

/** 아무것도 지적할 게 없는 대회 — 각 테스트가 필요한 필드만 비운다. */
function tournament(overrides: Partial<V1Tournament> = {}): V1Tournament {
  return {
    id: 'tournament-1',
    status: 'open',
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

describe('buildTournamentChecklist', () => {
  it('다 채워진 대회는 지적할 게 없다', () => {
    expect(buildTournamentChecklist(tournament(), NOW)).toEqual([]);
  });

  it('비어 있는 설정만 골라낸다', () => {
    const checks = buildTournamentChecklist(
      tournament({ registrationDeadlineAt: null, coverImageUrl: null }),
      NOW,
    );
    expect(checks.map((check) => check.id)).toEqual(['registration-deadline', 'cover-image']);
    expect(checks[0].section).toBe('info');
  });

  it('참가비가 없으면 입금 계좌를 요구하지 않는다', () => {
    expect(buildTournamentChecklist(tournament({ entryFee: 0, bankAccount: null }), NOW)).toEqual([]);
    expect(
      buildTournamentChecklist(tournament({ entryFee: 30000, bankAccount: null }), NOW).map((c) => c.id),
    ).toEqual(['bank-account']);
  });

  it('예약 공개 시각이 지난 대진표는 미공개로 보지 않는다', () => {
    // bracketPublishedAt 은 예약 공개가 발효돼도 null 로 남는다 — 이 필드만 보면
    // 이미 공개된 대진표를 계속 "미공개"라고 잔소리하게 된다.
    const published = buildTournamentChecklist(
      tournament({
        bracketPublishedAt: null,
        bracketPublishScheduledAt: '2026-08-19T09:00:00+09:00',
      }),
      NOW,
    );
    expect(published.map((c) => c.id)).not.toContain('bracket-unpublished');

    const notYet = buildTournamentChecklist(
      tournament({
        bracketPublishedAt: null,
        bracketPublishScheduledAt: '2026-08-29T09:00:00+09:00',
      }),
      NOW,
    );
    expect(notYet.map((c) => c.id)).toContain('bracket-unpublished');
  });

  it('경기가 없으면 공개 여부가 아니라 편성부터 지적한다', () => {
    const checks = buildTournamentChecklist(
      tournament({
        bracketPublishedAt: null,
        operationCounts: { registrations: 5, fixtures: 0, announcements: 2 },
      }),
      NOW,
    );
    expect(checks.map((c) => c.id)).toContain('no-fixtures');
    expect(checks.map((c) => c.id)).not.toContain('bracket-unpublished');
  });

  it('끝난 대회에는 아무것도 요구하지 않는다', () => {
    const empty = tournament({
      status: 'completed',
      registrationDeadlineAt: null,
      rosterDeadlineAt: null,
      coverImageUrl: null,
      prizePool: null,
    });
    expect(buildTournamentChecklist(empty, NOW)).toEqual([]);
  });
});
