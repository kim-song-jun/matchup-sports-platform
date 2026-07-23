import type { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createV1IntegrationApp } from './integration-app';
import { verifyPhoneProofToken } from '../../src/verification/phone-proof-token';

/**
 * 옥토모 MO 휴대폰 본인인증 — 실 DB + 실 HTTP end-to-end.
 *
 * OCTOMO_API_KEY 없이 V1_VERIFICATION_DEV_ECHO=true 로 동작(octomo 미호출, pollArrived 자동 통과).
 * 공개 엔드포인트 issue → verify → proofToken 왕복이 실제 챌린지 테이블(v1_phone_verification_challenges)과
 * 실제 HMAC proof token 발급/검증까지 통과하는지 검증한다.
 */
describe('V1 phone verification (MO) integration', () => {
  let app: INestApplication;
  let cleanup: (() => Promise<void>) | undefined;

  // 통합 스위트는 --runInBand 로 한 프로세스에서 순차 실행되므로, 이 스펙이 바꾼 env 가
  // 뒤 스펙으로 새면 안 된다(특히 V1_VERIFICATION_DEV_ECHO 를 켜두면 다른 스펙의 register 가
  // phone 게이트에 걸림). beforeAll 에서 저장하고 afterAll 에서 반드시 복원한다.
  const ENV_KEYS = ['DATABASE_URL', 'V1_VERIFICATION_DEV_ECHO', 'OCTOMO_API_KEY', 'V1_SESSION_SECRET'] as const;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.DATABASE_URL =
      process.env.DATABASE_URL ??
      'postgresql://integration:integration@127.0.0.1:5432/ulw_v1_integration_phoneverify';
    process.env.V1_VERIFICATION_DEV_ECHO = 'true';
    delete process.env.OCTOMO_API_KEY;
    process.env.V1_SESSION_SECRET =
      process.env.V1_SESSION_SECRET ?? 'integration-phone-verify-session-secret-0123456789';
    ({ app, cleanup } = await createV1IntegrationApp());
  });

  afterAll(async () => {
    await cleanup?.();
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('issues a mobile challenge with an 8-char code and the octomo dest number (no QR for mobile)', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/issue')
      .send({ phone: '01011112222', channel: 'mobile' })
      .expect(200);

    expect(response.body.data.destNumber).toBe('16663538');
    expect(response.body.data.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    expect(response.body.data.qrCode).toBeUndefined();
    expect(new Date(response.body.data.expiresAt).toISOString()).toBe(response.body.data.expiresAt);
  });

  it('verifies via dev-echo and returns a proof token bound to that phone', async () => {
    const phone = '01033334444';
    await request(app.getHttpServer())
      .post('/api/v1/auth/phone/issue')
      .send({ phone, channel: 'mobile' })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/verify')
      .send({ phone })
      .expect(200);

    expect(response.body.data.verified).toBe(true);
    expect(typeof response.body.data.proofToken).toBe('string');
    // 발급된 proof token 이 실제로 이 번호에 대해 검증되어야 하고, 다른 번호로는 안 된다.
    expect(verifyPhoneProofToken(response.body.data.proofToken, phone)).toBe(true);
    expect(verifyPhoneProofToken(response.body.data.proofToken, '01099998888')).toBe(false);
  });

  it('returns verified:false (no proof token) when no challenge exists for the phone', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/phone/verify')
      .send({ phone: '01055556666' })
      .expect(200);

    expect(response.body.data.verified).toBe(false);
    expect(response.body.data.proofToken).toBeUndefined();
  });

  it('rejects a malformed phone with a validation error', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/phone/issue')
      .send({ phone: '123', channel: 'mobile' })
      .expect(400);
  });
});
