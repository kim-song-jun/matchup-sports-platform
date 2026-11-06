/** Uniform index using a power-of-two mask and rejection sampling. */
export function randomIndex(upperExclusive: number): number {
  if (!Number.isInteger(upperExclusive) || upperExclusive < 1 || upperExclusive > 0x100000000) {
    throw new RangeError('Random index bound must be an integer from 1 to 2^32');
  }
  if (upperExclusive === 1) return 0;
  const mask = 0xffffffff >>> Math.clz32(upperExclusive - 1);
  const bytes = new Uint32Array(1);
  let candidate: number;
  do {
    candidate = (crypto.getRandomValues(bytes)[0] & mask) >>> 0;
  } while (candidate >= upperExclusive);
  return candidate;
}
