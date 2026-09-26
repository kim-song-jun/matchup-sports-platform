/**
 * `crypto.randomUUID()` 는 secure context 전용이고 구형 WebView(특히 Capacitor Android)에는
 * 아직 없다. 반면 `crypto.getRandomValues()` 는 훨씬 오래전부터 있으므로, randomUUID가 없으면
 * 같은 Web Crypto 엔트로피로 RFC 4122 v4 UUID를 직접 만든다.
 * 두 API가 모두 없으면 안전한 난수를 만들 수 없으므로 Math.random으로 대체하지 않고 던진다.
 */
export function randomUuid(): string {
  const webCrypto = globalThis.crypto;

  if (typeof webCrypto?.randomUUID === 'function') {
    return webCrypto.randomUUID();
  }

  if (typeof webCrypto?.getRandomValues === 'function') {
    const bytes = webCrypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new Error('Web Crypto를 쓸 수 없어 안전한 식별자를 만들지 못했어요.');
}

/**
 * 서버의 `@IsUUID()` 와 **같은 판정**을 한다.
 *
 * 더 엄격하면 서버가 받아 줄 값을 화면이 조용히 버리고, 더 느슨하면 서버가 400 을 낸다 —
 * 어느 쪽으로도 어긋나면 안 되므로 규칙을 추측하지 않고 실측했다:
 * `@IsUUID()` 는 version 인자를 안 넘기고(class-validator 0.14.4), validator 13.15.26 의
 * `isUUID` 는 그때 `'all'` 을 쓴다 — **버전 1~8 + nil + max**.
 *
 * 흔히 보이는 `[1-5]` 패턴은 **서버보다 엄격**해서 v7 UUID 를 잘못 버린다
 * (`components/auth/onboarding-client.tsx` 의 사설 `isUuid` 가 그 형태인데, 그쪽은 초안
 * 데이터 정리용이라 판정 대상 자체가 다르다 — 여기로 합치지 않았다).
 */
const UUID_ALL =
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_ALL.test(value);
}
