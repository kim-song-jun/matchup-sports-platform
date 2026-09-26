import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreferredPositionPicker } from './preferred-position-picker';

/**
 * [D14] **누르는 순서가 곧 주/부**라는 것이 이 화면의 계약이다. 드롭다운 두 개 대신
 * 코트를 쓴 이유가 그것이라, 순서 규칙이 깨지면 이 방식을 고른 근거 자체가 사라진다.
 *
 * 특히 **주를 해제하면 부가 주로 올라온다**를 못박는다. "주 없이 부만"은 서버가 거부하는
 * 상태라(`SECONDARY_WITHOUT_PRIMARY`) 화면에서 만들면 저장 시점에 막힌다 — 사용자는
 * 자기가 뭘 잘못했는지 알 수 없다.
 */
const FUTSAL = [
  { code: 'GOLEIRO', label: '골키퍼', goalkeeper: true },
  { code: 'FIXO', label: '픽소' },
  { code: 'ALA', label: '알라' },
  { code: 'PIVO', label: '피보' },
];

function setup(primary: string | null, secondary: string | null) {
  const onChange = vi.fn();
  render(
    <PreferredPositionPicker
      sportName="풋살"
      options={FUTSAL}
      primary={primary}
      secondary={secondary}
      onChange={onChange}
    />,
  );
  return onChange;
}

const press = (label: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));

describe('[D14] PreferredPositionPicker — 누르는 순서가 주/부다', () => {
  it('아무것도 없을 때 누르면 주가 된다', () => {
    const onChange = setup(null, null);
    press('알라');
    expect(onChange).toHaveBeenCalledWith({ primary: 'ALA', secondary: null });
  });

  it('주가 있을 때 다른 곳을 누르면 부가 된다', () => {
    const onChange = setup('ALA', null);
    press('피보');
    expect(onChange).toHaveBeenCalledWith({ primary: 'ALA', secondary: 'PIVO' });
  });

  it('주를 다시 누르면 해제되고 **부가 주로 올라온다**', () => {
    // "주 없이 부만" 은 서버가 거부하는 상태다. 화면에서 그 상태를 만들면 사용자가
    // 저장 시점에 이유 모를 오류를 만난다.
    const onChange = setup('ALA', 'PIVO');
    press('알라');
    expect(onChange).toHaveBeenCalledWith({ primary: 'PIVO', secondary: null });
  });

  it('부를 다시 누르면 부만 해제된다', () => {
    const onChange = setup('ALA', 'PIVO');
    press('피보');
    expect(onChange).toHaveBeenCalledWith({ primary: 'ALA', secondary: null });
  });

  it('색만으로 주/부를 구분하지 않는다 — 글자가 함께 있다', () => {
    setup('ALA', 'PIVO');
    // 색맹 대응. 이 저장소 규칙: 의미 있는 구분은 컬러 + 텍스트를 병행한다.
    expect(screen.getByRole('button', { name: /알라.*주/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /피보.*부/ })).toBeInTheDocument();
  });

  it('자리 목록이 비면 아무것도 그리지 않는다 (러닝·수영)', () => {
    const { container } = render(
      <PreferredPositionPicker sportName="러닝" options={[]} primary={null} secondary={null} onChange={vi.fn()} />,
    );
    // 빈 코트를 보여주는 것이 아니라 아예 렌더하지 않는다 -- 빈 코트는 "고를 게 없다"가
    // 아니라 "고장났다"로 보인다.
    expect(container).toBeEmptyDOMElement();
  });

  it('골키퍼가 맨 아래 띠에 온다 — 순서는 프리셋에서 파생된다', () => {
    setup(null, null);
    const labels = screen.getAllByRole('button').map((button) => button.textContent ?? '');
    expect(labels[labels.length - 1]).toContain('골키퍼');
  });
});
