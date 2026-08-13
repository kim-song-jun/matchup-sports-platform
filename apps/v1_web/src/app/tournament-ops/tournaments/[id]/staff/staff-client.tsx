'use client';

import { useMemo, useState } from 'react';
import { MapPin, UserPlus } from 'lucide-react';
import {
  useV1CreateTournamentField,
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
import type {
  V1GrantTournamentStaffPayload,
  V1TournamentField,
  V1TournamentStaffAssignment,
  V1TournamentStaffRole,
} from '@/types/api';

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
  // --green700 토큰 없음 — text-green-700는 원래 값 유지, 배경만 토큰화
  green: 'bg-[var(--green50)] text-green-700 dark:text-green-300',
  red: 'bg-[var(--red50)] text-[var(--red700)]',
  gray: 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
} as const;

/** platform_ops는 누구든, tournament_director는 director를 제외한 배정만 해제할 수 있어요. */
function canRevoke(role: V1TournamentStaffRole, target: V1TournamentStaffAssignment): boolean {
  if (!isActive(target)) return false;
  if (role === 'PLATFORM_OPS') return true;
  if (role === 'TOURNAMENT_DIRECTOR') return target.role !== 'TOURNAMENT_DIRECTOR';
  return false;
}

/**
 * 경기장(필드) 안내 · 등록 · 목록 — #373.
 *
 * "필드"는 경기가 실제로 열리는 코트·구장이다. 필드 담당자(FIELD_OPERATOR)는 담당 필드가
 * 있어야만 배정되는데(grant-staff-modal.tsx 의 requiresField), 필드를 등록할 화면이 어디에도
 * 없어 선택지가 늘 비어 있었고 배정을 끝낼 수 없었다. 백엔드 POST .../fields 는 이미 있다.
 *
 * 등록은 플랫폼 운영자만 통과한다(tournament-operations-fields.service.ts 의
 * authorizeFieldManagement → FIELD_MANAGEMENT_DENIED). 그래서 폼도 그 역할에만 열고,
 * 대회 디렉터에게는 목록과 "누구에게 요청해야 하는지"를 대신 보여준다 — 눌러 보고 403 을
 * 받는 버튼은 만들지 않는다.
 */
