'use client';

import { useState } from 'react';
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
import {
  TournamentStandingsTable,
  type TournamentStandingsRow,
} from '@/components/tournaments/tournament-standings-table';
import {
  partitionTournamentSections,
  isGroupStageComplete,
  allGroupPhasesComplete,
} from '@/app/tournaments/[id]/tournament-detail-client';
import { usePublicTournamentSchedule } from '@/components/public-game-records/use-public-game-records';
import { ScheduleContent } from '@/components/public-game-records/schedule-content';
import type {
  V1TournamentDetail,
  V1TournamentFixture,
  V1TournamentGroup,
  V1TournamentStanding,
} from '@/types/api';

/* ── 리그 / 조별 순위표 ── */

/** V1TournamentStanding(대회 상세 API) → 공용 순위표 행. registrationId를 key로 쓴다. */
function toStandingsRows(standings: readonly V1TournamentStanding[]): TournamentStandingsRow[] {
  return standings.map((s) => ({
    key: s.registrationId,
    teamId: s.teamId,
    teamName: s.teamName,
    teamLogoUrl: s.teamLogoUrl,
    position: s.position,
    points: s.points,
    goalsFor: s.goalsFor,
    goalsAgainst: s.goalsAgainst,
  }));
}

/**
 * §B-7 핵심 — 진출 배지는 그 조의 조별리그가 실제로 끝난(모든 픽스처가 completed
 * 또는 cancelled) 뒤에만 보여준다. 예전엔 group.advanceCount만 있으면 1경기만 끝나도
 * "상위 N팀 진출" 배지·순위표 강조가 확정처럼 떴다 — 오너 지적: "바로 진출 그게
 * 아니라 실제 조별리그가 다 끝나야 나오게끔". 미완료면 배지 대신 정직한 안내
 * ("조별리그가 끝나면 진출 팀이 정해져요")를 보여주고, advance 자체를 null로 낮춰
 * 아래 순위표 하이라이트(tm-standings-row-highlight)·StandingRankBadge의 승격 강조도
 * 같은 기준으로 자동 꺼지게 한다(별도 분기 없이 하나의 변수로 gate).
 */
function GroupStandingsSection({ group, fixtures }: { group: V1TournamentGroup; fixtures: V1TournamentFixture[] }) {
  const stageComplete = isGroupStageComplete(group.id, fixtures);
  const advance = stageComplete ? group.advanceCount : null;

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
        ) : group.advanceCount !== null ? (
          <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-caption)', textTransform: 'none', letterSpacing: 'normal' }}>
            조별리그가 끝나면 진출 팀이 정해져요
          </span>
        ) : null}
      </div>

      <TournamentStandingsTable
        rows={toStandingsRows(group.standings)}
        advance={advance}
        ariaLabel={`${group.name} 순위표`}
      />
    </section>
  );
}

