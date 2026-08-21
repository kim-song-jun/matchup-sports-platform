'use client';

import Link from 'next/link';
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
import { useV1AdminTeamMatch } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTeamMatchDetail } from '@/types/api';

/**
 * 팀매치 상세.
 *
 * 라이브 경기 상태는 여기서 보여주지 않는다 — 그건 현장 콘솔(`/admin/live/:id`)의 일이고,
 * 같은 정보를 두 화면이 각자 그리면 어느 쪽이 최신인지 알 수 없게 된다. 대신 연결된 게임이
 * 있는지만 알린다. 상태 변경도 목록이 계속 담당한다(이중 편집 진입점을 만들지 않는다).
 */
function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

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
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5" aria-label="상대팀 신청">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold text-[var(--text-strong)]">상대팀 신청</h2>
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
            <li key={application.applicationId} className="rounded-xl bg-[var(--surface-soft)] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/admin/teams/${encodeURIComponent(application.applicantTeamId)}`}
                    className="break-words text-sm font-bold text-[var(--text-strong)] hover:text-[var(--blue700)]"
                  >
                    {application.applicantTeamName}
                  </Link>
                  <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">{formatDateTime(application.createdAt)}</p>
                  {application.message && (
                    <p className="mt-1.5 whitespace-pre-wrap break-words text-xs text-[var(--text-body)]">{application.message}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--card-surface)] px-2 py-1 text-xs font-semibold text-[var(--text-muted)]">
                  {APPLICATION_STATUS_LABEL[application.status] ?? application.status}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          아직 신청한 팀이 없어요.
        </div>
      )}
    </section>
  );
}

export default function AdminTeamMatchDetailPage() {
  const params = useParams<{ id: string }>();
  const teamMatchId = params.id;
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
        action={<BackLink />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="팀매치 상세 정보">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                  <Trophy size={16} aria-hidden="true" />
                  팀매치
                </div>
                <h2 className="mt-2 break-words text-[22px] font-bold text-[var(--text-strong)]">{teamMatch.title}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{teamMatch.sportName} · {teamMatch.hostTeamName}</p>
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
                리그 · {teamMatch.league.title}
              </Link>
            )}

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <AdminDetailRow label="팀매치 ID" value={teamMatch.teamMatchId} />
              <AdminDetailRow label="종목" value={teamMatch.sportName} />
              <AdminDetailRow label="주최 팀" value={teamMatch.hostTeamName} />
              <AdminDetailRow label="확정 상대팀" value={teamMatch.approvedApplicantTeamName ?? '미확정'} />
              <AdminDetailRow label="장소" value={teamMatch.placeName} />
              <AdminDetailRow label="주소" value={teamMatch.placeAddress} />
              <AdminDetailRow label="지역" value={teamMatch.regionName} />
              <AdminDetailRow label="시작" value={formatDateTime(teamMatch.startAt)} />
              <AdminDetailRow label="종료" value={formatDateTime(teamMatch.endAt)} />
              <AdminDetailRow label="신청 마감" value={formatDateTime(teamMatch.deadlineAt)} />
              <AdminDetailRow label="개설자" value={teamMatch.createdByName} />
              <AdminDetailRow label="생성일" value={formatDateTime(teamMatch.createdAt)} />
            </dl>
          </article>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5" aria-label="경기 조건">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">경기 조건</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <AdminDetailRow label="경기 형식" value={teamMatch.matchFormat} />
              <AdminDetailRow label="형식 메모" value={teamMatch.formatNote} />
              <AdminDetailRow label="경기 성격" value={teamMatch.matchStyle.length > 0 ? teamMatch.matchStyle.join(', ') : null} />
              <AdminDetailRow label="성별 조건" value={teamMatch.genderRule} />
              <AdminDetailRow label="유니폼 색" value={teamMatch.uniformColor} />
              <AdminDetailRow label="비용 안내" value={teamMatch.costNote} />
            </dl>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5" aria-label="팀매치 소개">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">소개</h2>
            {teamMatch.description?.trim() ? (
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-body)]">
                {teamMatch.description}
              </p>
            ) : (
              <div className="mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                주최 팀이 입력한 소개가 없어요.
              </div>
            )}
          </section>

          <Applications teamMatch={teamMatch} />
        </section>

        <aside className="flex flex-col gap-4" aria-label="팀매치 운영 요약">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">운영 요약</h2>
            <dl className="mt-4 grid gap-3">
              <AdminSummaryItem icon={<Users size={16} />} label="상대팀 신청" value={`${teamMatch.applicationCount}건`} />
              <AdminSummaryItem icon={<Trophy size={16} />} label="확정 상대팀" value={teamMatch.approvedApplicantTeamName ?? '미확정'} />
              <AdminSummaryItem icon={<ListOrdered size={16} />} label="리그" value={teamMatch.league?.title ?? '단발 경기'} />
              <AdminSummaryItem icon={<MapPin size={16} />} label="지역" value={teamMatch.regionName ?? '-'} />
              <AdminSummaryItem icon={<CalendarClock size={16} />} label="시작" value={formatDateTime(teamMatch.startAt)} />
              <AdminSummaryItem icon={<CalendarClock size={16} />} label="경기 기록" value={teamMatch.hasGame ? '연결됨' : '없음'} />
            </dl>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">주최 팀</h2>
            <dl className="mt-4 grid gap-3">
              <AdminSummaryItem icon={<Users size={16} />} label="이름" value={teamMatch.hostTeamName} />
            </dl>
            <Link
              href={`/admin/teams/${encodeURIComponent(teamMatch.hostTeamId)}`}
              className="mt-3 inline-flex h-[44px] w-full items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--blue700)] hover:bg-[var(--blue50)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              주최 팀 상세 보기
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
