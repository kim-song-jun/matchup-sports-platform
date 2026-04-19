'use client';

import { BellOff, Loader2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage } from '@/lib/utils';

// Hook contracts (Track D implements):
// useRecentPushFailures(limit?) → { data: PushFailureRow[]; isLoading; isError }
// useAckPushFailures() → UseMutationResult<void, Error, { ids?: string[] } | void>
//
// PushFailureRow: { id, endpointSuffix, userIdHash, statusCode, errorCode, occurredAt, acknowledgedAt }

interface PushFailureRow {
  id: string;
  endpointSuffix: string;
  userIdHash: string;
  statusCode: number;
  errorCode: string | null;
  occurredAt: string;
  acknowledgedAt: string | null;
}

interface PushFailureTableProps {
  rows: PushFailureRow[];
  isLoading: boolean;
  onAck: () => void;
  isAcking: boolean;
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}초 전`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

/**
 * Table of recent web-push delivery failures with bulk-acknowledge action.
 * Renders EmptyState when rows is empty.
 */
export function PushFailureTable({ rows, isLoading, onAck, isAcking }: PushFailureTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse" aria-busy="true" aria-label="푸시 실패 로그 로딩 중">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`pft-sk-${i}`} className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 overflow-hidden">
      {/* Table header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">최근 푸시 실패</h2>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={onAck}
            disabled={isAcking}
            aria-label="모든 푸시 실패 로그 일괄 확인 처리"
            className="flex items-center gap-1.5 min-h-[44px] rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900"
          >
            {isAcking ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : null}
            일괄 확인
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="최근 푸시 실패가 없어요"
          description="정상적으로 발송되고 있어요"
          size="sm"
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left" aria-label="웹 푸시 전송 실패 로그">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60">
                <th scope="col" className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  엔드포인트
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  사용자
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap text-right">
                  상태코드
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  에러코드
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  발생시간
                </th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  확인 여부
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    ...{row.endpointSuffix}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {row.userIdHash}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white whitespace-nowrap text-right tabular-nums">
                    {row.statusCode}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {row.errorCode ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    <time dateTime={row.occurredAt} title={new Date(row.occurredAt).toLocaleString('ko-KR')}>
                      {relativeTime(row.occurredAt)}
                    </time>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {row.acknowledgedAt ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                        확인됨
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        미확인
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Re-export type for page-level use
export type { PushFailureRow };
