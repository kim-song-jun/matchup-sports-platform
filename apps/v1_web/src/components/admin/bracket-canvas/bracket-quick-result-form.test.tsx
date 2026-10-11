import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BracketQuickResultForm } from './bracket-quick-result-form';

function renderForm(overrides: Partial<React.ComponentProps<typeof BracketQuickResultForm>> = {}) {
  const props = {
    homeLabel: '서울FC',
    awayLabel: '부산FC',
    isKnockout: true,
    submitLabel: '점수 확정',
    pending: false,
    onSubmit: vi.fn(),
    ...overrides,
  };
  render(<BracketQuickResultForm {...props} />);
  return props;
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: /점수 확정|정정 제출/ }));

describe('BracketQuickResultForm — 승부차기 입력란 표시 조건', () => {
  it('결선에서 두 점수가 같을 때만 승부차기 입력란이 나타난다', () => {
    renderForm();
    expect(screen.queryByLabelText('서울FC 승부차기')).not.toBeInTheDocument();
    type('서울FC 점수', '1');
    type('부산FC 점수', '1');
    expect(screen.getByLabelText('서울FC 승부차기')).toBeInTheDocument();
    expect(screen.getByLabelText('부산FC 승부차기')).toBeInTheDocument();
    type('부산FC 점수', '0');
    expect(screen.queryByLabelText('서울FC 승부차기')).not.toBeInTheDocument();
  });

  it('조별(결선 아님) 무승부에는 입력란을 주지 않고 점수만 그대로 보낸다', () => {
    const props = renderForm({ isKnockout: false });
    type('서울FC 점수', '1');
    type('부산FC 점수', '1');
    expect(screen.queryByLabelText('서울FC 승부차기')).not.toBeInTheDocument();
    submit();
    expect(props.onSubmit).toHaveBeenCalledWith({ home: 1, away: 1 });
  });
});

describe('BracketQuickResultForm — 제출', () => {
  it('이긴 경기는 점수만 보낸다', () => {
    const props = renderForm();
    type('서울FC 점수', '3');
    type('부산FC 점수', '1');
    submit();
    expect(props.onSubmit).toHaveBeenCalledWith({ home: 3, away: 1 });
  });

  it('결선 무승부는 승부차기까지 보낸다', () => {
    const props = renderForm();
    type('서울FC 점수', '2');
    type('부산FC 점수', '2');
    type('서울FC 승부차기', '5');
    type('부산FC 승부차기', '4');
    submit();
    expect(props.onSubmit).toHaveBeenCalledWith({ home: 2, away: 2, penalties: { home: 5, away: 4 } });
  });

  it('결선 무승부인데 승부차기를 비우면 요청 없이 안내하고 입력을 유지한다', () => {
    const props = renderForm();
    type('서울FC 점수', '0');
    type('부산FC 점수', '0');
    submit();
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('결선 경기가 무승부면 승부차기 점수를 입력해 주세요.');
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('0');
  });

  it('점수를 비우면 어느 쪽이 비었는지 안내한다', () => {
    const props = renderForm();
    type('서울FC 점수', '2');
    submit();
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('어웨이 점수를 0 이상의 정수로 입력해 주세요.');
  });

  it('정정 모드는 현재 점수를 채워 두고 제출 버튼 이름을 바꾼다', () => {
    const props = renderForm({ initial: { home: 2, away: 2, penalties: { home: 4, away: 3 } }, submitLabel: '정정 제출' });
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('2');
    expect(screen.getByLabelText('서울FC 승부차기')).toHaveValue('4');
    type('부산FC 승부차기', '5');
    submit();
    expect(props.onSubmit).toHaveBeenCalledWith({ home: 2, away: 2, penalties: { home: 4, away: 5 } });
  });
});

describe('BracketQuickResultForm — 상태', () => {
  it('요청 중에는 제출 버튼이 잠긴다', () => {
    renderForm({ pending: true });
    expect(screen.getByRole('button', { name: /점수 확정/ })).toBeDisabled();
  });

  it('서버가 거절한 이유를 입력을 지우지 않고 그대로 보여 준다', () => {
    renderForm({ errorMessage: '명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.', initial: { home: 1, away: 0 } });
    expect(screen.getByRole('alert')).toHaveTextContent('명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.');
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('1');
  });

  it('취소 버튼은 onCancel 이 있을 때만 보인다', () => {
    const onCancel = vi.fn();
    renderForm({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('BracketQuickResultForm — 점수 입력칸', () => {
  it('숫자가 아닌 글자와 음수 부호는 입력되지 않고, 점수는 세 자리까지만 받는다', () => {
    renderForm();
    type('서울FC 점수', 'a');
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('');
    type('서울FC 점수', '-1');
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('1');
    type('부산FC 점수', '1234');
    expect(screen.getByLabelText('부산FC 점수')).toHaveValue('123');
  });

  it('승부차기 입력칸에도 같은 제한이 걸린다', () => {
    renderForm();
    type('서울FC 점수', '1');
    type('부산FC 점수', '1');
    type('서울FC 승부차기', '4x');
    expect(screen.getByLabelText('서울FC 승부차기')).toHaveValue('4');
  });
});

describe('BracketQuickResultForm — 확정 전 확인 창', () => {
  const confirmDialog = () => within(screen.getByRole('dialog'));

  it('확인 창을 켜면 누른 직후엔 보내지 않고, 창의 확정 버튼을 눌러야 보낸다', () => {
    const props = renderForm({ confirmBeforeSubmit: true });
    type('서울FC 점수', '3');
    type('부산FC 점수', '1');
    submit();
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent('서울FC 3:1 부산FC');
    fireEvent.click(confirmDialog().getByRole('button', { name: '점수 확정' }));
    expect(props.onSubmit).toHaveBeenCalledWith({ home: 3, away: 1 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('확인 창에서 취소하면 보내지 않고 입력을 그대로 둔다', () => {
    const props = renderForm({ confirmBeforeSubmit: true });
    type('서울FC 점수', '3');
    type('부산FC 점수', '1');
    submit();
    fireEvent.click(confirmDialog().getByRole('button', { name: '취소' }));
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('서울FC 점수')).toHaveValue('3');
  });

  it('검증에 걸리는 점수는 확인 창도 열지 않는다', () => {
    const props = renderForm({ confirmBeforeSubmit: true });
    type('서울FC 점수', '3');
    submit();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('결선 무승부는 승부차기까지 확인 창에 보여 준다', () => {
    renderForm({ confirmBeforeSubmit: true });
    type('서울FC 점수', '2');
    type('부산FC 점수', '2');
    type('서울FC 승부차기', '5');
    type('부산FC 승부차기', '4');
    submit();
    expect(screen.getByRole('dialog')).toHaveTextContent('2:2');
    expect(screen.getByRole('dialog')).toHaveTextContent('5');
  });

  it('확인 창을 켜지 않은 폼(정정 입력 등)은 곧바로 보낸다', () => {
    const props = renderForm();
    type('서울FC 점수', '3');
    type('부산FC 점수', '1');
    submit();
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
