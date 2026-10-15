import { describe, expect, it } from 'vitest';
import { buildTournamentListMetadata } from './tournament-list-metadata';

describe('기존 대회 유형별 검색 대표 주소', () => {
  it.each([
    ['all', '/tournaments', '대회·리그'],
    ['tournament', '/tournaments?kind=tournament', '대회'],
    ['league', '/tournaments?kind=league', '리그'],
  ] as const)('%s는 실제 유형과 종목을 설명하고 자기 주소를 대표로 쓴다', (kind, canonical, noun) => {
    const meta = buildTournamentListMetadata(kind);
    expect(meta.alternates).toMatchObject({ canonical });
    expect(meta.title).toContain(noun);
    expect(meta.description).toContain('풋살');
    expect(meta.description).toContain('축구');
    expect(meta.description).toContain('스포츠');
    expect(meta.robots).toMatchObject({ index: true, follow: true });
    expect(meta.openGraph).toMatchObject({ url: canonical, title: `${meta.title} | Teameet` });
  });
});
