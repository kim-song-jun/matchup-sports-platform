'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, Calendar, MapPin, Shield, Trophy, Users } from 'lucide-react';
import {
  AdminDetailRow,
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
  AdminSummaryItem,
  AdminTableSkeleton,
} from '@/components/admin';
import { useV1AdminTeam } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1AdminTeamDetail } from '@/types/api';

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

function formatScore(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function BackLink() {
  return (
    <Link
      href="/admin/teams"
      className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-4 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      목록
    </Link>
  );
}

function RecentTeamMatches({ team }: { team: V1AdminTeamDetail }) {
  const matches = team.recentHostedTeamMatches ?? [];

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5" aria-label="최근 주최 팀매치">
      <h2 className="text-[17px] font-bold text-[var(--text-strong)]">최근 주최 팀매치</h2>
      {matches.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.teamMatchId} className="rounded-xl bg-[var(--surface-soft)] px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-[var(--text-strong)]">{match.title}</p>
                  <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">{formatDateTime(match.startAt)}</p>
                </div>
                <AdminStatusPill status={match.status} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
          최근 주최한 팀매치가 없어요.
        </div>
      )}
    </section>
  );
}

const MEMBER_ROLE_LABEL: Record<V1AdminTeamDetail['members'][number]['role'], string> = {
  owner: '팀장',
  manager: '운영진',
  member: '멤버',
};

function TeamMembers({ team }: { team: V1AdminTeamDetail }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5" aria-label="팀원 목록">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[17px] font-bold text-[var(--text-strong)]">팀원</h2>
        <span className="text-sm font-semibold tabular-nums text-[var(--text-muted)]">{team.members.length}명</span>
      </div>
      {team.members.length > 0 ? (
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {team.members.map((member) => (
            <li key={member.membershipId} className="min-w-0 rounded-xl bg-[var(--surface-soft)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/admin/users/${member.userId}`} className="break-words text-sm font-bold text-[var(--text-strong)] hover:text-[var(--blue700)]">
                    {member.name ?? member.nickname ?? member.email ?? member.userId}
                  </Link>
                  {member.name && member.nickname ? <p className="mt-1 text-xs text-[var(--text-muted)]">{member.nickname}</p> : null}
                </div>
                <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--card-surface)] px-2 py-1 text-xs font-semibold text-[var(--text-muted)]">
                  {MEMBER_ROLE_LABEL[member.role]}
                </span>
              </div>
              <dl className="mt-3 grid gap-1.5 text-xs">
                <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-400">이메일</dt><dd className="min-w-0 break-all text-[var(--text-body)]">{member.email ?? '미등록'}</dd></div>
                <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-400">전화번호</dt><dd className="min-w-0 break-all text-[var(--text-body)]">{member.phone ?? '미등록'}</dd></div>
                <div className="flex gap-2"><dt className="w-14 shrink-0 text-gray-400">가입일</dt><dd className="min-w-0 text-[var(--text-body)]">{formatDateTime(member.joinedAt)}</dd></div>
              </dl>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">활성 팀원이 없어요.</div>
      )}
    </section>
  );
}

export default function AdminTeamDetailPage() {
  const params = useParams<{ id: string }>();
  const teamId = params.id;
  const { data: team, isPending, isError, error, refetch } = useV1AdminTeam(teamId);

  if (isPending) {
    return <AdminTableSkeleton rows={6} />;
  }

  if (isError || !team) {
    return (
      <>
        <AdminPageHeader eyebrow="플랫폼 · 팀" title="팀 상세" action={<BackLink />} />
        <AdminEmpty
          title="팀 정보를 불러오지 못했어요"
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

  const trust = team.trustScore;

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼 · 팀"
        title="팀 상세"
        description={team.name}
        action={<BackLink />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="팀 상세 정보">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                  <Users size={16} aria-hidden="true" />
                  팀
                </div>
                <h2 className="mt-2 break-words text-[22px] font-bold text-[var(--text-strong)]">{team.name}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{team.sportName}</p>
              </div>
              <AdminStatusPill status={team.status} />
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <AdminDetailRow label="팀 ID" value={team.teamId} />
              <AdminDetailRow label="종목" value={team.sportName} />
              <AdminDetailRow label="지역" value={team.regionName} />
              <AdminDetailRow label="상태" value={team.status} />
              <AdminDetailRow label="팀장" value={team.ownerName} />
              <AdminDetailRow label="팀장 ID" value={team.ownerUserId} />
              <AdminDetailRow label="멤버 수" value={team.memberCount} />
              <AdminDetailRow label="매니저 수" value={team.managerCount} />
              <AdminDetailRow label="생성일" value={formatDateTime(team.createdAt)} />
            </dl>
          </article>

          <TeamMembers team={team} />
          <RecentTeamMatches team={team} />
        </section>

        <aside className="flex flex-col gap-4" aria-label="팀 운영 요약">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">운영 요약</h2>
            <dl className="mt-4 grid gap-3">
              <AdminSummaryItem icon={<Users size={16} />} label="전체 멤버" value={team.memberCount} />
              <AdminSummaryItem icon={<Shield size={16} />} label="매니저" value={team.managerCount} />
              <AdminSummaryItem icon={<Trophy size={16} />} label="최근 주최 팀매치" value={team.recentHostedTeamMatches.length} />
              <AdminSummaryItem icon={<MapPin size={16} />} label="지역" value={team.regionName} />
              <AdminSummaryItem icon={<Calendar size={16} />} label="생성일" value={formatDateTime(team.createdAt)} />
            </dl>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
            <h2 className="text-[17px] font-bold text-[var(--text-strong)]">신뢰 정보</h2>
            {trust ? (
              <dl className="mt-4 grid gap-3">
                <AdminSummaryItem icon={<Shield size={16} />} label="상태" value={trust.trustState} />
                <AdminSummaryItem icon={<Shield size={16} />} label="매너 점수" value={formatScore(trust.mannerScore)} />
                <AdminSummaryItem icon={<Trophy size={16} />} label="반영 경기" value={trust.matchCount} />
                <AdminSummaryItem icon={<Calendar size={16} />} label="계산일" value={formatDateTime(trust.calculatedAt)} />
              </dl>
            ) : (
              <div className="mt-4 rounded-xl bg-[var(--surface-soft)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                아직 산정된 팀 신뢰 정보가 없어요.
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
