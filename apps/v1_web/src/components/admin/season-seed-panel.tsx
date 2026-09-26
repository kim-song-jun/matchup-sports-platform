'use client';

import { useMemo, useState } from 'react';
import { EntityPicker, type EntityPickerItem } from '@/components/admin/entity-picker';
import { useV1Teams } from '@/hooks/use-v1-api';
import type { V1SeedSeasonPayload } from '@/types/league-series';

/**
 * 시즌 1 티어별 팀 배정 패널.
 *
 * 1시즌차에는 승강 이력이 없어 어드민이 직접 배정한다(Task 153 확정 — ELO 자동 시딩은 범위 밖).
 * 서버 API(`POST /admin/league-series/:id/seasons/seed`)는 처음부터 있었지만 이걸 호출하는
 * 화면이 없어서, 시리즈를 만들어도 시즌을 만들 방법이 없었다 — 시즌이 0개면 "승강 후보 계산"
 * 버튼도 시즌 카드 안에만 렌더되므로 나타나지 않아 티어·승강 기능 전체가 화면에서 도달
 * 불가능했다(2026-08-21 재감사). 단발 리그 생성 폼은 seriesId/tier/seasonNo 를 받지 않아
 * 대안 경로도 없다.
 *
 * 검증은 서버(`seedSeason`)가 소유하고 여기서는 같은 조건을 **미리** 알려 주기만 한다 —
 * 제출하고 나서 422 를 보는 것보다 버튼이 왜 잠겼는지 읽히는 편이 낫다.
 */
