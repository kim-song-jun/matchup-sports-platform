export type AdminLoadState = 'loading' | 'ready' | 'error';
export type AdminTone = 'neutral' | 'positive' | 'warning';

export type AdminMetricModel = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly sub: string;
  readonly tone: AdminTone;
};

export type AdminActionLinkModel = {
  readonly label: string;
  readonly href: string;
  readonly tone: 'primary' | 'neutral';
  readonly ariaLabel?: string;
};

export type AdminWorkItemModel = {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  readonly statusLabel: string;
  readonly href: string;
  readonly action: AdminActionLinkModel;
  readonly tone: AdminTone;
};

export type AdminQueueItemModel = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly sourceLabel: string;
  readonly actionLabel: string;
  readonly tone: AdminTone;
};

export type AdminTeamModel = {
  readonly id: string;
  readonly name: string;
  readonly meta: string;
  readonly roleLabel: string;
  readonly memberLabel: string;
  readonly href: string;
  readonly action: AdminActionLinkModel;
};

export type AdminDashboardModel = {
  readonly state: AdminLoadState;
  readonly operatorName: string;
  readonly workspaceLabel: string;
  readonly profileMeta: string;
  readonly metrics: readonly AdminMetricModel[];
  readonly primaryActions: readonly AdminActionLinkModel[];
  readonly queue: readonly AdminQueueItemModel[];
  readonly personalMatches: readonly AdminWorkItemModel[];
  readonly teamMatches: readonly AdminWorkItemModel[];
  readonly teams: readonly AdminTeamModel[];
  readonly communication: readonly AdminQueueItemModel[];
  readonly errorMessage?: string;
};

export type AdminActivityItemModel = {
  readonly id: string;
  readonly title: string;
  readonly sourceLabel: string;
  readonly detail: string;
  readonly occurredAt: string;
  readonly href: string;
  readonly tone: AdminTone;
};

export type AdminActivityModel = {
  readonly state: AdminLoadState;
  readonly operatorName: string;
  readonly summaryLabel: string;
  readonly items: readonly AdminActivityItemModel[];
  readonly errorMessage?: string;
};

export type AdminFunctionActiveTab = 'matches' | 'teamMatches' | 'teams' | 'reviews' | 'notifications';

export type AdminFunctionStatModel = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly sub: string;
  readonly tone: AdminTone;
};

export type AdminFunctionRowModel = {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  readonly statusLabel: string;
  readonly href: string;
  readonly actions: readonly AdminActionLinkModel[];
  readonly tone: AdminTone;
};

export type AdminFunctionSideItemModel = {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly tone: AdminTone;
};

export type AdminFunctionPageModel = {
  readonly state: AdminLoadState;
  readonly activeTab: AdminFunctionActiveTab;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly testId: string;
  readonly operatorName: string;
  readonly summaryLabel: string;
  readonly summaryDetail: string;
  readonly loadingTitle: string;
  readonly loadingBody: string;
  readonly stats: readonly AdminFunctionStatModel[];
  readonly primaryActions: readonly AdminActionLinkModel[];
  readonly rows: readonly AdminFunctionRowModel[];
  readonly emptyTitle: string;
  readonly sideTitle: string;
  readonly sideItems: readonly AdminFunctionSideItemModel[];
  readonly errorMessage?: string;
};
