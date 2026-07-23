# 옥토모 MO 휴대폰 본인인증 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** alpha(v1) 회원가입에 옥토모 MO(Mobile Originated) 휴대폰 본인인증을 붙여 이메일·카카오 가입을 모두 hard-block하고, 레거시 미인증 계정은 홈/프로필에서 상시 인증을 유도한다.

**Architecture:** 옥토모 API를 감싸는 서버 전용 `OctomoClient`(fetch) 위에 MO 코어 `PhoneVerificationService`(코드 발급→저장→도착 폴링→proof token)를 두고, 두 진입점으로 노출한다 — (a) 비로그인 공개 `/auth/phone/{issue,verify}`(이메일 pre-account, proof token→register 소비), (b) 로그인 authed `/verification/phone/{request,confirm}`(카카오 완성·레거시 구제, 현재 사용자 `phoneVerifiedAt` 세팅). 기존 MT/OTP 스텁은 phone 채널만 MO로 전환한다.

**Tech Stack:** NestJS 11 + Prisma 6(PostgreSQL) / Next.js 16 + React 19 + TanStack Query / Jest(백엔드) · Vitest+MSW(프론트) · Playwright(라이브 시각검증) / GitHub Actions + AWS SSM Run Command 배포.

> 설계 근거: `docs/superpowers/specs/2026-07-23-octomo-phone-verification-design.md`. 옥토모 API 실측·MO 플로우·보안 전부 그 문서 참조.

## Global Constraints

- **대상 스택은 v1 전용**: `apps/v1_api`, `apps/v1_web`, `deploy/*`만 수정. `apps/api`/`apps/web`(운영)는 절대 건드리지 않는다.
- **작업 브랜치 `feat/v1-octomo-phone-verification`(origin/dev 기반). PR base=dev.** main 승격 금지. dev push=자동 alpha 배포이므로 dev 머지 전 tsc·테스트·마이그레이션 게이트를 통과시킨다.
- **DB 스키마 변경은 반드시 migration 파일 동반**(Critical). `prisma db push`만으로 끝내지 않는다. CI의 "V1 migration replay + drift gate"를 통과해야 한다.
- **커밋은 내가 만든 파일만 pathspec으로.** 커밋 직후 `git show --stat HEAD`로 휩쓸린 파일 없는지 검증. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **API Key는 서버 전용.** `OCTOMO_API_KEY`를 `NEXT_PUBLIC_*`·클라이언트 번들에 절대 노출 금지. 옥토모 호출은 서버(fetch)에서만.
- **v1_web은 light-only.** `dark:` variant 절대 사용 금지(globals.css 규약). 색은 CSS 변수(`--blue*`, `--orange*`, `--red*`, `--text-*`, `--border`)만.
- **에러 메시지는 해요체.** fallback은 `~했어요`/`~해주세요`. `extractErrorMessage`류 관례 준수. 에러 코드는 `DOMAIN_CODE` 형태.
- **접근성**: 인터랙티브 요소 44x44px, 아이콘 버튼 `aria-label`, 장식 `aria-hidden`, 컬러 단독 정보전달 금지(아이콘+텍스트 병행).
- **alpha 전용 게이트**: 인증 강제는 `PhoneVerificationService.enabled`(= `OCTOMO_API_KEY` 존재 OR `V1_VERIFICATION_DEV_ECHO==='true'`)일 때만. 비활성 환경에선 기존 가입 동작 유지(회귀 없음).
- **옥토모 상수**: Base `https://api.octoverse.kr`, 경로 `/octomo/v1/public/message/{exists,qr-code}`, 헤더 `Authorization: Octomo <KEY>`, 대표번호 `16663538`(env `OCTOMO_DEST_NUMBER` 기본값).
- **테스트는 변경 크기 비례**: 보안·계약·상태전이 로직엔 진짜 테스트. 풀스위트는 dev 머지 게이트에서만.

---

## Task 1: OctomoClient (옥토모 API 서버 전용 래퍼)

**Files:**
- Create: `apps/v1_api/src/verification/octomo.client.ts`
- Test: `apps/v1_api/src/verification/octomo.client.spec.ts`

**Interfaces:**
- Produces: `OctomoClient` (injectable) — `get enabled(): boolean`, `messageExists(mobileNum: string, text: string, withinMinutes?: number): Promise<boolean>`, `createQrCode(text: string, options?: OctomoQrOptions): Promise<string>`. Errors: `OctomoDisabledError`, `OctomoApiError`. `OctomoQrOptions = { errorCorrectionLevel?: 'L'|'M'|'Q'|'H'; margin?: number; width?: number }`.

- [ ] **Step 1: 실패 테스트 작성** — `octomo.client.spec.ts`

```typescript
import { OctomoApiError, OctomoClient, OctomoDisabledError } from './octomo.client';

describe('OctomoClient', () => {
  const OLD = process.env.OCTOMO_API_KEY;
  afterEach(() => { process.env.OCTOMO_API_KEY = OLD; jest.restoreAllMocks(); });

  it('is disabled without an API key and throws OctomoDisabledError', async () => {
    delete process.env.OCTOMO_API_KEY;
    const client = new OctomoClient();
    expect(client.enabled).toBe(false);
    await expect(client.messageExists('01012345678', 'ABC123')).rejects.toBeInstanceOf(OctomoDisabledError);
  });

  it('posts to /message/exists with the Octomo auth header and returns exists', async () => {
    process.env.OCTOMO_API_KEY = 'test-key';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ exists: true }), { status: 201, headers: { 'content-type': 'application/json' } }),
    );
    const client = new OctomoClient();
    const result = await client.messageExists('01012345678', 'ABC123', 5);
    expect(result).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.octoverse.kr/octomo/v1/public/message/exists');
    expect((init!.headers as Record<string, string>).authorization).toBe('Octomo test-key');
    expect(JSON.parse(init!.body as string)).toEqual({ mobileNum: '01012345678', text: 'ABC123', withinMinutes: 5 });
  });

  it('returns false when Octomo reports exists:false', async () => {
    process.env.OCTOMO_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ exists: false }), { status: 201 }));
    expect(await new OctomoClient().messageExists('01012345678', 'ABC123')).toBe(false);
  });

  it('throws OctomoApiError on non-2xx', async () => {
    process.env.OCTOMO_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('bad request', { status: 400 }));
    await expect(new OctomoClient().messageExists('01012345678', 'X')).rejects.toBeInstanceOf(OctomoApiError);
  });

  it('createQrCode returns the qrCode data URL', async () => {
    process.env.OCTOMO_API_KEY = 'test-key';
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ qrCode: 'data:image/png;base64,AAA' }), { status: 201 }));
    expect(await new OctomoClient().createQrCode('ABC123')).toBe('data:image/png;base64,AAA');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인** — `cd apps/v1_api && npx jest src/verification/octomo.client.spec.ts` → FAIL (module not found).

- [ ] **Step 3: 구현** — `octomo.client.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';

export class OctomoDisabledError extends Error {
  constructor() {
    super('OCTOMO_API_KEY is not configured');
    this.name = 'OctomoDisabledError';
  }
}

export class OctomoApiError extends Error {
  constructor(readonly status: number, body: string) {
    super(`Octomo API error: ${status} ${body}`.slice(0, 300));
    this.name = 'OctomoApiError';
  }
}

export interface OctomoQrOptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
  width?: number;
}

@Injectable()
export class OctomoClient {
  private readonly logger = new Logger(OctomoClient.name);

  private get apiKey(): string {
    return process.env.OCTOMO_API_KEY ?? '';
  }

  private get baseUrl(): string {
    return process.env.OCTOMO_API_BASE ?? 'https://api.octoverse.kr';
  }

  get enabled(): boolean {
    return this.apiKey.length > 0;
  }

