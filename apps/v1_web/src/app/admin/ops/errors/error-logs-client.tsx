'use client';

import { useEffect, useState } from 'react';
import { useAdminErrorLogs } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import {
  AdminDataTable,
  AdminEmpty,
  AdminFilterBar,
} from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';
import type {
  V1AdminErrorLogFilters,
  V1AdminErrorLogLevel,
  V1AdminErrorLogListItem,
  V1AdminErrorLogSource,
} from '@/types/api';
import { ErrorLogDetailModal } from './error-log-detail-modal';

// ── Filter types ──────────────────────────────────────────────────────────
type SourceFilter = '' | V1AdminErrorLogSource;
type LevelFilter = '' | V1AdminErrorLogLevel;

interface ChipOption<T extends string> {
  value: T;
  label: string;
}

const SOURCE_OPTIONS: ChipOption<SourceFilter>[] = [
  { value: '', label: '전체' },
  { value: 'server', label: '서버' },
  { value: 'client', label: '클라이언트' },
];

const LEVEL_OPTIONS: ChipOption<LevelFilter>[] = [
  { value: '', label: '전체' },
  { value: 'error', label: 'error' },
  { value: 'warn', label: 'warn' },
];

const PAGE_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * `<input type="date">`가 주는 YYYY-MM-DD를 조회 구간의 경계로 바꾼다.
 *
 * `new Date('2026-07-26')`는 UTC 자정으로 파싱된다 — 그대로 쓰면 KST에서 구간이 9시간
 * 어긋나 하루가 밀리고, 종료일은 그날 00:00:00이 되어 하루치 로그가 통째로 빠진다.
 * 시각을 붙이면 로컬 타임존으로 파싱되므로, 시작은 00:00:00 / 끝은 23:59:59.999로 맞춘다.
 */
