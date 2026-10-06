'use client';

import { useId } from 'react';
import { useV1UpdateLeagueVisibility } from '@/hooks/use-v1-api';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { extractErrorMessage } from '@/lib/error-message';
import { SectionTitle } from '@/components/v1-ui/primitives';

export function LeagueVisibilityControl({ leagueId, isPublic }: { leagueId: string; isPublic: boolean }) {
  const headingId = useId();
  const canWrite = useAdminCanWrite();
  const updateVisibility = useV1UpdateLeagueVisibility(leagueId);

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <SectionTitle title="공개 설정" id={headingId} compact />
        <p className="tm-text-body-sm mt-1 text-[var(--text-muted)]">
          {isPublic
            ? '공개 리그 목록과 검색, 홈 화면에 표시돼요.'
            : '일반 사용자에게 숨겨져요. 관리자 운영과 대진 정보는 유지돼요.'}
        </p>
        <p className="tm-text-caption mt-2 font-medium text-[var(--text-muted)]" aria-live="polite">
          현재 상태: {isPublic ? '공개' : '비공개'}
        </p>
        {!canWrite && (
          <p className="tm-text-caption mt-1 text-[var(--text-muted)]">
            현재 계정은 공개 상태를 변경할 권한이 없어요.
          </p>
        )}
        {updateVisibility.isError && (
          <p role="alert" className="tm-text-body-sm mt-2 text-[var(--red700)]">
            {extractErrorMessage(updateVisibility.error, '공개 상태를 저장하지 못했어요.')}
          </p>
        )}
        {updateVisibility.isSuccess && (
          <p role="status" className="tm-text-body-sm mt-2 text-[var(--green700)]">
            공개 상태를 저장했어요.
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={!canWrite || updateVisibility.isPending}
        onClick={() => updateVisibility.mutate({ isPublic: !isPublic })}
        className="tm-text-body-sm inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {updateVisibility.isPending ? '저장 중…' : isPublic ? '비공개로 전환' : '공개로 전환'}
      </button>
    </section>
  );
}
