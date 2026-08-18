/**
 * 경기 영상 URL 유틸 — 유튜브 URL에서 videoId를 추출한다.
 * 지원: youtube.com/watch?v=, youtu.be/, youtube.com/embed/, youtube.com/shorts/, m.youtube.com
 * 유튜브가 아니면 null → 호출부는 외부 링크로 폴백한다.
 */
export function extractYoutubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^www\.|^m\./, '');
  const isValidId = (id: string | null | undefined): id is string =>
    !!id && /^[A-Za-z0-9_-]{11}$/.test(id);

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0];
    return isValidId(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      const id = parsed.searchParams.get('v');
      return isValidId(id) ? id : null;
    }
    const m = parsed.pathname.match(/^\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
    if (m) return m[2];
  }
  return null;
}

/** 유튜브 썸네일 URL (mqdefault: 320x180 — 카드용으로 충분히 선명하고 가벼움) */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/** 개인정보 보호 임베드 URL (youtube-nocookie) */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
}

/**
 * 유튜브 원본 시청 URL — 임베드가 실패했을 때의 탈출구.
 * 임베드는 CSP(frame-src)·업로더의 "다른 사이트에서 재생 허용" 설정·연령 제한 등
 * 우리가 제어할 수 없는 이유로 막힐 수 있어서, 재생 모달에 항상 이 링크를 함께 둔다.
 * 등록된 원본 문자열이 아니라 videoId 로 다시 만든다 — youtu.be/embed/shorts 어떤 형태로
 * 등록됐든 관전자에게는 같은 시청 페이지를 준다.
 */
export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export type VideoKind = 'youtube' | 'file' | 'external';

const UPLOADS_PREFIX = '/uploads/';

export function safeVideoFileUrl(url: string): string | null {
  const value = url.trim();
  if (value.startsWith(UPLOADS_PREFIX)) {
    if (value.includes('\\')) return null;
    let normalized: URL;
    try {
      // 상대 경로를 정규화하기 위한 더미 origin — 반환값에는 쓰지 않는다.
      normalized = new URL(value, 'https://uploads.invalid');
    } catch {
      return null;
    }
    // `/uploads/../admin` 처럼 uploads 밖을 가리키는 경로는 업로드 파일이 아니다.
    // URL 정규화가 `../` 와 `%2e%2e/` 는 접어주지만 인코딩된 슬래시(`%2f`)는 남으므로,
    // 프록시 단에서 디코딩돼 prefix를 벗어나는 경우까지 함께 막는다.
    if (!normalized.pathname.startsWith(UPLOADS_PREFIX)) return null;
    if (/%2e|%2f|%5c/i.test(normalized.pathname)) return null;
    return `${normalized.pathname}${normalized.search}`;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return /\.(mp4|webm|mov|m4v)$/i.test(parsed.pathname) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * 영상 URL 종류 판별.
 * - youtube: 페이지 내 iframe 재생
 * - file: 업로드 파일(/uploads/*) 또는 직접 영상 파일 → HTML5 <video> 스트리밍 재생
 * - external: 그 외 (예: 외부 페이지 링크) → 새 창 폴백
 */
export function videoKind(url: string): VideoKind {
  if (extractYoutubeVideoId(url)) return 'youtube';
  if (safeVideoFileUrl(url)) return 'file';
  return 'external';
}
