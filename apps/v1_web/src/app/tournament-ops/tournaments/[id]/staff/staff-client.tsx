'use client';

import { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import {
  useV1GrantTournamentStaff,
  useV1RevokeTournamentStaff,
  useV1TournamentFields,
  useV1TournamentStaffAssignments,
  useV1Tournament,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import { useTournamentOpsRole } from '@/components/tournament-ops/role-context';
import { staffRoleLabel } from '@/components/tournament-ops/badges';
import { GrantStaffModal, type GrantableRoleOption } from '@/components/tournament-ops/grant-staff-modal';
import { RevokeStaffModal } from '@/components/tournament-ops/revoke-staff-modal';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { AdminListSkeleton, AdminTableSkeleton } from '@/components/admin/admin-skeleton';
import { useAdminToast, AdminToasts } from '@/components/admin/admin-toast';
import type { V1GrantTournamentStaffPayload, V1TournamentStaffAssignment, V1TournamentStaffRole } from '@/types/api';

interface Props {
  tournamentId: string;
}

function isActive(assignment: V1TournamentStaffAssignment): boolean {
  if (assignment.revokedAt !== null) return false;
  if (assignment.expiresAt === null) return true;
  return new Date(assignment.expiresAt).getTime() > Date.now();
}

function assignmentStatusLabel(assignment: V1TournamentStaffAssignment): { label: string; tone: 'green' | 'red' | 'gray' } {
  if (assignment.revokedAt !== null) return { label: '해제됨', tone: 'red' };
  if (assignment.expiresAt !== null && new Date(assignment.expiresAt).getTime() <= Date.now()) {
    return { label: '만료됨', tone: 'gray' };
  }
  return { label: '활성', tone: 'green' };
}

const STATUS_TONE_CLASSES = {
  green: 'bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  gray: 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300',
} as const;

/** platform_ops는 누구든, tournament_director는 director를 제외한 배정만 해제할 수 있어요. */
function canRevoke(role: V1TournamentStaffRole, target: V1TournamentStaffAssignment): boolean {
  if (!isActive(target)) return false;
  if (role === 'PLATFORM_OPS') return true;
  if (role === 'TOURNAMENT_DIRECTOR') return target.role !== 'TOURNAMENT_DIRECTOR';
  return false;
}

export function StaffClient({ tournamentId }: Props) {
  const role = useTournamentOpsRole();
  const staff = useV1TournamentStaffAssignments(tournamentId);
  const fields = useV1TournamentFields(tournamentId);
  const tournament = useV1Tournament(tournamentId);
  const grant = useV1GrantTournamentStaff(tournamentId);
  const revoke = useV1RevokeTournamentStaff(tournamentId);
  const { toasts, showToast } = useAdminToast();

  const [grantOpen, setGrantOpen] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<V1TournamentStaffAssignment | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const canManage = role === 'PLATFORM_OPS' || role === 'TOURNAMENT_DIRECTOR';

  const grantableRoles: GrantableRoleOption[] = useMemo(() => {
    const options: GrantableRoleOption[] = [];
    if (role === 'PLATFORM_OPS') {
      options.push({ value: 'TOURNAMENT_DIRECTOR', label: staffRoleLabel('TOURNAMENT_DIRECTOR') });
    }
    if (canManage) {
      options.push(
        { value: 'FIELD_OPERATOR', label: staffRoleLabel('FIELD_OPERATOR') },
        { value: 'SUPPORT_READONLY', label: staffRoleLabel('SUPPORT_READONLY') },
      );
    }
    return options;
  }, [role, canManage]);

  const fieldNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const field of fields.data?.items ?? []) map.set(field.id, field.name);
    return map;
  }, [fields.data?.items]);

  const items = staff.data?.items ?? [];

  function handleGrantSubmit(payload: V1GrantTournamentStaffPayload) {
    setGrantError(null);
    grant.mutate(payload, {
      onSuccess: () => {
        setGrantOpen(false);
        showToast('스태프를 배정했어요.');
      },
      onError: (error) => {
        setGrantError(extractErrorMessage(error, '스태프 배정에 실패했어요.'));
      },
    });
  }

  function handleRevokeSubmit(reason: string) {
    if (!revokeTarget) return;
    setRevokeError(null);
    revoke.mutate(
      { assignmentId: revokeTarget.id, payload: { expectedVersion: revokeTarget.version, reason } },
      {
        onSuccess: () => {
          setRevokeTarget(null);
          showToast('배정을 해제했어요.');
        },
        onError: (error) => {
          setRevokeError(extractErrorMessage(error, '배정 해제에 실패했어요.'));
        },
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="text-[11px] md:text-[12px] font-semibold text-blue-500 tracking-normal mb-1">
            {tournament.data?.title ?? '대회 운영'}
          </p>
          <h1 className="text-[22px] md:text-[24px] font-bold text-gray-900 dark:text-white">스태프</h1>
          <p className="text-[13px] md:text-[14px] text-gray-500 dark:text-gray-400 mt-1">
            대회 운영을 도와주는 스태프의 배정 현황이에요.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setGrantError(null);
              setGrantOpen(true);
            }}
            className="flex items-center gap-1.5 h-[44px] px-4 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 shrink-0"
          >
            <UserPlus size={16} aria-hidden="true" />
            스태프 배정
          </button>
        )}
      </div>

      {staff.isPending ? (
        <>
          <div className="hidden lg:block">
            <AdminTableSkeleton rows={4} cols={5} />
          </div>
          <div className="lg:hidden bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
            <AdminListSkeleton rows={4} />
          </div>
        </>
      ) : staff.isError ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-white/10 py-10 px-4 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-red-500 font-medium">
            {extractErrorMessage(staff.error, '스태프 목록을 불러오지 못했어요.')}
          </p>
          <button
            type="button"
            onClick={() => void staff.refetch()}
            className="text-sm text-blue-500 hover:text-blue-600 underline underline-offset-2 min-h-[44px] px-3 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          >
            다시 시도하기
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
          <AdminEmpty title="배정된 스태프가 없어요" description="스태프를 배정해 대회 운영을 나눠 맡겨보세요." />
        </div>
      ) : (
        <>
          {/* ── 데스크톱 표 (lg+) ────────────────────────────────────── */}
          <div className="hidden lg:block bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-max min-w-full text-sm text-gray-700 dark:text-gray-200">
                <thead className="sticky top-0 bg-gray-50 dark:bg-white/5 border-b border-gray-100 dark:border-white/10">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300 text-[12px]">
                      역할
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300 text-[12px]">
                      담당 범위
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300 text-[12px]">
                      만료
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-gray-600 dark:text-gray-300 text-[12px]">
                      상태
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold text-gray-600 dark:text-gray-300 text-[12px]">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5">
                  {items.map((assignment) => {
                    const status = assignmentStatusLabel(assignment);
                    return (
                      <tr key={assignment.id}>
                        <td className="px-4 py-3 align-middle">
                          <p className="font-medium text-gray-900 dark:text-white">{staffRoleLabel(assignment.role)}</p>
                          {/* 담당자를 userId 앞 8자로만 보여주면 표에서 누가 누구인지 알 수 없다.
                              닉네임이 있으면 그것을 보여주고, 없을 때만 종전 식별자 조각으로 남긴다 —
                              닉네임이 공개 신원으로 쓸 수 있는 유일한 값이다(D-03/D-11). */}
                          {assignment.nickname ? (
                            <p className="text-[12px] text-gray-500 dark:text-gray-400">{assignment.nickname}</p>
                          ) : (
                            <p className="text-[12px] text-gray-400 tabular-nums">{assignment.userId.slice(0, 8)}…</p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          {assignment.fieldId
                            ? fieldNameById.get(assignment.fieldId) ?? '필드'
                            : assignment.fixtureIds.length > 0
                              ? `경기 ${assignment.fixtureIds.length}건`
                              : '대회 전체'}
                        </td>
                        <td className="px-4 py-3 align-middle tabular-nums">
                          {assignment.expiresAt ? formatAdminDateTime(assignment.expiresAt) : '없음'}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span
                            className={[
                              'inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium',
                              STATUS_TONE_CLASSES[status.tone],
                            ].join(' ')}
                          >
                            {status.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right align-middle">
                          {canRevoke(role, assignment) && (
                            <button
                              type="button"
                              onClick={() => {
                                setRevokeError(null);
                                setRevokeTarget(assignment);
                              }}
                              className="inline-flex items-center justify-center min-h-[44px] px-3 text-sm text-red-500 hover:text-red-600 font-semibold focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
                            >
                              해제
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 모바일/태블릿 카드 목록 (<lg) ───────────────────────────── */}
          <ul className="lg:hidden flex flex-col gap-2" role="list">
            {items.map((assignment) => {
              const status = assignmentStatusLabel(assignment);
              return (
                <li
                  key={assignment.id}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-white/10 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white">{staffRoleLabel(assignment.role)}</p>
                      {/* 데스크톱 표와 같은 규칙 — 닉네임이 있으면 이름, 없을 때만 식별자 조각. */}
                      {assignment.nickname ? (
                        <p className="text-[12px] text-gray-500 dark:text-gray-400">{assignment.nickname}</p>
                      ) : (
                        <p className="text-[12px] text-gray-400 tabular-nums">{assignment.userId.slice(0, 8)}…</p>
                      )}
                    </div>
                    <span
                      className={[
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium shrink-0',
                        STATUS_TONE_CLASSES[status.tone],
                      ].join(' ')}
                    >
                      {status.label}
                    </span>
                  </div>
                  <p className="text-[12px] text-gray-400 mt-1">
                    {assignment.fieldId
                      ? fieldNameById.get(assignment.fieldId) ?? '필드'
                      : assignment.fixtureIds.length > 0
                        ? `경기 ${assignment.fixtureIds.length}건`
                        : '대회 전체'}
                    {assignment.expiresAt ? ` · ${formatAdminDateTime(assignment.expiresAt)}까지` : ''}
                  </p>
                  {canRevoke(role, assignment) && (
                    <button
                      type="button"
                      onClick={() => {
                        setRevokeError(null);
                        setRevokeTarget(assignment);
                      }}
                      className="mt-2 min-h-[44px] px-3 text-sm text-red-500 hover:text-red-600 font-semibold border-t border-gray-50 dark:border-white/5 pt-2 w-full text-left focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
                    >
                      배정 해제
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {canManage && (
        <GrantStaffModal
          open={grantOpen}
          onClose={() => setGrantOpen(false)}
          onSubmit={handleGrantSubmit}
          roleOptions={grantableRoles}
          fields={fields.data?.items ?? []}
          pending={grant.isPending}
          errorMessage={grantError}
        />
      )}

      <RevokeStaffModal
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        onSubmit={handleRevokeSubmit}
        targetLabel={
          revokeTarget
            ? `${staffRoleLabel(revokeTarget.role)} (${revokeTarget.nickname ?? `${revokeTarget.userId.slice(0, 8)}…`})`
            : ''
        }
        pending={revoke.isPending}
        errorMessage={revokeError}
      />

      <AdminToasts toasts={toasts} />
    </div>
  );
}
