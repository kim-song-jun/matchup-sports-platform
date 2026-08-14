'use client';

import { CheckCircle2 } from 'lucide-react';
import { useV1AckSmsFailures, useV1RecentSmsFailures } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import { AdminDataTable, AdminEmpty } from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';
import type { V1SmsFailureSummary } from '@/types/api';

/**
 * 서버가 내려주는 eventType 은 자유 문자열이라, 아는 값만 한국어로 바꾸고 모르는 값은
 * 원문을 그대로 보여준다 — 백엔드에 새 이벤트가 추가돼도 빈칸이 되지 않는다.
 */
const EVENT_TYPE_LABEL: Record<string, string> = {
  SMS_SEND_FAILED: 'SMS 발송 실패',
  SMS_NOT_CONFIGURED: 'SMS 설정 없음',
  VERIFICATION_CODE_MISMATCH: '인증번호 불일치',
  VERIFICATION_TOO_MANY_ATTEMPTS: '시도 횟수 초과',
  VERIFICATION_RESEND_COOLDOWN: '재발송 쿨다운',
};

function eventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABEL[eventType] ?? eventType;
}

// ── Component ─────────────────────────────────────────────────────────────
export function SmsFailureTable() {
  const { data: failures, isLoading, isError, error, refetch } = useV1RecentSmsFailures();
  const ackMutation = useV1AckSmsFailures();

  const columns: AdminTableColumn<V1SmsFailureSummary>[] = [
    {
      key: 'eventType',
      header: '유형',
      render: (failure) => (
        <span className="text-[var(--font-size-label)] font-medium text-[var(--text-body)] whitespace-nowrap">
          {eventTypeLabel(failure.eventType)}
        </span>
      ),
    },
    {
      key: 'phoneMasked',
      header: '대상',
      render: (failure) => (
        <span className="font-mono text-[var(--font-size-label)] text-[var(--text-muted)]">
          …{failure.phoneMasked}
        </span>
      ),
    },
    {
      key: 'resultCode',
      header: '결과 코드',
      align: 'center',
      width: 'w-[96px]',
      render: (failure) => (
        <span className="font-mono tabular-nums text-[var(--text-body)]">{failure.resultCode ?? '—'}</span>
      ),
    },
    {
      key: 'detail',
      header: '상세',
      render: (failure) => (
        // detail 은 provider 응답 본문까지 들어올 수 있어 길다 — 한 줄로 자르고
        // 전체 내용은 title 로 확인하게 한다.
        // truncate(=white-space:nowrap)는 lg 이상에서만 건다. 모바일 카드의 값 셀(dd)은
        // flex-1 이지만 min-w-0 가 없어, nowrap 텍스트가 곧 min-content 폭이 되어 셀이
        // 줄어들지 못하고 카드 밖으로 넘친다. 모바일에선 줄바꿈시켜 전문을 그대로 읽히고,
        // 폭이 넉넉한 데스크톱 테이블에서만 한 줄로 잘라 title 로 전문을 보게 한다.
        <span className="block break-words text-[var(--text-muted)] lg:max-w-[280px] lg:truncate" title={failure.detail ?? undefined}>
          {failure.detail ?? '—'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: '발생 시각',
      render: (failure) => (
        <span className="text-[var(--text-muted)] whitespace-nowrap">{formatAdminDateTime(failure.createdAt)}</span>
      ),
    },
    {
      key: 'ack',
      header: '확인',
      align: 'center',
      width: 'w-[88px]',
      render: (failure) =>
        failure.acknowledgedAt ? (
          <span className="inline-flex items-center gap-1 text-[var(--font-size-micro)] font-semibold text-[var(--text-muted)]">
            <CheckCircle2 size={13} aria-hidden="true" />
            확인됨
          </span>
        ) : (
          <button
            type="button"
            onClick={() => ackMutation.mutate([failure.id])}
            disabled={ackMutation.isPending}
            className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium text-[var(--blue700)] bg-[var(--blue50)] hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            // 유형 라벨에 이미 '실패'가 들어가는 경우가 많아 '… 실패 확인'은 중복이 된다.
            // 대상까지 붙여 같은 유형의 행끼리도 스크린리더에서 구분되게 한다.
            aria-label={`${eventTypeLabel(failure.eventType)} (대상 ${failure.phoneMasked}) 확인 처리`}
          >
            확인
          </button>
        ),
    },
  ];

  return (
    <AdminDataTable<V1SmsFailureSummary>
      columns={columns}
      rows={failures ?? []}
      keyExtractor={(failure) => failure.id}
      loading={isLoading}
      error={isError ? extractErrorMessage(error, '실패 기록을 불러오지 못했어요.') : undefined}
      onRetry={() => void refetch()}
      empty={
        <AdminEmpty
          title="최근 실패 기록이 없어요"
          description="SMS 발송이나 휴대폰·이메일 인증이 실패하면 여기에 표시돼요."
        />
      }
    />
  );
}
