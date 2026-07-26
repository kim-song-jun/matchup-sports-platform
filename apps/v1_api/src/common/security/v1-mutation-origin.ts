import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export class V1FrontendOriginConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V1FrontendOriginConfigurationError';
  }
}

export function requireProductionFrontendOrigin(value: string | undefined): string {
  if (!value) {
    throw new V1FrontendOriginConfigurationError(
      'FRONTEND_URL must be configured in production',
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new V1FrontendOriginConfigurationError(
      'FRONTEND_URL must be a valid absolute URL',
    );
  }

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  ) {
    throw new V1FrontendOriginConfigurationError(
      'FRONTEND_URL must be an HTTPS origin without credentials, path, query, or fragment',
    );
  }

  return url.origin;
}

export function createV1MutationOriginMiddleware(allowedOrigin: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }

    const origin = request.header('origin');
    if (!origin || origin === allowedOrigin) {
      next();
      return;
    }

    response.status(403).json({
      status: 'error',
      statusCode: 403,
      code: 'INVALID_REQUEST_ORIGIN',
      message: '요청 출처를 확인할 수 없어요.',
      timestamp: new Date().toISOString(),
    });
  };
}
