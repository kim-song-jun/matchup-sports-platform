import { JwtService } from '@nestjs/jwt';
import * as supertest from 'supertest';

/**
 * Usage contract:
 * - Integration tests: obtain tokens via devLoginToken() helper (POST /api/v1/auth/dev-login).
 *   This ensures the token is signed by the actual running NestJS app, which reads
 *   JWT_SECRET from the environment through ConfigService.
 * - Unit specs: inject a mock JwtService and use signTestJwt() alongside a mock
 *   PrismaService. The token is never validated against a live guard in unit tests.
 *
 * IMPORTANT: JWT_SECRET must match the value in .env exactly.
 * The fallback 'test-secret' is only valid when the NestJS app is bootstrapped
 * with the same secret (e.g. in a self-contained unit test with mocked JwtAuthGuard).
 */
const TEST_JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret';

// Lazy singleton — avoids bootstrapping full NestJS just for token signing.
let _jwtService: JwtService | undefined;

function getJwtService(): JwtService {
  if (!_jwtService) {
    _jwtService = new JwtService({
      secret: TEST_JWT_SECRET,
      signOptions: { expiresIn: '15m' },
    });
  }
  return _jwtService;
}

/**
 * Signs a short-lived JWT for test use.
 * Intended for unit specs with mocked PrismaService + mocked JwtAuthGuard.
 * For integration tests use devLoginToken() via POST /api/v1/auth/dev-login instead.
 */
export function signTestJwt(userId: string, expiresIn = '15m'): string {
  return getJwtService().sign({ sub: userId }, { expiresIn } as any);
}

/** Returns the Authorization header value ready for supertest. */
export function bearerToken(userId: string): string {
  return `Bearer ${signTestJwt(userId)}`;
}

/**
 * Calls POST /api/v1/auth/dev-login and returns the accessToken.
 * Use this in integration tests instead of signTestJwt() so the token is
 * signed by the live NestJS app with the real JWT_SECRET from ConfigService.
 */
export async function devLoginToken(
  request: supertest.Agent,
  nickname: string,
): Promise<string> {
  const res = await request
    .post('/api/v1/auth/dev-login')
    .send({ nickname });
  return (res.body.data as { accessToken: string }).accessToken;
}
