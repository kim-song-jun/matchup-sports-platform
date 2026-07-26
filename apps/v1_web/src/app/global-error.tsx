'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/client-error-reporter';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError({
      message: error.message,
      stack: error.stack,
      level: 'error',
      context: { type: 'react-render', digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <main className="v1-root">
          <div className="v1-frame">
            <section className="v1-main" style={{ display: 'grid', alignContent: 'center' }}>
              <div className="v1-card v1-card-pad">
                <p className="v1-item-title">화면을 다시 불러올 수 없어요</p>
                <p className="v1-caption" style={{ marginTop: 8 }}>
                  잠시 후 다시 시도해 주세요.
                </p>
                <button className="v1-button" type="button" onClick={reset} style={{ marginTop: 16 }}>
                  다시 시도
                </button>
              </div>
            </section>
          </div>
        </main>
      </body>
    </html>
  );
}
