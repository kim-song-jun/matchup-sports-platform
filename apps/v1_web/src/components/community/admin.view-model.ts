import type {
  AdminAuditLogModel,
  AdminAuditModel,
  AdminAuthorityInput,
  AdminAuthorityModel,
  AdminContractModel,
  AdminDashboardModel,
  AdminDomainModel,
  AdminLogsInput,
  AdminLoadState,
  AdminMetricModel,
  AdminOverviewInput,
} from './admin.types';
import {
  actionLabel,
  actorLabel,
  arrayOfStrings,
  asRecord,
  capabilityLabels,
  emptyAuthority,
  formatCount,
  formatDateTime,
  nestedTotal,
  numberField,
  pendingLabel,
  reasonLabel,
  roleLabel,
  serviceErrorMessage,
  statusLabel,
  stringField,
  targetLabel,
} from './admin.view-helpers';

type DashboardModelInput = {
  readonly authority: AdminAuthorityInput;
  readonly overview: AdminOverviewInput;
  readonly logs: AdminLogsInput;
  readonly statusLogs?: AdminLogsInput;
  readonly authorityState: AdminLoadState;
  readonly overviewState: AdminLoadState;
  readonly logsState: AdminLoadState;
  readonly statusLogsState?: AdminLoadState;
  readonly errorMessage?: string;
};

type AuditModelInput = {
  readonly authority: AdminAuthorityInput;
  readonly logs: AdminLogsInput;
  readonly authorityState: AdminLoadState;
  readonly state: AdminLoadState;
  readonly nextCursor?: string | null;
  readonly errorMessage?: string;
};

type OverviewSummary = {
  readonly users?: number;
  readonly matches?: number;
  readonly teams?: number;
  readonly teamMatches?: number;
  readonly pendingActions?: number;
};

const contracts: readonly AdminContractModel[] = [
  { title: '관리자 권한', detailLabel: '확인됨', state: 'connected', description: '현재 계정으로 운영 현황과 감사 기록을 확인할 수 있습니다.' },
  { title: '운영 현황', detailLabel: '열람 가능', state: 'connected', description: '사용자, 개인 매치, 팀, 팀 매치의 주요 상태를 한 화면에서 확인합니다.' },
  { title: '감사 기록', detailLabel: '열람 가능', state: 'connected', description: '운영 활동의 주체, 대상, 사유, 시간을 추적합니다.' },
  { title: '상태 변경 기록', detailLabel: '열람 가능', state: 'connected', description: '사용자와 운영자가 남긴 상태 변경 이력을 확인합니다.' },
  { title: '상태 변경 처리', detailLabel: '확인 필요', state: 'action-required', description: '대상과 사유가 확인된 업무만 처리할 수 있습니다.' },
  { title: '정산/분쟁', detailLabel: '준비 중', state: 'unavailable', description: '서비스 처리 화면을 준비 중이며 완료 상태로 표시하지 않습니다.' },
];

export function toAdminDashboardModel(input: DashboardModelInput): AdminDashboardModel {
  const state = combinedState([input.authorityState, input.overviewState, input.logsState, input.statusLogsState ?? 'ready']);
  const authority = toAuthority(input.authority, input.authorityState);
  const overview = toOverviewSummary(input.overview);

  return {
    state,
    authority,
    metrics: toMetrics(overview, state),
    domains: toDomains(overview, state, authority),
    contracts,
    recentLogs: [...toAuditLogs(input.logs), ...toAuditLogs(input.statusLogs)].slice(0, 4),
    pendingActionsLabel: pendingLabel(overview.pendingActions, state),
    errorMessage: serviceErrorMessage(input.errorMessage),
  };
}

export function toAdminAuditModel(input: AuditModelInput): AdminAuditModel {
  return {
    state: combinedState([input.authorityState, input.state]),
    authority: toAuthority(input.authority, input.authorityState),
    logs: toAuditLogs(input.logs),
    nextCursorLabel: input.nextCursor ? '다음 로그 있음' : '마지막 페이지',
    errorMessage: serviceErrorMessage(input.errorMessage),
  };
}

function combinedState(states: readonly AdminLoadState[]): AdminLoadState {
  if (states.includes('error')) return 'error';
  if (states.includes('loading')) return 'loading';
  return 'ready';
}

