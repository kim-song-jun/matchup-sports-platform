import { afterEach, describe, expect, it, vi } from 'vitest';
import type { V1TeamMatchApplication } from '@/types/api';
import {
  buildNextAction,
  formatApplicationTime,
  pickDefaultApplyTeamId,
  readLastApplyTeamId,
  rememberApplyTeamId,
  summarizeApplicationHistory,
  teamMatchEditLockReason,
  toApplicationHistory,
} from './team-match-next-step';

// 2026-10-01 00:30 KST — UTC 로는 아직 9월 30일이라 KST 달력 경계를 함께 검증한다.
const NOW = new Date('2026-09-30T15:30:00.000Z');

describe('formatApplicationTime — KST 달력 기준 오늘·어제', () => {
  it('KST 로 같은 날이면 "오늘 HH:mm"', () => {
    expect(formatApplicationTime('2026-09-30T15:05:00.000Z', NOW)).toBe('오늘 00:05');
  });
  it('UTC 로는 같은 날이어도 KST 로 전날이면 "어제"', () => {
    expect(formatApplicationTime('2026-09-30T14:50:00.000Z', NOW)).toBe('어제 23:50');
  });
  it('그보다 전이면 날짜를 적고, 값이 없거나 깨졌으면 null', () => {
    expect(formatApplicationTime('2026-09-27T09:41:00.000Z', NOW)).toBe('9월 27일 18:41');
    expect(formatApplicationTime(null, NOW)).toBeNull();
    expect(formatApplicationTime('not-a-date', NOW)).toBeNull();
  });
});

function application(id: string, status: string, reviewedAt: string | null, name = id): V1TeamMatchApplication {
  return {
    applicationId: id,
    status,
    message: null,
    createdAt: '2026-09-30T09:00:00.000Z',
    reviewedAt,
    applicantTeam: { teamId: `team-${id}`, name, logoUrl: null, sportName: null, levelLabel: null, trustState: 'none', ratingScore: null, ratingCount: 0, wins: 0, score: null, matchCount: 0 },
    appliedBy: { userId: 'u', displayName: '팀장', profileImageUrl: null },
    canApprove: false,
    canReject: false,
  };
}

describe('toApplicationHistory — ⋯ 메뉴의 신청 기록', () => {
  it('대기 중은 빼고, 승인 뒤에 거절된 것만 자동 종료로 읽는다 — 그 전의 거절은 호스트가 한 거절이다', () => {
    const history = toApplicationHistory([
      application('manual', 'rejected', '2026-09-30T10:00:00.000Z'),
      application('won', 'approved', '2026-09-30T10:05:00.000Z'),
      application('auto', 'rejected', '2026-09-30T10:05:00.010Z'),
      application('waiting', 'requested', null),
      application('left', 'withdrawn', '2026-09-30T09:30:00.000Z'),
      application('closed', 'expired', '2026-09-29T09:30:00.000Z'),
    ], NOW);

    expect(history.map((item) => [item.key, item.statusLabel])).toEqual([
      ['manual', '거절'],
      ['won', '승인 완료'],
      ['auto', '자동 종료'],
      ['left', '신청 취소'],
      ['closed', '마감 종료'],
    ]);
    expect(summarizeApplicationHistory(history)).toBe('거절 1팀 · 승인 완료 1팀 · 자동 종료 1팀 · 신청 취소 1팀 · 마감 종료 1팀');
  });

  it('승인이 없으면 거절은 전부 호스트의 거절이고, 기록이 없으면 요약도 없다', () => {
    const history = toApplicationHistory([application('a', 'rejected', '2026-09-30T10:00:00.000Z')], NOW);
    expect(history[0].statusLabel).toBe('거절');
    expect(summarizeApplicationHistory([])).toBeNull();
  });
});