  async messageExists(mobileNum: string, text: string, withinMinutes = 5): Promise<boolean> {
    const data = await this.post<{ exists?: boolean }>('/octomo/v1/public/message/exists', {
      mobileNum,
      text,
      withinMinutes,
    });
    return data.exists === true;
  }

  async createQrCode(text: string, options: OctomoQrOptions = {}): Promise<string> {
    const data = await this.post<{ qrCode?: string }>('/octomo/v1/public/message/qr-code', { text, ...options });
    if (!data.qrCode) throw new OctomoApiError(502, 'Octomo response missing qrCode');
    return data.qrCode;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    if (!this.enabled) throw new OctomoDisabledError();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Octomo ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new OctomoApiError(res.status, text);
    }
    return (await res.json()) as T;
  }
}
```

- [ ] **Step 4: 테스트 통과 확인** — `npx jest src/verification/octomo.client.spec.ts` → PASS.

- [ ] **Step 5: 커밋** — `git add apps/v1_api/src/verification/octomo.client.ts apps/v1_api/src/verification/octomo.client.spec.ts && git commit -m "feat(v1/verification): 옥토모 API 서버 전용 클라이언트" -- <두 파일>`

---

## Task 2: Phone proof token (pre-account 인증 전달용 서명 토큰)

**Files:**
- Create: `apps/v1_api/src/verification/phone-proof-token.ts`
- Test: `apps/v1_api/src/verification/phone-proof-token.spec.ts`

**Interfaces:**
- Produces: `issuePhoneProofToken(phone: string, nowMs?: number): string`, `verifyPhoneProofToken(token: string, phone: string, nowMs?: number): boolean`. TTL 10분, HMAC-SHA256(`V1_SESSION_SECRET`→`V1_JWT_SECRET`→`JWT_SECRET` 순 fallback), phone 바인딩, timing-safe 비교.

- [ ] **Step 1: 실패 테스트 작성**

```typescript
import { issuePhoneProofToken, verifyPhoneProofToken } from './phone-proof-token';

