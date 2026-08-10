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
  if (statusCode === null) return 'bg-[var(--surface-soft)] text-[var(--text-muted)]';
  if (statusCode >= 500) return 'bg-[var(--red50)] text-[var(--red700)]';
  if (statusCode >= 400) return 'bg-[var(--tint-orange)] text-[var(--orange700)]';
  return 'bg-[var(--surface-soft)] text-[var(--text-muted)]';
}

function sourceTone(source: V1AdminErrorLogSource): string {
  return source === 'server' ? 'bg-[var(--blue50)] text-[var(--blue700)]' : 'bg-purple-50 text-purple-700';
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
  // 커서 누적 대신 페이지 단위 교체다 — 목록 어디쯤인지와 총량이 보여야 한다.
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const parsedStatusCode = statusCode.trim() === '' ? undefined : Number(statusCode.trim());
  const validStatusCode =
    parsedStatusCode !== undefined && Number.isFinite(parsedStatusCode) ? parsedStatusCode : undefined;

  const fromIso = dayBoundaryIso(from, 'start');
  const toIso = dayBoundaryIso(to, 'end');

  const filters: V1AdminErrorLogFilters = {
    ...(source ? { source } : {}),
    ...(level ? { level } : {}),
    ...(validStatusCode !== undefined ? { statusCode: validStatusCode } : {}),
    ...(fromIso ? { from: fromIso } : {}),
    ...(toIso ? { to: toIso } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
    page,
    limit: PAGE_SIZE,
  };

  const { data, isLoading, isFetching, isError, error, refetch } = useAdminErrorLogs(filters);
  const rows = data?.items ?? [];
  const pageInfo = data?.pageInfo;

  // 필터를 좁히면 보던 페이지에 결과가 없을 수 있어 첫 페이지로 되돌린다.
  useEffect(() => {
    setPage(1);
  }, [source, level, validStatusCode, from, to, search]);

  // 페이지 이동이 실패해도 keepPreviousData 로 직전 페이지가 남아 있어 목록은 비지 않는다 —
  // 그대로 두면 "이동했는데 내용이 그대로"로 보이므로 실패 사실을 따로 알린다.
  const pageChangeFailed = isError && rows.length > 0 && !isLoading;

  const columns: AdminTableColumn<V1AdminErrorLogListItem>[] = [
    {
      key: 'lastSeenAt',
      header: '마지막 발생',
      render: (row) => (
        <span className="text-[var(--text-muted)] whitespace-nowrap">{formatRelativeTime(row.lastSeenAt)}</span>
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
        // route 가 길면(예: /tournaments/campaigns/...) 표 전체를 밀어내 오른쪽 컬럼과
        // 상세 버튼이 가로 스크롤 밖으로 사라진다. 잘라 보여주고 전문은 title 로 준다.
        <span
          className="block truncate font-mono text-[var(--font-size-label)] text-[var(--text-body)] lg:max-w-[200px]"
          title={row.route ?? undefined}
        >
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
          className="block w-full text-left break-words text-[var(--text-body)] lg:max-w-[240px] lg:truncate hover:text-[var(--blue700)] hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
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
        <span className="tabular-nums font-semibold text-[var(--text-body)]">
          {row.occurrenceCount.toLocaleString('ko-KR')}
        </span>
      ),
    },
    {
      key: 'releaseSha',
      header: '버전',
      width: 'w-[96px]',
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
                    : 'bg-[var(--card-surface)] border border-[var(--border)] text-[var(--text-muted)] hover:border-blue-300 hover:text-[var(--blue700)]',
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
                    : 'bg-[var(--card-surface)] border border-[var(--border)] text-[var(--text-muted)] hover:border-blue-300 hover:text-[var(--blue700)]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-[var(--font-size-label)] text-[var(--text-muted)]">
            상태코드
            <input
              type="number"
              inputMode="numeric"
              value={statusCode}
              onChange={(e) => setStatusCode(e.target.value)}
              placeholder="예: 500"
              className="w-[88px] h-[44px] px-2.5 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[var(--font-size-label)] text-[var(--text-muted)]">
            시작일
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-[44px] px-2.5 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[var(--font-size-label)] text-[var(--text-muted)]">
            종료일
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-[44px] px-2.5 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
            />
          </label>
        </div>
      </div>

      {/* tableMaxWidth: 다른 어드민 표와 같이 컨테이너 폭을 다 쓴다. 기본 900px 캡을 두면
          1440 에서도 발생 횟수·버전·상세 버튼이 가로 스크롤 밖으로 밀려 보이지 않았다. */}
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
        tableMaxWidth="max-w-none"
        onRowClick={(row) => setSelectedId(row.id)}
        rowClickLabel={(row) => `${row.message} 상세 보기`}
        pagination={
          pageInfo?.totalPages
            ? {
                page: pageInfo.page ?? page,
                totalPages: pageInfo.totalPages,
                total: pageInfo.total ?? 0,
                limit: pageInfo.limit ?? PAGE_SIZE,
                onPageChange: setPage,
                loading: isFetching,
              }
            : undefined
        }
        renderActions={(row) => (
          <button
            type="button"
            onClick={() => setSelectedId(row.id)}
            className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium text-[var(--blue700)] bg-[var(--blue50)] hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            aria-label={`${row.message} 상세 보기`}
          >
            보기
          </button>
        )}
      />

      {pageChangeFailed && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[var(--font-size-body-sm)] text-[var(--text-muted)]" role="alert">
            {extractErrorMessage(error, '목록을 불러오지 못했어요.')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex items-center justify-center h-[44px] px-6 bg-white dark:bg-gray-800 border border-[var(--border)] rounded-xl text-[var(--font-size-body-sm)] text-[var(--text-body)] font-medium hover:border-blue-300 hover:text-[var(--blue700)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            다시 시도하기
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
