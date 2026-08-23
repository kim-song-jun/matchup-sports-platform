import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EntityPicker, type EntityPickerItem } from './entity-picker';

const ITEMS: EntityPickerItem[] = [
  { id: 't1', label: '알파팀' },
  { id: 't2', label: '브라보팀' },
];

// alpha 실측 결함: commitEntry가 닫은 뒤엔 입력창이 blur 없이 포커스를 유지한다
// (메뉴 div의 onMouseDown preventDefault 때문). 목록을 여는 경로가 onFocus 하나뿐이면
// 이미 포커스된 입력을 재클릭/재입력해도 focus 이벤트가 새로 안 떠서 메뉴가 영원히 안 열렸다.
// 이 테스트는 그 회귀를 실제로 잡는다: onChange로 재오픈된다.
describe('EntityPicker — 선택 후 재검색', () => {
  it('옵션을 하나 고른 뒤 다시 타이핑하면 목록이 다시 열린다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <EntityPicker id="seed-picker-1" value={null} onChange={onChange} items={ITEMS} />
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: '알파팀' }));

    // 고른 직후: onChange가 선택 항목으로 호출됐고, 목록은 닫혀 있어야 한다
    // (과잉 개방 회귀 방지 — commitEntry의 프로그램적 setInputValue('')가 onChange DOM
    // 이벤트를 거치지 않아 여기서 재오픈되지 않는다).
    expect(onChange).toHaveBeenCalledWith(ITEMS[0]);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // 재검색 의도(타이핑) → 목록이 다시 보여야 한다. 이게 이번 버그의 핵심 단언이다.
    await user.type(input, '브라보');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByRole('option', { name: '브라보팀' })).toBeInTheDocument();
  });

  it('옵션을 고른 뒤 입력창을 다시 클릭해도 목록이 열린다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <EntityPicker id="seed-picker-2" value={null} onChange={onChange} items={ITEMS} />
    );

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.click(await screen.findByRole('option', { name: '알파팀' }));
    expect(input).toHaveAttribute('aria-expanded', 'false');

    // 이미 포커스된 입력을 재클릭 — onFocus는 새로 안 뜨지만 onClick 경로로 열려야 한다.
    await user.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
  });
});
