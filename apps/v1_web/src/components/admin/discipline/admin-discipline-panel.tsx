'use client';

import { useId, useState } from 'react';
import { Search } from 'lucide-react';
import { AdminEmpty, AdminListSkeleton } from '@/components/admin';
import {
  useV1AdminDiscipline,
  type V1AdminDisciplineOverview,
  type V1AdminDisciplinePlayer,
} from '@/hooks/use-v1-admin-discipline';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { rosterPersonLabel } from '@/lib/roster-presentation';

type Filter = 'SUSPENDED' | 'IMMINENT' | 'ALL';

const STATUS_BADGE: Record<V1AdminDisciplinePlayer['status'], string> = {
  SUSPENDED: 'tm-badge-red',
  IMMINENT: 'tm-badge-orange',
  CARDS: 'tm-badge-grey',
};

/** 규정 한 줄 — "경고 2장마다 1경기 · 퇴장 1경기 정지". 꺼진 규정은 말하지 않는다. */
export function disciplineRulesSummary(rules: NonNullable<V1AdminDisciplineOverview['rules']>): string {
  const parts = [
    rules.yellowAccumulationLimit === null ? null : `경고 ${rules.yellowAccumulationLimit}장마다 1경기`,
    rules.redCardSuspensionMatches === null ? null : `퇴장 ${rules.redCardSuspensionMatches}경기`,
  ].filter((part): part is string => part !== null);
  return `${parts.join(' · ')} 정지 · 결과가 바뀌면 바로 다시 계산해요`;
}

function statusLabel(player: V1AdminDisciplinePlayer, rules: NonNullable<V1AdminDisciplineOverview['rules']>): string {
  if (player.status === 'SUSPENDED') return `출전정지 ${player.remainingMatches}경기`;
  if (player.status === 'IMMINENT') {
    const limit = rules.yellowAccumulationLimit ?? 0;
    return `경고 ${limit > 0 ? player.yellowTotal % limit : player.yellowTotal}/${limit}장`;
  }
  return '카드 받음';
}

function caption(player: V1AdminDisciplinePlayer): string {
  const cards = `경고 ${player.yellowTotal}장 · 퇴장 ${player.redTotal}회`;
  const next = player.nextGame;
  if (next === null) return `${cards} · 남은 경기가 없어요`;
  const when = formatTournamentDateTimeShort(next.startAt) ?? '일정 미정';
  const game = `${when}${next.opponentName === null ? '' : ` vs ${next.opponentName}`}`;
  if (player.status === 'SUSPENDED') {
    return `${cards} · ${player.reason ?? '카드 누적'} · 다음 경기 ${game}에 못 뛰어요`;
  }
  if (player.status === 'IMMINENT') return `${cards} · 한 장 더 받으면 다음 경기부터 정지예요`;
  return cards;
}

/**
 * 대회·리그 징계 현황(MD-QA #191) — 정지 중 / 경고 임박 / 카드 받은 선수를 팀과 상관없이 모아 본다.
 * 플랫폼 어드민 전용이고, 판정은 경기 명단과 같은 서버 계산이라 여기서 다시 계산하지 않는다.
 */
export function AdminDisciplinePanel({ competitionId }: { competitionId: string }) {
  const { data, isPending, isError, error, refetch } = useV1AdminDiscipline(competitionId);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [search, setSearch] = useState('');
  const searchId = useId();

  if (isPending) {
    return (
      <div className="p-4">
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminListSkeleton rows={4} />
        </div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-4">
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminEmpty
            role="alert"
            title="징계 현황을 불러오지 못했어요"
            description={extractErrorMessage(error, '잠시 후 다시 시도해 주세요.')}
            action={
              <button
                type="button"
                onClick={() => void refetch()}
                className="min-h-[44px] px-4 rounded-lg border border-[var(--border)] font-semibold focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                다시 시도
              </button>
            }
          />
        </div>
      </div>
    );
  }
  const { rules } = data;
  if (rules === null) {
    return (
      <div className="p-4">
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminEmpty
            title="정지 규정이 없는 대회예요"
            description="경고 누적·퇴장 정지 규정을 켜면 정지 중인 선수와 경고 임박 선수가 여기에 모여요."
          />
        </div>
      </div>
    );
  }

  // 정지 중인 선수가 있으면 그것부터, 없으면 카드 받은 선수 전체를 먼저 보여 준다.
  const active: Filter = filter ?? (data.summary.suspended > 0 ? 'SUSPENDED' : 'ALL');
  const keyword = search.trim().toLowerCase();
  const rows = data.players.filter((player) => {
    if (active === 'SUSPENDED' && player.status !== 'SUSPENDED') return false;
    if (active === 'IMMINENT' && player.status !== 'IMMINENT') return false;
    if (keyword === '') return true;
    return [player.displayName, player.realName ?? '', player.teamName].some((text) => text.toLowerCase().includes(keyword));
  });
  const tabs: { key: Filter; label: string; count: number }[] = [
    { key: 'SUSPENDED', label: '정지 중', count: data.summary.suspended },
    { key: 'IMMINENT', label: '경고 임박', count: data.summary.imminent },
    { key: 'ALL', label: '카드 받은 선수', count: data.summary.withCards },
  ];

  return (
    <div className="tm-content-enter p-4">
      <div className="mb-4">
        <h3 className="text-[length:var(--font-size-body)] font-bold text-[var(--text-strong)]">징계 현황</h3>
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] mt-0.5">{disciplineRulesSummary(rules)}</p>
      </div>

      <div role="group" aria-label="징계 현황 보기" className="flex flex-wrap gap-2 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className="tm-chip"
            aria-pressed={active === tab.key}
            onClick={() => setFilter(tab.key)}
          >
            {tab.label} {tab.count}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <label htmlFor={searchId} className="sr-only">선수 이름 또는 팀으로 찾기</label>
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" aria-hidden="true">
          <Search size={16} />
        </span>
        <input
          id={searchId}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="선수 이름·팀으로 찾기"
          className="w-full h-[44px] pl-9 pr-3 text-[length:var(--font-size-label)] bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
        />
      </div>

      {rows.length === 0 ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminEmpty
            title={keyword !== '' ? '검색 결과가 없어요' : active === 'SUSPENDED' ? '지금 출전정지인 선수가 없어요' : active === 'IMMINENT' ? '경고 임박 선수가 없어요' : '카드를 받은 선수가 없어요'}
            description={keyword !== '' ? '다른 이름이나 팀으로 다시 찾아 보세요.' : undefined}
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2 list-none m-0 p-0">
          {rows.map((player) => (
            <li
              key={player.userId}
              className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] px-4 py-3 flex flex-col gap-1.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)] break-words">
                  {rosterPersonLabel(player)}
                </span>
                <span className="tm-badge tm-badge-sm tm-badge-grey">{player.teamName}</span>
                <span className={`tm-badge tm-badge-sm ${STATUS_BADGE[player.status]}`}>{statusLabel(player, rules)}</span>
              </div>
              <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)] m-0">{caption(player)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
