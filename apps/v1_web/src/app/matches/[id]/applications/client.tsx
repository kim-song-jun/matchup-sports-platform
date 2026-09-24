'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  useV1ApproveMatchApplication,
  useV1ChangeMatchParticipant,
  useV1CompleteMatch,
  useV1Match,
  useV1MatchApplicationEligibility,
  useV1MatchApplicationsInfinite,
  useV1RejectMatchApplication,
} from '@/hooks/use-v1-api';
import { AlertBanner, Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { ChevronLeftIcon } from '@/components/v1-ui/icons';
import { AppBackLink } from '@/components/v1-ui/app-back-link';
import { extractErrorMessage } from '@/lib/error-message';
import { cssUrl } from '@/lib/assets';
import type { V1MatchApplication } from '@/types/api';

type Attendance = Record<string, 'completed' | 'no_show'>;

export function MatchApplicationsPageClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const matchQuery = useV1Match(matchId);
  const eligibility = useV1MatchApplicationEligibility(matchId, { enabled: Boolean(matchQuery.data) });
  const viewerState = matchQuery.data?.viewer?.state ?? matchQuery.data?.viewerState ?? 'none';
  const isHost = !matchQuery.isPlaceholderData && viewerState === 'host';
  const [tab, setTab] = useState<'requested' | 'approved' | 'all'>('requested');
  // Fetch once we know user is host — avoids 403 for non-hosts.
  // Cursor-paginated: a match can hold up to 100 participants while the API caps each
  // page at 50, so the host loads further pages via "더 보기" to manage every applicant.
  const applicationsQuery = useV1MatchApplicationsInfinite(
    matchId,
    { ...(tab === 'all' ? {} : { status: tab }), limit: 50 },
    { enabled: Boolean(matchQuery.data) && isHost },
  );
  const approveApplication = useV1ApproveMatchApplication(matchId);
  const rejectApplication = useV1RejectMatchApplication(matchId);
  const changeParticipant = useV1ChangeMatchParticipant();
  const completeMatch = useV1CompleteMatch(matchId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Attendance>({});
  const { confirm, ConfirmModal } = useConfirm();

  // Non-host redirect: once viewer state is resolved, push to detail
  useEffect(() => {
    if (!matchQuery.data || matchQuery.isPlaceholderData || matchQuery.isError) return;
    if (!isHost) {
      router.replace(`/matches/${matchId}`);
    }
  }, [matchQuery.data, matchQuery.isPlaceholderData, matchQuery.isError, isHost, matchId, router]);

  const items = useMemo(
    () => applicationsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [applicationsQuery.data],
  );
  const active = useMemo(
    () => items.filter((item) => item.status === 'approved' && item.participantStatus === 'active'),
    [items],
  );

  useEffect(() => {
    setAttendance((current) => {
      const next = { ...current };
      for (const application of active) {
        if (application.participantId && !next[application.participantId]) {
          next[application.participantId] = 'completed';
        }
      }
      return next;
    });
  }, [active]);

  if (matchQuery.isError) {
    return (
      <>
        <DesktopPageHead matchId={matchId} />
        <div className="tm-match-list">
          <ErrorState title="매치 정보를 불러오지 못했어요" message="잠시 후 다시 시도해 주세요." onRetry={() => void matchQuery.refetch()} retryLabel="다시 불러오기" />
        </div>
      </>
    );
  }

  // While loading or redirecting non-host, show skeleton
  if (!matchQuery.data || !isHost) {
    return (
      <>
        <DesktopPageHead matchId={matchId} />
        <div className="tm-match-list">
          <ApplicationsSkeletonList />
        </div>
      </>
    );
  }

  const match = matchQuery.data;
  const matchTitle = match.title;
  // 상세 직렬화(matches.service.ts)는 capacityText를 내려주지 않는다 — 실제로 오는 건
  // participantCount/capacity 숫자 필드뿐이다(V1Match 타입의 capacityText 선언은 런타임과
  // 어긋나 있지만, 그 필드는 이 배치의 소유 범위 밖 다른 소비처에서도 쓰여 타입 자체는
  // 건드리지 않는다 — 여기서는 실제로 오는 숫자 필드로 직접 정원 문구를 계산한다).
  const capacityLabel =
    typeof match.participantCount === 'number' && typeof match.capacity === 'number'
      ? `${match.participantCount}/${match.capacity}명`
      : null;
  const pendingCount = items.filter((a) => a.status === 'requested').length;
  const canComplete = match.canComplete === true;
  const actionPending = approveApplication.isPending || rejectApplication.isPending || changeParticipant.isPending || completeMatch.isPending;
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

  async function handleChangeParticipant(application: V1MatchApplication, reason: string) {
    if (!application.participantId || !reason.trim()) return;
    const action = application.canCancelApproval ? 'cancel-approval' : 'mark-cancelled';
    const label = action === 'cancel-approval' ? '승인 취소' : '불참 처리';
    const ok = await confirm({
      title: label,
      message: `${application.displayName}님을 ${label}할까요? 참가 인원에서 제외되며 채팅과 참여 리뷰를 이용할 수 없어요. 사유: ${reason.trim()}`,
      confirmLabel: label,
      tone: 'danger',
    });
    if (!ok) return;
    setActionError(null);
    changeParticipant.mutate({ participantId: application.participantId, action, reason: reason.trim() }, {
      onError: (err) => setActionError(extractErrorMessage(err, `${label}하지 못했어요. 상태를 확인하고 다시 시도해 주세요.`)),
    });
  }

  async function handleComplete() {
    const ok = await confirm({
      title: '경기 참여를 확정할까요?',
      message: '참여 완료와 불참 기록이 저장되고 매치가 완료돼요. 완료 후에는 수정할 수 없어요.',
      confirmLabel: '완료 확정',
    });
    if (!ok) return;
    setActionError(null);
    completeMatch.mutate(
      {
        participants: active.flatMap((application) => application.participantId
          ? [{ participantId: application.participantId, status: attendance[application.participantId] ?? 'completed' }]
          : []),
        reason: 'host_confirmed_attendance_from_v1_web',
      },
      {
        onSuccess: () => router.push(`/matches/${matchId}`),
        onError: (error) => setActionError(extractErrorMessage(error, '경기 완료를 확정하지 못했어요.')),
      },
    );
  }

  return (
    <>
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
        <Card pad={16} style={{ background: 'var(--tint-blue)', borderColor: 'var(--tint-blue-border)' }}>
          <div className="tm-text-body-lg">{matchTitle}</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>
            {/* eligibility 미도착 시 기본값 '자동 승인'을 보여주면 호스트가 승인 방식을
                오인할 수 있어, 데이터가 준비될 때까지 중립 문구를 표시한다. */}
            {!eligibilityData
              ? '승인 방식 불러오는 중'
              : eligibilityData.requiresApproval
                ? '수동 승인 매치'
                : '자동 승인 매치'}
            {capacityLabel ? ` · ${capacityLabel}` : ''}
            {pendingCount > 0 ? ` · 대기 ${pendingCount}명` : ''}
          </div>
        </Card>

        <div className="tm-segment-row" role="group" aria-label="신청 상태" style={{ marginTop: 16 }}>
          {([['requested', '승인 대기'], ['approved', '확정 명단'], ['all', '전체 이력']] as const).map(([value, label]) => (
            <button key={value} type="button" className={`tm-chip ${tab === value ? 'tm-chip-active' : ''}`} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>
          ))}
        </div>
        {tab === 'approved' && match.host ? <Card pad={16} style={{ marginTop: 12 }}><div className="tm-text-body">{match.host.displayName}</div><div className="tm-text-caption">호스트 · 참가 인원에 포함</div></Card> : null}
        {/* 로딩 중 */}
        {applicationsQuery.isLoading ? (
          <div style={{ marginTop: 16 }}>
            <ApplicationsSkeletonList />
          </div>
        ) : applicationsQuery.isError ? (
          <div style={{ marginTop: 16 }}>
            <ErrorState title="신청 목록을 불러오지 못했어요" message="잠시 후 다시 시도해 주세요." onRetry={() => void applicationsQuery.refetch()} retryLabel="다시 불러오기" />
          </div>
        ) : items.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <EmptyState
              illustration={{ name: 'matches-empty' }}
              title={tab === 'approved' ? '확정된 참가자가 없어요' : tab === 'all' ? '신청 이력이 없어요' : '대기 중인 신청자가 없어요'}
              sub={tab === 'approved' ? '신청을 승인하면 확정 명단에 표시돼요.' : tab === 'all' ? '신청·승인·취소 이력을 여기서 확인할 수 있어요.' : '새 신청이 들어오면 여기서 승인하거나 거절할 수 있어요.'}
              cta="매치 상세 보기"
              ctaHref={`/matches/${matchId}`}
            />
          </div>
        ) : (
          <div className="tm-my-list-stack" style={{ marginTop: 16 }}>
            {items.map((application) => (
              <ApplicationRow
                key={application.applicationId}
                application={application}
                actionPending={actionPending}
                onApprove={() => handleApprove(application)}
                onReject={() => handleReject(application)}
                onChangeParticipant={(reason) => handleChangeParticipant(application, reason)}
              >
                {tab === 'approved' && canComplete && application.participantStatus === 'active' && application.participantId ? (
                  <label className="tm-text-caption" style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                    참여 여부
                    <select
                      className="tm-input"
                      aria-label={`${application.displayName} 참여 여부`}
                      value={attendance[application.participantId] ?? 'completed'}
                      onChange={(event) => setAttendance((current) => ({
                        ...current,
                        [application.participantId!]: event.target.value as 'completed' | 'no_show',
                      }))}
                    >
                      <option value="completed">참여 완료</option>
                      <option value="no_show">불참</option>
                    </select>
                  </label>
                ) : null}
              </ApplicationRow>
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
            {tab === 'approved' && canComplete ? (
              <button
                className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block"
                type="button"
                style={{ marginTop: 12 }}
                disabled={actionPending || Boolean(applicationsQuery.hasNextPage)}
                onClick={handleComplete}
              >
                {applicationsQuery.hasNextPage
                  ? '확정 명단을 모두 불러와 주세요'
                  : completeMatch.isPending
                    ? '완료 처리 중…'
                    : '참여 여부 확인하고 경기 완료'}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DesktopPageHead({ matchId }: { matchId: string }) {
  return (
    <div className="tm-desktop-page-head tm-show-desktop">
      <AppBackLink className="tm-desktop-back" fallbackHref={`/matches/${matchId}`}>
        <ChevronLeftIcon size={20} strokeWidth={2.2} aria-hidden="true" />
      </AppBackLink>
      <h1 className="tm-text-heading" style={{ margin: 0 }}>신청자 관리</h1>
    </div>
  );
}

function ApplicationRow({
  application,
  actionPending,
  onApprove,
  onReject,
  onChangeParticipant,
  children,
}: {
  application: V1MatchApplication;
  actionPending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onChangeParticipant: (reason: string) => void;
  children?: React.ReactNode;
}) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const [reason, setReason] = useState('');
  const statusLabel = application.participantStatus === 'no_show' ? '불참'
    : application.participantStatus === 'removed' ? '승인 취소'
    : application.participantStatus === 'completed' ? '참여 완료'
    : applicationStatusLabel(application.status);
  const statusBadgeClass = applicationStatusBadgeClass(application.status);
  const isPending = application.status === 'requested';
  const canChangeParticipant = application.status === 'approved' && Boolean(application.participantId)
    && (application.canCancelApproval || application.canMarkCancelled);
  const mannerScore =
    application.mannerScore !== null ? application.mannerScore.toFixed(1) : null;

  return (
    <Card pad={16}>
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
            borderRadius: 'var(--radius-field)',
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
            color: 'var(--text)',
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
            style={{ marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}
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

      {children}

      {/* 승인/거절 버튼 — requested(대기중) 상태일 때만 */}
      {isPending || canChangeParticipant ? (
        <>
          <button
            className="tm-btn tm-btn-sm tm-btn-neutral tm-btn-block"
            type="button"
            style={{ marginTop: 12 }}
            disabled={actionPending}
            aria-expanded={actionsOpen}
            aria-label={`${application.displayName} ${isPending ? '신청' : '참가자'} 관리`}
            onClick={() => setActionsOpen((prev) => !prev)}
          >
            관리
          </button>
          {actionsOpen && isPending ? (
            <div
              className="tm-member-actions"
              style={{ marginTop: 12, display: 'flex', gap: 8 }}
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
          {actionsOpen && canChangeParticipant ? (
            <div style={{ marginTop: 12 }}>
              <label className="tm-text-caption" htmlFor={`participant-reason-${application.applicationId}`}>처리 사유 (필수)</label>
              <textarea
                id={`participant-reason-${application.applicationId}`}
                className="tm-input"
                style={{ width: '100%', marginTop: 8 }}
                rows={3}
                maxLength={500}
                value={reason}
                disabled={actionPending}
                onChange={(event) => setReason(event.target.value)}
              />
              <button
                className="tm-btn tm-btn-sm tm-btn-danger tm-btn-block"
                type="button"
                style={{ marginTop: 8 }}
                disabled={actionPending || !reason.trim()}
                onClick={() => onChangeParticipant(reason)}
              >
                {actionPending ? '처리 중…' : application.canCancelApproval ? '승인 취소' : '불참 처리'}
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
          style={{ minHeight: 76, borderRadius: 'var(--radius-container)' }}
          aria-hidden="true"
        />
      ))}
    </div>
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
