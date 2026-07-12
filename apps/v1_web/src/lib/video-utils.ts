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

export type VideoKind = 'youtube' | 'file' | 'external';

/**
 * 영상 URL 종류 판별.
 * - youtube: 페이지 내 iframe 재생
 * - file: 업로드 파일(/uploads/*) 또는 직접 영상 파일 → HTML5 <video> 스트리밍 재생
 * - external: 그 외 (예: 외부 페이지 링크) → 새 창 폴백
 */
export function videoKind(url: string): VideoKind {
  if (extractYoutubeVideoId(url)) return 'youtube';
  if (url.startsWith('/uploads/')) return 'file';
  try {
    const pathname = new URL(url, 'http://placeholder.local').pathname;
    if (/\.(mp4|webm|mov|m4v)$/i.test(pathname)) return 'file';
  } catch {
    // URL 파싱 불가 — external 폴백
  }
  return 'external';
}
