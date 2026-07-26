import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as clientErrorReporter from '@/lib/client-error-reporter';
import { ClientErrorListener } from './client-error-listener';

describe('ClientErrorListener', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports window error events', () => {
    const reportSpy = vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
    render(<ClientErrorListener />);

    window.dispatchEvent(
      new ErrorEvent('error', { message: 'boom from window', error: new Error('boom from window') }),
    );

    expect(reportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom from window', level: 'error' }),
    );
  });

  it('reports unhandled promise rejections', () => {
    const reportSpy = vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
    render(<ClientErrorListener />);

    const event = new Event('unhandledrejection') as PromiseRejectionEvent & { reason: unknown };
    Object.defineProperty(event, 'reason', { value: new Error('rejected promise') });
    window.dispatchEvent(event);

    expect(reportSpy).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'rejected promise', level: 'error' }),
    );
  });
});
