'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowLeft, Calendar, MapPin, Shield, Trophy, Users } from 'lucide-react';
import {
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
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

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0 rounded-xl bg-gray-50 px-4 py-3">
      <dt className="text-xs font-semibold text-gray-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-gray-900">{value ?? '-'}</dd>
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3">
      <dt className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-500">
        <span className="shrink-0 text-gray-400" aria-hidden="true">{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="shrink-0 text-sm font-bold tabular-nums text-gray-900">{value}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/admin/teams"
      className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
    >
      <ArrowLeft size={16} aria-hidden="true" />
      목록
    </Link>
  );
}

function RecentTeamMatches({ team }: { team: V1AdminTeamDetail }) {
  const matches = team.recentHostedTeamMatches ?? [];

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5" aria-label="최근 주최 팀매치">
      <h2 className="text-[17px] font-bold text-gray-900">최근 주최 팀매치</h2>
      {matches.length > 0 ? (
        <ol className="mt-4 flex flex-col gap-2">
          {matches.map((match) => (
            <li key={match.teamMatchId} className="rounded-xl bg-gray-50 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-gray-900">{match.title}</p>
                  <p className="mt-1 text-xs font-medium text-gray-500">{formatDateTime(match.startAt)}</p>
                </div>
                <AdminStatusPill status={match.status} />
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-4 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          최근 주최한 팀매치가 없어요.
        </div>
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
        <AdminPageHeader title="팀 상세" action={<BackLink />} />
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
        title="팀 상세"
        description={team.name}
        action={<BackLink />}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="팀 상세 정보">
          <article className="rounded-2xl border border-gray-100 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-500">
                  <Users size={16} aria-hidden="true" />
                  팀
                </div>
                <h2 className="mt-2 break-words text-[22px] font-bold text-gray-900">{team.name}</h2>
                <p className="mt-1 text-sm text-gray-500">{team.sportName}</p>
              </div>
              <AdminStatusPill status={team.status} />
            </div>

            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <DetailRow label="팀 ID" value={team.teamId} />
              <DetailRow label="종목" value={team.sportName} />
              <DetailRow label="지역" value={team.regionName} />
              <DetailRow label="상태" value={team.status} />
              <DetailRow label="팀장" value={team.ownerName} />
              <DetailRow label="팀장 ID" value={team.ownerUserId} />
              <DetailRow label="멤버 수" value={team.memberCount} />
              <DetailRow label="매니저 수" value={team.managerCount} />
              <DetailRow label="생성일" value={formatDateTime(team.createdAt)} />
            </dl>
          </article>

          <RecentTeamMatches team={team} />
        </section>

        <aside className="flex flex-col gap-4" aria-label="팀 운영 요약">
          <section className="rounded-2xl border border-gray-100 bg-white p-4">
            <h2 className="text-[17px] font-bold text-gray-900">운영 요약</h2>
            <dl className="mt-4 grid gap-3">
              <SummaryItem icon={<Users size={16} />} label="전체 멤버" value={team.memberCount} />
              <SummaryItem icon={<Shield size={16} />} label="매니저" value={team.managerCount} />
              <SummaryItem icon={<Trophy size={16} />} label="최근 주최 팀매치" value={team.recentHostedTeamMatches.length} />
              <SummaryItem icon={<MapPin size={16} />} label="지역" value={team.regionName} />
              <SummaryItem icon={<Calendar size={16} />} label="생성일" value={formatDateTime(team.createdAt)} />
            </dl>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4">
            <h2 className="text-[17px] font-bold text-gray-900">신뢰 정보</h2>
            {trust ? (
              <dl className="mt-4 grid gap-3">
                <SummaryItem icon={<Shield size={16} />} label="상태" value={trust.trustState} />
                <SummaryItem icon={<Shield size={16} />} label="매너 점수" value={formatScore(trust.mannerScore)} />
                <SummaryItem icon={<Trophy size={16} />} label="반영 경기" value={trust.matchCount} />
                <SummaryItem icon={<Calendar size={16} />} label="계산일" value={formatDateTime(trust.calculatedAt)} />
              </dl>
            ) : (
              <div className="mt-4 rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
                아직 산정된 팀 신뢰 정보가 없어요.
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
