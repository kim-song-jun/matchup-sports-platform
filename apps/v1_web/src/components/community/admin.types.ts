export type AdminLoadState = 'loading' | 'ready' | 'error';
export type AdminContractState = 'connected' | 'action-required' | 'unavailable';

export type AdminMetricModel = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly sub: string;
  readonly tone?: 'up' | 'down';
};

export type AdminDomainModel = {
  readonly id: string;
  readonly title: string;
  readonly count: string;
  readonly unit: string;
  readonly description: string;
  readonly detailLabel: string;
  readonly statusLabel: string;
  readonly statusTone: 'ready' | 'warning' | 'blocked';
};

export type AdminContractModel = {
  readonly title: string;
  readonly detailLabel: string;
  readonly state: AdminContractState;
  readonly description: string;
};

export type AdminAuthorityModel = {
  readonly roleLabel: string;
  readonly statusLabel: string;
  readonly capabilities: readonly string[];
  readonly capabilityLabels: readonly string[];
  readonly canWriteStatus: boolean;
};

export type AdminAuditLogModel = {
  readonly id: string;
  readonly actorId: string;
  readonly action: string;
  readonly target: string;
  readonly reason: string;
  readonly createdAt: string;
};

export type AdminDashboardModel = {
  readonly state: AdminLoadState;
  readonly authority: AdminAuthorityModel;
  readonly metrics: readonly AdminMetricModel[];
  readonly domains: readonly AdminDomainModel[];
  readonly contracts: readonly AdminContractModel[];
  readonly recentLogs: readonly AdminAuditLogModel[];
  readonly pendingActionsLabel: string;
  readonly errorMessage?: string;
};

export type AdminAuditModel = {
  readonly state: AdminLoadState;
  readonly authority: AdminAuthorityModel;
  readonly logs: readonly AdminAuditLogModel[];
  readonly nextCursorLabel: string;
  readonly errorMessage?: string;
};

export type AdminAuthorityInput = unknown;
export type AdminOverviewInput = unknown;
export type AdminLogsInput = unknown;
