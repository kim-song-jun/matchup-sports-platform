# 휴대폰 인증 MT SMS OTP 전환 (솔라피) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 옥토모 무료 MO(polling) 휴대폰 본인인증을 솔라피(SOLAPI) MT SMS OTP(서버 발송 → 사용자 입력)로 전환하고 옥토모 코드를 완전 제거한다.

**Architecture:** 이메일 인증이 이미 쓰는 MT 기계(`VerificationService.issue`/`confirm` + `V1VerificationToken`)를 phone 채널에 되돌려 authed 경로를 전환하고, public(pre-account) 경로는 `V1PhoneVerificationChallenge`를 codeHash 스키마로 재정의해 코드 대조로 바꾼다. 실제 SMS 발송은 `SmsSender` 인터페이스 뒤로 추상화하고 `SolapiSmsSender`(HMAC-SHA256) 어댑터를 끼운다. 키 미설정 시 dev-echo(응답 devCode)로 개발/검증한다.

**Tech Stack:** NestJS 11 + Prisma 6 (PostgreSQL) / Next.js 16 + React 19 + TanStack Query / Jest(api) + Vitest(web) / 솔라피 REST(`/messages/v4/send`).

## Global Constraints

- **대상 스택:** v1 전용 (`apps/v1_api`, `apps/v1_web`). 구앱(`apps/api`,`apps/web`)은 건드리지 않는다.
- **배포 = dev push 자동 alpha 배포.** dev 머지 전 tsc·타깃 테스트·lint를 프로덕션 게이트로 취급. main 승격 금지.
- **DB 마이그레이션 규율:** 스키마 변경은 반드시 migration 파일 동반. CI "V1 migration replay + drift gate"(빈 DB 전체 체인 재생 + `schema.prisma` 드리프트 0) 통과 필수.
- **v1 changeset 게이트:** v1_api/v1_web 변경 PR엔 `.changeset/*.md` 필수(없으면 dev-push CI 실패 + alpha 배포 차단).
- **시크릿:** SOLAPI_API_KEY/API_SECRET/SENDER_NUMBER는 서버 전용, `NEXT_PUBLIC_*` 금지. 코드에 하드코딩 금지.
- **에러 어조:** 사용자 노출 메시지는 해요체(`~했어요`/`~해 주세요`). 에러코드는 `DOMAIN_CODE` 형태.
- **OTP 규격:** 6자리 숫자(`ConfirmVerificationDto` `@Length(6,6)`와 정합, email 경로와 동일 `randomInt(0,1_000_000).padStart(6,'0')`). codeHash는 bcrypt(`hashPassword`), 평문 저장 금지. TTL 5분, 시도 5회.
- **발송 실패 = 사용자 알림**(silent fire-and-forget 아님): SMS 발송 실패 시 명확한 에러 반환.
- **설계 근거:** `docs/superpowers/specs/2026-07-25-mt-sms-otp-solapi-design.md`.

---

## File Structure

**신규(백엔드):**
- `apps/v1_api/src/verification/sms/sms-sender.ts` — `SmsSender` 인터페이스 + `SMS_SENDER` DI 토큰 + `buildOtpSmsText(code)`.
- `apps/v1_api/src/verification/sms/solapi-sms-sender.ts` — `SolapiSmsSender implements SmsSender` (HMAC-SHA256, `POST /messages/v4/send`).
- `apps/v1_api/src/verification/sms/solapi-sms-sender.spec.ts` — 어댑터 유닛 테스트.

**신규(마이그레이션):**
- `apps/v1_api/prisma/migrations/<ts>_v1_phone_challenge_mt/migration.sql`.

**신규(문서):**
- `docs/ops/solapi-setup.md` (octomo-setup.md 대체).

**편집(백엔드):**
- `verification-dispatcher.service.ts` — `SMS_SENDER` 주입, `send` async, phone→SMS.
- `phone-verification.service.ts` — 옥토모 제거, MT 챌린지(codeHash+코드대조)로 재작성.
- `verification.service.ts` — `requestPhone`→`issue('phone')`, `confirmPhoneArrived` 제거, `PhoneVerificationService` 의존 제거, `issue()` await 발송.
- `verification.controller.ts` — `phone/request`(phone-only), `phone/confirm`(code).
- `verification/dto/verification.dto.ts` — `RequestPhoneVerificationDto` channel 제거, `ConfirmPhoneArrivedDto` 삭제.
- `verification.module.ts` — `OctomoClient` 제거, `SMS_SENDER` provider 추가.
- `auth/phone-verification-public.controller.ts` — `verify`가 code 대조 + proofToken.
- `auth/dto/phone-verification.dto.ts` — `PhoneIssueDto` channel 제거, `PhoneVerifyDto` code 추가.
- `prisma/schema.prisma` — `V1PhoneVerificationChallenge` codeHash 재정의.

