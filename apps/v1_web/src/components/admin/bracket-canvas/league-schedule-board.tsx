'use client';

import { useId, useMemo } from 'react';
import { EyeOff } from 'lucide-react';
import { EmptyState } from '@/components/v1-ui/primitives';
import { useV1RandomFillSlots } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { StatusChip } from '@/components/v1-ui/status-chip';
import { bracketNodeStateChip } from '@/lib/competition-status';
import { formatKstDateShort, formatKstTime } from '@/lib/date-utils';
import { buildLeagueBoard, type LeagueBoardNode } from '@/lib/league-board-model';
import type { V1AdminBracketSlot } from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';

export interface LeagueScheduleBoardProps {
  leagueId: string;
  fixtures: readonly V1LeagueFixture[];
  slots: V1AdminBracketSlot[];
  /** 팀 id → 이름(자리 없는 기존 경기의 라벨). undefined 는 아직 로딩. */
  teams: readonly V1AdminLeagueTeam[] | undefined;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onOpenTemplate: () => void;
  onShowList: () => void;
}

const TOOLBAR_BUTTON = 'tm-btn tm-btn-sm tm-btn-outline';

function scoreText(node: LeagueBoardNode): string | null {
  const score = node.game?.latestRevision?.score;
  if (score === undefined || score === null) return null;
  const penalties = score.penalties ? ` (승부차기 ${score.penalties.home} : ${score.penalties.away})` : '';
  return `${score.home} : ${score.away}${penalties}`;
}

export function LeagueScheduleBoard({ leagueId, fixtures, slots, teams, canWrite, showToast, onOpenTemplate, onShowList }: LeagueScheduleBoardProps) {
  const headingId = useId();
  const teamNameById = useMemo(() => new Map((teams ?? []).map((team) => [team.teamId, team.name])), [teams]);
  const { columns, summary } = useMemo(
    () => buildLeagueBoard({ fixtures, slots, teamNameById }),
    [fixtures, slots, teamNameById],
  );

  const randomFill = useV1RandomFillSlots(leagueId, 'league');

  if (fixtures.length === 0) {
    return (
      <div>
        <EmptyState
          title="아직 일정이 없어요"
          sub={
            canWrite
              ? '템플릿으로 빈 경기를 먼저 만들고, 팀은 나중에 자리에 넣을 수 있어요.'
              : '아직 만들어진 일정이 없어요.'
          }
          cta={canWrite ? '템플릿으로 시작' : undefined}
          onCta={onOpenTemplate}
        />
        {canWrite ? (
          <div className="mt-3 flex justify-center">
            <button type="button" onClick={onShowList} className="tm-btn tm-btn-sm tm-btn-ghost" style={{ minHeight: 44 }}>
              팀을 직접 정해 만들려면 목록으로 가요
            </button>
          </div>
        ) : null}
      </div>
    );
  }


  const onRandomFill = async () => {
    try {
      const result = await randomFill.mutateAsync();
      showToast(
        result.assignments.length === 0
          ? '넣을 수 있는 팀이나 빈 자리가 없어요.'
          : `${result.assignments.length}팀을 빈 자리에 넣었어요.`,
        'success',
      );
    } catch (error) {
      showToast(describeBracketCanvasError(error, '빈 자리를 채우지 못했어요.'), 'error');
    }
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="sr-only">리그 일정 보드</h2>
      {!canWrite ? (
        <p role="status" className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
          읽기 전용이에요. 팀을 넣거나 경기를 바꾸려면 쓰기 권한이 필요해요.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">
          {summary.slotCount > 0
            ? `자리 ${summary.filledSlotCount}/${summary.slotCount} 배정${summary.hiddenFixtureCount > 0 ? ` · 공개 대기 ${summary.hiddenFixtureCount}경기` : ''}`
            : '자리 없이 만든 대진이에요. 팀 넣기는 템플릿으로 다시 만든 뒤 쓸 수 있어요.'}
        </p>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            {summary.slotCount > 0 ? (
              <button
                type="button"
                className={TOOLBAR_BUTTON}
                style={{ minHeight: 44 }}
                disabled={!summary.hasEmptySlot || randomFill.isPending}
                onClick={() => void onRandomFill()}
              >
                빈 자리 무작위 채우기
              </button>
            ) : null}
            <button type="button" className={TOOLBAR_BUTTON} style={{ minHeight: 44 }} onClick={onOpenTemplate}>
              템플릿으로 다시 만들기
            </button>
          </div>
        ) : null}
      </div>
      {summary.hiddenFixtureCount > 0 ? (
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          팀이 다 정해지지 않은 경기는 공개 화면에 아직 나오지 않아요. 자리에 팀을 모두 넣으면 나타나요.
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <ol className="flex min-w-max gap-3" aria-label="경기일별 일정">
          {columns.map((column) => (
            <li key={column.key} className="w-64 shrink-0">
              <h3 className="mb-2 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
                {`${column.weekNumber}주차 · ${formatKstDateShort(column.nodes[0].startAt)}`}
              </h3>
              <ul className="flex flex-col gap-2">
                {column.nodes.map((node) => {
                  const score = scoreText(node);
                  return (
                    <li
                      key={node.fixtureId}
                      aria-label={`${node.home.label} 대 ${node.away.label} 경기`}
                      className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-2"
                    >
                      <div className="flex min-h-[44px] items-center justify-between gap-2 px-1">
                        <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                          {`${formatKstTime(node.startAt)} · ${node.placeName}`}
                        </span>
                        <StatusChip chip={bracketNodeStateChip(node.state)} />
                      </div>
                      {(['home', 'away'] as const).map((sideKey) => {
                        const side = node[sideKey];
                        return (
                          <p
                            key={sideKey}
                            className={`flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--border)] px-2 text-[length:var(--font-size-body-sm)] ${
                              side.filled ? 'bg-[var(--card-surface)] text-[var(--text-strong)]' : 'bg-[var(--surface-soft)] text-[var(--text-muted)]'
                            }`}
                          >
                            <span className="w-8 shrink-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                              {sideKey === 'home' ? '홈' : '원정'}
                            </span>
                            <span className="min-w-0 truncate">{side.label}</span>
                            {side.filled ? null : <span className="sr-only">비어 있음</span>}
                          </p>
                        );
                      })}
                      {score !== null ? (
                        <p className="px-1 text-[length:var(--font-size-body-sm)] font-semibold tabular-nums text-[var(--text-strong)]">{score}</p>
                      ) : null}
                      {node.game?.latestRevision?.entryMethod === 'quick' ? (
                        <p className="px-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">어드민 빠른 입력</p>
                      ) : null}
                      {node.hiddenFromPublic ? (
                        <p className="inline-flex items-center gap-1 px-1 text-[length:var(--font-size-caption)] text-[var(--orange700)]">
                          <EyeOff size={12} aria-hidden="true" />
                          공개 대기
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
