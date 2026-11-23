/**
 * 캘린더 구독 주소(`/api/v1/calendar/feed/<토큰>.ics`)는 토큰이 경로에 있다. 폐기 전까지 만료가 없는
 * 읽기용 비밀이라 요청 로그에 그대로 남으면 로그를 읽는 사람이 살아 있는 구독 주소를 얻는다 —
 * 경로의 토큰 자리를 가린다. (nginx 접근 로그는 deploy/nginx*.conf 에서 이 경로의 access_log 를 끈다.)
 */
const CALENDAR_FEED_TOKEN_PATH = /(\/calendar\/feed\/)[^/?#]+?(\.ics)?(?=$|[?#])/;

export function maskCalendarFeedToken(url: string): string {
  return url.replace(CALENDAR_FEED_TOKEN_PATH, '$1[redacted]$2');
}
