import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
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
});
