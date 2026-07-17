'use client';

import { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { TournamentFlowNav } from '@/components/tournaments/tournament-flow-nav';
import {
  TournamentProgressStepper,
  buildTournamentStages,
} from '@/components/tournaments/tournament-progress-stepper';
import { TournamentBracket } from '@/components/tournaments/tournament-bracket';
import { partitionTournamentSections } from '@/app/tournaments/[id]/tournament-detail-client';
import type {
  V1TournamentDetail,
  V1TournamentGroup,
  V1TournamentStanding,
} from '@/types/api';

/* ── 리그 / 조별 순위표 ── */

function StandingRankBadge({ pos, advance }: { pos: number; advance: number | null }) {
  const promoted = advance !== null && pos <= advance;
  if (pos === 1) return <span className="tm-standings-rank tm-standings-rank-gold">{pos}</span>;
  if (pos === 2) return <span className="tm-standings-rank tm-standings-rank-silver">{pos}</span>;
  if (pos === 3) return <span className="tm-standings-rank tm-standings-rank-bronze">{pos}</span>;
  return (
    <span
      className="tm-standings-rank"
      style={promoted ? { background: 'var(--blue50)', color: 'var(--blue500)' } : undefined}
    >
      {pos}
    </span>
  );
}

function GoalDiff({ gf, ga }: { gf: number; ga: number }) {
  const diff = gf - ga;
  const color = diff > 0 ? 'var(--blue500)' : diff < 0 ? 'var(--red, #ff4d4f)' : 'var(--text-muted)';
  return (
    <span style={{ color, fontWeight: diff !== 0 ? 700 : 400 }}>
      {diff > 0 ? '+' : ''}{diff}
    </span>
  );
}

function GroupStandingsSection({ group }: { group: V1TournamentGroup }) {
  const sorted = [...group.standings].sort((a, b) => a.position - b.position);
  const advance = group.advanceCount;

  return (
    <section aria-label={`${group.name} 순위`} style={{ marginBottom: 16 }}>
      {/* 조 이름 */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--text-muted)',
          marginBottom: 8,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {group.name}
        {advance !== null ? (
          <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-caption)' }}>
            상위 {advance}팀 진출
          </span>
        ) : null}
      </div>

      <Card pad={0}>
        <div style={{ overflowX: 'auto' }}>
          <table
            className="tm-standings-table"
            aria-label={`${group.name} 순위표`}
            style={{ minWidth: 240 }}
          >
            <thead className="tm-standings-thead">
              <tr>
                <th style={{ width: 36, paddingLeft: 12 }}>#</th>
                <th>팀</th>
                <th className="num" style={{ width: 44 }}>승점</th>
                <th className="num" style={{ width: 44, paddingRight: 12 }}>득실</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length > 0 ? (
                sorted.map((s) => (
                  <tr
                    key={s.registrationId}
                    className={`tm-standings-row${advance !== null && s.position <= advance ? ' tm-standings-row-highlight' : ''}`}
                  >
                    <td style={{ paddingLeft: 12 }}>
                      <StandingRankBadge pos={s.position} advance={advance} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="tm-team-avatar" aria-hidden="true">
                          {s.teamName.charAt(0)}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                          {s.teamName}
                        </span>
                      </div>
                    </td>
                    <td className="num" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-strong)' }}>
                      {s.points}점
                    </td>
                    <td className="num" style={{ paddingRight: 12 }}>
                      <GoalDiff gf={s.goalsFor} ga={s.goalsAgainst} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-caption)', fontSize: 13 }}>
                    순위 집계 전이에요
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

/* ── 리그 최종 순위표 (리그 포맷) ── */
function LeagueStandingsSection({ standings }: { standings: V1TournamentStanding[] }) {
  const sorted = [...standings].sort((a, b) => a.position - b.position);

  return (
    <section aria-label="리그 순위" style={{ marginBottom: 16 }}>
      <Card pad={0}>
        <div style={{ overflowX: 'auto' }}>
          <table
            className="tm-standings-table"
            aria-label="리그 순위표"
            style={{ minWidth: 240 }}
          >
            <thead className="tm-standings-thead">
              <tr>
                <th style={{ width: 36, paddingLeft: 12 }}>#</th>
                <th>팀</th>
                <th className="num" style={{ width: 44 }}>승점</th>
                <th className="num" style={{ width: 44, paddingRight: 12 }}>득실</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length > 0 ? (
                sorted.map((s) => (
                  <tr key={s.registrationId} className="tm-standings-row">
                    <td style={{ paddingLeft: 12 }}>
                      <StandingRankBadge pos={s.position} advance={null} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="tm-team-avatar" aria-hidden="true">
                          {s.teamName.charAt(0)}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                          {s.teamName}
                        </span>
                      </div>
                    </td>
                    <td className="num" style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-strong)' }}>
                      {s.points}점
                    </td>
                    <td className="num" style={{ paddingRight: 12 }}>
                      <GoalDiff gf={s.goalsFor} ga={s.goalsAgainst} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-caption)', fontSize: 13 }}>
                    순위 집계 전이에요
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}

/* ── 빈 브래킷 안내 ── */
function BracketEmpty({ format }: { format: 'knockout' | 'group_knockout' }) {
  const message = format === 'group_knockout'
    ? <>대진표는 조별리그가 끝난 후<br />공개돼요.</>
    : <>대진 편성이 완료되면<br />대진표가 공개돼요.</>;

  return (
    <Card pad={24} style={{ textAlign: 'center', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }} aria-hidden="true"><Trophy size={32} style={{ color: 'var(--grey400)' }} strokeWidth={1.6} /></div>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-caption)', lineHeight: 1.6 }}>
        {message}
      </p>
    </Card>
  );
}

/* ── 메인 콘텐츠 ── */
export function BracketPageContent({ tournament }: { tournament: V1TournamentDetail }) {
  const { format, fixtures, groups } = tournament;
  const stages = buildTournamentStages(tournament);

  const { groupPhaseGroups, knockoutFixtures, hasGroupStandings, hasKnockoutFixtures } =
    partitionTournamentSections(format, fixtures, groups);

  // 리그 포맷: 모든 그룹의 standings를 합산
  const allLeagueStandings = groups
    .flatMap((g) => g.standings)
    .filter((s, i, arr) => arr.findIndex((x) => x.registrationId === s.registrationId) === i)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="tm-tourn-sub-page" style={{ paddingBottom: 40 }}>
      <h1 className="sr-only">{tournament.title} 순위와 대진표</h1>
      {/* 진행 단계 */}
      <div className="tm-tourn-sub-header">
        {stages.length > 0 && (
          <div style={{ borderBottom: '1px solid var(--grey100)' }}>
            <TournamentProgressStepper stages={stages} />
          </div>
        )}
      </div>

      {/* 2열 그리드: 좌=순위표 / 우=대진표 (데스크탑) */}
      <div className={`tm-tourn-sub-grid ${format === 'group_knockout' ? 'tm-tourn-sub-grid-6040' : 'tm-tourn-sub-grid-2col'}`}>
        {/* 좌: 순위표 */}
        <div className="tm-tourn-sub-col" style={{ padding: '20px 20px 0' }}>
          {format === 'league' && (
            <section>
              <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>
                리그 순위
              </h3>
              <LeagueStandingsSection standings={allLeagueStandings} />
            </section>
          )}

          {format === 'group_knockout' && hasGroupStandings && (
            <section>
              <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>
                조별 순위
              </h3>
              {groupPhaseGroups.map((g) => (
                <GroupStandingsSection key={g.id} group={g} />
              ))}
            </section>
          )}

          {format === 'league' && fixtures.length === 0 && (
            <div className="tm-hub-empty">경기 일정이 아직 없어요.</div>
          )}
        </div>

        {/* 우: 대진표 */}
        {(format === 'knockout' || format === 'group_knockout') && (
          <div className="tm-tourn-sub-col" style={{ padding: '20px 20px 0' }}>
            <section>
              <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>
                토너먼트 대진
              </h3>
              {hasKnockoutFixtures ? (
                <div className="tm-bk-wrap">
                  <TournamentBracket
                    fixtures={knockoutFixtures}
                    groups={groups}
                  />
                </div>
              ) : (
                <BracketEmpty format={format} />
              )}
            </section>
          </div>
        )}
      </div>

      {/* 이전/다음 흐름 네비게이터 */}
      <div className="tm-tourn-sub-flownav">
        <TournamentFlowNav
          prev={{ href: `/tournaments/${tournament.id}`, label: '대회 정보' }}
          next={{
            href: `/tournaments/${tournament.id}/results`,
            label: '최종결과',
            enabled: tournament.status === 'completed',
            disabledHint: '대회 종료 후 공개',
          }}
        />
      </div>
    </div>
  );
}

/* ── 스켈레톤 ── */
function BracketPageSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 56, borderRadius: 10 }} />
      <div className="tm-skeleton" style={{ height: 44, borderRadius: 8 }} />
      <div className="tm-skeleton" style={{ height: 200, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 160, borderRadius: 12 }} />
    </div>
  );
}

/* ── 진입점 ── */
export function BracketPageClient({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading, isError, error, refetch } = useV1Tournament(tournamentId);

  if (isLoading) {
    return (
      <AppChrome title="순위·브래킷" backHref={`/tournaments/${tournamentId}`} bottomNav={false} activeTab="tournaments">
        <BracketPageSkeleton />
      </AppChrome>
    );
  }

  if (isError || !data) {
    const msg = extractErrorMessage(error, '대회 정보를 불러오지 못했어요.');
    return (
      <AppChrome title="순위·브래킷" backHref={`/tournaments/${tournamentId}`} bottomNav={false} activeTab="tournaments">
        <div style={{ padding: '40px 20px' }}>
          <ErrorState message={msg} onRetry={() => void refetch()} />
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome
      title="순위·브래킷"
      backHref={`/tournaments/${tournamentId}`}
      bottomNav={false}
      activeTab="tournaments"
    >
      <BracketPageContent tournament={data} />
    </AppChrome>
  );
}
