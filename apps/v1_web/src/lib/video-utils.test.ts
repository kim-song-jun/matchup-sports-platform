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

  it('classifies rejected preview sources as external', () => {
    expect(videoKind('javascript:alert(1)')).toBe('external');
  });
});
