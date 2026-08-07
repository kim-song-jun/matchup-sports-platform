'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import { useV1AuthMe, useV1Tournament, useV1TournamentStaffAssignments } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import type { V1TournamentStaffRole } from '@/types/api';
import { TournamentOpsShell } from '@/components/tournament-ops/tournament-ops-shell';
import { TournamentOpsRoleProvider } from '@/components/tournament-ops/role-context';

// ── 역할 도출 ────────────────────────────────────────────────────────────
/**
 * `GET .../staff`의 `read` 액션은 platform_ops(어드민 우회)와 tournament_director/
 * support_readonly에게만 허용된다 — field_operator는 배정에 항상 field/fixture
 * 스코프가 있어서 대회 전역 리소스(resource={tournamentId}만 있음) 요청은 항상
 * FIXTURE_SCOPE_REQUIRED/FIELD_SCOPE_REQUIRED로 거부된다
 * (apps/v1_api/src/tournaments/staff/tournament-staff-policy.ts 참고). 그래서 이
 * 목록 조회 하나만으로 셸 진입 가능 여부와 정확한 역할을 함께 판별할 수 있다:
 * 응답이 성공했는데 내 userId로 활성 배정 행을 찾을 수 없으면 어드민 우회 경로로
 * 통과한 platform_ops로 간주한다(그 경로는 배정 테이블에 행을 남기지 않는다).
 */
function deriveRole(
  items: readonly { userId: string; role: V1TournamentStaffRole; revokedAt: string | null; expiresAt: string | null }[],
  myUserId: string,
): V1TournamentStaffRole {
  const now = Date.now();
  const myActiveRow = items.find(
    (item) =>
      item.userId === myUserId &&
      item.revokedAt === null &&
      (item.expiresAt === null || new Date(item.expiresAt).getTime() > now),
  );
  return myActiveRow?.role ?? 'PLATFORM_OPS';
}

/** 필드/기구 스코프가 필요한 화면(아직 미구현) 때문에 막힌 경우를 일반 "권한 없음"과 구분한다. */
const SCOPE_NOT_YET_SUPPORTED_REASONS = new Set([
  'FIXTURE_SCOPE_REQUIRED',
  'FIELD_SCOPE_REQUIRED',
  'FIXTURE_SCOPE_DENIED',
  'FIELD_SCOPE_DENIED',
]);

function denialReason(error: unknown): string | undefined {
  if (!(error instanceof V1ApiError)) return undefined;
  const details = error.details as { reason?: unknown } | undefined;
  return typeof details?.reason === 'string' ? details.reason : undefined;
}

// ── 화면 ──────────────────────────────────────────────────────────────────
function GateLoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="animate-pulse flex flex-col items-center gap-3 w-full max-w-[320px]">
        <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-white/10" />
        <div className="h-4 w-40 rounded-lg bg-gray-200 dark:bg-white/10" />
      </div>
    </div>
  );
}

function AccessDenied({ scopeNotYetSupported }: { scopeNotYetSupported: boolean }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[340px]">
        <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">
          <ShieldOff size={48} />
        </span>
        <h1 className="text-[var(--font-size-subhead)] font-bold text-gray-900 dark:text-white">
          {scopeNotYetSupported ? '아직 지원하지 않는 화면이에요' : '대회 운영자 권한이 필요해요'}
        </h1>
        <p className="text-[var(--font-size-body-sm)] text-gray-500 dark:text-gray-400 leading-relaxed">
          {scopeNotYetSupported
            ? '필드/경기 담당자용 화면은 아직 준비 중이에요. 담당 경기 화면이 열리면 다시 안내해 드릴게요.'
            : '이 화면은 이 대회에 배정된 운영 스태프만 접근할 수 있어요. 배정 상태를 확인해 주세요.'}
        </p>
        <Link
          href="/home"
          className="mt-2 inline-flex items-center justify-center h-[44px] px-6 bg-blue-500 hover:bg-blue-600 text-white text-[var(--font-size-body-sm)] font-semibold rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          서비스로 돌아가기
        </Link>
      </div>
    </div>
  );
}

function GateErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[320px]">
        <h1 className="text-[var(--font-size-subhead)] font-bold text-gray-900 dark:text-white">
          잠시 문제가 생겼어요
        </h1>
        <p className="text-[var(--font-size-body-sm)] text-gray-500 dark:text-gray-400 leading-relaxed">
          일시적인 오류로 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center justify-center h-[44px] px-6 bg-blue-500 hover:bg-blue-600 text-white text-[var(--font-size-body-sm)] font-semibold rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

// ── Gate ──────────────────────────────────────────────────────────────────
interface TournamentOpsGateProps {
  children: ReactNode;
  tournamentId: string;
}

export function TournamentOpsGate({ children, tournamentId }: TournamentOpsGateProps) {
  const authMe = useV1AuthMe();
  const staff = useV1TournamentStaffAssignments(tournamentId);
  // 공개 대회 상세(제목 표시용)는 셸 진입 가능 여부와 무관하다 — 실패해도 게이트를 막지 않고
  // 셸이 fallback 제목("대회 운영")으로 조용히 대체한다.
  const tournament = useV1Tournament(tournamentId);

  if (authMe.isPending || staff.isPending) {
    return <GateLoadingScreen />;
  }

  if (authMe.isError || !authMe.data) {
    // RequireAuth(부모 레이아웃)가 401을 이미 처리한다 — 여기서는 방어적으로만 재시도 화면을 보여준다.
    return <GateErrorScreen onRetry={() => void authMe.refetch()} />;
  }

  if (staff.isError || !staff.data) {
    const isAuthz = staff.error instanceof V1ApiError && staff.error.statusCode === 403;
    if (isAuthz) {
      const reason = denialReason(staff.error);
      return <AccessDenied scopeNotYetSupported={reason !== undefined && SCOPE_NOT_YET_SUPPORTED_REASONS.has(reason)} />;
    }
    return <GateErrorScreen onRetry={() => void staff.refetch()} />;
  }

  const role = deriveRole(staff.data.items, authMe.data.user.id);

  return (
    <TournamentOpsRoleProvider role={role}>
      <TournamentOpsShell
        tournamentId={tournamentId}
        role={role}
        tournamentTitle={tournament.data?.title}
        tournamentCoverImageUrl={tournament.data?.coverImageUrl}
        // T6-5: 임시값 — Task 6에서 `?from=admin` 감지 기반 실제 origin으로 교체한다.
        origin="home"
      >
        {children}
      </TournamentOpsShell>
    </TournamentOpsRoleProvider>
  );
}
