import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { LineupJerseySheet } from './lineup-jersey-sheet';

const target = { displayName: '홍길동', jerseyNumber: 7, teamJerseyNumber: 7, canChangeTeamNumber: true };

function renderSheet(pending: boolean, onEdit = vi.fn()) {
  render(
    <LineupJerseySheet
      open
      onClose={() => undefined}
      target={target}
      holderOf={() => null}
      pending={pending}
      error={null}
      onSave={() => undefined}
      onEdit={onEdit}
    />,
  );
  return onEdit;
}

describe('LineupJerseySheet', () => {
  it('저장 중에는 번호와 저장 범위를 고칠 수 없다 — 응답이 다른 입력의 거절로 오해되지 않게', async () => {
    const onEdit = renderSheet(true);
    const input = screen.getByLabelText('등번호');
    await userEvent.type(input, '9');
    await userEvent.click(screen.getByLabelText('팀 번호도 함께 바꿔요'));
    expect(input).toHaveValue('7');
    expect(screen.getByLabelText('이 경기만 바꿔요')).toBeChecked();
    expect(onEdit).not.toHaveBeenCalled();
  });

  it('저장 중이 아니면 번호를 고칠 때 onEdit 이 불린다', async () => {
    const onEdit = renderSheet(false);
    await userEvent.type(screen.getByLabelText('등번호'), '{Backspace}9');
    expect(onEdit).toHaveBeenCalled();
    expect(screen.getByLabelText('등번호')).toHaveValue('9');
  });
});
