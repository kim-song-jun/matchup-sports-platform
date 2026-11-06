'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronRight, PhoneOff, Trash2 } from 'lucide-react';
import {
  AdminEmpty,
  AdminPageHeader,
  AdminReasonConfirmDialog,
  AdminStatusPill,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import {
  useV1AdminUser,
  useV1DeleteAdminUser,
  useV1ReleaseAdminUserPhone,
} from '@/hooks/use-v1-api';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { formatAdminDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAuthProviders, formatGender, formatOnboardingStatus, formatUserTitle, maskPhoneNumber } from '@/lib/format-user';
import { mergeUserTeams } from '@/lib/admin-user-teams';
import type { V1AdminUserDetail } from '@/types/api';
import { useAdminListReturnHref } from '../../use-admin-url-list-query';

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
  // '목록'은 회원 목록을 마지막으로 본 주소(검색·필터·페이지)로 돌아간다(MD-QA #21).
  const listHref = useAdminListReturnHref('/admin/users');
  const userId = params.id;
  const { data: user, isPending, isError, error, refetch } = useV1AdminUser(userId);
  const deleteMutation = useV1DeleteAdminUser(userId);
  const releaseMutation = useV1ReleaseAdminUserPhone(userId);
  const { toasts, showToast } = useAdminToast();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);

  const canWrite = useAdminCanWrite();
  const canDelete = canWrite && user?.accountStatus !== 'deleted';
  // 서버는 완전히 삭제된 계정(deletedAt 이 있는 삭제 상태)의 번호 해제를 막는다 — 그 계정의 번호는 삭제 때 이미 풀렸다.
  const hasReleasablePhone = Boolean(user?.phone) && !user?.deletedAt;

  function handleDeleteSubmit(reason: string) {
    deleteMutation.mutate(
      { reason },
      {
        onSuccess: () => {
          setDeleteOpen(false);
          showToast('회원을 삭제 처리했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '회원 삭제에 실패했어요.'), 'error');
        },
      },
    );
  }

  function handleReleaseSubmit(reason: string) {
    releaseMutation.mutate(
      { reason },
      {
        onSuccess: () => {
          setReleaseOpen(false);
          showToast('휴대폰 번호를 해제했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '휴대폰 번호 해제에 실패했어요.'), 'error');
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
                tags={team.roleLabel ? [team.roleLabel] : []}
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
              <DefinitionRow label="소유 팀(보관 포함)" value={user.ownedTeamCount} />
              <DefinitionRow label="팀장 팀" value={teamRoles.owner} />
              <DefinitionRow label="매니저 팀" value={teamRoles.manager} />
              <DefinitionRow label="소속팀 전체" value={teamMemberships.length} />
              <DefinitionRow label="일반 멤버 팀" value={teamRoles.member} />
              <DefinitionRow label="리뷰 수" value={user.reputationSummary?.reviewCount ?? 0} />
            </dl>
          </section>

          {hasReleasablePhone ? (
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
              <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">휴대폰 번호 해제</h2>
              <p className="mt-2 text-[length:var(--font-size-body-sm)] leading-relaxed text-[var(--text-muted)]">
                통신사가 번호를 다른 사람에게 다시 배정해 가입이 막힌 경우에 써요. 번호만 이 계정에서 빠지고 계정은 그대로 남아요. 처리 사유는 감사 로그에 남아요.
              </p>
              <button
                type="button"
                disabled={!canWrite}
                onClick={() => setReleaseOpen(true)}
                className="mt-4 inline-flex h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-4 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-500"
              >
                <PhoneOff size={16} aria-hidden="true" />
                휴대폰 번호 해제
              </button>
            </section>
          ) : null}

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

      <AdminReasonConfirmDialog
        open={deleteOpen}
        title="회원 삭제"
        description={`${userTitle(user)} 회원을 삭제 처리해요. 삭제한 계정은 되돌릴 수 없지만, 이메일·전화번호·로그인 식별자를 사용해 새로 가입할 수 있어요.`}
        reasonLabel="삭제 사유"
        reasonPlaceholder="운영자가 확인한 삭제 사유를 입력해 주세요."
        submitLabel="삭제 처리"
        pendingLabel="삭제 중"
        pending={deleteMutation.isPending}
        onSubmit={handleDeleteSubmit}
        onClose={() => setDeleteOpen(false)}
      />

      <AdminReasonConfirmDialog
        open={releaseOpen}
        title="휴대폰 번호 해제"
        description={
          <>
            <p>
              {userTitle(user)} 회원의 휴대폰 번호({maskPhoneNumber(user.phone)})를 해제해요.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>번호가 이 계정에서 지워져요.</li>
              <li>계정은 그대로 남지만, 휴대폰 번호를 다시 인증해야 해요.</li>
              <li>해제한 번호로 다른 사람이 가입할 수 있어요.</li>
            </ul>
            <p className="mt-2">회원에게는 번호가 해제됐다는 알림이 가요.</p>
          </>
        }
        reasonLabel="해제 사유"
        reasonPlaceholder="운영자가 확인한 해제 사유를 입력해 주세요."
        submitLabel="번호 해제"
        pendingLabel="해제 중"
        tone="primary"
        pending={releaseMutation.isPending}
        onSubmit={handleReleaseSubmit}
        onClose={() => setReleaseOpen(false)}
      />

      <AdminToasts toasts={toasts} />
    </>
  );

  function BackLink() {
    return (
      <button
        type="button"
        onClick={() => router.push(listHref)}
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
