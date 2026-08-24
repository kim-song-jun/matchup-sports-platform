'use client';

import { competitionRanks } from '@/lib/competition-ranks';
import Link from 'next/link';
import { Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useV1LeagueMatch, useV1LeagueMatchPlayerRecords, useV1LeagueMatchStandings } from '@/hooks/use-v1-api';
import { Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { extractErrorMessage } from '@/lib/error-message';
import { LEAGUE_STATE_META } from '@/lib/league-state-meta';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1LeagueChampionTeam, V1LeagueFixture } from '@/types/league-match';

/**
 * 확정된 승강 결과 표기(Task 153 시나리오 4). 컬러만으로 뜻을 전달하지 않도록
 * 기호(↑/↓/–/×)와 텍스트를 함께 싣는다(DESIGN.md — 색맹 대응).
 * 네 종류를 모두 담은 전수 Record라 `stayed`도 '잔류'로 표시된다 — 확정 전(null)일 때만
 * '—'가 뜬다.
 */
const PROMOTION_META: Record<'promoted' | 'relegated' | 'stayed' | 'withdrawn', { label: string; glyph: string; className: string }> = {
  promoted: { label: '승격', glyph: '↑', className: 'text-blue-700 dark:text-blue-300' },
  relegated: { label: '강등', glyph: '↓', className: 'text-red-700 dark:text-red-300' },
  stayed: { label: '잔류', glyph: '–', className: 'text-[var(--text-muted)]' },
  withdrawn: { label: '불참', glyph: '×', className: 'text-amber-700 dark:text-amber-300' },
};

const TIE_BREAK_LABELS: Record<string, string> = {
  points: '승점',
  goalDifference: '골득실',
  goalsFor: '다득점',
  headToHead: '승자승',
};


/**
 * 리그 대진(fixture)은 팀 매칭(team-match) 레코드 그대로다 — status는
 * V1TeamMatchApiStatus(모집 중/마감/매칭됨/취소됨/완료/기한 만료)와 같은 값을 쓴다.
 * 이 화면은 public 페이지라 관리자 전용 AdminStatusPill(components/admin — /admin
 * 라우트 밖에서 쓰인 전례가 없다)을 끌어오지 않고, team-matches-page.tsx 등 다른
 * public 화면이 이미 쓰는 "tm-badge 로컬 라벨 매핑" 관례를 그대로 따른다.
 */
const FIXTURE_STATUS_META: Record<string, { label: string; badgeClass: string }> = {
  recruiting: { label: '모집 중', badgeClass: 'tm-badge-blue' },
  closed: { label: '마감', badgeClass: 'tm-badge-orange' },
  matched: { label: '매칭됨', badgeClass: 'tm-badge-green' },
  cancelled: { label: '취소됨', badgeClass: 'tm-badge-red' },
  completed: { label: '완료', badgeClass: 'tm-badge-grey' },
  expired: { label: '기한 만료', badgeClass: 'tm-badge-grey' },
};

function fixtureStatusMeta(status: string): { label: string; badgeClass: string } {
  return FIXTURE_STATUS_META[status] ?? { label: status, badgeClass: 'tm-badge-grey' };
}

/**
 * 승격/강등/잔류/불참 뱃지 — 열(390px 이상)과 팀명 아래 인라인(390px 미만) 양쪽에서 재사용한다.
 * 아이콘+텍스트를 함께 실어 컬러만으로 뜻을 전달하지 않는다.
 */
export function PromotionBadge({ kind, toTierLabel }: { kind: 'promoted' | 'relegated' | 'stayed' | 'withdrawn'; toTierLabel: string | null }) {
  const meta = PROMOTION_META[kind];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${meta.className}`}>
      <span aria-hidden="true">{meta.glyph}</span>
      {meta.label}
      {(kind === 'promoted' || kind === 'relegated') && toTierLabel !== null && (
        <span className="font-normal text-[var(--text-muted)]">({toTierLabel})</span>
      )}
    </span>
  );
}

/**
 * 감사 H-2 — 시즌 중 예상 승강(expectedPromotionKind)은 확정된 승강(promotionKind)과
 * 절대 같은 무게로 읽히면 안 된다. "지금 순위대로면"이라는 뜻이지 확정이 아니다.
 * "예상" 접두어 + 이탤릭 + 옅은 글자 굵기(font-medium, 확정 뱃지는 font-semibold)로
 * 문구·스타일 두 축에서 확정 표기(PromotionBadge)와 구분한다 — 컬러 하나로만
 * 구분하지 않는다(DESIGN.md 색맹 대응 원칙).
 */
function ExpectedPromotionBadge({ kind, toTierLabel }: { kind: 'promoted' | 'relegated' | 'stayed'; toTierLabel: string | null }) {
  const meta = PROMOTION_META[kind];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap font-medium italic ${meta.className}`}>
      <span aria-hidden="true">{meta.glyph}</span>
      예상 {meta.label}
      {(kind === 'promoted' || kind === 'relegated') && toTierLabel !== null && (
        <span className="font-normal not-italic text-[var(--text-muted)]">({toTierLabel})</span>
      )}
    </span>
  );
}

