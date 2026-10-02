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

describe('SegmentedTabs — 컨테이너는 "항목이 무엇인지"로 정해진다(role 유무가 아니라)', () => {
  it('role 없이 버튼 항목만 오면 <nav> 가 아니라 role="group" 으로 렌더된다', () => {
    // <nav> 는 "누르면 이동한다"는 예고다. 항목이 href 없는 버튼이면 이동하지 않으므로
    // 거짓 예고가 된다. 그렇다고 role 없는 <div aria-label> 로 두면 접근성 트리에
    // 이름이 아예 안 뜬다 — 그래서 이름을 받을 수 있는 role="group" 을 준다.
    render(<SegmentedTabs items={itemsOf(2)} activeId="tab-0" ariaLabel="보기 방식" />);

    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('group', { name: '보기 방식' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('항목이 하나도 없으면 아무것도 그리지 않는다', () => {
    // --tm-segmented-count: 0 을 넘기면 repeat(0, 1fr) 과 calc(100% / 0) 이 둘 다
    // 무효 선언이라 조용히 버려진다 — 콘솔 에러 없이 트랙만 무너져 원인 추적이 어렵다.
    const { container } = render(<SegmentedTabs items={[]} activeId="none" ariaLabel="빈 탭" />);

    expect(container.querySelector('.tm-segmented-tabs')).toBeNull();
    expect(container.querySelector('.tm-segmented-thumb')).toBeNull();
  });
});

describe('SegmentedTabs — 새 탭으로 여는 클릭은 현재 화면을 바꾸지 않는다', () => {
  const linkItems: SegmentedTabsItem[] = [
    { id: 'pending', label: '작성할 리뷰', href: '/my/reviews?tab=pending' },
    { id: 'written', label: '작성된 리뷰', href: '/my/reviews?tab=written' },
  ];

  it.each([
    ['⌘(meta)', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
    ['Shift', { shiftKey: true }],
    ['Alt', { altKey: true }],
  ])('%s 클릭은 onSelect 를 부르지 않는다(새 탭에서 열 뿐 현재 화면은 그대로여야 한다)', (_name, modifier) => {
    const onSelect = vi.fn();
    render(<SegmentedTabs items={linkItems} activeId="pending" onSelect={onSelect} ariaLabel="리뷰 탭" />);

    fireEvent.click(screen.getByRole('link', { name: '작성된 리뷰' }), modifier);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('수식키 없는 좌클릭은 그대로 onSelect 를 부른다(가드가 정상 경로까지 막지 않는다)', () => {
    const onSelect = vi.fn();
    render(<SegmentedTabs items={linkItems} activeId="pending" onSelect={onSelect} ariaLabel="리뷰 탭" />);

    fireEvent.click(screen.getByRole('link', { name: '작성된 리뷰' }));

    expect(onSelect).toHaveBeenCalledWith('written');
  });
});
