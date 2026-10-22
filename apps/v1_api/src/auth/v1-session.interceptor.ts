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
        const userId = readSessionUserId(body);
        if (userId) {
          // The cookie carries the epoch it was issued under; a later bump revokes it (v1IdentityUserWhere).
          const { sessionEpoch } = await this.prisma.v1User.findUniqueOrThrow({
            where: { id: userId },
            select: { sessionEpoch: true },
          });
          writeV1SessionCookie(response, { userId, sessionEpoch });
        }
        return body;
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

function readSessionUserId(value: unknown): string | null {
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

  return value.session.userId;
}
