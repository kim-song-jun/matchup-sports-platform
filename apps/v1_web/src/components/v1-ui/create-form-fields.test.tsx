import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateField, RecentVenueChips } from './create-form-fields';

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

  it('items에 동일 placeName이 섞여 있어도(백엔드 dedup 전제 밖) 경고 없이 모두 렌더링한다', () => {
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <RecentVenueChips
        items={[
          { placeName: '한강공원', addressText: '주소A' },
          { placeName: '한강공원', addressText: '주소B' },
        ]}
        onSelect={vi.fn()}
      />,
    );

    // React key 충돌(placeName 단독 key였을 때의 회귀) 시 "Encountered two children with
    // the same key" 콘솔 에러가 뜬다 — 안 뜨는지가 이 테스트의 핵심.
    expect(warnSpy).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: '한강공원' })).toHaveLength(2);
    warnSpy.mockRestore();
  });
});

describe('CreateField', () => {
  // RecentVenueChips 등 버튼을 포함한 UI를 children으로 받는데, <label>이 버튼까지
  // 감싸면(라벨 대상 컨트롤 외 labelable 요소 포함) 유효하지 않은 마크업이 된다 —
  // 텍스트 라벨만 htmlFor로 명시 연결되고 children의 버튼은 label 밖에 있어야 한다.
  it('라벨 텍스트는 htmlFor로 입력과 연결되고, children의 버튼은 label 안에 중첩되지 않는다', () => {
    const { container } = render(
      <CreateField id="field-venue" label="장소" value="" onChange={() => {}}>
        <button type="button">최근 사용한 장소 칩</button>
      </CreateField>,
    );

    expect(screen.getByLabelText('장소')).toBe(screen.getByRole('textbox'));

    const button = screen.getByRole('button', { name: '최근 사용한 장소 칩' });
    expect(button.closest('label')).toBeNull();
    expect(container.querySelector('label')?.tagName).toBe('LABEL');
  });
});