describe('phone-proof-token', () => {
  const OLD = process.env.V1_SESSION_SECRET;
  beforeEach(() => { process.env.V1_SESSION_SECRET = 'x'.repeat(48); });
  afterEach(() => { process.env.V1_SESSION_SECRET = OLD; });

  it('round-trips a token for the same phone', () => {
    const token = issuePhoneProofToken('01012345678');
    expect(verifyPhoneProofToken(token, '01012345678')).toBe(true);
  });

  it('rejects a token used for a different phone', () => {
    const token = issuePhoneProofToken('01012345678');
    expect(verifyPhoneProofToken(token, '01099998888')).toBe(false);
  });

  it('rejects an expired token', () => {
    const past = Date.now() - 20 * 60 * 1000;
    const token = issuePhoneProofToken('01012345678', past);
    expect(verifyPhoneProofToken(token, '01012345678')).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const token = issuePhoneProofToken('01012345678');
    const tampered = `${token.slice(0, -2)}xy`;
    expect(verifyPhoneProofToken(tampered, '01012345678')).toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(verifyPhoneProofToken('', '01012345678')).toBe(false);
    expect(verifyPhoneProofToken('nodot', '01012345678')).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인** — `npx jest src/verification/phone-proof-token.spec.ts` → FAIL.

- [ ] **Step 3: 구현**

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

const PROOF_TTL_MS = 10 * 60 * 1000;

function proofSecret(): string {
  return process.env.V1_SESSION_SECRET ?? process.env.V1_JWT_SECRET ?? process.env.JWT_SECRET ?? '';
}

function sign(payload: string): string {
  return createHmac('sha256', proofSecret()).update(payload).digest('base64url');
}

export function issuePhoneProofToken(phone: string, nowMs: number = Date.now()): string {
  const payload = `${phone}:${nowMs + PROOF_TTL_MS}`;
  return `${Buffer.from(payload).toString('base64url')}.${sign(payload)}`;
}

export function verifyPhoneProofToken(token: string, phone: string, nowMs: number = Date.now()): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;
  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return false;
  }
  const [tokenPhone, expStr] = payload.split(':');
  if (tokenPhone !== phone) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < nowMs) return false;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
```

- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 커밋** — `feat(v1/verification): pre-account 휴대폰 인증 proof token`

---

## Task 3: Prisma 챌린지 모델 + 마이그레이션

**Files:**
- Modify: `apps/v1_api/prisma/schema.prisma` (V1VerificationToken 모델 정의부 근처, L400-420 이후에 신규 모델 추가)
- Create: `apps/v1_api/prisma/migrations/20260723090000_v1_phone_verification_challenge/migration.sql`

**Interfaces:**
- Produces: Prisma model `V1PhoneVerificationChallenge` (테이블 `v1_phone_verification_challenges`), `phone @unique`, 평문 `code`, `channel`, `expiresAt`, `attemptCount`, `verifiedAt?`. userId 없음(pre-account 지원).

- [ ] **Step 1: schema.prisma에 모델 추가** — `V1VerificationToken` 모델 바로 아래에 삽입:

```prisma
model V1PhoneVerificationChallenge {
  id           String    @id @default(uuid())
  phone        String    @unique
  code         String
  channel      String
  expiresAt    DateTime  @map("expires_at")
  attemptCount Int       @default(0) @map("attempt_count")
  verifiedAt   DateTime? @map("verified_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@map("v1_phone_verification_challenges")
}
```

- [ ] **Step 2: 마이그레이션 SQL 작성** — `migration.sql`:

```sql
-- CreateTable
CREATE TABLE "v1_phone_verification_challenges" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v1_phone_verification_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "v1_phone_verification_challenges_phone_key" ON "v1_phone_verification_challenges"("phone");
```

- [ ] **Step 3: 클라이언트 생성 + 드리프트 검증** — `cd apps/v1_api && npx prisma generate` 후, 빈 DB에 체인 재생해 스키마 드리프트 0 확인:
  Run: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$DATABASE_URL_SHADOW"` (또는 로컬 dev DB에 `npx prisma migrate deploy` 후 `npx prisma migrate status`)
  Expected: 마이그레이션 pending 0, 드리프트 없음. `V1PhoneVerificationChallenge` delegate가 `prisma.v1PhoneVerificationChallenge`로 노출.

- [ ] **Step 4: 커밋** — `feat(v1/db): 휴대폰 MO 인증 챌린지 테이블`

---

## Task 4: PhoneVerificationService (MO 코어)

**Files:**
- Create: `apps/v1_api/src/verification/phone-verification.service.ts`
- Test: `apps/v1_api/src/verification/phone-verification.service.spec.ts`

**Interfaces:**
- Consumes: `OctomoClient`(Task 1), `PrismaService`, `issuePhoneProofToken`(Task 2), `V1PhoneVerificationChallenge`(Task 3).
- Produces: `PhoneVerificationService` (injectable):
  - `get enabled(): boolean` — `octomo.enabled || devEcho`.
  - `issueChallenge(phone: string, channel: 'mobile'|'desktop'): Promise<{ code: string; destNumber: string; qrCode?: string; expiresAt: string }>`
  - `pollArrived(phone: string): Promise<boolean>` — 시도제한 초과 시 `BadRequestException(VERIFICATION_TOO_MANY_ATTEMPTS)`.
  - `issueProof(phone: string): string` — `issuePhoneProofToken` 위임.
- 상수: `CODE_TTL_MS = 5*60*1000`, `MAX_POLL_ATTEMPTS = 10`. 코드 문자셋 `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`(혼동문자 제외) 6자.

- [ ] **Step 1: 실패 테스트 작성** (fetch/octomo mock)

```typescript
import { BadRequestException } from '@nestjs/common';
import { OctomoClient } from './octomo.client';
import { PhoneVerificationService } from './phone-verification.service';

function prismaMock() {
  const store = new Map<string, { phone: string; code: string; channel: string; expiresAt: Date; attemptCount: number; verifiedAt: Date | null }>();
  return {
    v1PhoneVerificationChallenge: {
      upsert: jest.fn(async ({ where, create }: { where: { phone: string }; create: { phone: string; code: string; channel: string; expiresAt: Date } }) => {
        const row = { phone: create.phone, code: create.code, channel: create.channel, expiresAt: create.expiresAt, attemptCount: 0, verifiedAt: null };
        store.set(where.phone, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { phone: string } }) => store.get(where.phone) ?? null),
      update: jest.fn(async ({ where, data }: { where: { phone: string }; data: Record<string, unknown> }) => {
        const row = store.get(where.phone)!;
        if ((data.attemptCount as { increment?: number })?.increment) row.attemptCount += 1;
        if ('verifiedAt' in data) row.verifiedAt = data.verifiedAt as Date;
        return row;
      }),
    },
    __store: store,
  } as never;
}

describe('PhoneVerificationService', () => {
  const OLD = { key: process.env.OCTOMO_API_KEY, echo: process.env.V1_VERIFICATION_DEV_ECHO };
  afterEach(() => { process.env.OCTOMO_API_KEY = OLD.key; process.env.V1_VERIFICATION_DEV_ECHO = OLD.echo; jest.restoreAllMocks(); });

  it('issues a 6-char challenge and (desktop) fetches a QR from octomo', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    jest.spyOn(octomo, 'createQrCode').mockResolvedValue('data:image/png;base64,QR');
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, octomo);
    const res = await svc.issueChallenge('01012345678', 'desktop');
    expect(res.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(res.destNumber).toBe('16663538');
    expect(res.qrCode).toBe('data:image/png;base64,QR');
    expect(octomo.createQrCode).toHaveBeenCalledWith(res.code);
  });

  it('mobile issue does not fetch a QR', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    const qr = jest.spyOn(octomo, 'createQrCode');
    const svc = new PhoneVerificationService(prismaMock(), octomo);
    const res = await svc.issueChallenge('01012345678', 'mobile');
    expect(res.qrCode).toBeUndefined();
    expect(qr).not.toHaveBeenCalled();
  });

  it('pollArrived calls octomo messageExists with the stored code and marks verifiedAt', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, octomo);
    const { code } = await svc.issueChallenge('01012345678', 'mobile');
    const spy = jest.spyOn(octomo, 'messageExists').mockResolvedValue(true);
    expect(await svc.pollArrived('01012345678')).toBe(true);
    expect(spy).toHaveBeenCalledWith('01012345678', code, 5);
    expect((prisma as never as { __store: Map<string, { verifiedAt: Date | null }> }).__store.get('01012345678')!.verifiedAt).toBeInstanceOf(Date);
  });

  it('pollArrived returns false with no challenge', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const svc = new PhoneVerificationService(prismaMock(), new OctomoClient());
    expect(await svc.pollArrived('01000000000')).toBe(false);
  });

  it('throws when poll attempts exceed the cap', async () => {
    process.env.OCTOMO_API_KEY = 'k';
    const octomo = new OctomoClient();
    jest.spyOn(octomo, 'messageExists').mockResolvedValue(false);
    const prisma = prismaMock();
    const svc = new PhoneVerificationService(prisma, octomo);
    await svc.issueChallenge('01012345678', 'mobile');
    (prisma as never as { __store: Map<string, { attemptCount: number }> }).__store.get('01012345678')!.attemptCount = 10;
    await expect(svc.pollArrived('01012345678')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dev echo auto-passes when octomo disabled', async () => {
    delete process.env.OCTOMO_API_KEY;
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    const svc = new PhoneVerificationService(prismaMock(), new OctomoClient());
    expect(svc.enabled).toBe(true);
    await svc.issueChallenge('01012345678', 'mobile');
    expect(await svc.pollArrived('01012345678')).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 구현**

```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OctomoClient } from './octomo.client';
import { issuePhoneProofToken } from './phone-proof-token';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_POLL_ATTEMPTS = 10;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly octomo: OctomoClient,
  ) {}

  private get destNumber(): string {
    return process.env.OCTOMO_DEST_NUMBER ?? '16663538';
  }

  private get devEcho(): boolean {
    return process.env.V1_VERIFICATION_DEV_ECHO === 'true';
  }

  get enabled(): boolean {
    return this.octomo.enabled || this.devEcho;
  }

  async issueChallenge(phone: string, channel: 'mobile' | 'desktop') {
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await this.prisma.v1PhoneVerificationChallenge.upsert({
      where: { phone },
      update: { code, channel, expiresAt, attemptCount: 0, verifiedAt: null },
      create: { phone, code, channel, expiresAt },
    });

    let qrCode: string | undefined;
    if (channel === 'desktop' && this.octomo.enabled) {
      qrCode = await this.octomo.createQrCode(code);
    }

    return { code, destNumber: this.destNumber, qrCode, expiresAt: expiresAt.toISOString() };
  }

  async pollArrived(phone: string): Promise<boolean> {
    const challenge = await this.prisma.v1PhoneVerificationChallenge.findUnique({ where: { phone } });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) return false;
    if (challenge.attemptCount >= MAX_POLL_ATTEMPTS) {
      throw new BadRequestException({
        code: 'VERIFICATION_TOO_MANY_ATTEMPTS',
        message: '확인 시도가 너무 많아요. 인증번호를 다시 받아 주세요.',
      });
    }

    await this.prisma.v1PhoneVerificationChallenge.update({
      where: { phone },
      data: { attemptCount: { increment: 1 } },
    });

    const exists = this.octomo.enabled
      ? await this.octomo.messageExists(phone, challenge.code, 5)
      : this.devEcho;

    if (exists) {
      await this.prisma.v1PhoneVerificationChallenge.update({ where: { phone }, data: { verifiedAt: new Date() } });
    }
    return exists;
  }

  issueProof(phone: string): string {
    return issuePhoneProofToken(phone);
  }

  private generateCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    }
    return code;
  }
}
```

- [ ] **Step 4: 통과 확인** — PASS.
- [ ] **Step 5: 커밋** — `feat(v1/verification): 옥토모 MO 휴대폰 인증 코어 서비스`

---

## Task 5: 공개 엔드포인트 `/auth/phone/*` + register hard-block

**Files:**
- Create: `apps/v1_api/src/auth/dto/phone-verification.dto.ts`
- Create: `apps/v1_api/src/auth/phone-verification-public.controller.ts`
- Modify: `apps/v1_api/src/auth/auth.module.ts` (VerificationModule import + 신규 컨트롤러 등록; 파일 먼저 Read)
- Modify: `apps/v1_api/src/verification/verification.module.ts` (PhoneVerificationService·OctomoClient provider + export)
- Modify: `apps/v1_api/src/auth/dto/register.dto.ts` (`phoneProofToken` 추가)
- Modify: `apps/v1_api/src/auth/auth.service.ts` (register 게이트 + `phoneVerifiedAt` 세팅; PhoneVerificationService 주입)
- Test: `apps/v1_api/src/auth/phone-verification-public.controller.spec.ts`, register 게이트는 통합 스펙 또는 `auth.service` 스펙에 추가

**Interfaces:**
- Consumes: `PhoneVerificationService`(Task 4), `verifyPhoneProofToken`(Task 2).
- Produces: `POST /auth/phone/issue { phone, channel } → { code, destNumber, qrCode?, expiresAt }`; `POST /auth/phone/verify { phone } → { verified: boolean, proofToken?: string }`. `RegisterDto.phoneProofToken?: string`.

- [ ] **Step 1: DTO 작성** — `phone-verification.dto.ts`

```typescript
import { IsIn, IsString, Matches } from 'class-validator';

export class PhoneIssueDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;

  @IsIn(['mobile', 'desktop'])
  channel!: 'mobile' | 'desktop';
}

export class PhoneVerifyDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;
}
```

- [ ] **Step 2: VerificationModule에 provider/export 추가** — `verification.module.ts`를 아래로 교체:

```typescript
import { Module } from '@nestjs/common';
import { V1AuthGuard } from '../auth/v1-auth.guard';
import { OctomoClient } from './octomo.client';
import { PhoneVerificationService } from './phone-verification.service';
import { VerificationController } from './verification.controller';
import { VerificationDispatcherService } from './verification-dispatcher.service';
import { VerificationService } from './verification.service';

@Module({
  controllers: [VerificationController],
  providers: [VerificationService, VerificationDispatcherService, OctomoClient, PhoneVerificationService, V1AuthGuard],
  exports: [PhoneVerificationService, OctomoClient],
})
export class VerificationModule {}
```

- [ ] **Step 3: 공개 컨트롤러 작성** — `phone-verification-public.controller.ts`

```typescript
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PhoneVerificationService } from '../verification/phone-verification.service';
import { PhoneIssueDto, PhoneVerifyDto } from './dto/phone-verification.dto';

@Controller('auth/phone')
export class PhoneVerificationPublicController {
  constructor(private readonly phoneVerification: PhoneVerificationService) {}

  @Post('issue')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async issue(@Body() dto: PhoneIssueDto) {
    const { code, destNumber, qrCode, expiresAt } = await this.phoneVerification.issueChallenge(dto.phone, dto.channel);
    return { code, destNumber, qrCode, expiresAt };
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verify(@Body() dto: PhoneVerifyDto) {
    const arrived = await this.phoneVerification.pollArrived(dto.phone);
    if (!arrived) return { verified: false };
    return { verified: true, proofToken: this.phoneVerification.issueProof(dto.phone) };
  }
}
```

- [ ] **Step 4: AuthModule 배선** — `apps/v1_api/src/auth/auth.module.ts`를 Read 후, `imports`에 `VerificationModule` 추가(from `'../verification/verification.module'`), `controllers`에 `PhoneVerificationPublicController` 추가. (이미 존재하는 imports/controllers 배열에 append.)

- [ ] **Step 5: RegisterDto에 proof token 추가** — `register.dto.ts`의 클래스 본문에 추가:

```typescript
  @IsOptional()
  @IsString()
  phoneProofToken?: string;
```
(상단 import에 `IsOptional`이 없으면 `class-validator`에서 추가.)

- [ ] **Step 6: register 게이트 + phoneVerifiedAt** — `auth.service.ts`:
  - 생성자에 `private readonly phoneVerification: PhoneVerificationService` 주입(import from `'../verification/phone-verification.service'`).
  - 상단 import에 `import { verifyPhoneProofToken } from '../verification/phone-proof-token';` 추가.
  - `register(dto)` 안의 phone 중복 체크(`if (phone) { ... PHONE_CONFLICT ... }`) **직후**에 게이트 삽입:

```typescript
    const phoneVerificationRequired = this.phoneVerification.enabled;
    if (phoneVerificationRequired && (!dto.phoneProofToken || !verifyPhoneProofToken(dto.phoneProofToken, phone))) {
      throw new BadRequestException({
        code: 'PHONE_NOT_VERIFIED',
        message: '휴대폰 본인인증을 먼저 완료해 주세요.',
      });
    }
```
  - `v1User.create`의 `data`에서 `phone,` 다음 줄에 추가: `phoneVerifiedAt: phoneVerificationRequired ? new Date() : null,`

- [ ] **Step 7: 컨트롤러 스펙 + register 게이트 스펙 작성** — 공개 컨트롤러는 서비스 mock으로 issue/verify 분기 검증; register 게이트는 `phoneVerification.enabled=true` + 무효 토큰 → `PHONE_NOT_VERIFIED`, 유효 토큰 → 통과 & `phoneVerifiedAt` 세팅을 검증(기존 `auth.service` 테스트 관례/통합 스펙에 맞춰 작성). 최소 케이스:
  - verify: `pollArrived=false` → `{ verified:false }`(proofToken 없음); `pollArrived=true` → `{ verified:true, proofToken: <string> }`.
  - register: enabled+토큰없음 → 400 `PHONE_NOT_VERIFIED`; enabled+유효토큰 → create data에 `phoneVerifiedAt` non-null; disabled → 토큰 없이도 통과 & `phoneVerifiedAt=null`.

- [ ] **Step 8: 타깃 테스트 실행** — `npx jest src/auth/phone-verification-public.controller.spec.ts` 및 register 게이트 스펙 → PASS. `npx tsc --noEmit -p apps/v1_api` 클린.

- [ ] **Step 9: 커밋** — `feat(v1/auth): 공개 휴대폰 인증 엔드포인트 + register hard-block`

---

## Task 6: authed phone 인증 MO 전환 + 카카오 social-profile 게이트

**Files:**
- Modify: `apps/v1_api/src/verification/dto/verification.dto.ts` (phone request에 channel, phone confirm 신규)
- Modify: `apps/v1_api/src/verification/verification.controller.ts` (phone request/confirm 시그니처)
- Modify: `apps/v1_api/src/verification/verification.service.ts` (PhoneVerificationService 주입, `requestPhone`·`confirmPhoneArrived` MO 전환; email 로직 불변)
- Modify: `apps/v1_api/src/auth/auth.service.ts` (`completeSocialProfile` 게이트)
- Test: `apps/v1_api/src/verification/verification.service.spec.ts`에 phone MO 케이스 추가

**Interfaces:**
- Produces: `POST /verification/phone/request { phone, channel } → { destNumber, code, qrCode?, expiresAt }`(authed); `POST /verification/phone/confirm { phone } → { verified, verification? }`(authed, 성공 시 현재 user `phoneVerifiedAt`+`phone` 세팅). `completeSocialProfile`은 `phoneVerification.enabled`일 때 `user.phoneVerifiedAt != null && user.phone === dto.phone` 아니면 400 `PHONE_NOT_VERIFIED`.

- [ ] **Step 1: DTO 확장** — `verification.dto.ts`:

```typescript
import { IsIn, IsString, Length, Matches } from 'class-validator';

export class RequestPhoneVerificationDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;

  @IsIn(['mobile', 'desktop'])
  channel!: 'mobile' | 'desktop';
}

export class ConfirmPhoneArrivedDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;
}

export class ConfirmVerificationDto {
  @IsString()
  @Length(6, 6, { message: '인증번호는 6자리예요.' })
  code!: string;
}
```

- [ ] **Step 2: verification.service phone MO 전환** — `verification.service.ts`:
  - 생성자에 `private readonly phoneVerification: PhoneVerificationService` 주입.
  - 기존 `requestPhone(authUser, phone)`를 `requestPhone(authUser, phone, channel)`로 바꾸고, 타 계정 중복 체크(기존 로직 유지) 후 `return this.phoneVerification.issueChallenge(phone, channel);` (기존 `this.issue('phone', ...)` 대체).
  - 신규 `confirmPhoneArrived(authUser, phone)`:

```typescript
  async confirmPhoneArrived(authUser: V1AuthUser, phone: string) {
    const arrived = await this.phoneVerification.pollArrived(phone);
    if (!arrived) return { verified: false as const };

    const owner = await this.prisma.v1User.findFirst({ where: { phone, id: { not: authUser.id } }, select: { id: true } });
    if (owner) {
      throw new ConflictException({ code: 'PHONE_CONFLICT', message: '이미 다른 계정에서 사용 중인 번호예요.' });
    }
    await this.prisma.v1User.update({ where: { id: authUser.id }, data: { phoneVerifiedAt: new Date(), phone } });
    return { verified: true as const, verification: { phoneVerified: true } };
  }
```

- [ ] **Step 3: 컨트롤러 시그니처 변경** — `verification.controller.ts`의 phone 두 메서드 교체(email 메서드는 그대로):

```typescript
  @Post('phone/request')
  @HttpCode(200)
  requestPhone(@CurrentUser() user: V1AuthUser, @Body() dto: RequestPhoneVerificationDto) {
    return this.verificationService.requestPhone(user, dto.phone, dto.channel);
  }

  @Post('phone/confirm')
  @HttpCode(200)
  confirmPhone(@CurrentUser() user: V1AuthUser, @Body() dto: ConfirmPhoneArrivedDto) {
    return this.verificationService.confirmPhoneArrived(user, dto.phone);
  }
```
  (import에서 `ConfirmPhoneArrivedDto` 추가, phone confirm은 더 이상 `ConfirmVerificationDto` 사용 안 함. email confirm은 계속 `ConfirmVerificationDto`.)

- [ ] **Step 4: 카카오 게이트** — `auth.service.ts` `completeSocialProfile`의 phone 중복 체크(`if (phone) { ... PHONE_CONFLICT ... }`) **직후**에 삽입:

```typescript
    if (this.phoneVerification.enabled) {
      const verified = await this.prisma.v1User.findUnique({
        where: { id: userId },
        select: { phone: true, phoneVerifiedAt: true },
      });
      if (!verified?.phoneVerifiedAt || verified.phone !== phone) {
        throw new BadRequestException({
          code: 'PHONE_NOT_VERIFIED',
          message: '휴대폰 본인인증을 먼저 완료해 주세요.',
        });
      }
    }
```
  (`completeSocialProfile`의 트랜잭션은 `phone`을 다시 set하지만 authed 인증이 이미 동일 값으로 set했으므로 무해. Task 5에서 이미 `PhoneVerificationService` 주입 완료.)

- [ ] **Step 5: 스펙 추가** — `verification.service.spec.ts`에 phone MO 케이스: `confirmPhoneArrived` — `pollArrived=false`→`{verified:false}`; `pollArrived=true`+번호 미충돌→`v1User.update({ phoneVerifiedAt, phone })` 호출 & `{verified:true}`; 타 계정 소유→`PHONE_CONFLICT`. (기존 email 테스트는 회귀 없이 유지.)

- [ ] **Step 6: 타깃 테스트 + tsc** — `npx jest src/verification` PASS, `tsc --noEmit` 클린.
- [ ] **Step 7: 커밋** — `feat(v1/verification): authed 휴대폰 인증 MO 전환 + 카카오 게이트`

---

## Task 7: 인프라 — OCTOMO_API_KEY 배선 + 운영 문서

**Files:**
- Modify: `.github/workflows/deploy-alpha.yml` (L129 job env, L148 ssm 인라인 env)
- Modify: `deploy/docker-compose.prod.yml` (v1_api environment, L56 KAKAO 근처)
- Modify: `deploy/.env.prod.example` (문서용 플레이스홀더)
- Create: `docs/ops/octomo-setup.md`

**Interfaces:** (배관 전용, 코드 인터페이스 없음)

- [ ] **Step 1: deploy-alpha.yml job env** — L135 `KAKAO_REDIRECT_URI: ${{ secrets.ALPHA_KAKAO_REDIRECT_URI }}` 다음 줄에 추가:
```yaml
          OCTOMO_API_KEY: ${{ secrets.OCTOMO_API_KEY }}
```

- [ ] **Step 2: deploy-alpha.yml ssm 인라인 env** — L148 `--arg deploy "sudo -u ec2-user -H env ... KAKAO_REDIRECT_URI='${KAKAO_REDIRECT_URI}' bash ...` 문자열에서 `KAKAO_REDIRECT_URI='${KAKAO_REDIRECT_URI}'` 다음에 삽입:
```
OCTOMO_API_KEY='${OCTOMO_API_KEY}'
```
  (다른 KAKAO_* 토큰과 동일하게 작은따옴표로 감싸 값 보호.)

- [ ] **Step 3: docker-compose.prod.yml v1_api env** — `KAKAO_REDIRECT_URI: ${KAKAO_REDIRECT_URI:-}` 다음 줄에 추가:
```yaml
      OCTOMO_API_KEY: ${OCTOMO_API_KEY:-}
      OCTOMO_DEST_NUMBER: ${OCTOMO_DEST_NUMBER:-16663538}
```
  (`docker-compose.alpha.yml` overlay는 environment 미선언이므로 수정 불필요.)

- [ ] **Step 4: .env.prod.example 문서화** — `KAKAO_REDIRECT_URI=...` 근처 OAuth 블록에 추가:
```bash
# Octomo 휴대폰 본인인증 (alpha 전용). 비우면 인증 기능 비활성(기존 가입 동작 유지).
# 키는 옥토모 마이페이지에서 발급. 서버 전용 — 절대 NEXT_PUBLIC_* 로 노출 금지.
OCTOMO_API_KEY=
OCTOMO_DEST_NUMBER=16663538
```

- [ ] **Step 5: 운영 문서** — `docs/ops/octomo-setup.md` 작성: (1) GitHub repo Secrets에 `OCTOMO_API_KEY` 등록 절차(Settings→Secrets and variables→Actions→New repository secret), (2) 키 발급처(옥토모 마이페이지), (3) 값 흐름(GitHub Secret→deploy-alpha.yml→SSM Run Command→compose→v1_api), (4) 로컬/CI는 `V1_VERIFICATION_DEV_ECHO=true`로 옥토모 없이 동작, (5) 롤백(secret 삭제 시 기능 자동 비활성). VAPID 문서(`docs/ops/vapid-setup.md`) 톤 참고.

- [ ] **Step 6: YAML 유효성** — `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy-alpha.yml')); yaml.safe_load(open('deploy/docker-compose.prod.yml')); print('ok')"` → ok.
- [ ] **Step 7: 커밋** — `feat(v1/infra): 옥토모 API 키 alpha 배포 배선 + 운영 문서`

---

## Task 8: 프론트 데이터 계층 (훅·타입·기기감지·SMS 링크)

**Files:**
- Create: `apps/v1_web/src/lib/device-kind.ts`
- Create: `apps/v1_web/src/lib/octomo-sms-link.ts`
- Modify: `apps/v1_web/src/hooks/use-v1-api.ts` (phone 훅 4종 + register payload)
- Modify: `apps/v1_web/src/types/api.ts` (`V1AuthMe.verification`)
- Test: `apps/v1_web/src/lib/octomo-sms-link.test.ts`

**Interfaces:**
- Produces: `detectDeviceKind(): 'mobile'|'desktop'`, `buildSmsLink(dest: string, body: string): string`, hooks `useV1PhoneIssue`/`useV1PhoneVerify`(public)·`useV1AuthedPhoneRequest`/`useV1AuthedPhoneConfirm`(authed). `V1AuthMe.verification?: { emailVerified: boolean; phoneVerified: boolean }`. `useV1Register` payload에 `phoneProofToken?: string`.

- [ ] **Step 1: device-kind.ts**

```typescript
export type DeviceKind = 'mobile' | 'desktop';

export function detectDeviceKind(): DeviceKind {
  if (typeof navigator === 'undefined') return 'desktop';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) return 'mobile';
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse)').matches &&
    window.matchMedia('(max-width: 820px)').matches
  ) {
    return 'mobile';
  }
  return 'desktop';
}
```

- [ ] **Step 2: octomo-sms-link.ts + 테스트**

```typescript
// octomo-sms-link.ts
export function buildSmsLink(destNumber: string, body: string): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const encoded = encodeURIComponent(body);
  return isIos ? `sms:${destNumber}&body=${encoded}` : `sms:${destNumber}?body=${encoded}`;
}
```

```typescript
// octomo-sms-link.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildSmsLink } from './octomo-sms-link';

afterEach(() => vi.unstubAllGlobals());

describe('buildSmsLink', () => {
  it('uses ?body= on Android', () => {
    vi.stubGlobal('navigator', { userAgent: 'Android' });
    expect(buildSmsLink('16663538', 'ABC123')).toBe('sms:16663538?body=ABC123');
  });
  it('uses &body= on iOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'iPhone' });
    expect(buildSmsLink('16663538', 'ABC123')).toBe('sms:16663538&body=ABC123');
  });
});
```

- [ ] **Step 3: use-v1-api.ts 훅 추가** — `useV1CompleteSocialTerms` 뒤에 삽입:

```typescript
export function useV1PhoneIssue() {
  return useMutation({
    mutationFn: (body: { phone: string; channel: 'mobile' | 'desktop' }) =>
      v1Post<{ code: string; destNumber: string; qrCode?: string; expiresAt: string }>('/auth/phone/issue', body),
  });
}

export function useV1PhoneVerify() {
  return useMutation({
    mutationFn: (body: { phone: string }) =>
      v1Post<{ verified: boolean; proofToken?: string }>('/auth/phone/verify', body),
  });
}

export function useV1AuthedPhoneRequest() {
  return useMutation({
    mutationFn: (body: { phone: string; channel: 'mobile' | 'desktop' }) =>
      v1Post<{ code: string; destNumber: string; qrCode?: string; expiresAt: string }>('/verification/phone/request', body),
  });
}

export function useV1AuthedPhoneConfirm() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { phone: string }) => v1Post<{ verified: boolean }>('/verification/phone/confirm', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: v1Keys.authMe() }),
  });
}
```

- [ ] **Step 4: register payload에 proofToken** — `useV1Register`의 mutationFn body 타입에 `phoneProofToken?: string;` 추가.

- [ ] **Step 5: V1AuthMe 타입** — `types/api.ts`의 `V1AuthMe`에 추가(`reputation?: unknown;` 근처):
```typescript
  verification?: {
    emailVerified: boolean;
    phoneVerified: boolean;
  };
```

- [ ] **Step 6: 테스트** — `cd apps/v1_web && pnpm test src/lib/octomo-sms-link.test.ts` → PASS. `pnpm exec tsc --noEmit` 클린.
- [ ] **Step 7: 커밋** — `feat(v1/web): 휴대폰 인증 훅·기기감지·SMS 딥링크`

---

## Task 9: 공유 컴포넌트 `PhoneVerificationCard`

**Files:**
- Create: `apps/v1_web/src/components/auth/phone-verification/phone-verification-card.tsx`
- Test: `apps/v1_web/src/components/auth/phone-verification/phone-verification-card.test.tsx`

**Interfaces:**
- Consumes: Task 8 훅·유틸, `Card`(`components/v1-ui/primitives`), `V1ApiError`.
- Produces: `PhoneVerificationCard` — props `{ mode: 'public'|'authed'; phone: string; onVerified: (proofToken?: string) => void }`. `public`→`useV1PhoneIssue`/`useV1PhoneVerify`, `authed`→`useV1AuthedPhoneRequest`/`useV1AuthedPhoneConfirm`. 기기감지로 mobile(딥링크 버튼)/desktop(QR `<img>`) 기본 뷰 + "다른 방법으로" 토글. 코드 표시·5분 카운트다운·재발급·"인증 확인"(verify) 폴링·성공/실패/만료 상태. 44px·aria·해요체·CSS 변수만.

- [ ] **Step 1: 실패 테스트 작성**(핵심 계약만: public verify 성공 시 proofToken으로 onVerified 호출, 실패 시 안내 노출, 데스크탑 QR 렌더)

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhoneVerificationCard } from './phone-verification-card';
import * as api from '@/hooks/use-v1-api';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

it('public: verify 성공 시 proofToken으로 onVerified 호출', async () => {
  vi.spyOn(api, 'useV1PhoneIssue').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ code: 'ABC123', destNumber: '16663538', expiresAt: new Date(Date.now() + 300000).toISOString() }), isPending: false } as never);
  vi.spyOn(api, 'useV1PhoneVerify').mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue({ verified: true, proofToken: 'PROOF' }), isPending: false } as never);
  const onVerified = vi.fn();
  wrap(<PhoneVerificationCard mode="public" phone="01012345678" onVerified={onVerified} />);
  await userEvent.click(await screen.findByRole('button', { name: /인증번호 받기|인증문자 보내기/ }));
  await userEvent.click(await screen.findByRole('button', { name: /인증 확인/ }));
  await waitFor(() => expect(onVerified).toHaveBeenCalledWith('PROOF'));
});
```

- [ ] **Step 2: 실패 확인** — `pnpm test phone-verification-card.test.tsx` → FAIL.

- [ ] **Step 3: 구현** — 상태머신(`idle`→`issued`→`verifying`→`verified`/`failed`/`expired`), 기기별 CTA, 카운트다운. (아래 골격을 실제 마크업으로 완성; 모든 텍스트 해요체, 색은 CSS 변수, 버튼 44px+aria.)

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/v1-ui/primitives';
import { detectDeviceKind, type DeviceKind } from '@/lib/device-kind';
import { buildSmsLink } from '@/lib/octomo-sms-link';
import { V1ApiError } from '@/lib/api-client';
import {
  useV1AuthedPhoneConfirm,
  useV1AuthedPhoneRequest,
  useV1PhoneIssue,
  useV1PhoneVerify,
} from '@/hooks/use-v1-api';

type Props = { mode: 'public' | 'authed'; phone: string; onVerified: (proofToken?: string) => void };
type Issued = { code: string; destNumber: string; qrCode?: string; expiresAt: string };

export function PhoneVerificationCard({ mode, phone, onVerified }: Props) {
  const publicIssue = useV1PhoneIssue();
  const publicVerify = useV1PhoneVerify();
  const authedRequest = useV1AuthedPhoneRequest();
  const authedConfirm = useV1AuthedPhoneConfirm();

  const [device, setDevice] = useState<DeviceKind>('desktop');
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => setDevice(detectDeviceKind()), []);

  const channel: DeviceKind = device;

  const issue = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      const res = mode === 'public'
        ? await publicIssue.mutateAsync({ phone, channel })
        : await authedRequest.mutateAsync({ phone, channel });
      setIssued(res);
      setRemainingMs(new Date(res.expiresAt).getTime() - Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : '인증번호 발급에 실패했어요.');
    } finally {
      setPending(false);
    }
  }, [mode, phone, channel, publicIssue, authedRequest]);

  const verify = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      if (mode === 'public') {
        const res = await publicVerify.mutateAsync({ phone });
        if (res.verified) onVerified(res.proofToken);
        else setError('아직 문자가 확인되지 않았어요. 문자를 보낸 뒤 다시 눌러 주세요.');
      } else {
        const res = await authedConfirm.mutateAsync({ phone });
        if (res.verified) onVerified();
        else setError('아직 문자가 확인되지 않았어요. 문자를 보낸 뒤 다시 눌러 주세요.');
      }
    } catch (err) {
      setError(err instanceof V1ApiError ? err.message : '인증 확인에 실패했어요.');
    } finally {
      setPending(false);
    }
  }, [mode, phone, publicVerify, authedConfirm, onVerified]);

  useEffect(() => {
    if (!issued) return;
    const id = window.setInterval(() => {
      const left = new Date(issued.expiresAt).getTime() - Date.now();
      setRemainingMs(left > 0 ? left : 0);
    }, 1000);
    return () => window.clearInterval(id);
  }, [issued]);

  const expired = issued !== null && remainingMs <= 0;
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  const smsLink = useMemo(() => (issued ? buildSmsLink(issued.destNumber, issued.code) : '#'), [issued]);

  // 마크업: issued===null → "인증번호 받기" CTA(issue).
  //          issued && device==='mobile' → 코드·수신번호 안내 + <a href={smsLink} className="tm-btn ...">인증문자 보내기</a> + "인증 확인"(verify).
  //          issued && device==='desktop' → issued.qrCode <img> + 코드·수신번호 안내 + "인증 확인"(verify).
  //          "다른 방법으로" 버튼으로 device 토글. 카운트다운(minutes:seconds), expired 시 "인증번호 다시 받기"(issue).
  //          error는 role="alert"로 노출. 모든 버튼 최소 44px, 아이콘 aria-hidden, 링크/버튼 aria-label.
  return (
    <Card pad={16} /* ...실제 마크업 완성... */>
      {/* TODO(this task): 위 주석대로 완성 — placeholder 아님, 구현 시 실제 JSX 작성 */}
      <button type="button" className="tm-btn tm-btn-primary" style={{ minHeight: 44 }} disabled={pending} onClick={issued && !expired ? verify : issue}>
        {issued && !expired ? '인증 확인' : '인증번호 받기'}
      </button>
      {issued && device === 'mobile' && !expired ? (
        <a href={smsLink} className="tm-btn tm-btn-outline" style={{ minHeight: 44 }}>인증문자 보내기</a>
      ) : null}
      {issued && device === 'desktop' && issued.qrCode ? (
        <img src={issued.qrCode} alt="휴대폰으로 스캔하면 인증 문자가 준비돼요" width={200} height={200} />
      ) : null}
      {issued ? <p className="tm-text-caption">남은 시간 {minutes}:{String(seconds).padStart(2, '0')}</p> : null}
      {error ? <p role="alert" className="tm-text-caption" style={{ color: 'var(--red500)' }}>{error}</p> : null}
    </Card>
  );
}
```
  > 실행 시 위 골격을 프로덕션 fidelity로 완성: 코드/수신번호 강조 표시, 안내 문구("본인 명의 휴대폰으로 아래 번호에 인증번호를 보내면 확인돼요"), device 토글 버튼, expired 재발급 분기까지. Task 13에서 시각 폴리시.

- [ ] **Step 4: 테스트 통과** — PASS.
- [ ] **Step 5: 커밋** — `feat(v1/web): 휴대폰 MO 인증 공유 카드 컴포넌트`

---

## Task 10: 이메일 회원가입 통합 (hard-block)

**Files:**
- Modify: `apps/v1_web/src/components/auth/signup-client.tsx`
- Test: `apps/v1_web/src/components/auth/signup-client.test.tsx`(있으면 확장, 없으면 신규 — 게이트 계약만)

**Interfaces:**
- Consumes: `PhoneVerificationCard`(Task 9), `useV1Register` payload `phoneProofToken`(Task 8).

- [ ] **Step 1: 인증 상태 state 추가** — `signup-client.tsx` state 블록(L61-83 근처)에:
```tsx
  const [phoneProofToken, setPhoneProofToken] = useState<string | null>(null);
