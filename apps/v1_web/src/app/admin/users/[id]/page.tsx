'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Calendar,
  Clock,
  Shield,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import {
  AdminDetailRow,
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
  AdminSummaryItem,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import {
  useV1AdminUser,
  useV1DeleteAdminUser,
} from '@/hooks/use-v1-api';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { formatAdminDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { formatAuthProviders, formatGender, formatOnboardingStatus, formatUserTitle } from '@/lib/format-user';
import type { V1AdminUserDetail } from '@/types/api';

function formatVerification(value: string | null) {
  return value ? `인증 · ${formatAdminDateTime(value)}` : '미인증';
}

// 목록(formatUserTitle)과 다른 로직을 복제해 같은 회원이 화면마다 다른 이름으로
// 보이던 결함 — 표기는 lib/format-user.ts 단일 소스를 쓴다.
function userTitle(user: V1AdminUserDetail) {
  return formatUserTitle(user);
}

type TeamMembershipRole = NonNullable<V1AdminUserDetail['teamMemberships']>[number]['role'];

function getTeamRoleCounts(user: V1AdminUserDetail) {
  return {
    owner: user.teamRoleCounts?.owner ?? 0,
    manager: user.teamRoleCounts?.manager ?? 0,
    member: user.teamRoleCounts?.member ?? 0,
  };
}

const TEAM_ROLE_LABEL: Record<TeamMembershipRole, string> = {
  owner: '팀장',
  manager: '운영진',
  member: '멤버',
};

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;
  const { data: user, isPending, isError, error, refetch } = useV1AdminUser(userId);
  const deleteMutation = useV1DeleteAdminUser(userId);
  const { toasts, showToast } = useAdminToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  // 어드민 모달 중 유일하게 ESC·focus trap·포커스 복원이 없던 인라인 모달 — 공용 훅으로 표준화.
  const {
    dialogRef: deleteDialogRef,
    initialFocusRef: deleteReasonRef,
    onBackdropClick: onDeleteBackdropClick,
  } = useModalA11y<HTMLTextAreaElement, HTMLFormElement>({
    open: deleteOpen,
    onClose: () => setDeleteOpen(false),
    pending: deleteMutation.isPending,
  });

  const canWrite = useAdminCanWrite();
  const canDelete = canWrite && user?.accountStatus !== 'deleted';

  function handleDeleteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = deleteReason.trim();
    if (!reason) {
      showToast('삭제 사유를 입력해 주세요.', 'error');
      return;
    }

    deleteMutation.mutate(
      { reason },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          setDeleteReason('');
          showToast('회원을 삭제 처리했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '회원 삭제에 실패했어요.'), 'error');
        },
      },
    );
  }

  if (isPending) {
    return <AdminTableSkeleton rows={6} />;
  }

  if (isError || !user) {
    return (
      <>
        <AdminPageHeader
          eyebrow="플랫폼 · 회원"
          title="회원 상세"
          action={<BackLink />}
        />
        <AdminEmpty
          title="회원 정보를 불러오지 못했어요"
          description={extractErrorMessage(error, '잠시 후 다시 시도해 주세요.')}
          action={
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-600"
            >
              다시 시도
            </button>
          }
        />
      </>
    );
  }

  const teamMemberships = user.teamMemberships ?? [];
  const leaderTeams = teamMemberships.filter((membership) => membership.role === 'owner');
  const teamRoles = getTeamRoleCounts(user);

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼 · 회원"
        title="회원 상세"
        description={userTitle(user)}
        action={<BackLink />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="회원 상세 정보">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                  <UserRound size={16} aria-hidden="true" />
                  회원
                </div>
                <h2 className="mt-2 break-words text-[22px] font-bold text-[var(--text-strong)]">{userTitle(user)}</h2>
                <p className="mt-1 break-all text-sm text-[var(--text-muted)]">{user.email ?? '이메일 없음'}</p>
              </div>
              <AdminStatusPill status={user.accountStatus} />
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <AdminDetailRow label="회원 ID" value={user.userId} />
              <AdminDetailRow label="이름" value={user.displayName} />
              <AdminDetailRow label="닉네임" value={user.nickname} />
              <AdminDetailRow label="이메일" value={user.email} />
              <AdminDetailRow label="이메일 인증" value={formatVerification(user.emailVerifiedAt)} />
              <AdminDetailRow label="전화번호" value={user.phone} />
              <AdminDetailRow label="전화번호 인증" value={formatVerification(user.phoneVerifiedAt)} />
              <AdminDetailRow label="성별" value={formatGender(user.gender)} />
              <AdminDetailRow label="생년월일" value={user.birthDate} />
              <AdminDetailRow label="활동 지역" value={user.displayRegion} />
              <AdminDetailRow label="로그인 방식" value={formatAuthProviders(user.authProviders)} />
              <AdminDetailRow label="온보딩" value={formatOnboardingStatus(user.onboardingStatus)} />
              <AdminDetailRow label="가입일" value={formatAdminDateTime(user.createdAt)} />
              <AdminDetailRow label="최근 로그인" value={formatAdminDateTime(user.lastLoginAt)} />
              <AdminDetailRow label="삭제일" value={formatAdminDateTime(user.deletedAt)} />
              <AdminDetailRow label="관리자 권한" value={user.adminRole ?? '없음'} />
            </dl>
            {user.bio ? (
              <div className="mt-3 rounded-xl bg-[var(--surface-soft)] px-4 py-3">
                <p className="text-xs font-semibold text-gray-400">소개</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-strong)]">{user.bio}</p>
              </div>
            ) : null}
          </article>

          {user.withdrawalRequest ? (
            <section className="rounded-2xl border border-[var(--tint-orange-border)] bg-[var(--tint-orange)] p-5" aria-label="탈퇴 요청 메시지">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[17px] font-bold text-[var(--text-strong)]">탈퇴 요청 메시지</h2>
                <time className="text-xs font-semibold text-[var(--orange700)]">
                  {formatAdminDateTime(user.withdrawalRequest.requestedAt)}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-strong)]">
                {user.withdrawalRequest.reason || '사용자가 별도 메시지를 남기지 않았어요.'}
              </p>
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-2">
            <RelatedList
              title="최근 생성 매치"
              empty="최근 생성한 매치가 없어요."
              items={user.hostedMatches.map((match) => ({
                id: match.matchId,
                title: match.title,
                meta: `${match.status} · ${formatAdminDateTime(match.startAt)}`,
              }))}
            />
            <RelatedList
              title="생성/소유 팀"
              empty="생성하거나 소유한 팀이 없어요."
              items={user.ownedTeams.map((team) => ({
                id: team.teamId,
                title: team.name,
                meta: `${team.status} · 멤버 ${team.memberCount}`,
              }))}
            />
            <RelatedList
              title="팀장으로 속한 팀"
              empty="팀장 역할의 소속팀이 없어요."
              items={leaderTeams.map((membership) => ({
                id: membership.membershipId,
                title: membership.name,
                meta: `${membership.status} · 멤버 ${membership.memberCount}`,
              }))}
            />
            <RelatedList
              title="소속팀"
              empty="소속팀이 없어요."
              items={teamMemberships.map((membership) => ({
                id: membership.membershipId,
                title: membership.name,
                meta: `${TEAM_ROLE_LABEL[membership.role]} · ${membership.status} · 멤버 ${membership.memberCount}`,
              }))}
            />
          </section>
        </section>

        <aside className="flex flex-col gap-4" aria-label="회원 운영 정보">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">활동 요약</h2>
            <dl className="mt-4 grid gap-3">
              <AdminSummaryItem icon={<Calendar size={16} />} label="개설 매치" value={user.hostedMatchCount} />
              <AdminSummaryItem icon={<Users size={16} />} label="생성/소유 팀" value={user.ownedTeamCount} />
              <AdminSummaryItem icon={<Shield size={16} />} label="팀장 팀" value={teamRoles.owner} />
              <AdminSummaryItem icon={<Shield size={16} />} label="운영진 팀" value={teamRoles.manager} />
              <AdminSummaryItem icon={<Users size={16} />} label="소속팀 전체" value={teamMemberships.length} />
              <AdminSummaryItem icon={<Users size={16} />} label="일반 멤버 팀" value={teamRoles.member} />
              <AdminSummaryItem icon={<Clock size={16} />} label="리뷰 수" value={user.reputationSummary?.reviewCount ?? 0} />
            </dl>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">삭제 처리</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              삭제하면 계정 상태가 삭제로 바뀌고 이메일, 전화번호, 카카오 같은 로그인 식별자가 재가입 가능하도록 마스킹돼요. 처리 사유는 감사 로그에 남아요.
            </p>
            <button
              type="button"
              disabled={!canDelete}
              onClick={() => setDeleteOpen(true)}
              className="mt-4 inline-flex h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
            >
              <Trash2 size={16} aria-hidden="true" />
              회원 삭제
            </button>
          </section>
        </aside>
      </div>

      {deleteOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
          onClick={onDeleteBackdropClick}
        >
          <form
            ref={deleteDialogRef}
            onSubmit={handleDeleteSubmit}
            // 전수검수: bg-white가 다크에서 안 뒤집혀 안의 text-[var(--text-strong)] 등이
            // 근접색이 되던 회귀 — 다른 어드민 모달들과 동일하게 --card-surface로 교체.
            className="w-full max-w-[440px] rounded-2xl bg-[var(--card-surface)] p-5 shadow-[var(--shadow-modal)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
          >
            <h2 id="delete-user-title" className="text-[18px] font-bold text-[var(--text-strong)]">회원 삭제</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              {userTitle(user)} 회원을 삭제 처리합니다. 되돌리려면 별도 상태 변경과 계정 확인이 필요해요.
            </p>
            <label className="mt-4 block text-sm font-semibold text-[var(--text-body)]" htmlFor="delete-user-reason">
              삭제 사유
            </label>
            <textarea
              ref={deleteReasonRef}
              id="delete-user-reason"
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              className="mt-2 min-h-[120px] w-full resize-y rounded-xl border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="운영자가 확인한 삭제 사유를 입력해 주세요."
              maxLength={500}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteOpen(false)}
                // 방금 card-surface로 바뀐 모달 폼(위)과 겹치지 않게 surface-soft로 구분.
                className="inline-flex h-[44px] flex-1 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] px-4 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--border)] disabled:opacity-60"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={deleteMutation.isPending}
                className="inline-flex h-[44px] flex-1 items-center justify-center rounded-xl bg-red-500 px-4 text-sm font-semibold text-white hover:bg-red-600 disabled:bg-gray-200 disabled:text-gray-500"
              >
                {deleteMutation.isPending ? '삭제 중' : '삭제 처리'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <AdminToasts toasts={toasts} />
    </>
  );

  function BackLink() {
    return (
      <button
        type="button"
        onClick={() => router.push('/admin/users')}
        className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-4 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        목록
      </button>
    );
  }
}

function RelatedList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; title: string; meta: string }>;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
      <h2 className="text-[17px] font-bold text-[var(--text-strong)]">{title}</h2>
      {items.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl bg-[var(--surface-soft)] px-4 py-3">
              <p className="break-words text-sm font-semibold text-[var(--text-strong)]">{item.title}</p>
              <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">{item.meta}</p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          {empty}
        </div>
      )}
    </section>
  );
}
