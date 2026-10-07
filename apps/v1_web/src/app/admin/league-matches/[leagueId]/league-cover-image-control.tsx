'use client';

import { useId, useRef, useState } from 'react';
import { CompetitionThumbnail } from '@/components/v1-ui/competition-card';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import { SectionTitle } from '@/components/v1-ui/primitives';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useV1UpdateLeagueCoverImage, useV1UploadImages } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';

const OUTLINE_BUTTON =
  'tm-text-body-sm inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-strong)] px-4 font-semibold text-[var(--text-strong)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

type Feedback = { kind: 'saved' } | { kind: 'upload-error'; message: string } | { kind: 'save-error' } | { kind: 'remove-error'; message: string } | null;

/**
 * 리그 대표 이미지 — 파일을 고르면 업로드 후 바로 저장한다(교체는 확인 없이, 제거만 확인).
 * 미리보기는 목록·상세에 실제로 나가는 `CompetitionThumbnail` 그대로라 56px 크롭 확인이 곧 미리보기다.
 * `CoverImageUploader` 는 빈 상태에 예시 사진을 그려 쓰지 않고 입력 계약만 따른다.
 */
export function LeagueCoverImageControl({
  leagueId,
  sportCode,
  coverImageUrl,
}: {
  leagueId: string;
  sportCode: string;
  coverImageUrl: string | null;
}) {
  const headingId = useId();
  const canWrite = useAdminCanWrite();
  const upload = useV1UploadImages();
  const save = useV1UpdateLeagueCoverImage(leagueId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const busy = upload.isPending || save.isPending;
  const hasImage = coverImageUrl !== null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFeedback(null);
    let url: string | undefined;
    try {
      const result = await upload.mutateAsync(file);
      url = result.urls[0];
    } catch (err) {
      setFeedback({ kind: 'upload-error', message: extractErrorMessage(err, '이미지를 올리지 못했어요.') });
      return;
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
    if (!url) {
      setFeedback({ kind: 'upload-error', message: '이미지를 올리지 못했어요.' });
      return;
    }
    save.mutate(
      { coverImageUrl: url },
      {
        onSuccess: () => setFeedback({ kind: 'saved' }),
        onError: () => setFeedback({ kind: 'save-error' }),
      },
    );
  };

  const onRemove = () => {
    setFeedback(null);
    save.mutate(
      { coverImageUrl: null },
      {
        onSuccess: () => {
          setRemoveOpen(false);
          setFeedback({ kind: 'saved' });
        },
        onError: (err) => {
          setRemoveOpen(false);
          setFeedback({ kind: 'remove-error', message: extractErrorMessage(err, '대표 이미지를 지우지 못했어요.') });
        },
      },
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-4">
        <CompetitionThumbnail sportCode={sportCode} imageUrl={coverImageUrl} />
        <div className="min-w-0">
          <SectionTitle title="대표 이미지" id={headingId} compact />
          <p className="tm-text-body-sm mt-1 text-[var(--text-muted)]">목록 카드와 상세 제목 옆에 56px 정사각형으로 보여요.</p>
          <p className="tm-text-caption mt-2 font-medium text-[var(--text-muted)]" aria-live="polite">
            {hasImage ? '현재 상태: 등록됨' : '현재 상태: 없음 · 종목 그래픽으로 보여요'}
          </p>
          <p className="tm-text-caption mt-1 text-[var(--text-muted)]">
            JPG, PNG, WebP · 큰 사진은 올릴 때 자동으로 줄여요. 파일을 고르면 업로드 후 바로 반영돼요.
          </p>
          {!canWrite && (
            <p className="tm-text-caption mt-1 text-[var(--text-muted)]">현재 계정은 대표 이미지를 바꿀 권한이 없어요.</p>
          )}
          {feedback?.kind === 'saved' && (
            <p role="status" className="tm-text-body-sm mt-2 text-[var(--green700)]">대표 이미지를 저장했어요.</p>
          )}
          {feedback?.kind === 'upload-error' && (
            <p role="alert" className="tm-text-body-sm mt-2 text-[var(--red700)]">{feedback.message}</p>
          )}
          {feedback?.kind === 'save-error' && (
            <p role="alert" className="tm-text-body-sm mt-2 text-[var(--red700)]">이미지는 올렸지만 저장하지 못했어요. 다시 시도해 주세요.</p>
          )}
          {feedback?.kind === 'remove-error' && (
            <p role="alert" className="tm-text-body-sm mt-2 text-[var(--red700)]">{feedback.message}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="대표 이미지 파일 선택"
          className="sr-only"
          tabIndex={-1}
          disabled={!canWrite || busy}
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <button type="button" disabled={!canWrite || busy} onClick={() => inputRef.current?.click()} className={OUTLINE_BUTTON}>
          {upload.isPending ? '업로드 중…' : hasImage ? '이미지 변경' : '이미지 선택'}
        </button>
        {hasImage && (
          <button
            type="button"
            disabled={!canWrite || busy}
            onClick={() => setRemoveOpen(true)}
            className={`${OUTLINE_BUTTON} text-[var(--text-muted)]`}
          >
            제거
          </button>
        )}
      </div>
      <ConfirmModal
        open={removeOpen}
        title="대표 이미지를 지울까요?"
        message="목록과 링크 미리보기에서 종목 그래픽으로 돌아가요. 사진은 다시 올릴 수 있어요."
        confirmLabel="지우기"
        cancelLabel="취소"
        tone="danger"
        busy={save.isPending}
        onConfirm={onRemove}
        onCancel={() => setRemoveOpen(false)}
      />
    </section>
  );
}
