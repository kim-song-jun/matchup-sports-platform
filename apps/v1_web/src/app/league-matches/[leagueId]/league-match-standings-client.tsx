'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useV1LeagueMatch, useV1LeagueMatchPlayerRecords, useV1LeagueMatchStandings } from '@/hooks/use-v1-api';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { extractErrorMessage } from '@/lib/error-message';
import { LEAGUE_STATE_META } from '@/lib/league-state-meta';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1LeagueFixture } from '@/types/league-match';

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
 * 점수 필드(homeScore/awayScore)는 값이 없을 수 있다(미확정 대진) — 그때는 0:0으로
 * 오인되지 않게 상태 기반 문구로 대체한다.
 *
 * **취소된 대진은 점수가 있어도 점수를 보여주지 않는다.** 순위표는 취소 대진을 완전히
 * 제외하는데(R8) 일정 목록에만 "취소됨 1 : 0"이 굵게 남으면, 존재하는 점수가 왜 순위에
 * 반영되지 않는지 알 수 없다 — 같은 화면 안에서 두 집계가 서로 다른 말을 하게 된다.
 * 대신 "집계 제외"라고 명시해 그 경기가 기록에서 빠졌음을 그대로 읽히게 한다.
 * (취소 대진에 '예정'이 붙던 문제도 여기서 함께 사라진다.)
 */
function fixtureResultLabel(fixture: V1LeagueFixture): { text: string; hasScore: boolean } {
  if (fixture.status === 'cancelled') {
    return { text: '집계 제외', hasScore: false };
  }
  if (typeof fixture.homeScore === 'number' && typeof fixture.awayScore === 'number') {
    return { text: `${fixture.homeScore} : ${fixture.awayScore}`, hasScore: true };
  }
  return { text: fixture.status === 'completed' ? '결과 대기' : '예정', hasScore: false };
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
    <span className="inline-flex items-center gap-1.5">
      <TeamAvatar seed={teamId ?? fallback} name={name} logoUrl={entry?.logoUrl ?? null} size="sm" />
      <span className="text-[var(--text-strong)]">{name}</span>
    </span>
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
          <span className="rounded-md bg-blue-100 px-2 py-0.5 font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
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
      {standings !== undefined && (
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          순위 규칙: {standings.tieBreakOrder.map((c) => TIE_BREAK_LABELS[c] ?? c).join(' → ')}
        </p>
      )}

      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">순위표</h2>
          {series.state === 'completed' && <span className="tm-badge tm-badge-sm tm-badge-green">최종 순위</span>}
        </div>
        {standingsQuery.isError ? (
          <ErrorState
            message={extractErrorMessage(standingsQuery.error, '순위표를 불러오지 못했어요.')}
            onRetry={() => void standingsQuery.refetch()}
          />
        ) : standings === undefined ? (
          <div className="tm-skeleton" style={{ height: 160, borderRadius: 12 }} />
        ) : standings.standings.length === 0 ? (
          <EmptyState title="아직 확정된 결과가 없어요" sub="리그 경기 결과가 확정되면 순위표가 나타나요." />
        ) : (
          <div className="overflow-x-auto">
            {/* 승강 열이 붙으면 6칸이 되는데, 390px 컨테이너(358px)에서는 승점·득실 칸이
                24px 까지 좁아져 두 글자 헤더가 서로 붙어 버린다(alpha 실측). 이미 감싸고
                있는 overflow-x-auto 가 일을 하려면 표에 최소 폭이 있어야 하므로, 승강 열이
                있을 때만 최소 폭을 줘 가로 스크롤로 넘긴다 — 확정 전 5칸일 때는 지금처럼
                컨테이너에 딱 맞춰 스크롤 없이 보인다.
                440px = 순위 38 + 팀 160 + 전적 56 + 승점 38 + 득실 38 + 승강 116 (768px
                실측 칸 폭에서 팀 칸만 최소치로 줄인 값). */}
            <table className={`w-full text-sm ${standings.promotionDecided ? 'min-w-[440px]' : ''}`}>
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
                  {/* 승강 열은 확정된 뒤에만 생긴다 — 확정 전에 빈 칸만 늘어난 표는
                      "아직 안 정해졌다"보다 읽기 어렵고, 기존 순위표 모양도 그대로 유지된다. */}
                  {standings.promotionDecided && <th scope="col">승강</th>}
                </tr>
              </thead>
              <tbody>
                {standings.standings.map((row) => (
                  <tr key={row.teamId} className="border-t border-[var(--border)]">
                    <td className="py-2 text-[var(--text-strong)]">{row.position}</td>
                    <th scope="row" className="text-left font-normal text-[var(--text-strong)]">
                      <span className="flex items-center gap-2">
                        <TeamAvatar seed={row.teamId} name={row.teamName} logoUrl={row.teamLogoUrl} size="sm" />
                        <span>{row.teamName}</span>
                      </span>
                    </th>
                    {/* 1-0-0 압축 표기 — tournament-standings-table.tsx와 동일 정책.
                        스크린리더에는 aria-label로 풀어서 읽힌다. */}
                    <td aria-label={`${row.wins}승 ${row.draws}무 ${row.losses}패`}>
                      {row.wins}-{row.draws}-{row.losses}
                    </td>
                    <td>{row.points}</td>
                    <td>{row.goalsFor}-{row.goalsAgainst}</td>
                    {standings.promotionDecided && (
                      <td>
                        {row.promotionKind == null ? (
                          <span className="text-[var(--text-muted)]">—</span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 whitespace-nowrap font-semibold ${PROMOTION_META[row.promotionKind].className}`}>
                            <span aria-hidden="true">{PROMOTION_META[row.promotionKind].glyph}</span>
                            {PROMOTION_META[row.promotionKind].label}
                            {row.promotionKind === 'promoted' || row.promotionKind === 'relegated'
                              ? row.promotionToTierLabel !== null && (
                                  <span className="font-normal text-[var(--text-muted)]">({row.promotionToTierLabel})</span>
                                )
                              : null}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-strong)]">경기 일정</h2>
        {series.fixtures.length === 0 ? (
          <EmptyState title="아직 등록된 경기가 없어요" sub="대진이 확정되면 경기 일정이 여기에 나타나요." />
        ) : (
          <ul className="space-y-2">
            {series.fixtures.map((fixture) => {
              const statusMeta = fixtureStatusMeta(fixture.status);
              const result = fixtureResultLabel(fixture);
              return (
                <li key={fixture.teamMatchId}>
                  <Link
                    href={`/team-matches/${fixture.teamMatchId}`}
                    className="tm-pressable tm-list-row-interactive flex min-h-[44px] flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <FixtureTeamLabel teamId={fixture.homeTeamId} lookup={teamLookup} fallback="홈팀 정보 없음" />
                      <span aria-hidden="true" className="text-[var(--text-muted)]">vs</span>
                      <FixtureTeamLabel teamId={fixture.awayTeamId} lookup={teamLookup} fallback="상대팀 미정" />
                    </span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] sm:text-sm">
                      <span>{formatTournamentDateTimeShort(fixture.startAt) ?? '일정 미정'}</span>
                      <span aria-hidden="true">·</span>
                      <span>{fixture.placeName || '장소 미정'}</span>
                      <span className={`tm-badge tm-badge-sm ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                      <span className={result.hasScore ? 'font-bold text-[var(--text-strong)]' : ''}>{result.text}</span>
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
                <span>{index + 1}. {row.nickname ?? '선수'}</span>
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
                <span>{index + 1}. {row.nickname ?? '선수'}</span>
                <span>{row.assists}도움</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