export function SeasonSeedPanel({
  seriesTitle,
  tierCount,
  sportId,
  submitting,
  onSeed,
}: {
  seriesTitle: string;
  tierCount: number;
  /** 시리즈 종목. 다른 종목 팀은 서버가 거부하므로 목록에서도 고를 수 없게 한다. */
  sportId: string;
  submitting: boolean;
  onSeed: (payload: V1SeedSeasonPayload) => void;
}) {
  const tierNumbers = useMemo(
    () => Array.from({ length: tierCount }, (_, index) => index + 1),
    [tierCount],
  );
  const [titles, setTitles] = useState<Record<number, string>>(() =>
    Object.fromEntries(tierNumbers.map((tier) => [tier, `${seriesTitle} 1시즌 ${tier}부`])),
  );
  const [picked, setPicked] = useState<Record<number, EntityPickerItem[]>>(() =>
    Object.fromEntries(tierNumbers.map((tier) => [tier, [] as EntityPickerItem[]])),
  );
  const [search, setSearch] = useState('');
  const [activeTier, setActiveTier] = useState<number | null>(null);
  // 시즌 기간. 비워 두면 서버가 오늘 + 90일로 채운다 — 그 폴백을 그대로 두되,
  // 운영자가 정할 수 있게 열어 둔다(이후 시즌이 이 길이를 승계하므로 시리즈의 리듬이 된다).
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');

  const trimmedSearch = search.trim();
  const teamsQuery = useV1Teams(
    trimmedSearch ? { query: trimmedSearch, sportId, limit: 20 } : { sportId, limit: 20 },
  );

  // 한 팀을 두 티어에 동시에 넣을 수 없다(서버도 LEAGUE_TEAM_INVALID 로 막는다).
  const takenTeamIds = useMemo(
    () => new Set(Object.values(picked).flat().map((item) => item.id)),
    [picked],
  );

  const teamItems: EntityPickerItem[] = (teamsQuery.data?.items ?? [])
    .filter((team) => !takenTeamIds.has(team.id))
    .map((team) => ({
      id: team.id,
      label: team.name,
      description: `${team.sportName} · ${team.regionName}`,
    }));

  const addTeam = (tier: number, item: EntityPickerItem | null) => {
    if (item === null) return;
    setPicked((prev) => ({ ...prev, [tier]: [...(prev[tier] ?? []), item] }));
    setSearch('');
    setActiveTier(null);
  };

  const removeTeam = (tier: number, teamId: string) => {
    setPicked((prev) => ({ ...prev, [tier]: (prev[tier] ?? []).filter((item) => item.id !== teamId) }));
  };

  // 모든 티어가 2팀 이상이어야 한다. 1팀짜리 리그는 라운드로빈 대진이 0건이라 영원히
  // 완료되지 않고 재생성도 막혀 복구가 안 된다 — 서버가 막는 것과 같은 이유다.
  const shortTiers = tierNumbers.filter((tier) => (picked[tier] ?? []).length < 2);
  const missingTitles = tierNumbers.filter((tier) => (titles[tier] ?? '').trim() === '');
  // 한쪽만 채우면 나머지는 서버 폴백이 채워 의도와 다른 기간이 된다 — 둘 다거나 둘 다 비거나.
  const partialPeriod = (startsOn === '') !== (endsOn === '');
  const invertedPeriod = startsOn !== '' && endsOn !== '' && endsOn < startsOn;
  const canSubmit =
    shortTiers.length === 0 && missingTitles.length === 0 && !partialPeriod && !invertedPeriod && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    onSeed({
      tiers: tierNumbers.map((tier) => ({
        tier,
        title: (titles[tier] ?? '').trim(),
        teamIds: (picked[tier] ?? []).map((item) => item.id),
      })),
      // `type="date"` 값(YYYY-MM-DD)을 그대로 new Date()에 넘기면 UTC 자정으로 파싱돼
      // KST 기준 날짜가 하루 앞으로 밀린다(리그 생성 폼과 동일한 처리).
      ...(startsOn === '' ? {} : { startsOn: new Date(`${startsOn}T00:00:00`).toISOString() }),
      ...(endsOn === '' ? {} : { endsOn: new Date(`${endsOn}T23:59:59.999`).toISOString() }),
    });
  };

  return (
    <section className="rounded-2xl border border-[var(--border-strong)] bg-[var(--card-surface)] p-4">
      <h2 className="text-sm font-bold text-[var(--text-strong)]">1시즌 팀 배정</h2>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        첫 시즌은 승강 이력이 없어서 티어별로 팀을 직접 배정해요. 티어마다 2팀 이상이 필요하고,
        한 팀을 두 티어에 넣을 수는 없어요.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="seed-starts-on" className="mb-1 block text-xs font-semibold text-[var(--text-strong)]">
            시즌 시작일
          </label>
          <input
            id="seed-starts-on"
            type="date"
            value={startsOn}
            onChange={(event) => setStartsOn(event.target.value)}
            className="h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div>
          <label htmlFor="seed-ends-on" className="mb-1 block text-xs font-semibold text-[var(--text-strong)]">
            시즌 종료일
          </label>
          <input
            id="seed-ends-on"
            type="date"
            value={endsOn}
            onChange={(event) => setEndsOn(event.target.value)}
            className="h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <p className="text-xs text-[var(--text-muted)] sm:col-span-2">
          비워 두면 오늘부터 90일로 잡아요. 다음 시즌은 이 기간만큼 이어져요.
        </p>
      </div>

      <div className="mt-4 space-y-4">
        {tierNumbers.map((tier) => {
          const teams = picked[tier] ?? [];
          return (
            <div key={tier} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-blue-100 px-2 py-0.5 text-2xs font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                  {tier}부
                </span>
                <span className={`text-xs ${teams.length < 2 ? 'text-red-700 dark:text-red-300' : 'text-[var(--text-muted)]'}`}>
                  {teams.length}팀{teams.length < 2 ? ' · 2팀 이상 필요해요' : ''}
                </span>
              </div>

              <label htmlFor={`seed-title-${tier}`} className="mt-3 mb-1 block text-xs font-semibold text-[var(--text-strong)]">
                {tier}부 리그 이름
              </label>
              <input
                id={`seed-title-${tier}`}
                value={titles[tier] ?? ''}
                maxLength={100}
                onChange={(event) => setTitles((prev) => ({ ...prev, [tier]: event.target.value }))}
                className="h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />

              <label htmlFor={`seed-picker-${tier}`} className="mt-3 mb-1 block text-xs font-semibold text-[var(--text-strong)]">
                {tier}부 참가 팀 추가
              </label>
              <EntityPicker
                id={`seed-picker-${tier}`}
                value={null}
                onChange={(item) => addTeam(tier, item)}
                items={activeTier === null || activeTier === tier ? teamItems : []}
                onSearch={(value) => {
                  setActiveTier(tier);
                  setSearch(value);
                }}
                showResultsWithoutQuery
                loading={teamsQuery.isFetching}
                placeholder="팀 이름으로 검색"
                emptyText="검색 결과가 없어요"
              />

              {teams.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {teams.map((team) => (
                    <li
                      key={team.id}
                      className="flex min-h-[44px] items-center gap-1 rounded-full bg-[var(--blue50)] px-3 text-sm text-[var(--blue700)]"
                    >
                      {team.label}
                      <button
                        type="button"
                        aria-label={`${tier}부에서 ${team.label} 제거`}
                        onClick={() => removeTeam(tier, team.id)}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p aria-live="polite" className="mt-3 text-xs text-[var(--text-muted)]">
        {shortTiers.length > 0
          ? `${shortTiers.map((tier) => `${tier}부`).join(' · ')}에 팀이 더 필요해요.`
          : missingTitles.length > 0
            ? '리그 이름을 모두 입력해 주세요.'
            : partialPeriod
              ? '시작일과 종료일을 함께 입력하거나 둘 다 비워 주세요.'
              : invertedPeriod
                ? '종료일은 시작일보다 빠를 수 없어요.'
                : `총 ${takenTeamIds.size}팀 · 1시즌 리그 ${tierCount}개를 만들어요.`}
      </p>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="mt-3 min-h-[44px] w-full rounded-xl bg-blue-500 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? '만드는 중…' : '1시즌 만들기'}
      </button>
    </section>
  );
}
