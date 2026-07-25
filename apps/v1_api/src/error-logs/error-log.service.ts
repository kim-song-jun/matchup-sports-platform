import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { maskSensitive, maskSensitiveText, truncateForLog } from '../common/logging/mask-sensitive';
import { AdminErrorLogListQueryDto } from './dto/admin-error-log-query.dto';

export type ErrorLogSource = 'server' | 'client';
export type ErrorLogLevel = 'error' | 'warn';

export interface RecordErrorLogInput {
  source: ErrorLogSource;
  level: ErrorLogLevel;
  statusCode?: number | null;
  errorCode?: string | null;
  method?: string | null;
  route?: string | null;
  message: string;
  stack?: string | null;
  requestBody?: unknown;
  requestHeaders?: unknown;
  responseBody?: unknown;
  context?: unknown;
  userId?: string | null;
  userAgent?: string | null;
}

/** 목록 행 — 상세 payload(stack/body 등)는 제외한 요약. */
export interface ErrorLogListItem {
  id: string;
  source: string;
  level: string;
  statusCode: number | null;
  errorCode: string | null;
  method: string | null;
  route: string | null;
  message: string;
  occurrenceCount: number;
  releaseSha: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

export interface ErrorLogListResult {
  items: ErrorLogListItem[];
  pageInfo: {
    nextCursor: string | null;
    hasNext: boolean;
  };
}

/** 상세 — 목록 필드 + traceback/request/response/context/식별정보. */
export interface ErrorLogDetail extends ErrorLogListItem {
  stack: string | null;
  requestBody: unknown;
  requestHeaders: unknown;
  responseBody: unknown;
  context: unknown;
  userId: string | null;
  userAgent: string | null;
}

// 정규화: UUID·연속 숫자를 각각 ':id'/':n'으로 치환해 대상만 다른 같은 유형의 에러를
// 하나의 fingerprint로 접는다 (예: /tournaments/abc-123 → /tournaments/:id).
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const DIGIT_RUN_PATTERN = /\d+/g;
// 경로처럼 보이는 토큰('/'로 시작) 뒤의 쿼리스트링은 통째로 버린다. NestJS의 404 메시지는
// `Cannot GET /api/v1/x?token=...`처럼 원본 URL을 그대로 담는데, 그 값이 fingerprint에
// 들어가면 쿼리 값이 바뀔 때마다 다른 지문이 나온다. 스캐너가 매번 다른 값으로 없는 경로를
// 훑기만 해도 행이 무한히 쌓여, 보존이 무기한인 이 테이블에서 dedupe가 통째로 무력해진다.
// 한국어 문장의 물음표("정말 삭제할까요?")는 '/'로 시작하는 토큰이 아니라 영향받지 않는다.
const URL_QUERY_PATTERN = /(\/\S*?)\?\S*/g;

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

const MAX_MESSAGE_LENGTH = 4000;
const MAX_STACK_LENGTH = 4000;

export function normalizeForFingerprint(value: string): string {
  return value
    .replace(URL_QUERY_PATTERN, '$1')
    .replace(UUID_PATTERN, ':id')
    .replace(DIGIT_RUN_PATTERN, ':n');
}

/** 401/403은 인증 만료·재시도로 반복되기 쉬워 24시간 창, 그 외는 1시간 창. */
function windowSizeMs(statusCode: number | null | undefined): number {
  return statusCode === 401 || statusCode === 403 ? ONE_DAY_MS : ONE_HOUR_MS;
}

function computeWindowBucket(at: Date, statusCode: number | null | undefined): Date {
  const size = windowSizeMs(statusCode);
  return new Date(Math.floor(at.getTime() / size) * size);
}

export function computeFingerprint(
  source: string,
  statusCode: number | null | undefined,
  route: string,
  message: string,
): string {
  const normalizedRoute = normalizeForFingerprint(route);
  const normalizedMessage = normalizeForFingerprint(message);
  const raw = `${source}|${statusCode ?? 'null'}|${normalizedRoute}|${normalizedMessage}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function truncateString(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…[TRUNCATED]` : value;
}

/**
 * requestBody/requestHeaders/responseBody/context는 Json? 컬럼이므로 마스킹된 "구조"를
 * 그대로 저장한다 — 프론트가 JSON.stringify(value, null, 2)로 바로 예쁘게 렌더링할 수
 * 있어야 하기 때문에, 여기서 미리 문자열로 직렬화해 넣지 않는다(직렬화해 넣으면 프론트가
 * 그 문자열을 다시 JSON.stringify해 이스케이프된 한 줄로 뭉개버리는 이중 인코딩이 된다).
 * 4000자를 넘는 대용량 payload만 예외적으로 구조를 버리고 truncated 표시용 placeholder
 * 객체로 대체한다 — 이 경우에도 컬럼 값은 항상 object|null이지 bare string이 아니다.
 * Prisma의 nullable Json 컬럼에 SQL NULL을 쓰려면 (JS null이 아니라) Prisma.JsonNull을
 * 명시해야 한다 — 그냥 null을 넘기면 "필드 생략"으로 취급돼 컬럼 기본값이 적용된다.
 */
function toStoredJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) {
    return Prisma.JsonNull;
  }

  const masked = maskSensitive(value);
  // truncateForLog는 크기 판단용 직렬화 문자열을 만든다 — 상한 이내면 버리고 masked 구조를
  // 그대로 저장하며, 상한 초과/직렬화 실패 시에만 그 문자열을 placeholder 안에 담아 재사용한다.
  const serializedForSizeCheck = truncateForLog(masked);
  if (serializedForSizeCheck === null) {
    return Prisma.JsonNull;
  }
  if (serializedForSizeCheck.endsWith('…[TRUNCATED]') || serializedForSizeCheck === '[UNSERIALIZABLE]') {
    return { _truncated: true, preview: serializedForSizeCheck };
  }
  return masked as Prisma.InputJsonValue;
}

