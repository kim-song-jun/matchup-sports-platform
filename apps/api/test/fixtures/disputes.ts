// DisputesService currently uses an in-memory array (not Prisma).
// This file provides build-only helpers for unit test mocks.
// When DisputesService migrates to Prisma, add createDispute() here.

// ---------------------------------------------------------------------------
// In-memory shape (mirrors disputes.service.ts DisputeStatus / DisputeType)
// ---------------------------------------------------------------------------

export type DisputeStatus =
  | 'pending'
  | 'investigating'
  | 'resolved'
  | 'dismissed';

export type DisputeType =
  | 'no_show'
  | 'late'
  | 'rule_violation'
  | 'payment_issue'
  | 'other';

export interface DisputeMock {
  id: string;
  reporterTeamId: string;
  reportedTeamId: string;
  teamMatchId: string;
  type: DisputeType;
  description: string;
  status: DisputeStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Build helper — pure in-memory object for unit test mocks (no DB I/O)
// ---------------------------------------------------------------------------

export function buildDispute(
  overrides: Partial<{
    id: string;
    reporterTeamId: string;
    reportedTeamId: string;
    teamMatchId: string;
    type: DisputeType;
    description: string;
    status: DisputeStatus;
    createdAt: Date;
    updatedAt: Date;
  }> = {},
): DisputeMock {
  return {
    id: overrides.id ?? 'dispute-test-id',
    reporterTeamId: overrides.reporterTeamId ?? 'team-reporter-id',
    reportedTeamId: overrides.reportedTeamId ?? 'team-reported-id',
    teamMatchId: overrides.teamMatchId ?? 'tm-test-id',
    type: overrides.type ?? 'no_show',
    description: overrides.description ?? '상대팀이 경기에 나타나지 않았습니다.',
    status: overrides.status ?? 'pending',
    createdAt: overrides.createdAt ?? new Date('2026-02-10'),
    updatedAt: overrides.updatedAt ?? new Date('2026-02-10'),
  };
}
