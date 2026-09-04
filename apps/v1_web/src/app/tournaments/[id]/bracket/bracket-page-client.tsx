'use client';

import { useState } from 'react';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { useV1MyTournamentFixtures, useV1Tournament } from '@/hooks/use-v1-api';
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
} from '@/app/tournaments/[id]/tournament-detail-client';
import { usePublicTournamentSchedule } from '@/components/public-game-records/use-public-game-records';
// ⚠️ 이 파일에도 동명 지역 함수가 있다(대회 상세 `V1TournamentStanding` 용). 별칭으로 갈라
// 둔다 — 같은 이름 두 개가 서로 다른 입력을 받으면 다음 사람이 아무거나 집는다.
import {
  ScheduleContent,
  standingsAriaLabel,
  toStandingsRows as publicStandingsToRows,
} from '@/components/public-game-records/schedule-content';
import { competitionFormatLabel, isLeagueCompetition } from '@/lib/competition-kind';
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
 * 서버가 내려준 순위 행의 기록과 position은 그대로 보존한다. 다만 배포 전 데이터나
 * 비동기 projection 지연 때문에 일부 행만 보이는 순간에도 편성 팀이 사라지면 안 되므로,
 * registrationId 기준으로 누락된 팀만 0기록 행으로 뒤에 보완한다. 정상 재계산 응답은 전
 * 팀을 포함하므로 이 병합은 아무 값도 바꾸지 않는다.
 */
function toGroupStandingsRows(group: V1TournamentGroup): TournamentStandingsRow[] {
  const rows = toStandingsRows(group.standings);
  const recordedRegistrationIds = new Set(rows.map((row) => row.key));
  let nextPosition = rows.reduce((max, row) => Math.max(max, row.position), 0) + 1;

  for (const team of group.groupTeams) {
    if (recordedRegistrationIds.has(team.registrationId)) continue;
    rows.push({
      key: team.registrationId,
      teamId: team.teamId,
      teamName: team.teamName,
      teamLogoUrl: team.teamLogoUrl,
      position: nextPosition++,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    });
  }

  return rows;
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
      <EmptyState
        title="이 조에서 배정된 경기가 아직 없어요"
        sub="대진이 확정되면 이 팀의 경기가 여기에 표시돼요."
      />
    );
  }

  return (
    <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, listStyle: 'none', margin: 0, padding: 0 }}>
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
              padding: '8px 12px',
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
        className="tm-text-caption-strong"
        style={{
          marginBottom: 8,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {group.name}
        {advance !== null ? (
          <span className="tm-text-caption" style={{ marginLeft: 8 }}>
            상위 {advance}팀 진출
          </span>
        ) : group.advanceCount !== null ? (
          <span className="tm-text-caption" style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 'normal' }}>
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
function LeagueStandingsSection({
  rows,
  label = '리그 순위',
}: {
  rows: readonly TournamentStandingsRow[];
  /** 티어가 있으면 `'1부'`·`'2부'` — 아래 `leagueStandingsHeading` 참조. */
  label?: string;
}) {
  return (
    <section aria-label={standingsAriaLabel(label)} style={{ marginBottom: 16 }}>
      <TournamentStandingsTable rows={rows} advance={null} ariaLabel={standingsAriaLabel(label, '표')} />
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
  tournamentId,
  format,
  status,
  teamCount,
  confirmedCount,
  registrationDeadlineAt,
  bracketPublishScheduledAt,
}: {
  tournamentId: string;
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
    <div>
      {/* 팀명이 아니라 팀 수 — "감출 때 없는 척하지 마라": 이름은 몰라도 몇 팀이
          참가하는지는 정직하게 보여준다. EmptyState 는 title/sub/cta 만 지원하므로
          이 보강 정보는 그 위에 별도 블록으로 얹는다(요구사항 3, 조용히 드롭하지 않는다). */}
      <div
        style={{
          margin: '0 auto 16px',
          maxWidth: 240,
          padding: '12px 16px',
          borderRadius: 10,
          background: 'var(--surface-soft)',
          fontSize: 12,
          color: 'var(--text-strong)',
          fontWeight: 600,
          textAlign: 'center',
        }}
      >
        확정 {confirmedCount}/{teamCount}팀
        {deadlineLabel ? (
          <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: 8, fontWeight: 400 }}>
            모집 마감 {deadlineLabel}
          </div>
        ) : null}
        {publishLabel ? (
          <div className="tm-text-caption" style={{ color: 'var(--text-caption)', marginTop: deadlineLabel ? 2 : 8, fontWeight: 400 }}>
            대진표 공개 예정 {publishLabel}
          </div>
        ) : null}
      </div>
      <EmptyState
        illustration={{ name: 'landing-hero' }}
        title="대진표가 아직 공개되지 않았어요"
        sub={sub}
        cta="대회 정보 보기"
        ctaHref={`/tournaments/${tournamentId}`}
      />
    </div>
  );
}

