'use client';

import { useV1SimplifiedOperationFlagGateStatus } from '@/hooks/use-v1-api';
import { useAdminToast, AdminToasts } from './admin-toast';
import { GateModeCard } from './operation-flag-gate-mode-card';
import { OperationFlagToggleCards } from './operation-flag-toggle-cards';

/**
 * 관리자 "경기 운영 플래그" 화면 — Task 10 GAME_WRITE/GAME_READ 컷오버 완료 후 운영 토글
 * 2개(PUBLIC_LIVE, DIRECTOR_OFFICIALIZE)로 단순화됐다. 예전에는 5단계 순차 컷오버 스테퍼였다
 * (operation-flag-gate-stepper.tsx, 컷오버 정리로 제거) — 이제 두 토글은 서로 독립적인
 * on/off 킬스위치라 순서·잠김 개념이 없다.
 *
 * 이 파일은 (1) 마스터 스위치 카드, (2) 토글 카드 2개 배치만 담당한다. 실제 토글 렌더링은
 * operation-flag-toggle-cards.tsx 가 전담한다.
 *
 * 타입 스케일: 이 화면 3개 파일(패널/모드카드/토글카드) 전체에서 16/13/12/11px 4종만 쓴다
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

      <OperationFlagToggleCards gateEnabled={gateEnabled} showToast={showToast} />

      <AdminToasts toasts={toasts} />
    </div>
  );
}
