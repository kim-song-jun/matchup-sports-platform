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

// Marketplace dispute fixture — buyerId is the disputing party, sellerId is the responding party.
export const mockDispute: Dispute = {
  id: 'dispute-1',
  targetType: 'marketplace_order',
  orderId: 'order-1',
  teamMatchId: null,
  type: 'not_as_described',
  status: 'filed',
  buyerId: 'user-2',
  sellerId: 'user-1',
  buyer: { id: 'user-2', nickname: '구매자', profileImageUrl: null },
  seller: { id: 'user-1', nickname: '판매자', profileImageUrl: null },
  description: '상품 상태가 설명과 달라요. 실제로는 poor 상태입니다.',
  resolution: null,
  resolvedByAdminId: null,
  resolvedAt: null,
  createdAt: '2024-01-10T10:00:00.000Z',
  updatedAt: '2024-01-10T10:00:00.000Z',
  events: [],
};

// Team-match dispute fixture — host team rep is buyerId, opponent team rep is sellerId.
export const mockTeamMatchDispute: Dispute = {
  id: 'dispute-2',
  targetType: 'team_match',
  orderId: null,
  teamMatchId: 'tm-1',
  type: 'no_show',
  status: 'filed',
  buyerId: 'user-3',
  sellerId: 'user-4',
  buyer: { id: 'user-3', nickname: '신고인', profileImageUrl: null },
  seller: { id: 'user-4', nickname: '피신고인', profileImageUrl: null },
  description: '상대팀이 노쇼했어요',
  resolution: null,
  resolvedByAdminId: null,
  resolvedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  events: [],
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