// competitionRanks 는 lib/competition-ranks.ts 로 이동 — 대회 개인 랭킹(STATS-1)과
// 공유하기 위해서다. 상단에서 import 한 바인딩을 그대로 re-export 해 기존
// 소비처(수상 페이지·테스트)를 유지한다(같은 모듈 이중 import 방지 — 리뷰 지적).
export { competitionRanks };

/**
 * 점수 필드(homeScore/awayScore)는 값이 없을 수 있다(미확정 대진) — 그때는 0:0으로
 * 오인되지 않게 상태 기반 문구로 대체한다.
 *
 * **취소된 대진은 점수가 있어도 점수를 보여주지 않는다.** 순위표는 취소 대진을 완전히
 * 제외하는데(R8) 일정 목록에만 "취소됨 1 : 0"이 굵게 남으면, 존재하는 점수가 왜 순위에
 * 반영되지 않는지 알 수 없다 — 같은 화면 안에서 두 집계가 서로 다른 말을 하게 된다.
 * 대신 "집계 제외"라고 명시해 그 경기가 기록에서 빠졌음을 그대로 읽히게 한다.
 * (취소 대진에 '예정'이 붙던 문제도 여기서 함께 사라진다.)
 *
 * **몰수 결과는 점수 옆에 뱃지로 구분한다.** 몰수는 1:0 으로 기록되는데, 그대로 두면
 * 실제로 치러진 1:0 승리와 화면에서 완전히 같아 보인다 — 관전자가 "이 팀이 이겼다"와
 * "상대가 안 나왔다"를 구분할 수 없다.
 */
function fixtureResultLabel(fixture: V1LeagueFixture): { text: string; hasScore: boolean; isForfeit: boolean } {
  if (fixture.status === 'cancelled') {
    return { text: '집계 제외', hasScore: false, isForfeit: false };
  }
  if (typeof fixture.homeScore === 'number' && typeof fixture.awayScore === 'number') {
    // 몰수는 스코어만 보면 실제 1:0 승리와 똑같이 읽힌다 — 점수는 그대로 두고 별도
    // 뱃지로 구분한다. 색만으로 알리지 않도록 "몰수" 텍스트를 함께 싣는다.
    return { text: `${fixture.homeScore} : ${fixture.awayScore}`, hasScore: true, isForfeit: fixture.isForfeit === true };
  }
  return { text: fixture.status === 'completed' ? '결과 대기' : '예정', hasScore: false, isForfeit: false };
}

/**
 * 이슈 3(감사 보통) — "예정"으로 봐야 할 대진 = 각 행에 실제로 **'예정'이라고 찍히는** 대진.
 *
 * 판정을 fixtureResultLabel 과 **같은 기준으로 맞춘다.** 스코어가 없다고 다 '예정'인 게 아니다 —
 * 이미 치렀지만 공식 결과가 아직 안 붙은 대진(status === 'completed' + 스코어 null)에는
 * 그 함수가 '결과 대기'를 찍는다. 그런데도 필터가 그걸 '예정'으로 세면, "예정만 보기"를 켰을 때
 * 화면엔 '결과 대기'라고 적힌 행이 섞여 나오고 "다음 경기" 강조도 지난 경기에 붙는다
 * (실제로 이 함수가 취소 여부와 스코어 유무만 보고 있어서 그런 상태였다).
 */
function isUpcomingFixture(fixture: V1LeagueFixture): boolean {
  return fixtureResultLabel(fixture).text === '예정';
}

interface TeamLookupEntry {
  name: string;
  logoUrl: string | null;
}

/** fixtures/pendingFixtures는 teamId만 준다 — standings 응답에서 만든 lookup으로 이름·로고를 매핑한다. */
function FixtureTeamLabel({
  teamId,
  lookup,
  fallback,
}: {
  teamId: string | null;
  lookup: Map<string, TeamLookupEntry>;
  fallback: string;
}) {
  const entry = teamId !== null ? lookup.get(teamId) : undefined;
  const name = entry?.name ?? fallback;
  return (
    // 여기서는 **팀 상세로 링크하지 않는다**(D3 적용 대상 아님). 이 라벨은 경기 목록 행
    // 안에서 쓰이는데 그 행 전체가 이미 팀매치 상세로 가는 <a> 라, 안에 또 <a> 를 두면
    // HTML 이 무효가 되고 브라우저가 바깥 <a> 를 조기에 닫는다(같은 이유로 리그 배지도
    // button + router.push 를 쓴다). 경기 행에서 기대되는 목적지도 팀이 아니라 그 경기다.
    <span className="inline-flex items-center gap-1.5">
      <TeamAvatar seed={teamId ?? fallback} name={name} logoUrl={entry?.logoUrl ?? null} size="sm" />
      <span className="text-[var(--text-strong)]">{name}</span>
    </span>
  );
}