```
  phone이 바뀌면 인증 무효화: `setPhoneDigits` 하는 `onChange`(L550)에 `setPhoneProofToken(null);` 추가.

- [ ] **Step 2: 프로필 스텝에 카드 삽입** — 휴대폰 입력 `<label>`(L545-555) 바로 아래에, `phoneDigits.length === 11 && !phoneProofToken`일 때 `<PhoneVerificationCard mode="public" phone={phoneDigits} onVerified={(t) => setPhoneProofToken(t ?? null)} />` 렌더. 인증 완료(`phoneProofToken`)면 "인증 완료" 배지(파란 점+텍스트) 표시.

- [ ] **Step 3: 제출 게이트 + payload** — `submitAccount`(L205)에서 프로필 완성 체크 다음에:
```tsx
    if (!phoneProofToken) {
      setProfileError('휴대폰 본인인증을 완료해 주세요.');
      return;
    }
```
  `register.mutateAsync({...})`(L227) payload에 `phoneProofToken,` 추가. 백엔드 `PHONE_NOT_VERIFIED`(400) catch 분기 추가 → `setProfileError('휴대폰 본인인증을 완료해 주세요.'); setPhoneProofToken(null);`.

- [ ] **Step 4: 테스트** — 미인증 시 제출 차단(프로필 에러 노출·register 미호출), 인증 후 payload에 proofToken 포함을 검증하는 최소 계약 테스트. `pnpm test signup-client` PASS.
- [ ] **Step 5: 커밋** — `feat(v1/web): 이메일 회원가입 휴대폰 본인인증 게이트`

---

## Task 11: 카카오 소셜 가입 통합 (hard-block)

**Files:**
- Modify: `apps/v1_web/src/components/auth/social-signup-client.tsx`
- Test: `social-signup-client.test.tsx`(계약만)

- [ ] **Step 1: 인증 state** — `phoneVerified` boolean state 추가, phone 변경(L232 onChange) 시 `setPhoneVerified(false)`.
- [ ] **Step 2: 카드 삽입(authed)** — 휴대폰 입력(L227-237) 아래 `phoneDigits.length === 11 && !phoneVerified`일 때 `<PhoneVerificationCard mode="authed" phone={phoneDigits} onVerified={() => setPhoneVerified(true)} />`. (authed 모드는 confirm 성공 시 서버가 `phoneVerifiedAt` 세팅 → completeSocialProfile 게이트 통과.)
- [ ] **Step 3: 제출 게이트** — `submit`(L69)의 프로필 완성 체크 뒤에 `if (!phoneVerified) { setError('휴대폰 본인인증을 완료해 주세요.'); return; }`. `PHONE_NOT_VERIFIED` onError 분기 추가.
- [ ] **Step 4: 테스트** — 미인증 시 completeProfile 미호출. PASS.
- [ ] **Step 5: 커밋** — `feat(v1/web): 카카오 가입 휴대폰 본인인증 게이트`

---

## Task 12: 레거시 미인증 홈 배너 + 프로필 인증 진입

**Files:**
- Modify: `apps/v1_web/src/lib/session-storage.ts` (dismiss 헬퍼)
- Modify: `apps/v1_web/src/components/home/home.types.ts` (`phoneVerifyNudge` 필드)
- Modify: `apps/v1_web/src/components/home/home-client.tsx` (`useV1AuthMe` → 조건 조립)
- Modify: `apps/v1_web/src/components/home/home-page.tsx` (배너 렌더 + `PhoneVerifyBanner` 함수)
- Modify: 프로필 페이지(실행 시 `apps/v1_web/src/app/my` 또는 `/settings` 계열에서 locate) — 미인증 시 `PhoneVerificationCard mode="authed"` 진입
- Test: `home-page.test.tsx`(배너 노출/비노출 계약)

**Interfaces:**
- Consumes: `useV1AuthMe().data.verification.phoneVerified`(Task 8 타입), `PhoneVerificationCard`(Task 9), `PushNudgeBanner` 패턴(홈).

- [ ] **Step 1: session-storage 헬퍼** — `shouldShowPushNudge`/`dismissPushNudge` 패턴 복제:
```typescript
export const V1_PHONE_VERIFY_NUDGE_DISMISSED_KEY = 'teameet.v1.phoneVerifyNudgeDismissed';

