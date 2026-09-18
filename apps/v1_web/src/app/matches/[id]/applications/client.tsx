'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  useV1ApproveMatchApplication,
  useV1CompleteMatch,
  useV1Match,
  useV1MatchApplicationsInfinite,
  useV1RejectMatchApplication,
} from '@/hooks/use-v1-api';
import { AlertBanner, Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { ChevronLeftIcon } from '@/components/v1-ui/icons';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1MatchApplication } from '@/types/api';

type Attendance = Record<string, 'completed' | 'no_show'>;

export function MatchApplicationsPageClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const matchQuery = useV1Match(matchId);
  const viewerState = matchQuery.data?.viewer?.state ?? matchQuery.data?.viewerState ?? 'none';
  const isHost = viewerState === 'host';
  const applicationsQuery = useV1MatchApplicationsInfinite(
    matchId,
    { limit: 50 },
    { enabled: Boolean(matchQuery.data) && isHost },
  );
  const approveApplication = useV1ApproveMatchApplication(matchId);
  const rejectApplication = useV1RejectMatchApplication(matchId);
  const completeMatch = useV1CompleteMatch(matchId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Attendance>({});
  const { confirm, ConfirmModal } = useConfirm();

  useEffect(() => {
    if (matchQuery.data && !isHost) router.replace(`/matches/${matchId}`);
  }, [matchQuery.data, isHost, matchId, router]);

  const items = useMemo(
    () => applicationsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [applicationsQuery.data],
  );
  const pending = items.filter((item) => item.status === 'requested');
  const active = items.filter((item) => item.status === 'approved' && item.participantStatus === 'active');
  const history = items.filter((item) => item.status !== 'requested' && item.participantStatus !== 'active');

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
    return <PageShell matchId={matchId}><ErrorState title="매치 정보를 불러오지 못했어요" message="잠시 후 다시 시도해 주세요." onRetry={() => void matchQuery.refetch()} retryLabel="다시 불러오기" /></PageShell>;
  }
  if (!matchQuery.data || !isHost) return <PageShell matchId={matchId}><ApplicationsSkeletonList /></PageShell>;

  const match = matchQuery.data;
  const lifecycleStatus = String(match.displayState ?? match.status);
  const canComplete =
    (lifecycleStatus === 'recruiting' || lifecycleStatus === 'closed' || lifecycleStatus === 'expired') &&
    new Date(match.startsAt).getTime() <= Date.now();
  const actionPending = approveApplication.isPending || rejectApplication.isPending || completeMatch.isPending;

  async function handleApprove(application: V1MatchApplication) {
    const ok = await confirm({ title: '신청 승인', message: `${application.displayName}님의 참가 신청을 승인할까요?`, confirmLabel: '승인' });
    if (!ok) return;
    setActionError(null);
    approveApplication.mutate(
      { applicationId: application.applicationId, note: null },
      { onError: (error) => setActionError(extractErrorMessage(error, '승인하지 못했어요.')) },
    );
  }

  async function handleReject(application: V1MatchApplication) {
    const ok = await confirm({ title: '신청 거절', message: `${application.displayName}님의 참가 신청을 거절할까요?`, confirmLabel: '거절', tone: 'danger' });
    if (!ok) return;
    setActionError(null);
    rejectApplication.mutate(
      { applicationId: application.applicationId, reason: 'rejected_by_host_from_applications_page' },
      { onError: (error) => setActionError(extractErrorMessage(error, '거절하지 못했어요.')) },
    );
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
      {ConfirmModal}
      <DesktopPageHead matchId={matchId} />
      <div className="tm-match-list">
        {actionError ? <div style={{ marginBottom: 12 }}><AlertBanner message={actionError} tone="error" /></div> : null}
        <Card pad={16} style={{ background: 'var(--tint-blue)', borderColor: 'var(--tint-blue-border)' }}>
          <div className="tm-text-body-lg">{match.title}</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>
            참가 확정 {active.length}명 · 승인 대기 {pending.length}명 · 정원 {match.participantCount}/{match.capacity}명
          </div>
        </Card>

        {applicationsQuery.isLoading ? <div style={{ marginTop: 16 }}><ApplicationsSkeletonList /></div> : null}
        {applicationsQuery.isError ? <div style={{ marginTop: 16 }}><ErrorState title="참가자 현황을 불러오지 못했어요" message="잠시 후 다시 시도해 주세요." onRetry={() => void applicationsQuery.refetch()} retryLabel="다시 불러오기" /></div> : null}

        {!applicationsQuery.isLoading && !applicationsQuery.isError ? (
          <>
            <SectionTitle title={`승인 대기 ${pending.length}`} description="신청 메시지와 프로필을 확인한 뒤 승인하거나 거절해요." />
            {pending.length ? pending.map((application) => (
              <ApplicationRow key={application.applicationId} application={application} actionPending={actionPending} onApprove={() => handleApprove(application)} onReject={() => handleReject(application)} />
            )) : <EmptyState title="대기 중인 신청이 없어요" sub="새 신청이 오면 이곳에서 확인할 수 있어요." />}

            <SectionTitle title={`참가 확정 ${active.length}`} description={canComplete ? '경기가 끝났다면 각 참가자의 참여 여부를 확인해 주세요.' : '승인된 참가자는 채팅과 내 매치에서 일정을 확인할 수 있어요.'} />
            {active.length ? active.map((application) => (
              <ApplicationRow key={application.applicationId} application={application} actionPending={actionPending}>
                {canComplete && application.participantId ? (
                  <label className="tm-text-caption" style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                    참여 여부
                    <select
                      className="tm-input"
                      aria-label={`${application.displayName} 참여 여부`}
                      value={attendance[application.participantId] ?? 'completed'}
                      onChange={(event) => setAttendance((current) => ({ ...current, [application.participantId!]: event.target.value as 'completed' | 'no_show' }))}
                    >
                      <option value="completed">참여 완료</option>
                      <option value="no_show">불참</option>
                    </select>
                  </label>
                ) : null}
              </ApplicationRow>
            )) : <EmptyState title="승인된 참가자가 없어요" sub="호스트만 참가한 경기도 시작 시각 이후 완료할 수 있어요." />}

            {canComplete ? (
              <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" type="button" style={{ marginTop: 16 }} disabled={actionPending} onClick={handleComplete}>
                {completeMatch.isPending ? '완료 처리 중…' : '참여 여부 확인하고 경기 완료'}
              </button>
            ) : null}

            {history.length ? (
              <>
                <SectionTitle title="처리 내역" description="거절·철회·마감·참여 완료 기록이에요." />
                {history.map((application) => <ApplicationRow key={application.applicationId} application={application} actionPending={actionPending} />)}
              </>
            ) : null}
            {applicationsQuery.hasNextPage ? <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" type="button" style={{ marginTop: 16 }} disabled={applicationsQuery.isFetchingNextPage} onClick={() => applicationsQuery.fetchNextPage()}>{applicationsQuery.isFetchingNextPage ? '불러오는 중…' : '더 보기'}</button> : null}
          </>
        ) : null}
      </div>
    </>
  );
}

