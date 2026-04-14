import type { AdminStats, Settlement, Dispute } from '@/types/api';

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

export const mockDispute: Dispute = {
  id: 'dispute-1',
  reporterTeamId: 'team-1',
  reportedTeamId: 'team-2',
  teamMatchId: 'tm-1',
  type: 'no_show',
  description: '상대팀이 노쇼했어요',
  status: 'pending',
  createdAt: '2024-01-01T00:00:00.000Z',
};
