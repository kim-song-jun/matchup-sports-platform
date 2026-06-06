import type { AdminAuthorityModel, AdminLoadState } from './admin.types';

type UnknownRecord = { readonly [key: string]: unknown };

export function formatCount(value: number | null | undefined, state: AdminLoadState) {
  if (state === 'loading') return '로딩';
  if (typeof value !== 'number') return '-';
  return value.toLocaleString('ko-KR');
}

export function pendingLabel(value: number | null | undefined, state: AdminLoadState) {
  if (state === 'loading') return '운영 검토 현황을 확인하는 중';
  if (typeof value !== 'number') return '별도 검토 대기 항목 없음';
  if (value === 0) return '대기 중인 운영 검토 없음';
  return `${value.toLocaleString('ko-KR')}건의 검토가 대기 중`;
}

export function asRecord(value: unknown): UnknownRecord | null {
  return isRecord(value) ? value : null;
}

export function numberField(record: UnknownRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === 'number' ? value : undefined;
}

export function stringField(record: UnknownRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

export function nestedTotal(record: UnknownRecord | null, key: string, fields: readonly string[]) {
  const nested = asRecord(record?.[key]);
  if (!nested) return undefined;
  const values = fields.map((field) => numberField(nested, field)).filter((value): value is number => typeof value === 'number');
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

export function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function emptyAuthority(roleLabelValue: string, statusLabelValue: string): AdminAuthorityModel {
  return {
    roleLabel: roleLabelValue,
    statusLabel: statusLabelValue,
    capabilities: [],
    capabilityLabels: [],
    canWriteStatus: false,
  };
}

export function roleLabel(role: string | undefined) {
  if (role === 'owner') return '최고 관리자';
  if (role === 'ops') return '운영 관리자';
  if (role === 'support') return '지원 관리자';
  return '관리자';
}

export function statusLabel(status: string | undefined) {
  if (status === 'active') return '정상';
  if (status === 'suspended') return '일시 정지';
  if (status === 'inactive') return '비활성';
  return '확인 필요';
}

export function capabilityLabels(capabilities: readonly string[]) {
  return capabilities.map((capability) => {
    if (capability === 'overview:read') return '운영 현황 열람';
    if (capability === 'status:write') return '상태 변경 처리';
    if (capability === 'logs:read') return '감사 기록 열람';
    if (capability === 'admin:owner') return '전체 운영 권한';
    return '운영 권한';
  });
}

export function actorLabel(record: UnknownRecord) {
  if (stringField(record, 'adminUserId') || stringField(record, 'actorUserId') || stringField(record, 'actorId')) return '운영자';
  return '시스템';
}

export function actionLabel(record: UnknownRecord) {
  const action = stringField(record, 'action') ?? stringField(record, 'actionType');
  if (stringField(record, 'fromStatus') || stringField(record, 'toStatus')) return '상태 변경';
  if (action === 'status_check') return '상태 확인';
  if (action === 'status_change' || action === 'status_updated') return '상태 변경';
  if (action === 'seed.coverage.review') return '운영 점검';
  return '운영 기록';
}

export function targetLabel(record: UnknownRecord) {
  const type = stringField(record, 'targetType');
  if (type === 'system') return '운영 시스템';
  if (type === 'user') return '사용자';
  if (type === 'match') return '개인 매치';
  if (type === 'team') return '팀';
  if (type === 'team_match' || type === 'teamMatch') return '팀 매치';
  return '대상 미확인';
}

export function reasonLabel(record: UnknownRecord) {
  const reason = stringField(record, 'reason');
  if (!reason) return '사유 없음';
  if (/seed|smoke|action log|coverage|fixture/i.test(reason)) return '정기 운영 점검';
  return reason;
}

export function serviceErrorMessage(message: string | undefined) {
  if (!message) return undefined;
  if (message.includes('Active admin access')) return '관리자 권한이 필요합니다.';
  if (message.includes('V1 authentication') || message.includes('Unauthorized')) return '로그인이 필요합니다.';
  if (message.includes('Forbidden')) return '접근 권한을 확인해 주세요.';
  if (/v1|api|route|contract|guard|capability/i.test(message)) return '관리자 정보를 불러오지 못했습니다. 권한과 연결 상태를 확인해 주세요.';
  return message;
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
