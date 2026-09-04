'use client';

import Link from 'next/link';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { PageSkeleton } from '@/components/v1-ui/page-skeleton';
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
 *
 * 2026-09-04 감사 — 이 화면만 raw Tailwind 로 짜여 있었고 데스크톱 헤드는 정의되지 않은
 * 클래스(`.tm-my-desktop-head`)를 써서 스타일이 붙지 않았다. 형제 화면들과 같은
 * `tm-my-shell` + `tm-my-settings-desktop` 레시피로 옮기고, 제목·뒤로가기는 셸(route-chrome
 * `desktopHead`)에 맡긴다.
 */
export function MyLeaguesPageClient() {
  const query = useV1MyLeagues({ enabled: true });
  const items = query.data?.items ?? [];

  if (query.isError) {
    return (
      <div className="tm-my-shell">
        <ErrorState
          title="내 리그를 불러오지 못했어요"
          message={extractErrorMessage(query.error, '잠시 후 다시 시도해 주세요.')}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  if (query.isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="tm-my-shell tm-content-enter">
      <div className="tm-my-settings-desktop">
        <p className="tm-text-caption">내가 속한 팀이 참가 중인 리그예요.</p>
        {items.length === 0 ? (
          <EmptyState
            illustration={{ name: 'journey-done' }}
            title="참가 중인 리그가 없어요"
            sub="리그 참가는 운영자가 지정해요. 어떤 리그가 열리는지 먼저 둘러볼 수 있어요."
            cta="정규 리그 둘러보기"
            ctaHref="/tournaments?kind=league"
          />
        ) : (
          <ul className="tm-my-list-stack" role="list" aria-label="내 리그 목록">
            {items.map((item) => {
              const stateMeta = LEAGUE_STATE_META[item.state];
              const accent = getSportAccent(item.sport.code);
              return (
                <li key={item.leagueId} className="tm-card tm-my-league-card">
                  <Link
                    href={`/league-matches/${item.leagueId}`}
                    className="tm-pressable tm-list-row-interactive tm-my-league-head"
                    aria-label={`${item.title} 상세로 이동`}
                  >
                    <div className="tm-my-league-title-line">
                      <span className="tm-text-body-lg">{item.title}</span>
                      {item.tierLabel != null ? <span className="tm-badge tm-badge-sm tm-badge-blue">{item.tierLabel}</span> : null}
                      <span className={`tm-badge tm-badge-sm ${stateMeta.badgeClass}`}>{stateMeta.label}</span>
                    </div>
                    {item.seriesTitle != null ? (
                      <div className="tm-text-caption">
                        {item.seriesTitle}
                        {item.seasonNo != null ? ` ${item.seasonNo}시즌` : ''}
                      </div>
                    ) : null}
                    <div className="tm-text-caption tm-my-league-meta">
                      <span className="tm-my-league-sport">
                        <span aria-hidden="true" className="tm-my-league-dot" style={{ background: accent.dot }} />
                        {accent.label}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{item.region.name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatTournamentDateRangeShort(item.startsOn, item.endsOn) ?? '일정 미정'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.teamCount}팀 참가</span>
                    </div>
                  </Link>

                  {/* 팀별 순위·다음 경기 — 카드 전체를 감싼 위 Link 바깥에 둔다. 다음 경기
                      칸 자체가 리그 경기 상세로 가는 별도 링크라 <a> 안에 <a>를 중첩할 수
                      없기 때문이다(HTML 무효 + 클릭 이벤트 충돌). 한 사용자가 같은
                      리그에 팀을 둘 이상 두는 경우를 대비해 팀별로 행을 나누고 이름에
                      truncate 를 쓰지 않는다. */}
                  <div className="tm-my-league-teams">
                    {item.myTeams.map((team) => (
                      <div key={team.teamId} className="tm-my-league-team-row">
                        <span className="tm-text-label">{team.name}</span>
                        {team.standing ? (
                          <>
                            <span className="tm-badge tm-badge-sm tm-badge-grey">
                              {team.standing.position}위 · {team.standing.points}점
                            </span>
                            <span className="tm-text-caption">
                              {team.standing.wins}승 {team.standing.draws}무 {team.standing.losses}패
                            </span>
                          </>
                        ) : (
                          // draft 리그(대진 없음)는 아직 순위가 계산되지 않은 게 정상이다 —
                          // 0등처럼 의미 없는 값을 지어내지 않고 상태를 그대로 말한다.
                          <span className="tm-text-caption">순위 준비 중</span>
                        )}
                        {team.nextFixture != null ? (
                          <Link
                            // 리그 대진 클릭의 착지는 리그 경기 상세다 — /team-matches/:id 로 보내도
                            // 서버가 같은 곳으로 리다이렉트하지만, 한 번의 왕복을 아끼려 직접 잇는다.
                            href={`/league-matches/${item.leagueId}/fixtures/${team.nextFixture.teamMatchId}`}
                            className="tm-pressable tm-list-row-interactive tm-my-league-next"
                            aria-label={`${team.name} 다음 경기 상세로 이동`}
                          >
                            다음 경기 {formatTournamentDateTimeShort(team.nextFixture.startAt)}
                            {team.nextFixture.opponentTeamName != null
                              ? ` · vs ${team.nextFixture.opponentTeamName}`
                              : ' · 상대팀 미정'}
                          </Link>
                        ) : null}
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