/**
 * 리그 화면의 팀 이름을 팀 상세로 잇는다 (D3, 2026-08-24 사용자 확정).
 *
 * 그전까지 순위표·참가팀 목록·시상 화면의 팀 이름은 전부 **누를 수 없는 글자**였다.
 * "이 팀 뭐 하는 팀이지?"에서 길이 끊겼고, 리그 안에서 팀으로 나가는 통로가 아예 없었다.
 *
 * 목적지는 팀 전적이 아니라 **팀 상세**다 — 앱의 다른 모든 화면에서 팀 이름은 팀 상세로
 * 가므로 같은 단어가 화면마다 다른 곳으로 가지 않게 한다. 성적은 팀 상세에서 한 번 더
 * 들어가면 된다(그 대가는 결정 시점에 인지된 것이다).
 *
 * teamId 가 없을 수 있는 자리(부전 등)에서는 링크로 감싸지 않고 원래 내용을 그대로 둔다 —
 * 빈 링크는 키보드 포커스만 먹고 아무 데도 가지 않는다.
 */
function TeamNameLink({
  teamId,
  className,
  children,
}: {
  teamId: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  if (teamId === null) {
    return <span className={className}>{children}</span>;
  }
  return (
    <Link href={`/teams/${teamId}`} className={`tm-pressable ${className ?? ''}`.trim()}>
      {children}
    </Link>
  );
}

/**
 * 이슈 4(감사 보통) — 아직 한 경기도 안 치른 리그는 순위-무의미한 0-0-0 행 대신 참가
 * 팀 목록을 보여준다. 순위(position)는 전부 동점자 사전순 폴백이라 정렬 근거가 없으므로
 * 팀 이름 가나다순으로 다시 정렬한다.
 */
function ParticipantTeamList({ teams }: { teams: Array<{ teamId: string; teamName: string; teamLogoUrl: string | null }> }) {
  const sorted = [...teams].sort((a, b) => a.teamName.localeCompare(b.teamName, 'ko'));
  return (
    <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)]">
      {sorted.map((team) => (
        <li key={team.teamId} className="text-sm">
          <TeamNameLink
            teamId={team.teamId}
            className="tm-list-row-interactive flex min-h-[44px] items-center gap-2 px-3 py-2"
          >
            <TeamAvatar seed={team.teamId} name={team.teamName} logoUrl={team.teamLogoUrl} size="sm" />
            <span className="text-[var(--text-strong)]">{team.teamName}</span>
          </TeamNameLink>
        </li>
      ))}
    </ul>
  );
}

/**
 * 사용자 확정(2026-08-23) — 종료된 리그를 열면 시즌의 결론(우승팀·승강 결과·득점왕)이
 * 스크롤 없이 먼저 읽혀야 한다. **호출부가 `series.state === 'completed'`일 때만
 * 렌더한다** — 진행 중·준비 중 리그는 "우승팀" 개념 자체가 성립하지 않으므로 이 카드는
 * 아무것도 늘어나지 않는다(빈 카드도 그리지 않는다).
 *
 * standings/records 쿼리는 이 화면 아래쪽 섹션들과 동일한 react-query 키를 공유하므로
 * 이 카드 때문에 추가 네트워크 요청이 생기지 않는다. 아직 로딩 중이면 스켈레톤을,
 * 실패했으면 그 줄만 조용히 생략한다(전체 화면을 에러로 막지 않는다 — 아래 순위표
 * 섹션이 이미 자체 ErrorState+재시도를 갖고 있다).
 */
function SeasonSummaryCard({
  leagueId,
  standingsLoading,
  standingsError,
  champions,
  promotedCount,
  relegatedCount,
  recordsLoading,
  recordsError,
  topScorerNames,
}: {
  leagueId: string;
  standingsLoading: boolean;
  standingsError: boolean;
  champions: V1LeagueChampionTeam[];
  promotedCount: number;
  relegatedCount: number;
  recordsLoading: boolean;
  recordsError: boolean;
  topScorerNames: string[];
}) {
  const isCoChampion = champions.length > 1;
  return (
    <Card pad={16} className="mb-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Trophy size={16} className="tm-medal-gold" aria-hidden="true" />
        <h2 className="text-sm font-bold text-[var(--text-strong)]">이번 시즌 요약</h2>
      </div>
      {/* 에러를 로딩보다 **먼저** 본다. 호출부가 loading 을 `standings === undefined` 로 넘기는데
          요청이 실패해도 데이터는 undefined 라, 로딩을 먼저 검사하면 실패한 요청이 영원히
          스켈레톤으로 남고 아래 에러 분기에 도달하지 못한다(사용자는 계속 로딩 중으로 오해한다). */}
      {standingsError ? (
        // 화면 전체를 막지 않는다 — 아래 순위표 섹션이 이 같은 요청의 재시도 버튼을 갖고 있다.
        <p className="text-sm text-[var(--text-muted)]">시즌 요약을 불러오지 못했어요.</p>
      ) : standingsLoading ? (
        <div className="tm-skeleton" style={{ height: 44, borderRadius: 8 }} />
      ) : (
        <div className="space-y-1 text-sm">
          {champions.length > 0 && (
            <p className="text-[var(--text-strong)]">
              <span className="font-semibold">{isCoChampion ? '공동 우승' : '우승'}</span>
              {' · '}
              {champions.map((c) => c.teamName).join(', ')}
            </p>
          )}
          {(promotedCount > 0 || relegatedCount > 0) && (
            <p className="text-[var(--text-muted)]">
              승강 결과 · 승격 {promotedCount}팀 · 강등 {relegatedCount}팀
            </p>
          )}
          {!recordsLoading && !recordsError && topScorerNames.length > 0 && (
            <p className="text-[var(--text-muted)]">
              <span className="font-medium">{topScorerNames.length > 1 ? '공동 득점왕' : '득점왕'}</span>
              {' · '}
              {topScorerNames.join(', ')}
            </p>
          )}
        </div>
      )}
      <Link
        href={`/league-matches/${leagueId}/awards`}
        className="tm-btn tm-btn-sm tm-btn-outline mt-3"
      >
        시즌 결산 자세히 보기 →
      </Link>
    </Card>
  );
}