export function shouldShowPhoneVerifyNudge() {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(V1_PHONE_VERIFY_NUDGE_DISMISSED_KEY) !== 'true';
}

export function dismissPhoneVerifyNudge() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(V1_PHONE_VERIFY_NUDGE_DISMISSED_KEY, 'true');
}
```
  (sessionStorage → 재로그인/재진입 시 재노출, 요구사항 충족.)

- [ ] **Step 2: home.types.ts** — `pushNudge?` 옆에 추가:
```typescript
  phoneVerifyNudge?: {
    onVerify: () => void;
    onDismiss: () => void;
  };
```

- [ ] **Step 3: home-client.tsx 조건 조립** — `useV1AuthMe()` 추가 호출, `pushNudge` 조립부 근처에:
```tsx
  const authMe = useV1AuthMe({ enabled: isAuthenticated });
  const [phoneNudgeDismissed, setPhoneNudgeDismissed] = useState(true);
  useEffect(() => { setPhoneNudgeDismissed(!shouldShowPhoneVerifyNudge()); }, []);
  const showPhoneVerifyNudge =
    isAuthenticated &&
    authMe.data?.verification?.phoneVerified === false &&
    !phoneNudgeDismissed;
  const phoneVerifyNudge = showPhoneVerifyNudge
    ? {
        onVerify: () => router.push('/my/phone-verify'),
        onDismiss: () => { dismissPhoneVerifyNudge(); setPhoneNudgeDismissed(true); },
      }
    : undefined;
