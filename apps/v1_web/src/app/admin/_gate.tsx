'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { useV1AdminMe } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminPageSkeleton } from '@/components/admin/admin-skeleton';
import { isAdminLiveConsolePath } from '@/lib/tournament-live-routes';

// ── Role label mapping ────────────────────────────────────────────────────
function resolveRoleLabel(role: 'owner' | 'ops' | 'support' | undefined): string {
  if (role === 'owner') return '최고운영자';
  if (role === 'ops') return '운영';
  if (role === 'support') return '지원';
  return '운영자';
}

// ── Access-denied screen ──────────────────────────────────────────────────
function AccessDenied() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[320px]">
        <span className="text-[var(--text-caption)]" aria-hidden="true">
          <ShieldOff size={48} />
        </span>
        <h1 className="text-[length:var(--font-size-subhead)] font-bold text-[var(--text-strong)]">운영자 권한이 필요해요</h1>
        <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)] leading-relaxed">
          이 페이지는 플랫폼 운영자만 접근할 수 있어요. 계정 권한을 확인해 주세요.
        </p>
        <Link
          href="/home"
          className="mt-2 inline-flex items-center justify-center h-[44px] px-6 bg-blue-500 hover:bg-blue-600 text-white text-[length:var(--font-size-body-sm)] font-semibold rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          서비스로 돌아가기
        </Link>
      </div>
    </div>
  );
}

// ── Loading screen ────────────────────────────────────────────────────────
function AdminLoadingScreen() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <AdminPageSkeleton />
    </div>
  );
}

// ── Transient-error screen (network / 5xx) — retryable, NOT access denied ───
function AdminErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[320px]">
        <h1 className="text-[length:var(--font-size-subhead)] font-bold text-[var(--text-strong)]">잠시 문제가 생겼어요</h1>
        <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)] leading-relaxed">
          일시적인 오류로 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center justify-center h-[44px] px-6 bg-blue-500 hover:bg-blue-600 text-white text-[length:var(--font-size-body-sm)] font-semibold rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

// ── Gate ──────────────────────────────────────────────────────────────────
interface AdminGateProps {
  children: ReactNode;
}

/**
 * 본문 폭 상한을 푸는 화면 목록.
 *
 * 대진 관리는 라운드·번호·홈·어웨이·결과 + 액션 3개가 한 행이라, 1200px 안에서는 조가 커질수록
 * 세로로만 길어져 한눈에 안 들어온다(8팀 조 = 28경기). 어드민 기본값을 넓히지 않는 이유는
 * 나머지 화면 대부분이 폼·문단이라 한 줄이 길어지면 오히려 읽기 어려워지기 때문이다.
 */
export function isWideAdminRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/admin\/tournaments\/[^/]+\/bracket(\/|$)/.test(pathname);
}

export function AdminGate({ children }: AdminGateProps) {
  const pathname = usePathname();
  const { data, isPending, isError, error, refetch } = useV1AdminMe();

  // 대회 현장 콘솔(`/admin/live/:id/…`)은 **자기 게이트**가 있다. 여기서 막으면 그 대회에
  // 배정된 스태프(플랫폼 관리자가 아닌 사람)가 화면을 보기도 전에 "운영자 권한이 필요해요"를
  // 만난다 — 서버(TournamentStaffAccessService)는 관리자와 스태프를 모두 인가하는데
  // 프론트만 "관리자 여부" 하나로 문을 지키던 불일치를 여기서 끊는다.
  //
  // 판정을 새로 만들지 않고 그대로 넘긴다: `/admin/live/[id]/layout.tsx` 의
  // TournamentLiveGate 가 대회 스코프로 다시 판정하고, 그 안의 모든 API 는 서버에서
  // 한 번 더 인가된다. 이 분기는 **오직 이 경로 접두사에만** 적용된다.
  if (isAdminLiveConsolePath(pathname)) {
    return <>{children}</>;
  }

  if (isPending) {
    return <AdminLoadingScreen />;
  }

  if (isError || !data) {
    // Only 401/403 mean "not an admin". Network/5xx are transient → retryable,
    // otherwise an outage would falsely show legitimate admins the denied screen.
    const isAuthz =
      error instanceof V1ApiError && (error.statusCode === 401 || error.statusCode === 403);
    if (isAuthz || (!isError && !data)) {
      return <AccessDenied />;
    }
    return <AdminErrorScreen onRetry={() => void refetch()} />;
  }

  const roleLabel = resolveRoleLabel(data.adminRole);
  // Use the role label as the display name for simplicity
  // (no separate display name field in V1AdminMe — adminUserId is the identifier)
  const adminName = `${roleLabel} (${data.adminUserId.slice(0, 8)})`;

  return (
    <AdminShell
      adminName={adminName}
      adminRoleLabel={roleLabel}
      canManageAdmins={data.adminRole === 'owner'}
      wide={isWideAdminRoute(pathname)}
    >
      {children}
    </AdminShell>
  );
}
