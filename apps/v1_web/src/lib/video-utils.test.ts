import { describe, expect, it } from 'vitest';
import { safeVideoFileUrl, videoKind } from './video-utils';

describe('safeVideoFileUrl', () => {
  it('allows local uploads and HTTP(S) video files', () => {
    expect(safeVideoFileUrl('/uploads/tournaments/highlight.mp4')).toBe('/uploads/tournaments/highlight.mp4');
    expect(safeVideoFileUrl('https://cdn.example.com/highlight.webm?token=ok')).toBe(
      'https://cdn.example.com/highlight.webm?token=ok',
    );
  });

  it('rejects active schemes, protocol-relative paths, and backslash paths', () => {
    expect(safeVideoFileUrl('javascript:alert(1)')).toBeNull();
    expect(safeVideoFileUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeVideoFileUrl('//evil.example/highlight.mp4')).toBeNull();
    expect(safeVideoFileUrl('/uploads\\..\\secret.mp4')).toBeNull();
  });

  it('rejects traversal paths that escape the uploads prefix', () => {
    // 브라우저가 `/uploads/../admin` 을 `/admin` 으로 정규화하므로 업로드 파일이 아니다.
    expect(safeVideoFileUrl('/uploads/../admin')).toBeNull();
    expect(safeVideoFileUrl('/uploads/a/../../secret.mp4')).toBeNull();
    // 퍼센트 인코딩된 dot/slash 도 동일하게 막는다.
    expect(safeVideoFileUrl('/uploads/%2e%2e/admin')).toBeNull();
    expect(safeVideoFileUrl('/uploads/..%2fadmin')).toBeNull();
    // 정상 업로드 경로는 그대로 통과한다(쿼리 포함).
    expect(safeVideoFileUrl('/uploads/tournaments/a.mp4?token=1')).toBe('/uploads/tournaments/a.mp4?token=1');
  });

  it('classifies rejected preview sources as external', () => {
    expect(videoKind('javascript:alert(1)')).toBe('external');
    expect(videoKind('/uploads/../admin')).toBe('external');
  });
});
