import { ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/** 링크 수명 — 만든 때부터 7일(G12 결정). */
export const TEAM_INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const TOKEN_BYTES = 24;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const MINIMUM_SECRET_LENGTH = 32;
const KEY_INFO = 'teameet:team-invite-link:v1';

/**
 * 토큰 = HMAC(시크릿에서 뽑은 전용 키, 행마다 다른 salt). DB 에는 salt 와 토큰의 sha256 만 둔다 —
 * DB 만 새어도 토큰을 만들 수 없고, 팀장·매니저가 다시 열면 같은 링크를 보여 줄 수 있다.
 * 시크릿을 바꾸면 기존 행에서 만든 토큰이 해시와 어긋난다(`displayableInviteLinkToken` 이 걸러 재발급하게 한다).
 */
function inviteLinkKey(): Buffer {
  const secret = process.env.V1_SESSION_SECRET?.trim() ?? '';
  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new ServiceUnavailableException({
      code: 'TEAM_INVITE_LINK_UNAVAILABLE',
      message: '지금은 초대 링크를 만들 수 없어요. 잠시 뒤 다시 시도해 주세요.',
    });
  }
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), KEY_INFO, 32));
}

export function newInviteLinkSalt(): string {
  return randomBytes(16).toString('base64url');
}

export function deriveInviteLinkToken(salt: string): string {
  return createHmac('sha256', inviteLinkKey()).update(salt).digest().subarray(0, TOKEN_BYTES).toString('base64url');
}

export function hashInviteLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** 형식이 아예 다른 값은 DB 를 보지 않고 거른다. */
export function isWellFormedInviteLinkToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export function displayableInviteLinkToken(link: { tokenSalt: string; tokenHash: string }): string | null {
  const token = deriveInviteLinkToken(link.tokenSalt);
  return hashInviteLinkToken(token) === link.tokenHash ? token : null;
}
