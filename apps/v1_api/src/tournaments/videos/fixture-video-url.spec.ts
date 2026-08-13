import { parseFixtureVideoUrl } from './fixture-video-url';

describe('parseFixtureVideoUrl', () => {
  it('accepts http/https links as external videos and keeps the normalized url', () => {
    expect(parseFixtureVideoUrl('https://www.youtube.com/watch?v=abcdefghijk')).toEqual({
      ok: true,
      source: 'external',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
    });
    expect(parseFixtureVideoUrl('  http://example.com/game.mp4  ')).toEqual({
      ok: true,
      source: 'external',
      url: 'http://example.com/game.mp4',
    });
  });

  it('rejects script-bearing schemes that would execute in the player UI', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      'data:video/mp4;base64,AAAA',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      expect(parseFixtureVideoUrl(url)).toEqual({ ok: false, reason: 'SCHEME_NOT_ALLOWED' });
    }
  });

  it('rejects protocol-relative and non-absolute inputs', () => {
    expect(parseFixtureVideoUrl('//evil.example.com/game.mp4')).toEqual({
      ok: false,
      reason: 'MALFORMED',
    });
    expect(parseFixtureVideoUrl('example.com/game.mp4')).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(parseFixtureVideoUrl('/videos/game.mp4')).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(parseFixtureVideoUrl('   ')).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('rejects urls carrying credentials', () => {
    expect(parseFixtureVideoUrl('https://user:pass@evil.example.com/x.mp4')).toEqual({
      ok: false,
      reason: 'CREDENTIALS_NOT_ALLOWED',
    });
  });

  it('accepts our own upload paths and reports them as uploads', () => {
    expect(parseFixtureVideoUrl('/uploads/2026/08/6f1c0f8e.mp4')).toEqual({
      ok: true,
      source: 'upload',
      url: '/uploads/2026/08/6f1c0f8e.mp4',
    });
    expect(parseFixtureVideoUrl('/uploads/2026/08/clip.webm').ok).toBe(true);
    expect(parseFixtureVideoUrl('/uploads/2026/08/clip.mov').ok).toBe(true);
  });

  it('rejects upload paths that escape the upload root or hide the escape in an encoding', () => {
    for (const url of [
      '/uploads/../admin/secret.mp4',
      '/uploads/%2e%2e/secret.mp4',
      '/uploads/2026%2f08%2f..%2fsecret.mp4',
      '/uploads/x/../../etc/passwd.mp4',
      '/uploads/2026/08/clip.mp4?token=1',
    ]) {
      expect(parseFixtureVideoUrl(url)).toEqual({ ok: false, reason: 'UPLOAD_PATH_INVALID' });
    }
    // `/uploads\...` 는 업로드 접두사(`/uploads/`)에 애초에 걸리지 않아 절대 URL 로 취급되고,
    // 절대 URL 로도 파싱되지 않으므로 MALFORMED 로 떨어진다 — 거부라는 결과는 같다.
    expect(parseFixtureVideoUrl('/uploads\\escape.mp4')).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('rejects upload paths that are not one of the stored video extensions', () => {
    expect(parseFixtureVideoUrl('/uploads/2026/08/poster.png')).toEqual({
      ok: false,
      reason: 'UPLOAD_EXTENSION_INVALID',
    });
    expect(parseFixtureVideoUrl('/uploads/2026/08/script.html')).toEqual({
      ok: false,
      reason: 'UPLOAD_EXTENSION_INVALID',
    });
  });

  it('rejects absurdly long urls before they reach storage', () => {
    expect(parseFixtureVideoUrl(`https://example.com/${'a'.repeat(1200)}.mp4`)).toEqual({
      ok: false,
      reason: 'TOO_LONG',
    });
  });
});
