'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import { useV1AdminMe } from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminPageSkeleton } from '@/components/admin/admin-skeleton';

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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[320px]">
        <span className="text-gray-300" aria-hidden="true">
          <ShieldOff size={48} />
        </span>
        <h1 className="text-[var(--font-size-subhead)] font-bold text-gray-900">운영자 권한이 필요해요</h1>
        <p className="text-[var(--font-size-body-sm)] text-gray-500 leading-relaxed">
          이 페이지는 플랫폼 운영자만 접근할 수 있어요. 계정 권한을 확인해 주세요.
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

// ── Loading screen ────────────────────────────────────────────────────────
function AdminLoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <AdminPageSkeleton />
    </div>
  );
}

// ── Transient-error screen (network / 5xx) — retryable, NOT access denied ───
function AdminErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[320px]">
        <h1 className="text-[var(--font-size-subhead)] font-bold text-gray-900">잠시 문제가 생겼어요</h1>
        <p className="text-[var(--font-size-body-sm)] text-gray-500 leading-relaxed">
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
interface AdminGateProps {
  children: ReactNode;
}

export function AdminGate({ children }: AdminGateProps) {
  const { data, isPending, isError, error, refetch } = useV1AdminMe();

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
    >
      {children}
    </AdminShell>
  );
}