export default function LeagueMatchStandingsClient({ leagueId }: { leagueId: string }) {
  const seriesQuery = useV1LeagueMatch(leagueId);
  const standingsQuery = useV1LeagueMatchStandings(leagueId);
  const recordsQuery = useV1LeagueMatchPlayerRecords(leagueId);
  const series = seriesQuery.data;
  const standings = standingsQuery.data;
  const records = recordsQuery.data;

  // standings가 아직 로딩 중이거나 실패해도 빈 Map으로 안전하게 폴백한다 — 팀 이름 대신
  // fallback 문구를 보여줄 뿐 경기 일정 섹션이 깨지지 않는다.
  const teamLookup = useMemo(() => {
    const map = new Map<string, TeamLookupEntry>();
    for (const row of standings?.standings ?? []) {
      map.set(row.teamId, { name: row.teamName, logoUrl: row.teamLogoUrl });
    }
    return map;
  }, [standings]);

  const goalRanks = useMemo(() => competitionRanks((records?.goals ?? []).map((row) => row.goals)), [records]);
  const assistRanks = useMemo(() => competitionRanks((records?.assists ?? []).map((row) => row.assists)), [records]);

  // 시즌 결산 카드(SeasonSummaryCard) 전용 파생값 — 승격/강등 집계와 공동 득점왕(1위
  // 동점자 전원) 이름. promotionKind가 아직 없는(단발 리그·확정 전) 시즌은 두 카운트
  // 모두 0이라 그 줄 자체가 렌더되지 않는다.
  const promotedCount = useMemo(
    () => (standings?.standings ?? []).filter((row) => row.promotionKind === 'promoted').length,
    [standings],
  );
  const relegatedCount = useMemo(
    () => (standings?.standings ?? []).filter((row) => row.promotionKind === 'relegated').length,
    [standings],
  );
  const topScorerNames = useMemo(
    () => (records?.goals ?? []).filter((_, index) => goalRanks[index] === 1).map((row) => row.nickname ?? '선수'),
    [records, goalRanks],
  );

  // 감사 H-2 — promotionDecided(확정)와 promotionForecast(예상)는 서버 계약상 서로
  // 배타적이다(확정되면 promotionForecast가 다시 null). 열 표시 여부와 헤더 문구를
  // 여기서 한 번만 판정해 표(sm 이상 열)와 팀명 아래 인라인(sm 미만) 두 렌더 지점이
  // 항상 같은 판단을 쓰게 한다.
  const hasConfirmedPromotion = standings?.promotionDecided ?? false;
  const hasPromotionForecast = (standings?.promotionForecast ?? null) !== null;
  const showPromotionColumn = hasConfirmedPromotion || hasPromotionForecast;

  // 이슈 4 — "아직 한 경기도 안 치렀다"의 판정 기준. state==='draft' 단일 신호도
  // 후보였지만, 서버 쪽 "draft→active는 대진 생성 시" 불변식(league-match-public.service.ts
  // 주석)에 암묵적으로 기대는 대신 순위표 응답 자체가 들고 있는 값으로 직접 판정한다 --
  // 이 불변식이 나중에 바뀌어도 이 조건은 계속 맞는다.
  // 두 조건을 모두 걸어야 하는 이유: played 합계 0만 보면 "대진은 이미 잡혔는데 아직
  // 결과만 확정 안 된" 정상적인 0-0-0 순위표(바로 아래 "확인 중" 배너가 뜨는 상태)까지
  // 참가팀 목록으로 잘못 바뀐다. pendingFixtures가 함께 비어 있어야 "아예 대진조차
  // 없다"는 뜻이 된다.
  const preparingNoGames =
    standings !== undefined &&
    standings.standings.length > 0 &&
    standings.pendingFixtures.length === 0 &&
    standings.standings.every((row) => row.played === 0);

  // 이슈 3 — 대진은 항상 startAt 오름차순(과거→미래)으로 온다. 시즌 중반 리그일수록
  // "우리 팀 다음 경기"를 찾으려면 이미 끝난 경기를 여러 개 지나야 한다(alpha 실측).
  // "예정만 보기" 필터로 지난 경기를 걷어내고, 필터를 안 켜도 다음 경기 행 자체에
  // 뱃지+강조 테두리를 얹어 스크롤 없이 눈에 띄게 한다.
  const [showUpcomingOnly, setShowUpcomingOnly] = useState(false);
  const fixtures = series?.fixtures ?? [];
  const visibleFixtures = showUpcomingOnly ? fixtures.filter(isUpcomingFixture) : fixtures;
  // 오름차순 정렬 전제이므로 필터링된 배열의 첫 항목이 곧 가장 가까운 다음 경기다.
  const nextUpcomingFixtureId = fixtures.find(isUpcomingFixture)?.teamMatchId ?? null;

  // 잘못된 leagueId 딥링크(404 등)는 빈 화면이 아니라 에러 안내 + 재시도로 처리한다.
  if (seriesQuery.isError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <ErrorState
          message={extractErrorMessage(seriesQuery.error, '리그 정보를 불러오지 못했어요.')}
          onRetry={() => void seriesQuery.refetch()}
        />
      </div>
    );
  }

  if (series === undefined) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div className="tm-skeleton" style={{ height: 32, borderRadius: 10 }} />
        <div className="tm-skeleton" style={{ height: 180, borderRadius: 16 }} />
        <div className="tm-skeleton" style={{ height: 160, borderRadius: 12 }} />
      </div>
    );
  }

  const stateMeta = LEAGUE_STATE_META[series.state];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* 티어 뱃지는 리그 체계에 속한 리그에만 붙인다 — 단발 리그는 tierLabel 이 null 이라
          "1부"로 잘못 보이지 않는다. 색만으로 구분하지 않도록 텍스트를 함께 쓴다.
          상태 뱃지(진행중/종료)는 제목 옆에 그대로 두고, 티어·시즌 문맥만 윗줄에 얹는다 —
          둘은 다른 축이라 한 줄에 섞으면 무엇이 무엇인지 읽히지 않는다. */}
      {series.tierLabel != null && (
        <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {/* 하드코딩 색 대신 목록(league-matches-list-client.tsx)·마이 리그(my-leagues-client.tsx)와
              동일한 공용 뱃지 클래스를 쓴다 — 명암비가 이미 검증돼 있고, 목록→상세 이동 시
              같은 정보의 모양이 바뀌지 않아야 한다. */}
          <span className="tm-badge tm-badge-sm tm-badge-blue">
            {series.tierLabel}
          </span>
          {series.seriesTitle != null && (
            <span className="text-[var(--text-muted)]">
              {series.seriesTitle}
              {series.seasonNo != null && ` · ${series.seasonNo}시즌`}
            </span>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold text-[var(--text-strong)]">{series.title}</h1>
        <span className={`tm-badge ${stateMeta.badgeClass}`}>{stateMeta.label}</span>
      </div>
      {/* 사용자 확정(2026-08-23) — 종료된 리그에만 뜬다. 진행 중·준비 중 리그에는
          이 자리에 아무것도 늘어나지 않는다(우승팀 개념이 아직 성립하지 않는다). */}
      {series.state === 'completed' && (
        <div className="mt-3">
          <SeasonSummaryCard
            leagueId={leagueId}
            standingsLoading={standings === undefined}
            standingsError={standingsQuery.isError}
            champions={standings?.champions ?? []}
            promotedCount={promotedCount}
            relegatedCount={relegatedCount}
            recordsLoading={records === undefined}
            recordsError={recordsQuery.isError}
            topScorerNames={topScorerNames}
          />
        </div>
      )}
      {/* 이슈 1(감사 보통) — seriesId 가 응답에 있어도 같은 시리즈의 다른 시즌·티어로
          이동할 링크가 없어 "1부"를 보는 사용자가 "2부는 어떤 팀들이 있지?"를 클릭으로
          확인할 수 없었다. 단발 리그(seriesSiblings 빈 배열)에는 아무것도 늘어나지 않는다. */}
      {(series.seriesSiblings ?? []).length > 0 && (
        <nav aria-label="같은 시리즈의 다른 리그" className="mt-2">
          <ul className="flex flex-wrap gap-1.5">
            {series.seriesSiblings.map((sibling) => {
              const siblingStateMeta = LEAGUE_STATE_META[sibling.state];
              return (
                <li key={sibling.leagueId}>
                  <Link href={`/league-matches/${sibling.leagueId}`} className="tm-chip">
                    {sibling.seasonNo}시즌 · {sibling.tierLabel}
                    {/* 상태를 컬러 뱃지 + 텍스트로 함께 표기 — 컬러만으로 진행 여부를 전달하지 않는다. */}
                    <span className={`tm-badge tm-badge-sm ${siblingStateMeta.badgeClass}`}>{siblingStateMeta.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      {standings !== undefined && (
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          순위 규칙: {standings.tieBreakOrder.map((c) => TIE_BREAK_LABELS[c] ?? c).join(' → ')}
        </p>
      )}
      {/* 감사 H-2 — 승강 슬롯 규칙 요약. 확정 전(promotionForecast != null)에만 뜨고,
          게임을 아직 안 치른 시즌에도 "규칙 자체"는 이미 정해져 있어 계속 보여준다
          (row별 예상 승강은 preparingNoGames 분기에서 표를 아예 안 그려 자연히 숨는다). */}
      {standings?.promotionForecast != null && (
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {standings.promotionForecast.skippedByMajorityGuard
            ? '이번 시즌은 참가 팀 수가 적어 승강이 적용되지 않아요.'
            : `이번 시즌 승강 규칙 · 상위 ${standings.promotionForecast.promoteSlots}팀 승격 / 하위 ${standings.promotionForecast.relegateSlots}팀 강등 (지금 순위 기준 예상이에요)`}
        </p>
      )}

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {/* 이슈 4 — 아직 한 경기도 안 치른 리그는 표 자체가 "참가 팀"으로 바뀌므로
              제목도 그에 맞춰 바꾼다("순위표"라는 제목 아래 순위 아닌 목록이 뜨면
              혼란스럽다). */}
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">
            {preparingNoGames ? '참가 팀' : '순위표'}
          </h2>
          {series.state === 'completed' && <span className="tm-badge tm-badge-sm tm-badge-green">최종 순위</span>}
        </div>
        {/* 이슈 3(감사 보통) — 팀마다 치른 경기 수가 다른 이유(취소된 대진은 집계에서
            빠진다, R8)를 일정 쪽 "취소됨" 배지를 보고 스스로 유추하지 않아도 되게
            순위표 바로 아래에서 알려준다. 0건이면 아무것도 늘어나지 않는다. */}
        {standings !== undefined && standings.cancelledFixtureCount > 0 && (
          <p className="mb-2 text-xs text-[var(--text-muted)]">
            <span aria-hidden="true">•</span> 취소된 {standings.cancelledFixtureCount}경기는 집계에서 제외됐어요 — 팀마다 치른 경기 수가 다를 수 있어요.
          </p>
        )}
        {standingsQuery.isError ? (
          <ErrorState
            message={extractErrorMessage(standingsQuery.error, '순위표를 불러오지 못했어요.')}
            onRetry={() => void standingsQuery.refetch()}
          />
        ) : standings === undefined ? (
          <div className="tm-skeleton" style={{ height: 160, borderRadius: 12 }} />
        ) : standings.standings.length === 0 ? (
          <EmptyState title="아직 확정된 결과가 없어요" sub="리그 경기 결과가 확정되면 순위표가 나타나요." />
        ) : preparingNoGames ? (
          <ParticipantTeamList teams={standings.standings} />
        ) : (
          <>
          <div className="overflow-x-auto">
            {/* 승강 열이 6번째 칸으로 붙으면 필요 최소 폭이 440px 인데, 390px 화면의 본문 폭은
                358px 뿐이다(alpha 실측 — 헤더가 "승…"에서 끊기고 강등 행은 빨간 ↓만 남아
                "강등 (2부)" 글자가 화면 밖으로 밀렸다). overflow-x-auto 는 스크롤을 열어줄
                뿐 "잘렸다"는 신호를 주지 않으므로, sm(640px) 미만에서는 승강 열 자체를
                감추고 그 정보를 팀명 칸 아래 인라인으로 내려 **스크롤 없이** 읽히게 한다.
                sm 이상에서만 원래의 6칸 열 + 440px 최소 폭(순위38+팀160+전적56+승점38+
                득실38+승강116, 768px 실측 칸 폭 기준)을 적용한다.
                감사 H-2 — 이 폭·숨김 규칙은 확정 승강("승강")과 예상 승강("예상 승강")
                양쪽 모두에 그대로 적용한다(showPromotionColumn = 둘 중 하나라도 true). */}
            <table className={`w-full text-sm ${showPromotionColumn ? 'sm:min-w-[440px]' : ''}`}>
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th scope="col" className="py-2">순위</th>
                  <th scope="col">팀</th>
                  {/* 전적(승-무-패)은 별도 "경기"(참가 수) 칸을 두지 않는다 — 승+무+패
                      합이 곧 경기 수라 중복 지표다. 토너먼트 표
                      (tournament-standings-table.tsx 8~30행 주석 — 오너 결정 근거)와
                      같은 #/팀/전적/승점/득실 5칸 구성으로 통일한다. */}
                  <th scope="col">전적</th>
                  <th scope="col">승점</th>
                  <th scope="col">득실</th>
                  {/* 승강 열은 확정됐거나(promotionDecided) 예상값이 있을 때만 생긴다 —
                      둘 다 아니면 빈 칸만 늘어난 표가 "아직 안 정해졌다"보다 읽기 어렵다.
                      390px 미만에서는 이 열을 감추고 팀명 칸 아래 인라인으로 대체한다. */}
                  {showPromotionColumn && (
                    <th scope="col" className="hidden sm:table-cell">
                      {hasConfirmedPromotion ? '승강' : '예상 승강'}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {standings.standings.map((row) => (
                  <tr key={row.teamId} className="border-t border-[var(--border)]">
                    <td className="py-2 text-[var(--text-strong)]">{row.position}</td>
                    <th scope="row" className="text-left font-normal text-[var(--text-strong)]">
                      <TeamNameLink teamId={row.teamId} className="flex items-center gap-2">
                        <TeamAvatar seed={row.teamId} name={row.teamName} logoUrl={row.teamLogoUrl} size="sm" />
                        <span className="flex flex-col">
                          <span>{row.teamName}</span>
                          {
                            // sm 미만에서만 보이는 인라인 승강 표기 — 열이 숨겨진 화면에서
                            // 시즌의 결론(확정) 또는 지금까지의 예상이 스크롤 없이 바로 읽히게 한다.
                            // text-2xs 는 globals.css 에서 죽은 코드로 삭제된 유틸리티라 아무 크기도
                            // 적용되지 않고(그대로 두면 부모 크기를 물려받는다), 공개 화면 하한(12px)
                            // 미달이기도 하다 — text-xs(12px)를 쓴다.
                            // 이 블록은 JSX children 직속이 아니라 `&&`/삼항의 우변 JS 표현식이라
                            // `{/* */}` 형태의 JSX 주석은 여기서 문법 오류다 — `//` 라인 주석을 쓴다.
                          }
                          {showPromotionColumn && (
                            hasConfirmedPromotion
                              ? row.promotionKind != null && (
                                  <span className="text-xs sm:hidden">
                                    <PromotionBadge kind={row.promotionKind} toTierLabel={row.promotionToTierLabel} />
                                  </span>
                                )
                              : row.expectedPromotionKind != null && (
                                  <span className="text-xs sm:hidden">
                                    <ExpectedPromotionBadge kind={row.expectedPromotionKind} toTierLabel={row.expectedPromotionToTierLabel} />
                                  </span>
                                )
                          )}
                        </span>
                      </TeamNameLink>
                    </th>
                    {/* 1-0-0 압축 표기 — tournament-standings-table.tsx와 동일 정책.
                        스크린리더에는 aria-label로 풀어서 읽힌다. */}
                    <td aria-label={`${row.wins}승 ${row.draws}무 ${row.losses}패`}>
                      {row.wins}-{row.draws}-{row.losses}
                    </td>
                    <td>{row.points}</td>
                    <td>{row.goalsFor}-{row.goalsAgainst}</td>
                    {showPromotionColumn && (
                      <td className="hidden sm:table-cell">
                        {hasConfirmedPromotion ? (
                          row.promotionKind == null ? (
                            <span className="text-[var(--text-muted)]">—</span>
                          ) : (
                            <PromotionBadge kind={row.promotionKind} toTierLabel={row.promotionToTierLabel} />
                          )
                        ) : row.expectedPromotionKind == null ? (
                          <span className="text-[var(--text-muted)]">—</span>
                        ) : (
                          <ExpectedPromotionBadge kind={row.expectedPromotionKind} toTierLabel={row.expectedPromotionToTierLabel} />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 감사 H-5 — tie-break 를 전부 소진하고 팀ID 사전순 폴백으로 순위가 갈린
              그룹이 있으면 알려준다. 대부분의 시즌은 빈 배열이라 아무것도 늘어나지 않는다. */}
          {(standings.tieBreakGroups?.length ?? 0) > 0 && (
            <div className="mt-2 rounded-lg bg-[var(--surface-soft)] p-3 text-xs text-[var(--text-muted)]">
              <p>
                <span aria-hidden="true">•</span> 모든 순위 기준이 같아 팀 순서가 임의로 정해진 팀이 있어요.
              </p>
              <ul className="mt-1 space-y-0.5">
                {standings.tieBreakGroups.map((group) => (
                  <li key={group.teamIds.join('-')} className="text-[var(--text-strong)]">{group.teamNames.join(', ')}</li>
                ))}
              </ul>
            </div>
          )}
          </>
        )}

        {standings !== undefined && standings.pendingFixtures.length > 0 && (
          <div className="mt-3 rounded-lg bg-[var(--surface-soft)] p-3">
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <span aria-hidden="true">•</span>
              {/* "확인 중"을 별도 텍스트 노드로 둔다 — 뒤에 카운트 문구를 이어붙이면
                  screen.getByText('확인 중')이 정확히 일치하는 텍스트 노드를 못 찾아
                  테스트가 항상 실패한다(RTL 기본 매처는 exact match). */}
              <span className="font-medium text-[var(--text-strong)]">확인 중</span>
              <span>— {standings.pendingFixtures.length}경기가 아직 결과 확정 전이에요</span>
            </div>
            <ul className="mt-2 space-y-1">
              {standings.pendingFixtures.map((fixture) => (
                <li key={fixture.teamMatchId}>
                  <Link
                    href={`/team-matches/${fixture.teamMatchId}`}
                    className="tm-pressable flex min-h-[44px] flex-wrap items-center justify-between gap-2 rounded-lg px-2 text-sm text-[var(--text-strong)] hover:bg-[var(--grey100)]"
                  >
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <FixtureTeamLabel teamId={fixture.homeTeamId} lookup={teamLookup} fallback="홈팀 정보 없음" />
                      <span aria-hidden="true" className="text-[var(--text-muted)]">vs</span>
                      <FixtureTeamLabel teamId={fixture.awayTeamId} lookup={teamLookup} fallback="상대팀 미정" />
                    </span>
                    <span className="text-[var(--text-muted)]">
                      {formatTournamentDateTimeShort(fixture.startAt) ?? '일정 미정'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">경기 일정</h2>
          {/* 이슈 3 — 대진은 항상 오래된 순으로 오므로 시즌 중반 리그는 "다음 경기"가
              이미 끝난 경기 여러 개 아래 묻힌다. 정렬 자체를 뒤집는 대신(과거 기록을
              찾으러 온 사람에게는 오름차순이 자연스럽다) "예정만 보기" 필터를 둬서
              지난 경기를 걷어낼 수 있게 하고, 아래에서 다음 경기 행 자체도 강조한다. */}
          {fixtures.length > 0 && (
            <div role="group" aria-label="경기 일정 필터" className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setShowUpcomingOnly(false)}
                aria-pressed={!showUpcomingOnly}
                className={`tm-chip${!showUpcomingOnly ? ' tm-chip-active' : ''}`}
              >
                전체
              </button>
              <button
                type="button"
                onClick={() => setShowUpcomingOnly(true)}
                aria-pressed={showUpcomingOnly}
                className={`tm-chip${showUpcomingOnly ? ' tm-chip-active' : ''}`}
              >
                예정만
              </button>
            </div>
          )}
        </div>
        {fixtures.length === 0 ? (
          <EmptyState title="아직 등록된 경기가 없어요" sub="대진이 확정되면 경기 일정이 여기에 나타나요." />
        ) : visibleFixtures.length === 0 ? (
          <EmptyState title="예정된 경기가 없어요" sub="'전체'를 눌러 지난 경기를 다시 볼 수 있어요." />
        ) : (
          <ul className="space-y-2">
            {visibleFixtures.map((fixture) => {
              const statusMeta = fixtureStatusMeta(fixture.status);
              const result = fixtureResultLabel(fixture);
              const isNextUpcoming = fixture.teamMatchId === nextUpcomingFixtureId;
              return (
                <li key={fixture.teamMatchId}>
                  <Link
                    href={`/team-matches/${fixture.teamMatchId}`}
                    className={`tm-pressable tm-list-row-interactive flex min-h-[44px] flex-col gap-2 rounded-xl border bg-[var(--card-surface)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${isNextUpcoming ? 'border-[var(--blue500)]' : 'border-[var(--border)]'}`}
                  >
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {/* 다음 경기는 컬러(파란 테두리)만으로 구분하지 않는다 — 뱃지 텍스트를 함께 싣는다. */}
                      {isNextUpcoming && <span className="tm-badge tm-badge-sm tm-badge-blue">다음 경기</span>}
                      <FixtureTeamLabel teamId={fixture.homeTeamId} lookup={teamLookup} fallback="홈팀 정보 없음" />
                      <span aria-hidden="true" className="text-[var(--text-muted)]">vs</span>
                      <FixtureTeamLabel teamId={fixture.awayTeamId} lookup={teamLookup} fallback="상대팀 미정" />
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] sm:text-sm">
                      <span>{formatTournamentDateTimeShort(fixture.startAt) ?? '일정 미정'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{fixture.placeName || '장소 미정'}</span>
                      <span className={`tm-badge tm-badge-sm ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                      {/* 이슈 2(감사 보통) — 몰수 스코어는 "몰수" 뱃지가 붙어도 숫자 자체가
                          bold 로 강조돼 실제 득점(예: 1:0 승리)과 똑같은 무게로 읽혔다.
                          몰수 스코어는 더 이상 굵게 강조하지 않고, 뱃지 옆에 "관례 스코어"임을
                          텍스트로 덧붙인다 — 기존 "몰수" 뱃지(정확히 이 문구를 단언하는
                          테스트가 있다)는 그대로 두고 별도 span으로만 보강한다. */}
                      <span className={result.hasScore && !result.isForfeit ? 'font-bold text-[var(--text-strong)]' : 'text-[var(--text-strong)]'}>
                        {result.text}
                      </span>
                      {result.isForfeit ? (
                        <>
                          <span className="tm-badge tm-badge-sm tm-badge-grey">몰수</span>
                          <span className="text-[var(--text-muted)]">(관례 스코어)</span>
                        </>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">득점 순위</h2>
        {recordsQuery.isError ? (
          <ErrorState
            message={extractErrorMessage(recordsQuery.error, '기록을 불러오지 못했어요.')}
            onRetry={() => void recordsQuery.refetch()}
          />
        ) : records === undefined ? (
          <div className="tm-skeleton" style={{ height: 80, borderRadius: 12 }} />
        ) : records.goals.length === 0 ? (
          <EmptyState title="아직 기록이 없어요" sub="확정된 경기 결과가 쌓이면 득점 순위가 나타나요." />
        ) : (
          <ol className="space-y-1">
            {records.goals.map((row, index) => (
              <li key={row.userId} className="flex justify-between text-sm text-[var(--text-strong)]">
                <span>{goalRanks[index]}. {row.nickname ?? '선수'}</span>
                <span>{row.goals}골</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">도움 순위</h2>
        {recordsQuery.isError ? (
          <ErrorState
            message={extractErrorMessage(recordsQuery.error, '기록을 불러오지 못했어요.')}
            onRetry={() => void recordsQuery.refetch()}
          />
        ) : records === undefined ? (
          <div className="tm-skeleton" style={{ height: 80, borderRadius: 12 }} />
        ) : records.assists.length === 0 ? (
          <EmptyState title="아직 기록이 없어요" sub="확정된 경기 결과가 쌓이면 도움 순위가 나타나요." />
        ) : (
          <ol className="space-y-1">
            {records.assists.map((row, index) => (
              <li key={row.userId} className="flex justify-between text-sm text-[var(--text-strong)]">
                <span>{assistRanks[index]}. {row.nickname ?? '선수'}</span>
                <span>{row.assists}도움</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
