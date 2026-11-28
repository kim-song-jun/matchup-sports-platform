'use client';

import { AdminRegistrationGameRosters } from '@/components/game-roster/admin-registration-game-rosters';
import { Button } from '@/components/v1-ui/button';
import { adminLiveBase, resultsHref } from '@/lib/tournament-live-routes';
import type { V1AdminTournamentRegistration } from '@/types/api';
import { ExportAllCsvButton } from './registration-csv';
import { registrationMetaText } from './registration-row-parts';
import { RegistrationRowMenu } from './registration-row-menu';
import type { RegistrationHandlers, RegistrationViewContext } from './registrations-model';

const CONFIRMED_META = ['roster', 'autoConfirmed', 'payment'] as const;

// 2열에서는 한 줄의 마지막 칸이 아래 구분선을 잃고, 홀수 개의 마지막 칸은 오른쪽 구분선을 잃는다.
const ROW_CLASS = [
  'border-b border-[var(--border)] last:border-b-0',
  'lg:odd:border-r lg:[&:last-child:nth-child(odd)]:border-r-0 lg:[&:nth-last-child(2):nth-child(odd)]:border-b-0',
].join(' ');

/** 확정된 팀 — 줄마다 명단 보기 하나와 ⋯ 만 둔다. 정원을 알면 정원 막대를 함께 보인다. */
export function RegistrationsConfirmedSection({
  rows,
  teamCapacity,
  tournamentId,
  ctx,
  handlers,
  expandedGameRostersId,
  onGameRostersDirtyChange,
}: {
  rows: readonly V1AdminTournamentRegistration[];
  /** 정원(팀 수). 리그처럼 정원이 없거나 아직 모르면 undefined. */
  teamCapacity: number | undefined;
  tournamentId: string;
  ctx: RegistrationViewContext;
  handlers: RegistrationHandlers;
  expandedGameRostersId: string | null;
  onGameRostersDirtyChange: (dirty: boolean) => void;
}) {
  const count = rows.length;
  const capacity = teamCapacity !== undefined && teamCapacity > 0 ? teamCapacity : null;
  const full = capacity !== null && count >= capacity;

  return (
    <section aria-labelledby={`confirmed-${tournamentId}`} className="flex flex-col gap-2.5">
      <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2
            id={`confirmed-${tournamentId}`}
            className="m-0 flex items-center gap-2 text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]"
          >
            확정 팀
            <span className="tm-badge tm-badge-green">{capacity !== null ? `${count} / ${capacity}팀` : `${count}팀`}</span>
          </h2>
          {full ? <span className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">정원이 다 찼어요</span> : null}
        </div>
        <ExportAllCsvButton tournamentId={tournamentId} showToast={ctx.showToast} />
      </div>
      {capacity !== null ? (
        <div
          role="img"
          aria-label={`정원 ${capacity}팀 중 ${count}팀 확정`}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-soft)]"
        >
          <span
            className="block h-full bg-[var(--green500)]"
            style={{ width: `${Math.min(100, (count / capacity) * 100)}%` }}
          />
        </div>
      ) : null}
      {count === 0 ? (
        <p className="m-0 flex min-h-[52px] items-center rounded-[var(--radius-container)] border border-dashed border-[var(--border-strong)] px-4 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
          아직 확정된 팀이 없어요
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 overflow-hidden rounded-[var(--radius-container)] border border-[var(--border)] bg-[var(--card-surface)] p-0 lg:grid-cols-2">
          {rows.map((row) => {
            const expanded = expandedGameRostersId === row.id;
            const teamName = row.teamName ?? row.teamId;
            return (
              <li key={row.id} className={`${ROW_CLASS}${expanded ? ' col-span-full' : ''}`}>
                <div className="flex min-h-[60px] items-center gap-1.5 py-2 pl-4 pr-1">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[length:var(--font-size-body)] font-semibold text-[var(--text-strong)]">
                      {teamName}
                    </span>
                    <p className="m-0 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                      {registrationMetaText(row, CONFIRMED_META)}
                      {row.rosterLockedAt ? (
                        <span className="tm-badge tm-badge-blue">잠김</span>
                      ) : (
                        <span className="tm-badge tm-badge-grey">잠금 전</span>
                      )}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handlers.onViewRoster(row)}>
                    명단 보기
                  </Button>
                  <RegistrationRowMenu registration={row} ctx={ctx} handlers={handlers} gameRostersOpen={expanded} />
                </div>
                {expanded ? (
                  <div className="border-t border-[var(--border)] px-4 py-4">
                    <AdminRegistrationGameRosters
                      tournamentId={tournamentId}
                      registrationId={row.id}
                      teamName={teamName}
                      correctionHref={resultsHref(adminLiveBase(tournamentId))}
                      onDirtyChange={onGameRostersDirtyChange}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
