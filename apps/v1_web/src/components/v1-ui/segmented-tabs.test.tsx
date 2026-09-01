import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedTabs, type SegmentedTabsItem } from './segmented-tabs';

function itemsOf(count: number): SegmentedTabsItem[] {
  return Array.from({ length: count }, (_, i) => ({ id: `tab-${i}`, label: `탭 ${i}` }));
}

describe('SegmentedTabs — thumb 위치·폭은 항목 수·선택 인덱스에서 계산된다(하드코딩 금지)', () => {
  it('활성 인덱스가 바뀌면 thumb 의 translateX 가 "간격을 포함한" 공식으로 바뀐다', () => {
    // 트랙 gap(8px)이 있는데 하단탭 pill 식(translateX(index*100%))을 그대로 베끼면
    // 인덱스가 늘수록 gap 만큼씩 실제 위치보다 왼쪽으로 처진다 — 그 회귀를 잡는다.
    const items = itemsOf(3);
    const { container, rerender } = render(<SegmentedTabs items={items} activeId="tab-0" ariaLabel="테스트" />);
    const thumb = () => container.querySelector<HTMLElement>('.tm-segmented-thumb');

    expect(thumb()?.style.transform).toBe('translateX(calc(0 * (100% + 8px)))');

    rerender(<SegmentedTabs items={items} activeId="tab-2" ariaLabel="테스트" />);
    expect(thumb()?.style.transform).toBe('translateX(calc(2 * (100% + 8px)))');
  });

  it('항목 수가 2·3·5로 달라져도 --tm-segmented-count 가 실제 개수를 그대로 따라간다', () => {
    // globals.css 의 폭 계산(calc((100% - 8px*N)/N))과 grid-template-columns 는 이
    // 변수 하나에 의존한다 — 컴포넌트가 N을 어딘가에 하드코딩(예: 항상 5)하면 이
    // 값이 실제 items.length 와 어긋나 항목이 5개보다 적거나 많을 때 레이아웃이 깨진다.
    for (const count of [2, 3, 5]) {
      const items = itemsOf(count);
      const { container, unmount } = render(<SegmentedTabs items={items} activeId={items[0].id} ariaLabel="테스트" />);

      const track = container.querySelector<HTMLElement>('.tm-segmented-tabs');
      expect(track?.style.getPropertyValue('--tm-segmented-count')).toBe(String(count));
      expect(container.querySelectorAll('.tm-segmented-tab')).toHaveLength(count);

      unmount();
    }
  });

  it('activeId 가 어느 항목과도 안 맞으면 thumb 을 숨긴다(거짓 활성 신호 방지)', () => {
    // shell.tsx BottomNav 의 pill 과 같은 이유 — 임의 항목 위에 thumb 을 걸쳐 두면
    // "그 항목이 선택됐다"는 거짓 신호가 된다.
    const items = itemsOf(3);
    const { container } = render(<SegmentedTabs items={items} activeId="no-such-id" ariaLabel="테스트" />);

    expect(container.querySelector<HTMLElement>('.tm-segmented-thumb')?.style.opacity).toBe('0');
  });
});

describe('SegmentedTabs — 선택 상태는 색만이 아니라 요소 속성으로도 드러난다', () => {
  it('role="tablist" 에서 활성 항목만 aria-selected="true" + data-active="true" 를 갖는다', () => {
    const items = itemsOf(3);
    render(<SegmentedTabs items={items} activeId="tab-1" ariaLabel="보기 방식" role="tablist" />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs.map((tab) => tab.getAttribute('data-active'))).toEqual(['false', 'true', 'false']);
  });

  it('role="radiogroup" 에서는 aria-checked 로 선택 상태를 드러낸다(다른 역할 문법)', () => {
    const items: SegmentedTabsItem[] = [
      { id: 'male', label: '남' },
      { id: 'female', label: '여' },
    ];
    render(<SegmentedTabs items={items} activeId="female" ariaLabel="성별" role="radiogroup" />);

    const radios = screen.getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('aria-checked'))).toEqual(['false', 'true']);
  });

  it('thumb 은 장식 요소이므로 스크린리더에서 숨긴다', () => {
    const items = itemsOf(2);
    const { container } = render(<SegmentedTabs items={items} activeId="tab-0" ariaLabel="테스트" />);

    expect(container.querySelector('.tm-segmented-thumb')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('SegmentedTabs — 클릭·라우팅 동작', () => {
  it('버튼 항목을 클릭하면 onSelect 가 그 항목의 id 로 호출된다(죽은 핸들러 방지)', () => {
    const items = itemsOf(3);
    const onSelect = vi.fn();
    render(<SegmentedTabs items={items} activeId="tab-0" onSelect={onSelect} ariaLabel="테스트" role="tablist" />);

    fireEvent.click(screen.getAllByRole('tab')[2]);

    expect(onSelect).toHaveBeenCalledWith('tab-2');
  });

  it('href 가 있는 항목은 버튼이 아니라 라우팅 링크로 렌더된다(reviews-page 류 소비처 지원)', () => {
    const items: SegmentedTabsItem[] = [
      { id: 'all', label: '전체', href: '/tournaments' },
      { id: 'league', label: '정규 리그', href: '/tournaments?kind=league' },
    ];
    render(<SegmentedTabs items={items} activeId="league" ariaLabel="대회 유형" />);

    const link = screen.getByRole('link', { name: '정규 리그' });
    expect(link).toHaveAttribute('href', '/tournaments?kind=league');
    expect(link).toHaveAttribute('aria-current', 'page');
    // role 을 안 주면(competition-kind-segment/match-type-segment 부류) <nav aria-label>
    // 로 렌더한다 — <div aria-label> 은 role 없이는 접근성 트리에 이름이 노출되지
    // 않는다(그 회귀를 여기서 잡는다).
    expect(screen.getByRole('navigation', { name: '대회 유형' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
