'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight, Trash2 } from 'lucide-react';
import {
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
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
import { mergeUserTeams } from '@/lib/admin-user-teams';
import type { V1AdminUserDetail } from '@/types/api';

function formatVerification(value: string | null) {
  return value ? `인증 · ${formatAdminDateTime(value)}` : '미인증';
}

// 목록(formatUserTitle)과 다른 로직을 복제해 같은 회원이 화면마다 다른 이름으로
// 보이던 결함 — 표기는 lib/format-user.ts 단일 소스를 쓴다.
function userTitle(user: V1AdminUserDetail) {
  return formatUserTitle(user);
}


function getTeamRoleCounts(user: V1AdminUserDetail) {
  return {
    owner: user.teamRoleCounts?.owner ?? 0,
    manager: user.teamRoleCounts?.manager ?? 0,
    member: user.teamRoleCounts?.member ?? 0,
  };
}

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
    // mounted/closing 을 읽지 않으면 훅이 이 컴포넌트(부모)에 살아 있는 채로
    // 모달 DOM 만 즉시 사라진다 — 퇴장 시간 동안 화면에 아무것도 없는데
    // 스크롤 잠금·ESC·focus trap 이 그대로 걸려 있게 된다.
    mounted: deleteMounted,
    closing: deleteClosing,
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
  const teams = mergeUserTeams(user.ownedTeams, teamMemberships);
  const teamRoles = getTeamRoleCounts(user);

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼 · 회원"
        title="회원 상세"
        description={userTitle(user)}
        action={<BackLink />}
      />

      <div className="tm-content-enter grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="회원 상세 정보">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words text-[length:var(--font-size-subhead)] font-bold text-[var(--text-strong)]">{userTitle(user)}</h2>
                <p className="mt-1 break-all text-sm text-[var(--text-muted)]">{user.email ?? '이메일 없음'}</p>
              </div>
              <AdminStatusPill status={user.accountStatus} />
            </div>

            <dl className="mt-4">
              <DefinitionRow label="회원 ID" value={user.userId} />
              <DefinitionRow label="이름" value={user.displayName} />
              <DefinitionRow label="닉네임" value={user.nickname} />
              <DefinitionRow label="이메일 인증" value={formatVerification(user.emailVerifiedAt)} />
              <DefinitionRow label="전화번호" value={user.phone} />
              <DefinitionRow label="전화번호 인증" value={formatVerification(user.phoneVerifiedAt)} />
              <DefinitionRow label="성별" value={formatGender(user.gender)} />
              <DefinitionRow label="생년월일" value={user.birthDate} />
              <DefinitionRow label="활동 지역" value={user.displayRegion} />
              <DefinitionRow label="로그인 방식" value={formatAuthProviders(user.authProviders)} />
              <DefinitionRow label="온보딩" value={formatOnboardingStatus(user.onboardingStatus)} />
              <DefinitionRow label="가입일" value={formatAdminDateTime(user.createdAt)} />
              <DefinitionRow label="최근 로그인" value={formatAdminDateTime(user.lastLoginAt)} />
              <DefinitionRow label="삭제일" value={formatAdminDateTime(user.deletedAt)} />
              <DefinitionRow label="관리자 권한" value={user.adminRole ?? '없음'} />
              {user.bio ? <DefinitionRow label="소개" value={<span className="whitespace-pre-wrap">{user.bio}</span>} /> : null}
            </dl>
          </article>

          {user.withdrawalRequest ? (
            <section className="rounded-2xl border border-[var(--tint-orange-border)] bg-[var(--tint-orange)] p-5" aria-label="탈퇴 요청 메시지">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">탈퇴 요청 메시지</h2>
                <time className="text-xs font-semibold text-[var(--orange700)]">
                  {formatAdminDateTime(user.withdrawalRequest.requestedAt)}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-strong)]">
                {user.withdrawalRequest.reason || '사용자가 별도 메시지를 남기지 않았어요.'}
              </p>
            </section>
          ) : null}

          <ListSection
            title={`소속 팀 ${teams.length}개`}
            manageHref="/admin/teams"
            manageLabel="팀 관리"
            empty="소속하거나 소유한 팀이 없어요."
          >
            {teams.map((team) => (
              <ListRow
                key={team.teamId}
                href={`/admin/teams/${encodeURIComponent(team.teamId)}`}
                title={team.name}
                meta={
                  <>
                    <span>멤버 {team.memberCount}</span>
                    <AdminStatusPill status={team.status} />
                  </>
                }
                tags={team.roleTags}
              />
            ))}
          </ListSection>

          <ListSection
            title={user.hostedMatches.length > 0 ? `최근 매치 ${user.hostedMatches.length}개` : '최근 매치'}
            manageHref="/admin/matches"
            manageLabel="매치 관리"
            empty="최근 생성한 매치가 없어요."
          >
            {user.hostedMatches.map((match) => (
              <ListRow
                key={match.matchId}
                href={`/admin/matches/${encodeURIComponent(match.matchId)}`}
                title={match.title}
                meta={
                  <>
                    <AdminStatusPill status={match.status} />
                    <span>{formatAdminDateTime(match.startAt)}</span>
                  </>
                }
              />
            ))}
          </ListSection>
        </section>

        <aside className="flex flex-col gap-4" aria-label="회원 운영 정보">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">활동 요약</h2>
            <dl className="mt-2">
              <DefinitionRow label="개설 매치" value={user.hostedMatchCount} />
              <DefinitionRow label="생성/소유 팀" value={user.ownedTeamCount} />
              <DefinitionRow label="팀장 팀" value={teamRoles.owner} />
              <DefinitionRow label="매니저 팀" value={teamRoles.manager} />
              <DefinitionRow label="소속팀 전체" value={teamMemberships.length} />
              <DefinitionRow label="일반 멤버 팀" value={teamRoles.member} />
              <DefinitionRow label="리뷰 수" value={user.reputationSummary?.reviewCount ?? 0} />
            </dl>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">삭제 처리</h2>
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

      {deleteMounted ? (
        <div
          className={`tm-modal-scrim fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4${
            deleteClosing ? ' is-closing' : ''
          }`}
          onClick={onDeleteBackdropClick}
        >
          <form
            ref={deleteDialogRef}
            onSubmit={handleDeleteSubmit}
            // 전수검수: bg-white가 다크에서 안 뒤집혀 안의 text-[var(--text-strong)] 등이
            // 근접색이 되던 회귀 — 다른 어드민 모달들과 동일하게 --card-surface로 교체.
            className={`tm-modal-panel w-full max-w-[440px] rounded-2xl bg-[var(--card-surface)] p-5 shadow-[var(--shadow-modal)]${
              deleteClosing ? ' is-closing' : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-user-title"
          >
            <h2 id="delete-user-title" className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">회원 삭제</h2>
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

function DefinitionRow({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty = value === null || value === undefined || value === '';
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 border-t border-[var(--border)] py-2.5 first:border-t-0">
      <dt className="text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">{label}</dt>
      <dd className="break-words text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">{isEmpty ? '-' : value}</dd>
    </div>
  );
}

function ListSection({
  title,
  manageHref,
  manageLabel,
  empty,
  children,
}: {
  title: string;
  manageHref: string;
  manageLabel: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">{title}</h2>
        <Link
          href={manageHref}
          className="inline-flex min-h-[44px] items-center gap-0.5 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--blue700)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          {manageLabel}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {children.length > 0 ? (
        <ul className="mt-1">{children}</ul>
      ) : (
        <p className="py-6 text-center text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">{empty}</p>
      )}
    </section>
  );
}

function ListRow({
  href,
  title,
  meta,
  tags,
}: {
  href: string;
  title: string;
  meta: ReactNode;
  tags?: string[];
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--border)] py-3 first:border-t-0">
      <div className="min-w-0">
        <Link
          href={href}
          className="break-words text-[length:var(--font-size-body-sm)] font-semibold text-[var(--blue700)] hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          {title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[length:var(--font-size-caption)] font-medium text-[var(--text-muted)]">{meta}</div>
      </div>
      {tags && tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="rounded-full bg-[var(--blue50)] px-2 py-0.5 text-[length:var(--font-size-caption)] font-bold text-[var(--blue700)]">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </li>
  );
}
