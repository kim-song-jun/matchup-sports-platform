'use client';

import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { AppChrome } from '@/components/v1-ui/shell';
import { ErrorState } from '@/components/v1-ui/primitives';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatTournamentDateShort, formatTournamentDateTimeShort } from '@/lib/date-utils';
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
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    goalsFor: s.goalsFor,
    goalsAgainst: s.goalsAgainst,
  }));
}

/**
 * 조 순위표 행 — 순위 행이 하나도 없어도 **편성된 팀 전체**를 그린다.
 *
 * `V1TournamentStanding` 행은 첫 결과가 OFFICIAL이 될 때(또는 어드민 재계산 때) 비로소
 * 생긴다(tournament-group-standings.ts). 그래서 경기 기록이 0건인 조는 `group.standings`가
 * 빈 배열이고, 순위표가 "순위 집계 전이에요" 한 줄로 비어 조 편성은 공개됐는데 우리 조에
 * 누가 있는지 볼 수 없었다(#374). 집계 전에는 서버가 이미 내려주는 `group.groupTeams`
 * (sortOrder 순 정렬)를 전 지표 0인 기준선 행으로 대신 쓴다.
 *
 * 순위 숫자는 이때 편성 순서일 뿐이므로, 표가 전부 0이면 TournamentStandingsTable이
 * 메달 색·진출 강조를 스스로 끄고 안내 문구를 붙인다.
 *
 * 집계가 시작되면(standings가 한 행이라도 있으면) 서버 값이 유일한 진실이다 — 부분
 * 병합은 하지 않는다. 재계산은 항상 그 조의 전 팀을 한꺼번에 upsert 하므로
 * (recalculateAndUpsertGroupStandings) "일부만 집계된" 중간 상태가 존재하지 않는다.
 */
function toGroupStandingsRows(group: V1TournamentGroup): TournamentStandingsRow[] {
  if (group.standings.length > 0) return toStandingsRows(group.standings);
  return group.groupTeams.map((team, index) => ({
    key: team.registrationId,
    teamId: team.teamId,
    teamName: team.teamName,
    teamLogoUrl: team.teamLogoUrl,
    position: index + 1,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
  }));
}

/**
 * 순위표에서 팀을 펼쳤을 때 그 행 아래에 붙는 상세 — 그 팀이 이 조에서 치른/치를
 * 경기 목록이다. 오너 지시("클릭했을 때 팀 전적 페이지로 넘어가는 것보다 하단에
 * 상세를 보여주는 게 낫다")대로 화면 전환 없이 순위 맥락을 유지한 채 보여준다.
 *
 * 이미 받아 둔 `fixtures` 만 쓰므로 추가 네트워크 요청이 없다.
 *
 * 매칭은 teamId로 한다. 참가팀 공개 정책 통일(fix/v1-publish) 이후 모집 중엔
 * teamId가 null이라 여러 비공개 팀이 서로 같은 "팀"으로 잘못 묶일 수 있지만,
 * 호출부(TournamentStandingsTable)가 teamName===null(비공개)인 행에는 애초에
 * 펼침 버튼 자체를 렌더하지 않으므로(정적 행으로 대체) 이 컴포넌트는 실제로는
 * teamId가 항상 채워진 상태로만 호출된다. 그래도 그 호출부 불변조건이 나중에
 * 깨지는 경우까지 방어하기 위해 teamId===null이면 매칭을 아예 시도하지 않고
 * "배정된 경기 없음"으로 안전하게 떨어뜨린다(여러 비공개 팀을 서로 같은 팀으로
 * 잘못 묶어 보여주는 것보다, 상세를 못 보여주는 쪽이 훨씬 안전한 실패 모드다).
 */
