'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import {
  fetchV1TournamentOperationsBoardPage,
  useV1TournamentFields,
  useV1TournamentOperationsBoard,
  useV1Tournament,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { AdminListSkeleton, AdminTableSkeleton } from '@/components/admin/admin-skeleton';
import { GameStateBadge, WarningBadge, WARNING_LABELS } from '@/components/tournament-ops/badges';
import { TournamentProgressStepper, buildTournamentStages } from '@/components/tournaments/tournament-progress-stepper';
import type {
  V1GameState,
  V1TournamentOperationsBoardItem,
  V1TournamentOperationsLiveWarning,
  V1TournamentOperationsWarningCode,
  V1TournamentStableWarningCode,
} from '@/types/api';
import { V1_GAME_STATES, V1_STABLE_WARNING_CODES } from '@/types/api';

const GAME_STATE_FILTER_LABELS: Record<V1GameState, string> = {
  SCHEDULED: '예정',
  LIVE: '진행 중',
  PAUSED: '일시중지',
  ENDED: '종료',
  CANCELLED: '취소됨',
};

// 필터 라벨과 배지 라벨이 다르면 "필터를 걸었는데 다른 이름의 행만 나온다"로 읽힌다 —
// 배지와 같은 출처(WARNING_LABELS)를 쓴다.
const WARNING_FILTER_LABELS: Record<V1TournamentStableWarningCode, string> = {
  NO_FIELD_ASSIGNED: WARNING_LABELS.NO_FIELD_ASSIGNED,
  MISSING_SCORER: WARNING_LABELS.MISSING_SCORER,
  RESULT_REVIEW_OVERDUE: WARNING_LABELS.RESULT_REVIEW_OVERDUE,
};

function readFilter<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (value === null) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

interface Props {
  tournamentId: string;
}

