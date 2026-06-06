import type { CursorPage } from '@/types/api';
import type { V1AdminActionLog, V1AdminMe, V1AdminOverview, V1AdminStatusChangeLog } from '@/types/admin-api';

export const v1AdminMeFixture: V1AdminMe = {
  userId: 'user-admin-1',
  adminUserId: 'admin-1',
  adminRole: 'owner',
  status: 'active',
  capabilities: ['overview:read', 'status:write', 'logs:read', 'admin:owner'],
  lastActiveAt: null,
};

export const v1AdminOverviewFixture: V1AdminOverview = {
  users: { active: 12, suspended: 1, blocked: 0, withdrawalPending: 2 },
  matches: { recruiting: 3, cancelled: 1, completed: 9 },
  teams: { active: 4, suspended: 1, archived: 0 },
  teamMatches: { recruiting: 2, matched: 3, cancelled: 1 },
  recentActions: [
    {
      actionLogId: 'admin-log-1',
      actionType: 'user.status.update',
      targetType: 'user',
      createdAt: '2026-05-18T09:00:00.000Z',
    },
  ],
};

export const v1AdminActionLogsFixture: CursorPage<V1AdminActionLog> = {
  items: [
    {
      actionLogId: 'admin-log-1',
      adminUserId: 'admin-1',
      actionType: 'user.status.update',
      targetType: 'user',
      targetId: 'user-7',
      reason: '반복 노쇼 제보 확인',
      beforeState: { accountStatus: 'active' },
      afterState: { accountStatus: 'suspended' },
      createdAt: '2026-05-18T09:00:00.000Z',
    },
  ],
  nextCursor: null,
  pageInfo: { nextCursor: null, hasNext: false },
};

export const v1AdminStatusChangeLogsFixture: CursorPage<V1AdminStatusChangeLog> = {
  items: [
    {
      statusChangeLogId: 'status-log-1',
      targetType: 'user',
      targetId: 'user-7',
      fromStatus: 'active',
      toStatus: 'suspended',
      actorUserId: null,
      adminUserId: 'admin-1',
      reason: '반복 노쇼 제보 확인',
      createdAt: '2026-05-18T09:00:00.000Z',
    },
  ],
  nextCursor: null,
  pageInfo: { nextCursor: null, hasNext: false },
};