```
  (`router`는 `useRouter()` — home-client에 없으면 추가. 이 필드를 `HomePageView`의 `model`에 전달.)

- [ ] **Step 4: home-page.tsx 배너** — `{model.pushNudge ? <PushNudgeBanner .../> : null}`(L52) 다음 줄에:
```tsx
          {model.phoneVerifyNudge ? <PhoneVerifyBanner phoneVerifyNudge={model.phoneVerifyNudge} /> : null}
```
  `PushNudgeBanner`(L331-374)를 복제한 `PhoneVerifyBanner` 함수 추가 — orange 톤(`var(--orange-soft)`/`var(--orange500)`), 아이콘(ShieldIcon 등), 문구 "휴대폰 본인인증이 필요해요"/"안전한 이용을 위해 번호를 인증해 주세요.", CTA "인증하기"(`onVerify`), 닫기(`onDismiss`, 44px, aria-label). 컬러+아이콘+텍스트 병행.

- [ ] **Step 5: 프로필 인증 진입** — 실행 시 프로필/설정 페이지를 locate(`rg "my/" apps/v1_web/src/app` 또는 프로필 client). 미인증(`verification.phoneVerified===false`) 시 `PhoneVerificationCard mode="authed"` 섹션을 노출하는 route(`/my/phone-verify` 신규 페이지 또는 기존 프로필 내 섹션). 홈 배너 CTA가 이 진입으로 연결. 인증 완료 시 `['authMe']` invalidate로 배너 자동 소멸.

- [ ] **Step 6: 테스트** — `phoneVerified===false`+미dismiss → 배너 노출, `true` → 미노출, dismiss 후 미노출. PASS.
- [ ] **Step 7: 커밋** — `feat(v1/web): 레거시 미인증 홈 배너 + 프로필 인증 진입`

---

## Task 13: 회원가입 UI/UX 개선 (프로덕션 fidelity)

**Files:** signup-client.tsx / social-signup-client.tsx / phone-verification-card.tsx / globals.css(신규 클래스 필요 시)

- [ ] **Step 1: lazyweb 레퍼런스** — `lazyweb_search`("phone verification signup mobile") 즉시 조회로 실제 레퍼런스 확인, 이어 `lazyweb_generate_report`로 현행 signup 스크린샷 + 목표(휴대폰 인증 단계 자연스럽게 통합) 리포트. (Task 14의 라이브 캡처 이미지 활용.)
- [ ] **Step 2: 목업 A·B·C + 추천** — 인증 카드 배치(인라인 스텝 vs 별도 스텝 vs 모달) 3안 + 추천을 실제 디자인 토큰으로. 사용자 확인(AskUserQuestion).
- [ ] **Step 3: 적용** — 확정안대로 카드/스텝 시각 폴리시(간격·정렬·강조·모션 절제). light-only·토큰·44px 유지.
- [ ] **Step 4: 커밋** — `style(v1/web): 회원가입 휴대폰 인증 UI 폴리시`

---

## Task 14: 라이브 시각검증 + 통합 게이트 + PR

**Files:** (없음 — 검증·PR)

- [ ] **Step 1: host 상태 확인** — `uptime`/메모리/Node·브라우저 프로세스 수 확인(규칙 25). load가 코어 수 초과·swap 압박이면 직렬·최소 worker로.
- [ ] **Step 2: v1 스택 기동** — 프로젝트 런북(`docs/ops/pr-review-visual-workflow.md`)대로 DB(`teameet_v1_pg`) + `apps/v1_api`(8121, `V1_VERIFICATION_DEV_ECHO=true`로 옥토모 없이) + `apps/v1_web`(3013). 기존 떠 있는 프로세스 재사용(lsof 확인).
- [ ] **Step 3: 라이브 캡처** — Playwright(`scripts/` 내부 스크립트, 헤더 dev 인증)로 회원가입(이메일·카카오)·홈 배너를 mobile 390/tablet 768/desktop 1440 캡처. before/after 갤러리.
- [ ] **Step 4: 시각 검증** — 인증 카드 정렬·균형·기기별 뷰(딥링크/QR)·배너 톤·다크 아님(light-only) 확인. 문제 시 수정 후 재캡처(grounding loop).
- [ ] **Step 5: 통합 게이트** — `cd apps/v1_api && pnpm test`(백엔드), `cd apps/v1_web && pnpm test`(프론트), 양쪽 `tsc --noEmit`, 마이그레이션 replay(빈 DB `prisma migrate deploy` + `migrate status` drift 0). 전부 green.
- [ ] **Step 6: 임시 프로세스 정리** — Step 2에서 띄운 서버가 신규면 PID로 `kill`, 포트 기준선 복귀 확인(규칙 26).
- [ ] **Step 7: push + PR(base=dev)** — `git push -u origin feat/v1-octomo-phone-verification` 후 `gh pr create --base dev`(제목·본문 **한국어**). 본문에 요약·SSM 안내(`OCTOMO_API_KEY` GitHub Secret 등록 필요)·before/after 스크린샷·테스트 결과 inline. Copilot 리뷰 요청(`gh pr edit <N> --add-reviewer copilot-pull-request-reviewer`) → clean까지 루프.
- [ ] **Step 8: 사용자 보고** — SSM(=GitHub Actions Secret `OCTOMO_API_KEY`) 등록 안내 + PR 링크 + 검증 산출물 inline.

---

## Self-Review

- **Spec 커버리지**: v1/alpha 대상(T1-14) / MO 방식(T1,4) / 모바일 딥링크·데스크탑 QR(T8,9) / 키 서버전용(T1,7) / 이메일·카카오 hard-block(T5,6,10,11) / 레거시 미인증 뱃지(T12) / UI/UX 개선(T13) / 라이브 검증(T14) / 마이그레이션 동반(T3) — 스펙 조건 전부 태스크 존재. ✓
- **Placeholder 스캔**: Task 9 Step 3 골격의 `TODO(this task)`는 "구현 시 실제 JSX 완성"을 명시한 실행 지시(주석 마커)이며, 상단에 실제 동작 골격 코드·마크업 규칙을 모두 제공 — 순수 placeholder 아님. Task 12 Step 5의 "locate"는 실제 grep 절차. ✓
- **타입 정합성**: `issueChallenge`/`pollArrived`/`issueProof`(T4) 시그니처가 T5·T6·T9 소비처와 일치. 훅 반환형(`{ code, destNumber, qrCode?, expiresAt }`, `{ verified, proofToken? }`)이 T8·T9 일치. `V1AuthMe.verification`(T8) ↔ 홈 배너(T12) 일치. `phoneProofToken`(T5 DTO ↔ T8 payload ↔ T10) 일치. ✓
- **회귀 안전**: `enabled=false`(옥토모 키·devEcho 모두 없음) 환경에선 register/social-profile 게이트 skip → 기존 가입 동작 보존. email 인증 로직 불변. ✓
