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
