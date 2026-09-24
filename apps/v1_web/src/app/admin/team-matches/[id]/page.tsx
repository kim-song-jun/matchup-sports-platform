'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarClock, ListOrdered, MapPin, Trophy, Users } from 'lucide-react';
import {
  AdminDetailRow,
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
  AdminSummaryItem,
  AdminTableSkeleton,
} from '@/components/admin';
import {
  useV1AdminMe,
  useV1AdminTeamMatch,
  useV1ApproveAdminTeamMatchApplication,
  useV1RejectAdminTeamMatchApplication,
} from '@/hooks/use-v1-api';
import { formatAdminDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { randomUuid } from '@/lib/uuid';
import type { V1AdminTeamMatchDetail } from '@/types/api';

/**
 * 팀매치 상세.
 *
 * 라이브 경기 상태는 여기서 보여주지 않는다 — 그건 현장 콘솔(`/admin/live/:id`)의 일이고,
 * 같은 정보를 두 화면이 각자 그리면 어느 쪽이 최신인지 알 수 없게 된다. 대신 연결된 게임이
 * 있는지만 알린다. 상태 변경도 목록이 계속 담당한다(이중 편집 진입점을 만들지 않는다).
 */

const APPLICATION_STATUS_LABEL: Record<string, string> = {
  requested: '신청',
  approved: '승인',
  rejected: '거절',
  withdrawn: '철회',
};

function BackLink() {
  return (
    <Link
      href="/admin/team-matches"
      className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-4 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      목록
    </Link>
  );
}

function Applications({ teamMatch }: { teamMatch: V1AdminTeamMatchDetail }) {
  const truncated = teamMatch.applications.length < teamMatch.applicationCount;
  const isPlatformRecruitment = teamMatch.platformManaged && !teamMatch.league && !teamMatch.tournament;
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;
  const approvedCount = teamMatch.applications.filter((application) => application.status === 'approved').length;
  const [pendingApplicationId, setPendingApplicationId] = useState('');
  const [rejectingApplicationId, setRejectingApplicationId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [message, setMessage] = useState('');
  const approval = useV1ApproveAdminTeamMatchApplication(teamMatch.teamMatchId);
  const rejection = useV1RejectAdminTeamMatchApplication(teamMatch.teamMatchId);

  const approveApplication = async (applicationId: string) => {
    if (!canWrite || !isPlatformRecruitment || teamMatch.status !== 'recruiting') return;
    setPendingApplicationId(applicationId);
    setMessage('');
    try {
      const result = await approval.mutateAsync({ applicationId, body: { clientCommandId: randomUuid() } });
      setMessage(
        result.teamMatchStatus === 'matched'
          ? '두 번째 팀을 승인해 매치를 확정했어요. 경기와 양 팀 일정이 생성됐어요.'
          : '첫 번째 팀을 승인했어요. 두 번째 참가팀을 승인하면 매치가 확정돼요.',
      );
    } catch (error) {
      setMessage(extractErrorMessage(error, '참가팀을 승인하지 못했어요.'));
    } finally {
      setPendingApplicationId('');
    }
  };

  const rejectApplication = async (applicationId: string) => {
    const reason = rejectReason.trim();
    if (!canWrite || !isPlatformRecruitment || teamMatch.status !== 'recruiting' || !reason) return;
    setPendingApplicationId(applicationId);
    setMessage('');
    try {
      await rejection.mutateAsync({
        applicationId,
        body: { clientCommandId: randomUuid(), reason },
      });
      setMessage('참가 신청을 거절했어요. 신청 팀에 사유가 안내돼요.');
      setRejectingApplicationId('');
      setRejectReason('');
    } catch (error) {
      setMessage(extractErrorMessage(error, '참가 신청을 거절하지 못했어요.'));
    } finally {
      setPendingApplicationId('');
    }
  };
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5" aria-label={isPlatformRecruitment ? '참가팀 신청' : '상대팀 신청'}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">{isPlatformRecruitment ? '참가팀 신청' : '상대팀 신청'}</h2>
        <span className="text-sm font-semibold tabular-nums text-[var(--text-muted)]">
          {/* 서버가 최근 50건만 내려준다 — 총계만 적으면 목록이 전부인 것처럼 읽힌다. */}
          {truncated ? `${teamMatch.applications.length} / ${teamMatch.applicationCount}건` : `${teamMatch.applicationCount}건`}
        </span>
      </div>
      {truncated && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">최근 {teamMatch.applications.length}건만 표시해요.</p>
      )}
      {teamMatch.applications.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-2">
          {teamMatch.applications.map((application) => (
            <li key={application.applicationId} className="tm-on-tint rounded-xl bg-[var(--surface-soft)] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/admin/teams/${encodeURIComponent(application.applicantTeamId)}`}
                    className="break-words text-sm font-bold text-[var(--text-strong)] hover:text-[var(--blue700)]"
                  >
                    {application.applicantTeamName}
                  </Link>
                  <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">{formatAdminDateTime(application.createdAt)}</p>
                  {application.message && (
                    <p className="mt-2 whitespace-pre-wrap break-words text-xs text-[var(--text-body)]">{application.message}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full border border-[var(--border)] bg-[var(--card-surface)] px-2 py-1 text-xs font-semibold text-[var(--text-muted)]">
                    {APPLICATION_STATUS_LABEL[application.status] ?? application.status}
                  </span>
                  {isPlatformRecruitment && teamMatch.status === 'recruiting' && canWrite && application.status === 'requested' && (
                    <>
                      <button
                        type="button"
                        disabled={approval.isPending || rejection.isPending}
                        onClick={() => {
                          setRejectingApplicationId(application.applicationId);
                          setRejectReason('');
                          setMessage('');
                        }}
                        className="min-h-[44px] rounded-lg border border-red-200 bg-[var(--card-surface)] px-3 text-[length:var(--font-size-caption)] font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        거절
                      </button>
                      <button
                        type="button"
                        disabled={approval.isPending || rejection.isPending}
                        onClick={() => void approveApplication(application.applicationId)}
                        className="min-h-[44px] rounded-lg bg-blue-500 px-3 text-[length:var(--font-size-caption)] font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {pendingApplicationId === application.applicationId
                          ? '처리 중…'
                          : approvedCount === 0
                            ? '승인'
                            : '승인하고 매치 확정'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {rejectingApplicationId === application.applicationId && (
                <div className="mt-3 rounded-xl border border-red-100 bg-[var(--card-surface)] p-3">
                  <label className="block text-xs font-semibold text-[var(--text-strong)]">
                    거절 사유
                    <textarea
                      aria-label={`${application.applicantTeamName} 거절 사유`}
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      maxLength={500}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 py-2 text-sm text-[var(--text-strong)] focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20"
                      placeholder="신청 팀에 안내할 사유를 입력하세요"
                    />
                  </label>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={rejection.isPending}
                      onClick={() => { setRejectingApplicationId(''); setRejectReason(''); }}
                      className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-[var(--text-muted)]"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      disabled={!rejectReason.trim() || rejection.isPending}
                      onClick={() => void rejectApplication(application.applicationId)}
                      className="min-h-[44px] rounded-lg bg-red-500 px-3 text-sm font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {pendingApplicationId === application.applicationId ? '거절 중…' : '거절 확정'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <div className="tm-on-tint mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          아직 신청한 팀이 없어요.
        </div>
      )}

      {isPlatformRecruitment && teamMatch.status === 'recruiting' && canWrite && (
        <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--surface-soft)] p-4">
          <h3 className="text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]">참가팀 승인</h3>
          <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            {approvedCount === 0
              ? '각 신청의 승인 버튼으로 첫 번째 참가팀을 확정하세요. 첫 승인 팀이 HOME이 돼요.'
              : '첫 번째 참가팀이 승인됐어요. 다음 팀을 승인하면 AWAY로 배정되고 나머지 신청은 거절돼요.'}
          </p>
          {message && <p role="status" className="mt-3 text-[length:var(--font-size-caption)] text-[var(--text-body)]">{message}</p>}
        </div>
      )}
    </section>
  );
}

export default function AdminTeamMatchDetailPage() {
  const params = useParams<{ id: string }>();
  const teamMatchId = params.id;
  const { data: adminMe } = useV1AdminMe();
  const { data: teamMatch, isPending, isError, error, refetch } = useV1AdminTeamMatch(teamMatchId);

  if (isPending) return <AdminTableSkeleton rows={6} />;

  if (isError || !teamMatch) {
    return (
      <>
        <AdminPageHeader eyebrow="플랫폼 · 팀매치" title="팀매치 상세" action={<BackLink />} />
        <AdminEmpty
          title="팀매치 정보를 불러오지 못했어요"
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

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼 · 팀매치"
        title="팀매치 상세"
        description={teamMatch.title}
        action={
          <div className="flex items-center gap-2">
            {teamMatch.platformManaged && teamMatch.status === 'recruiting' && adminMe?.capabilities.includes('status:write') && (
              <Link
                href={`/admin/team-matches/${encodeURIComponent(teamMatch.teamMatchId)}/edit`}
                className="inline-flex h-[44px] items-center rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                모집 수정
              </Link>
            )}
            <BackLink />
          </div>
        }
      />

      <div className="tm-content-enter grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="팀매치 상세 정보">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                  <Trophy size={16} aria-hidden="true" />
                  팀매치
                </div>
                <h2 className="mt-2 break-words text-[length:var(--font-size-subhead)] font-bold text-[var(--text-strong)]">{teamMatch.title}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{teamMatch.sportName} · {teamMatch.hostTeamName ?? '플랫폼 모집'}</p>
              </div>
              <AdminStatusPill status={teamMatch.status} />
            </div>

            {/* 리그는 팀매치를 묶는 컨테이너다 — 소속이 있으면 그 리그로 바로 갈 수 있어야 한다. */}
            {teamMatch.league && (
              <Link
                href={`/admin/league-matches/${encodeURIComponent(teamMatch.league.leagueId)}`}
                className="mt-4 inline-flex h-[44px] items-center gap-2 rounded-xl bg-[var(--blue50)] px-4 text-sm font-semibold text-[var(--blue700)] hover:bg-[var(--tint-blue)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <ListOrdered size={16} aria-hidden="true" />
                정규 리그 · {teamMatch.league.title}
              </Link>
            )}

            {teamMatch.imageUrl && (
              <div
                role="img"
                aria-label={`${teamMatch.title} 대표 이미지`}
                className="mt-5 aspect-[16/7] w-full rounded-2xl bg-[var(--surface-soft)] bg-cover bg-center"
                style={{ backgroundImage: `url("${teamMatch.imageUrl.replaceAll('"', '%22')}")` }}
              />
            )}

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <AdminDetailRow label="팀매치 ID" value={teamMatch.teamMatchId} />
              <AdminDetailRow label="종목" value={teamMatch.sportName} />
              <AdminDetailRow label="주최" value={teamMatch.hostTeamName ?? 'Teameet 운영'} />
              <AdminDetailRow label="확정 상대팀" value={teamMatch.approvedApplicantTeamName ?? '미확정'} />
              <AdminDetailRow label="장소" value={teamMatch.placeName} />
              <AdminDetailRow label="주소" value={teamMatch.placeAddress} />
              <AdminDetailRow label="지역" value={teamMatch.regionName} />
              <AdminDetailRow label="시작" value={formatAdminDateTime(teamMatch.startAt)} />
              <AdminDetailRow label="종료" value={formatAdminDateTime(teamMatch.endAt)} />
              <AdminDetailRow label="신청 마감" value={formatAdminDateTime(teamMatch.deadlineAt)} />
              <AdminDetailRow label="개설자" value={teamMatch.createdByName} />
              <AdminDetailRow label="생성일" value={formatAdminDateTime(teamMatch.createdAt)} />
            </dl>
          </article>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5" aria-label="경기 조건">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">경기 조건</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <AdminDetailRow label="실력 등급" value={teamMatch.levelLabel} />
              <AdminDetailRow label="경기 형식" value={teamMatch.matchFormat} />
              <AdminDetailRow label="형식 메모" value={teamMatch.formatNote} />
              <AdminDetailRow label="경기 성격" value={teamMatch.matchStyle.length > 0 ? teamMatch.matchStyle.join(', ') : null} />
              <AdminDetailRow label="성별 조건" value={teamMatch.genderRule} />
              <AdminDetailRow label="유니폼 색" value={teamMatch.uniformColor} />
              <AdminDetailRow label="비용 안내" value={teamMatch.costNote} />
            </dl>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5" aria-label="팀매치 소개">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">소개</h2>
            {teamMatch.description?.trim() ? (
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-body)]">
                {teamMatch.description}
              </p>
            ) : (
              <div className="tm-on-tint mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                주최 팀이 입력한 소개가 없어요.
              </div>
            )}
          </section>

          <Applications teamMatch={teamMatch} />
        </section>

        <aside className="flex flex-col gap-4" aria-label="팀매치 운영 요약">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">운영 요약</h2>
            <dl className="mt-4 grid gap-3">
              <AdminSummaryItem icon={<Users size={16} />} label="상대팀 신청" value={`${teamMatch.applicationCount}건`} />
              <AdminSummaryItem icon={<Trophy size={16} />} label="확정 상대팀" value={teamMatch.approvedApplicantTeamName ?? '미확정'} />
              <AdminSummaryItem icon={<ListOrdered size={16} />} label="정규 리그" value={teamMatch.league?.title ?? '단발 경기'} />
              <AdminSummaryItem icon={<MapPin size={16} />} label="지역" value={teamMatch.regionName} />
              <AdminSummaryItem icon={<CalendarClock size={16} />} label="시작" value={formatAdminDateTime(teamMatch.startAt)} />
              <AdminSummaryItem icon={<CalendarClock size={16} />} label="경기 기록" value={teamMatch.hasGame ? '연결됨' : '없음'} />
            </dl>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">주최</h2>
            <dl className="mt-4 grid gap-3">
              <AdminSummaryItem icon={<Users size={16} />} label="이름" value={teamMatch.hostTeamName ?? 'Teameet 운영'} />
            </dl>
            {teamMatch.hostTeamId && (
              <Link
                href={`/admin/teams/${encodeURIComponent(teamMatch.hostTeamId)}`}
                className="mt-3 inline-flex h-[44px] w-full items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--blue700)] hover:bg-[var(--blue50)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                주최 팀 상세 보기
              </Link>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
