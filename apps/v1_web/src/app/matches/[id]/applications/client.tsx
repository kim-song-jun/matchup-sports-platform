'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  useV1ApproveMatchApplication,
  useV1Match,
  useV1MatchApplicationEligibility,
  useV1MatchApplicationsInfinite,
  useV1RejectMatchApplication,
} from '@/hooks/use-v1-api';
import { AppChrome } from '@/components/v1-ui/shell';
import { AlertBanner, Card, EmptyState } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { ChevronLeftIcon } from '@/components/v1-ui/icons';
import { extractErrorMessage } from '@/lib/error-message';
import { cssUrl } from '@/lib/assets';
import type { V1MatchApplication } from '@/types/api';

export function MatchApplicationsPageClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const matchQuery = useV1Match(matchId);
  const eligibility = useV1MatchApplicationEligibility(matchId, { enabled: Boolean(matchQuery.data) });
  const viewerState = matchQuery.data?.viewer?.state ?? matchQuery.data?.viewerState ?? 'none';
  const isHost = viewerState === 'host';
  // Fetch once we know user is host — avoids 403 for non-hosts.
  // Cursor-paginated: a match can hold up to 100 participants while the API caps each
  // page at 50, so the host loads further pages via "더 보기" to manage every applicant.
  const applicationsQuery = useV1MatchApplicationsInfinite(
    matchId,
    { status: 'requested', limit: 50 },
    { enabled: Boolean(matchQuery.data) && isHost },
  );
  const approveApplication = useV1ApproveMatchApplication(matchId);
  const rejectApplication = useV1RejectMatchApplication(matchId);
  const [actionError, setActionError] = useState<string | null>(null);
  const { confirm, ConfirmModal } = useConfirm();

  // Non-host redirect: once viewer state is resolved, push to detail
  useEffect(() => {
    if (!matchQuery.data) return;
    if (!isHost) {
      router.replace(`/matches/${matchId}`);
    }
  }, [matchQuery.data, isHost, matchId, router]);

  if (matchQuery.isError) {
    return (
      <AppChrome title="신청자 관리" activeTab="matches" bottomNav={false} backHref={`/matches/${matchId}`}>
        <DesktopPageHead matchId={matchId} />
        <div className="tm-match-list">
          <ErrorCard message="매치 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />
        </div>
      </AppChrome>
    );
  }

  // While loading or redirecting non-host, show skeleton
  if (!matchQuery.data || !isHost) {
    return (
      <AppChrome title="신청자 관리" activeTab="matches" bottomNav={false} backHref={`/matches/${matchId}`}>
        <DesktopPageHead matchId={matchId} />
        <div className="tm-match-list">
          <ApplicationsSkeletonList />
        </div>
      </AppChrome>
    );
  }

  const match = matchQuery.data;
  const matchTitle = match.title;
  const items = applicationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const pendingCount = items.filter((a) => a.status === 'requested').length;
  const actionPending = approveApplication.isPending || rejectApplication.isPending;
  const eligibilityData = eligibility.data;

  async function handleApprove(application: V1MatchApplication) {
    const ok = await confirm({
      title: '신청 승인',
      message: `${application.displayName}님의 신청을 승인할까요?`,
      confirmLabel: '승인',
    });
    if (!ok) return;
    setActionError(null);
    approveApplication.mutate(
      { applicationId: application.applicationId, note: null },
      {
        onError: (err) => {
          setActionError(extractErrorMessage(err, '승인하지 못했어요. 잠시 후 다시 시도해 주세요.'));
        },
      },
    );
  }

  async function handleReject(application: V1MatchApplication) {
    const ok = await confirm({
      title: '신청 거절',
      message: `${application.displayName}님의 신청을 거절할까요?`,
      confirmLabel: '거절',
      tone: 'danger',
    });
    if (!ok) return;
    setActionError(null);
    rejectApplication.mutate(
      { applicationId: application.applicationId, reason: 'rejected_by_host_from_applications_page' },
      {
        onError: (err) => {
          setActionError(extractErrorMessage(err, '거절하지 못했어요. 잠시 후 다시 시도해 주세요.'));
        },
      },
    );
  }

  return (
    <AppChrome title="신청자 관리" activeTab="matches" bottomNav={false} backHref={`/matches/${matchId}`}>
      {/* 확인 모달 — window.confirm 대체 */}
      {ConfirmModal}
      <DesktopPageHead matchId={matchId} />
      <div className="tm-match-list">
        {/* 액션 에러 인라인 배너 — window.alert 대체 */}
        {actionError ? (
          <div style={{ marginBottom: 12 }}>
            <AlertBanner message={actionError} tone="error" />
          </div>
        ) : null}
        {/* 매치 요약 카드 */}
        <Card pad={16} style={{ background: 'var(--blue50)', borderColor: 'var(--tint-blue-border)' }}>
          <div className="tm-text-body-lg">{matchTitle}</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>
            {/* eligibility 미도착 시 기본값 '자동 승인'을 보여주면 호스트가 승인 방식을
                오인할 수 있어, 데이터가 준비될 때까지 중립 문구를 표시한다. */}
            {!eligibilityData
              ? '승인 방식 불러오는 중'
              : eligibilityData.requiresApproval
                ? '수동 승인 매치'
                : '자동 승인 매치'} ·
            {' '}
            {match.capacityText}
            {pendingCount > 0 ? ` · 대기 ${pendingCount}명` : ''}
          </div>
        </Card>

        {/* 로딩 중 */}
        {applicationsQuery.isLoading ? (
          <div style={{ marginTop: 14 }}>
            <ApplicationsSkeletonList />
          </div>
        ) : applicationsQuery.isError ? (
          <div style={{ marginTop: 14 }}>
            <ErrorCard message="신청 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." />
          </div>
        ) : items.length === 0 ? (
          <div style={{ marginTop: 14 }}>
            <EmptyState
              title="신청자가 없어요"
              sub="신청자가 생기면 여기서 바로 승인하거나 거절할 수 있어요."
            />
          </div>
        ) : (
          <div className="tm-my-list-stack" style={{ marginTop: 14 }}>
            {items.map((application) => (
              <ApplicationRow
                key={application.applicationId}
                application={application}
                actionPending={actionPending}
                onApprove={() => handleApprove(application)}
                onReject={() => handleReject(application)}
              />
            ))}
            {applicationsQuery.hasNextPage ? (
              <button
                className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block"
                type="button"
                style={{ marginTop: 4 }}
                disabled={applicationsQuery.isFetchingNextPage}
                onClick={() => applicationsQuery.fetchNextPage()}
              >
                {applicationsQuery.isFetchingNextPage ? '불러오는 중…' : '더 보기'}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </AppChrome>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DesktopPageHead({ matchId }: { matchId: string }) {
  return (
    <div className="tm-desktop-page-head tm-show-desktop">
      <Link
        className="tm-desktop-back"
        href={`/matches/${matchId}`}
        aria-label="매치 상세로 돌아가기"
      >
        <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
      </Link>
      <h1 className="tm-text-heading" style={{ margin: 0 }}>신청자 관리</h1>
    </div>
  );
}

function ApplicationRow({
  application,
  actionPending,
  onApprove,
  onReject,
}: {
  application: V1MatchApplication;
  actionPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const statusLabel = applicationStatusLabel(application.status);
  const statusBadgeClass = applicationStatusBadgeClass(application.status);
  const isPending = application.status === 'requested';
  const mannerScore =
    application.mannerScore !== null ? application.mannerScore.toFixed(1) : null;

  return (
    <Card pad={14}>
      {/* 신청자 정보 행 */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44 }}
        aria-label={`신청자 ${application.displayName}`}
      >
        {/* 프로필 이미지 */}
        <div
          role="img"
          aria-label={`${application.displayName} 프로필 사진`}
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: 'var(--grey200)',
            backgroundImage: application.profileImageUrl
              ? cssUrl(application.profileImageUrl)
              : undefined,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
            backgroundRepeat: 'no-repeat',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            color: 'var(--text-muted)',
            fontSize: 18,
            fontWeight: 800,
          }}
        >
          {!application.profileImageUrl
            ? (application.displayName.slice(0, 1) || '?')
            : null}
        </div>

        {/* 이름 / 부가 정보 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="tm-text-body"
            style={{ color: 'var(--text-strong)', fontWeight: 600 }}
          >
            {application.displayName}
          </div>
          <div
            className="tm-text-caption"
            style={{ marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}
          >
            {mannerScore !== null ? (
              /* [P1 숫자:단위 2:1 + tabular-nums] 매너점수 숫자(body-sm weight600) : 단위(caption) */
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 'var(--font-size-body-sm)', color: 'var(--text-strong)' }}>{mannerScore}</span>
                <span>점</span>
              </span>
            ) : null}
            {application.reviewCount > 0 ? (
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                리뷰{' '}
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: 'var(--font-size-body-sm)', color: 'var(--text-strong)' }}>{application.reviewCount}</span>개
              </span>
            ) : null}
            {application.message ? (
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 160,
                  display: 'inline-block',
                }}
              >
                "{application.message}"
              </span>
            ) : null}
          </div>
        </div>

        {/* 상태 뱃지 */}
        <span className={`tm-badge ${statusBadgeClass}`} aria-label={`상태: ${statusLabel}`}>
          {statusLabel}
        </span>
      </div>

      {/* 승인/거절 버튼 — requested(대기중) 상태일 때만 */}
      {isPending ? (
        <>
          <button
            className="tm-btn tm-btn-sm tm-btn-neutral tm-btn-block"
            type="button"
            style={{ marginTop: 10 }}
            disabled={actionPending}
            aria-expanded={actionsOpen}
            aria-label={`${application.displayName} 신청 관리`}
            onClick={() => setActionsOpen((prev) => !prev)}
          >
            관리
          </button>
          {actionsOpen ? (
            <div
              className="tm-member-actions"
              style={{ marginTop: 10, display: 'flex', gap: 8 }}
            >
              <button
                className="tm-btn tm-btn-sm tm-btn-primary"
                type="button"
                style={{ flex: 1 }}
                disabled={actionPending}
                aria-label={`${application.displayName} 승인`}
                onClick={() => {
                  setActionsOpen(false);
                  onApprove();
                }}
              >
                승인
              </button>
              <button
                className="tm-btn tm-btn-sm tm-btn-danger"
                type="button"
                style={{ flex: 1 }}
                disabled={actionPending}
                aria-label={`${application.displayName} 거절`}
                onClick={() => {
                  setActionsOpen(false);
                  onReject();
                }}
              >
                거절
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

function ApplicationsSkeletonList() {
  return (
    <div className="tm-my-list-stack" aria-busy="true" aria-label="신청 목록 불러오는 중">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="tm-review-skeleton"
          style={{ minHeight: 76, borderRadius: 16 }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card pad={16} style={{ background: 'var(--grey50)' }}>
      <div className="tm-text-label">{message}</div>
      <div className="tm-text-caption" style={{ marginTop: 6, lineHeight: 1.55 }}>
        새로고침 후에도 같은 문제가 반복되면 잠시 뒤 다시 시도해 주세요.
      </div>
    </Card>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applicationStatusLabel(status: string): string {
  switch (status) {
    case 'requested': return '대기 중';
    case 'approved': return '승인 완료';
    case 'rejected': return '거절됨';
    case 'withdrawn': return '취소됨';
    case 'cancelled_by_host': return '호스트 취소';
    case 'expired': return '마감됨';
    default: return '알 수 없음';
  }
}

function applicationStatusBadgeClass(status: string): string {
  switch (status) {
    case 'requested': return 'tm-badge-orange';
    case 'approved': return 'tm-badge-green';
    case 'rejected': return 'tm-badge-red';
    default: return 'tm-badge-grey';
  }
}
