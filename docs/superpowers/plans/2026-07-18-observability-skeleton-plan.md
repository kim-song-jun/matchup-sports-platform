# Observability Skeleton (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `apps/v1_api` structured JSON logging that captures every backend error/warning (including the 4xx business errors currently dropped), give `apps/v1_web` a single choke point that reports every user-facing error to the backend, and lay env-gated GA4 plumbing (script loader + `trackEvent()`/`trackPageview()`) that is a no-op until a Measurement ID is supplied later.

**Architecture:** Backend swaps NestJS's console `Logger` for `nestjs-pino` (JSON to stdout, auto request-id), and `AllExceptionsFilter` moves from a manually-`new`'d instance to a DI-registered `APP_FILTER` so it can inject `PinoLogger` and log both 4xx (warn) and 5xx (error) with route/code/userId context. A new public, throttled `POST /logs/client-error` endpoint accepts frontend error reports into the same pino pipeline. Frontend gets one reporting function (`reportClientError`) wired into three capture points (the shared `v1Api()` fetch wrapper, global `window.onerror`/`unhandledrejection` listeners, and the React error boundary) plus an env-gated GA4 loader (`trackEvent`/`trackPageview`) that renders nothing when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is unset.

**Tech Stack:** NestJS 11 + `nestjs-pino` 4.x (backend), Next.js 16 App Router + `next/script` (frontend), Jest (BE tests), Vitest (FE tests).

## Global Constraints

- Base branch: `dev`. Working tree: `.claude/worktrees/observability-skeleton` on branch `feat/v1-observability-skeleton`.
- Scope is `apps/v1_api` + `apps/v1_web` only — legacy `apps/api`/`apps/web` are not deployed and out of scope.
- No external error-tracking SaaS (Sentry etc.) — self-hosted structured logs only (user decision, 2026-07-18).
- GA4 Measurement ID does not exist yet — all GA code must be a complete no-op when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is unset.
- No PII in GA event params or client-error `context` (spec: sportType/teamId/matchId-style identifiers only, never email/name/phone).
- `client-error` endpoint is unauthenticated and public — must be rate-limited (`@Throttle`) and payload-size-capped to prevent abuse.
- Every new/modified backend file needs a matching `*.spec.ts`; every new/modified frontend `lib/`/`components/providers/` file needs a matching `*.test.ts(x)` (project convention — real tests only, no contract/existence-only tests per global rule 3).
- Full test suites are NOT re-run per task — run only the targeted spec/test file per task (global rule 24); a full-suite run belongs at the end of the whole Phase 0 branch, not per task.

---

### Task 1: Backend — install `nestjs-pino` and wire structured logging into bootstrap

**Files:**
- Modify: `apps/v1_api/package.json`
- Modify: `apps/v1_api/src/app.module.ts`
- Modify: `apps/v1_api/src/main.ts`

**Interfaces:**
- Produces: `LoggerModule` (from `nestjs-pino`) registered globally in `AppModule`, so later tasks can `@InjectPinoLogger(ContextName)` anywhere. `main.ts` calls `app.useLogger(app.get(PinoNestLogger))`, so every existing `new Logger('X')` call across the codebase (they share Nest's static logger reference) automatically starts emitting structured JSON — no other files need to change for this.

- [ ] **Step 1: Add dependencies**

Run:
```bash
cd apps/v1_api
pnpm add nestjs-pino@^4.6.1 pino-http@^11.0.0
pnpm add -D pino-pretty@^13.1.3
cd ../..
```
Expected: `apps/v1_api/package.json` `dependencies` gains `nestjs-pino`, `pino-http`; `devDependencies` gains `pino-pretty`. Root `pnpm-lock.yaml` updates.

- [ ] **Step 2: Register `LoggerModule` in `AppModule`**

Edit `apps/v1_api/src/app.module.ts` — add the import and the module entry (first import, first module, so bootstrap logs are captured from the earliest point):

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { V1ThrottlerGuard } from './common/guards/v1-throttler.guard';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { HomeModule } from './home/home.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { MasterModule } from './master/master.module';
import { MatchesModule } from './matches/matches.module';
import { NoticesModule } from './notices/notices.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { PrismaModule } from './prisma/prisma.module';
import { TeamsModule } from './teams/teams.module';
import { TeamMatchesModule } from './team-matches/team-matches.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProfileModule } from './profile/profile.module';
import { AdminModule } from './admin/admin.module';
import { SearchModule } from './search/search.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UploadsModule } from './uploads/uploads.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { VerificationModule } from './verification/verification.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { colorize: true, singleLine: true } },
        redact: ['req.headers.authorization', 'req.headers["x-v1-user-email"]'],
      },
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ limit: 1000, ttl: 60_000 }],
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    HomeModule,
    InquiriesModule,
    MatchesModule,
    OnboardingModule,
    MasterModule,
    NoticesModule,
    TeamsModule,
    TeamMatchesModule,
    ChatModule,
    NotificationsModule,
    ProfileModule,
    AdminModule,
    SearchModule,
    ReviewsModule,
    UploadsModule,
    TournamentsModule,
    VerificationModule,
    IntegrationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: V1ThrottlerGuard }],
})
export class AppModule {}
```

(This step only adds the `LoggerModule` import + entry; the `LogsModule` import/entry and the `APP_FILTER` provider are added in Task 3 and Task 2 respectively, to keep this step reviewable on its own.)

- [ ] **Step 3: Wire `app.useLogger()` in `main.ts`**

Edit `apps/v1_api/src/main.ts` — add the `nestjs-pino` `Logger` import (aliased to avoid clashing with `@nestjs/common`'s `Logger`, which is still needed for the pre-bootstrap security check), pass `{ bufferLogs: true }` to `NestFactory.create`, and call `app.useLogger()` immediately after app creation:

```ts
import { BadRequestException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as PinoNestLogger } from 'nestjs-pino';
import * as compression from 'compression';
import * as path from 'path';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { UploadsService } from './uploads/uploads.service';

