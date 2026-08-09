import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RecentVenueChips } from './create-form-fields';

describe('RecentVenueChips', () => {
  // 위저드(개인/팀매치 생성)와 관리자 리그 대진 일괄생성 폼이 이 컴포넌트를 공유한다 —
  // 선택 상태가 aria-pressed(스크린리더)와 tm-chip-active 클래스(시각) 양쪽으로
  // 드러나는지가 두 화면 모두에 영향을 준다.
  it('items가 비어 있으면 아무것도 렌더링하지 않는다', () => {
    const { container } = render(<RecentVenueChips items={[]} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('selectedValue와 일치하는 칩만 선택 상태(aria-pressed=true + tm-chip-active)로 표시한다', () => {
    render(
      <RecentVenueChips
        items={[
          { placeName: '상암 풋살파크', addressText: '서울 마포구' },
          { placeName: '잠실 종합운동장', addressText: null },
        ]}
        selectedValue="잠실 종합운동장"
        onSelect={vi.fn()}
      />,
    );

    const unselected = screen.getByRole('button', { name: '상암 풋살파크' });
    const selected = screen.getByRole('button', { name: '잠실 종합운동장' });

    expect(unselected).toHaveAttribute('aria-pressed', 'false');
    expect(unselected.className).not.toContain('tm-chip-active');

    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(selected.className).toContain('tm-chip-active');
  });

  it('칩을 클릭하면 해당 항목 전체(placeName+addressText)로 onSelect를 호출한다', () => {
    const onSelect = vi.fn();
    render(
      <RecentVenueChips
        items={[{ placeName: '상암 풋살파크', addressText: '서울 마포구' }]}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '상암 풋살파크' }));

    expect(onSelect).toHaveBeenCalledWith({ placeName: '상암 풋살파크', addressText: '서울 마포구' });
  });
});
