'use client';

import { AdminToasts, useAdminToast } from '@/components/admin';
import { RegistrationsTab } from '@/app/admin/tournaments/[id]/registrations-tab';
import { useV1AdminLeagueMatch } from '@/hooks/use-v1-api';
import { describeLeagueRegistrationWindow } from '@/lib/league-registration-copy';
import { deriveRegistrationSetupSteps } from '@/lib/league-registration-setup';
import { leagueLifecycleLabel } from '@/lib/v1-status-labels';
import { LeagueFeeCard } from './league-fee-card';

/**
 * 리그 참가 신청 관리 — 신청 준비 순서 · 참가비 · 접수 상태 · 신청 목록.
 *
 * 접수를 여닫는 버튼은 대회 어드민처럼 리그 상단('접수 시작하기 / 접수 마감하기')에 있다(2026-10-27
 * 사용자 선택). 이 화면은 지금 상태와 그 이유만 보여 준다.
 *
 * 목록은 대회의 `RegistrationsTab` 을 그대로 쓴다 — 어드민 신청 API 는 리그도 받는다(`ALL_COMPETITION_KINDS`).
 * 리그 대진 화면(`league-match-fixtures-client.tsx`)에 넣지 않는 이유: 그 화면은 이미 크고, 이 목록은
 * 훅을 여덟 개 넘게 써서 인라인으로 넣으면 그 화면의 테스트가 전부 그 훅을 목킹해야 한다.
 */
export default function LeagueRegistrationsClient({ leagueId }: { leagueId: string }) {
  const { toasts, showToast } = useAdminToast();
  const { data: league } = useV1AdminLeagueMatch(leagueId);
  const registrationOpen = league?.registrationOpen ?? false;

  const steps = league
    ? deriveRegistrationSetupSteps({
        entryFeeConfigured: league.entryFeeConfiguredAt !== null,
        registrationOpen,
        activeRegistrationCount: league.activeRegistrationCount,
      })
    : null;

  return (
    <div className="pb-12">
      {steps ? (
        <ol aria-label="신청 준비 순서" className="mb-4 flex list-none flex-wrap gap-2 p-0">
          {steps.map((step) => (
            <li key={step.label} className={`tm-badge tm-badge-${step.tone}`}>
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}

      {league ? <LeagueFeeCard league={league} leagueId={leagueId} /> : null}

      {league ? (
        <section aria-label="접수 상태" className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[var(--text-strong)]">접수 상태</p>
            <span className={`tm-badge ${registrationOpen ? 'tm-badge-blue' : 'tm-badge-grey'}`}>
              {registrationOpen ? '신청 받는 중' : leagueLifecycleLabel(league.lifecycleStatus ?? '')}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {describeLeagueRegistrationWindow({
              status: league.lifecycleStatus,
              registrationOpen,
              registrationDeadlineAt: league.registrationDeadlineAt,
            })}
          </p>
        </section>
      ) : null}

      {/* `requireCancelReason` — 정규 리그는 거부 사유가 필수다(D9). 서버가
          `LEAGUE_CANCEL_REASON_REQUIRED` 로 막는데 화면이 사유를 안 받아서, 그동안
          **어드민이 리그 신청을 거부할 방법이 아예 없었다.** 대회 화면은 이 값을 안 넘겨
          기존 계약(선택)이 그대로 유지된다. */}
      <RegistrationsTab tournamentId={leagueId} showToast={showToast} canWrite requireCancelReason isFreeEntry={league?.entryFee === 0} />
      <AdminToasts toasts={toasts} />
    </div>
  );
}
