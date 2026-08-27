'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShieldOff } from 'lucide-react';
import {
  useV1AuthMe,
  useV1MyTournamentStaffAssignments,
  useV1Tournament,
  useV1TournamentStaffAssignments,
} from '@/hooks/use-v1-api';
import { coversFixture } from '@/hooks/use-v1-my-staff-assignments';
import { getTournamentOpsOrigin, saveTournamentOpsOrigin } from '@/lib/session-storage';
import { classifyTournamentStaffAccessError, isTournamentStaffScopeNotYetSupported } from '@/lib/tournament-ops-access';
import type { V1TournamentStaffRole } from '@/types/api';
import { TournamentOpsShell } from '@/components/tournament-ops/tournament-ops-shell';
import { FieldOperatorConsoleFrame } from '@/components/tournament-ops/field-operator-console-frame';
import { TournamentOpsRoleProvider } from '@/components/tournament-ops/role-context';
import { fixtureIdFromConsolePath, isAdminLiveConsolePath } from '@/lib/tournament-live-routes';

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
// 한 사용자가 같은 대회에 활성 배정을 여러 개 가질 수 있다(예: 예전 SUPPORT_READONLY/
// FIELD_OPERATOR 배정을 해제하지 않은 채 TOURNAMENT_DIRECTOR로 추가 배정된 경우) — grant는
// 항상 새 행을 추가하고 (tournamentId,userId) unique도 없어 옛 행이 그대로 남는다. 목록 순서는
// 서버가 createdAt asc로 고정하므로 `find`로 "가장 먼저 만들어진" 행을 집으면 나중에 승격된
// 사람이 옛 낮은 권한으로 화면이 강등된다. 서버 `TournamentOperationsStaffService.myAssignments()`가
// 같은 문제를 STAFF_ROLE_PRIORITY로 이미 풀고 있으므로 동일 우선순위로 "활성 행 중 최고 권한"을
// 고른다.
const STAFF_ROLE_PRIORITY: Record<V1TournamentStaffRole, number> = {
  TOURNAMENT_DIRECTOR: 0,
  FIELD_OPERATOR: 1,
  SUPPORT_READONLY: 2,
  PLATFORM_OPS: 3,
};

function deriveRole(
  items: readonly { userId: string; role: V1TournamentStaffRole; revokedAt: string | null; expiresAt: string | null }[],
  myUserId: string,
): V1TournamentStaffRole {
  const now = Date.now();
  const myActiveRows = items.filter(
    (item) =>
      item.userId === myUserId &&
      item.revokedAt === null &&
      (item.expiresAt === null || new Date(item.expiresAt).getTime() > now),
  );
  if (myActiveRows.length === 0) return 'PLATFORM_OPS';
  return myActiveRows.reduce((best, item) =>
    STAFF_ROLE_PRIORITY[item.role] < STAFF_ROLE_PRIORITY[best.role] ? item : best,
  ).role;
}

// ── 필드 담당자 딥링크 ────────────────────────────────────────────────────
/**
 * 경기 콘솔 경로(`/tournament-ops/tournaments/:id/fixtures/:fixtureId/...`)에서 fixtureId를
 * 꺼낸다. 그 외 경로면 null.
 *
 * 왜 필요한가: 위 `deriveRole`이 쓰는 셸 진입 판정(대회 전역 리소스 1회 조회)은 **그대로
 * 둔다** — 그 판정을 느슨하게 하면 "스태프 목록에 내 행이 없으면 platform_ops"라는 역할
 * 추론이 무너져 일반 스태프에게 어드민 전용 내비가 열린다. 대신 필드 담당자는 애초에 셸에
 * 들어갈 수 없는 역할이므로(배정에 항상 fixture/field 스코프가 붙어 대회 전역 read가 늘
 * 거부된다) **셸을 건너뛰고 자기 경기 화면만** 열어 준다. 아래 분기는 셸 진입 판정을
 * 바꾸지 않고, 종전에 무조건 "권한 없음"으로 끝나던 경로 하나만 연다.
 */
// ── 화면 ──────────────────────────────────────────────────────────────────
function GateLoadingScreen() {
  return (
    <div className="min-h-screen bg-[var(--surface-soft)] flex items-center justify-center px-4">
      <div className="animate-pulse flex flex-col items-center gap-3 w-full max-w-[320px]">
        <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-white/10" />
        <div className="h-4 w-40 rounded-lg bg-gray-200 dark:bg-white/10" />
      </div>
    </div>
  );
}

function AccessDenied({ scopeNotYetSupported }: { scopeNotYetSupported: boolean }) {
  return (
    <div className="min-h-screen bg-[var(--surface-soft)] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[340px]">
        <span className="text-gray-300 dark:text-gray-600" aria-hidden="true">
          <ShieldOff size={48} />
        </span>
        <h1 className="text-[length:var(--font-size-subhead)] font-bold text-[var(--text-strong)]">
          {scopeNotYetSupported ? '담당 범위 밖의 화면이에요' : '대회 운영자 권한이 필요해요'}
        </h1>
        {/* 종전 문구는 "필드/경기 담당자용 화면은 아직 준비 중"이었다 — 담당 경기 콘솔로
            직행하는 경로가 생긴 지금은 사실이 아니다. 막힌 이유(대회 전체 화면)와 대신
            갈 곳(내 대회 운영)을 그대로 적는다. */}
        <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)] leading-relaxed">
          {scopeNotYetSupported
            ? '대회 전체 화면은 대회 운영자만 열 수 있어요. 담당 경기는 “내 대회 운영”에서 바로 들어갈 수 있어요.'
            : '이 화면은 이 대회에 배정된 운영 스태프만 접근할 수 있어요. 배정 상태를 확인해 주세요.'}
        </p>
        {/* `/tournament-ops` 에는 page.tsx 가 없다(layout.tsx 만 있음) — 예전 링크는 404 로
            떨어져서, 막힌 담당자가 갈 곳이 아예 없는 막다른 길이었다. 담당 대회 목록으로 보낸다. */}
        <Link
          href={scopeNotYetSupported ? '/my/tournament-staff' : '/home'}
          className="mt-2 inline-flex items-center justify-center h-[44px] px-6 bg-blue-500 hover:bg-blue-600 text-white text-[length:var(--font-size-body-sm)] font-semibold rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          {scopeNotYetSupported ? '내 대회 운영으로 가기' : '서비스로 돌아가기'}
        </Link>
      </div>
    </div>
  );
}

function GateErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-[var(--surface-soft)] flex items-center justify-center px-4">
      <div className="flex flex-col items-center gap-3 text-center max-w-[320px]">
        <h1 className="text-[length:var(--font-size-subhead)] font-bold text-[var(--text-strong)]">
          잠시 문제가 생겼어요
        </h1>
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
interface TournamentLiveGateProps {
  children: ReactNode;
  tournamentId: string;
}

export function TournamentLiveGate({ children, tournamentId }: TournamentLiveGateProps) {
  const authMe = useV1AuthMe();
  const staff = useV1TournamentStaffAssignments(tournamentId);
  // 공개 대회 상세(제목 표시용)는 셸 진입 가능 여부와 무관하다 — 실패해도 게이트를 막지 않고
  // 셸이 fallback 제목("대회 운영")으로 조용히 대체한다.
  const tournament = useV1Tournament(tournamentId);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // 경기 콘솔 딥링크에서 셸 진입이 거부됐을 때만 내 배정을 조회한다 — 셸로 들어가는
  // 정상 경로에서는 추가 요청이 발생하지 않는다.
  const fixtureId = fixtureIdFromConsolePath(pathname, tournamentId);
  const shellDenied = staff.isError && classifyTournamentStaffAccessError(staff.error).isAuthDenied;
  const myAssignments = useV1MyTournamentStaffAssignments({ enabled: fixtureId !== null && shellDenied });

  // T6-2: `?from=admin`은 admin 화면이 명시적으로 실어 보내는 진입 의도다
  // (referrer는 신뢰하지 않는다 — 계획 문서 "설계 노트" 참고). 첫 진입 시
  // sessionStorage에 대회 단위로 박제해 셸 안 다른 nav로 이동한 뒤에도 유지한다.
  // 어드민 표면(`/admin/live/:id`)에서는 출처가 자명하다 — 쿼리 없이도 '대회 관리로
  // 돌아가기'가 맞다. 스태프 표면에서만 `?from=admin` 이 의미를 갖는다.
  const onAdminSurface = isAdminLiveConsolePath(pathname);
  const queryFromAdmin = searchParams.get('from') === 'admin';
  useEffect(() => {
    // 박제는 **쿼리로 온 경우만** 한다. 어드민 표면은 경로만 보면 알 수 있는데도 박제하면,
    // 같은 대회를 스태프 표면에서 여는 사람에게 '대회 관리로 돌아가기'가 남아 그가 갈 수
    // 없는 화면으로 안내하게 된다(sessionStorage 는 대회 단위로만 구분한다).
    if (queryFromAdmin) saveTournamentOpsOrigin(tournamentId, 'admin');
  }, [queryFromAdmin, tournamentId]);
  const origin = onAdminSurface || queryFromAdmin ? 'admin' : getTournamentOpsOrigin(tournamentId);

  if (authMe.isPending || staff.isPending) {
    return <GateLoadingScreen />;
  }

  if (authMe.isError || !authMe.data) {
    // RequireAuth(부모 레이아웃)가 401을 이미 처리한다 — 여기서는 방어적으로만 재시도 화면을 보여준다.
    return <GateErrorScreen onRetry={() => void authMe.refetch()} />;
  }

  if (staff.isError || !staff.data) {
    const denial = classifyTournamentStaffAccessError(staff.error);
    if (denial.isAuthDenied) {
      // 필드 담당자 딥링크: 셸은 못 들어가지만 자기 담당 경기 화면은 열려야 한다.
      // 스코프 없는 전역 승인이 아니다 — 내 배정이 "바로 이 대회의 바로 이 경기"를
      // 담당할 때만 통과하고, 통과 후에도 화면이 호출하는 모든 API는 서버에서
      // 경기 단위로 다시 인가된다(TournamentFixtureLineupService.authorizeAndResolveGameId).
      if (fixtureId !== null) {
        if (myAssignments.isPending) {
          return <GateLoadingScreen />;
        }
        // 배정 조회가 실패한 것(5xx/네트워크)을 "담당이 아님"으로 읽으면, 담당자에게
        // 재시도 대신 잘못된 권한 안내를 보여주게 된다 — 원인대로 갈라 놓는다.
        if (myAssignments.isError) {
          return <GateErrorScreen onRetry={() => void myAssignments.refetch()} />;
        }
        const covered = coversFixture(myAssignments.data, tournamentId, fixtureId);
        if (covered) {
          return (
            <TournamentOpsRoleProvider role="FIELD_OPERATOR">
              <FieldOperatorConsoleFrame
                tournamentTitle={tournament.data?.title}
                tournamentId={tournamentId}
              >
                {children}
              </FieldOperatorConsoleFrame>
            </TournamentOpsRoleProvider>
          );
        }
      }
      return <AccessDenied scopeNotYetSupported={isTournamentStaffScopeNotYetSupported(denial.reasonCode)} />;
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
        origin={origin}
      >
        {children}
      </TournamentOpsShell>
    </TournamentOpsRoleProvider>
  );
}
