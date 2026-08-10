'use client';

import { useV1SimplifiedOperationFlagGateStatus } from '@/hooks/use-v1-api';
import { useAdminToast, AdminToasts } from './admin-toast';
import { GateModeCard } from './operation-flag-gate-mode-card';
import { OperationFlagGateStepper } from './operation-flag-gate-stepper';

/**
 * 관리자 "경기 운영 플래그" 화면 — 배송 추적 타임라인처럼 읽히는 5단계 컷오버 스테퍼.
 *
 * 실제 상태 판정(무엇이 완료·잠김인지)은 operation-flag-gate-stepper.tsx 안의 STEPS 정의가
 * 전담한다. 이 파일은 (1) 마스터 스위치 카드, (2) 스테퍼 순서로 배치만 담당한다.
 *
 * 타입 스케일: 이 화면 3개 파일(패널/모드카드/스테퍼) 전체에서 16/13/12/11px 4종만 쓴다
 * (R-T1). apps/v1_web/src/components/admin/ 관례상 .tm-text-* 토큰이 아니라 하드코딩 px를
 * 쓰는데(50여 곳 기존 관례), 이 작업에서 그 관례 자체를 바꾸지는 않되 종류 수만 4개로
 * 제한했다 — 토큰화는 이 작업 범위 밖(admin 전역 일괄 작업 필요).
 */
export function OperationFlagTogglePanel() {
  const { data: gateStatus, isPending: gateStatusPending, isError: gateStatusError } =
    useV1SimplifiedOperationFlagGateStatus();
  const { toasts, showToast } = useAdminToast();
  const gateEnabled = gateStatus?.enabled ?? false;

  return (
    <div className="flex flex-col gap-5">
      <GateModeCard
        gateStatus={gateStatus}
        isPending={gateStatusPending}
        isError={gateStatusError}
        showToast={showToast}
      />

      <OperationFlagGateStepper gateEnabled={gateEnabled} showToast={showToast} />

      <AdminToasts toasts={toasts} />
    </div>
  );
}