function dayBoundaryIso(value: string, edge: 'start' | 'end'): string | null {
  if (!value) return null;
  const d = new Date(`${value}T${edge === 'start' ? '00:00:00.000' : '23:59:59.999'}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 상대 시각: 방금 전 / N분 전 / N시간 전 / N일 전, 그 이후는 절대 일시로. */
function formatRelativeTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const diffMs = Date.now() - d.getTime();
  // 서버 시계가 브라우저보다 조금 앞서면 diff가 음수가 되어 "-1분 전"이 찍힌다.
  // admin/page.tsx의 같은 헬퍼와 동일하게 미래 시각은 '방금 전'으로 눌러 둔다.
  if (diffMs < 0) return '방금 전';
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return formatAdminDateTime(dateStr);
}

function shortRelease(releaseSha: string | null): string {
  if (!releaseSha) return '—';
  return releaseSha.length > 12 ? `${releaseSha.slice(0, 12)}…` : releaseSha;
}

function statusTone(statusCode: number | null): string {
  if (statusCode === null) return 'bg-gray-100 text-gray-600';
  if (statusCode >= 500) return 'bg-red-50 text-red-700';
  if (statusCode >= 400) return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

function sourceTone(source: V1AdminErrorLogSource): string {
  return source === 'server' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700';
}

// ── Component ─────────────────────────────────────────────────────────────
export function ErrorLogsClient() {
  const [source, setSource] = useState<SourceFilter>('');
  const [level, setLevel] = useState<LevelFilter>('');
  const [statusCode, setStatusCode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  // 입력값과 조회에 쓰는 값을 분리한다. 매 키 입력마다 쿼리 키가 바뀌면 글자 수만큼
  // GET /admin/ops/errors 가 나가고, 이 엔드포인트는 @Throttle 60/60s 라 타이핑만으로도
  // 429 를 맞는다.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<V1AdminErrorLogListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const parsedStatusCode = statusCode.trim() === '' ? undefined : Number(statusCode.trim());
  const validStatusCode =
    parsedStatusCode !== undefined && Number.isFinite(parsedStatusCode) ? parsedStatusCode : undefined;

  const filters: V1AdminErrorLogFilters = {
    ...(source ? { source } : {}),
    ...(level ? { level } : {}),
    ...(validStatusCode !== undefined ? { statusCode: validStatusCode } : {}),
    ...(dayBoundaryIso(from, 'start') ? { from: dayBoundaryIso(from, 'start')! } : {}),
    ...(dayBoundaryIso(to, 'end') ? { to: dayBoundaryIso(to, 'end')! } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
    ...(cursor ? { cursor } : {}),
    limit: PAGE_SIZE,
  };

  const { data, isLoading, isError, error, refetch } = useAdminErrorLogs(filters);

  // 필터가 바뀌면 누적 목록·커서를 리셋한다
  useEffect(() => {
    setRows([]);
    setCursor(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, level, validStatusCode, from, to, search]);

  // 새 페이지 데이터를 누적 목록에 append (중복 id 제거)
  useEffect(() => {
    if (!data?.items?.length) return;
    setRows((prev) => {
      const existingIds = new Set(prev.map((r) => r.id));
      const next = data.items.filter((r) => !existingIds.has(r.id));
      return next.length > 0 ? [...prev, ...next] : prev;
    });
  }, [data]);

  const hasMore = !!data?.pageInfo?.hasNext && !!data?.pageInfo?.nextCursor;

  function loadMore() {
    if (data?.pageInfo?.nextCursor) setCursor(data.pageInfo.nextCursor);
  }

  const columns: AdminTableColumn<V1AdminErrorLogListItem>[] = [
    {
      key: 'lastSeenAt',
      header: '마지막 발생',
      render: (row) => (
        <span className="text-gray-500 whitespace-nowrap">{formatRelativeTime(row.lastSeenAt)}</span>
      ),
    },
    {
      key: 'source',
      header: 'source',
      align: 'center',
      width: 'w-[96px]',
      render: (row) => (
        <span
          className={[
            'inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap',
            sourceTone(row.source),
          ].join(' ')}
        >
          {row.source === 'server' ? '서버' : '클라이언트'}
        </span>
      ),
    },
    {
      key: 'statusCode',
      header: 'status',
      align: 'center',
      width: 'w-[96px]',
      render: (row) => (
        <span
          className={[
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums whitespace-nowrap',
            statusTone(row.statusCode),
          ].join(' ')}
        >
          {row.statusCode ?? '—'}
        </span>
      ),
    },
    {
      key: 'route',
      header: 'route',
      render: (row) => (
        <span className="font-mono text-[var(--font-size-label)] text-gray-700 whitespace-nowrap">
          {row.route ?? '—'}
        </span>
      ),
    },
    {
      key: 'message',
      header: 'message',
      render: (row) => (
        <button
          type="button"
          onClick={() => setSelectedId(row.id)}
          className="block w-full text-left break-words text-gray-700 lg:max-w-[320px] lg:truncate hover:text-blue-600 hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
          title={row.message}
        >
          {row.message}
        </button>
      ),
    },
    {
      key: 'occurrenceCount',
      header: '발생 횟수',
      align: 'center',
      width: 'w-[88px]',
      render: (row) => (
        <span className="tabular-nums font-semibold text-gray-700">
          {row.occurrenceCount.toLocaleString('ko-KR')}
        </span>
      ),
    },
    {
      key: 'releaseSha',
      header: '버전',
      width: 'w-[120px]',
      render: (row) => (
        <span
          className="font-mono text-[var(--font-size-micro)] text-gray-400 whitespace-nowrap"
          title={row.releaseSha ?? undefined}
        >
          {shortRelease(row.releaseSha)}
        </span>
      ),
    },
  ];

  const errorMessage =
    isError && rows.length === 0 ? extractErrorMessage(error, '에러 로그를 불러오지 못했어요.') : undefined;

  return (
    <div className="flex flex-col gap-4">
      <AdminFilterBar
        searchLabel="에러 검색"
        searchPlaceholder="메시지·route 검색"
        searchValue={searchInput}
        onSearchChange={setSearchInput}
      />

      {/* source / level chip filters */}
      <div className="flex flex-col gap-2">
        <div role="group" aria-label="source 필터" className="flex items-center gap-1.5 flex-wrap">
          {SOURCE_OPTIONS.map((opt) => {
            const active = source === opt.value;
            return (
              <button
                key={opt.value || 'all'}
                type="button"
                onClick={() => setSource(opt.value)}
                aria-pressed={active}
                className={[
                  'inline-flex items-center px-3 min-h-[44px] rounded-full text-[var(--font-size-label)] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                  active
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div role="group" aria-label="level 필터" className="flex items-center gap-1.5 flex-wrap">
          {LEVEL_OPTIONS.map((opt) => {
            const active = level === opt.value;
            return (
              <button
                key={opt.value || 'all'}
                type="button"
                onClick={() => setLevel(opt.value)}
                aria-pressed={active}
                className={[
                  'inline-flex items-center px-3 min-h-[44px] rounded-full text-[var(--font-size-label)] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                  active
                    ? 'bg-blue-500 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-[var(--font-size-label)] text-gray-600">
            상태코드
            <input
              type="number"
              inputMode="numeric"
              value={statusCode}
              onChange={(e) => setStatusCode(e.target.value)}
              placeholder="예: 500"
              className="w-[88px] h-[44px] px-2.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[var(--font-size-label)] text-gray-600">
            시작일
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-[44px] px-2.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[var(--font-size-label)] text-gray-600">
            종료일
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-[44px] px-2.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </label>
        </div>
      </div>

      <AdminDataTable<V1AdminErrorLogListItem>
        columns={columns}
        rows={rows}
        keyExtractor={(row) => row.id}
        loading={isLoading && rows.length === 0}
        error={errorMessage}
        onRetry={() => void refetch()}
        empty={
          <AdminEmpty
            title="에러 로그가 없어요"
            description="조건에 맞는 서버·클라이언트 에러가 없어요."
          />
        }
        actionsHeader="상세"
        renderActions={(row) => (
          <button
            type="button"
            onClick={() => setSelectedId(row.id)}
            className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            aria-label={`${row.message} 상세 보기`}
          >
            보기
          </button>
        )}
      />

      {hasMore && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoading}
            className="inline-flex items-center justify-center h-[44px] px-6 bg-white border border-gray-200 rounded-xl text-[var(--font-size-body-sm)] text-gray-700 font-medium hover:border-blue-300 hover:text-blue-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? '불러오는 중…' : '더 보기'}
          </button>
        </div>
      )}

      <ErrorLogDetailModal
        id={selectedId}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