function PageShell({ matchId, children }: { matchId: string; children: React.ReactNode }) {
  return <><DesktopPageHead matchId={matchId} /><div className="tm-match-list">{children}</div></>;
}

function DesktopPageHead({ matchId }: { matchId: string }) {
  return <div className="tm-desktop-page-head tm-show-desktop"><Link className="tm-desktop-back" href={`/matches/${matchId}`} aria-label="매치 상세로 돌아가기"><ChevronLeftIcon size={20} strokeWidth={2.2} /></Link><h1 className="tm-text-heading" style={{ margin: 0 }}>참가자 관리</h1></div>;
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return <div style={{ marginTop: 24, marginBottom: 10 }}><h2 className="tm-text-body-lg" style={{ margin: 0 }}>{title}</h2><p className="tm-text-caption" style={{ marginTop: 4 }}>{description}</p></div>;
}

function ApplicationRow({ application, actionPending, onApprove, onReject, children }: { application: V1MatchApplication; actionPending: boolean; onApprove?: () => void; onReject?: () => void; children?: React.ReactNode }) {
  return (
    <Card pad={16} style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/users/${application.applicantUserId}`} className="tm-text-body" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>{application.displayName}</Link>
          <div className="tm-text-caption" style={{ marginTop: 3 }}>
            {application.message ? `“${application.message}”` : '신청 메시지 없음'}
          </div>
        </div>
        <span className={`tm-badge ${applicationStatusBadgeClass(application)}`}>{applicationStatusLabel(application)}</span>
      </div>
      {children}
      {application.status === 'requested' && onApprove && onReject ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <button className="tm-btn tm-btn-sm tm-btn-primary" type="button" disabled={actionPending} onClick={onApprove}>승인</button>
          <button className="tm-btn tm-btn-sm tm-btn-danger" type="button" disabled={actionPending} onClick={onReject}>거절</button>
        </div>
      ) : null}
    </Card>
  );
}

function ApplicationsSkeletonList() {
  return <div className="tm-my-list-stack" aria-busy="true" aria-label="참가자 현황 불러오는 중">{[0, 1, 2].map((item) => <div key={item} className="tm-review-skeleton" style={{ minHeight: 88, borderRadius: 'var(--radius-container)' }} />)}</div>;
}

function applicationStatusLabel(application: V1MatchApplication) {
  if (application.participantStatus === 'completed') return '참여 완료';
  if (application.participantStatus === 'no_show') return '불참';
  if (application.participantStatus === 'active') return '참가 확정';
  const labels: Record<string, string> = { requested: '승인 대기', approved: '승인 완료', rejected: '거절됨', withdrawn: '신청 취소', cancelled_by_host: '호스트 취소', expired: '마감됨' };
  return labels[application.status] ?? '상태 확인 필요';
}

function applicationStatusBadgeClass(application: V1MatchApplication) {
  if (application.participantStatus === 'completed' || application.participantStatus === 'active') return 'tm-badge-green';
  if (application.participantStatus === 'no_show' || application.status === 'rejected') return 'tm-badge-red';
  return application.status === 'requested' ? 'tm-badge-orange' : 'tm-badge-grey';
}
