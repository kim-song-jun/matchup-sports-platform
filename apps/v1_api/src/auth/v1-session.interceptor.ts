import { Injectable } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { mergeMap, tap } from 'rxjs';
import type { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import {
  clearV1SessionCookie,
  writeV1SessionCookie,
} from './v1-session';
import type { V1SessionCookieResponse } from './v1-session';

@Injectable()
export class V1SessionCookieInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context
      .switchToHttp()
      .getResponse<V1SessionCookieResponse>();

    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        const session = readSessionBody(body);
        if (!session) return body;
        // The cookie carries the epoch it was issued under; a later bump revokes it (v1IdentityUserWhere). A password
        // login hands over the epoch it read with the credentials, so a reset landing meanwhile cannot lend it the new one.
        const { sessionEpoch: carried, ...visibleSession } = session;
        const sessionEpoch = carried ?? (await this.prisma.v1User.findUniqueOrThrow({
          where: { id: session.userId },
          select: { sessionEpoch: true },
        })).sessionEpoch;
        writeV1SessionCookie(response, { userId: session.userId, sessionEpoch });
        return carried === undefined ? body : { ...(body as object), session: visibleSession };
      }),
    );
  }
}

@Injectable()
export class V1SessionLogoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context
      .switchToHttp()
      .getResponse<V1SessionCookieResponse>();

    return next.handle().pipe(
      tap(() => {
        clearV1SessionCookie(response);
      }),
    );
  }
}

function readSessionBody(value: unknown): { userId: string; sessionEpoch?: number } | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('session' in value) ||
    typeof value.session !== 'object' ||
    value.session === null ||
    !('userId' in value.session) ||
    typeof value.session.userId !== 'string'
  ) {
    return null;
  }
  const epoch = 'sessionEpoch' in value.session ? value.session.sessionEpoch : undefined;
  return {
    ...(value.session as Record<string, unknown>),
    userId: value.session.userId,
    sessionEpoch: typeof epoch === 'number' ? epoch : undefined,
  };
}