**편집(테스트):**
- `phone-verification.service.spec.ts`(재작성), `verification.service.spec.ts`, `phone-verification-public.controller.spec.ts`, `test/integration/phone-verification.e2e-spec.ts`.

**편집(프론트):**
- `phone-verification-card.tsx`(재작성 → OTP UX), `phone-verification-card.test.tsx`(재작성), `hooks/use-v1-api.ts`(4개 훅 body/response).

**삭제:**
- `verification/octomo.client.ts` + `octomo.client.spec.ts`
- `web/src/lib/octomo-sms-link.ts` + `octomo-sms-link.test.ts`
- `web/src/lib/device-kind.ts`
- `docs/ops/octomo-setup.md`

**편집(config/deploy):**
- `deploy/.env.prod.example`, `deploy/docker-compose.prod.yml`, `.github/workflows/deploy-alpha.yml`.

**변경 없음(계약 안정):** `phone-proof-token.ts`(+spec), `auth.service.ts`, `auth/auth.module.ts`, `social-signup-access.ts`, signup-client.tsx, social-signup-client.tsx, phone-verify-page-client.tsx, my/phone-verify/page.tsx, home-client.tsx, api-client.ts.

---

## Phase 1 — SMS 발송 어댑터 스켈레톤 (순수 추가, 동작 변화 없음)

### Task 1.1: SmsSender 인터페이스 + 토큰 + 본문 빌더

**Files:** Create `apps/v1_api/src/verification/sms/sms-sender.ts`

**Interfaces (Produces):** `SmsSender { enabled: boolean; send(to,text): Promise<void> }`, `SMS_SENDER` 토큰, `buildOtpSmsText(code): string`.

- [ ] **Step 1: 파일 작성**

```ts
export const SMS_SENDER = Symbol('SMS_SENDER');

export interface SmsSender {
  /** 필수 시크릿이 모두 있으면 true. false면 dev-echo 폴백. */
  readonly enabled: boolean;
  /** 실패 시 throw — 발송 실패는 사용자에게 알려야 하므로 흡수하지 않는다. */
  send(to: string, text: string): Promise<void>;
}

/** iOS SMS 자동완성 고려: '인증번호' + 6자리 코드가 본문에 또렷이 노출되도록 구성. */
export function buildOtpSmsText(code: string): string {
  return `[Teameet] 인증번호 ${code}\n5분 안에 입력해 주세요.`;
}
```

- [ ] **Step 2: 커밋** — `git add apps/v1_api/src/verification/sms/sms-sender.ts && git commit -m "feat(v1/api): SMS 발송 어댑터 인터페이스·토큰·본문 빌더"`

### Task 1.2: SolapiSmsSender 어댑터 (TDD)

**Files:** Create `apps/v1_api/src/verification/sms/solapi-sms-sender.ts`, Test `.../solapi-sms-sender.spec.ts`

**Interfaces (Consumes):** `SmsSender`, `SMS_SENDER` from Task 1.1.

- [ ] **Step 1: 실패 테스트 작성** (`solapi-sms-sender.spec.ts`)