describe('teamMatchEditLockReason — 서버 edit() 과 같은 판정', () => {
  it('모집 중일 때만 수정이 열리고, 잠긴 이유는 상태마다 다르다', () => {
    expect(teamMatchEditLockReason('recruiting')).toBeNull();
    expect(teamMatchEditLockReason('closed')).toContain('모집을 다시 열면');
    expect(teamMatchEditLockReason('matched')).toContain('상대팀이 정해져서');
    expect(teamMatchEditLockReason('expired')).toContain('경기 시간이 지나서');
  });
});

describe('신청 팀 기본 선택 (N-1)', () => {
  afterEach(() => window.localStorage.clear());
  const teams = [
    { teamId: 'a', name: 'A', role: 'owner', eligible: true, reasonCode: 'OK', applicationId: null },
    { teamId: 'b', name: 'B', role: 'manager', eligible: true, reasonCode: 'OK', applicationId: null },
    { teamId: 'c', name: 'C', role: 'owner', eligible: false, reasonCode: 'SPORT_MISMATCH', applicationId: null },
  ];

  it('마지막으로 신청한 팀이 지금도 신청 가능하면 그 팀이 기본이다', () => {
    rememberApplyTeamId('b');
    expect(pickDefaultApplyTeamId(teams, readLastApplyTeamId())).toBe('b');
  });
  it('마지막 팀이 신청할 수 없거나 기억이 없으면 첫 신청 가능 팀', () => {
    expect(pickDefaultApplyTeamId(teams, 'c')).toBe('a');
    expect(pickDefaultApplyTeamId(teams, null)).toBe('a');
  });
});

describe('buildNextAction — 하단 바의 다음 할 일', () => {
  const base = {
    cancelled: false,
    listingHost: true,
    apiStatus: 'recruiting',
    opponentAssigned: false,
    matchPhase: false,
    completed: false,
    manageHref: '/team-matches/tm/edit',
    reopen: vi.fn(async () => undefined),
  };
  const lineup = { kind: 'attendance' as const, href: '/team-matches/tm/lineup' };
  const result = { label: '경기 기록 보기', href: '/team-matches/tm/result' };
  const review = { label: '후기 남기기', href: '/my/reviews/team_match/tm' };

  it('모집 중인 호스트는 매치 수정, 마감한 호스트는 모집 재개, 수정이 잠긴 호스트는 없음', () => {
    expect(buildNextAction(base)).toEqual({ label: '매치 수정', href: '/team-matches/tm/edit', tone: 'neutral' });
    expect(buildNextAction({ ...base, apiStatus: 'closed' })?.label).toBe('모집 재개');
    expect(buildNextAction({ ...base, apiStatus: 'expired' })).toBeUndefined();
    expect(buildNextAction({ ...base, listingHost: false })).toBeUndefined();
  });

  it('상대가 정해지면 명단 → 경기 중 기록 → 끝나면 후기 순서로 바뀐다', () => {
    const matched = { ...base, apiStatus: 'matched', opponentAssigned: true, lineupAction: lineup, resultAction: result, reviewAction: null };
    expect(buildNextAction(matched)).toEqual({ label: '참석명단 관리', href: lineup.href, tone: 'primary' });
    expect(buildNextAction({ ...matched, matchPhase: true })?.label).toBe('경기 기록 보기');
    expect(buildNextAction({ ...matched, completed: true, reviewAction: review })?.label).toBe('후기 남기기');
  });

  it('리그 대진은 명단 조정보다 결과 입구가 먼저이고, 취소되면 아무것도 없다', () => {
    const league = { ...base, opponentAssigned: true, lineupAction: { kind: 'match-roster' as const, href: '/roster' }, resultAction: { label: '경기 결과 보기', href: '/r' } };
    expect(buildNextAction(league)?.label).toBe('경기 결과 보기');
    expect(buildNextAction({ ...league, resultAction: null })).toEqual({ label: '명단 조정', href: '/roster', tone: 'neutral' });
    expect(buildNextAction({ ...league, cancelled: true })).toBeUndefined();
  });
});