function toMetrics(overview: OverviewSummary, state: AdminLoadState): readonly AdminMetricModel[] {
  return [
    { id: 'users', label: '사용자', value: formatCount(overview.users, state), sub: '활성/제재/탈퇴대기 합산' },
    { id: 'matches', label: '개인 매치', value: formatCount(overview.matches, state), sub: '모집/취소/완료 합산' },
    { id: 'teams', label: '팀', value: formatCount(overview.teams, state), sub: '활성/정지/보관 합산' },
    { id: 'teamMatches', label: '팀 매치', value: formatCount(overview.teamMatches, state), sub: '모집/성사/취소 합산' },
    {
      id: 'pendingActions',
      label: '검토 큐',
      value: formatCount(overview.pendingActions, state),
      sub: '운영 검토 현황',
      tone: overview.pendingActions && overview.pendingActions > 0 ? 'down' : undefined,
    },
  ];
}

function toDomains(overview: OverviewSummary, state: AdminLoadState, authority: AdminAuthorityModel): readonly AdminDomainModel[] {
  const statusLabel = authority.canWriteStatus ? '처리 가능' : '읽기 전용';
  const statusTone = state === 'error' ? 'blocked' : authority.canWriteStatus ? 'ready' : 'warning';
  const detailLabel = authority.canWriteStatus ? '상태 변경에서 처리' : '현황 확인';
  return [
    {
      id: 'users',
      title: '사용자',
      count: formatCount(overview.users, state),
      unit: '명',
      description: '계정 상태를 확인하고 필요한 조치를 기록합니다.',
      detailLabel,
      statusLabel,
      statusTone,
    },
    {
      id: 'matches',
      title: '개인 매치',
      count: formatCount(overview.matches, state),
      unit: '건',
      description: '모집, 취소, 완료 흐름을 확인하고 필요한 조치를 기록합니다.',
      detailLabel,
      statusLabel,
      statusTone,
    },
    {
      id: 'teams',
      title: '팀',
      count: formatCount(overview.teams, state),
      unit: '개',
      description: '팀 운영 상태를 확인하고 필요한 조치를 기록합니다.',
      detailLabel,
      statusLabel,
      statusTone,
    },
    {
      id: 'teamMatches',
      title: '팀 매치',
      count: formatCount(overview.teamMatches, state),
      unit: '건',
      description: '팀 매치 진행 상태를 확인하고 필요한 조치를 기록합니다.',
      detailLabel,
      statusLabel,
      statusTone,
    },
    {
      id: 'settlementsDisputes',
      title: '정산/분쟁',
      count: '준비 중',
      unit: '',
      description: '정산과 분쟁 처리는 준비 중입니다. 실제 처리 없이 완료로 표시하지 않습니다.',
      detailLabel: '기능 준비 중',
      statusLabel: '준비 중',
      statusTone: 'blocked',
    },
  ];
}

function toAuthority(input: AdminAuthorityInput, state: AdminLoadState): AdminAuthorityModel {
  if (state === 'loading') return emptyAuthority('권한 확인 중', '확인 중');
  if (state === 'error') return emptyAuthority('권한 확인 실패', '확인 필요');
  const record = asRecord(input);
  const capabilities = arrayOfStrings(record?.capabilities);
  return {
    roleLabel: roleLabel(stringField(record, 'adminRole')),
    statusLabel: statusLabel(stringField(record, 'status')),
    capabilities,
    capabilityLabels: capabilityLabels(capabilities),
    canWriteStatus: capabilities.includes('status:write'),
  };
}

function toOverviewSummary(input: AdminOverviewInput): OverviewSummary {
  const record = asRecord(input);
  return {
    users: numberField(record, 'users') ?? nestedTotal(record, 'users', ['active', 'suspended', 'blocked', 'withdrawalPending']),
    matches: numberField(record, 'matches') ?? nestedTotal(record, 'matches', ['recruiting', 'cancelled', 'completed']),
    teams: numberField(record, 'teams') ?? nestedTotal(record, 'teams', ['active', 'suspended', 'archived']),
    teamMatches: numberField(record, 'teamMatches') ?? nestedTotal(record, 'teamMatches', ['recruiting', 'matched', 'cancelled']),
    pendingActions: numberField(record, 'pendingActions'),
  };
}

function toAuditLogs(logs: AdminLogsInput): readonly AdminAuditLogModel[] {
  const items = Array.isArray(logs) ? logs : asRecord(logs)?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    const record = asRecord(item);
    if (!record) return [];
    const id = stringField(record, 'id') ?? stringField(record, 'actionLogId') ?? stringField(record, 'statusChangeLogId');
    const createdAt = stringField(record, 'createdAt');
    if (!id || !createdAt) return [];
    return [{
      id,
      actorId: actorLabel(record),
      action: actionLabel(record),
      target: targetLabel(record),
      reason: reasonLabel(record),
      createdAt: formatDateTime(createdAt),
    }];
  });
}
