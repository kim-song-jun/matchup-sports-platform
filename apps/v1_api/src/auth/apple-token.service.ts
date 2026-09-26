import { Injectable, Logger } from '@nestjs/common';
import { createPrivateKey, KeyObject } from 'node:crypto';
import { V1AuthProvider } from '@prisma/client';
import { signEs256Jwt } from '../common/security/es256-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AppleIdentityService } from './apple-identity.service';
import { openAppleToken, parseAppleTokenKey, sealAppleToken } from './apple-token-cipher';

/**
 * Sign in with Apple token lifecycle: trade the one-time authorization code for a refresh
 * token at sign-in, and revoke it when the reader deletes their account (App Store Review
 * Guideline 5.1.1(v) requires the revoke).
 *
 * Neither step may decide whether sign-in or withdrawal succeeds. Both are side effects on
 * Apple's side; every method here logs and returns instead of throwing.
 */

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';

export const APPLE_TOKEN_ENV = {
  keyId: 'APPLE_SIGN_IN_KEY_ID',
  teamId: 'APPLE_SIGN_IN_TEAM_ID',
  privateKey: 'APPLE_SIGN_IN_PRIVATE_KEY',
  encryptionKey: 'APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY',
} as const;

/** Apple allows up to six months; a request-scoped secret only needs to outlive one call. */
const CLIENT_SECRET_LIFETIME_SECONDS = 5 * 60;
/** Sign-in and withdrawal both wait on this call, so it is bounded well below a user's patience. */
const APPLE_REQUEST_TIMEOUT_MS = 5_000;

type AppleTokenConfig = {
  readonly keyId: string;
  readonly teamId: string;
  readonly privateKey: KeyObject;
  readonly encryptionKey: Buffer;
};