/* ── 리그 최종 순위표 (리그 포맷) ── */
function LeagueStandingsSection({ standings }: { standings: V1TournamentStanding[] }) {
  return (
    <section aria-label="리그 순위" style={{ marginBottom: 16 }}>
      <TournamentStandingsTable rows={toStandingsRows(standings)} advance={null} ariaLabel="리그 순위표" />
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

/**
 * §B-6 — 이 화면에서 경기 일정도 볼 수 있게 한다. 탭으로 나눈 이유: "순위·대진표"와
 * "경기 일정"은 둘 다 화면 하나를 다 채울 만큼 정보량이 많아(특히 조별리그 대회는
 * 이미 6:4 그리드로 꽉 참) 같은 화면에 나란히 얹으면 세로로 매우 길어진다. 섹션
 * 대신 탭을 골라 스크롤 깊이를 유지했다. 일정 목록 자체는 새로 만들지 않고 기존
 * `schedule-content.tsx`의 `ScheduleContent`를 그대로 재사용한다(복제 금지 지침).
 */
function BracketScheduleTab({ tournamentId }: { tournamentId: string }) {
  // schedule-page-client.tsx와 동일한 데이터 배선(usePublicTournamentSchedule 페이지
  // 합치기 + 로딩/에러 분기) — AppChrome 래핑만 없는 얇은 버전이라 별도 훅으로
  // 추출하지 않았다(두 곳뿐이라 공용 추상화를 새로 만드는 게 오히려 과설계).
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicTournamentSchedule(tournamentId);

  if (isLoading) {
    return (
      <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="tm-skeleton" style={{ height: 120, borderRadius: 12 }} />
        <div className="tm-skeleton" style={{ height: 220, borderRadius: 12 }} />
      </div>
    );
  }

  const firstPage = data?.pages[0];
  if (isError || !firstPage) {
    const msg = extractErrorMessage(error, '경기 일정을 불러오지 못했어요.');
    return (
      <div style={{ padding: '40px 20px' }}>
        <ErrorState message={msg} onRetry={() => void refetch()} />
      </div>
    );
  }

  const combined = { ...firstPage, items: data.pages.flatMap((page) => page.items) };

  return (
    <ScheduleContent
      tournamentId={tournamentId}
      data={combined}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => void fetchNextPage()}
    />
  );
}

/* ── 메인 콘텐츠 ── */
export function BracketPageContent({ tournament }: { tournament: V1TournamentDetail }) {
  const { format, fixtures, groups } = tournament;
  const stages = buildTournamentStages(tournament);
  const [activeTab, setActiveTab] = useState<'standings' | 'schedule'>('standings');

  const { groupPhaseGroups, knockoutFixtures, hasGroupStandings, hasKnockoutFixtures } =
    partitionTournamentSections(format, fixtures, groups);

  // §B-8 — 결선 대진표는 조별리그가 실제로 끝난 뒤에만 보여준다. knockout 포맷은
  // 애초에 조별리그가 없는 대회라(오너 지시: "knockout 형식은 처음부터 보여야
  // 한다") 이 게이트를 적용하지 않고 hasKnockoutFixtures만으로 판단한다.
  const groupStageDone = format === 'knockout' ? true : allGroupPhasesComplete(groups, fixtures);
  const showBracket = hasKnockoutFixtures && groupStageDone;

  // 리그 포맷: 모든 그룹의 standings를 합산
  const allLeagueStandings = groups
    .flatMap((g) => g.standings)
    .filter((s, i, arr) => arr.findIndex((x) => x.registrationId === s.registrationId) === i)
    .sort((a, b) => a.position - b.position);

  return (
    <div className="tm-tourn-sub-page" style={{ paddingBottom: 40 }}>
      <header className="tm-bracket-page-intro">
        <div>
          <span className="tm-bracket-page-eyebrow">순위와 대진표</span>
          <h1>{tournament.title}</h1>
          <p>조별 순위와 결선 진행 상황을 단계별로 확인하세요.</p>
        </div>
        <span className="tm-bracket-page-format">
          {format === 'league' ? '리그' : format === 'knockout' ? '토너먼트' : '조별리그 + 토너먼트'}
        </span>
      </header>
      {/* 진행 단계 */}
      <div className="tm-tourn-sub-header tm-bracket-page-stepper">
        {stages.length > 0 && (
          <div style={{ borderBottom: '1px solid var(--grey100)' }}>
            <TournamentProgressStepper stages={stages} />
          </div>
        )}
      </div>

      {/* 순위·대진표 / 경기 일정 탭 — team-schedules-page.tsx와 동일한 role=tablist +
          tm-btn 토글 패턴(이 저장소의 기존 탭 관례)을 그대로 따른다. */}
      <div role="tablist" aria-label="보기 방식" style={{ display: 'flex', gap: 8, padding: '16px 20px 0' }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'standings'}
          className={`tm-btn tm-btn-sm ${activeTab === 'standings' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
          onClick={() => setActiveTab('standings')}
        >
          순위 · 대진표
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'schedule'}
          className={`tm-btn tm-btn-sm ${activeTab === 'schedule' ? 'tm-btn-primary' : 'tm-btn-neutral'}`}
          onClick={() => setActiveTab('schedule')}
        >
          경기 일정
        </button>
      </div>

      {activeTab === 'schedule' ? (
        <BracketScheduleTab tournamentId={tournament.id} />
      ) : (
        <>
          {/* 2열 그리드: 좌=순위표 / 우=대진표 (데스크탑) — 탭 전환용 조건 안이지만
              활성 탭일 때만 그리드를 그린다. 아래 흐름 네비게이터(§FlowNav)는 탭과
              무관한 페이지 레벨 이동이라 이 분기 밖(항상)으로 옮겼다. */}
          <div className={`tm-tourn-sub-grid tm-bracket-page-grid ${format === 'group_knockout' ? 'tm-tourn-sub-grid-6040' : 'tm-tourn-sub-grid-2col'}`}>
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
                    <GroupStandingsSection key={g.id} group={g} fixtures={fixtures} />
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
                  {showBracket ? (
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
        </>
      )}

      {/* 이전/다음 흐름 네비게이터 — 탭과 무관하게 항상 노출(페이지 레벨 이동) */}
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
  // §B-9 — 이 화면(순위·대진표)은 useV1Tournament를 쓰는데 그 훅은 기본적으로
  // 폴링하지 않는다. use-public-game-records.ts의 공개 일정 폴링(LIVE 픽스처가 있을
  // 때만 8초)과 같은 부하 모델을 이 훅에도 opt-in으로 적용했다(hooks/use-v1-api.ts
  // 참고) — "순위 · 대진표" 탭(useV1Tournament 소비)도 "경기 일정" 탭
  // (usePublicTournamentSchedule, 자체적으로 이미 이 규칙을 따름)과 동일하게 LIVE
  // 경기가 있을 때만 갱신된다.
  const { data, isLoading, isError, error, refetch } = useV1Tournament(tournamentId, { livePolling: true });

  if (isLoading) {
    return (
      <AppChrome title="순위·브래킷" backHref={`/tournaments/${tournamentId}`} activeTab="tournaments" desktopHead>
        <BracketPageSkeleton />
      </AppChrome>
    );
  }

  if (isError || !data) {
    const msg = extractErrorMessage(error, '대회 정보를 불러오지 못했어요.');
    return (
      <AppChrome title="순위·브래킷" backHref={`/tournaments/${tournamentId}`} activeTab="tournaments" desktopHead>
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
      activeTab="tournaments"
      desktopHead
    >
      <BracketPageContent tournament={data} />
    </AppChrome>
  );
}