```ts
import { SolapiSmsSender } from './solapi-sms-sender';

describe('SolapiSmsSender', () => {
  const OLD = process.env;
  beforeEach(() => { process.env = { ...OLD }; });
  afterAll(() => { process.env = OLD; });

  it('3개 시크릿이 모두 있어야 enabled', () => {
    process.env.SOLAPI_API_KEY = 'k';
    process.env.SOLAPI_API_SECRET = 's';
    process.env.SOLAPI_SENDER_NUMBER = '01000000000';
    expect(new SolapiSmsSender().enabled).toBe(true);
    delete process.env.SOLAPI_API_SECRET;
    expect(new SolapiSmsSender().enabled).toBe(false);
  });

  it('send는 solapi /messages/v4/send로 from/to/text를 POST하고 HMAC-SHA256 Authorization을 붙인다', async () => {
    process.env.SOLAPI_API_KEY = 'key1';
    process.env.SOLAPI_API_SECRET = 'secret1';
    process.env.SOLAPI_SENDER_NUMBER = '01011112222';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ groupId: 'G1' }), text: async () => '' });
    global.fetch = fetchMock as unknown as typeof fetch;

    await new SolapiSmsSender().send('01033334444', '[Teameet] 인증번호 123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.solapi.com/messages/v4/send');
    expect(init.method).toBe('POST');
    const auth = init.headers['Authorization'] as string;
    expect(auth).toMatch(/^HMAC-SHA256 apiKey=key1, date=.+, salt=.+, signature=[0-9a-f]{64}$/);
    const body = JSON.parse(init.body);
    expect(body.message).toEqual({ to: '01033334444', from: '01011112222', text: '[Teameet] 인증번호 123456' });
  });

  it('비2xx 응답이면 throw (발송 실패는 흡수하지 않음)', async () => {
    process.env.SOLAPI_API_KEY = 'k'; process.env.SOLAPI_API_SECRET = 's'; process.env.SOLAPI_SENDER_NUMBER = '01000000000';
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}), text: async () => 'bad number' }) as unknown as typeof fetch;
    await expect(new SolapiSmsSender().send('01033334444', 't')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 실패 확인** — `pnpm --filter v1_api test -- solapi-sms-sender` → FAIL(모듈 없음).

- [ ] **Step 3: 구현** (`solapi-sms-sender.ts`)

```ts
import { Injectable, Logger } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import type { SmsSender } from './sms-sender';

const SOLAPI_SEND_URL = 'https://api.solapi.com/messages/v4/send';

@Injectable()
export class SolapiSmsSender implements SmsSender {
  private readonly logger = new Logger(SolapiSmsSender.name);

  private get apiKey() { return process.env.SOLAPI_API_KEY ?? ''; }
  private get apiSecret() { return process.env.SOLAPI_API_SECRET ?? ''; }
  private get sender() { return process.env.SOLAPI_SENDER_NUMBER ?? ''; }

  get enabled(): boolean {
    return this.apiKey.length > 0 && this.apiSecret.length > 0 && this.sender.length > 0;
  }

