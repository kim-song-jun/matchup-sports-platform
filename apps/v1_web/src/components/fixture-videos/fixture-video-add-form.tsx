'use client';

import { useState } from 'react';
import { Link2, Upload } from 'lucide-react';
import { extractErrorMessage } from '@/lib/error-message';
import {
  VIDEO_UPLOAD_ACCEPT,
  VIDEO_UPLOAD_EXTENSION_LABEL,
  VIDEO_UPLOAD_MAX_BYTES,
  VIDEO_UPLOAD_MAX_LABEL,
} from '@/hooks/use-v1-fixture-videos';

/**
 * 경기 영상 등록 폼(외부 링크 / 파일 업로드) — 대회 영상 콘솔(videos-page-client.tsx)에서
 * 추출한 공용 컴포넌트. 리그 어드민 영상 화면이 같은 폼을 그대로 쓴다 — 등록 방식·한도
 * 안내·검증 문구가 도메인마다 갈리면 운영자가 화면마다 다른 규칙으로 오해한다.
 *
 * 데이터 레이어는 호출부가 주입한다(mutation 훅이 대회/리그 경로로 갈리므로):
 * `submitLink`/`submitFile` 은 성공 시 resolve, 실패 시 reject 하는 Promise 를 돌려준다.
 */
type AddMode = 'link' | 'file';

export function FixtureVideoAddForm({
  idPrefix,
  isPending,
  submitLink,
  submitFile,
  onDone,
  onError,
}: {
  /** input id 충돌 방지용 — 경기(fixture) 단위로 유일해야 한다. */
  idPrefix: string;
  isPending: boolean;
  submitLink: (payload: { url: string; title?: string }) => Promise<unknown>;
  submitFile: (payload: { file: File; title?: string }) => Promise<unknown>;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<AddMode>('link');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const canSubmit = !isPending && (mode === 'link' ? url.trim().length > 0 : file !== null);

  function reset() {
    setUrl('');
    setTitle('');
    setFile(null);
    setLocalError(null);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setLocalError(null);
    const trimmedTitle = title.trim();

    if (mode === 'link') {
      submitLink({ url: url.trim(), ...(trimmedTitle ? { title: trimmedTitle } : {}) })
        .then(() => {
          reset();
          onDone('영상을 등록했어요.');
        })
        .catch((error: unknown) => onError(extractErrorMessage(error, '영상을 등록하지 못했어요.')));
      return;
    }

    if (file === null) return;
    // 서버도 같은 한도를 강제하지만, 200MB를 다 올려 보낸 뒤 거절당하는 건 낭비다.
    if (file.size > VIDEO_UPLOAD_MAX_BYTES) {
      setLocalError(`영상 파일은 ${VIDEO_UPLOAD_MAX_LABEL}까지 올릴 수 있어요.`);
      return;
    }
    submitFile({ file, ...(trimmedTitle ? { title: trimmedTitle } : {}) })
      .then(() => {
        reset();
        onDone('영상을 업로드했어요.');
      })
      .catch((error: unknown) => onError(extractErrorMessage(error, '영상을 업로드하지 못했어요.')));
  }

  const linkInputId = `video-url-${idPrefix}`;
  const fileInputId = `video-file-${idPrefix}`;
  const titleInputId = `video-title-${idPrefix}`;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2 pt-1">
      <div className="flex gap-2" role="group" aria-label="영상 등록 방식">
        {(['link', 'file'] as const).map((value) => {
          const active = mode === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setMode(value);
                setLocalError(null);
              }}
              className={[
                'inline-flex items-center gap-2 h-[44px] px-3 rounded-xl text-sm font-semibold transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                active
                  ? 'bg-blue-500 text-white'
                  : 'bg-[var(--surface-soft)] text-[var(--text-body)] hover:bg-[var(--border)]',
              ].join(' ')}
            >
              {value === 'link' ? <Link2 size={16} aria-hidden="true" /> : <Upload size={16} aria-hidden="true" />}
              {value === 'link' ? '링크 등록' : '파일 업로드'}
            </button>
          );
        })}
      </div>

      {mode === 'link' ? (
        <div className="flex flex-col gap-1">
          <label htmlFor={linkInputId} className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
            영상 주소
          </label>
          <input
            id={linkInputId}
            type="url"
            inputMode="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            maxLength={1000}
            disabled={isPending}
            placeholder="https://youtu.be/..."
            className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
          />
          <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            유튜브 등 http·https 로 시작하는 주소만 등록할 수 있어요.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor={fileInputId} className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
            영상 파일
          </label>
          <input
            id={fileInputId}
            type="file"
            accept={VIDEO_UPLOAD_ACCEPT}
            disabled={isPending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setLocalError(null);
            }}
            className="min-h-[44px] text-sm text-[var(--text-body)] file:mr-3 file:h-[36px] file:rounded-lg file:border-0 file:bg-[var(--surface-soft)] file:px-3 file:text-sm file:font-semibold file:text-[var(--text-body)] disabled:opacity-50"
          />
          <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            {VIDEO_UPLOAD_EXTENSION_LABEL} 파일을 {VIDEO_UPLOAD_MAX_LABEL}까지 올릴 수 있어요. 업로드에는
            시간이 걸릴 수 있어요.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={titleInputId} className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
          제목 (선택)
        </label>
        <input
          id={titleInputId}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          disabled={isPending}
          placeholder="예: 전반 하이라이트"
          className="h-[44px] px-3 text-sm bg-[var(--card-surface)] border border-[var(--border)] rounded-xl text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors disabled:opacity-50"
        />
      </div>

      {localError !== null && (
        <p className="text-[length:var(--font-size-label)] text-[var(--red700)]" role="alert">
          {localError}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className={[
          'h-[44px] px-4 rounded-xl text-sm font-semibold transition-colors self-start',
          'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
          canSubmit
            ? 'bg-blue-500 text-white hover:bg-blue-600'
            : 'bg-[var(--grey100)] text-[var(--text-caption)] cursor-not-allowed',
        ].join(' ')}
      >
        {isPending ? (mode === 'file' ? '업로드 중…' : '등록 중…') : '영상 등록'}
      </button>
    </form>
  );
}