function TournamentFieldsSection({
  tournamentId,
  fields,
  isPending,
  canCreate,
}: {
  tournamentId: string;
  fields: V1TournamentField[];
  isPending: boolean;
  canCreate: boolean;
}) {
  const create = useV1CreateTournamentField(tournamentId);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && !create.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setNotice(null);
    create.mutate(
      {
        // scopeKey 는 서버가 만들어 주지 않는 안정 식별자이고 소문자/숫자/-/_ 만 허용한다
        // (CreateTournamentFieldDto 의 SCOPE_KEY_PATTERN). 한국어 이름에서 그 규칙에 맞는
        // 코드를 만들 방법이 없어 충돌하지 않는 값을 대신 만든다 — 운영자가 외울 필요가
        // 없는 내부 키라서 화면에는 이름만 쓴다.
        scopeKey: `field-${Date.now().toString(36)}`,
        name: trimmedName,
        sortOrder: fields.length,
      },
      {
        onSuccess: (field) => {
          setName('');
          setNotice(`${field.name} 경기장을 등록했어요.`);
        },
        onError: (mutationError) => {
          setError(extractErrorMessage(mutationError, '경기장을 등록하지 못했어요.'));
        },
      },
    );
  }

  return (
    <section
      aria-labelledby="tournament-fields-heading"
      className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-4 py-4 flex flex-col gap-3"
    >
      <div className="flex items-start gap-2">
        <span className="text-blue-500 mt-0.5 shrink-0" aria-hidden="true">
          <MapPin size={18} />
        </span>
        <div>
          <h2 id="tournament-fields-heading" className="text-[15px] font-bold text-[var(--text-strong)]">
            경기장(필드)
          </h2>
          <p className="text-[13px] text-[var(--text-muted)] mt-0.5">
            경기가 열리는 코트·구장이에요. 필드 담당자는 담당 경기장을 정해야 배정할 수 있어요.
          </p>
        </div>
      </div>

      {isPending ? (
        <p className="text-[13px] text-[var(--text-muted)]">경기장을 불러오는 중이에요…</p>
      ) : fields.length === 0 ? (
        <p className="text-[13px] text-[var(--text-muted)]">
          아직 등록된 경기장이 없어요.{' '}
          {canCreate ? '아래에서 먼저 등록해 주세요.' : '플랫폼 운영자에게 등록을 요청해 주세요.'}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-1.5" role="list">
          {fields.map((field) => (
            <li
              key={field.id}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-soft)] px-3 py-1 text-[13px] text-[var(--text-body)]"
            >
              {field.name}
              {field.active === false ? (
                <span className="text-[12px] text-[var(--text-muted)]">사용 안 함</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="tournament-field-name" className="sr-only">
            경기장 이름
          </label>
          <input
            id="tournament-field-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            disabled={create.isPending}
            placeholder="예: A구장, 1번 코트"
            className="flex-1 h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!canSubmit}
            className={[
              'h-[44px] px-4 rounded-xl text-sm font-semibold transition-colors shrink-0',
              'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
              canSubmit
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-blue-200 dark:bg-blue-500/30 text-white cursor-not-allowed',
            ].join(' ')}
          >
            {create.isPending ? '등록 중…' : '경기장 추가'}
          </button>
        </form>
      )}

      {error !== null && (
        <p className="text-[13px] text-[var(--red700)]" role="alert">
          {error}
        </p>
      )}
      {notice !== null && (
        <p className="text-[13px] text-[var(--text-body)]" role="status">
          {notice}
        </p>
      )}
    </section>
  );
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
  // 토스트는 3.5초 뒤 사라진다 — "배정된 사람이 어디로 들어가면 되는지"는 그 자리에서
  // 전달해야 하는 안내라, 다음 배정 전까지 남는 문장으로 따로 보여준다.
  const [grantNotice, setGrantNotice] = useState<string | null>(null);
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
        setGrantNotice(
          payload.role === 'FIELD_OPERATOR'
            ? '배정했어요. 그분은 마이페이지 → “대회 운영을 맡고 있어요”에서 담당 경기 기록 화면으로 바로 들어갈 수 있어요.'
            : '배정했어요. 그분은 마이페이지 → “대회 운영을 맡고 있어요”에서 이 대회 운영 보드로 들어갈 수 있어요.',
        );
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
          <p className="text-[var(--font-size-caption)] font-semibold text-[var(--blue700)] tracking-normal mb-1">
            {tournament.data?.title ?? '대회 운영'}
          </p>
          <h1 className="text-[22px] md:text-[24px] font-bold text-[var(--text-strong)]">스태프</h1>
          <p className="text-[13px] md:text-[14px] text-[var(--text-muted)] mt-1">
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

      {grantNotice !== null && (
        <p
          role="status"
          className="bg-[var(--blue50)] text-[var(--blue700)] rounded-2xl px-4 py-3 text-[13px] leading-relaxed"
        >
          {grantNotice}
        </p>
      )}

      {/* 스태프 배정이 막히는 원인(선택 가능한 필드 0건)을 같은 화면 안에서 풀 수 있게 목록 위에 둔다. */}
      <TournamentFieldsSection
        tournamentId={tournamentId}
        fields={fields.data?.items ?? []}
        isPending={fields.isPending}
        canCreate={role === 'PLATFORM_OPS'}
      />

      {staff.isPending ? (
        <>
          <div className="hidden lg:block">
            <AdminTableSkeleton rows={4} cols={5} />
          </div>
          <div className="lg:hidden bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
            <AdminListSkeleton rows={4} />
          </div>
        </>
      ) : staff.isError ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] py-10 px-4 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-[var(--red700)] font-medium">
            {extractErrorMessage(staff.error, '스태프 목록을 불러오지 못했어요.')}
          </p>
          <button
            type="button"
            onClick={() => void staff.refetch()}
            className="text-sm text-[var(--blue700)] hover:bg-[var(--blue50)] underline underline-offset-2 min-h-[44px] px-3 rounded transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            다시 시도하기
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminEmpty title="배정된 스태프가 없어요" description="스태프를 배정해 대회 운영을 나눠 맡겨보세요." />
        </div>
      ) : (
        <>
          {/* ── 데스크톱 표 (lg+) ────────────────────────────────────── */}
          <div className="hidden lg:block bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-max min-w-full text-sm text-[var(--text-body)]">
                <thead className="sticky top-0 bg-[var(--surface-soft)] border-b border-[var(--border)]">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] text-[12px]">
                      역할
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] text-[12px]">
                      담당 범위
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] text-[12px]">
                      만료
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] text-[12px]">
                      상태
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold text-[var(--text-muted)] text-[12px]">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {items.map((assignment) => {
                    const status = assignmentStatusLabel(assignment);
                    return (
                      <tr key={assignment.id}>
                        <td className="px-4 py-3 align-middle">
                          {/* 담당자를 userId 앞 8자로만 보여주면 표에서 누가 누구인지 알 수 없다.
                              닉네임이 있으면 그것을 보여주고, 없을 때만 종전 식별자 조각으로 남긴다 —
                              닉네임이 공개 신원으로 쓸 수 있는 유일한 값이다(D-03/D-11).
                              같은 역할이 여러 명일 때 행을 구분하는 건 이름이므로 이름을 위에 둔다. */}
                          <p className="font-medium text-[var(--text-strong)]">
                            {assignment.nickname ?? `${assignment.userId.slice(0, 8)}…`}
                          </p>
                          <p className="text-[12px] text-[var(--text-muted)]">{staffRoleLabel(assignment.role)}</p>
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
                              className="inline-flex items-center justify-center min-h-[44px] px-3 text-sm text-[var(--red700)] font-semibold focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
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
                  className="bg-[var(--card-surface)] rounded-xl border border-[var(--border)] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {/* 스태프 목록에서 먼저 찾는 건 "누구"다 — 역할이 제목이면 같은 역할이
                          여러 명일 때 카드가 전부 똑같아 보인다. 이름을 제목으로 올린다.
                          데스크톱 표와 같은 규칙 — 닉네임이 있으면 이름, 없을 때만 식별자 조각. */}
                      <p className="font-medium text-[var(--text-strong)] truncate">
                        {assignment.nickname ?? `${assignment.userId.slice(0, 8)}…`}
                      </p>
                      <p className="text-[12px] text-[var(--text-muted)]">{staffRoleLabel(assignment.role)}</p>
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
                      className="mt-2 min-h-[44px] px-3 text-sm text-[var(--red700)] font-semibold border-t border-[var(--border)] pt-2 w-full text-left focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
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
          tournamentId={tournamentId}
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