async function bootstrap() {
  const logger = new Logger('V1Bootstrap');

  const isProduction = process.env.NODE_ENV === 'production';
  const allowHeaderAuth = process.env.V1_ALLOW_HEADER_AUTH === 'true';
  if (isProduction && !allowHeaderAuth) {
    logger.error(
      'SECURITY: v1 헤더 신뢰 인증(x-v1-user-*)은 프로덕션에 안전하지 않습니다. ' +
        '서명 세션 인증으로 전환하거나, 의도적으로 위험을 감수할 경우에만 V1_ALLOW_HEADER_AUTH=true 를 설정하세요. 부팅을 중단합니다.',
    );
    throw new Error('V1_HEADER_AUTH_DISABLED_IN_PRODUCTION');
  }
  if (isProduction && allowHeaderAuth) {
    logger.warn(
      'SECURITY WARNING: 헤더 신뢰 인증이 V1_ALLOW_HEADER_AUTH=true 로 프로덕션에서 활성화되어 있습니다. ' +
        '검증되지 않은 x-v1-user-* 헤더를 신뢰합니다. 가능한 한 빨리 서명 세션 인증으로 전환하세요.',
    );
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(PinoNestLogger));

  app.enableShutdownHooks();
  app.set('trust proxy', 1);
  app.use(compression());

  // Serve locally stored upload files at /uploads/*
  // This is a no-op when S3/CDN is configured, as URLs returned by the service
  // would point to the external host instead.
  app.useStaticAssets(path.resolve(UploadsService.UPLOAD_BASE), {
    prefix: UploadsService.SERVE_PREFIX,
  });
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // 검증 실패를 일관된 코드/한글 메시지로 — class-validator 의 raw 영어 메시지가
      // 그대로 프론트에 노출되던 문제 해결. 필드별 상세는 details 로 전달.
      exceptionFactory: (errors: ValidationError[]) => {
        const details = errors.map((error) => ({
          field: error.property,
          messages: error.constraints ? Object.values(error.constraints) : [],
        }));
        return new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: '입력값을 다시 확인해 주세요.',
          details,
        });
      },
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Teameet V1 API')
    .setDescription('Teameet v1 isolated API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.API_PORT || '8121');
  await app.listen(port, '0.0.0.0');
  logger.log(`Teameet V1 API running on http://localhost:${port}`);
}

bootstrap();
```

Note: `app.useGlobalFilters(new AllExceptionsFilter())` and its import are **removed** here — Task 2 re-registers `AllExceptionsFilter` as a DI-based `APP_FILTER` provider instead (required so it can inject `PinoLogger`).

- [ ] **Step 4: Verify the app still boots and emits JSON logs**

Run:
```bash
cd apps/v1_api && pnpm exec tsc --noEmit
```
Expected: no type errors (confirms `nestjs-pino` types resolve and `main.ts`/`app.module.ts` compile).

- [ ] **Step 5: Commit**

```bash
git add apps/v1_api/package.json apps/v1_api/pnpm-lock.yaml apps/v1_api/src/app.module.ts apps/v1_api/src/main.ts pnpm-lock.yaml
git commit -m "feat(v1-api): wire nestjs-pino structured logging into bootstrap"
```
(If the lockfile is at repo root only, drop the `apps/v1_api/pnpm-lock.yaml` path — this is a pnpm workspace with a single root lockfile; use `git status --short -- pnpm-lock.yaml` to confirm which path actually changed before staging.)

---

### Task 2: Backend — `AllExceptionsFilter` becomes DI-based, logs 4xx too, returns `requestId`

**Files:**
- Modify: `apps/v1_api/src/common/filters/http-exception.filter.ts`
- Create: `apps/v1_api/src/common/filters/http-exception.filter.spec.ts`
- Modify: `apps/v1_api/src/app.module.ts`

**Interfaces:**
- Consumes: `PinoLogger`/`InjectPinoLogger` from `nestjs-pino` (registered globally by Task 1's `LoggerModule.forRoot`).
- Produces: error JSON responses now include `requestId: string | undefined` alongside the existing `status`/`statusCode`/`code`/`message`/`details`/`timestamp` fields (Task 7 consumes this on the frontend).

- [ ] **Step 1: Write the failing test**

Create `apps/v1_api/src/common/filters/http-exception.filter.spec.ts`:

```ts
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';

function buildHost(request: Record<string, unknown>) {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('AllExceptionsFilter', () => {
  const logger = { warn: jest.fn(), error: jest.fn() };
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new AllExceptionsFilter(logger as never);
  });

  it('logs HttpException(4xx) at warn level with route context and includes requestId in the response', () => {
    const request = {
      id: 'req-1',
      method: 'POST',
      originalUrl: '/api/v1/matches/1/join',
      v1User: { id: 'user-1' },
    };
    const { host, response } = buildHost(request);
    const exception = new HttpException(
      { code: 'ALREADY_JOINED', message: '이미 참가했어요.' },
      HttpStatus.CONFLICT,
    );

    filter.catch(exception, host);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-1',
        route: '/api/v1/matches/1/join',
        method: 'POST',
        statusCode: HttpStatus.CONFLICT,
        code: 'ALREADY_JOINED',
        userId: 'user-1',
      }),
      expect.any(String),
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ALREADY_JOINED', requestId: 'req-1' }),
    );
  });

  it('logs unexpected non-HttpException errors at error level with stack, without a userId', () => {
    const request = { id: 'req-2', method: 'GET', originalUrl: '/api/v1/home' };
    const { host, response } = buildHost(request);
    const exception = new Error('db connection lost');

    filter.catch(exception, host);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'req-2',
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        userId: undefined,
        stack: expect.stringContaining('db connection lost'),
      }),
      expect.any(String),
    );
    expect(logger.warn).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/v1_api && pnpm test -- http-exception.filter.spec.ts`
Expected: FAIL — `AllExceptionsFilter` constructor currently takes no arguments and does not log HttpException at all (TS error or assertion failure on `logger.warn`).

- [ ] **Step 3: Rewrite the filter**

Replace `apps/v1_api/src/common/filters/http-exception.filter.ts`:

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Request, Response } from 'express';

type V1Request = Request & { id?: string; v1User?: { id: string } };

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@InjectPinoLogger(AllExceptionsFilter.name) private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<V1Request>();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const messageObj =
      typeof message === 'object' && message !== null ? (message as Record<string, unknown>) : null;
    const code = messageObj && typeof messageObj.code === 'string' ? (messageObj.code as string) : undefined;

    const logContext = {
      requestId: request.id,
      route: request.originalUrl ?? request.url,
      method: request.method,
      statusCode: status,
      code: code ?? 'INTERNAL_ERROR',
      userId: request.v1User?.id,
    };

    if (exception instanceof HttpException) {
      this.logger.warn(logContext, `HTTP ${status} ${logContext.method} ${logContext.route}`);
    } else {
      this.logger.error(
        { ...logContext, stack: exception instanceof Error ? exception.stack : String(exception) },
        `Unhandled exception at ${logContext.method} ${logContext.route}`,
      );
    }

    response.status(status).json({
      status: 'error',
      statusCode: status,
      code: code ?? 'INTERNAL_ERROR',
      message:
        typeof message === 'string'
          ? message
          : messageObj && typeof messageObj.message === 'string'
            ? (messageObj.message as string)
            : message,
      details: messageObj?.details ?? null,
      requestId: request.id,
      timestamp: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 4: Register it as a DI-based global filter**

Edit `apps/v1_api/src/app.module.ts` — import `APP_FILTER` alongside `APP_GUARD`, import `AllExceptionsFilter`, and add it to `providers`:

```ts
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
// ...existing imports...
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