export function OperationsBoardClient({ tournamentId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // ── 필터 상태: URL 쿼리를 딥링크 소스로 삼되, 화면 자체는 로컬 상태로 즉시 반응한다.
  const [status, setStatus] = useState<V1GameState | undefined>(() =>
    readFilter(searchParams.get('status'), V1_GAME_STATES),
  );
  const [fieldId, setFieldId] = useState<string | undefined>(() => searchParams.get('fieldId') ?? undefined);
  const [warning, setWarning] = useState<V1TournamentStableWarningCode | undefined>(() =>
    readFilter(searchParams.get('warning'), V1_STABLE_WARNING_CODES),
  );
  const [olderItems, setOlderItems] = useState<V1TournamentOperationsBoardItem[]>([]);
  const [olderLiveWarnings, setOlderLiveWarnings] = useState<V1TournamentOperationsLiveWarning[]>([]);
  // undefined = "더 보기를 아직 누르지 않음(1페이지 커서를 그대로 따른다)". null/문자열은 마지막으로
  // 받아온 페이지의 실제 nextCursor다 — null도 "더 이상 다음 페이지 없음"이라는 유효한 값이라
  // `??`로 1페이지 커서에 되돌아가면(null이 nullish이므로) 마지막 페이지에서도 "더 보기"가 사라지지
  // 않는 채 같은 커서를 무한 재요청하는 버그가 생긴다 — 그래서 undefined만 오버라이드 부재로 취급한다.
  const [olderCursor, setOlderCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const filters = useMemo(
    () => ({ status, fieldId, warning, limit: 50 }),
    [status, fieldId, warning],
  );

  const board = useV1TournamentOperationsBoard(tournamentId, filters);
  const fields = useV1TournamentFields(tournamentId);
  const tournament = useV1Tournament(tournamentId);

  const teamNamesByFixtureId = useMemo(() => {
    const map = new Map<string, { home: string; away: string }>();
    for (const fixture of tournament.data?.fixtures ?? []) {
      map.set(fixture.id, { home: fixture.homeTeamName, away: fixture.awayTeamName });
    }
    return map;
  }, [tournament.data?.fixtures]);

  /* 소비자용 순위·브래킷 화면(/tournaments/:id/bracket)은 이미 이 스테퍼로 대회
   * 진행 단계를 보여준다. 운영 보드에는 같은 정보가 표에 흩어져 있어서 스태프가
   * "지금 대회가 어느 단계인지"를 표를 다 훑어야 알 수 있었다 — 소비자 화면과
   * 데이터 소스가 같으므로(둘 다 useV1Tournament) 새 API 호출 없이 재사용한다. */
  const stages = useMemo(() => (tournament.data ? buildTournamentStages(tournament.data) : []), [tournament.data]);

  const liveWarningsByFixtureId = useMemo(() => {
    const map = new Map<string, readonly V1TournamentOperationsWarningCode[]>();
    for (const entry of [...(board.data?.liveWarnings ?? []), ...olderLiveWarnings]) {
      map.set(entry.fixtureId, entry.warnings);
    }
    return map;
  }, [board.data?.liveWarnings, olderLiveWarnings]);

  // 딥링크: 필터가 바뀔 때만 URL을 갱신한다(뒤로가기/공유 가능한 상태).
  const updateFilters = useCallback(
    (next: { status?: V1GameState; fieldId?: string; warning?: V1TournamentStableWarningCode }) => {
      const nextStatus = 'status' in next ? next.status : status;
      const nextFieldId = 'fieldId' in next ? next.fieldId : fieldId;
      const nextWarning = 'warning' in next ? next.warning : warning;
      setStatus(nextStatus);
      setFieldId(nextFieldId);
      setWarning(nextWarning);
      setOlderItems([]);
      setOlderLiveWarnings([]);
      setOlderCursor(undefined);
      setLoadMoreError(null);

      const query = new URLSearchParams();
      if (nextStatus) query.set('status', nextStatus);
      if (nextFieldId) query.set('fieldId', nextFieldId);
      if (nextWarning) query.set('warning', nextWarning);
      const queryString = query.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [status, fieldId, warning, pathname, router],
  );

  const handleLoadMore = useCallback(async () => {
    const cursor = olderCursor !== undefined ? olderCursor : (board.data?.nextCursor ?? null);
    if (!cursor) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await fetchV1TournamentOperationsBoardPage(queryClient, tournamentId, {
        ...filters,
        cursor,
      });
      setOlderItems((prev) => [...prev, ...page.items]);
      setOlderLiveWarnings((prev) => [...prev, ...page.liveWarnings]);
      setOlderCursor(page.nextCursor);
    } catch (error) {
      setLoadMoreError(extractErrorMessage(error, '다음 페이지를 불러오지 못했어요.'));
    } finally {
      setLoadingMore(false);
    }
  }, [olderCursor, board.data?.nextCursor, queryClient, tournamentId, filters]);

  const items = useMemo(() => [...(board.data?.items ?? []), ...olderItems], [board.data?.items, olderItems]);
  const nextCursor = olderCursor !== undefined ? olderCursor : (board.data?.nextCursor ?? null);

  function rowLabel(item: V1TournamentOperationsBoardItem): string {
    const names = teamNamesByFixtureId.get(item.fixtureId);
    if (!names) return `${item.fixtureNumber}번 경기`;
    return `${names.home} vs ${names.away}`;
  }

  /* 운영자가 해소할 수단이 없는 경고는 보여주지 않는다.
   *
   * 경기장 배정 API(PATCH .../fixtures/:fixtureId/field)는 백엔드에 있지만 그것을 호출하는
   * 화면이 아직 없다 — 즉 NO_FIELD_ASSIGNED 는 모든 경기에 영구히 뜨고 끌 방법이 없다.
   * NO_STAFF_ASSIGNED 도 같이 묶인다: 필드 담당자 커버 판정이 fixture 의 fieldId 를 기준으로
   * 하므로, 경기장을 못 채우는 한 스태프를 배정해도 경고가 사라지지 않는다.
   *
   * 해소 불가능한 경고가 상시 켜져 있으면 배지 줄이 늘 주황색이라, 실제로 조치가 필요한
   * 경고(득점자 미기재·검토 기한 초과·라인업 미제출)까지 함께 묻힌다.
   *
   * 배정 UI 가 생기면 이 배열을 비우면 원래대로 돌아온다. 백엔드는 계속 두 코드를 계산해
   * 내려주므로(필터 화면 포함) 데이터는 그대로다. */
  const UNACTIONABLE_WARNINGS: readonly V1TournamentOperationsWarningCode[] = [
    'NO_FIELD_ASSIGNED',
    'NO_STAFF_ASSIGNED',
  ];

  function rowWarnings(item: V1TournamentOperationsBoardItem): readonly V1TournamentOperationsWarningCode[] {
    const live = liveWarningsByFixtureId.get(item.fixtureId) ?? [];
    return [...item.warnings, ...live].filter((code) => !UNACTIONABLE_WARNINGS.includes(code));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-between items-start gap-3">
        <div>
          <p className="text-[var(--font-size-caption)] font-semibold text-[var(--blue700)] tracking-normal mb-1">
            {tournament.data?.title ?? '대회 운영'}
          </p>
          <h1 className="text-[22px] md:text-[24px] font-bold text-[var(--text-strong)]">운영 보드</h1>
          <p className="text-[13px] md:text-[14px] text-[var(--text-muted)] mt-1">
            경기 진행 상태와 경고를 한눈에 확인해요. 15초마다 자동으로 갱신돼요.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void board.refetch()}
          disabled={board.isFetching}
          aria-label="지금 새로고침"
          className="flex items-center justify-center w-[44px] h-[44px] rounded-xl border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={18} aria-hidden="true" className={board.isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {stages.length > 0 ? (
        <div className="border-y border-[var(--border)] py-3 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8">
          <TournamentProgressStepper stages={stages} />
        </div>
      ) : null}

      {/* ── 필터 ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="운영 보드 필터">
        <label className="sr-only" htmlFor="board-status-filter">
          경기 상태
        </label>
        <select
          id="board-status-filter"
          value={status ?? ''}
          onChange={(e) => updateFilters({ status: (e.target.value || undefined) as V1GameState | undefined })}
          className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
        >
          <option value="">전체 상태</option>
          {V1_GAME_STATES.map((value) => (
            <option key={value} value={value}>
              {GAME_STATE_FILTER_LABELS[value]}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="board-field-filter">
          필드
        </label>
        <select
          id="board-field-filter"
          value={fieldId ?? ''}
          onChange={(e) => updateFilters({ fieldId: e.target.value || undefined })}
          className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
        >
          <option value="">전체 필드</option>
          {(fields.data?.items ?? []).map((field) => (
            <option key={field.id} value={field.id}>
              {field.name}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="board-warning-filter">
          경고
        </label>
        <select
          id="board-warning-filter"
          value={warning ?? ''}
          onChange={(e) =>
            updateFilters({ warning: (e.target.value || undefined) as V1TournamentStableWarningCode | undefined })
          }
          className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
        >
          <option value="">전체 경고</option>
          {/* 배지에서 숨긴 경고는 필터에서도 뺀다 — 고르면 결과가 늘 비어 보이는 필터가 된다.
              (숨기는 이유는 rowWarnings 위 주석 참고) */}
          {V1_STABLE_WARNING_CODES.filter((value) => !UNACTIONABLE_WARNINGS.includes(value)).map((value) => (
            <option key={value} value={value}>
              {WARNING_FILTER_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      {/* ── 목록 ─────────────────────────────────────────────────────── */}
      {board.isPending ? (
        <>
          <div className="hidden lg:block">
            <AdminTableSkeleton rows={6} cols={5} />
          </div>
          <div className="lg:hidden bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
            <AdminListSkeleton rows={6} />
          </div>
        </>
      ) : board.isError ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] py-10 px-4 flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-[var(--red700)] font-medium">
            {extractErrorMessage(board.error, '운영 보드를 불러오지 못했어요.')}
          </p>
          <button
            type="button"
            onClick={() => void board.refetch()}
            className="text-sm text-[var(--blue700)] hover:bg-[var(--blue50)] underline underline-offset-2 min-h-[44px] px-3 rounded transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            다시 시도하기
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
          <AdminEmpty title="조건에 맞는 경기가 없어요" description="다른 필터로 다시 확인해 보세요." />
        </div>
      ) : (
        <>
          {/* ── 데스크톱 표 (lg+) ────────────────────────────────────── */}
          <div className="hidden lg:block bg-[var(--card-surface)] rounded-2xl border border-[var(--border)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-max min-w-full text-sm text-[var(--text-body)]">
                <thead className="sticky top-0 bg-[var(--surface-soft)] border-b border-[var(--border)]">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] text-[12px]">
                      대진
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] text-[12px]">
                      일정
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] text-[12px]">
                      필드
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] text-[12px]">
                      상태
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] text-[12px]">
                      경고
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-[var(--text-muted)] text-[12px]">
                      운영
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {items.map((item) => (
                    <tr key={item.fixtureId}>
                      <td className="px-4 py-3 align-middle">
                        <p className="font-medium text-[var(--text-strong)]">{rowLabel(item)}</p>
                        {/* 모바일 카드와 같은 표기 — "4강 4경기"는 "4강의 4번째 경기"로 오독된다. */}
                        <p className="text-[12px] text-gray-400">{item.round} · {item.fixtureNumber}번 경기</p>
                      </td>
                      <td className="px-4 py-3 align-middle tabular-nums">
                        {item.scheduledAt ? formatAdminDateTime(item.scheduledAt) : '미정'}
                      </td>
                      <td className="px-4 py-3 align-middle">{item.fieldName ?? '미배정'}</td>
                      <td className="px-4 py-3 align-middle">
                        <GameStateBadge state={item.gameState} />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-wrap gap-1">
                          {rowWarnings(item).length === 0 ? (
                            <span className="text-[12px] text-gray-300 dark:text-gray-600">—</span>
                          ) : (
                            rowWarnings(item).map((code) => <WarningBadge key={code} code={code} />)
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <Link
                          href={`/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/fixtures/${encodeURIComponent(item.fixtureId)}/operate`}
                          className="inline-flex items-center min-h-11 px-3 rounded-lg text-[12px] font-medium whitespace-nowrap text-[var(--blue700)] bg-[var(--blue50)] hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                        >
                          운영 콘솔
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── 모바일/태블릿 카드 목록 (<lg) ───────────────────────────── */}
          <ul className="lg:hidden flex flex-col gap-2" role="list">
            {items.map((item) => (
              <li
                key={item.fixtureId}
                className="bg-[var(--card-surface)] rounded-xl border border-[var(--border)] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--text-strong)] truncate">{rowLabel(item)}</p>
                    <p className="text-[12px] text-gray-400">
                      {/* "4강 4경기"는 "4강의 4번째 경기"로 오독된다 — fixtureNumber 는
                          대회 전체 연번이므로 '번 경기'로 번호임을 드러낸다. */}
                      {item.round} · {item.fixtureNumber}번 경기 ·{' '}
                      {item.scheduledAt ? formatAdminDateTime(item.scheduledAt) : '일정 미정'}
                    </p>
                    {/* 미배정은 아래 경고 배지가 이미 알려준다 — 같은 말을 두 번 하지 않는다. */}
                    {item.fieldName ? (
                      <p className="text-[12px] text-gray-400 mt-0.5">필드 {item.fieldName}</p>
                    ) : null}
                  </div>
                  <GameStateBadge state={item.gameState} />
                </div>
                {rowWarnings(item).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {rowWarnings(item).map((code) => (
                      <WarningBadge key={code} code={code} />
                    ))}
                  </div>
                )}
                <Link
                  href={`/tournament-ops/tournaments/${encodeURIComponent(tournamentId)}/fixtures/${encodeURIComponent(item.fixtureId)}/operate`}
                  className="mt-2 inline-flex items-center min-h-11 px-3 rounded-lg text-[12px] font-medium whitespace-nowrap text-[var(--blue700)] bg-[var(--blue50)] hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                >
                  운영 콘솔로 이동
                </Link>
              </li>
            ))}
          </ul>

          {nextCursor && (
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => void handleLoadMore()}
                disabled={loadingMore}
                className="h-[44px] px-6 rounded-xl border border-[var(--border)] text-[var(--text-body)] text-sm font-semibold hover:bg-[var(--surface-soft)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
              >
                {loadingMore ? '불러오는 중…' : '더 보기'}
              </button>
              {loadMoreError && (
                <p className="text-[13px] text-[var(--red700)]" role="alert">
                  {loadMoreError}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
