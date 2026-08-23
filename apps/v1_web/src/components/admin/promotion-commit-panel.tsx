'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Minus, UserMinus } from 'lucide-react';
import type {
  V1CommitPromotionEntry,
  V1PromotionKind,
  V1PromotionPreviewResponse,
} from '@/types/league-series';

const KIND_META: Record<V1PromotionKind, { label: string; icon: typeof ArrowUp; className: string }> = {
  promoted: { label: '승격', icon: ArrowUp, className: 'text-blue-700 dark:text-blue-300' },
  relegated: { label: '강등', icon: ArrowDown, className: 'text-red-700 dark:text-red-300' },
  stayed: { label: '잔류', icon: Minus, className: 'text-[var(--text-muted)]' },
  withdrawn: { label: '불참', icon: UserMinus, className: 'text-amber-700 dark:text-amber-300' },
};

const KIND_ORDER: V1PromotionKind[] = ['promoted', 'stayed', 'relegated', 'withdrawn'];

const selectClass =
  'h-[44px] rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-2 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20';

interface PromotionCommitPanelProps {
  preview: V1PromotionPreviewResponse;
  submitting: boolean;
  onCommit: (entries: V1CommitPromotionEntry[]) => void;
}

/**
 * 승강 확정 3단계 중 [2] override + [3] commit 을 담당한다.
 *
 * 수정 중간 상태는 여기(로컬)에만 둔다 — preview 를 여러 번 다시 돌릴 수 있어야 하는데
 * 서버에 미리 쓰면 매번 정리해야 한다. 최종 승인 시에만 전체 목록을 보낸다.
 *
 * 폰트 크기에 `text-2xs` 를 쓰지 마라 — globals.css 상단(9-10행)이 밝히듯 사용처 0건이라
 * 삭제된 죽은 클래스라, 붙여도 아무 크기도 적용되지 않고 부모 크기를 물려받는다.
 * 실제로 존재하는 가장 작은 토큰은 `text-xs`(12px)다.
 */
