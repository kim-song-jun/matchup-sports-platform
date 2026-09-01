'use client';

import Link from 'next/link';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { useV1MyLeagues } from '@/hooks/use-v1-api';
import { getSportAccent } from '@/lib/v1-sport-accent';
import { formatTournamentDateRangeShort, formatTournamentDateTimeShort } from '@/lib/date-utils';
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
 *
 * Task 153 감사(Wave 2, 그룹 C) — 참가 사실만 보여주고 "우리 팀 몇 등?" / "다음 경기 언제?"가
 * 없어 팀장이 매번 리그 상세까지 들어가야 했다. `myTeams[].standing` / `nextFixture` 를
 * 카드에 바로 노출해 이 화면이 요약 대시보드로 기능하게 한다.
 */
export function MyLeaguesPageClient() {
  const query = useV1MyLeagues({ enabled: true });
  const items = query.data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 tm-content-enter">
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
            <div className="tm-skeleton" style={{ height: 76, borderRadius: 'var(--radius-control)', opacity: 1 }} />
            <div className="tm-skeleton" style={{ height: 76, borderRadius: 'var(--radius-control)', opacity: 0.6 }} />
          </div>
        ) : query.isError ? (
          <ErrorState
            message={extractErrorMessage(query.error, '내 리그를 불러오지 못했어요.')}
            onRetry={() => void query.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title="참가 중인 리그가 없어요"
            sub="리그 참가는 운영자가 지정해요. 정규 리그 찾기에서 어떤 리그가 열리는지 볼 수 있어요."
          />
        ) : (
          <ul className="space-y-2" role="list" aria-label="내 리그 목록">
            {items.map((item) => {
              const stateMeta = LEAGUE_STATE_META[item.state];
              const accent = getSportAccent(item.sport.code);
              return (
                <li
                  key={item.leagueId}
                  className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-surface)] text-sm"
                >
                  <Link
                    href={`/league-matches/${item.leagueId}`}
                    className="tm-pressable tm-list-row-interactive flex min-h-[44px] flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
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
                      {item.seriesTitle != null && (
                        <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                          {item.seriesTitle}
                          {item.seasonNo != null && ` ${item.seasonNo}시즌`}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)] sm:text-sm">
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            style={{ width: 6, height: 6, borderRadius: 'var(--radius-circle)', background: accent.dot }}
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

                  {/* 팀별 순위·다음 경기 — 카드 전체를 감싼 위 Link 바깥에 둔다. 다음 경기
                      칸 자체가 팀매치 상세로 가는 별도 링크라 <a> 안에 <a>를 중첩할 수
                      없기 때문이다(HTML 무효 + 클릭 이벤트 충돌). 한 사용자가 같은
                      리그에 팀을 둘 이상 두는 경우(같은 리그에 소속된 여러 팀)를 대비해
                      팀별로 행을 나누고 이름에 truncate 를 쓰지 않는다 — 접기(collapse)
                      UI 는 실측상 팀 수가 보통 1~2개뿐이라 과설계라 넣지 않았고, 이름은
                      항상 노출해 "어느 팀이 뛰는지"가 줄바꿈되더라도 잘리지 않게 한다. */}
                  <div className="flex flex-col gap-2 border-t border-[var(--border)] px-3 py-2">
                    {item.myTeams.map((team) => (
                      <div
                        key={team.teamId}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm"
                      >
                        <span className="font-medium text-[var(--text-strong)]">{team.name}</span>
                        {team.standing ? (
                          <>
                            <span className="tm-badge tm-badge-sm tm-badge-grey">
                              {team.standing.position}위 · {team.standing.points}점
                            </span>
                            <span className="text-[var(--text-muted)]">
                              {team.standing.wins}승 {team.standing.draws}무 {team.standing.losses}패
                            </span>
                          </>
                        ) : (
                          // draft 리그(대진 없음)는 아직 순위가 계산되지 않은 게 정상이다 —
                          // 0등처럼 의미 없는 값을 지어내지 않고 상태를 그대로 말한다.
                          <span className="text-[var(--text-muted)]">순위 준비 중</span>
                        )}
                        {team.nextFixture != null && (
                          <Link
                            // 리그 대진 클릭의 착지는 리그 경기 상세다 — /team-matches/:id 로 보내도
                            // 서버가 같은 곳으로 리다이렉트하지만, 한 번의 왕복을 아끼려 직접 잇는다.
                            href={`/league-matches/${item.leagueId}/fixtures/${team.nextFixture.teamMatchId}`}
                            className="tm-pressable tm-list-row-interactive inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 font-medium text-[var(--blue500)]"
                            aria-label={`${team.name} 다음 경기 상세로 이동`}
                          >
                            다음 경기 {formatTournamentDateTimeShort(team.nextFixture.startAt)}
                            {team.nextFixture.opponentTeamName != null
                              ? ` · vs ${team.nextFixture.opponentTeamName}`
                              : ' · 상대팀 미정'}
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
