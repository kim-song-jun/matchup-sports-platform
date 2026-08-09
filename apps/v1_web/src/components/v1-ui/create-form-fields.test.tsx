import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CreateField, MultiPresetChipSelector, RecentVenueChips } from './create-form-fields';

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

/** 실제 부모(team-matches-page.tsx ConditionFields)처럼 onChange가 values를 갱신하는
 * controlled 컴포넌트로 감싸야 "이미 3개 선택된 상태에서 4번째를 누른다"는 시나리오를
 * 재현할 수 있다 — values를 고정 prop으로 두면 클릭이 실제로 반영되지 않는다. */
function ControlledMultiPresetChipSelector({ maxItems }: { maxItems: number }) {
  const [values, setValues] = useState<string[]>([]);
  return (
    <MultiPresetChipSelector
      label="경기 스타일"
      options={['친선', '매너 중시', '교환매치', '실력 중심']}
      values={values}
      maxItems={maxItems}
      onChange={setValues}
    />
  );
}

describe('MultiPresetChipSelector 다중선택 상한', () => {
  // 경기 스타일 3개 제한(사용자 확정 결정) — 4번째를 고르려 할 때 조용히 무시하지 않고
  // 왜 안 되는지 알려줘야 한다는 요구사항을 직접 검증한다.
  it('상한(3개)까지는 정상적으로 선택된다', () => {
    render(<ControlledMultiPresetChipSelector maxItems={3} />);

    fireEvent.click(screen.getByRole('button', { name: '친선' }));
    fireEvent.click(screen.getByRole('button', { name: '매너 중시' }));
    fireEvent.click(screen.getByRole('button', { name: '교환매치' }));

    expect(screen.getByRole('button', { name: '친선' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '매너 중시' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '교환매치' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('4번째를 고르려 하면 선택이 반영되지 않고 이유가 안내된다(조용한 무시 금지)', () => {
    render(<ControlledMultiPresetChipSelector maxItems={3} />);

    fireEvent.click(screen.getByRole('button', { name: '친선' }));
    fireEvent.click(screen.getByRole('button', { name: '매너 중시' }));
    fireEvent.click(screen.getByRole('button', { name: '교환매치' }));
    fireEvent.click(screen.getByRole('button', { name: '실력 중심' }));

    // 4번째 클릭이 선택으로 반영되지 않아야 한다 — 조용히 잘리는(silent truncation) 동작 금지.
    expect(screen.getByRole('button', { name: '실력 중심' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '실력 중심' })).toHaveAttribute('aria-disabled', 'true');

    // "왜 안 눌리지?"에 답하는 안내 문구가 role="alert"로 즉시 뜬다.
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('최대 3개');
  });

  it('하나를 선택 해제하면 다시 새 항목을 고를 수 있고, 안내 문구도 사라진다', () => {
    render(<ControlledMultiPresetChipSelector maxItems={3} />);

    fireEvent.click(screen.getByRole('button', { name: '친선' }));
    fireEvent.click(screen.getByRole('button', { name: '매너 중시' }));
    fireEvent.click(screen.getByRole('button', { name: '교환매치' }));
    fireEvent.click(screen.getByRole('button', { name: '실력 중심' })); // 4번째, 막힘
    expect(screen.getByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '친선' })); // 선택 해제 → 2개
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '실력 중심' })); // 이제는 3번째로 성공
    expect(screen.getByRole('button', { name: '실력 중심' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
