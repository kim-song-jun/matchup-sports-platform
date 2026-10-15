import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LocalDiscoveryGuidance } from './index';

describe('LocalDiscoveryGuidance', () => {
  it('renders crawlable team guidance and links to existing relevant routes', () => {
    const html = renderToStaticMarkup(<LocalDiscoveryGuidance kind="teams" />);

    expect(html).toContain('동네에서 함께할 풋살·축구 팀을 찾고 있나요?');
    expect(html).toContain('활동 지역과 종목, 모집 상태');
    expect(html).toContain('href="/tournaments?kind=tournament"');
    expect(html).toContain('스포츠 대회 보기');
    expect(html).toContain('href="/team-matches"');
  });

  it('renders both tournament and league context for the unfiltered list', () => {
    const html = renderToStaticMarkup(<LocalDiscoveryGuidance kind="all" />);

    expect(html).toContain('동네 풋살 대회와 축구 대회');
    expect(html).toContain('정규 리그');
    expect(html).toContain('href="/teams"');
    expect(html).toContain('스포츠 팀 찾기');
  });

  it.each([
    ['tournament', '동네 풋살 대회'],
    ['league', '풋살 리그'],
  ] as const)('renders %s guidance with existing discovery links', (kind, phrase) => {
    const html = renderToStaticMarkup(<LocalDiscoveryGuidance kind={kind} />);

    expect(html).toContain(phrase);
    expect(html).toContain('등록된 개최 장소');
    expect(html).toContain('href="/teams"');
    expect(html).toContain('href="/team-matches"');
  });
});
