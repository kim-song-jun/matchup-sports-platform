import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { JerseyNumberDialog } from './jersey-number-dialog';

const TAKEN = '이미 같은 등번호를 쓰는 팀원이 있어요.';

// 부모(teams-client)와 같은 계약: 저장이 거절되면 error 를 내려 주고, onEdit 에서 비운다.
function Host() {
  const [error, setError] = useState<string | null>(null);
  return (
    <JerseyNumberDialog
      open
      memberName="홍길동"
      current={null}
      saving={false}
      error={error}
      onClose={() => undefined}
      onEdit={() => setError(null)}
      onSave={() => setError(TAKEN)}
    />
  );
}

describe('JerseyNumberDialog', () => {
  it('중복 거절 문구는 번호를 고치면 사라지고, 다시 거절되면 다시 보인다', () => {
    render(<Host />);

    fireEvent.change(screen.getByLabelText('등번호 (비우면 해제)'), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(TAKEN);

    fireEvent.change(screen.getByLabelText('등번호 (비우면 해제)'), { target: { value: '8' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert')).toHaveTextContent(TAKEN);
  });

  it('저장 중에는 입력이 잠겨 번호를 고칠 수 없다 — 응답이 다른 번호의 거절로 오해되지 않게', async () => {
    const onEdit = vi.fn();
    render(
      <JerseyNumberDialog open memberName="홍길동" current={7} saving error={null} onClose={() => undefined} onEdit={onEdit} onSave={() => undefined} />,
    );
    const input = screen.getByLabelText('등번호 (비우면 해제)');
    await userEvent.type(input, '9');
    expect(input).toHaveValue(7);
    expect(onEdit).not.toHaveBeenCalled();
  });
});
