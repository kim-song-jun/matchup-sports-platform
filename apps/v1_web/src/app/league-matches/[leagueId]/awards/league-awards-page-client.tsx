'use client';

import Link from 'next/link';
import { Trophy, Medal } from 'lucide-react';
import { useMemo } from 'react';
import { Card, EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { TeamAvatar } from '@/components/v1-ui/team-avatar';
import { useV1LeagueMatch, useV1LeagueMatchPlayerRecords, useV1LeagueMatchStandings } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { LEAGUE_STATE_META } from '@/lib/league-state-meta';
// tournaments/[id]/awards/awards-page-client.tsx 의 구조(포디움 히어로 → 개인 어워드 →
// 하단 네비)와 카피 관례("○○, 우승을 축하드려요! 🎉")를 그대로 따른다 — 그 파일은 읽기만
// 하고 수정하지 않는다(그룹 C 배정 범위 밖). PromotionBadge/competitionRanks는 순위표
// 화면(league-match-standings-client.tsx, 같은 그룹 C 배정)이 이미 검증된 형태로 갖고
// 있어 새로 만들지 않고 그대로 가져다 쓴다 — 같은 정보가 두 화면에서 다르게 그려지면
// 같은 제품으로 보이지 않는다.
import { PromotionBadge, competitionRanks } from '../league-match-standings-client';
import type {
  V1LeagueChampionTeam,
  V1LeaguePlayerRecordRow,
  V1LeagueStandingRow,
} from '@/types/league-match';
import { leagueRecordEmptySub } from '../league-record-empty-copy';

/** 아직 종료되지 않은 리그로 딥링크했을 때 — 빈 화면 대신 안내 + 되돌아갈 동선. */
function NotCompletedNotice({ leagueId, state }: { leagueId: string; state: 'draft' | 'active' }) {
  const msg =
    state === 'draft'
      ? '리그가 아직 시작되지 않았어요. 시즌이 끝나면 시상 결과를 볼 수 있어요.'
      : '리그가 진행 중이에요. 시즌이 끝나면 시상 결과가 공개돼요.';
  return (
    <Card pad={24} className="text-center">
      <div className="mb-2 flex justify-center" aria-hidden="true">
        <Medal size={32} className="tm-medal-gold" strokeWidth={1.8} />
      </div>
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">{msg}</p>
      <Link href={`/league-matches/${leagueId}`} className="tm-btn tm-btn-sm tm-btn-outline mt-4">
        리그 순위표 보러가기
      </Link>
    </Card>
  );
}

/**
 * 우승 히어로 — 공동 우승(champions.length > 1)을 명시적으로 표현한다. 리그는 대회
 * 결승전 같은 단판 승부가 없어 포디움(2/1/3위 단상) 은유가 맞지 않으므로, 대신 우승팀
 * 전원을 트로피 아래 나란히 두는 구조로 축하 카피(tournaments awards와 동일 어조)를
 * 낸다. champions가 빈 배열(이론상 발생하지 않아야 하지만 방어적으로) 이면 아무것도
 * 그리지 않는다 — 아래 최종 순위 섹션이 그 정보를 대신 담는다.
 */
function ChampionsHero({ champions }: { champions: V1LeagueChampionTeam[] }) {
  if (champions.length === 0) return null;
  const isCoChampion = champions.length > 1;
  return (
    <section className="mb-5">
      <h2 className="tm-hub-section-title mb-2">시상 결과</h2>
      <Card pad={20} className="text-center">
        <p className="text-sm text-[var(--text-strong)]">
          {champions.map((team, index) => (
            <span key={team.teamId}>
              {index > 0 && ', '}
              <strong>{team.teamName}</strong>
            </span>
          ))}
          {isCoChampion ? ', 공동 우승을 축하드려요! 🎉' : ', 우승을 축하드려요! 🎉'}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-5">
          {champions.map((team) => (
            // D3(2026-08-24): 시상 화면에서도 팀 이름은 팀 상세로 간다. 우승팀을 보고
            // "이 팀 뭐 하는 팀이지?" 로 이어지는 게 가장 자연스러운 자리인데 그동안
            // 여기서 길이 끊겼다.
            <Link
              key={team.teamId}
              href={`/teams/${team.teamId}`}
              className="tm-pressable flex flex-col items-center gap-2"
            >
              <TeamAvatar seed={team.teamId} name={team.teamName} logoUrl={team.teamLogoUrl} size="lg" />
              <span className="inline-flex items-center gap-1 text-sm font-bold text-[var(--text-strong)]">
                <Trophy size={14} className="tm-medal-gold" aria-hidden="true" />
                {team.teamName}
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </section>
  );
}

/**
 * 최종 순위 + 승강 결과. 순위표 화면(league-match-standings-client.tsx)의 표를 그대로
 * 옮기지 않는다 — 이 화면은 시즌의 "결론"을 보여주는 요약이지 전적(승-무-패) 통계
 * 화면이 아니다. 그래서 순위/팀/승점/승강만 남긴 압축 리스트를 쓴다(전체 전적은 순위표
 * 화면에서 이미 볼 수 있다). 우승팀은 트로피 아이콘으로 다시 한번 표시해, 위 히어로와
 * 이 리스트가 "같은 팀 이야기"임을 스크롤해도 계속 알 수 있게 한다.
 */
function FinalStandingsSection({
  standings,
  championTeamIds,
  hasConfirmedPromotion,
}: {
  standings: V1LeagueStandingRow[];
  championTeamIds: Set<string>;
  hasConfirmedPromotion: boolean;
}) {
  if (standings.length === 0) {
    return (
      <section className="mb-5">
        <h2 className="tm-hub-section-title mb-2">최종 순위</h2>
        <EmptyState title="확정된 순위가 없어요" sub="리그 경기 결과가 확정되면 최종 순위가 나타나요." />
      </section>
    );
  }
  return (
    <section className="mb-5">
      <h2 className="tm-hub-section-title mb-2">최종 순위</h2>
      <Card pad={0} className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">
          {standings.map((row) => (
            <li key={row.teamId} className="text-sm">
              <Link
                href={`/teams/${row.teamId}`}
                className="tm-pressable tm-list-row-interactive flex min-h-[44px] items-center gap-2 px-3 py-2"
              >
              <span className="w-5 shrink-0 text-[var(--text-muted)]">{row.position}</span>
              <TeamAvatar seed={row.teamId} name={row.teamName} logoUrl={row.teamLogoUrl} size="sm" />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-[var(--text-strong)]">{row.teamName}</span>
                {championTeamIds.has(row.teamId) && (
                  <Trophy size={13} className="tm-medal-gold shrink-0" aria-hidden="true" />
                )}
              </span>
              <span className="shrink-0 text-xs text-[var(--text-muted)]">{row.points}승점</span>
              {hasConfirmedPromotion && row.promotionKind != null && (
                <span className="shrink-0 text-xs">
                  <PromotionBadge kind={row.promotionKind} toTierLabel={row.promotionToTierLabel} />
                </span>
              )}
              </Link>
            </li>
          ))}
        </ul>
      </Card>
      {/* 컬러만으로 정보를 전달하지 않는다는 프로젝트 규칙과 별개로, 뱃지 자체의 기호
          범례는 순위표 화면에 이미 있다 — 이 화면은 최종 결과만 압축해 보여주는 요약이라
          범례를 다시 싣지 않고 승강 뱃지 컴포넌트(PromotionBadge)가 이미 텍스트+기호를
          함께 쓴다는 사실에 기댄다. */}
    </section>
  );
}

/** 득점왕 / 도움왕 공용 섹션 — 공동 1위(동점) 전원을 트로피로 함께 강조한다. */
function LeaderboardSection({
  title,
  rows,
  unit,
  emptySub,
}: {
  title: string;
  rows: V1LeaguePlayerRecordRow[];
  unit: (row: V1LeaguePlayerRecordRow) => number;
  emptySub: string;
}) {
  const ranks = useMemo(() => competitionRanks(rows.map(unit)), [rows, unit]);
  if (rows.length === 0) {
    return (
      <section className="mb-5">
        <h2 className="tm-hub-section-title mb-2">{title}</h2>
        <EmptyState title="아직 기록이 없어요" sub={emptySub} />
      </section>
    );
  }
  return (
    <section className="mb-5">
      <h2 className="tm-hub-section-title mb-2">{title}</h2>
      <Card pad={12}>
        <ol className="space-y-2">
          {rows.map((row, index) => {
            const isTop = ranks[index] === 1;
            return (
              <li key={row.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="inline-flex min-w-0 items-center gap-2">
                  {isTop && <Medal size={14} className="tm-medal-gold shrink-0" aria-hidden="true" />}
                  <span className={`truncate ${isTop ? 'font-bold text-[var(--text-strong)]' : 'text-[var(--text-strong)]'}`}>
                    {ranks[index]}. {row.nickname ?? '선수'}
                  </span>
                </span>
                <span className="shrink-0 text-[var(--text-muted)]">{unit(row)}</span>
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}

function AwardsPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-3 px-4 py-6">
      <div className="tm-skeleton" style={{ height: 180, borderRadius: 16 }} />
      <div className="tm-skeleton" style={{ height: 140, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 100, borderRadius: 12 }} />
    </div>
  );
}

export function LeagueAwardsPageClient({ leagueId }: { leagueId: string }) {
  const seriesQuery = useV1LeagueMatch(leagueId);
  const standingsQuery = useV1LeagueMatchStandings(leagueId);
  const recordsQuery = useV1LeagueMatchPlayerRecords(leagueId);
  const series = seriesQuery.data;

  // 잘못된 leagueId 딥링크(404 등) — 순위표 화면과 동일한 처리(ErrorState + 재시도).
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

  if (series === undefined) return <AwardsPageSkeleton />;

  if (series.state !== 'completed') {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <NotCompletedNotice leagueId={leagueId} state={series.state} />
      </div>
    );
  }

  const standings = standingsQuery.data;
  const records = recordsQuery.data;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="sr-only">{series.title} 시즌 결산</h1>
      <p className="mb-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        {series.tierLabel != null && <span className="tm-badge tm-badge-sm tm-badge-blue">{series.tierLabel}</span>}
        <span>{series.title}</span>
        <span className={`tm-badge tm-badge-sm ${LEAGUE_STATE_META[series.state].badgeClass}`}>
          {LEAGUE_STATE_META[series.state].label}
        </span>
      </p>

      {standingsQuery.isError ? (
        <ErrorState
          message={extractErrorMessage(standingsQuery.error, '시즌 결산 정보를 불러오지 못했어요.')}
          onRetry={() => void standingsQuery.refetch()}
        />
      ) : standings === undefined ? (
        <AwardsPageSkeleton />
      ) : (
        <>
          <ChampionsHero champions={standings.champions} />
          <FinalStandingsSection
            standings={standings.standings}
            championTeamIds={new Set(standings.champions.map((c) => c.teamId))}
            hasConfirmedPromotion={standings.promotionDecided}
          />
        </>
      )}

      {recordsQuery.isError ? (
        <ErrorState
          message={extractErrorMessage(recordsQuery.error, '기록을 불러오지 못했어요.')}
          onRetry={() => void recordsQuery.refetch()}
        />
      ) : records === undefined ? (
        <div className="tm-skeleton" style={{ height: 140, borderRadius: 12 }} />
      ) : (
        <>
          {/*
            순위가 비는 이유가 두 가지이고 처방이 다르다 — 동의 게이팅으로 가려진 것인지,
            아직 확정 결과가 없는 것인지. 순위표 화면과 **같은 문구**를 쓰도록 단일 소스
            (leagueRecordEmptySub)를 거친다.
          */}
          <LeaderboardSection
            title="득점왕"
            rows={records.goals}
            unit={(row) => row.goals}
            emptySub={leagueRecordEmptySub('goals', records.hiddenByEligibility)}
          />
          <LeaderboardSection
            title="도움왕"
            rows={records.assists}
            unit={(row) => row.assists}
            emptySub={leagueRecordEmptySub('assists', records.hiddenByEligibility)}
          />
        </>
      )}

      <nav aria-label="리그 페이지 이동" className="mt-2 border-t border-[var(--border)] pt-4">
        <Link href={`/league-matches/${leagueId}`} className="tm-btn tm-btn-md tm-btn-ghost">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 6-6 6 6 6" />
          </svg>
          리그 상세로
        </Link>
      </nav>
    </div>
  );
}
