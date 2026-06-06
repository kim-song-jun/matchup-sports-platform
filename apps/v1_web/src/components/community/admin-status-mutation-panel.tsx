'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { v1Post } from '@/lib/api-client';
import type { AdminLoadState } from './admin.types';
import { serviceErrorMessage } from './admin.view-helpers';

type AdminStatusTarget = 'user' | 'match' | 'team' | 'teamMatch';
type AdminStatusMutationResult = {
  readonly status: string;
  readonly actionLogId: string;
};
type StatusOption = { readonly value: string; readonly label: string };
type TargetConfig = {
  readonly label: string;
  readonly idLabel: string;
  readonly path: (targetId: string) => string;
  readonly statuses: readonly StatusOption[];
};

const targetOrder: readonly AdminStatusTarget[] = ['user', 'match', 'team', 'teamMatch'];

const targetConfigs: Record<AdminStatusTarget, TargetConfig> = {
  user: {
    label: '사용자',
    idLabel: '사용자 ID',
    path: (targetId) => `/admin/users/${targetId}/status`,
    statuses: [
      { value: 'active', label: '정상' },
      { value: 'suspended', label: '일시 정지' },
      { value: 'blocked', label: '차단' },
      { value: 'deleted', label: '삭제 처리' },
    ],
  },
  match: {
    label: '개인 매치',
    idLabel: '개인 매치 ID',
    path: (targetId) => `/admin/matches/${targetId}/status`,
    statuses: [
      { value: 'recruiting', label: '모집 중' },
      { value: 'closed', label: '모집 마감' },
      { value: 'cancelled', label: '취소' },
      { value: 'completed', label: '완료' },
      { value: 'archived', label: '보관' },
    ],
  },
  team: {
    label: '팀',
    idLabel: '팀 ID',
    path: (targetId) => `/admin/teams/${targetId}/status`,
    statuses: [
      { value: 'active', label: '정상' },
      { value: 'suspended', label: '일시 정지' },
      { value: 'archived', label: '보관' },
    ],
  },
  teamMatch: {
    label: '팀 매치',
    idLabel: '팀 매치 ID',
    path: (targetId) => `/admin/team-matches/${targetId}/status`,
    statuses: [
      { value: 'recruiting', label: '모집 중' },
      { value: 'matched', label: '성사' },
      { value: 'cancelled', label: '취소' },
      { value: 'completed', label: '완료' },
      { value: 'archived', label: '보관' },
    ],
  },
};

export function AdminStatusMutationPanel({
  canWriteStatus,
  authorityState = 'ready',
}: {
  readonly canWriteStatus: boolean;
  readonly authorityState?: AdminLoadState;
}) {
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState<AdminStatusTarget>('user');
  const [targetId, setTargetId] = useState('');
  const [status, setStatus] = useState(targetConfigs.user.statuses[1]?.value ?? targetConfigs.user.statuses[0].value);
  const [reason, setReason] = useState('');
  const config = targetConfigs[targetType];
  const authorityLoading = authorityState === 'loading';
  const disabled = authorityLoading || !canWriteStatus;
  const canSubmit = !authorityLoading && canWriteStatus && targetId.trim().length > 0 && reason.trim().length > 0;
  const mutation = useMutation({
    mutationFn: () =>
      v1Post<AdminStatusMutationResult>(config.path(targetId.trim()), {
        status,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['v1', 'admin'] });
    },
  });

  const updateTargetType = (nextTargetType: AdminStatusTarget) => {
    const nextConfig = targetConfigs[nextTargetType];
    setTargetType(nextTargetType);
    setTargetId('');
    setStatus(nextConfig.statuses[0].value);
    setReason('');
    mutation.reset();
  };

  return (
    <section className="tm-admin-mutation-panel" aria-label="상태 변경">
      <div className="tm-text-body-lg">상태 변경</div>
      <p>대상 ID, 변경 상태, 사유를 입력하면 처리 기록과 감사 기록에 남습니다.</p>
      {authorityLoading ? <div className="tm-admin-mutation-note">권한을 확인하는 중입니다.</div> : null}
      {!authorityLoading && !canWriteStatus ? <div className="tm-admin-mutation-note">현재 권한은 읽기 전용입니다.</div> : null}
      <form
        className="tm-admin-mutation-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit || mutation.isPending) return;
          mutation.mutate();
        }}
      >
        <label className="tm-admin-field">
          <span>대상 종류</span>
          <select
            aria-label="대상 종류"
            disabled={disabled || mutation.isPending}
            onChange={(event) => {
              if (isAdminStatusTarget(event.currentTarget.value)) updateTargetType(event.currentTarget.value);
            }}
            value={targetType}
          >
            {targetOrder.map((value) => <option key={value} value={value}>{targetConfigs[value].label}</option>)}
          </select>
        </label>
        <label className="tm-admin-field">
          <span>{config.idLabel}</span>
          <input
            aria-label="대상 ID"
            disabled={disabled || mutation.isPending}
            onChange={(event) => {
              setTargetId(event.target.value);
              mutation.reset();
            }}
            placeholder={config.idLabel}
            value={targetId}
          />
        </label>
        <label className="tm-admin-field">
          <span>변경 상태</span>
          <select
            aria-label="변경 상태"
            disabled={disabled || mutation.isPending}
            onChange={(event) => {
              setStatus(event.target.value);
              mutation.reset();
            }}
            value={status}
          >
            {config.statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="tm-admin-field">
          <span>처리 사유</span>
          <textarea
            aria-label="처리 사유"
            disabled={disabled || mutation.isPending}
            onChange={(event) => {
              setReason(event.target.value);
              mutation.reset();
            }}
            placeholder="사유를 입력하세요"
            rows={3}
            value={reason}
          />
        </label>
        <button className="tm-btn tm-btn-sm tm-btn-primary" disabled={!canSubmit || mutation.isPending} type="submit">
          {mutation.isPending ? '기록 중' : '상태 변경 기록'}
        </button>
      </form>
      {mutation.isError ? (
        <div className="tm-admin-mutation-result tm-admin-mutation-result-error" role="alert">
          <strong>상태 변경에 실패했습니다</strong>
          <span>{formatAdminMutationError(mutation.error)}</span>
        </div>
      ) : null}
      {mutation.isSuccess ? <AdminMutationSuccess result={mutation.data} /> : null}
    </section>
  );
}

function isAdminStatusTarget(value: string): value is AdminStatusTarget {
  return targetOrder.some((target) => target === value);
}

function formatAdminMutationError(error: unknown) {
  if (error instanceof Error) return serviceErrorMessage(error.message) ?? error.message;
  return '상태 변경 요청을 처리하지 못했습니다.';
}

function AdminMutationSuccess({ result }: { readonly result: AdminStatusMutationResult }) {
  return (
    <div className="tm-admin-mutation-result" role="status">
      <strong>감사 기록이 생성되었습니다</strong>
      <span>변경 후 상태: {statusLabelForValue(result.status)}</span>
      <span>감사 기록 ID: {result.actionLogId}</span>
    </div>
  );
}

function statusLabelForValue(value: string) {
  for (const target of Object.values(targetConfigs)) {
    const option = target.statuses.find((item) => item.value === value);
    if (option) return option.label;
  }
  return value;
}
