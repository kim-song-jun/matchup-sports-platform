'use client';

import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useV1MyLeagues } from '@/hooks/use-v1-api';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { formatTournamentDateRangeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { LEAGUE_STATE_META } from '@/lib/league-state-meta';


/**
 * R4 — 마이 화면 "내 리그".
 *
 * Task 152 의 D-2 는 "참가팀은 운영자가 지정한다"를 확정하면서, 그 대가인 "팀장이 자기 팀의
 * 리그 참가를 인지할 계기가 없다"를 **노출로 푼다**고 했다. 그 노출이 그동안 팀 상세 한 곳뿐이었고
 * (마이 화면 미구현), 그마저도 팀매치에서 리그를 역산해 **대진이 생기기 전에는 아무것도 뜨지
 * 않았다.** 이 화면은 참가 테이블(`V1LeagueTeam`)을 직접 읽는 `/league-matches/me` 를 쓰므로
 * 운영자가 팀을 넣은 그 순간부터 보인다.
 */
export function MyLeaguesPageClient() {
  const query = useV1MyLeagues({ enabled: true });
  const items = query.data?.items ?? [];

  return (
    <AppChrome title="내 리그" activeTab="my" backHref="/my">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="tm-my-desktop-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/my" aria-label="마이페이지로 돌아가기">
            뒤로
          </Link>
        </div>
        <h1 className="text-xl font-bold text-[var(--text-strong)]">내 리그</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">내가 속한 팀이 참가 중인 리그예요.</p>

        <div className="mt-4">
          {query.isLoading ? (
            <div aria-busy="true" aria-label="내 리그 불러오는 중" className="space-y-2">
              <div className="tm-skeleton" style={{ height: 76, borderRadius: 12, opacity: 1 }} />
              <div className="tm-skeleton" style={{ height: 76, borderRadius: 12, opacity: 0.6 }} />
            </div>
          ) : query.isError ? (
            <ErrorState
              message={extractErrorMessage(query.error, '내 리그를 불러오지 못했어요.')}
              onRetry={() => void query.refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              title="참가 중인 리그가 없어요"
              sub="리그 참가는 운영자가 지정해요. 리그전 찾기에서 어떤 리그가 열리는지 볼 수 있어요."
            />
          ) : (
            <ul className="space-y-2" role="list" aria-label="내 리그 목록">
              {items.map((item) => {
                const stateMeta = LEAGUE_STATE_META[item.state];
                const accent = getSportAccent(item.sport.code);
                return (
                  <li key={item.leagueId}>
                    <Link
                      href={`/league-matches/${item.leagueId}`}
                      className="tm-pressable tm-list-row-interactive flex min-h-[44px] flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                      aria-label={`${item.title} 상세로 이동`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[var(--text-strong)]">{item.title}</span>
                          {item.tierLabel != null && (
                            <span className="tm-badge tm-badge-sm tm-badge-blue">{item.tierLabel}</span>
                          )}
                          <span className={`tm-badge tm-badge-sm ${stateMeta.badgeClass}`}>{stateMeta.label}</span>
                        </div>
                        {/* 어느 팀으로 참가 중인지가 이 화면의 핵심 정보다 — 사용자가 두 팀에
                            속해 있으면 "내 어느 팀이 이 리그에 있나"가 바로 답이 돼야 한다. */}
                        <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                          {item.myTeams.map((team) => team.name).join(' · ')}
                          {item.seriesTitle != null && ` · ${item.seriesTitle}`}
                          {item.seasonNo != null && ` ${item.seasonNo}시즌`}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)] sm:text-sm">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              aria-hidden="true"
                              style={{ width: 6, height: 6, borderRadius: '50%', background: accent.dot }}
                            />
                            {accent.label}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{item.region.name}</span>
                          <span aria-hidden="true">·</span>
                          <span>{formatTournamentDateRangeShort(item.startsOn, item.endsOn) ?? '일정 미정'}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-xs text-[var(--text-muted)] sm:text-sm">
                        {item.teamCount}팀 참가
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </AppChrome>
  );
}
