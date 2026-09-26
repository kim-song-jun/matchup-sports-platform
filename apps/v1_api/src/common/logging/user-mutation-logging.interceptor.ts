import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { Observable, tap } from 'rxjs';
import type { V1AuthUser } from '../../auth/v1-auth-user';

type MutationRequest = Request & {
  id?: string | number;
  v1User?: V1AuthUser;
  route?: { path?: unknown };
};

type HttpLikeError = {
  getStatus?: () => number;
  status?: number;
  statusCode?: number;
};

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// These paths are either high-volume/noisy or already have a stronger durable audit.
// Excluding them keeps the diagnostic stream useful and bounded on a small host.
const EXCLUDED_FIRST_SEGMENTS = new Set([
  'admin',
  'auth',
  'chat',
  'game-operations-worker',
  'logs',
  'notifications',
  'tournament-ops',
  'uploads',
  'verification',
]);

@Injectable()
export class UserMutationLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<MutationRequest>();
    const response = http.getResponse<Response>();
    const method = request.method?.toUpperCase();
    const route = routeTemplate(request);

    if (
      !request.v1User ||
      !method ||
      !MUTATION_METHODS.has(method) ||
      !route ||
      isExcludedRoute(route)
    ) {
      return next.handle();
    }

    const startedAt = Date.now();
    let emitted = false;

    const emit = (outcome: 'success' | 'failure', statusCode: number) => {
      if (emitted) return;
      emitted = true;

      const event = {
        event: 'user_mutation',
        actorUserIdHash: hashActorUserId(request.v1User!.id),
        method,
        route,
        outcome,
        statusCode,
        durationMs: Math.max(0, Date.now() - startedAt),
        requestId: request.id === undefined ? null : String(request.id),
      } as const;

      // Diagnostics must never change the user-visible mutation result.
      try {
        // The request-scoped Pino logger automatically carries `req`, including
        // headers and IP metadata. Use the documented root logger so this compact
        // event contains only the explicitly allowlisted fields below.
        const logger = PinoLogger.root;
        if (!logger) return;

        if (outcome === 'failure') {
          logger.warn(
            { context: UserMutationLoggingInterceptor.name, ...event },
            'Authenticated user mutation failed',
          );
        } else {
          logger.info(
            { context: UserMutationLoggingInterceptor.name, ...event },
            'Authenticated user mutation completed',
          );
        }
      } catch {
        // The existing HTTP logger remains available if this optional event cannot be emitted.
      }
    };

    return next.handle().pipe(
      tap({
        next: () => emit('success', response.statusCode),
        complete: () => emit('success', response.statusCode),
        error: (error: unknown) => emit('failure', errorStatus(error)),
      }),
    );
  }
}

function routeTemplate(request: MutationRequest): string | null {
  const path = request.route?.path;
  if (typeof path !== 'string' || !path.startsWith('/')) {
    return null;
  }

  // Express exposes the matched template here, so IDs and query values never enter the event.
  return path.replace(/\/+$/, '') || '/';
}

function isExcludedRoute(route: string): boolean {
  const segments = route.split('/').filter(Boolean);
  const apiIndex = segments[0] === 'api' && segments[1] === 'v1' ? 2 : 0;
  return EXCLUDED_FIRST_SEGMENTS.has(segments[apiIndex] ?? '');
}

function hashActorUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 24);
}

function errorStatus(error: unknown): number {
  if (!error || typeof error !== 'object') return 500;

  const candidate = error as HttpLikeError;
  if (typeof candidate.getStatus === 'function') {
    const status = candidate.getStatus();
    if (Number.isInteger(status)) return status;
  }
  if (Number.isInteger(candidate.statusCode)) return candidate.statusCode!;
  if (Number.isInteger(candidate.status)) return candidate.status!;
  return 500;
}