function TeamFixturesDetail({ teamId, fixtures }: { teamId: string | null; fixtures: V1TournamentFixture[] }) {
  const mine =
    teamId === null
      ? []
      : fixtures
          .filter((f) => f.homeTeamId === teamId || f.awayTeamId === teamId)
          .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));

  if (mine.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-caption)', padding: '8px 0' }}>
        이 조에서 배정된 경기가 아직 없어요.
      </p>
    );
  }

  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, listStyle: 'none', margin: 0, padding: 0 }}>
      {mine.map((f) => {
        const isHome = f.homeTeamId === teamId;
        const opponent = (isHome ? f.awayTeamName : f.homeTeamName) ?? '비공개';
        const scored = f.result ? (isHome ? f.result.homeScore : f.result.awayScore) : null;
        const conceded = f.result ? (isHome ? f.result.awayScore : f.result.homeScore) : null;
        const outcome =
          scored === null || conceded === null ? null : scored > conceded ? '승' : scored < conceded ? '패' : '무';
        return (
          <li
            key={f.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 10,
              background: 'var(--surface-soft)',
              fontSize: 12,
            }}
          >
            <span style={{ color: 'var(--text-caption)', minWidth: 26 }}>{isHome ? '홈' : '원정'}</span>
            <span style={{ color: 'var(--text-strong)', fontWeight: 600, flex: 1, minWidth: 0 }}>{opponent}</span>
            {outcome ? (
              <span className="tab-num" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
                {outcome} {scored}-{conceded}
              </span>
            ) : (
              <span style={{ color: 'var(--text-caption)' }}>
                {formatTournamentDateTimeShort(f.scheduledAt) ?? '시간 미정'}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
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
  /* #381 — 펼침 상세는 "이 조에서 치른 경기"만 보여준다. 예전엔 대회 전체 픽스처를
     팀 id 로만 걸러서, 조별 순위 영역인데도 그 팀의 결선(4강·결승·3·4위전) 경기와
     스코어가 조별 경기와 같은 목록에 섞여 나왔다. 결선 픽스처는 오른쪽 "토너먼트
     대진" 영역(TournamentBracket)이 담당한다. 결선 픽스처는 결선 조(phase
     semi/final/third_place)에 붙거나 groupId 가 null 이므로 이 한 조건으로 전부 빠진다. */
  const groupFixtures = fixtures.filter((f) => f.groupId === group.id);

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
        rows={toGroupStandingsRows(group)}
        advance={advance}
        ariaLabel={`${group.name} 순위표`}
        renderDetail={(row) => <TeamFixturesDetail teamId={row.teamId} fixtures={groupFixtures} />}
      />
    </section>
  );
}

/* ── 리그 최종 순위표 (리그 포맷) ── */
function LeagueStandingsSection({ rows }: { rows: readonly TournamentStandingsRow[] }) {
  return (
    <section aria-label="리그 순위" style={{ marginBottom: 16 }}>
      <TournamentStandingsTable rows={rows} advance={null} ariaLabel="리그 순위표" />
    </section>
  );
}

/**
 * 빈 브래킷 안내 — 문구 정정 + 정보 보강(fix/v1-publish).
 *
 * 문구: 이 상태(showBracket===false)는 대진 "구조" 자체가 아직 없다는 뜻이고, 그건
 * 오직 포맷/조별리그 진행 여부로만 정해진다(isBracketPublished + groupStageDone —
 * 모집 상태와는 독립인 별개 게이트, 이 파일 §B-8 주석 참고) — 그래서 주 문구(sub)는
 * 기존처럼 포맷 기준을 그대로 유지한다("어떤 이유로 없는지" 자체를 모집 상태로
 * 바꿔치기하면, 모집은 끝났는데 조별리그가 안 끝난 대회에서 거짓 안내가 된다).
 *
 * 대신 "모집 마감 후"·"조별리그가 끝난 후"·"대회 종료 후" 세 시점 중 이 화면이
 * 말하지 않던 나머지(모집 마감 시점·현재 확정 팀 수)를 정보 보강으로 덧붙인다
 * (요구사항 3) — 팀명은 없어도 몇 팀이 참가하는지·언제 모집이 마감되는지·대진표
 * 공개가 예약돼 있는지는 항상 정직하게 보여줄 수 있는 정보다. 채울 정보가
 * 없으면(스케줄 미정) 그 줄 자체를 렌더하지 않는다.
 */
function BracketEmpty({
  format,
  status,
  teamCount,
  confirmedCount,
  registrationDeadlineAt,
  bracketPublishScheduledAt,
}: {
  format: 'knockout' | 'group_knockout';
  status: V1TournamentDetail['status'];
  teamCount: number;
  confirmedCount: number;
  registrationDeadlineAt: string | null;
  bracketPublishScheduledAt: string | null;
}) {
  const sub = format === 'group_knockout'
    ? '대진표는 조별리그가 끝난 후 공개돼요.'
    : '대진 편성이 완료되면 대진표가 공개돼요.';

  const isRecruiting = status === 'open';
  const deadlineLabel = isRecruiting ? formatTournamentDateShort(registrationDeadlineAt) : null;
  const publishLabel = formatTournamentDateTimeShort(bracketPublishScheduledAt);

  return (
    <div className="tm-empty-state">
      <div className="tm-empty-icon" aria-hidden="true">
        <Trophy size={32} strokeWidth={1.6} />
      </div>
      <div className="tm-text-body-lg">대진표가 아직 공개되지 않았어요</div>
      <div className="tm-text-label" style={{ color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
        {sub}
      </div>
      {/* 팀명이 아니라 팀 수 — "감출 때 없는 척하지 마라": 이름은 몰라도 몇 팀이
          참가하는지는 정직하게 보여준다. */}
      <div
        style={{
          marginTop: 16,
          padding: '10px 14px',
          borderRadius: 10,
          background: 'var(--surface-soft)',
          fontSize: 13,
          color: 'var(--text-strong)',
          fontWeight: 600,
        }}
      >
        확정 {confirmedCount}/{teamCount}팀
      </div>
      {deadlineLabel ? (
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 8 }}>
          모집 마감 {deadlineLabel}
        </div>
      ) : null}
      {publishLabel ? (
        <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: deadlineLabel ? 2 : 8 }}>
          대진표 공개 예정 {publishLabel}
        </div>
      ) : null}
    </div>
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
      /* 순위표는 옆 탭("순위 · 대진표")이 이미 그린다 — 여기서 또 그리면 탭만 바꿔도
         같은 표가 두 번 나온다(오너 지적: "중복되는 정보도 많고"). */
      showStandings={false}
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

  // 리그 포맷: 모든 그룹의 순위 행을 합산. 집계 전 조는 toGroupStandingsRows가
  // 편성 팀(groupTeams)을 0값 기준선 행으로 대신 내주므로, 경기 0건이어도 참가 팀이
  // 모두 보인다(#374). 중복 제거 키는 등록 단위(row.key = registrationId)로 그대로 유지.
  const allLeagueRows = groups
    .flatMap((g) => toGroupStandingsRows(g))
    .filter((row, index, arr) => arr.findIndex((x) => x.key === row.key) === index)
    .sort((a, b) => a.position - b.position);

  return (
    // §빈 상태 재균형(fix/v1-publish) — 조별리그 미종료 등으로 대진표 우 컬럼이
    // BracketEmpty 하나뿐일 만큼 콘텐츠가 짧으면, .tm-scroll-area(뷰포트 - 상단바 -
    // 하단탭바 높이 고정) 안에서 콘텐츠가 위쪽에만 붙고 나머지가 그냥 빈 배경으로
    // 남아 하단 흐름 네비게이터(TournamentFlowNav)가 탭바 위에 어중간하게 떠 보였다
    // (알파 400px 실측: 마지막 콘텐츠 bottom 961, 탭바 top 1128 — 167px 빈 공간).
    // minHeight:'100%'(부모 .tm-scroll-area가 top/bottom absolute로 확정 높이를
    // 가지므로 퍼센트가 정상 해석됨) + flex column으로 이 페이지를 뷰포트 높이만큼
    // 늘리고, flownav에 marginTop:'auto'를 줘 콘텐츠가 짧을 때도 네비가 항상 탭바
    // 바로 위에 붙게 한다 — 콘텐츠가 뷰포트보다 길면 기존과 동일하게 자연스러운
    // 스크롤 흐름을 그대로 따른다(flex는 늘어나는 방향으로만 작용).
    <div className="tm-tourn-sub-page" style={{ paddingBottom: 40, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
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

      {/* 순위·대진표 / 경기 일정 탭.
          예전엔 파란 채움 버튼 + 회색 버튼 두 개를 나란히 뒀는데, 그러면 "선택된 탭"이
          아니라 "파란 버튼 하나와 회색 버튼 하나"로 읽혀 탭인 줄 모른다(오너 지적:
          "탭인 것처럼 보이지가 않고"). 이 저장소가 이미 쓰는 세그먼트 컨트롤 형태
          (트랙 배경 위에 선택 항목만 떠오르는 .tm-review-tabs 패턴)와 같은 시각 계약을
          쓰되, 이름은 화면에 안 묶이도록 .tm-seg-* 로 일반화했다. */}
      <div style={{ padding: '16px 20px 0' }}>
        <div role="tablist" aria-label="보기 방식" className="tm-seg-tabs" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'standings'}
            data-active={activeTab === 'standings'}
            className="tm-seg-tab"
            onClick={() => setActiveTab('standings')}
          >
            순위 · 대진표
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'schedule'}
            data-active={activeTab === 'schedule'}
            className="tm-seg-tab"
            onClick={() => setActiveTab('schedule')}
          >
            경기 일정
          </button>
        </div>
      </div>

      {/* flex:1 — 위 minHeight:'100%'+flex column과 짝을 이뤄 탭 콘텐츠가 남는 세로
          공간을 채우고, 아래 flownav가 marginTop:'auto'로 항상 바닥에 붙게 한다. */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {activeTab === 'schedule' ? (
        <BracketScheduleTab tournamentId={tournament.id} />
      ) : (
        <>
          {/* 2열 그리드: 좌=순위표 / 우=대진표 (데스크탑) — 탭 전환용 조건 안이지만
              활성 탭일 때만 그리드를 그린다. 아래 흐름 네비게이터(§FlowNav)는 탭과
              무관한 페이지 레벨 이동이라 이 분기 밖(항상)으로 옮겼다. */}
          <div className={`tm-tourn-sub-grid tm-bracket-page-grid ${format === 'group_knockout' ? 'tm-tourn-sub-grid-6040' : 'tm-tourn-sub-grid-2col'} ${format === 'group_knockout' && !showBracket ? 'tm-bracket-page-grid-empty' : ''}`}>
            {/* 좌: 순위표 */}
            <div className="tm-tourn-sub-col" style={{ padding: '20px 20px 0' }}>
              {format === 'league' && (
                <section>
                  <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>
                    리그 순위
                  </h3>
                  <LeagueStandingsSection rows={allLeagueRows} />
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
                    <BracketEmpty
                      format={format}
                      status={tournament.status}
                      teamCount={tournament.teamCount}
                      confirmedCount={tournament.confirmedCount}
                      registrationDeadlineAt={tournament.registrationDeadlineAt}
                      bracketPublishScheduledAt={tournament.bracketPublishScheduledAt}
                    />
                  )}
                </section>
              </div>
            )}
          </div>
        </>
      )}
      </div>

      {/* 이전/다음 흐름 네비게이터 — 탭과 무관하게 항상 노출(페이지 레벨 이동).
          marginTop:'auto' — 위 flex column 래퍼 안에서 콘텐츠가 짧아도 항상 바닥에
          붙는다(§빈 상태 재균형, 이 함수 상단 주석 참고). */}
      <div className="tm-tourn-sub-flownav tm-bracket-page-flownav" style={{ marginTop: 'auto' }}>
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