  private authorization(): string {
    const date = new Date().toISOString();
    const salt = randomBytes(32).toString('hex');
    const signature = createHmac('sha256', this.apiSecret).update(date + salt).digest('hex');
    return `HMAC-SHA256 apiKey=${this.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  }

  async send(to: string, text: string): Promise<void> {
    const res = await fetch(SOLAPI_SEND_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: this.authorization() },
      body: JSON.stringify({ message: { to, from: this.sender, text } }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`solapi send failed: ${res.status} ${body.slice(0, 200)}`);
      throw new Error(`Solapi send failed: ${res.status}`);
    }
  }
}
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter v1_api test -- solapi-sms-sender` → PASS.
- [ ] **Step 5: 커밋** — `git add apps/v1_api/src/verification/sms/ && git commit -m "feat(v1/api): 솔라피 SMS 발송 어댑터(HMAC-SHA256) + 유닛테스트"`

### Task 1.3: Dispatcher에 SMS 배선 + 모듈 provider

**Files:** Modify `verification-dispatcher.service.ts`, `verification.module.ts`

**Interfaces:** dispatcher.`send`가 async가 됨(호출자 await 필요 — Task 2.x에서 반영).

- [ ] **Step 1: dispatcher 수정** — 전체 교체

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { V1VerificationChannel } from '@prisma/client';
import { SMS_SENDER, SmsSender, buildOtpSmsText } from './sms/sms-sender';

@Injectable()
export class VerificationDispatcherService {
  private readonly logger = new Logger(VerificationDispatcherService.name);
  readonly devEcho = process.env.V1_VERIFICATION_DEV_ECHO === 'true';

  constructor(@Inject(SMS_SENDER) private readonly sms: SmsSender) {}

  async send(channel: V1VerificationChannel, target: string, code: string): Promise<void> {
    const masked = target.length > 4 ? `${target.slice(0, 2)}***${target.slice(-2)}` : '***';
    if (channel === 'phone' && this.sms.enabled) {
      await this.sms.send(target, buildOtpSmsText(code));
      this.logger.log(`[verification:phone] SMS 발송 완료 → ${masked}`);
      return;
    }
    // provider 미설정(email 로그 스텁 포함): dev-echo 로만 코드 노출
    this.logger.log(
      `[verification:${channel}] dispatched code to ${masked}${this.devEcho ? ` (dev code=${code})` : ''}`,
    );
  }
}
```

- [ ] **Step 2: 모듈 provider 등록** (`verification.module.ts`) — `OctomoClient` 제거는 Phase 2에서 함께. 이 단계에선 `SMS_SENDER` provider만 추가:

```ts
import { SMS_SENDER } from './sms/sms-sender';
import { SolapiSmsSender } from './sms/solapi-sms-sender';
// providers 배열에 추가:
{ provide: SMS_SENDER, useClass: SolapiSmsSender },
```

- [ ] **Step 3: 기존 dispatcher 스펙 있으면 갱신 / 없으면 최소 라우팅 테스트 추가** — dispatcher를 mock SmsSender로 인스턴스화해 phone→sms.send 호출, email→로그만 검증(있으면).
- [ ] **Step 4: 빌드 확인** — `pnpm --filter v1_api exec tsc --noEmit` (Phase 1 시점엔 `send` 호출부가 여전히 sync 기대일 수 있으니, 이 단계는 Phase 2와 연속 커밋으로 처리 가능). 
- [ ] **Step 5: 커밋** — `git add ... && git commit -m "feat(v1/api): dispatcher phone 채널 SMS 발송 배선 + SMS_SENDER provider"`

---

## Phase 2 — 백엔드 phone MT 전환 (authed + public) + Prisma

### Task 2.1: Prisma — V1PhoneVerificationChallenge codeHash 재정의 + 마이그레이션

**Files:** Modify `apps/v1_api/prisma/schema.prisma:422-434`, Create migration

- [ ] **Step 1: 스키마 수정** — 모델을 아래로 교체

```prisma
model V1PhoneVerificationChallenge {
  id           String    @id @default(uuid())
  phone        String    @unique
  codeHash     String    @map("code_hash")
  expiresAt    DateTime  @map("expires_at")
  attemptCount Int       @default(0) @map("attempt_count")
  verifiedAt   DateTime? @map("verified_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@map("v1_phone_verification_challenges")
}
```

- [ ] **Step 2: 마이그레이션 생성** — `pnpm --filter v1_api exec prisma migrate dev --name v1_phone_challenge_mt --create-only` 로 파일만 생성. 생성된 SQL이 아래 의미인지 확인/보정(ephemeral 테이블이라 기존 row 제거 후 컬럼 교체):

```sql
DELETE FROM "v1_phone_verification_challenges";
ALTER TABLE "v1_phone_verification_challenges" DROP COLUMN "code";
ALTER TABLE "v1_phone_verification_challenges" DROP COLUMN "channel";
ALTER TABLE "v1_phone_verification_challenges" ADD COLUMN "code_hash" TEXT NOT NULL;
```

- [ ] **Step 3: dev 반영** — `pnpm --filter v1_api exec prisma migrate dev` (또는 `migrate deploy`). Prisma Client 재생성 확인.
- [ ] **Step 4: 드리프트 0 확인** — `pnpm --filter v1_api exec prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations --exit-code` 로 드리프트 없음 확인.
- [ ] **Step 5: 커밋** — `git add apps/v1_api/prisma/schema.prisma apps/v1_api/prisma/migrations && git commit -m "feat(v1/api): 휴대폰 인증 챌린지 codeHash 스키마 재정의 + 마이그레이션"`

### Task 2.2: PhoneVerificationService MT 재작성 (public 경로) — TDD

**Files:** Modify `phone-verification.service.ts`, Test `phone-verification.service.spec.ts`(재작성)

**Interfaces (Produces):** `issueChallenge(phone): Promise<{ expiresAt: string; devCode?: string }>`, `verifyCode(phone, code): Promise<boolean>`, `issueProof(phone): string`. (옥토모 `pollArrived`/`generateCode`/`enabled`/`destNumber`/QR 제거.)
**Interfaces (Consumes):** `VerificationDispatcherService.send`(Task 1.3), `V1PhoneVerificationChallenge.codeHash`(Task 2.1), `hashPassword`/`verifyPassword`, `issuePhoneProofToken`.

- [ ] **Step 1: 스펙 재작성** — 옥토모 mock 전부 제거. dispatcher를 `{ send: jest.fn(), devEcho: false }` mock으로. 시나리오: (a) issueChallenge가 challenge upsert + dispatcher.send('phone',phone,code) 호출, (b) verifyCode 정상 코드 → true + verifiedAt 세팅, (c) 잘못된 코드 → `VERIFICATION_CODE_MISMATCH` throw + attemptCount 증가, (d) 만료 → `VERIFICATION_NO_PENDING`, (e) 5회 초과 → `VERIFICATION_TOO_MANY_ATTEMPTS`, (f) 이미 verified → true(멱등). Prisma는 in-spec mock. dispatcher.send가 code를 그대로 전달받는지 검증.

- [ ] **Step 2: 실패 확인** — `pnpm --filter v1_api test -- phone-verification.service` → FAIL.

- [ ] **Step 3: 구현** — 파일 전체 교체

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword, verifyPassword } from '../auth/password-hash';
import { issuePhoneProofToken } from './phone-proof-token';
import { VerificationDispatcherService } from './verification-dispatcher.service';

const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatcher: VerificationDispatcherService,
  ) {}

  async issueChallenge(phone: string): Promise<{ expiresAt: string; devCode?: string }> {
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await this.prisma.v1PhoneVerificationChallenge.upsert({
      where: { phone },
      update: { codeHash, expiresAt, attemptCount: 0, verifiedAt: null },
      create: { phone, codeHash, expiresAt },
    });
    await this.dispatcher.send('phone', phone, code);
    return { expiresAt: expiresAt.toISOString(), ...(this.dispatcher.devEcho ? { devCode: code } : {}) };
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    const challenge = await this.prisma.v1PhoneVerificationChallenge.findUnique({ where: { phone } });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ code: 'VERIFICATION_NO_PENDING', message: '유효한 인증 요청이 없어요. 인증번호를 다시 받아 주세요.' });
    }
    if (challenge.verifiedAt) return true;
    if (challenge.attemptCount >= MAX_ATTEMPTS) {
      throw new BadRequestException({ code: 'VERIFICATION_TOO_MANY_ATTEMPTS', message: '시도 횟수를 초과했어요. 인증번호를 다시 받아 주세요.' });
    }
    await this.prisma.v1PhoneVerificationChallenge.update({ where: { phone }, data: { attemptCount: { increment: 1 } } });
    const matches = await verifyPassword(code, challenge.codeHash);
    if (!matches) {
      throw new BadRequestException({ code: 'VERIFICATION_CODE_MISMATCH', message: '인증번호가 올바르지 않아요.' });
    }
    await this.prisma.v1PhoneVerificationChallenge.update({ where: { phone }, data: { verifiedAt: new Date() } });
    return true;
  }

  issueProof(phone: string): string {
    return issuePhoneProofToken(phone);
  }
}
```

- [ ] **Step 4: 통과 확인** — `pnpm --filter v1_api test -- phone-verification.service` → PASS.
- [ ] **Step 5: 커밋** — `git commit -m "feat(v1/api): public 휴대폰 인증을 MT(codeHash 코드대조)로 재작성"`

### Task 2.3: public 컨트롤러 + DTO (code 입력) — TDD

**Files:** Modify `auth/phone-verification-public.controller.ts`, `auth/dto/phone-verification.dto.ts`, spec

- [ ] **Step 1: DTO 수정**

```ts
import { IsString, Length, Matches } from 'class-validator';

export class PhoneIssueDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;
}

export class PhoneVerifyDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: '휴대폰 번호는 숫자 11자리예요.' })
  phone!: string;

  @IsString()
  @Length(6, 6, { message: '인증번호는 6자리예요.' })
  code!: string;
}
```

- [ ] **Step 2: 컨트롤러 수정**

```ts
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
    return this.phoneVerification.issueChallenge(dto.phone);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verify(@Body() dto: PhoneVerifyDto) {
    await this.phoneVerification.verifyCode(dto.phone, dto.code);
    return { verified: true, proofToken: this.phoneVerification.issueProof(dto.phone) };
  }
}
```

- [ ] **Step 3: 스펙 갱신** — `verify`가 `verifyCode(phone, code)` 위임 + proofToken 반환, issue가 `issueChallenge(phone)` 위임 검증.
- [ ] **Step 4: 통과 확인** — `pnpm --filter v1_api test -- phone-verification-public.controller`.
- [ ] **Step 5: 커밋** — `git commit -m "feat(v1/api): public /auth/phone/verify 코드 입력 방식으로 전환"`

### Task 2.4: authed VerificationService/Controller/DTO 전환 — TDD

**Files:** Modify `verification.service.ts`, `verification.controller.ts`, `verification/dto/verification.dto.ts`, `verification.service.spec.ts`

- [ ] **Step 1: DTO 수정** — `RequestPhoneVerificationDto`는 phone만, `ConfirmPhoneArrivedDto` 삭제, `ConfirmVerificationDto` 유지.

```ts
import { IsString, Length, Matches } from 'class-validator';

export class RequestPhoneVerificationDto {
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

- [ ] **Step 2: VerificationService 수정** — 생성자에서 `phoneVerification: PhoneVerificationService` 제거. `requestPhone(authUser, phone)` 시그니처(채널 제거), 마지막 줄 `return this.phoneVerification.issueChallenge(...)` → `return this.issue('phone', user.id, phone)`. `confirmPhoneArrived` 메서드 삭제. `issue()`의 `this.dispatcher.send(...)` → `await this.dispatcher.send(...)`(발송 실패 전파). import에서 `PhoneVerificationService` 제거.

- [ ] **Step 3: Controller 수정**

```ts
import { ConfirmVerificationDto, RequestPhoneVerificationDto } from './dto/verification.dto';
// ...
@Post('phone/request')
@HttpCode(200)
requestPhone(@CurrentUser() user: V1AuthUser, @Body() dto: RequestPhoneVerificationDto) {
  return this.verificationService.requestPhone(user, dto.phone);
}

@Post('phone/confirm')
@HttpCode(200)
confirmPhone(@CurrentUser() user: V1AuthUser, @Body() dto: ConfirmVerificationDto) {
  return this.verificationService.confirm(user, 'phone', dto.code);
}
```

- [ ] **Step 4: 스펙 갱신** — `verification.service.spec.ts`에서 `phoneVerification` mock 제거, `requestPhone`이 `dispatcher.send('phone',...)` 경유 토큰 발급하는지, `confirm(user,'phone',code)`가 phoneVerifiedAt 세팅하는지 검증. dispatcher는 `{ send: jest.fn(), devEcho:false }` mock.
- [ ] **Step 5: 통과 확인** — `pnpm --filter v1_api test -- verification.service`.
- [ ] **Step 6: 커밋** — `git commit -m "feat(v1/api): authed 휴대폰 인증을 MT(issue/confirm) 재활용으로 전환"`

### Task 2.5: 모듈에서 옥토모 제거 + 옥토모 파일 삭제

**Files:** Modify `verification.module.ts`; Delete `octomo.client.ts`, `octomo.client.spec.ts`

- [ ] **Step 1: 모듈 수정** — providers/exports에서 `OctomoClient` 제거. providers 최종: `[VerificationService, VerificationDispatcherService, { provide: SMS_SENDER, useClass: SolapiSmsSender }, PhoneVerificationService, V1AuthGuard]`, exports: `[PhoneVerificationService]`. `OctomoClient` import 제거.
- [ ] **Step 2: 파일 삭제** — `git rm apps/v1_api/src/verification/octomo.client.ts apps/v1_api/src/verification/octomo.client.spec.ts`
- [ ] **Step 3: 참조 0 확인** — `grep -rn -i octomo apps/v1_api/src` → 0건.
- [ ] **Step 4: 빌드+타깃 테스트** — `pnpm --filter v1_api exec tsc --noEmit` + `pnpm --filter v1_api test -- verification`.
- [ ] **Step 5: 커밋** — `git commit -m "refactor(v1/api): 옥토모 클라이언트·provider 완전 제거"`

### Task 2.6: 통합 e2e 스펙 MT 전환

**Files:** Modify `test/integration/phone-verification.e2e-spec.ts`

- [ ] **Step 1: 수정** — `V1_VERIFICATION_DEV_ECHO='true'`로 devCode 사용. `destNumber` assertion(16663538) 제거. `/auth/phone/issue`(body `{phone}`) → 응답 `{expiresAt, devCode}`, `/auth/phone/verify`(body `{phone, code: devCode}`) → `{verified:true, proofToken}` + `verifyPhoneProofToken(token, phone)` 검증. 만료·오코드·미존재 시나리오 유지·보정. 8자 코드 정규식 → 6자리 숫자.
- [ ] **Step 2: 통과 확인** — `DISABLE_MARKETPLACE_CRON=true pnpm --filter v1_api test:integration -- phone-verification`.
- [ ] **Step 3: 커밋** — `git commit -m "test(v1/api): 휴대폰 인증 통합테스트 MT OTP로 전환"`

---

## Phase 3 — 프론트 OTP UX

### Task 3.1: API 훅 수정

**Files:** Modify `apps/v1_web/src/hooks/use-v1-api.ts:276-300`

- [ ] **Step 1: 4개 훅 body/response 조정**
  - `useV1PhoneIssue`: `v1Post('/auth/phone/issue', { phone })` → `{ expiresAt: string; devCode?: string }`.
  - `useV1PhoneVerify`: `v1Post('/auth/phone/verify', { phone, code })` → `{ verified: boolean; proofToken?: string }`.
  - `useV1AuthedPhoneRequest`: `v1Post('/verification/phone/request', { phone })` → `{ sent: boolean; channel: 'phone'; target?: string; alreadyVerified?: boolean; devCode?: string }`.
  - `useV1AuthedPhoneConfirm`: `v1Post('/verification/phone/confirm', { code })` → `{ verified: boolean; verification: {...} }`, 성공 시 기존 authMe invalidate 유지.
- [ ] **Step 2: 타입/빌드 확인** — `pnpm --filter v1_web exec tsc --noEmit`(카드 수정 전이라 카드 타입 오류는 Task 3.2에서 해소, 훅 단독 시그니처만 확인).
- [ ] **Step 3: 커밋** — `git commit -m "feat(v1/web): 휴대폰 인증 훅을 MT(코드 입력) 계약으로 조정"`

### Task 3.2: PhoneVerificationCard OTP UX 재작성 — TDD

**Files:** Modify `phone-verification-card.tsx`(재작성), `phone-verification-card.test.tsx`(재작성); Delete `lib/octomo-sms-link.ts`(+test), `lib/device-kind.ts`

**Interfaces (계약 유지):** `PhoneVerificationCard({ mode: 'public'|'authed'; phone: string; onVerified: (proofToken?: string) => void })`.

- [ ] **Step 1: 테스트 재작성** — 시나리오: (a) "인증번호 받기" 클릭 → issue 호출 → 6자리 입력 필드+"확인" 노출, (b) 코드 입력 후 확인 → verify 호출 → public은 `onVerified(proofToken)`, authed는 `onVerified()`, (c) 오코드 시 에러 메시지(`인증번호가 올바르지 않아요`) 노출, (d) 재전송 쿨다운(버튼 disabled+카운트다운), (e) 만료 시 재요청 유도, (f) devCode 있으면 입력 필드 프리필. 옥토모 훅 mock을 새 계약으로.
- [ ] **Step 2: 실패 확인** — `pnpm --filter v1_web test -- phone-verification-card`.
- [ ] **Step 3: 카드 재작성** — 상태: `phase: 'idle'|'sent'`, `code`, `error`, `expiresAt`, `resendCooldown`. UX: 미발급 시 "인증번호 받기" primary 버튼 → issue 성공 시 `<input inputMode="numeric" autoComplete="one-time-code" maxLength={6}>` + "확인" 버튼 + 재전송(쿨다운 30s) + 남은시간. mode 분기: public=issue/verify(proofToken), authed=authedRequest/authedConfirm. `extractErrorMessage(err, '...')` 사용. 접근성: input `<label htmlFor>`, 버튼 44px, `aria-live` 에러/상태. QR·딥링크·복사·폴링·detectDeviceKind·buildSmsLink 전부 제거.
- [ ] **Step 4: 소비 유틸 삭제** — `git rm apps/v1_web/src/lib/octomo-sms-link.ts apps/v1_web/src/lib/octomo-sms-link.test.ts apps/v1_web/src/lib/device-kind.ts`. 참조 0 확인(`grep -rn "octomo-sms-link\|device-kind" apps/v1_web/src`).
- [ ] **Step 5: 통과 확인** — `pnpm --filter v1_web test -- phone-verification-card` + `pnpm --filter v1_web exec tsc --noEmit`.
- [ ] **Step 6: 커밋** — `git commit -m "feat(v1/web): 휴대폰 인증 카드를 MT SMS OTP 입력 UX로 재작성 + 옥토모 유틸 삭제"`

### Task 3.3: 라이브 시각 검증 (UI 변경 필수 게이트)

- [ ] v1 스택 기동 후 signup(public) + social-signup(authed) 카드의 OTP UX를 📱390/📲768/🖥1440 스크린샷 캡처(글로벌 규칙 4·17, 메모리 pr-screenshot-gallery-mandatory). dev-echo(`V1_VERIFICATION_DEV_ECHO=true`)로 devCode 프리필 확인. PR 코멘트 갤러리로 첨부.

---

## Phase 4 — config/deploy/env + 문서

### Task 4.1: 배포 배선 OCTOMO_* → SOLAPI_*

**Files:** Modify `deploy/.env.prod.example`, `deploy/docker-compose.prod.yml`, `.github/workflows/deploy-alpha.yml`

- [ ] **Step 1:** `.env.prod.example` L33-36 옥토모 블록 → SOLAPI 3값 블록(주석: 서버 전용, 발신번호 사전등록 필요).
- [ ] **Step 2:** `docker-compose.prod.yml` v1_api environment L59-60 → `SOLAPI_API_KEY: ${SOLAPI_API_KEY:-}` / `SOLAPI_API_SECRET: ${SOLAPI_API_SECRET:-}` / `SOLAPI_SENDER_NUMBER: ${SOLAPI_SENDER_NUMBER:-}`.
- [ ] **Step 3:** `deploy-alpha.yml` L136 job env + L149 SSM 인자에서 `OCTOMO_API_KEY` → `SOLAPI_API_KEY`/`SOLAPI_API_SECRET`/`SOLAPI_SENDER_NUMBER`(3개 secrets).
- [ ] **Step 4: 커밋** — `git commit -m "chore(v1/deploy): 휴대폰 인증 배선 OCTOMO_* → SOLAPI_*"`

### Task 4.2: 문서 교체

**Files:** Delete `docs/ops/octomo-setup.md`; Create `docs/ops/solapi-setup.md`; update `CLAUDE.md` Known Blockers / 관련 서술

- [ ] **Step 1:** solapi-setup.md 작성(계정·API키·발신번호 사전등록·secrets 등록·dev-echo 개발 절차). octomo-setup.md `git rm`.
- [ ] **Step 2:** CLAUDE.md의 옥토모 관련 서술을 SOLAPI로 갱신(있으면). 메모리 `octomo-phone-verification-task.md` 갱신은 완료 보고 후 별도.
- [ ] **Step 3: 커밋** — `git commit -m "docs(v1): 솔라피 SMS OTP 운영 문서 + 옥토모 문서 제거"`

---

## Phase 5 — 검증 + changeset

### Task 5.1: changeset (v1 게이트)

- [ ] `.changeset/mt-sms-otp-solapi.md` 작성: `"v1_api": minor` + `"v1_web": minor`, 요약(옥토모 MO → 솔라피 MT SMS OTP 전환, 옥토모 완전 제거). 커밋.

### Task 5.2: 통합 검증

- [ ] `pnpm --filter v1_api exec tsc --noEmit` + `pnpm --filter v1_web exec tsc --noEmit` → 0.
- [ ] `pnpm --filter v1_api test -- verification` + `DISABLE_MARKETPLACE_CRON=true pnpm --filter v1_api test:integration -- phone-verification` + `pnpm --filter v1_web test -- phone-verification-card` → green.
- [ ] `pnpm --filter v1_api lint` + `pnpm --filter v1_web lint`(영향 파일) → 0.
- [ ] 커밋본 기준 옥토모 참조 0 확인: `grep -rn -i "octomo\|pollArrived\|messageExists\|MAX_POLL" apps docs deploy .github` → 잔재 없음(문서/메모리 예외 확인).

### Task 5.3: PR + Copilot 리뷰 + 시각 갤러리

- [ ] `docs/ops/pr-review-visual-workflow.md` 런북대로 PR(한국어) 생성 → 스크린샷 갤러리(Task 3.3) 첨부 → Copilot 리뷰 clean까지 루프 → CI green + 미해결 스레드 0.

---

## Self-Review

- **Spec coverage:** 설계 §1(어댑터)=Task1.1-1.3, §2(authed)=2.4, §3(public)=2.1-2.3, §4(옥토모 제거)=2.5·3.2·4.x, §5(프론트)=3.x, §6(env)=4.1. 모두 매핑됨.
- **Placeholder scan:** 신규 파일·마이그레이션·핵심 서비스는 완전 코드. 편집 태스크는 정확한 시그니처·라인 명시.
- **Type consistency:** `issueChallenge(phone)`/`verifyCode(phone,code)`/`issueProof(phone)` 시그니처가 컨트롤러·스펙 전반 일치. `dispatcher.send`는 async(Task1.3) → 호출부 await(Task2.2·2.4) 반영. `SmsSender.enabled`/`send` 계약 어댑터·dispatcher 일치.
- **Risk:** 마이그레이션은 ephemeral 테이블 DELETE 후 컬럼 교체 → 데이터 손실 없음. 시크릿 미설정 시 dev-echo로 안전 폴백(발송 불가 시 사용자에게 devCode 노출은 dev 전용 `V1_VERIFICATION_DEV_ECHO`로만).
