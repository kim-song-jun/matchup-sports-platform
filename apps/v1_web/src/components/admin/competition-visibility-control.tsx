'use client';

import { useId } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { extractErrorMessage } from '@/lib/error-message';
import { SectionTitle } from '@/components/v1-ui/primitives';

/**
 * 대회·리그 공통 "공개 설정" 카드. 비공개면 일반 사용자의 목록·검색·상세·기록에서 숨고, 관리자
 * 운영과 데이터는 그대로다. 어느 API 를 부를지는 감싸는 쪽(리그/대회)이 mutation 으로 넘긴다.
 *
 * 공개 설정과 별개로 **상태 때문에** 일반 화면에 안 보이는 경우가 있다(취소된 대회, 준비 중인 대회 —
 * 공개 조회는 접수 중·마감·진행 중·종료만 연다). 그때 "현재 상태: 공개"만 보여 주면 실제로 보이는
 * 줄 알게 된다:
 * - `hiddenReason` — 상태 때문에 설정이 아무 의미가 없다(취소). 실제 노출을 말하고 전환 버튼을 숨긴다.
 * - `exposureNote` — 지금은 안 보이지만 나중에 이 설정대로 보인다(준비 중). 설정은 그대로 바꿀 수 있다.
 */
export function CompetitionVisibilityControl({
  isPublic,
  publicDescription,
  privateDescription,
  mutation,
  hiddenReason,
  exposureNote,
}: {
  isPublic: boolean;
  publicDescription: string;
  privateDescription: string;
  mutation: UseMutationResult<unknown, unknown, { isPublic: boolean }>;
  hiddenReason?: string;
  exposureNote?: string;
}) {
  const headingId = useId();
  const canWrite = useAdminCanWrite();

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <SectionTitle title="공개 설정" id={headingId} compact />
        <p className="tm-text-body-sm mt-1 text-[var(--text-muted)]">
          {hiddenReason ?? (isPublic ? publicDescription : privateDescription)}
        </p>
        <p className="tm-text-caption mt-2 font-medium text-[var(--text-muted)]" aria-live="polite">
          현재 상태: {hiddenReason ? '일반 화면에 노출 안 됨' : isPublic ? '공개' : '비공개'}
        </p>
        {!hiddenReason && exposureNote && (
          <p className="tm-text-caption mt-1 text-[var(--text-muted)]">{exposureNote}</p>
        )}
        {!hiddenReason && !canWrite && (
          <p className="tm-text-caption mt-1 text-[var(--text-muted)]">
            현재 계정은 공개 상태를 변경할 권한이 없어요.
          </p>
        )}
        {mutation.isError && (
          <p role="alert" className="tm-text-body-sm mt-2 text-[var(--red700)]">
            {extractErrorMessage(mutation.error, '공개 상태를 저장하지 못했어요.')}
          </p>
        )}
        {mutation.isSuccess && (
          <p role="status" className="tm-text-body-sm mt-2 text-[var(--green700)]">
            공개 상태를 저장했어요.
          </p>
        )}
      </div>
      {hiddenReason ? null : (
        <button
          type="button"
          disabled={!canWrite || mutation.isPending}
          onClick={() => mutation.mutate({ isPublic: !isPublic })}
          className="tm-text-body-sm inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mutation.isPending ? '저장 중…' : isPublic ? '비공개로 전환' : '공개로 전환'}
        </button>
      )}
    </section>
  );
}
