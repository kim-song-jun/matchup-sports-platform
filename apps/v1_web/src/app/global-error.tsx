'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/client-error-reporter';
import { claimChunkReloadAttempt, isChunkLoadError, requestReleaseReload } from '@/lib/release-reload';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    reportClientError({
      message: error.message,
      stack: error.stack,
      level: 'error',
      context: { type: 'react-render', digest: error.digest },
    });
  }, [error]);

  /**
   * 청크 실패만 자동으로 되살린다. `reset` 은 에러 경계 하위를 다시 그릴 뿐 문서를 다시
   * 받지 않아서, 사라진 청크에는 아무 소용이 없다(같은 URL 을 또 404 낸다).
   *
   * 이 화면은 자기 `<html><body>` 를 렌더해 루트 레이아웃을 대체하므로, 평소 배포를
   * 감지하던 `ReleaseVersionWatcher` 가 **여기 오는 순간 언마운트된다** — 기다려도 안 낫는다.
   * 그래서 복구를 이 화면이 직접 한 번 태운다.
   */
  useEffect(() => {
    if (!chunkError) return;
    if (!claimChunkReloadAttempt()) return;
    requestReleaseReload();
    // 에러가 **바뀌면** 다시 판정한다(다른 청크로 재발 등). 객체 대신 message/digest 로
    // 거는 이유는 identity 만 흔들리는 리렌더에 끌려 들어가지 않기 위해서다 — 재리로드를
    // 실제로 막는 것은 표식이고, 이 deps 는 "새 에러면 다시 본다" 만 담당한다.
  }, [chunkError, error.message, error.digest]);

  return (
    <html lang="ko">
      <body>
        <main className="v1-root">
          <div className="v1-frame">
            <section className="v1-main" style={{ display: 'grid', alignContent: 'center' }}>
              <div className="v1-card v1-card-pad">
                <p className="v1-item-title">
                  {chunkError ? '앱이 업데이트됐어요' : '화면을 다시 불러올 수 없어요'}
                </p>
                <p className="v1-caption" style={{ marginTop: 8 }}>
                  {chunkError
                    ? '새 버전을 받아올게요. 잠시 기다려도 그대로면 아래를 눌러 주세요.'
                    : '잠시 후 다시 시도해 주세요.'}
                </p>
                <button
                  className="v1-button"
                  type="button"
                  onClick={chunkError ? requestReleaseReload : reset}
                  style={{ marginTop: 16 }}
                >
                  {chunkError ? '새로고침' : '다시 시도'}
                </button>
              </div>
            </section>
          </div>
        </main>
      </body>
    </html>
  );
}
