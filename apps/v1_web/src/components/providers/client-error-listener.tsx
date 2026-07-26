'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/client-error-reporter';

export function ClientErrorListener() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      reportClientError({
        message: event.message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        level: 'error',
        context: { type: 'window.onerror', filename: event.filename, lineno: event.lineno },
      });
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      reportClientError({
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        level: 'error',
        context: { type: 'unhandledrejection' },
      });
    }

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}
