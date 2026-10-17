import { describe, expect, it } from 'vitest';
import { metadata } from './page';

describe('teams list metadata', () => {
  it('names real example sports and the region-based team discovery service', () => {
    expect(metadata.title).toBe('지역별 풋살·축구 등 스포츠 팀 찾기');
    expect(metadata.description).toContain('풋살·축구');
    expect(metadata.description).toContain('러닝·수영');
    expect(metadata.alternates?.canonical).toBe('/teams');
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });
});
