'use client';

import { useState } from 'react';
import { Lock, ToggleLeft, ToggleRight } from 'lucide-react';
import { useV1SetSimplifiedOperationFlagGate } from '@/hooks/use-v1-api';
import { GateConfirmModal } from './operation-flag-gate-confirm-modal';
import { friendlyGateErrorMessage } from './operation-flag-gate-errors';
import type { V1SimplifiedOperationFlagGateStatus } from '@/types/api';

interface GateModeCardProps {
  gateStatus: V1SimplifiedOperationFlagGateStatus | undefined;
  isPending: boolean;
  isError: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
}

/**
 * 이 화면의 마스터 스위치 카드. 꺼져 있으면 아래 5단계 스테퍼 전체가 조작 불가 상태로
 * 표시된다(스테퍼 쪽에서 처리) — 이 카드는 그 스위치 자체를 켜고 끄는 역할만 한다.
 */
export function GateModeCard({ gateStatus, isPending, isError, showToast }: GateModeCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mutation = useV1SetSimplifiedOperationFlagGate();
  const enabled = gateStatus?.enabled ?? false;
  const turningOn = !enabled;

  function submit(reason: string) {
    if (!gateStatus) return;
    mutation.mutate(
      { expectedVersion: gateStatus.version, enabled: turningOn, reason },
      {
        onSuccess: (updated) => {
          showToast(
            `간소 전환 모드를 ${updated.enabled ? '켰어요' : '껐어요'}.`,
            'success',
          );
          setConfirmOpen(false);
        },
        onError: (err) => {
          showToast(friendlyGateErrorMessage(err), 'error');
          setConfirmOpen(false);
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-3 bg-white border border-gray-100 rounded-2xl p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-bold text-gray-900">간소 전환 모드</h2>
            {!isPending && !isError && (
              <span
                className={[
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold',
                  enabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500',
                ].join(' ')}
              >
                {enabled ? <ToggleRight size={12} aria-hidden="true" /> : <ToggleLeft size={12} aria-hidden="true" />}
                {enabled ? '켜짐' : '꺼짐'}
              </span>
            )}
          </div>
          <p className="text-[13px] text-gray-500 mt-1.5 leading-relaxed">
            게이트 번들(R1/R2 서명, 최소 14일) 절차 없이 아래 5단계를 바로 실행할 수 있게 하는
            스위치예요. 켜져 있는 동안에도 CAS·감사 로그·전환 순서 같은 안전장치는 그대로
            적용돼요 — 생략되는 건 서류 절차뿐이에요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending || isError || !gateStatus}
          // 스테퍼 단계 버튼들도 라벨이 "켜기"라, 보이는 글자만으로는 스크린리더
          // 사용자가 이 버튼이 마스터 스위치인지 4단계 토글인지 구분할 수 없다.
          aria-label={`간소 전환 모드 ${enabled ? '끄기' : '켜기'}`}
          className={[
            'shrink-0 inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl text-[13px] font-semibold transition-colors',
            'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-40 disabled:cursor-not-allowed',
            enabled ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-blue-500 text-white hover:bg-blue-600',
          ].join(' ')}
        >
          {enabled ? '끄기' : '켜기'}
        </button>
      </div>

      {isError && (
        // 기존 코드(Copilot 리뷰로 고쳐진 버그)의 dark: 변형을 그대로 보존한다 — admin은
        // 대체로 라이트 전용이지만 이 배너는 이미 다크 클래스가 있던 자리라 관례를 바꾸지
        // 않고 유지한다(R-T2: text-sm → text-[13px]로 이 화면의 4단계 타입 스케일에 맞춤).
        <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          <Lock size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          간소 전환 모드 상태를 확인하지 못했어요. 권한이 없거나 일시적인 오류일 수 있어요 —
          새로고침해도 같으면 플랫폼 운영자에게 문의해 주세요.
        </p>
      )}

      {gateStatus && (
        <dl className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-50 text-[12px]">
          <div>
            <dt className="text-gray-400">버전</dt>
            <dd className="text-gray-700 font-medium tabular-nums">v{gateStatus.version}</dd>
          </div>
          <div>
            <dt className="text-gray-400">마지막 변경자</dt>
            <dd className="text-gray-700 font-medium truncate">{gateStatus.updatedByUserId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-400">마지막 변경 시각</dt>
            <dd className="text-gray-700 font-medium">
              {new Date(gateStatus.updatedAt).toLocaleString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </dd>
          </div>
        </dl>
      )}

      {gateStatus && (
        <GateConfirmModal
          open={confirmOpen}
          pending={mutation.isPending}
          title={`간소 전환 모드 ${turningOn ? '켜기' : '끄기'}`}
          description={
            turningOn
              ? '지금 켜면 운영진이 게이트 번들 없이 아래 5단계를 바로 실행할 수 있어요. 실행 가능 여부는 여전히 전환 순서로 제한돼요. 언제든 다시 끌 수 있어요.'
              : '지금 끄면 아래 5단계 실행 버튼이 모두 비활성화돼요. 이미 진행된 단계는 되돌아가지 않아요 — 다시 바꾸려면 정식 게이트 번들 절차를 거쳐야 해요.'
          }
          confirmLabel={turningOn ? '켜기' : '끄기'}
          tone="blue"
          onConfirm={submit}
          onClose={() => {
            if (!mutation.isPending) setConfirmOpen(false);
          }}
        />
      )}
    </div>
  );
}