@Injectable()
export class AppleTokenService {
  private readonly logger = new Logger(AppleTokenService.name);
  /** `undefined` = not read yet; `null` = read and disabled. */
  private config: AppleTokenConfig | null | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly appleIdentity: AppleIdentityService,
  ) {}

  /**
   * Exchanges the sheet's authorization code and stores the refresh token on the Apple
   * identity row. Called after the sign-in itself has succeeded.
   */
  async storeFromAuthorizationCode(input: {
    subject: string;
    clientId: string;
    authorizationCode: string;
  }): Promise<void> {
    try {
      await this.exchangeAndStore(input);
    } catch (err) {
      this.logger.error('Apple refresh token could not be stored', (err as Error).stack);
    }
  }

  /**
   * Revokes every stored Apple refresh token of the user. A revoked token is cleared; one
   * Apple did not accept is kept so the failure stays visible on the row, not only in a log.
   */
  async revokeForUser(userId: string): Promise<void> {
    try {
      await this.revokeAll(userId);
    } catch (err) {
      this.logger.error(`Apple token revoke failed user=${userId}`, (err as Error).stack);
    }
  }

  private async exchangeAndStore(input: {
    subject: string;
    clientId: string;
    authorizationCode: string;
  }): Promise<void> {
    const config = this.resolveConfig();
    if (!config) return;

    const identity = await this.prisma.v1AuthIdentity.findUnique({
      where: {
        provider_providerUserKey: { provider: V1AuthProvider.apple, providerUserKey: input.subject },
      },
      select: { id: true },
    });
    if (!identity) {
      this.logger.warn('Apple identity row missing after sign-in; refresh token not stored');
      return;
    }

    let refreshToken: string;
    try {
      const response = await this.postForm(APPLE_TOKEN_URL, {
        client_id: input.clientId,
        client_secret: this.clientSecret(config, input.clientId),
        code: input.authorizationCode,
        grant_type: 'authorization_code',
      });
      const body = (await response.json().catch(() => null)) as
        | { refresh_token?: unknown; id_token?: unknown; error?: unknown }
        | null;
      if (!response.ok || typeof body?.refresh_token !== 'string') {
        this.logger.error(
          `Apple token exchange refused identity=${identity.id} status=${response.status} error=${String(body?.error ?? 'none')}`,
        );
        return;
      }
      // The code and the identity token arrive in the same request but nothing ties them
      // together: a code minted for another Apple account would otherwise attach that
      // account's refresh token to this row, and this user's withdrawal would revoke theirs.
      const exchanged = typeof body.id_token === 'string'
        ? await this.appleIdentity.verifyExchangedIdToken(body.id_token)
        : null;
      if (!exchanged?.ok || exchanged.claims.subject !== input.subject || exchanged.claims.audience !== input.clientId) {
        this.logger.error(
          `Apple token exchange returned a token for a different account or app; not stored identity=${identity.id} reason=${exchanged === null ? 'missing_id_token' : exchanged.ok ? 'subject_or_audience_mismatch' : exchanged.reason}`,
        );
        return;
      }
      refreshToken = body.refresh_token;
    } catch (err) {
      this.logger.error(`Apple token exchange failed identity=${identity.id}`, (err as Error).stack);
      return;
    }

    await this.prisma.v1AuthIdentity.update({
      where: { id: identity.id },
      data: {
        providerRefreshTokenCiphertext: sealAppleToken(config.encryptionKey, identity.id, {
          clientId: input.clientId,
          refreshToken,
        }),
      },
    });
  }

  private async revokeAll(userId: string): Promise<void> {
    const identities = await this.prisma.v1AuthIdentity.findMany({
      where: {
        userId,
        provider: V1AuthProvider.apple,
        providerRefreshTokenCiphertext: { not: null },
      },
      select: { id: true, providerRefreshTokenCiphertext: true },
    });
    if (identities.length === 0) return;

    const config = this.resolveConfig();
    if (!config) {
      this.logger.error(`Apple token revoke skipped user=${userId}: Sign in with Apple key is not configured`);
      return;
    }

    for (const identity of identities) {
      if (await this.revokeOne(config, identity.id, identity.providerRefreshTokenCiphertext as string)) {
        await this.prisma.v1AuthIdentity.update({
          where: { id: identity.id },
          data: { providerRefreshTokenCiphertext: null },
        });
      }
    }
  }

  private async revokeOne(config: AppleTokenConfig, identityId: string, sealed: string): Promise<boolean> {
    try {
      const stored = openAppleToken(config.encryptionKey, identityId, sealed);
      const response = await this.postForm(APPLE_REVOKE_URL, {
        client_id: stored.clientId,
        client_secret: this.clientSecret(config, stored.clientId),
        token: stored.refreshToken,
        token_type_hint: 'refresh_token',
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
        this.logger.error(
          `Apple token revoke refused identity=${identityId} status=${response.status} error=${String(body?.error ?? 'none')}`,
        );
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Apple token revoke failed identity=${identityId}`, (err as Error).stack);
      return false;
    }
  }

  private clientSecret(config: AppleTokenConfig, clientId: string): string {
    const issuedAt = Math.floor(Date.now() / 1000);
    return signEs256Jwt(
      config.privateKey,
      { kid: config.keyId },
      {
        iss: config.teamId,
        iat: issuedAt,
        exp: issuedAt + CLIENT_SECRET_LIFETIME_SECONDS,
        aud: APPLE_AUDIENCE,
        sub: clientId,
      },
    );
  }

  private postForm(url: string, fields: Record<string, string>): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(APPLE_REQUEST_TIMEOUT_MS),
    });
  }

  private resolveConfig(): AppleTokenConfig | null {
    if (this.config !== undefined) return this.config;
    this.config = this.readConfig();
    return this.config;
  }

  private readConfig(): AppleTokenConfig | null {
    const missing = Object.values(APPLE_TOKEN_ENV).filter((name) => !process.env[name]?.trim());
    if (missing.length > 0) {
      this.logger.warn(
        `Apple token exchange/revoke disabled — missing ${missing.join(', ')}. Sign-in and withdrawal still work.`,
      );
      return null;
    }

    const encryptionKey = parseAppleTokenKey(process.env[APPLE_TOKEN_ENV.encryptionKey]);
    if (!encryptionKey) {
      this.logger.warn(`Apple token exchange/revoke disabled — ${APPLE_TOKEN_ENV.encryptionKey} is not 32 bytes of base64.`);
      return null;
    }
    let privateKey: KeyObject;
    try {
      // Deployment carries the `.p8` as one line with literal `\n`, like APNS_PRIVATE_KEY.
      privateKey = createPrivateKey((process.env[APPLE_TOKEN_ENV.privateKey] as string).replace(/\\n/g, '\n'));
    } catch (err) {
      this.logger.warn(
        `Apple token exchange/revoke disabled — ${APPLE_TOKEN_ENV.privateKey} is not a readable key: ${(err as Error).message}`,
      );
      return null;
    }
    return {
      keyId: (process.env[APPLE_TOKEN_ENV.keyId] as string).trim(),
      teamId: (process.env[APPLE_TOKEN_ENV.teamId] as string).trim(),
      privateKey,
      encryptionKey,
    };
  }
}