@Module({
  imports: [ /* unchanged from Task 1 Step 2 */ ],
  providers: [
    { provide: APP_GUARD, useClass: V1ThrottlerGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/v1_api && pnpm test -- http-exception.filter.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Update the frontend's error-body type to match**

Edit `apps/v1_web/src/types/api.ts` — add the new optional field so it's available for Task 7's `context`:

```ts
export type ApiErrorBody = {
  status: 'error';
  statusCode: number;
  code: string;
  message: unknown;
  details?: unknown;
  requestId?: string;
  timestamp: string;
};
```

- [ ] **Step 7: Commit**

```bash
git add apps/v1_api/src/common/filters/http-exception.filter.ts apps/v1_api/src/common/filters/http-exception.filter.spec.ts apps/v1_api/src/app.module.ts apps/v1_web/src/types/api.ts
git commit -m "feat(v1-api): log 4xx business errors and return requestId from AllExceptionsFilter"
```

---

### Task 3: Backend — `POST /logs/client-error` endpoint

**Files:**
- Create: `apps/v1_api/src/logs/dto/client-error-log.dto.ts`
- Create: `apps/v1_api/src/logs/logs.controller.ts`
- Create: `apps/v1_api/src/logs/logs.controller.spec.ts`
- Create: `apps/v1_api/src/logs/logs.module.ts`
- Modify: `apps/v1_api/src/app.module.ts`

**Interfaces:**
- Consumes: `PinoLogger`/`InjectPinoLogger` from `nestjs-pino` (Task 1).
- Produces: `POST /api/v1/logs/client-error` — public, no auth guard, `@Throttle({ default: { limit: 20, ttl: 60_000 } })`, `204 No Content` on success. Body shape consumed by Task 6's `reportClientError()`: `{ message: string; stack?: string; url: string; userAgent?: string; level: 'error' | 'warn'; context?: Record<string, unknown> }`.

- [ ] **Step 1: Write the DTO**

Create `apps/v1_api/src/logs/dto/client-error-log.dto.ts`:

```ts
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClientErrorLogDto {
  @IsString()
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  stack?: string;

  @IsString()
  @MaxLength(2000)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsIn(['error', 'warn'])
  level!: 'error' | 'warn';

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
```

- [ ] **Step 2: Write the failing controller test**

Create `apps/v1_api/src/logs/logs.controller.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getLoggerToken } from 'nestjs-pino';
import { LogsController } from './logs.controller';

describe('LogsController', () => {
  const logger = { warn: jest.fn(), error: jest.fn() };
  let controller: LogsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [LogsController],
      providers: [{ provide: getLoggerToken(LogsController.name), useValue: logger }],
    }).compile();
    controller = moduleRef.get(LogsController);
  });

  it('logs error-level client errors via pino error with the client-tagged payload', () => {
    controller.report({ message: 'boom', url: '/matches/1', level: 'error' });

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'client', url: '/matches/1' }),
      'boom',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs warn-level client errors via pino warn', () => {
    controller.report({ message: 'slow request', url: '/home', level: 'warn' });

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ url: '/home' }), 'slow request');
  });

  it('drops oversized context payloads instead of forwarding them', () => {
    const bigContext = { blob: 'x'.repeat(5000) };
    controller.report({ message: 'boom', url: '/x', level: 'error', context: bigContext });

    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ context: undefined }), 'boom');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/v1_api && pnpm test -- logs.controller.spec.ts`
Expected: FAIL — `./logs.controller` does not exist yet.

- [ ] **Step 4: Write the controller**

Create `apps/v1_api/src/logs/logs.controller.ts`:

```ts
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ClientErrorLogDto } from './dto/client-error-log.dto';

const MAX_CONTEXT_JSON_LENGTH = 4000;

@Controller('logs')
export class LogsController {
  constructor(@InjectPinoLogger(LogsController.name) private readonly logger: PinoLogger) {}

  @Post('client-error')
  @HttpCode(204)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  report(@Body() dto: ClientErrorLogDto): void {
    const context =
      dto.context && JSON.stringify(dto.context).length <= MAX_CONTEXT_JSON_LENGTH ? dto.context : undefined;

    const logPayload = {
      source: 'client' as const,
      url: dto.url,
      userAgent: dto.userAgent,
      stack: dto.stack,
      context,
    };

    if (dto.level === 'warn') {
      this.logger.warn(logPayload, dto.message);
    } else {
      this.logger.error(logPayload, dto.message);
    }
  }
}
```

- [ ] **Step 5: Write the module**

Create `apps/v1_api/src/logs/logs.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { LogsController } from './logs.controller';

@Module({
  controllers: [LogsController],
})
export class LogsModule {}
```

- [ ] **Step 6: Register `LogsModule` in `AppModule`**

Edit `apps/v1_api/src/app.module.ts` — add `import { LogsModule } from './logs/logs.module';` and append `LogsModule` as the last entry in the `imports` array (after `IntegrationsModule`).

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/v1_api && pnpm test -- logs.controller.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/v1_api/src/logs apps/v1_api/src/app.module.ts
git commit -m "feat(v1-api): add public throttled POST /logs/client-error endpoint"
```

---

### Task 4: Infra — Docker log rotation + `LOG_LEVEL` env

**Files:**
- Modify: `deploy/docker-compose.prod.yml`

**Interfaces:** None (infra-only, no code interface).

- [ ] **Step 1: Add `logging:` blocks and `LOG_LEVEL`**

Edit `deploy/docker-compose.prod.yml`. In the `v1_api` service, add `LOG_LEVEL: ${LOG_LEVEL:-info}` to `environment` and a `logging:` block; add the same `logging:` block to `v1_web` (no `LOG_LEVEL` there — the frontend has no server-side logger from this plan):

```yaml
  v1_api:
    image: teameet-v1-api:latest
    container_name: teameet_v1_api
    restart: always
    volumes:
      - v1_uploads_data:/app/apps/v1_api/uploads
    environment:
      DATABASE_URL: postgresql://${V1_DB_USER:-teameet_v1}:${V1_DB_PASSWORD:-${DB_PASSWORD}}@v1_postgres:5432/${V1_DB_NAME:-teameet_v1}
      JWT_SECRET: ${V1_JWT_SECRET:-${JWT_SECRET}}
      V1_SESSION_SECRET: ${V1_SESSION_SECRET:-${V1_JWT_SECRET:-${JWT_SECRET}}}
      FRONTEND_URL: ${FRONTEND_URL:-https://teameet.co.kr}
      V1_HOST_ADMIN_PASSWORD: ${V1_HOST_ADMIN_PASSWORD:-}
      KAKAO_CLIENT_ID: ${KAKAO_CLIENT_ID:-}
      KAKAO_CLIENT_SECRET: ${KAKAO_CLIENT_SECRET:-}
      KAKAO_REDIRECT_URI: ${KAKAO_REDIRECT_URI:-}
      API_PORT: 8121
      NODE_ENV: production
      LOG_LEVEL: ${LOG_LEVEL:-info}
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:8121/api/v1/health').then(async (res) => { if (!res.ok) throw new Error('v1 api health ' + res.status); const json = await res.json(); if (!json?.data?.checks?.db) throw new Error('v1 api health degraded'); }).catch(() => process.exit(1));",
        ]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 20s
    depends_on:
      v1_postgres:
        condition: service_healthy
    ports:
      - "127.0.0.1:8121:8121"
    deploy:
      resources:
        limits:
          memory: 512M

  v1_web:
    image: teameet-v1-web:latest
    container_name: teameet_v1_web
    restart: always
    environment:
      NEXT_PUBLIC_API_URL: /api/v1
      NEXT_PUBLIC_KAKAO_CLIENT_ID: ${KAKAO_CLIENT_ID:-}
      NEXT_PUBLIC_KAKAO_REDIRECT_URI: ${KAKAO_REDIRECT_URI:-}
      INTERNAL_API_ORIGIN: ${V1_INTERNAL_API_ORIGIN:-http://v1_api:8121}
      HOSTNAME: 0.0.0.0
      PORT: 3013
      NODE_ENV: production
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
    depends_on:
      v1_api:
        condition: service_healthy
```

(Leave the rest of `v1_web`'s block — `healthcheck`, `ports`, `deploy.resources` — exactly as-is; only the `environment`/`logging` insertion point above changes.)

- [ ] **Step 2: Validate the compose file parses**

Run: `docker compose -f deploy/docker-compose.prod.yml config --quiet`
Expected: exits 0 with no output (confirms valid YAML + compose schema; does not require the images to exist).

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.prod.yml
git commit -m "chore(deploy): cap v1_api/v1_web container logs and add LOG_LEVEL"
```

---

### Task 5: Infra — GA Measurement ID build-arg plumbing (Dockerfile + deploy workflow)

**Files:**
- Modify: `deploy/Dockerfile.v1-web`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:** None (infra-only). Produces: `NEXT_PUBLIC_GA_MEASUREMENT_ID` reaches the Next.js build as a build-time env var, exactly like `NEXT_PUBLIC_KAKAO_CLIENT_ID` does today, sourced from a new (currently-empty) GitHub secret `GA_MEASUREMENT_ID`.

- [ ] **Step 1: Add the build ARG/ENV to the Dockerfile**

Edit `deploy/Dockerfile.v1-web` — add one `ARG`/`ENV` pair alongside the existing Kakao ones:

```dockerfile
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG INTERNAL_API_ORIGIN=http://v1_api:8121
ARG NEXT_PUBLIC_KAKAO_CLIENT_ID=
ARG NEXT_PUBLIC_KAKAO_REDIRECT_URI=
ARG NEXT_PUBLIC_GA_MEASUREMENT_ID=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV INTERNAL_API_ORIGIN=${INTERNAL_API_ORIGIN}
ENV NEXT_PUBLIC_KAKAO_CLIENT_ID=${NEXT_PUBLIC_KAKAO_CLIENT_ID}
ENV NEXT_PUBLIC_KAKAO_REDIRECT_URI=${NEXT_PUBLIC_KAKAO_REDIRECT_URI}
ENV NEXT_PUBLIC_GA_MEASUREMENT_ID=${NEXT_PUBLIC_GA_MEASUREMENT_ID}
ENV NODE_ENV=production
```

- [ ] **Step 2: Wire the secret through the deploy workflow**

Edit `.github/workflows/deploy.yml`. In the `Build and deploy` step's `env:` block, add the new secret alongside the Kakao ones (around line 183):

```yaml
        env:
          KAKAO_CLIENT_ID_SECRET: ${{ secrets.KAKAO_CLIENT_ID }}
          KAKAO_CLIENT_SECRET_SECRET: ${{ secrets.KAKAO_CLIENT_SECRET }}
          KAKAO_REDIRECT_URI_SECRET: ${{ secrets.KAKAO_REDIRECT_URI }}
          V1_HOST_ADMIN_PASSWORD_SECRET: ${{ secrets.V1_HOST_ADMIN_PASSWORD }}
          GA_MEASUREMENT_ID_SECRET: ${{ secrets.GA_MEASUREMENT_ID }}
```

Base64-encode it alongside the others (same block, right after `V1_HOST_ADMIN_PASSWORD_B64=...`):

```bash
          KAKAO_CLIENT_ID_B64="$(printf '%s' "${KAKAO_CLIENT_ID_SECRET:-}" | base64 | tr -d '\n')"
          KAKAO_CLIENT_SECRET_B64="$(printf '%s' "${KAKAO_CLIENT_SECRET_SECRET:-}" | base64 | tr -d '\n')"
          KAKAO_REDIRECT_URI_B64="$(printf '%s' "${KAKAO_REDIRECT_URI_SECRET:-}" | base64 | tr -d '\n')"
          V1_HOST_ADMIN_PASSWORD_B64="$(printf '%s' "${V1_HOST_ADMIN_PASSWORD_SECRET:-}" | base64 | tr -d '\n')"
          GA_MEASUREMENT_ID_B64="$(printf '%s' "${GA_MEASUREMENT_ID_SECRET:-}" | base64 | tr -d '\n')"

          ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=20 ec2 "KAKAO_CLIENT_ID_B64='${KAKAO_CLIENT_ID_B64}' KAKAO_CLIENT_SECRET_B64='${KAKAO_CLIENT_SECRET_B64}' KAKAO_REDIRECT_URI_B64='${KAKAO_REDIRECT_URI_B64}' V1_HOST_ADMIN_PASSWORD_B64='${V1_HOST_ADMIN_PASSWORD_B64}' GA_MEASUREMENT_ID_B64='${GA_MEASUREMENT_ID_B64}' bash -se" <<'EOF'
```

Inside the heredoc, add a sync call next to the others:

```bash
          sync_env_from_github_secret "KAKAO_CLIENT_ID" "${KAKAO_CLIENT_ID_B64:-}"
          sync_env_from_github_secret "KAKAO_CLIENT_SECRET" "${KAKAO_CLIENT_SECRET_B64:-}"
          sync_env_from_github_secret "KAKAO_REDIRECT_URI" "${KAKAO_REDIRECT_URI_B64:-}"
          sync_env_from_github_secret "V1_HOST_ADMIN_PASSWORD" "${V1_HOST_ADMIN_PASSWORD_B64:-}"
          sync_env_from_github_secret "GA_MEASUREMENT_ID" "${GA_MEASUREMENT_ID_B64:-}"
```

And add the `--build-arg` to the `docker build -f deploy/Dockerfile.v1-web` invocation:

```bash
          sudo env DOCKER_BUILDKIT=1 docker build --no-cache \
            -f deploy/Dockerfile.v1-web \
            --build-arg NEXT_PUBLIC_API_URL=/api/v1 \
            --build-arg INTERNAL_API_ORIGIN="${V1_WEB_INTERNAL_API_ORIGIN}" \
            --build-arg NEXT_PUBLIC_KAKAO_CLIENT_ID="${KAKAO_CLIENT_ID:-}" \
            --build-arg NEXT_PUBLIC_KAKAO_REDIRECT_URI="${KAKAO_REDIRECT_URI:-}" \
            --build-arg NEXT_PUBLIC_GA_MEASUREMENT_ID="${GA_MEASUREMENT_ID:-}" \
            -t teameet-v1-web .
```

(`${GA_MEASUREMENT_ID:-}` resolves from `deploy/.env` on the EC2 host after `set -a; . deploy/.env; set +a` runs earlier in the same script — same mechanism as `KAKAO_CLIENT_ID`.)

- [ ] **Step 2: Validate the workflow YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo OK`
Expected: `OK` (catches YAML indentation mistakes before push; does not validate the embedded bash).

- [ ] **Step 3: Commit**

```bash
git add deploy/Dockerfile.v1-web .github/workflows/deploy.yml
git commit -m "chore(deploy): plumb NEXT_PUBLIC_GA_MEASUREMENT_ID through build + deploy"
```

**Note for the user (not a plan step):** this makes the pipeline ready, but two manual one-time actions remain, same treatment as the existing VAPID keys in Known Blockers: (1) create the GA4 property and copy its Measurement ID, (2) add it as a GitHub Actions secret named `GA_MEASUREMENT_ID` on this repo. Until both are done, `${GA_MEASUREMENT_ID:-}` resolves empty and Task 11's `<GoogleAnalytics />` stays a no-op — nothing breaks.

---

### Task 6: Frontend — `reportClientError()` + dedupe

**Files:**
- Create: `apps/v1_web/src/lib/client-error-reporter.ts`
- Create: `apps/v1_web/src/lib/client-error-reporter.test.ts`

**Interfaces:**
- Produces: `reportClientError({ message, stack?, level?, context? }): void` — fire-and-forget POST to `/api/v1/logs/client-error`. Consumed by Task 7 (`api-client.ts`), Task 8 (`ClientErrorListener`), Task 9 (`global-error.tsx`).

- [ ] **Step 1: Write the failing test**

Create `apps/v1_web/src/lib/client-error-reporter.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportClientError } from './client-error-reporter';

describe('reportClientError', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('posts the error payload to the client-error endpoint', () => {
    reportClientError({ message: 'boom', level: 'error', context: { path: '/matches' } });

    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/logs/client-error',
      expect.objectContaining({
        method: 'POST',
        keepalive: true,
      }),
    );
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ message: 'boom', level: 'error', context: { path: '/matches' } });
  });

  it('defaults to level "error" when not specified', () => {
    reportClientError({ message: 'unspecified-level' });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string).level).toBe('error');
  });

  it('dedupes identical messages within the 10s window', () => {
    reportClientError({ message: 'repeat-me' });
    reportClientError({ message: 'repeat-me' });

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('never throws when the report request itself fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(() => reportClientError({ message: 'unique-message-for-failure-test' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/v1_web && pnpm exec vitest run src/lib/client-error-reporter.test.ts`
Expected: FAIL — `./client-error-reporter` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/v1_web/src/lib/client-error-reporter.ts`:

```ts
const recentlyReported = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10_000;

export interface ClientErrorPayload {
  message: string;
  stack?: string;
  level?: 'error' | 'warn';
  context?: Record<string, unknown>;
}

export function reportClientError({ message, stack, level = 'error', context }: ClientErrorPayload): void {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  const lastReportedAt = recentlyReported.get(message);
  if (lastReportedAt && now - lastReportedAt < DEDUPE_WINDOW_MS) return;
  recentlyReported.set(message, now);

  const body = JSON.stringify({
    message: message.slice(0, 4000),
    stack: stack?.slice(0, 4000),
    url: window.location.href,
    userAgent: window.navigator.userAgent,
    level,
    context,
  });

  fetch('/api/v1/logs/client-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // 리포터 자체 실패는 무한루프 방지를 위해 조용히 무시한다.
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/v1_web && pnpm exec vitest run src/lib/client-error-reporter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/v1_web/src/lib/client-error-reporter.ts apps/v1_web/src/lib/client-error-reporter.test.ts
git commit -m "feat(v1-web): add reportClientError() with dedupe"
```

---

### Task 7: Frontend — wire `reportClientError` into `v1Api()`

**Files:**
- Modify: `apps/v1_web/src/lib/api-client.ts`
- Modify: `apps/v1_web/src/lib/api-client.test.ts`

**Interfaces:**
- Consumes: `reportClientError` (Task 6), `ApiErrorBody.requestId` (Task 2 Step 6).

- [ ] **Step 1: Write the failing test**

Append to `apps/v1_web/src/lib/api-client.test.ts` (add the import at the top alongside the existing ones, then add a new `describe` block):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getV1ApiBaseUrl, getV1DevAuthHeaders, v1Get } from './api-client';
import { V1_USER_EMAIL_KEY, V1_USER_ID_KEY } from './session-storage';
import * as clientErrorReporter from './client-error-reporter';

// ...existing describe blocks unchanged...

describe('v1Api error reporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports API errors to the client-error reporter before rethrowing', async () => {
    const reportSpy = vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          status: 'error',
          statusCode: 409,
          code: 'ALREADY_JOINED',
          message: '이미 참가했어요.',
          requestId: 'req-abc',
          timestamp: new Date().toISOString(),
        }),
      }),
    );

    await expect(v1Get('/matches/1')).rejects.toThrow('이미 참가했어요.');

    expect(reportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '이미 참가했어요.',
        level: 'warn',
        context: expect.objectContaining({ statusCode: 409, code: 'ALREADY_JOINED', requestId: 'req-abc' }),
      }),
    );
  });

  it('reports 5xx as level "error"', async () => {
    const reportSpy = vi.spyOn(clientErrorReporter, 'reportClientError').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          status: 'error',
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: '서버 오류가 발생했어요.',
          timestamp: new Date().toISOString(),
        }),
      }),
    );

    await expect(v1Get('/matches/1')).rejects.toThrow();

    expect(reportSpy).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/v1_web && pnpm exec vitest run src/lib/api-client.test.ts`
Expected: FAIL — `v1Api()` does not call `reportClientError` yet.

- [ ] **Step 3: Wire the call**

Edit `apps/v1_web/src/lib/api-client.ts` — add the import at the top and update `v1Api()`'s error branch:

```ts
import type { ApiEnvelope, ApiErrorBody } from '@/types/api';
import { getStoredV1Session } from './session-storage';
import { reportClientError } from './client-error-reporter';

// ...V1ApiError, toErrorMessage, getDefaultBaseUrl, getV1ApiBaseUrl, getV1DevAuthHeaders unchanged...

export async function v1Api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${getV1ApiBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...getV1DevAuthHeaders(),
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);

  if (!response.ok || body?.status === 'error') {
    const errorBody: ApiErrorBody =
      body ?? {
        status: 'error',
        statusCode: response.status,
        code: 'NETWORK_OR_PARSE_ERROR',
        message: response.statusText || 'Request failed',
        timestamp: new Date().toISOString(),
      };
    const error = new V1ApiError(errorBody);
    reportClientError({
      message: error.message,
      level: error.statusCode >= 500 ? 'error' : 'warn',
      context: { path, statusCode: error.statusCode, code: error.code, requestId: errorBody.requestId },
    });
    throw error;
  }

  return (body as ApiEnvelope<T>).data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/v1_web && pnpm exec vitest run src/lib/api-client.test.ts`
Expected: PASS (all existing + 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add apps/v1_web/src/lib/api-client.ts apps/v1_web/src/lib/api-client.test.ts
git commit -m "feat(v1-web): report every v1Api() error via reportClientError"
```

---

### Task 8: Frontend — global `window.onerror` / `unhandledrejection` listener

**Files:**
- Create: `apps/v1_web/src/components/providers/client-error-listener.tsx`
- Create: `apps/v1_web/src/components/providers/client-error-listener.test.tsx`
- Modify: `apps/v1_web/src/app/providers.tsx`

**Interfaces:**
- Consumes: `reportClientError` (Task 6).
- Produces: `<ClientErrorListener />` — renders nothing, mounts/unmounts the two `window` listeners.

- [ ] **Step 1: Write the failing test**

Create `apps/v1_web/src/components/providers/client-error-listener.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/v1_web && pnpm exec vitest run src/components/providers/client-error-listener.test.tsx`
Expected: FAIL — `./client-error-listener` does not exist yet.

- [ ] **Step 3: Write the component**

Create `apps/v1_web/src/components/providers/client-error-listener.tsx`:

```tsx
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/v1_web && pnpm exec vitest run src/components/providers/client-error-listener.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount it in `Providers`**

Edit `apps/v1_web/src/app/providers.tsx`:

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { PendingSocialSignupGate } from '@/components/auth/pending-social-signup-gate';
import { ClientErrorListener } from '@/components/providers/client-error-listener';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ClientErrorListener />
      <PendingSocialSignupGate>{children}</PendingSocialSignupGate>
    </QueryClientProvider>
  );
}
```

(Task 11 adds `<GoogleAnalytics />` here too, wrapped in `Suspense` — left out of this diff to keep this task's change reviewable on its own.)

- [ ] **Step 6: Commit**

```bash
git add apps/v1_web/src/components/providers/client-error-listener.tsx apps/v1_web/src/components/providers/client-error-listener.test.tsx apps/v1_web/src/app/providers.tsx
git commit -m "feat(v1-web): capture window.onerror/unhandledrejection into reportClientError"
```

---

### Task 9: Frontend — report React render errors from `global-error.tsx`

**Files:**
- Modify: `apps/v1_web/src/app/global-error.tsx`

**Interfaces:**
- Consumes: `reportClientError` (Task 6).

- [ ] **Step 1: Edit the component**

Replace `apps/v1_web/src/app/global-error.tsx`:

```tsx
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
```

(This is a Next.js App Router special file with no existing test coverage in the codebase — `global-error.tsx` renders a full `<html>` document and is exercised via E2E/manual verification, not unit tests. No new test file for this task; consistent with how the file was already untested before this change.)

- [ ] **Step 2: Type-check**

Run: `cd apps/v1_web && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/v1_web/src/app/global-error.tsx
git commit -m "feat(v1-web): report React render errors from the global error boundary"
```

---

### Task 10: Frontend — `lib/analytics.ts` (`trackEvent` / `trackPageview`)

**Files:**
- Create: `apps/v1_web/src/lib/analytics.ts`
- Create: `apps/v1_web/src/lib/analytics.test.ts`

**Interfaces:**
- Produces: `getGaMeasurementId(): string | undefined`, `trackEvent(name: string, params?: Record<string, string | number | boolean>): void`, `trackPageview(url: string): void`. Consumed by Task 11 (`GoogleAnalytics`) and, in Phase 1, every domain's `trackEvent()` call sites.

- [ ] **Step 1: Write the failing test**

Create `apps/v1_web/src/lib/analytics.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGaMeasurementId, trackEvent, trackPageview } from './analytics';

afterEach(() => {
  vi.unstubAllEnvs();
  delete (window as { gtag?: unknown }).gtag;
});

describe('getGaMeasurementId', () => {
  it('reads NEXT_PUBLIC_GA_MEASUREMENT_ID', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
    expect(getGaMeasurementId()).toBe('G-TEST123');
  });

  it('returns undefined when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
    expect(getGaMeasurementId()).toBeUndefined();
  });
});

describe('trackEvent', () => {
  it('is a no-op when window.gtag is not present', () => {
    expect(() => trackEvent('match_view', { matchId: 'm1' })).not.toThrow();
  });

  it('forwards to window.gtag when present', () => {
    const gtag = vi.fn();
    (window as { gtag?: typeof gtag }).gtag = gtag;

    trackEvent('match_view', { matchId: 'm1', sportType: 'futsal' });

    expect(gtag).toHaveBeenCalledWith('event', 'match_view', { matchId: 'm1', sportType: 'futsal' });
  });
});

describe('trackPageview', () => {
  it('is a no-op when window.gtag is not present', () => {
    expect(() => trackPageview('/home')).not.toThrow();
  });

  it('is a no-op when the measurement id is unset even if gtag exists', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
    const gtag = vi.fn();
    (window as { gtag?: typeof gtag }).gtag = gtag;

    trackPageview('/home');

    expect(gtag).not.toHaveBeenCalled();
  });

  it('calls gtag config with page_path when both are present', () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
    const gtag = vi.fn();
    (window as { gtag?: typeof gtag }).gtag = gtag;

    trackPageview('/home');

    expect(gtag).toHaveBeenCalledWith('config', 'G-TEST123', { page_path: '/home' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/v1_web && pnpm exec vitest run src/lib/analytics.test.ts`
Expected: FAIL — `./analytics` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `apps/v1_web/src/lib/analytics.ts`:

```ts
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function getGaMeasurementId(): string | undefined {
  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || undefined;
}

export function trackEvent(name: string, params?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

export function trackPageview(url: string): void {
  const measurementId = getGaMeasurementId();
  if (typeof window === 'undefined' || typeof window.gtag !== 'function' || !measurementId) return;
  window.gtag('config', measurementId, { page_path: url });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/v1_web && pnpm exec vitest run src/lib/analytics.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/v1_web/src/lib/analytics.ts apps/v1_web/src/lib/analytics.test.ts
git commit -m "feat(v1-web): add env-gated trackEvent/trackPageview GA helpers"
```

---

### Task 11: Frontend — `<GoogleAnalytics />` loader, mounted app-wide

**Files:**
- Create: `apps/v1_web/src/components/providers/google-analytics.tsx`
- Create: `apps/v1_web/src/components/providers/google-analytics.test.tsx`
- Modify: `apps/v1_web/src/app/providers.tsx`

**Interfaces:**
- Consumes: `getGaMeasurementId`, `trackPageview` (Task 10).
- Produces: `<GoogleAnalytics />` — renders `null` (and loads no script) when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is unset.

- [ ] **Step 1: Write the failing test**

Create `apps/v1_web/src/components/providers/google-analytics.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('GoogleAnalytics', () => {
  it('renders nothing when NEXT_PUBLIC_GA_MEASUREMENT_ID is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', '');
    const { GoogleAnalytics } = await import('./google-analytics');

    const { container } = render(<GoogleAnalytics />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the gtag script tags when the measurement id is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
    const { GoogleAnalytics } = await import('./google-analytics');

    const { container } = render(<GoogleAnalytics />);

    expect(container.querySelector('script[src*="googletagmanager.com/gtag/js?id=G-TEST123"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/v1_web && pnpm exec vitest run src/components/providers/google-analytics.test.tsx`
Expected: FAIL — `./google-analytics` does not exist yet.

- [ ] **Step 3: Write the component**

Create `apps/v1_web/src/components/providers/google-analytics.tsx`:

```tsx
'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { getGaMeasurementId, trackPageview } from '@/lib/analytics';

export function GoogleAnalytics() {
  const measurementId = getGaMeasurementId();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!measurementId) return;
    const query = searchParams.toString();
    trackPageview(query ? `${pathname}?${query}` : pathname);
  }, [measurementId, pathname, searchParams]);

  if (!measurementId) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/v1_web && pnpm exec vitest run src/components/providers/google-analytics.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Mount it in `Providers`, wrapped in `Suspense`**

Edit `apps/v1_web/src/app/providers.tsx` (building on Task 8's version):

```tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Suspense, type ReactNode, useState } from 'react';
import { PendingSocialSignupGate } from '@/components/auth/pending-social-signup-gate';
import { ClientErrorListener } from '@/components/providers/client-error-listener';
import { GoogleAnalytics } from '@/components/providers/google-analytics';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ClientErrorListener />
      <Suspense fallback={null}>
        <GoogleAnalytics />
      </Suspense>
      <PendingSocialSignupGate>{children}</PendingSocialSignupGate>
    </QueryClientProvider>
  );
}
```

`useSearchParams()` requires a `Suspense` boundary in the App Router (Next.js de-opts the page to fully dynamic rendering otherwise) — that's why `GoogleAnalytics` is wrapped here rather than rendered directly.

- [ ] **Step 6: Commit**

```bash
git add apps/v1_web/src/components/providers/google-analytics.tsx apps/v1_web/src/components/providers/google-analytics.test.tsx apps/v1_web/src/app/providers.tsx
git commit -m "feat(v1-web): mount env-gated GoogleAnalytics loader with pageview tracking"
```

---

### Task 12: Whole-branch verification (integration gate, run once)

**Files:** None modified — verification only.

- [ ] **Step 1: Backend full unit suite**

Run: `cd apps/v1_api && pnpm test`
Expected: all suites pass, including the new `http-exception.filter.spec.ts` and `logs.controller.spec.ts`.

- [ ] **Step 2: Backend type-check**

Run: `cd apps/v1_api && pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Frontend full test suite**

Run: `cd apps/v1_web && pnpm test`
Expected: all suites pass, including the 5 new/modified spec files from Tasks 6–11.

- [ ] **Step 4: Frontend lint (type-check + pattern check)**

Run: `cd apps/v1_web && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Live smoke check — confirm a client error actually reaches the backend log**

Start the v1 stack locally per `CLAUDE.md`'s dev commands (`docker compose up -d`, `pnpm --filter v1_api dev`, `pnpm --filter v1_web dev`), open any v1 page, and in the browser console run:
```js
fetch('/api/v1/logs/client-error', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ message: 'manual-smoke-test', url: location.href, level: 'warn' }),
})
```
Expected: `204` response, and the `v1_api` process's stdout shows a JSON line containing `"msg":"manual-smoke-test"` and `"source":"client"`. This confirms the pino pipeline, the throttle guard, and the DTO validation all work end-to-end — not just at the unit level.

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin feat/v1-observability-skeleton
gh pr create --base dev --title "feat(v1): observability skeleton — structured logging + client-error capture + GA4 no-op scaffold" --body "$(cat <<'EOF'
## Summary
- BE: nestjs-pino structured JSON logging; AllExceptionsFilter now logs 4xx too and returns requestId
- BE: public throttled POST /logs/client-error ingestion endpoint
- FE: reportClientError() wired into v1Api(), window.onerror/unhandledrejection, and the React error boundary
- FE: env-gated GA4 loader (trackEvent/trackPageview) — complete no-op until NEXT_PUBLIC_GA_MEASUREMENT_ID is set
- Infra: Docker log rotation (max-size 10m, max-file 5) on v1_api/v1_web; GA_MEASUREMENT_ID build-arg plumbing (secret not yet registered — see plan doc)

Spec: docs/superpowers/specs/2026-07-18-logging-ga-analytics-design.md
Plan: docs/superpowers/plans/2026-07-18-observability-skeleton-plan.md

## Test plan
- [x] apps/v1_api unit suite green
- [x] apps/v1_web test suite green
- [x] manual smoke test: client-error POST → visible in v1_api stdout JSON log
EOF
)"
```

This is the only step in the plan that touches the shared remote (`push`) — everything before it is local to the isolated worktree.

---

## Self-Review Notes

- **Spec coverage:** BE structured logging (Task 1–2), 4xx logging gap (Task 2), client-error endpoint + throttle + payload cap (Task 3), log rotation (Task 4), GA env-gating + build-arg plumbing (Task 5, 10, 11), FE 3 capture points (Task 7 api-client, Task 8 window listeners, Task 9 global-error), GA trackEvent/trackPageview (Task 10–11). Ambiguity Log items (GA property creation, consent banner) are explicitly out of scope, not silently dropped.
- **Placeholder scan:** no TBD/TODO; every step has complete code.
- **Type consistency:** `reportClientError({ message, stack?, level?, context? })` signature is identical across Tasks 6, 7, 8, 9. `trackEvent(name, params?)` / `trackPageview(url)` signatures identical across Tasks 10, 11. `ApiErrorBody.requestId?: string` (Task 2 Step 6) matches what Task 7's test asserts.
- Phase 1 (per-domain `trackEvent()` call-site instrumentation across 4 parallel worktrees) is **not** in this plan — it depends on Task 10 (`trackEvent`) existing on `dev`, and is planned separately per the design doc's Phase 1 breakdown once this branch merges.
