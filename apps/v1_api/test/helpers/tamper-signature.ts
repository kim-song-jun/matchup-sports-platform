/**
 * Returns the token with a signature that can never equal the real one. Rewriting the end of a signature is
 * not enough: the real signature may already end that way, and the rewrite then leaves a valid token.
 */
export function tamperSignature(token: string): string {
  const start = token.lastIndexOf('.') + 1;
  const replacement = token[start] === 'A' ? 'B' : 'A';
  return `${token.slice(0, start)}${replacement}${token.slice(start + 1)}`;
}