/**
 * §B-6 — 이 화면에서 경기 일정도 볼 수 있게 한다. 탭으로 나눈 이유: "순위·대진표"와
 * "경기 일정"은 둘 다 화면 하나를 다 채울 만큼 정보량이 많아(특히 조별리그 대회는
 * 이미 6:4 그리드로 꽉 참) 같은 화면에 나란히 얹으면 세로로 매우 길어진다. 섹션
 * 대신 탭을 골라 스크롤 깊이를 유지했다. 일정 목록 자체는 새로 만들지 않고 기존
 * `schedule-content.tsx`의 `ScheduleContent`를 그대로 재사용한다(복제 금지 지침).
 *
 * 기본 탭은 "경기 일정"이다(오너 지시). 대회 진행 중 이 화면에 들어오는 대부분의
 * 목적은 "다음 경기가 언제/어디서"이고, 순위·대진표는 결과가 쌓인 뒤에 보는
 * 정보라 첫 화면을 일정에 내줬다. 세그먼트 탭 나열 순서도 기본 탭과 같게 둔다.
 */
export function BracketScheduleTab({
  tournamentId,
  isRegularLeague = false,
}: {
  tournamentId: string;
  /**
   * **정규 리그 시즌인가(`kind`)** — 이 파일의 다른 `isLeague`(`isLeagueCompetition`,
   * `format === 'league'` 인 진짜 대회도 포함)와 **뜻이 다르다.** 이름을 갈라 둔다.
   * 단계 어휘(칩·aria-label)만 가른다 — `ScheduleContent` 참조.
   */
  isRegularLeague?: boolean;
}) {
  // schedule-page-client.tsx와 동일한 데이터 배선(usePublicTournamentSchedule 페이지
  // 합치기 + 로딩/에러 분기) — AppChrome 래핑만 없는 얇은 버전이라 별도 훅으로
  // 추출하지 않았다(두 곳뿐이라 공용 추상화를 새로 만드는 게 오히려 과설계).
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicTournamentSchedule(tournamentId);
  // `/schedule`의 권한 기능도 통합 허브인 `/bracket`에서 동일하게 제공한다. 공개 일정
  // 조회와 분리된 인증 전용 요청이라 비로그인·비참가자는 빈 상태로 끝나고, 참가팀
  // owner/manager에게만 자기 팀 경기 강조와 라인업 바로가기가 열린다.
  const myFixtures = useV1MyTournamentFixtures(tournamentId);

  if (isLoading) {
    return (
      <div style={{ padding: '20px 20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="tm-skeleton" style={{ height: 120, borderRadius: 'var(--radius-control)' }} />
        <div className="tm-skeleton" style={{ height: 220, borderRadius: 'var(--radius-control)' }} />
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
      isRegularLeague={isRegularLeague}
      data={combined}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => void fetchNextPage()}
      myFixtures={myFixtures.data}
      /* 순위표는 옆 탭("순위 · 대진표")이 이미 그린다 — 여기서 또 그리면 탭만 바꿔도
         같은 표가 두 번 나온다(오너 지적: "중복되는 정보도 많고"). */
      showStandings={false}
    />
  );
}

/* ── 메인 콘텐츠 ── */
export function BracketPageContent({ tournament }: { tournament: V1TournamentDetail }) {
  const { format, fixtures, groups } = tournament;
  // 정규 리그 거울 행은 format='group_knockout' 이다(백필·dual-write 가 format 을 안 쓴다).
  // 그래서 format 만 보면 ① 리그 순위 칼럼이 안 그려지고 ② 없는 대진표를 그리려 든다.
  const isLeague = isLeagueCompetition(tournament);
  /**
   * **위 `isLeague` 와 뜻이 다르다.** `isLeague` 는 *"리그처럼 그릴까"*(리그 방식 대회
   * 포함)이고, 이쪽은 *"정규 리그 시즌인가"* 다. 어휘 교체는 사용자가 **정규 리그에만**
   * 적용하라고 확정했으므로(2026-09-01) `kind` 로 묻는다 — `isLeague` 를 쓰면 리그 방식
   * 대회 7건(alpha 실측)의 문구까지 바뀐다.
   */
  const isRegularLeague = tournament.kind === 'regular_league';
  /**
   * **정규 리그의 순위는 대회 축 `groups` 에 없다.** 거울 행에는 `V1TournamentGroup` 이
   * 하나도 없어서(그 행을 만드는 코드가 전부 대회 게이트 뒤다) 아래 `allLeagueRows` 가
   * **항상 빈 배열**이 된다 — alpha 실측에서 이 탭이 "순위 집계 전이에요" 만 그렸다.
   * 서버는 `/tournaments/:id/schedule` 로 리그 순위를 정상으로 준다(같은 페이지의 "경기
   * 일정" 탭이 이미 그 응답을 그리고 있었다).
   *
   * 그래서 **소스만 가른다.** 상세(`groups`)를 채우는 쪽은 이 응답을 쓰는 다른 소비처까지
   * 건드리게 되고, 두 화면이 서로 다른 계산을 하게 될 여지가 남는다. 이쪽은 `/schedule`
   * 과 **같은 값을 같은 변환으로** 그린다(`toStandingsRows` 를 공유한다).
   *
   * 요청은 형제 탭(`BracketScheduleTab`)과 같은 쿼리 키라 React Query 가 합친다 —
   * 왕복이 늘지 않는다.
   */
  // 대회에서는 이 부모가 그 데이터를 **아예 안 쓴다**(`groups` 를 쓴다) — 안 쓰는 응답을
  // 라이브 폴링까지 하며 들고 있을 이유가 없다. `enabled` 로 끄는 이유이고, 빈 id 를
  // 넘겨 끄는 방식은 쓰지 않는다(캐시 키가 오염되고 조용히 잘못된 요청이 갈 수 있다).
  // 리그일 때는 형제 탭과 **같은 쿼리 키**라 React Query 가 합친다 — 왕복이 안 는다.
  const leagueSchedule = usePublicTournamentSchedule(tournament.id, {}, { enabled: isRegularLeague });
  const leagueScheduleStandings = isRegularLeague
    ? (leagueSchedule.data?.pages[0]?.standings ?? [])
    : [];
  const leagueScheduleItemCount = isRegularLeague
    ? (leagueSchedule.data?.pages.reduce((sum, page) => sum + page.items.length, 0) ?? 0)
    : 0;
  const stages = buildTournamentStages(tournament);
  const [activeTab, setActiveTab] = useState<'standings' | 'schedule'>('schedule');

  const { groupPhaseGroups, knockoutFixtures, hasGroupStandings, hasKnockoutFixtures } =
    partitionTournamentSections(format, fixtures, groups);

  // 결선 fixture를 미리 만들었다면 참가 팀이 아직 정해지지 않았어도 대진 구조와
  // 시간을 공개한다. TournamentBracket은 nullable 팀 슬롯을 `미정`으로 표시하므로,
  // 조별 순위 확정 전 팀을 지어내지 않으면서도 일정과 대진표가 같은 정보를 보여준다.
  const showBracket = hasKnockoutFixtures;

  /**
   * §데스크탑 폭 배분 — 결선 라운드 수가 대진표에 필요한 가로 폭의 유일한 근거다.
   * 기본 배분(순위표 0.72fr : 대진표 1.28fr)은 라운드가 여러 개일 때를 전제로 대진표에
   * 넓은 쪽을 준 것인데, 결승 하나만 남은 대회에서는 그 폭을 연결선만 가로지르고
   * (1440 실측: 650px 칼럼에 카드 180px + 우승 카드) 순위표는 366px로 눌렸다.
   *
   * 임계값이 1인 이유는 대진표 자체의 최소 폭 산술이다(tournament-bracket.tsx의
   * COL_W 180 + CONN_W 36 + CHAMP_W 120): 라운드 R개의 최소 폭 = R×216 + 120.
   * R=1이면 336px라 좁힌 칼럼(460px)에 들어가지만, R=2(4강+결승)는 552px라 넘쳐
   * 가로 스크롤이 생긴다 — 그 경우는 기본 배분(대진표 650px)이 맞다.
   */
  const knockoutRoundCount = new Set(knockoutFixtures.map((f) => f.round)).size;

  // 리그 포맷: 모든 그룹의 순위 행을 합산. 집계 전 조는 toGroupStandingsRows가
  // 편성 팀(groupTeams)을 0값 기준선 행으로 대신 내주므로, 경기 0건이어도 참가 팀이
  // 모두 보인다(#374). 중복 제거 키는 등록 단위(row.key = registrationId)로 그대로 유지.
  const allLeagueRows = isRegularLeague
    // 정규 리그는 `/schedule` 응답에서 온다 — 위 doc comment 참조. 변환은 그 화면과
    // **같은 함수**를 쓴다(행 key 규칙 `registrationId ?? teamId` 포함).
    ? publicStandingsToRows(leagueScheduleStandings)
    : groups
        .flatMap((g) => toGroupStandingsRows(g))
        .filter((row, index, arr) => arr.findIndex((x) => x.key === row.key) === index)
        .sort((a, b) => a.position - b.position);

  // 좌(순위표) 칼럼에 **실제로 그릴 게 있는지**. 예전엔 이걸 따지지 않고 항상 2열 그리드를
  // 폈다 — 그래서 순위표가 없는 상태(대회 초반이라 성적이 아직 없거나, 애초에 조별 순위가
  // 없는 knockout 포맷)에서는 왼쪽 절반이 빈 채로 넓게 잡히고 오른쪽에 대진표만 치우쳐
  // 붙었다(오너 지적: 대진표 빈 상태 화면). 반대로 league 포맷은 우측(대진표)이 없는데
  // 2열이라 오른쪽이 비었다. 칼럼이 하나뿐이면 그리드를 1열로 접어 그 칼럼이 가운데 폭을
  // 온전히 쓰게 한다.
  // 정규 리그의 "경기가 있나" 는 대회 축 `fixtures` 가 아니라 `/schedule` 항목 수로 센다 —
  // 거울엔 대회 축 대진이 없어 `fixtures.length` 가 늘 0 이고, 그러면 경기가 있는 리그에도
  // "경기 일정이 아직 없어요" 가 뜬다(alpha 실측: 일정 탭엔 1건이 보이는데 순위 탭은 그렇게 적었다).
  /**
   * 리그 순위가 **아직 안 온 상태**와 **정말 없는 상태**를 가른다. 안 가르면 로딩·에러 중에
   * `standings` 가 빈 배열이라 *"순위 집계 전이에요"·"경기 일정이 아직 없어요"* 가
   * **거짓으로** 뜬다 — 이 PR 이 고치려던 바로 그 증상이 원인만 바뀌어 되살아난다.
   * 에러일 때 특히 나쁘다: 못 불러온 것을 *"없다"* 로 말하면 사용자가 다시 시도할 이유를
   * 못 찾는다.
   */
  const leagueScheduleSettled = isRegularLeague
    ? !leagueSchedule.isLoading && !leagueSchedule.isError
    : true;
  /**
   * 순위표 제목. 사용자 확정값은 **"tierLabel(1부/2부)을 쓰고 없으면 '리그 순위'"** 인데
   * 이 화면은 `'리그 순위'` 를 박아 두고 있었다 — **티어 리그 55/88건(alpha 실측)에서
   * `'1부'`·`'2부'` 가 전혀 안 보였다.** 같은 리그가 `/schedule` 에선 티어를 보여주고
   * 여기선 안 보여주는 상태였다.
   *
   * 서버가 그 값을 `standings[].groupName` 에 실어 준다(한 리그는 그룹이 하나뿐이라
   * 값이 하나로 모인다 — 여럿이면 티어를 특정할 수 없으므로 일반 명칭으로 떨어진다).
   *
   * ⚠️ 정규 리그일 때만이다. `format='league'` 인 **대회**는 사용자가 문구를 그대로 두라고
   * 했으므로 건드리지 않는다.
   */
  const leagueStandingsGroupNames = new Set(leagueScheduleStandings.map((row) => row.groupName));
  const leagueStandingsHeading =
    isRegularLeague && leagueStandingsGroupNames.size === 1
      ? [...leagueStandingsGroupNames][0]
      : '리그 순위';

  const leagueHasNoFixtures = isRegularLeague
    ? leagueScheduleSettled && leagueScheduleItemCount === 0
    : fixtures.length === 0;
  const hasStandingsColumn = isLeague
    // 로딩·에러 중에도 칼럼은 유지한다 — 안 그러면 칼럼이 나타났다 사라지며 레이아웃이 튄다.
    ? allLeagueRows.length > 0 || leagueHasNoFixtures || !leagueScheduleSettled
    : format === 'group_knockout' && hasGroupStandings;
  // 리그엔 토너먼트 대진이 없다. isLeague 를 안 빼면 거울 행(group_knockout)이 여기서
  // 참이 되어 **빈 대진표 칼럼**이 생긴다 — 이 화면이 리그에서 가장 크게 틀어지는 자리다.
  const hasBracketColumn = !isLeague && (format === 'knockout' || format === 'group_knockout');
  const isTwoColumn = hasStandingsColumn && hasBracketColumn;

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
    // paddingBottom 40 → 16: flownav가 marginTop:auto로 이미 바닥에 붙는데 그 아래로
    // 40px이 더 붙어 하단 탭바와의 사이가 52px(모바일)·88px(데스크탑) 흰 공간으로 남았다.
    <div className="tm-tourn-sub-page" style={{ paddingBottom: 16, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header className="tm-bracket-page-intro">
        <div>
          {/* §첫 화면 밀도 — eyebrow("순위와 대진표")는 상단 앱바 제목("순위·브래킷")과
              같은 말을 두 번 하는 자리라 삭제했다. 안내 문단은 좁은 폭에서 숨긴다
              (globals.css의 .tm-bracket-page-intro p) — 390px에서 이 인트로 블록이
              스크롤 영역의 22%(159px)를 먹어 정작 경기가 2~3개밖에 안 보였다. */}
          {/* 셸이 이미 데스크톱 헤드에 "순위·브래킷" 제목을 그린다(tournaments-core.ts
              desktopHead:true) — 여기 h1을 그대로 두면 데스크톱에서 h1이 중복된다.
              대회 실제 제목은 여기서만 나오는 정보라 h2로 낮춰 유지한다. */}
          <h2>{tournament.title}</h2>
          {/* 리그엔 조별리그도 결선도 없다 — format 으로만 쓰면 거울 행에 이 문장이 그대로 뜬다. */}
          <p>
            {isLeague
              ? '경기 일정과 순위를 확인하세요.'
              : '경기 일정과 조별 순위, 결선 진행 상황을 확인하세요.'}
          </p>
        </div>
        <span className="tm-bracket-page-format">
          {competitionFormatLabel(tournament)}
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

      {/* 경기 일정 / 순위·대진표 탭.
          예전엔 파란 채움 버튼 + 회색 버튼 두 개를 나란히 뒀는데, 그러면 "선택된 탭"이
          아니라 "파란 버튼 하나와 회색 버튼 하나"로 읽혀 탭인 줄 모른다(오너 지적:
          "탭인 것처럼 보이지가 않고"). 공용 SegmentedTabs(미끄러지는 thumb) 를 쓴다 —
          패널(아래 activeTab 분기)엔 전환 애니메이션을 걸지 않는다: 탭은 페이지 이동이
          아니라 같은 화면을 보는 각도를 바꾸는 것이라 즉시 교체가 맞다. */}
      <div style={{ padding: '16px 20px 0' }}>
        <SegmentedTabs
          items={[
            { id: 'schedule', label: '경기 일정' },
            { id: 'standings', label: isRegularLeague ? '리그 순위' : '순위 · 대진표' },
          ]}
          activeId={activeTab}
          onSelect={(id) => setActiveTab(id as 'schedule' | 'standings')}
          ariaLabel="보기 방식"
          role="tablist"
        />
      </div>

      {/* flex:1 — 위 minHeight:'100%'+flex column과 짝을 이뤄 탭 콘텐츠가 남는 세로
          공간을 채우고, 아래 flownav가 marginTop:'auto'로 항상 바닥에 붙게 한다. */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {activeTab === 'schedule' ? (
        // §일정 탭 가로 밀도 — 데스크탑에서 카드가 콘텐츠 폭(1440에서 998px)까지 그대로
        // 늘어나는데 안의 팀명·점수는 중앙 정렬 고정이라 좌우로 각각 300px 가까이 비었다.
        // 읽기 좋은 폭으로 묶어 가운데 세운다(제약은 globals.css, ≥1024에서만 적용).
        <div className="tm-bracket-schedule-pane">
          {/* ⚠️ `kind` 로만 판정한다 — `isLeagueCompetition` 은 `format === 'league'` 인
              리그 방식 대회도 true 라(alpha 62건 중 7건) 그 대회들의 어휘까지 바꾼다. */}
          <BracketScheduleTab
            tournamentId={tournament.id}
            isRegularLeague={isRegularLeague}
          />
        </div>
      ) : (
        <>
          {/* 2열 그리드: 좌=순위표 / 우=대진표 (데스크탑) — 탭 전환용 조건 안이지만
              활성 탭일 때만 그리드를 그린다. 아래 흐름 네비게이터(§FlowNav)는 탭과
              무관한 페이지 레벨 이동이라 이 분기 밖(항상)으로 옮겼다. */}
          <div
            className={[
              'tm-tourn-sub-grid',
              'tm-bracket-page-grid',
              // 폭 배분 규칙은 **두 칼럼이 다 있을 때만** 의미가 있다. 한쪽이 없으면
              // 붙이지 않아 `.tm-tourn-sub-grid` 기본값(1열)으로 떨어진다.
              isTwoColumn ? (format === 'group_knockout' ? 'tm-tourn-sub-grid-6040' : 'tm-tourn-sub-grid-2col') : '',
              isTwoColumn && format === 'group_knockout' && !showBracket ? 'tm-bracket-page-grid-empty' : '',
              isTwoColumn && showBracket && knockoutRoundCount <= 1 ? 'tm-bracket-page-grid-slim-bracket' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {/* 좌: 순위표 — 그릴 게 없으면 빈 칼럼을 남기지 않고 아예 렌더하지 않는다. */}
            {hasStandingsColumn ? (
            <div className="tm-tourn-sub-col" style={{ padding: '20px 20px 0' }}>
              {isLeague && (
                <section>
                  <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>
                    {leagueStandingsHeading}
                  </h3>
                  {isRegularLeague && !leagueScheduleSettled ? (
                    leagueSchedule.isError ? (
                      <ErrorState message="순위를 불러오지 못했어요." onRetry={() => void leagueSchedule.refetch()} />
                    ) : (
                      <div
                        className="tm-skeleton"
                        style={{ height: 160, borderRadius: 'var(--radius-control)' }}
                        aria-label="순위 불러오는 중"
                      />
                    )
                  ) : (
                    <LeagueStandingsSection rows={allLeagueRows} label={leagueStandingsHeading} />
                  )}
                </section>
              )}

              {!isLeague && format === 'group_knockout' && hasGroupStandings && (
                <section>
                  <h3 className="tm-hub-section-title" style={{ marginBottom: 12 }}>
                    조별 순위
                  </h3>
                  {groupPhaseGroups.map((g) => (
                    <GroupStandingsSection key={g.id} group={g} fixtures={fixtures} />
                  ))}
                </section>
              )}

              {isLeague && leagueHasNoFixtures && (
                <EmptyState
                  illustration={{ name: 'landing-hero' }}
                  title="경기 일정이 아직 없어요"
                  sub="일정이 등록되면 여기에서 확인할 수 있어요."
                />
              )}
            </div>
            ) : null}

            {/* 우: 대진표 */}
            {hasBracketColumn && (
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
                      tournamentId={tournament.id}
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
      <div className="tm-skeleton" style={{ height: 44, borderRadius: 'var(--radius-chip)' }} />
      <div className="tm-skeleton" style={{ height: 200, borderRadius: 'var(--radius-control)' }} />
      <div className="tm-skeleton" style={{ height: 160, borderRadius: 'var(--radius-control)' }} />
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
    return <BracketPageSkeleton />;
  }

  if (isError || !data) {
    const msg = extractErrorMessage(error, '대회 정보를 불러오지 못했어요.');
    return (
      <div style={{ padding: '40px 20px' }}>
        <ErrorState message={msg} onRetry={() => void refetch()} />
      </div>
    );
  }

  return <BracketPageContent tournament={data} />;
}
