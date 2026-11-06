const ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'notify.windows.com',
  'web.push.apple.com',
];

/**
 * 브라우저 푸시 endpoint 의 표준형(WHATWG `href`), 표준 푸시 서비스(FCM/Mozilla/Windows/Apple)의 https URL 이 아니면 null.
 * 서버가 이 URL 로 그대로 POST 하므로(web-push) 다른 주소를 받으면 내부망·메타데이터로의 SSRF 가 된다.
 * 포트·사용자 정보도 막고 표준형을 돌려주는 이유: web-push 는 endpoint 를 옛 `url.parse` 로 다시 읽어서,
 * 원문 문자열이면 여기서 본 호스트와 실제로 연결하는 호스트가 달라질 수 있다.
 */
export function normalizePushEndpoint(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '') return null;
  const allowed = ALLOWED_PUSH_ENDPOINT_HOST_SUFFIXES.some(
    (suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`),
  );
  return allowed ? url.href : null;
}
