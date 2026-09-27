/** 주소의 #앵커를 요소 id 로. 잘못된 퍼센트 인코딩(`#%E0%`)이면 decode 가 던지므로 원문을 쓴다. */
export function locationHashId(hash: string): string {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
