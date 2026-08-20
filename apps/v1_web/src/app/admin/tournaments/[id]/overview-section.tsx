'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react';
import { AdminKpiCard, AdminKpiGridSkeleton, AdminStatusPill } from '@/components/admin';
import { useV1AdminTournament } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatDate, formatDateRange } from './tournament-admin-shared';
import { useTournamentAdmin } from './tournament-admin-context';
import {
  buildTournamentChecklist,
  resolveNextMilestone,
  type TournamentOverviewCheck,
} from './tournament-overview-model';

/**
 * 대회 상세의 기본 진입 화면(M4-3). 편집은 하지 않는다 — 지금 상태가 어떤지, 무엇이
 * 비어 있는지, 어디로 가야 고치는지만 보여준다. 편집 진입점은 각 섹션이 갖는다.
 */
export function TournamentOverviewSection() {
  const { tournamentId } = useTournamentAdmin();
  const { data: tournament, isPending, isError, error, refetch } = useV1AdminTournament(tournamentId);

  if (isPending) return <AdminKpiGridSkeleton count={3} />;

  if (isError || !tournament) {
    return (
      <div className="p-4 bg-[var(--red50)] border border-[var(--tint-red-border)] rounded-xl flex items-center gap-3">
        <p className="text-sm text-[var(--red700)] flex-1">
          {extractErrorMessage(error, '대회 정보를 불러오지 못했어요.')}
        </p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm text-[var(--red700)] font-semibold underline underline-offset-2 min-h-[44px] px-2 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const now = new Date();
  const milestone = resolveNextMilestone(tournament, now);
  const checks = buildTournamentChecklist(tournament, now);
  const basePath = `/admin/tournaments/${tournamentId}`;
  const counts = tournament.operationCounts;

  return (
    <div className="flex flex-col gap-6">
      {/* 상태 밴드 — 상태 pill 과 "지금 무엇을 기다리는가" 한 줄 */}
      <section
        aria-label="대회 진행 상태"
        className={[
          'rounded-2xl border p-4 md:p-5 flex flex-col gap-2',
          milestone.overdue
            ? 'bg-[var(--tint-orange)] border-[var(--tint-orange-border)]'
            : 'bg-[var(--card-surface)] border-[var(--border)]',
        ].join(' ')}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <AdminStatusPill status={tournament.status} />
          {milestone.overdue && (
            <span className="inline-flex items-center gap-1 text-[length:var(--font-size-caption)] font-bold text-[var(--orange700)]">
              <AlertTriangle size={13} aria-hidden="true" />
              확인 필요
            </span>
          )}
        </div>
        <p className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">
          {milestone.headline}
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-1.5 mt-1">
          <OverviewFact label="경기 일정" value={formatDateRange(tournament.scheduledAt, tournament.scheduledEndAt)} />
          <OverviewFact label="접수 마감" value={formatDate(tournament.registrationDeadlineAt)} />
          <OverviewFact label="명단 마감" value={formatDate(tournament.rosterDeadlineAt)} />
        </dl>
      </section>

      {/* 규모 — 각 숫자에서 그 섹션으로 바로 간다 */}
      <div className="grid grid-cols-3 gap-3">
        <AdminKpiCard
          label="신청 팀"
          value={counts?.registrations ?? tournament.registrationCount}
          sub={`정원 ${tournament.teamCount}팀`}
          href={`${basePath}/registrations`}
          ariaLabel={`신청 팀 ${counts?.registrations ?? tournament.registrationCount}팀, 신청 관리로 이동`}
        />
        <AdminKpiCard
          label="경기"
          value={counts?.fixtures ?? 0}
          href={`${basePath}/bracket`}
          ariaLabel={`경기 ${counts?.fixtures ?? 0}개, 대진 관리로 이동`}
        />
        <AdminKpiCard
          label="공지"
          value={counts?.announcements ?? 0}
          href={`${basePath}/announcements`}
          ariaLabel={`공지 ${counts?.announcements ?? 0}건, 공지로 이동`}
        />
      </div>

      <ChecklistCard checks={checks} basePath={basePath} />

      <Link
        href={`/tournaments/${tournamentId}`}
        className="inline-flex items-center gap-1.5 self-start min-h-[44px] px-3 rounded-xl text-[length:var(--font-size-label)] font-medium text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--tint-blue)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
      >
        참가자에게 보이는 화면 열기
        <ExternalLink size={13} aria-hidden="true" />
      </Link>
    </div>
  );
}

function OverviewFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0.5">
      <dt className="text-[length:var(--font-size-caption)] text-[var(--text-caption)]">{label}</dt>
      <dd className="text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">{value}</dd>
    </div>
  );
}

function ChecklistCard({ checks, basePath }: { checks: TournamentOverviewCheck[]; basePath: string }) {
  if (checks.length === 0) {
    return (
      <div className="flex items-center gap-2.5 p-4 bg-[var(--green50)] border border-green-100 rounded-xl">
        <CheckCircle2 size={18} className="text-green-500 shrink-0" aria-hidden="true" />
        <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
          비어 있는 설정이 없어요.
        </p>
      </div>
    );
  }

  return (
    <section
      aria-label="채워야 할 설정"
      className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)]"
    >
      <h2 className="px-5 py-4 border-b border-[var(--border)] text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">
        채워야 할 설정 {checks.length}건
      </h2>
      <ul>
        {checks.map((check) => (
          <li
            key={check.id}
            className="flex items-center gap-3 px-5 py-3 border-b border-[var(--border)] last:border-b-0"
          >
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-medium text-[var(--text-strong)]">{check.label}</p>
              <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{check.hint}</p>
            </div>
            {check.section && (
              <Link
                href={`${basePath}/${check.section}`}
                aria-label={`${check.label} — ${SECTION_LABEL[check.section]}에서 고치기`}
                className="shrink-0 inline-flex items-center gap-0.5 min-h-[44px] px-2 text-[length:var(--font-size-label)] font-medium text-blue-500 hover:text-[var(--blue700)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
              >
                {SECTION_LABEL[check.section]}
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

const SECTION_LABEL: Record<NonNullable<TournamentOverviewCheck['section']>, string> = {
  info: '대회 정보',
  bracket: '대진 관리',
  announcements: '공지',
  registrations: '신청 관리',
};