@Injectable()
export class ErrorLogService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(ErrorLogService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * fire-and-forget 적재. 호출자(AllExceptionsFilter, LogsController)의 응답 흐름에
   * 영향을 주면 안 되므로 절대 throw 하지 않는다 — 실패는 pino warn으로만 남긴다
   * (빈 catch 금지: 실패 사실과 사유를 남긴다).
   */
  record(input: RecordErrorLogInput): void {
    this.persist(input).catch((err: unknown) => {
      this.logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'V1ErrorLog 적재 실패 — 원본 요청/에러 처리와 무관하게 무시하고 계속 진행함',
      );
    });
  }

  private async persist(input: RecordErrorLogInput): Promise<void> {
    const now = new Date();
    const rawRoute = input.route ?? '';
    const normalizedRoute = normalizeForFingerprint(rawRoute);
    // 지문은 저장되는 값과 같은 기준으로 계산한다 — 마스킹 전 원본으로 해시하면 시크릿이
    // 바뀔 때마다 지문이 갈라져, 정작 저장된 message는 똑같은데 행만 늘어난다.
    const maskedMessage = maskSensitiveText(input.message);
    const fingerprint = computeFingerprint(input.source, input.statusCode ?? null, rawRoute, maskedMessage);
    const windowBucket = computeWindowBucket(now, input.statusCode ?? null);

    await this.prisma.v1ErrorLog.upsert({
      where: { fingerprint_windowBucket: { fingerprint, windowBucket } },
      update: {
        // 같은 fingerprint+창이면 내용이 사실상 동일한 반복 발생이다 — body/stack을
        // 매번 덮어쓰지 않고 최초 표본을 유지한 채 횟수/최종 발생 시각만 갱신한다.
        occurrenceCount: { increment: 1 },
        lastSeenAt: now,
      },
      create: {
        fingerprint,
        windowBucket,
        occurrenceCount: 1,
        source: input.source,
        level: input.level,
        statusCode: input.statusCode ?? null,
        errorCode: input.errorCode ?? null,
        method: input.method ?? null,
        route: normalizedRoute || null,
        // message/stack은 객체가 아닌 평문이라 maskSensitive()가 닿지 않는다 — NestJS
        // 내장 404("Cannot GET /path?token=...")처럼 쿼리스트링 시크릿이 텍스트로 그대로
        // 박혀 들어오는 경로를 막기 위해 저장 전 maskSensitiveText()를 반드시 거친다.
        message: truncateString(maskedMessage, MAX_MESSAGE_LENGTH),
        stack: input.stack != null ? truncateString(maskSensitiveText(input.stack), MAX_STACK_LENGTH) : null,
        requestBody: toStoredJson(input.requestBody),
        requestHeaders: toStoredJson(input.requestHeaders),
        responseBody: toStoredJson(input.responseBody),
        context: toStoredJson(input.context),
        userId: input.userId ?? null,
        userAgent: input.userAgent ?? null,
        releaseSha: process.env.V1_RELEASE ?? null,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
  }

  /** GET /admin/ops/errors — cursor 페이지네이션 목록. */
  async list(query: AdminErrorLogListQueryDto): Promise<ErrorLogListResult> {
    const limit = query.limit ?? 20;

    const where: Prisma.V1ErrorLogWhereInput = {
      ...(query.source ? { source: query.source } : {}),
      ...(query.statusCode !== undefined ? { statusCode: query.statusCode } : {}),
      ...(query.level ? { level: query.level } : {}),
      ...(query.from || query.to
        ? {
            lastSeenAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { message: { contains: query.q, mode: 'insensitive' } },
              { route: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.v1ErrorLog.findMany({
      where,
      orderBy: { lastSeenAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });

    const hasNext = rows.length > limit;
    const pageItems = hasNext ? rows.slice(0, limit) : rows;

    return {
      items: pageItems.map((row) => this.toListItem(row)),
      pageInfo: {
        nextCursor: hasNext ? (pageItems.at(-1)?.id ?? null) : null,
        hasNext,
      },
    };
  }

  /** GET /admin/ops/errors/:id — traceback/request/response/context 포함 상세. */
  async findById(id: string): Promise<ErrorLogDetail> {
    const row = await this.prisma.v1ErrorLog.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: 'ERROR_LOG_NOT_FOUND', message: '에러 로그를 찾을 수 없어요.' });
    }

    return {
      ...this.toListItem(row),
      stack: row.stack,
      requestBody: row.requestBody,
      requestHeaders: row.requestHeaders,
      responseBody: row.responseBody,
      context: row.context,
      userId: row.userId,
      userAgent: row.userAgent,
    };
  }

  private toListItem(row: Prisma.V1ErrorLogGetPayload<Record<string, never>>): ErrorLogListItem {
    return {
      id: row.id,
      source: row.source,
      level: row.level,
      statusCode: row.statusCode,
      errorCode: row.errorCode,
      method: row.method,
      route: row.route,
      message: row.message,
      occurrenceCount: row.occurrenceCount,
      releaseSha: row.releaseSha,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
    };
  }
}
