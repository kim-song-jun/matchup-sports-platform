'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CalendarClock, MapPin, UserRound, Users } from 'lucide-react';
import {
  AdminDetailRow,
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
  AdminSummaryItem,
  AdminTableSkeleton,
} from '@/components/admin';
import { useV1AdminMatch } from '@/hooks/use-v1-api';
import { formatAdminDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';

/**
 * 매치 상세. 백엔드(`GET /admin/matches/:matchId`)·훅·타입은 이미 있었는데 이 화면이 없어서
 * 아무도 부르지 않는 상태였다 — 목록에서 행을 눌러도 갈 곳이 없었다.
 *
 * 상태 변경은 목록 화면이 계속 담당한다: 사유 입력 모달과 뮤테이션이 거기 있고, 같은 액션을
 * 두 곳에 두면 M4 에서 정리한 '이중 편집 진입점'을 다시 만드는 셈이다.
 */

function BackLink() {
  return (
    <Link
      href="/admin/matches"
      className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-4 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      목록
    </Link>
  );
}

export default function AdminMatchDetailPage() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;
  const { data: match, isPending, isError, error, refetch } = useV1AdminMatch(matchId);

  if (isPending) {
    return <AdminTableSkeleton rows={6} />;
  }

  if (isError || !match) {
    return (
      <>
        <AdminPageHeader eyebrow="플랫폼 · 매치" title="매치 상세" action={<BackLink />} />
        <AdminEmpty
          title="매치 정보를 불러오지 못했어요"
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
        eyebrow="플랫폼 · 매치"
        title="매치 상세"
        description={match.title}
        action={<BackLink />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="매치 상세 정보">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                  <Users size={16} aria-hidden="true" />
                  매치
                </div>
                <h2 className="mt-2 break-words text-[22px] font-bold text-[var(--text-strong)]">{match.title}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{match.sportName} · {match.placeName}</p>
              </div>
              <AdminStatusPill status={match.status} />
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <AdminDetailRow label="매치 ID" value={match.matchId} />
              <AdminDetailRow label="종목" value={match.sportName} />
              <AdminDetailRow label="장소" value={match.placeName} />
              <AdminDetailRow label="지역" value={match.regionName} />
              <AdminDetailRow label="시작" value={formatAdminDateTime(match.startAt)} />
              <AdminDetailRow label="신청 마감" value={formatAdminDateTime(match.deadlineAt)} />
              <AdminDetailRow label="호스트" value={match.hostName} />
              <AdminDetailRow label="생성일" value={formatAdminDateTime(match.createdAt)} />
            </dl>
          </article>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5" aria-label="매치 소개">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">소개</h2>
            {match.description?.trim() ? (
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--text-body)]">
                {match.description}
              </p>
            ) : (
              <div className="mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                호스트가 입력한 소개가 없어요.
              </div>
            )}
          </section>
        </section>

        <aside className="flex flex-col gap-4" aria-label="매치 운영 요약">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">운영 요약</h2>
            <dl className="mt-4 grid gap-3">
              <AdminSummaryItem icon={<Users size={16} />} label="참가 인원" value={`${match.participantCount}/${match.maxParticipants}명`} />
              <AdminSummaryItem icon={<UserRound size={16} />} label="신청" value={`${match.applicationCount}건`} />
              <AdminSummaryItem icon={<MapPin size={16} />} label="지역" value={match.regionName} />
              <AdminSummaryItem icon={<CalendarClock size={16} />} label="시작" value={formatAdminDateTime(match.startAt)} />
              <AdminSummaryItem icon={<CalendarClock size={16} />} label="신청 마감" value={formatAdminDateTime(match.deadlineAt)} />
            </dl>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">호스트</h2>
            <dl className="mt-4 grid gap-3">
              <AdminSummaryItem icon={<UserRound size={16} />} label="이름" value={match.hostName} />
            </dl>
            <Link
              href={`/admin/users/${encodeURIComponent(match.hostUserId)}`}
              className="mt-3 inline-flex h-[44px] w-full items-center justify-center rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--blue700)] hover:bg-[var(--blue50)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              호스트 회원 상세 보기
            </Link>
          </section>
        </aside>
      </div>
    </>
  );
}
