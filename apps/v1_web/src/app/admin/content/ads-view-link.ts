/** Same ceiling as `AD_LINK_MAX_LENGTH` in `apps/v1_api/src/ads/ad-link-url.ts`. */
export const AD_LINK_MAX_LENGTH = 500;

/** First path segments the web app owns for itself; an ad must not send people there. */
const RESERVED_FIRST_SEGMENTS = new Set(['admin', 'api', 'uploads', 'tournament-ops']);
const INTERNAL_HOST_SUFFIXES = ['.local', '.internal', '.lan', '.home.arpa'];
/** 100.64.0.0/10 (carrier-grade NAT). */
const CARRIER_GRADE_NAT = /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./u;
const MAX_DECODE_ROUNDS = 4;

export type AdLinkCheck = { ok: true } | { ok: false; reason: string };

const REJECT = {
  empty: '이동 링크를 입력해 주세요.',
  tooLong: `이동 링크는 ${AD_LINK_MAX_LENGTH}자 안에서 써 주세요.`,
  characters: '공백, 줄바꿈, 역슬래시(\\)는 넣을 수 없어요.',
  scheme: '/로 시작하는 앱 안 경로나 https:// 주소여야 해요. http://나 다른 방식의 주소는 쓸 수 없어요.',
  protocolRelative: '//로 시작하는 주소는 쓸 수 없어요. 앱 안 경로는 /로, 다른 사이트는 https://로 시작해 주세요.',
  reservedPath: '/admin, /api, /uploads, /tournament-ops로 가는 경로는 광고 링크로 쓸 수 없어요.',
  leavesTheApp: '/..나 /.가 들어가 경로를 정리하면 //로 시작하는 주소가 돼요. 다른 사이트로 가는 주소는 앱 안 경로로 쓸 수 없어요.',
  unparsable: 'https:// 주소 형식이 올바르지 않아요.',
  userinfo: '주소에 아이디·비밀번호(예: user:pw@)를 넣을 수 없어요.',
  ipv6: 'IPv6 주소는 쓸 수 없어요. 도메인 이름으로 써 주세요.',
  privateHost: 'localhost와 내부망(사설 IP) 주소는 쓸 수 없어요. 공개된 주소를 써 주세요.',
  singleLabelHost: '점이 없는 이름(예: intranet)은 쓸 수 없어요. 공개된 도메인을 써 주세요.',
  internalHost: '.local, .internal 같은 내부 전용 이름은 쓸 수 없어요. 공개된 도메인을 써 주세요.',
} as const;

const fail = (reason: string): AdLinkCheck => ({ ok: false, reason });
const OK: AdLinkCheck = { ok: true };

const hasControlCharacter = (value: string) =>
  Array.from(value).some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });

const hasWhitespace = (value: string) => Array.from(value).some((character) => character.trim() === '');

/** Same host test as `isPrivateHostname` in `apps/v1_api/src/common/safe-image-url.ts`. */
function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  if (/^(?:0|10|127|169\.254|192\.168)\./u.test(host)) return true;
  const private172 = /^172\.(\d{1,2})\./u.exec(host);
  if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;
  return /^(?:fc|fd|fe8|fe9|fea|feb)[0-9a-f:]*$/u.test(host);
}

/**
 * What is wrong with an in-app path once percent-decoding and dot segments are applied the way a browser and the
 * router would: it lands under a reserved first segment, or it resolves to another site (`/..//host` becomes
 * `//host`). Anything that cannot be decoded cleanly counts as reserved. Query and fragment are not part of the path.
 */
function internalPathProblem(value: string): 'reserved' | 'leavesTheApp' | null {
  const end = value.search(/[?#]/u);
  let path = end === -1 ? value : value.slice(0, end);
  for (let round = 0; ; round += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      // A malformed escape in the link itself is rejected; one that only appears after a decoding round is a literal "%".
      if (round === 0) return 'reserved';
      break;
    }
    if (decoded === path) break;
    if (round >= MAX_DECODE_ROUNDS) return 'reserved';
    path = decoded;
  }
  if (path.startsWith('//') || path.includes('\\') || hasControlCharacter(path)) return 'leavesTheApp';
  const pathname = new URL(path, 'https://app.invalid').pathname;
  if (pathname.startsWith('//')) return 'leavesTheApp';
  return RESERVED_FIRST_SEGMENTS.has((pathname.split('/')[1] ?? '').toLowerCase()) ? 'reserved' : null;
}

/**
 * Tells the owner, before saving, whether the server will accept an ad link and why not. It follows
 * `isSafeAdLinkUrl` in `apps/v1_api/src/ads/ad-link-url.ts` step by step; the server stays the boundary and
 * `ads-view-link.test.ts` runs that rule's accept/reject lists against this function so the two cannot drift.
 * The public screens' check (`lib/ad-link.ts`) is the render-time guard for stored values, not a save rule, and is not used here.
 */
export function checkAdLink(value: string): AdLinkCheck {
  if (value.length === 0) return fail(REJECT.empty);
  if (value.length > AD_LINK_MAX_LENGTH) return fail(REJECT.tooLong);
  if (hasControlCharacter(value) || value.includes('\\') || hasWhitespace(value)) return fail(REJECT.characters);

  if (value.startsWith('/')) {
    if (value.startsWith('//')) return fail(REJECT.protocolRelative);
    const problem = internalPathProblem(value);
    return problem === null ? OK : fail(problem === 'reserved' ? REJECT.reservedPath : REJECT.leavesTheApp);
  }
  if (!value.toLowerCase().startsWith('https://')) return fail(REJECT.scheme);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(REJECT.unparsable);
  }
  if (url.protocol !== 'https:') return fail(REJECT.scheme);
  if (url.username || url.password) return fail(REJECT.userinfo);
  const host = url.hostname.toLowerCase().replace(/\.+$/u, '');
  if (host.startsWith('[')) return fail(REJECT.ipv6);
  if (isPrivateHostname(host) || CARRIER_GRADE_NAT.test(host)) return fail(REJECT.privateHost);
  if (!host.includes('.')) return fail(REJECT.singleLabelHost);
  return INTERNAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix)) ? fail(REJECT.internalHost) : OK;
}
