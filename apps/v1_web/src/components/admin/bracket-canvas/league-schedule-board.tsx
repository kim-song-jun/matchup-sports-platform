'use client';

import { useEffect, useId, useMemo, useState, type DragEvent } from 'react';
import { AlertTriangle, EyeOff } from 'lucide-react';
import { BottomSheet } from '@/components/v1-ui/bottom-sheet';
import { EmptyState } from '@/components/v1-ui/primitives';
import { BRACKET_CANVAS_SIDE_PANEL_MEDIA_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { useV1AdminTournamentRegistrations } from '@/hooks/use-v1-api';
import { useV1AssignTournamentSlot, useV1RandomFillSlots } from '@/hooks/use-v1-bracket-canvas';
import { describeBracketCanvasError } from '@/lib/bracket-canvas-errors';
import { StatusChip } from '@/components/v1-ui/status-chip';
import { bracketNodeStateChip } from '@/lib/competition-status';
import { formatKstTime, formatTournamentDateRangeShort, formatTournamentDateTimeShort } from '@/lib/date-utils';
import { kstMidnightMs } from '@/lib/kst-calendar';
import {
  buildLeagueBoard,
  leagueDirectPlacedRegistrationIds,
  type LeagueBoardColumn,
  type LeagueBoardNode,
  type LeagueBoardSide,
} from '@/lib/league-board-model';
import type { V1AdminBracketSlot } from '@/types/api';
import type { V1AdminLeagueTeam, V1LeagueFixture } from '@/types/league-match';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';
import { BracketTeamTray, type RegistrationsLoadState } from './bracket-team-tray';
import { fixtureOpenerProps, focusFixtureOpener } from './fixture-opener-focus';
import { LeagueFixturePanel } from './league-fixture-panel';

export interface LeagueScheduleBoardProps {
  leagueId: string;
  fixtures: readonly V1LeagueFixture[];
  slots: V1AdminBracketSlot[];
  /** 팀 id → 이름(자리 없는 기존 경기의 라벨). undefined 는 아직 로딩. */
  teams: readonly V1AdminLeagueTeam[] | undefined;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  onOpenTemplate: () => void;
  focusFixtureId?: string | null;
  onEditSchedule: (teamMatchId: string) => void;
  onCancelFixture: (teamMatchId: string) => void;
  onDeleteFixture: (teamMatchId: string) => void;
  onShowList: () => void;
  /** 주차 칸의 '이 주에 경기 추가'. 없으면 버튼을 그리지 않는다(읽기 전용·끝난 리그). */
  onAddToWeek?: (column: LeagueBoardColumn) => void;
}

const TOOLBAR_BUTTON = 'tm-btn tm-btn-sm tm-btn-outline';

/** Week heading such as '2주차 · 11/21 (토)~11/22 (일)', covering only the days with games; shared by the desktop column and the mobile week header. */
export function leagueWeekHeading(column: LeagueBoardColumn): string {
  const range = formatTournamentDateRangeShort(
    new Date(kstMidnightMs(column.firstGameDate)).toISOString(),
    new Date(kstMidnightMs(column.lastGameDate)).toISOString(),
  );
  return `${column.weekNumber}주차 · ${range}`;
}

/**
 * 주차 요약 한 줄 + 두 경기 팀 경고(2026-11-03 사용자 선택). 쉬는 팀은 참가팀을 알아야 셀 수 있어
 * 팀 목록이 아직 없으면 경기 수만 보인다 — '쉬는 팀 없음'을 지어내지 않는다.
 */
export function LeagueWeekSummaryLines({ column, teamsKnown }: { column: LeagueBoardColumn; teamsKnown: boolean }) {
  const { gameCount, restingTeamNames, doubleBookedTeamNames } = column.summary;
  const resting = !teamsKnown ? null : restingTeamNames.length === 0 ? '쉬는 팀 없음' : `쉬는 팀 ${restingTeamNames.join(', ')}`;
  return (
    <>
      <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
        {[`${gameCount}경기`, resting].filter(Boolean).join(' · ')}
      </p>
      {doubleBookedTeamNames.length > 0 ? (
        <p className="inline-flex items-center gap-1 text-[length:var(--font-size-caption)] font-semibold text-[var(--orange700)]">
          <AlertTriangle size={12} aria-hidden="true" />
          {`두 경기 이상: ${doubleBookedTeamNames.join(', ')}`}
        </p>
      ) : null}
    </>
  );
}

function scoreText(node: LeagueBoardNode): string | null {
  const score = node.game?.latestRevision?.score;
  if (score === undefined || score === null) return null;
  const penalties = score.penalties ? ` (승부차기 ${score.penalties.home} : ${score.penalties.away})` : '';
  return `${score.home} : ${score.away}${penalties}`;
}

export function LeagueScheduleBoard({ leagueId, fixtures, slots, teams, canWrite, showToast, onOpenTemplate, focusFixtureId = null, onEditSchedule, onCancelFixture, onDeleteFixture, onShowList, onAddToWeek }: LeagueScheduleBoardProps) {
  const headingId = useId();
  // 서버 기본값 true — 하이드레이션 전엔 지금 배치를 유지하고 좁은 태블릿만 클라이언트에서 바뀐다.
  const sidePanel = useMediaQuery(BRACKET_CANVAS_SIDE_PANEL_MEDIA_QUERY, true);
  const teamNameById = useMemo(() => new Map((teams ?? []).map((team) => [team.teamId, team.name])), [teams]);
  const { columns, summary } = useMemo(
    () => buildLeagueBoard({ fixtures, slots, teamNameById }),
    [fixtures, slots, teamNameById],
  );

  const randomFill = useV1RandomFillSlots(leagueId, 'league');
  const assign = useV1AssignTournamentSlot(leagueId, 'league');
  const {
    data: registrationsData,
    isError: registrationsIsError,
    error: registrationsError,
    refetch: refetchRegistrations,
  } = useV1AdminTournamentRegistrations(leagueId);
  const [selectedRegistrationId, setSelectedRegistrationId] = useState<string | null>(null);
  const [openFixtureId, setOpenFixtureId] = useState<string | null>(null);
  const focusedFixtureExists = focusFixtureId !== null && fixtures.some((fixture) => fixture.teamMatchId === focusFixtureId);

  useEffect(() => {
    if (focusedFixtureExists && focusFixtureId !== null) {
      setOpenFixtureId(focusFixtureId);
    }
  }, [focusFixtureId, focusedFixtureExists]);

  const registrations = registrationsData?.items;
  // 대회 대진 화면과 같은 규칙 — 캐시된 목록은 재조회가 실패해도 쓰되 실패는 refetchFailed 로 드러낸다.
  const registrationsState: RegistrationsLoadState = {
    status: registrationsData !== undefined ? 'success' : registrationsIsError ? 'error' : 'pending',
    truncated: registrationsData?.truncated ?? false,
    refetchFailed: registrationsIsError && registrationsData !== undefined,
    error: registrationsError,
    onRetry: () => void refetchRegistrations(),
  };
  const directPlacedIds = useMemo(
    () => leagueDirectPlacedRegistrationIds(fixtures, slots, teams ?? []),
    [fixtures, slots, teams],
  );
  const openNode = columns.flatMap((column) => column.nodes).find((node) => node.fixtureId === openFixtureId) ?? null;
  const randomFillBlockedReason =
    registrationsState.status === 'pending'
      ? '참가팀을 불러오는 중이에요.'
      : registrationsState.status === 'error'
        ? '참가팀을 불러오지 못했어요.'
        : null;

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


  const place = async (slotId: string, registrationId: string) => {
    try {
      await assign.mutateAsync({ slotId, registrationId });
      setSelectedRegistrationId(null);
      showToast('자리에 팀을 넣었어요.', 'success');
    } catch (error) {
      // 선택을 유지한다 — 다른 자리로 바로 다시 시도할 수 있어야 한다.
      showToast(describeBracketCanvasError(error, '자리에 팀을 넣지 못했어요.'), 'error');
    }
  };

  const onSideClick = (node: LeagueBoardNode, side: LeagueBoardSide) => {
    if (canWrite && selectedRegistrationId !== null && side.slotId !== null) {
      void place(side.slotId, selectedRegistrationId);
      return;
    }
    setOpenFixtureId(node.fixtureId);
  };

  const onSideDragOver = (event: DragEvent<HTMLButtonElement>, side: LeagueBoardSide) => {
    if (canWrite && side.slotId !== null) event.preventDefault();
  };

  const onSideDrop = (event: DragEvent<HTMLButtonElement>, side: LeagueBoardSide) => {
    if (!canWrite || side.slotId === null) return;
    event.preventDefault();
    const registrationId = event.dataTransfer.getData(REGISTRATION_DRAG_MIME);
    if (registrationId !== '') void place(side.slotId, registrationId);
  };

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

  const panel =
    openNode === null ? null : (
      <LeagueFixturePanel
        key={openNode.fixtureId}
        leagueId={leagueId}
        node={openNode}
        slots={slots}
        registrations={registrations ?? []}
        canWrite={canWrite}
        showToast={showToast}
        onEditSchedule={() => {
          setOpenFixtureId(null);
          onEditSchedule(openNode.fixtureId);
        }}
        onCancelFixture={() => {
          setOpenFixtureId(null);
          onCancelFixture(openNode.fixtureId);
        }}
        onDeleteFixture={() => {
          setOpenFixtureId(null);
          onDeleteFixture(openNode.fixtureId);
        }}
        onClose={() => {
          if (sidePanel) focusFixtureOpener(openNode.fixtureId);
          setOpenFixtureId(null);
        }}
      />
    );

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
          {(teams?.length ?? 0) >= 2 ? ` · 아직 안 붙은 대진 ${summary.unplayedPairCount}개` : ''}
        </p>
        {canWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            {summary.slotCount > 0 ? (
              <button
                type="button"
                className={TOOLBAR_BUTTON}
                style={{ minHeight: 44 }}
                disabled={!summary.hasEmptySlot || randomFillBlockedReason !== null || randomFill.isPending}
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
      {canWrite && summary.slotCount > 0 && randomFillBlockedReason !== null ? (
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{randomFillBlockedReason}</p>
      ) : null}
      {summary.hiddenFixtureCount > 0 ? (
        <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
          팀이 다 정해지지 않은 경기는 공개 화면에 아직 나오지 않아요. 자리에 팀을 모두 넣으면 나타나요.
        </p>
      ) : null}

      <div
        data-testid="league-board-grid"
        className={`grid gap-3 ${openNode === null || !sidePanel ? 'lg:grid-cols-[16rem_minmax(0,1fr)]' : 'lg:grid-cols-[16rem_minmax(0,1fr)_320px]'}`}
      >
        <aside aria-label="참가팀 영역">
          <BracketTeamTray
            registrations={registrations ?? []}
            slots={slots}
            directPlacedIds={directPlacedIds}
            registrationsState={registrationsState}
            pendingRegistrationId={selectedRegistrationId}
            canWrite={canWrite}
            collapsible={!sidePanel}
            onPick={setSelectedRegistrationId}
          />
        </aside>

        <div className="overflow-x-auto">
        <ol className="flex min-w-max gap-3" aria-label="주차별 일정">
          {columns.map((column) => (
            <li key={column.key} className="w-64 shrink-0">
              <div className="mb-2 flex flex-col gap-0.5">
                <h3 className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
                  {leagueWeekHeading(column)}
                </h3>
                <LeagueWeekSummaryLines column={column} teamsKnown={teams !== undefined} />
              </div>
              <ul className="flex flex-col gap-2">
                {column.nodes.map((node) => {
                  const score = scoreText(node);
                  return (
                    <li
                      key={node.fixtureId}
                      aria-label={`${node.home.label} 대 ${node.away.label} 경기`}
                      className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] p-2"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFixtureId(node.fixtureId)}
                        aria-label={`${node.home.label} 대 ${node.away.label} 경기 상세 열기`}
                        {...fixtureOpenerProps(node.fixtureId)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-1 text-left transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                      >
                        <span className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                          {/* 토·일에 나눠 치르는 주는 시각만으로 어느 날 경기인지 모른다 — 날짜를 같이 보인다. */}
                          {`${column.multiDay ? formatTournamentDateTimeShort(node.startAt) : formatKstTime(node.startAt)} · ${node.placeName}`}
                        </span>
                        <StatusChip chip={bracketNodeStateChip(node.state)} />
                      </button>
                      {(['home', 'away'] as const).map((sideKey) => {
                        const side = node[sideKey];
                        const sideName = sideKey === 'home' ? '홈' : '원정';
                        const armed = canWrite && selectedRegistrationId !== null && side.slotId !== null;
                        return (
                          <button
                            key={sideKey}
                            type="button"
                            aria-label={`${sideName} ${side.label}${side.filled ? '' : ' 비어 있음'}`}
                            title={armed ? '선택한 팀을 이 자리에 넣어요' : undefined}
                            onClick={() => onSideClick(node, side)}
                            onDragOver={(event) => onSideDragOver(event, side)}
                            onDrop={(event) => onSideDrop(event, side)}
                            className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-2 text-left text-[length:var(--font-size-body-sm)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 ${
                              armed ? 'border-[var(--blue500)]' : 'border-[var(--border)]'
                            } ${side.filled ? 'bg-[var(--card-surface)] text-[var(--text-strong)]' : 'bg-[var(--surface-soft)] text-[var(--text-muted)]'}`}
                          >
                            <span className="w-8 shrink-0 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">{sideName}</span>
                            <span className="min-w-0 truncate">{side.label}</span>
                          </button>
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
              {onAddToWeek ? (
                <button
                  type="button"
                  onClick={() => onAddToWeek(column)}
                  aria-label={`${column.weekNumber}주차에 경기 추가`}
                  className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                >
                  + 이 주에 경기 추가
                </button>
              ) : null}
            </li>
          ))}
        </ol>
        </div>
        {panel !== null && sidePanel ? panel : null}
      </div>

      {openNode !== null && !sidePanel ? (
        <BottomSheet open onClose={() => setOpenFixtureId(null)} ariaLabel={`${openNode.home.label} vs ${openNode.away.label}`}>
          {panel}
        </BottomSheet>
      ) : null}
    </section>
  );
}
