import type { AdminStats, Settlement } from '@/types/api';
import type { Dispute } from '@/types/dispute';
import type { Payout, EligibleSettlement } from '@/types/payout';

export const mockAdminStats: AdminStats = {
  totalUsers: 1000,
  totalMatches: 500,
  totalLessons: 200,
  totalTeams: 150,
  totalVenues: 50,
  activeListings: 80,
  totalRevenue: 5000000,
  activeTeams: 120,
  todayNewUsers: 5,
  todayMatches: 10,
  pendingReports: 3,
  pendingSettlements: 8,
};

export const mockSettlement: Settlement = {
  id: 'settle-1',
  type: 'match' as const,
  amount: 50000,
  commission: 5000,
  netAmount: 45000,
  payerName: '테스트유저',
  recipientName: '서울 FC',
  relatedId: 'match-1',
  description: '풋살 경기 정산',
  status: 'pending' as const,
  processedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
};

// Unified Dispute fixture (Task 70) — targetType discriminates marketplace_order vs team_match.
export const mockDispute: Dispute = {
  id: 'dispute-1',
  targetType: 'marketplace_order',
  orderId: 'order-1',
  teamMatchId: null,
  reporterUserId: 'user-2',
  respondentUserId: 'user-1',
  reporterTeamId: null,
  reportedTeamId: null,
  type: 'not_as_described',
  reason: 'Product condition does not match listing',
  description: '상품 상태가 설명과 달라요. 실제로는 poor 상태입니다.',
  status: 'filed',
  resolution: null,
  resolutionAmount: null,
  adminNotes: null,
  sellerRespondedAt: null,
  adminReviewingAt: null,
  resolvedAt: null,
  createdAt: '2024-01-10T10:00:00.000Z',
  updatedAt: '2024-01-10T10:00:00.000Z',
};

export const mockTeamMatchDispute: Dispute = {
  id: 'dispute-2',
  targetType: 'team_match',
  orderId: null,
  teamMatchId: 'tm-1',
  reporterUserId: 'user-3',
  respondentUserId: 'user-4',
  reporterTeamId: 'team-1',
  reportedTeamId: 'team-2',
  type: 'no_show',
  reason: 'Opponent team did not arrive',
  description: '상대팀이 노쇼했어요',
  status: 'filed',
  resolution: null,
  resolutionAmount: null,
  adminNotes: null,
  sellerRespondedAt: null,
  adminReviewingAt: null,
  resolvedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

export const mockPayout: Payout = {
  id: 'payout-1',
  batchId: 'batch-uuid-001',
  recipientId: 'user-1',
  grossAmount: 450000,
  platformFee: 45000,
  netAmount: 405000,
  status: 'pending',
  note: null,
  failureReason: null,
  paidAt: null,
  processedAt: null,
  markedPaidByAdminId: null,
  createdAt: '2024-01-15T10:00:00.000Z',
  updatedAt: '2024-01-15T10:00:00.000Z',
};

export const mockEligibleSettlement: EligibleSettlement = {
  recipientId: 'user-1',
  recipientName: '서울 FC',
  settlementCount: 3,
  grossAmount: 450000,
  platformFee: 45000,
  netAmount: 405000,
  oldestReleasedAt: '2024-01-08T10:00:00.000Z',
};
