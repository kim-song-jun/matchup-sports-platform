/**
 * 경기 영상 URL 검증 — 등록 경로의 단일 관문.
 *
 * 영상은 두 가지 출처만 허용한다.
 *  - `upload`   : 이 서비스가 저장한 업로드 파일. 루트-상대 경로(`/uploads/YYYY/MM/<uuid>.mp4`)로
 *                 들어오며 express.static 이 Range 지원으로 서빙한다.
 *  - `external` : 유튜브 등 외부 링크. `http`/`https` 스킴만 허용한다.
 *
 * 출처는 URL 모양만으로 결정되므로 별도 컬럼(스키마 변경) 없이 기존 `url` 하나로 구분된다 —
 * 재생 UI(`apps/v1_web/src/lib/video-utils.ts` 의 `videoKind()`)도 같은 기준으로 판별한다.
 *
 * `javascript:` / `data:` / `vbscript:` / `file:` 처럼 재생 UI 나 브라우저에서 그대로 실행·노출될
 * 수 있는 스킴은 여기서 전부 막는다. 프로토콜-상대 URL(`//host/x.mp4`)은 절대 URL 로 파싱되지
 * 않으므로 자동으로 거부된다(업로드 접두사도 아니다).
 */
export const FIXTURE_VIDEO_URL_MAX_LENGTH = 1000;

const UPLOAD_PREFIX = '/uploads/';
const UPLOAD_EXTENSIONS = ['mp4', 'webm', 'mov'] as const;

export type FixtureVideoSource = 'upload' | 'external';

export type FixtureVideoUrlRejection =
  | 'EMPTY'
  | 'TOO_LONG'
  | 'MALFORMED'
  | 'SCHEME_NOT_ALLOWED'
  | 'CREDENTIALS_NOT_ALLOWED'
  | 'UPLOAD_PATH_INVALID'
  | 'UPLOAD_EXTENSION_INVALID';

export type FixtureVideoUrlParse =
  | { readonly ok: true; readonly source: FixtureVideoSource; readonly url: string }
  | { readonly ok: false; readonly reason: FixtureVideoUrlRejection };

function reject(reason: FixtureVideoUrlRejection): FixtureVideoUrlParse {
  return { ok: false, reason };
}

function parseUploadPath(value: string): FixtureVideoUrlParse {
  // 백슬래시는 윈도우 경로 구분자로 해석될 수 있어 업로드 루트 밖을 가리킬 여지를 준다.
  if (value.includes('\\')) return reject('UPLOAD_PATH_INVALID');
  let normalized: URL;
  try {
    // 상대 경로 정규화를 위한 더미 origin — 반환값에는 쓰지 않는다.
    normalized = new URL(value, 'https://uploads.invalid');
  } catch {
    return reject('UPLOAD_PATH_INVALID');
  }
  // `/uploads/../admin` 처럼 업로드 루트를 벗어나는 경로는 업로드 파일이 아니다. URL 정규화가
  // `../` 를 접어 주지만 인코딩된 구분자(%2f 등)는 남으므로 프록시 단 디코딩까지 함께 막는다.
  if (!normalized.pathname.startsWith(UPLOAD_PREFIX)) return reject('UPLOAD_PATH_INVALID');
  if (/%2e|%2f|%5c/i.test(normalized.pathname)) return reject('UPLOAD_PATH_INVALID');
  // 저장된 업로드 URL 에는 쿼리·프래그먼트가 없다 — 붙어 있으면 우리가 만든 URL 이 아니다.
  if (normalized.search !== '' || normalized.hash !== '') return reject('UPLOAD_PATH_INVALID');

  const extension = normalized.pathname.split('.').pop()?.toLowerCase() ?? '';
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) {
    return reject('UPLOAD_EXTENSION_INVALID');
  }
  return { ok: true, source: 'upload', url: normalized.pathname };
}

export function parseFixtureVideoUrl(raw: string): FixtureVideoUrlParse {
  const value = raw.trim();
  if (value.length === 0) return reject('EMPTY');
  if (value.length > FIXTURE_VIDEO_URL_MAX_LENGTH) return reject('TOO_LONG');
  if (value.startsWith(UPLOAD_PREFIX)) return parseUploadPath(value);

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return reject('MALFORMED');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return reject('SCHEME_NOT_ALLOWED');
  }
  // `https://user:pass@host/...` 는 링크를 보는 사람에게 다른 호스트처럼 보이게 만들 수 있다.
  if (parsed.username !== '' || parsed.password !== '') return reject('CREDENTIALS_NOT_ALLOWED');
  if (parsed.hostname === '') return reject('MALFORMED');
  return { ok: true, source: 'external', url: parsed.toString() };
}

/** 사용자에게 그대로 보여줄 거부 사유 (해요체). */
export function fixtureVideoUrlRejectionMessage(reason: FixtureVideoUrlRejection): string {
  switch (reason) {
    case 'EMPTY':
      return '영상 주소를 입력해 주세요.';
    case 'TOO_LONG':
      return `영상 주소는 ${FIXTURE_VIDEO_URL_MAX_LENGTH}자를 넘을 수 없어요.`;
    case 'SCHEME_NOT_ALLOWED':
      return '영상 주소는 http 또는 https 링크만 등록할 수 있어요.';
    case 'CREDENTIALS_NOT_ALLOWED':
      return '아이디·비밀번호가 포함된 주소는 등록할 수 없어요.';
    case 'UPLOAD_PATH_INVALID':
      return '업로드 파일 주소가 올바르지 않아요. 다시 업로드해 주세요.';
    case 'UPLOAD_EXTENSION_INVALID':
      return '업로드 영상은 mp4, webm, mov 파일만 등록할 수 있어요.';
    case 'MALFORMED':
      return '영상 주소 형식이 올바르지 않아요. 전체 주소(https://...)를 입력해 주세요.';
  }
}
