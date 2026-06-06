export type V1AdminRole = 'owner' | 'ops' | 'support';

export type V1AdminCapability = 'overview:read' | 'status:write' | 'logs:read' | 'admin:owner';

export type V1AdminMe = {
  readonly userId: string;
  readonly adminUserId: string;
  readonly adminRole: V1AdminRole;
  readonly status: 'active';
  readonly capabilities: readonly V1AdminCapability[];
  readonly lastActiveAt: string | null;
};

export type V1AdminOverview = {
  readonly users: {
    readonly active: number;
    readonly suspended: number;
    readonly blocked: number;
    readonly withdrawalPending: number;
  };
  readonly matches: {
    readonly recruiting: number;
    readonly cancelled: number;
    readonly completed: number;
  };
  readonly teams: {
    readonly active: number;
    readonly suspended: number;
    readonly archived: number;
  };
  readonly teamMatches: {
    readonly recruiting: number;
    readonly matched: number;
    readonly cancelled: number;
  };
  readonly recentActions: readonly V1AdminRecentAction[];
};

export type V1AdminRecentAction = {
  readonly actionLogId: string;
  readonly actionType: string;
  readonly targetType: string;
  readonly createdAt: string;
};

export type V1AdminActionLog = {
  readonly actionLogId: string;
  readonly adminUserId: string;
  readonly actionType: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly reason: string | null;
  readonly beforeState: unknown;
  readonly afterState: unknown;
  readonly createdAt: string;
};

export type V1AdminStatusChangeLog = {
  readonly statusChangeLogId: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly fromStatus: string | null;
  readonly toStatus: string;
  readonly actorUserId: string | null;
  readonly adminUserId: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
};

export type V1AdminLogFilters = {
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly adminUserId?: string;
  readonly actorUserId?: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly actionType?: string;
};