export function PromotionCommitPanel({ preview, submitting, onCommit }: PromotionCommitPanelProps) {
  const [overrides, setOverrides] = useState<Record<string, V1PromotionKind>>({});
  // 수정 사유는 어드민이 직접 적는다. 예전에는 '어드민이 직접 조정' 이라는 고정 문자열을
  // 보내서, 감사 로그를 열어도 "왜 규칙과 다르게 정했는지"가 어디에도 남지 않았다.
  const [notes, setNotes] = useState<Record<string, string>>({});

  // 감사 H-4(어드민 쪽) — tie-break 를 전부 소진하고 팀ID 사전순으로 갈린 팀은 이 화면만
  // 보고는 "왜 이 순서인지" 납득할 수 없다. 소속 티어 전체가 아니라 그 팀에만 경고를 붙인다.
  const tieBreakTeamIds = useMemo(
    () => new Set(preview.tiers.flatMap((tier) => tier.tieBreakGroups.flatMap((group) => group.teamIds))),
    [preview],
  );

  const entries = useMemo(
    () => preview.tiers.flatMap((tier) => tier.entries.map((entry) => ({ ...entry, tierLabel: tier.tierLabel }))),
    [preview],
  );

  const kindOf = (teamId: string, computed: V1PromotionKind): V1PromotionKind => overrides[teamId] ?? computed;
  const overriddenCount = entries.filter((entry) => kindOf(entry.teamId, entry.computedKind) !== entry.computedKind).length;

  const tierNumbers = preview.tiers.map((tier) => tier.tier);
  const topTier = Math.min(...tierNumbers);
  const bottomTier = Math.max(...tierNumbers);
  // 서버가 422 로 거부할 조합을 보내기 전에 여기서 잡는다.
  const impossible = entries.filter((entry) => {
    const kind = kindOf(entry.teamId, entry.computedKind);
    return (
      (kind === 'promoted' && entry.tier <= topTier) || (kind === 'relegated' && entry.tier >= bottomTier)
    );
  });

  // 다음 시즌 팀 수는 서버 계산값(규칙 기준)이 아니라 어드민이 지금 고른 값으로 다시 센다 —
  // 불참 처리한 팀이 화면 숫자에 즉시 반영돼야 "확정 후에 보니 팀이 없더라"를 막는다.
  const projectedByTier = useMemo(() => {
    const counts = new Map<number, number>();
    for (const tier of preview.tiers) counts.set(tier.tier, 0);
    for (const entry of entries) {
      const kind = kindOf(entry.teamId, entry.computedKind);
      if (kind === 'withdrawn') continue;
      const toTier = kind === 'promoted' ? entry.tier - 1 : kind === 'relegated' ? entry.tier + 1 : entry.tier;
      // 존재하지 않는 티어(1부 승격 → 0, 최하위 강등 → tierCount+1)로는 세지 않는다.
      // 서버가 그 조합을 422 로 거부하므로 화면에서도 팀이 조용히 사라지면 안 된다 —
      // 아래 unreachable 로 모아 두고 경고를 띄운다.
      if (!counts.has(toTier)) continue;
      counts.set(toTier, (counts.get(toTier) ?? 0) + 1);
    }
    return counts;
  }, [entries, overrides, preview.tiers]);

  // 서버는 다음 시즌에 1팀만 남는 티어가 있으면 422 로 막는다(리그는 2팀 이상이어야 하고,
  // 1팀 리그는 대진 생성이 영구히 거부돼 시작도 종료도 못 하는 죽은 리그가 된다).
  // 확정 버튼을 누르기 전에 같은 판정을 화면에서 보여 준다.
  const undersizedTiers = preview.tiers
    .map((tier) => ({ tier, count: projectedByTier.get(tier.tier) ?? 0 }))
    .filter((row) => row.count === 1);

  const handleCommit = () => {
    onCommit(
      entries.map((entry) => {
        const kind = kindOf(entry.teamId, entry.computedKind);
        const note = notes[entry.teamId]?.trim();
        return {
          teamId: entry.teamId,
          fromTier: entry.tier,
          kind,
          ...(kind === entry.computedKind || !note ? {} : { overrideNote: note }),
        };
      }),
    );
  };

  return (
    <div className="space-y-4">
      {preview.warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
          <p className="flex items-center gap-1.5 text-sm font-bold text-amber-900 dark:text-amber-200">
            <AlertTriangle size={16} aria-hidden="true" />
            확인이 필요해요
          </p>
          <ul className="mt-2 space-y-1">
            {preview.warnings.map((warning) => (
              <li key={`${warning.tier}-${warning.code}`} className="text-xs text-amber-900 dark:text-amber-200">
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.tiers.map((tier) => (
        <section key={tier.tier} className="rounded-2xl border border-[var(--border-strong)] bg-[var(--card-surface)] p-4">
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-strong)]">{tier.tierLabel}</h3>
            <p className="text-xs text-[var(--text-muted)]">
              지금 {tier.teamCount}팀 · 다음 시즌 예상{' '}
              <span className="font-semibold text-[var(--text-strong)]">
                {projectedByTier.get(tier.tier) ?? 0}팀
              </span>
              {tier.skippedByMajorityGuard && ' · 승강 건너뜀'}
            </p>
          </header>

          {tier.entries.length === 0 ? (
            <p className="mt-3 text-xs text-[var(--text-muted)]">참가 팀이 없어요.</p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border-subtle)]">
              {tier.entries.map((entry) => {
                const kind = kindOf(entry.teamId, entry.computedKind);
                const meta = KIND_META[kind];
                const Icon = meta.icon;
                const changed = kind !== entry.computedKind;
                return (
                  <li key={entry.teamId} className="flex flex-wrap items-center gap-3 py-2">
                    {/* 좁은 화면에서는 순위+팀이름이 한 줄을 통째로 쓰고 상태·선택은 다음 줄로 내려간다.
                        승강을 정하는 화면에서 팀 이름이 잘리면 어떤 팀인지 모르고 결정하게 된다
                        (390 실측: "리그 QA 브라보…" 로 잘려 브라보FC 인지 구분 불가). */}
                    <span className="flex w-full min-w-0 items-baseline gap-3 sm:w-auto sm:flex-1">
                      <span className="w-8 shrink-0 text-sm font-semibold tabular-nums text-[var(--text-muted)]">
                        {entry.position}위
                      </span>
                      <span className="min-w-0 break-keep text-sm font-medium text-[var(--text-strong)]">
                        {entry.teamName}
                      </span>
                    </span>
                    {/* 순위 근거(감사 H-5) — "왜 이 팀이 N위인가"를 이 화면만 보고 설명할 수
                        있어야 한다. 승점·득실차는 승강 판정의 직접 근거라 접지 않고 항상 보인다.
                        나머지(전적·득점·실점)는 옆에 옅은 글자로 함께 둔다. */}
                    <span className="w-full pl-11 text-xs tabular-nums text-[var(--text-muted)] sm:w-auto sm:pl-0">
                      <span className="font-bold text-[var(--text-strong)]">{entry.points}점</span>
                      <span>
                        {' '}
                        · {entry.played}전 {entry.wins}승{entry.draws}무{entry.losses}패 · {entry.goalsFor}득{' '}
                        {entry.goalsAgainst}실 ·{' '}
                      </span>
                      <span className="font-semibold text-[var(--text-strong)]">
                        득실차 {entry.goalDifference > 0 ? `+${entry.goalDifference}` : entry.goalDifference}
                      </span>
                    </span>
                    {tieBreakTeamIds.has(entry.teamId) && (
                      <span className="flex w-full items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        <AlertTriangle size={12} aria-hidden="true" />
                        모든 기준이 같아 임의로 순위가 갈렸어요. 직접 확인해 주세요.
                      </span>
                    )}
                    <span className={`ml-auto inline-flex items-center gap-1 text-xs font-semibold sm:ml-0 ${meta.className}`}>
                      <Icon size={14} aria-hidden="true" />
                      {meta.label}
                    </span>
                    {changed && (
                      <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                        규칙은 {KIND_META[entry.computedKind].label}
                      </span>
                    )}
                    <label className="sr-only" htmlFor={`kind-${entry.teamId}`}>
                      {entry.teamName} 승강 결정
                    </label>
                    <select
                      id={`kind-${entry.teamId}`}
                      className={selectClass}
                      value={kind}
                      disabled={submitting}
                      onChange={(e) =>
                        setOverrides((prev) => ({ ...prev, [entry.teamId]: e.target.value as V1PromotionKind }))
                      }
                    >
                      {KIND_ORDER.map((option) => (
                        <option key={option} value={option}>
                          {KIND_META[option].label}
                        </option>
                      ))}
                    </select>
                    {changed && (
                      <span className="flex w-full items-center gap-2">
                        <label className="sr-only" htmlFor={`note-${entry.teamId}`}>
                          {entry.teamName} 수정 사유
                        </label>
                        <input
                          id={`note-${entry.teamId}`}
                          type="text"
                          maxLength={200}
                          disabled={submitting}
                          value={notes[entry.teamId] ?? ''}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [entry.teamId]: e.target.value }))}
                          placeholder="수정 사유 (예: 다음 시즌 불참 통보)"
                          className="h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50"
                        />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border-strong)] bg-[var(--card-surface)] p-4">
        <p className="text-xs text-[var(--text-muted)]">
          총 {entries.length}팀
          {overriddenCount > 0 && ` · 규칙과 다르게 정한 팀 ${overriddenCount}개`}
          <br />
          {impossible.length > 0 ? (
            <span className="font-semibold text-red-700 dark:text-red-300">
              갈 곳이 없는 결정이 {impossible.length}개 있어요. 가장 위 티어는 승격할 수 없고 가장 아래
              티어는 강등할 수 없어요.
            </span>
          ) : undersizedTiers.length > 0 ? (
            <span className="font-semibold text-red-700 dark:text-red-300">
              {undersizedTiers.map((row) => row.tier.tierLabel).join(' · ')}가 다음 시즌에 1팀만 남아요.
              리그는 2팀 이상이어야 해요. 불참 처리한 팀이나 승강 결정을 조정해 주세요.
            </span>
          ) : (
            '최종 승인하면 다음 시즌 리그가 만들어지고 되돌릴 수 없어요.'
          )}
        </p>
        <button
          type="button"
          onClick={handleCommit}
          disabled={submitting || entries.length === 0 || impossible.length > 0 || undersizedTiers.length > 0}
          className="inline-flex min-h-[44px] items-center rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? '확정하는 중…' : '승강 최종 승인'}
        </button>
      </div>
    </div>
  );
}
