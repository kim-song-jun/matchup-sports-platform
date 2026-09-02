import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './primitives';

describe('Card — aria-busy 는 실제로 DOM 에 닿아야 한다', () => {
  it('aria-busy 를 넘기면 렌더된 요소에 그대로 붙는다', () => {
    // JSX 는 하이픈이 든 속성명을 초과 프로퍼티 검사에서 면제한다. 그래서 Card 가
    // 이 prop 을 받지 않던 시절에도 `<Card aria-busy="true">` 가 tsc 를 통과했고,
    // 값은 조용히 버려졌다 — 홈 채팅 로딩 카드·대회 히어로 스켈레톤 두 곳이 그렇게
    // 로딩을 전혀 알리지 못하고 있었다. 타입이 못 잡는 자리라 테스트로 못박는다.
    const { container } = render(<Card aria-busy="true">내용</Card>);

    expect(container.querySelector('.tm-card')?.getAttribute('aria-busy')).toBe('true');
  });

  it('넘기지 않으면 속성 자체가 붙지 않는다', () => {
    // 항상 aria-busy="false" 를 달면 보조기기가 "로딩 아님"을 매번 읽어 소음이 된다.
    const { container } = render(<Card>내용</Card>);

    expect(container.querySelector('.tm-card')?.hasAttribute('aria-busy')).toBe(false);
  });
});
