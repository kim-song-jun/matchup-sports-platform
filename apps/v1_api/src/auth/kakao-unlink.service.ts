import { Injectable, Logger } from '@nestjs/common';
import { V1AuthProvider } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Drops the app connection Kakao keeps for a member (the entry under the member's connected services) when the
 * member withdraws, an operator deletes the account, or the member removes Kakao as a login method.
 *
 * It is a side effect on Kakao's side and never decides whether the caller succeeds: callers start it without
 * awaiting or catching, so every public method logs and returns instead of throwing, database access included.
 */

export const KAKAO_UNLINK_URL = 'https://kapi.kakao.com/v1/user/unlink';
export const KAKAO_ADMIN_KEY_ENV = 'KAKAO_ADMIN_KEY';

/** The one reader of the representative admin key: the unlink call and the unlink webhook both use it. */
export function readKakaoAdminKey(): string | null {
  return process.env[KAKAO_ADMIN_KEY_ENV]?.trim() || null;
}

/** Withdrawal and login-method removal call from the request path's tail, so the call is bounded. */
const KAKAO_UNLINK_TIMEOUT_MS = 5_000;
/** -101: the member is not connected to the app. -103: the Kakao account is dormant or gone. Nothing is left to unlink. */
const NOT_CONNECTED_CODES: ReadonlySet<number> = new Set([-101, -103]);
const MEMBER_NUMBER = /^\d+$/;

export type KakaoUnlinkReason = 'withdrawal_request' | 'login_method_removed' | 'account_deleted';

/** A Kakao login row and the member number it holds. */
export type KakaoUnlinkTarget = { identityId: string; memberNumber: string };

type FailureKind = 'refused' | 'failed';
type UnlinkOutcome = { kind: 'ok' | 'already_unlinked'; detail?: undefined } | { kind: FailureKind; detail: string };

/** Keeps digit-only keys; a deleted account's placeholder key (`deleted:...`) is not a member number. */
export function toKakaoUnlinkTargets(rows: ReadonlyArray<{ id: string; providerUserKey: string }>): KakaoUnlinkTarget[] {
  return rows
    .filter((row) => MEMBER_NUMBER.test(row.providerUserKey))
    .map((row) => ({ identityId: row.id, memberNumber: row.providerUserKey }));
}

@Injectable()
export class KakaoUnlinkService {
  private readonly logger = new Logger(KakaoUnlinkService.name);
  /** `undefined` = not read yet; `null` = read and disabled. */
  private adminKey: string | null | undefined;

  constructor(private readonly prisma: PrismaService) {}

  /** Unlinks every Kakao login row of the user, whatever its status; a removed login keeps its member number. */
  async unlinkAllForUser(userId: string, reason: KakaoUnlinkReason): Promise<void> {
    await this.guarded(userId, reason, async () => {
      const rows = await this.prisma.v1AuthIdentity.findMany({
        where: { userId, provider: V1AuthProvider.kakao },
        select: { id: true, providerUserKey: true },
      });
      await this.unlinkTargets(userId, toKakaoUnlinkTargets(rows), reason);
    });
  }

  /** For callers that read the targets before the rows lost their key (account deletion replaces it). */
  async unlinkKeys(userId: string, targets: readonly KakaoUnlinkTarget[], reason: KakaoUnlinkReason): Promise<void> {
    await this.guarded(userId, reason, () => this.unlinkTargets(userId, targets, reason));
  }

  private async guarded(userId: string, reason: KakaoUnlinkReason, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (err) {
      this.logger.error(`Kakao unlink failed user=${userId} reason=${reason} error=${describeError(err)}`);
    }
  }

  private async unlinkTargets(userId: string, targets: readonly KakaoUnlinkTarget[], reason: KakaoUnlinkReason): Promise<void> {
    if (targets.length === 0) return;
    const adminKey = this.resolveAdminKey();
    if (!adminKey) {
      this.logger.warn(`Kakao unlink skipped user=${userId} reason=${reason} result=skipped_disabled`);
      return;
    }

    for (const target of targets) {
      const outcome = await this.request(adminKey, target.memberNumber);
      const line = `Kakao unlink user=${userId} reason=${reason} result=${outcome.kind}${outcome.detail ? ` ${outcome.detail}` : ''}`;
      if (outcome.kind === 'refused' || outcome.kind === 'failed') {
        this.logger.error(line);
        await this.recordFailure(userId, target.identityId, reason, outcome.kind);
      } else {
        this.logger.log(line);
      }
    }
  }

  /** Never throws: a transport or parsing error is an outcome, not an exception. */
  private async request(adminKey: string, memberNumber: string): Promise<UnlinkOutcome> {
    try {
      const response = await fetch(KAKAO_UNLINK_URL, {
        method: 'POST',
        headers: {
          Authorization: `KakaoAK ${adminKey}`,
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
        body: new URLSearchParams({ target_id_type: 'user_id', target_id: memberNumber }).toString(),
        signal: AbortSignal.timeout(KAKAO_UNLINK_TIMEOUT_MS),
      });
      // Read for the error code; a body that cannot be read leaves the status as the only signal.
      const body = (await response.json().catch(() => null)) as { code?: unknown } | null;
      if (response.ok) return { kind: 'ok' };
      const code = typeof body?.code === 'number' ? body.code : null;
      if (code !== null && NOT_CONNECTED_CODES.has(code)) return { kind: 'already_unlinked' };
      if (response.status >= 400 && response.status < 500) {
        return { kind: 'refused', detail: `status=${response.status} code=${code ?? 'none'}` };
      }
      return { kind: 'failed', detail: `status=${response.status}` };
    } catch (err) {
      return { kind: 'failed', detail: `error=${describeError(err)}` };
    }
  }

  /** Container logs vanish on redeploy, so a call that did not reach Kakao also leaves a countable row. */
  private async recordFailure(userId: string, identityId: string, reason: KakaoUnlinkReason, kind: FailureKind): Promise<void> {
    try {
      const identity = await this.prisma.v1AuthIdentity.findUnique({ where: { id: identityId }, select: { status: true } });
      await this.prisma.v1StatusChangeLog.create({
        data: {
          targetType: 'auth_identity',
          targetId: identityId,
          fromStatus: identity?.status ?? null,
          toStatus: 'provider_unlink_failed',
          actorType: 'system',
          reason: `${reason}:${kind}`,
        },
      });
    } catch (err) {
      this.logger.error(`Kakao unlink failure could not be recorded user=${userId} reason=${reason} error=${describeError(err)}`);
    }
  }

  private resolveAdminKey(): string | null {
    if (this.adminKey !== undefined) return this.adminKey;
    const key = readKakaoAdminKey();
    if (!key) {
      this.logger.warn(`Kakao unlink disabled — missing ${KAKAO_ADMIN_KEY_ENV}. Withdrawal and login-method removal still work.`);
    }
    this.adminKey = key;
    return this.adminKey;
  }
}

/** Error messages can quote the request (the key, the member number), so only the class and code are logged. */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return typeof err;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? `${err.name}(${code})` : err.name;
}
