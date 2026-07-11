'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
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
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import {
  useV1AdminMe,
  useV1AdminUser,
  useV1DeleteAdminUser,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminUserDetail } from '@/types/api';

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function userTitle(user: V1AdminUserDetail) {
  return user.nickname ?? user.displayName ?? user.email ?? user.userId.slice(0, 8);
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

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0 rounded-xl bg-gray-50 px-4 py-3">
      <dt className="text-xs font-semibold text-gray-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-gray-900">{value ?? '-'}</dd>
    </div>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = params.id;
  const { data: adminMe } = useV1AdminMe();
  const { data: user, isPending, isError, error, refetch } = useV1AdminUser(userId);
  const deleteMutation = useV1DeleteAdminUser(userId);
  const { toasts, showToast } = useAdminToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');

  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;
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
        title="회원 상세"
        description={userTitle(user)}
        action={<BackLink />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="회원 상세 정보">
          <article className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
                  <UserRound size={16} aria-hidden="true" />
                  회원
                </div>
                <h2 className="mt-2 break-words text-[22px] font-bold text-gray-900">{userTitle(user)}</h2>
                <p className="mt-1 break-all text-sm text-gray-500">{user.email ?? '이메일 없음'}</p>
              </div>
              <AdminStatusPill status={user.accountStatus} />
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <DetailRow label="회원 ID" value={user.userId} />
              <DetailRow label="이름" value={user.displayName} />
              <DetailRow label="닉네임" value={user.nickname} />
              <DetailRow label="온보딩" value={user.onboardingStatus} />
              <DetailRow label="가입일" value={formatDateTime(user.createdAt)} />
              <DetailRow label="최근 로그인" value={formatDateTime(user.lastLoginAt)} />
              <DetailRow label="삭제일" value={formatDateTime(user.deletedAt)} />
              <DetailRow label="관리자 권한" value={user.adminRole ?? '없음'} />
            </dl>
          </article>

          {user.withdrawalRequest ? (
            <section className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5" aria-label="탈퇴 요청 메시지">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[17px] font-bold text-amber-950">탈퇴 요청 메시지</h2>
                <time className="text-xs font-semibold text-amber-700">
                  {formatDateTime(user.withdrawalRequest.requestedAt)}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-amber-950">
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
                meta: `${match.status} · ${formatDateTime(match.startAt)}`,
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
          <section className="rounded-2xl border border-gray-100 bg-white p-4">
            <h2 className="text-[17px] font-bold text-gray-900">활동 요약</h2>
            <dl className="mt-4 grid gap-3">
              <SummaryItem icon={<Calendar size={16} />} label="개설 매치" value={user.hostedMatchCount} />
              <SummaryItem icon={<Users size={16} />} label="생성/소유 팀" value={user.ownedTeamCount} />
              <SummaryItem icon={<Shield size={16} />} label="팀장 팀" value={teamRoles.owner} />
              <SummaryItem icon={<Shield size={16} />} label="운영진 팀" value={teamRoles.manager} />
              <SummaryItem icon={<Users size={16} />} label="소속팀 전체" value={teamMemberships.length} />
              <SummaryItem icon={<Users size={16} />} label="일반 멤버 팀" value={teamRoles.member} />
              <SummaryItem icon={<Clock size={16} />} label="리뷰 수" value={user.reputationSummary?.reviewCount ?? 0} />
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4">
            <h2 className="text-[17px] font-bold text-gray-900">삭제 처리</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              삭제하면 계정 상태가 삭제로 바뀌고 이메일, 전화번호, 카카오 같은 로그인 식별자가 재가입 가능하도록 마스킹돼요. 처리 사유는 감사 로그에 남습니다.
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
          onClick={(event) => {
            if (event.target === event.currentTarget && !deleteMutation.isPending) setDeleteOpen(false);
          }}
        >
          <form
            onSubmit={handleDeleteSubmit}
            className="w-full max-w-[440px] rounded-2xl bg-white p-5 shadow-[var(--shadow-modal)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
          >
            <h2 id="delete-user-title" className="text-[18px] font-bold text-gray-900">회원 삭제</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              {userTitle(user)} 회원을 삭제 처리합니다. 되돌리려면 별도 상태 변경과 계정 확인이 필요해요.
            </p>
            <label className="mt-4 block text-sm font-semibold text-gray-700" htmlFor="delete-user-reason">
              삭제 사유
            </label>
            <textarea
              id="delete-user-reason"
              value={deleteReason}
              onChange={(event) => setDeleteReason(event.target.value)}
              className="mt-2 min-h-[120px] w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="운영자가 확인한 삭제 사유를 입력해 주세요."
              maxLength={500}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => setDeleteOpen(false)}
                className="inline-flex h-[44px] flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
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
        className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        목록
      </button>
    );
  }
}

function SummaryItem({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
      <dt className="flex items-center gap-2 text-sm font-semibold text-gray-500">
        <span className="text-gray-400" aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="text-sm font-bold tabular-nums text-gray-900">{value}</dd>
    </div>
  );
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
    <section className="rounded-2xl border border-gray-100 bg-white p-5">
      <h2 className="text-[17px] font-bold text-gray-900">{title}</h2>
      {items.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-xl bg-gray-50 px-4 py-3">
              <p className="break-words text-sm font-semibold text-gray-900">{item.title}</p>
              <p className="mt-1 text-xs font-medium text-gray-500">{item.meta}</p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-4 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          {empty}
        </div>
      )}
    </section>
  );
}
